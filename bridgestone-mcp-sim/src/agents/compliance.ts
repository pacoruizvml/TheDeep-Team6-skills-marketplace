/**
 * AGENT 3 — Compliance & Guardrails Agent (MCP server) — the referee.
 * Three rule groups, logged separately: audience, offer/business, claims.
 * Returns PASS / VETO + reasons + constraints / ESCALATE. Never returns replacement copy.
 * NOT allowed: write or edit copy, approve, create Workfront records, stage journeys.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { customers, dataset } from "../lib/data.js";
import { APPROVED_OFFERS, CLAIMS_LIBRARY, CONFIG, GOVERNANCE_RULESET, analyseCopy, constraintsFor } from "../lib/rules.js";
import { audit, mutate, nextId, readState, now, type ComplianceVerdict } from "../lib/store.js";
import { ok, fail } from "../lib/mcp.js";

const DAY = 86_400_000;

export function buildComplianceServer(): McpServer {
  const server = new McpServer({ name: "bridgestone-compliance-guardrails-agent", version: "0.1.0" });

  server.registerTool("get_ruleset", {
    title: "Get governance ruleset",
    description: "Returns the synthetic Bridgestone governance ruleset (brand identity, tone, writing style, claims rules, audience & offer guardrails, segment context) and arbitration configuration.",
    inputSchema: {},
  }, async () => ok({ ruleset: GOVERNANCE_RULESET, arbitration: { maxRounds: CONFIG.maxArbitrationRounds, onLimit: "ESCALATE to human legal/brand reviewer" }, config: CONFIG }));

  server.registerTool("evaluate_audience_guardrails", {
    title: "Rule group 1 — Audience guardrails",
    description: "Re-verifies every audience member against consent, email opt-in, recent-purchase suppression, frequency cap, regional relevance and purpose match. Deterministic.",
    inputSchema: { audienceId: z.string(), campaignId: z.string().optional() },
  }, async ({ audienceId, campaignId }) => {
    const st = readState();
    const a = st.audiences[audienceId];
    if (!a) return fail(`Unknown audienceId ${audienceId}`);
    const t = Date.now();
    const fails: Record<string, number> = { marketingConsent: 0, emailOptIn: 0, recentPurchase: 0, frequencyCap: 0, regionalRelevance: 0, purposeMatch: 0 };
    for (const id of a.memberIds) {
      const c = customers().get(id)!;
      if (!c.profile.marketingConsent) fails.marketingConsent++;
      if (!c.profile.emailOptIn) fails.emailOptIn++;
      if (c.events.some((e) => e.eventType === "purchaseCompleted" && Date.parse(e.timestamp) >= t - CONFIG.purchaseSuppressionDays * DAY)) fails.recentPurchase++;
      if (c.profile.contactsLast30d >= CONFIG.frequencyCapContacts30d) fails.frequencyCap++;
      if (!a.postalPrefixes.includes(c.profile.postalCode.slice(0, 2))) fails.regionalRelevance++;
      if (a.strategy === "replacement" ? !c.vehicle.replacementDue : c.vehicle.tyreSeason !== "summer") fails.purposeMatch++;
    }
    const checks = Object.entries(fails).map(([check, violations]) => ({ check, violations, result: violations === 0 ? "PASS" : "FAIL" }));
    const decision = checks.every((c) => c.result === "PASS") ? "PASS" : "VETO";
    const result = { ruleGroup: "audience", audienceId, membersChecked: a.memberIds.length, decision, checks, evaluatedAt: now() };
    mutate((s) => {
      if (campaignId && s.campaigns[campaignId]) s.campaigns[campaignId].guardrailChecks.push({ type: "audience", timestamp: now(), decision, result });
      audit(s, { agent: "compliance", tool: "evaluate_audience_guardrails", eventType: "AUDIENCE_GUARDRAILS", summary: `Audience guardrails ${decision} for ${audienceId} (${a.memberIds.length} members)`, refs: { audienceId, campaignId }, details: result });
    });
    return ok(result);
  });

  server.registerTool("evaluate_offer_guardrails", {
    title: "Rule group 2 — Offer / business guardrails",
    description: "Checks the campaign's offer against approved offers, discount limit, inventory, demand and dealer capacity. Deterministic; thresholds are demo configuration.",
    inputSchema: { campaignId: z.string(), requestedDiscountPct: z.number().min(0).max(100).optional().describe("Optional: a discount requested by dealer/campaign that is not an approved offer") },
  }, async ({ campaignId, requestedDiscountPct }) => {
    const st = readState();
    const c = st.campaigns[campaignId];
    if (!c) return fail(`Unknown campaignId ${campaignId}`);
    const a = st.audiences[c.audienceId];
    const v = c.versions[c.versions.length - 1];
    const ds = dataset();
    const offer = APPROVED_OFFERS.find((o) => o.offerId === v.offerId);
    const inv = ds.businessSignals.find((s) => s.signalType === "inventory" && s.market === a.market && s.productId === a.productId);
    const demand = ds.businessSignals.find((s) => s.signalType === "demand" && s.market === a.market && s.productCategory === "winter");
    const dealerId = c.dealerNotificationId ? st.notifications[c.dealerNotificationId]?.dealerId : undefined;
    const cap = dealerId ? ds.businessSignals.find((s) => s.signalType === "dealerCapacity" && s.dealerId === dealerId)?.dealerCapacity : undefined;
    const discount = requestedDiscountPct ?? offer?.discountPct ?? 0;

    const checks = [
      { check: "approvedOffer", result: offer || !v.offerId ? "PASS" : "FAIL", detail: offer ? `${offer.offerId}: ${offer.description}` : v.offerId ? `${v.offerId} not approved` : "No offer used" },
      { check: "discountLimit", result: discount <= CONFIG.maxDiscountPct ? "PASS" : "FAIL", detail: `requested ${discount}% vs limit ${CONFIG.maxDiscountPct}%` },
      { check: "inventoryCondition", result: !inv ? "FAIL" : inv.inventoryStatus === "constrained" && discount > 0 ? "FAIL" : "PASS", detail: inv ? `${inv.productId}: ${inv.inventoryUnits} units, ${inv.inventoryStatus}` : "no inventory record" },
      { check: "demandCondition", result: demand?.demandTrend === "rising" && discount > 0 ? "WARN" : "PASS", detail: demand ? `demandIndex ${demand.demandIndex} (${demand.demandTrend})` : "no demand record" },
      { check: "dealerCapacity", result: offer?.requiresDealerCapacity ? ((cap ?? 0) >= CONFIG.minDealerCapacityForFittingOffer ? "PASS" : "FAIL") : "N/A", detail: `dealer ${dealerId ?? "?"} capacity ${cap ?? "?"} (min ${CONFIG.minDealerCapacityForFittingOffer} for fitting offers)` },
    ];
    const decision = checks.some((x) => x.result === "FAIL") ? "VETO" : "PASS";
    const recommendations: string[] = [];
    if (demand?.demandTrend === "rising" && discount > 0) recommendations.push("Demand is rising: prefer non-discount messaging (seasonal readiness, local availability, service offer).");
    if (discount > CONFIG.maxDiscountPct) recommendations.push(`Reduce discount to an approved offer (max ${CONFIG.maxDiscountPct}%) or use the free-fitting service offer.`);
    const result = { ruleGroup: "offer", campaignId, version: v.version, decision, checks, recommendations, evaluatedAt: now() };
    mutate((s) => {
      s.campaigns[campaignId].guardrailChecks.push({ type: "offer", timestamp: now(), decision, result });
      audit(s, { agent: "compliance", tool: "evaluate_offer_guardrails", eventType: "OFFER_GUARDRAILS", summary: `Offer guardrails ${decision} for ${campaignId} v${v.version}`, refs: { campaignId, audienceId: c.audienceId }, details: result });
    });
    return ok(result);
  });

  server.registerTool("evaluate_campaign_claims", {
    title: "Rule group 3 — Claim guardrails (veto authority)",
    description: "Evaluates the latest campaign version. Deterministic claim detection + claims-library lookup decides PASS / VETO / ESCALATE (at the round limit). Returns reasons and constraints only — never replacement copy. Optionally pass the claims you extracted yourself; they are logged for comparison but do not change the deterministic decision.",
    inputSchema: {
      campaignId: z.string(),
      llmExtractedClaims: z.array(z.object({ text: z.string(), category: z.string() })).optional(),
    },
  }, async ({ campaignId, llmExtractedClaims }) => {
    const st = readState();
    const c = st.campaigns[campaignId];
    if (!c) return fail(`Unknown campaignId ${campaignId}`);
    if (c.status === "COMPLIANCE_PASSED" || c.status === "ESCALATED") return fail(`Campaign is already ${c.status}.`);
    const v = c.versions[c.versions.length - 1];
    if (c.verdicts.some((x) => x.version === v.version)) return fail(`Version ${v.version} was already evaluated. Waiting for a revision from the Campaign Agent.`);

    const { detected, missingQualifiers, warnings } = analyseCopy(
      { subject: v.subject, preheader: v.preheader, headline: v.headline, body: v.body, cta: v.cta }, v.language, now(),
    );
    const violations = detected.filter((d) => d.outcome === "violation");
    const approved = detected.filter((d) => d.outcome === "approved");
    const round = c.verdicts.length + 1;
    const failed = violations.length > 0 || missingQualifiers.length > 0;
    const decision: ComplianceVerdict["decision"] = !failed ? "PASS" : round >= CONFIG.maxArbitrationRounds ? "ESCALATE" : "VETO";
    const constraints = failed ? constraintsFor(violations, missingQualifiers) : [];
    const evidence = [...new Set(approved.map((d) => d.matchedClaimId!))].map((id) => {
      const cl = CLAIMS_LIBRARY.find((x) => x.claimId === id)!;
      return `${cl.claimId} → ${cl.evidenceReference}`;
    });

    const verdict = mutate((s) => {
      const vd: ComplianceVerdict = {
        verdictId: nextId(s, "VRD", 3), timestamp: now(), campaignId, version: v.version, round, maxRounds: CONFIG.maxArbitrationRounds, decision,
        ruleGroups: { claims: { detectedClaims: detected, missingQualifiers }, llmExtractedClaims: llmExtractedClaims ?? null },
        violations: violations.map((x) => ({ field: x.field, quotedText: x.sentence, categories: x.categories, ruleIds: x.ruleIds, reason: x.reason })),
        constraints, evidenceReferences: evidence, warnings,
      };
      const cc = s.campaigns[campaignId];
      cc.verdicts.push(vd);
      cc.status = decision === "PASS" ? "COMPLIANCE_PASSED" : decision === "ESCALATE" ? "ESCALATED" : "VETOED";
      audit(s, {
        agent: "compliance", tool: "evaluate_campaign_claims",
        eventType: decision === "PASS" ? "COMPLIANCE_PASS" : decision === "ESCALATE" ? "COMPLIANCE_ESCALATED" : "COMPLIANCE_VETO",
        summary: `${campaignId} v${v.version}: ${decision} (round ${round} of ${CONFIG.maxArbitrationRounds})${violations.length ? ` — ${violations.map((x) => x.categories.join("/")).join("; ")}` : ""}`,
        refs: { campaignId, audienceId: c.audienceId, verdictId: vd.verdictId }, details: vd,
      });
      return vd;
    });

    return ok({
      decision: verdict.decision, verdictId: verdict.verdictId, campaignId, version: v.version, round: `${round} of ${CONFIG.maxArbitrationRounds}`,
      method: "Deterministic rules + synthetic claims library decide. LLM extraction (if provided) is logged only.",
      violations: verdict.violations, missingQualifiers, constraints, evidenceReferences: evidence, warnings,
      ...(decision === "ESCALATE" ? { escalation: { status: "Escalated", reason: "No compliant resolution within the configured arbitration limit", nextOwner: "Human legal/brand reviewer" } } : {}),
      note: "Compliance is the referee, not the copywriter: no replacement wording is provided.",
    });
  });

  return server;
}
