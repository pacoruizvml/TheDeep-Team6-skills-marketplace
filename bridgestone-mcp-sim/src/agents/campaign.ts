/**
 * AGENT 2 — Campaign Agent (MCP server)
 * Allowed: read brief inputs, read brand voice, read approved claims, submit drafts/revisions,
 * read compliance feedback.
 * NOT allowed: evaluate compliance, approve, create Workfront records, stage journeys.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { customers, dataset } from "../lib/data.js";
import { APPROVED_OFFERS, CLAIMS_LIBRARY, GOVERNANCE_RULESET, RULESET_LABEL } from "../lib/rules.js";
import { audit, mutate, nextId, readState, now, type CampaignRecord } from "../lib/store.js";
import { ok, fail } from "../lib/mcp.js";

export function buildCampaignServer(): McpServer {
  const server = new McpServer({ name: "bridgestone-campaign-agent", version: "0.1.0" });

  server.registerTool("get_campaign_brief_inputs", {
    title: "Get campaign brief inputs",
    description: "Returns everything needed to write the brief: audience summary (no personal data), strategy, product, approved offers, dealer request text and target language.",
    inputSchema: { audienceId: z.string(), notificationId: z.string().optional().describe("Dealer notification whose reply contains the dealer request") },
  }, async ({ audienceId, notificationId }) => {
    const st = readState();
    const a = st.audiences[audienceId];
    if (!a) return fail(`Unknown audienceId ${audienceId}`);
    const n = notificationId ? st.notifications[notificationId] : Object.values(st.notifications).filter((x) => x.audienceId === audienceId).pop();
    const langs: Record<string, number> = {};
    for (const id of a.memberIds) { const l = customers().get(id)!.profile.preferredLanguage; langs[l] = (langs[l] ?? 0) + 1; }
    const product = dataset().products.find((p) => p.productId === a.productId);
    mutate((s) => audit(s, { agent: "campaign", tool: "get_campaign_brief_inputs", eventType: "BRIEF_INPUTS_READ", summary: `Brief inputs read for ${audienceId}`, refs: { audienceId, notificationId: n?.notificationId } }));
    return ok({
      audienceId, market: a.market, postalPrefixes: a.postalPrefixes, strategy: a.strategy, audienceSize: a.finalCount,
      objective: a.strategy === "replacement" ? "Purchase or request a quote for winter tyres" : "Book a tyre-change appointment",
      product, languageMix: langs, targetLanguage: Object.entries(langs).sort((x, y) => y[1] - x[1])[0]?.[0] ?? "de-DE",
      approvedOffers: APPROVED_OFFERS.filter((o) => o.market === a.market),
      dealerRequest: n?.reply ? { dealerId: n.dealerId, text: n.reply.text, source: n.reply.source } : null,
      reminder: "You create, suggest and revise. You cannot approve. Compliance decides pass/fail.",
    });
  });

  server.registerTool("get_brand_voice", {
    title: "Get brand voice guidelines",
    description: "Synthetic Bridgestone tone and writing-style guidance for copywriting.",
    inputSchema: {},
  }, async () => ok({ label: RULESET_LABEL, brandIdentity: GOVERNANCE_RULESET.brandIdentity, tone: GOVERNANCE_RULESET.tone, writingStyle: GOVERNANCE_RULESET.writingStyle }));

  server.registerTool("list_approved_claims", {
    title: "List approved claims (read-only)",
    description: "Read-only view of the synthetic claims library: approved wording, allowed variations, required qualifiers and status. Only 'active' claims may be used.",
    inputSchema: { language: z.string().default("de-DE"), includeExpired: z.boolean().default(false) },
  }, async ({ language, includeExpired }) => {
    const lang = language.toLowerCase().startsWith("de") ? "de-DE" : "en";
    const claims = CLAIMS_LIBRARY.filter((c) => c.language === lang && (includeExpired || c.status === "active"));
    mutate((s) => audit(s, { agent: "campaign", tool: "list_approved_claims", eventType: "CLAIMS_LIBRARY_READ", summary: `Read ${claims.length} claims (${lang})`, refs: {} }));
    return ok({ label: RULESET_LABEL, language: lang, claims });
  });

  server.registerTool("submit_campaign_draft", {
    title: "Submit campaign draft or revision",
    description: "Submits a new campaign (omit campaignId) or a revision of an existing one (pass campaignId). Copy must be in the target language; include an English translation for judges. Returns campaignId and version. Compliance must evaluate each version.",
    inputSchema: {
      audienceId: z.string(),
      campaignId: z.string().optional().describe("Pass to submit a revision"),
      language: z.string().default("de-DE"),
      subject: z.string(),
      preheader: z.string().optional(),
      headline: z.string(),
      body: z.string(),
      cta: z.string(),
      offerId: z.string().optional(),
      englishTranslation: z.string().optional(),
      revisionNotes: z.string().optional().describe("For revisions: how the constraints were addressed"),
    },
  }, async (args) => {
    const st = readState();
    if (!st.audiences[args.audienceId]) return fail(`Unknown audienceId ${args.audienceId}`);
    if (args.offerId && !APPROVED_OFFERS.some((o) => o.offerId === args.offerId)) return fail(`offerId ${args.offerId} is not an approved offer`, { approvedOffers: APPROVED_OFFERS.map((o) => o.offerId) });
    if (args.campaignId) {
      const c = st.campaigns[args.campaignId];
      if (!c) return fail(`Unknown campaignId ${args.campaignId}`);
      if (c.status === "COMPLIANCE_PASSED") return fail("Campaign already passed compliance; no further revisions accepted.");
      if (c.status === "ESCALATED") return fail("Campaign is escalated to a human reviewer; automated revisions are closed.");
      const lastV = c.versions[c.versions.length - 1];
      if (!c.verdicts.some((v) => v.version === lastV.version)) return fail(`Version ${lastV.version} has not been evaluated by Compliance yet.`);
    }
    const out = mutate((s) => {
      let c: CampaignRecord;
      if (args.campaignId) c = s.campaigns[args.campaignId];
      else {
        const n = Object.values(s.notifications).filter((x) => x.audienceId === args.audienceId).pop();
        c = { campaignId: nextId(s, "CMP", 3), createdAt: now(), audienceId: args.audienceId, dealerNotificationId: n?.notificationId, status: "DRAFT", versions: [], verdicts: [], guardrailChecks: [] };
        s.campaigns[c.campaignId] = c;
      }
      const version = c.versions.length + 1;
      c.versions.push({ version, submittedAt: now(), language: args.language, subject: args.subject, preheader: args.preheader, headline: args.headline, body: args.body, cta: args.cta, offerId: args.offerId, englishTranslation: args.englishTranslation, revisionNotes: args.revisionNotes });
      c.status = "DRAFT";
      audit(s, { agent: "campaign", tool: "submit_campaign_draft", eventType: version === 1 ? "CAMPAIGN_DRAFT_SUBMITTED" : "CAMPAIGN_REVISION_SUBMITTED", summary: `${c.campaignId} v${version} submitted (${args.language})`, refs: { campaignId: c.campaignId, audienceId: args.audienceId }, details: c.versions[version - 1] });
      return { campaignId: c.campaignId, version };
    });
    return ok({ ...out, status: "AWAITING_COMPLIANCE", next: "Compliance Agent must call evaluate_campaign_claims" });
  });

  server.registerTool("get_compliance_feedback", {
    title: "Get compliance feedback",
    description: "Returns the latest Compliance verdict for a campaign: decision, reasons and constraints. Compliance never supplies replacement copy — you author the revision.",
    inputSchema: { campaignId: z.string() },
  }, async ({ campaignId }) => {
    const c = readState().campaigns[campaignId];
    if (!c) return fail(`Unknown campaignId ${campaignId}`);
    const v = c.verdicts[c.verdicts.length - 1];
    if (!v) return ok({ campaignId, status: "AWAITING_COMPLIANCE" });
    return ok({ campaignId, status: c.status, latestVerdict: { decision: v.decision, version: v.version, round: `${v.round} of ${v.maxRounds}`, violations: v.violations, constraints: v.constraints, warnings: v.warnings } });
  });

  return server;
}
