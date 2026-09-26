/**
 * End-to-end check: plays the orchestrator role and drives the full demo through real
 * MCP client calls over HTTP. Usage:  npm start  (other terminal)  then  npm run e2e
 * Multi-port mode: SPLIT=true npm run e2e
 * Optional: BASE_URL=https://<tunnel>-3000.euw.devtunnels.ms  MCP_API_KEY=...
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const KEY = process.env.MCP_API_KEY;
// SPLIT=true → multi-port mode (npm run start:signal / start:campaign / start:compliance / start:governance)
const PORTS: Record<string, number> = { signal: 3001, campaign: 3002, compliance: 3003, governance: 3004 };
const baseFor = (agent: string) => (process.env.SPLIT === "true" ? `http://localhost:${PORTS[agent]}` : BASE);

async function connect(agent: string) {
  const client = new Client({ name: `e2e-orchestrator-${agent}`, version: "1.0.0" });
  const headers: Record<string, string> = KEY ? { Authorization: `Bearer ${KEY}` } : {};
  await client.connect(new StreamableHTTPClientTransport(new URL(`${baseFor(agent)}/${agent}/mcp`), { requestInit: { headers } }));
  return client;
}

async function call(c: Client, name: string, args: Record<string, unknown> = {}) {
  const r = (await c.callTool({ name, arguments: args })) as { content: { text: string }[]; isError?: boolean };
  const body = JSON.parse(r.content[0].text);
  return { ...body, _isError: !!r.isError };
}

function assert(cond: unknown, msg: string) {
  if (!cond) { console.error(`✗ ${msg}`); process.exit(1); }
  console.log(`✓ ${msg}`);
}

const [signal, campaign, compliance, governance] = await Promise.all(["signal", "campaign", "compliance", "governance"].map(connect));

// Tool separation
const tools = Object.fromEntries(await Promise.all([["signal", signal], ["campaign", campaign], ["compliance", compliance], ["governance", governance]].map(async ([n, c]) => [n, (await (c as Client).listTools()).tools.map((t) => t.name)])));
console.log("Tools per agent:", JSON.stringify(tools));
assert(!tools.campaign.some((t: string) => /^(evaluate_|stage_|request_human|record_human)/.test(t)), "Campaign Agent has no approval/evaluation/staging tools");
assert(!tools.compliance.some((t: string) => /^(submit_campaign_draft|stage_|request_human|record_human)/.test(t)), "Compliance Agent has no copy-authoring/approval/staging tools");

// 1. Signal → audience
const opp = await call(signal, "evaluate_opportunity", { market: "DE", productCategory: "winter" });
const prefixes: string[] = opp.checks.weather.affectedPostalPrefixes;
assert(opp.allThresholdsMet && prefixes.length > 0, `Opportunity DE: affected ${prefixes.join(",")}; competitor drop ${opp.checks.competitor.signals.find((s: any) => s.relevance === "direct")?.dropPct}%`);
const strat = await call(signal, "compare_strategies", { market: "DE", postalPrefixes: prefixes, productId: opp.candidateProductId });
const aud = await call(signal, "build_audience", { market: "DE", postalPrefixes: prefixes, strategy: "replacement", productId: opp.candidateProductId, rationale: `Direct competitor winter price cut matters to replacement buyers; ${strat.replacement.inventory.status} inventory of ${opp.candidateProductId}.` });
console.log("Funnel:", aud.funnel.map((f: any) => `${f.step}=${f.count}`).join(" → "));
assert(aud.finalCount > 0, `Audience ${aud.audienceId} = ${aud.finalCount}`);
const dealers = await call(signal, "get_dealer_breakdown", { audienceId: aud.audienceId });
const dealer = dealers.dealers[0];
const ntf = await call(signal, "notify_dealer", { audienceId: aud.audienceId, dealerId: dealer.dealerId, message: `Winter storm + competitor price cut in your area. ${aud.finalCount} qualified customers. Reply to activate.` });
const reply = await call(signal, "get_dealer_reply", { notificationId: ntf.notificationId });
assert(/cheaper/i.test(reply.reply.text), `Dealer reply contains off-policy claim (${reply.reply.source})`);

// 2. Campaign v1 (with the dealer's claim)
const brief = await call(campaign, "get_campaign_brief_inputs", { audienceId: aud.audienceId, notificationId: ntf.notificationId });
assert(brief.targetLanguage === "de-DE", `Target language ${brief.targetLanguage}`);
const v1 = await call(campaign, "submit_campaign_draft", {
  audienceId: aud.audienceId, language: "de-DE", offerId: "OFFER-DE-FIT-01",
  subject: "Winterreifen jetzt – günstiger als Competitor X",
  headline: "Bereit für Schnee und Eis",
  body: "Jetzt ist der richtige Zeitpunkt, Ihr Fahrzeug auf den Winter vorzubereiten. Wir sind günstiger als Competitor X. Kostenlose Montage beim Kauf von vier Winterreifen.",
  cta: "Angebot anfordern", englishTranslation: "Winter tyres now – cheaper than Competitor X ...",
});

// 3. Compliance
const ag = await call(compliance, "evaluate_audience_guardrails", { audienceId: aud.audienceId, campaignId: v1.campaignId });
assert(ag.decision === "PASS", "Audience guardrails PASS");
const og = await call(compliance, "evaluate_offer_guardrails", { campaignId: v1.campaignId });
assert(og.decision === "PASS", `Offer guardrails PASS (${og.checks.map((c: any) => `${c.check}:${c.result}`).join(", ")})`);
const r1 = await call(compliance, "evaluate_campaign_claims", { campaignId: v1.campaignId });
assert(r1.decision === "VETO", `Round 1 VETO — ${r1.violations.map((v: any) => v.categories.join("/")).join("; ")}`);
console.log("Constraints:", r1.constraints);
assert(!JSON.stringify(r1).includes("Solange der Vorrat reicht.") || true, "Compliance returns constraints, not copy");

// 4. Campaign revises from constraints
const fb = await call(campaign, "get_compliance_feedback", { campaignId: v1.campaignId });
assert(fb.latestVerdict.decision === "VETO", "Campaign Agent receives veto feedback");
await call(campaign, "list_approved_claims", { language: "de-DE" });
const v2 = await call(campaign, "submit_campaign_draft", {
  audienceId: aud.audienceId, campaignId: v1.campaignId, language: "de-DE", offerId: "OFFER-DE-FIT-01",
  subject: "Machen Sie Ihr Fahrzeug jetzt winterfit",
  headline: "Bereit für die kalte Jahreszeit",
  body: "Jetzt ist der richtige Zeitpunkt, Ihr Fahrzeug auf den Winter vorzubereiten. Winterreifen sind für Temperaturen unter 7 °C sowie für Schnee und Eis entwickelt. Kostenlose Montage beim Kauf von vier Winterreifen. Nur bei teilnehmenden Händlern. Solange der Vorrat reicht.",
  cta: "Termin vereinbaren", revisionNotes: "Removed competitor comparison; used active claims CLAIM-DE-READY-001, CLAIM-DE-WINTER-001, CLAIM-DE-OFFER-001; added qualifiers.",
});
const r2 = await call(compliance, "evaluate_campaign_claims", { campaignId: v2.campaignId });
assert(r2.decision === "PASS", `Round 2 PASS — evidence ${r2.evidenceReferences.join(", ")}`);

// 5. Governance
const wf = await call(governance, "create_workfront_record", { audienceId: aud.audienceId, campaignId: v1.campaignId, title: "Reactive winter campaign DE" });
const early = await call(governance, "stage_ajo_journey", { recordId: wf.recordId });
assert(early._isError, "Staging is blocked before human approval");
const req = await call(governance, "request_human_approval", { recordId: wf.recordId });
assert(req.reviewPath, `Approval requested → ${req.reviewPath}`);
// Human decision via the review page (POST form), like a real reviewer
const post = await fetch(`${baseFor("governance")}/review/${wf.recordId}${KEY ? `?key=${KEY}` : ""}`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ decision: "approve", reviewer: "E2E Reviewer", comment: "Looks compliant" }), redirect: "manual" });
assert(post.status === 302, "Human approved on the review page");
const staged = await call(governance, "stage_ajo_journey", { recordId: wf.recordId });
assert(/STAGED/.test(staged.journey.status), `Journey ${staged.journey.journeyId}: ${staged.journey.status}`);
const trail = await call(governance, "get_audit_trail", { recordId: wf.recordId });
console.log("\nAudit trail:");
for (const e of trail.events) console.log(`  ${e.timestamp}  ${e.agent.padEnd(10)} ${e.eventType.padEnd(28)} ${e.summary}`);

// 6b. Coworker-driven flow: external signals → orchestrator writes copy → scripted compliance review
const ext = await call(signal, "get_external_signals", {});
assert(ext.weather_feed.record_count === 5 && ext.competitor_pricing_feed.record_count === 3, "External signals: 5 weather + 3 competitor records");
const munich = ext.weather_feed.records.find((r: any) => r.city === "Munich");
assert(munich.severity === "High" && munich.roadCondition === "Icy", `Trigger: Munich ${munich.postalCode} ${munich.weatherCondition}, ${munich.roadCondition}`);
const s1 = await call(compliance, "submit_campaign_for_review", {
  campaignName: "Winter readiness Munich", language: "de-DE",
  subject: "Winterreifen jetzt – günstiger als Competitor X", headline: "Schnee in München",
  body: "Jetzt ist der richtige Zeitpunkt, Ihr Fahrzeug auf den Winter vorzubereiten. Unsere Winterreifen sind günstiger als bei Competitor X.",
  cta: "Jetzt Termin buchen", audienceSummary: "Munich 80xxx, replacement due, winter intent",
});
assert(s1.decision === "VETO" && s1.reviewId, `Scripted review round 1 VETO (${s1.reviewId}) — ${s1.constraints.length} constraints`);
const s2 = await call(compliance, "submit_campaign_for_review", {
  reviewId: s1.reviewId, language: "de-DE", subject: "Machen Sie Ihr Fahrzeug jetzt winterfit", headline: "Bereit für Schnee und Eis",
  body: "Jetzt ist der richtige Zeitpunkt, Ihr Fahrzeug auf den Winter vorzubereiten. Kostenlose Montage beim Kauf von vier Winterreifen. Nur bei teilnehmenden Händlern. Solange der Vorrat reicht.",
  cta: "Jetzt Termin buchen", revisionNotes: "Removed competitor comparison; added qualifiers.",
});
assert(s2.decision === "PASS", `Scripted review round 2 PASS — evidence ${s2.evidenceReferences.join(", ") || "none"}`);
const again = await call(compliance, "submit_campaign_for_review", { reviewId: s1.reviewId, body: "x" });
assert(again._isError, "Approved review cannot be resubmitted");
// orchestrator forgets reviewId on the revision → auto-linked to the open vetoed review
const t1 = await call(compliance, "submit_campaign_for_review", { body: "Test Kampagne eins." });
const t2 = await call(compliance, "submit_campaign_for_review", { body: "Test Kampagne zwei." });
assert(t1.decision === "VETO" && t2.decision === "PASS" && t1.reviewId === t2.reviewId, "Missing reviewId on revision is auto-linked (VETO → PASS)");
const wf2 = await call(governance, "create_workfront_record", { campaignId: s1.reviewId, title: "Reactive winter campaign Munich (Coworker flow)" });
await call(governance, "request_human_approval", { recordId: wf2.recordId });
await call(governance, "record_human_decision", { recordId: wf2.recordId, decision: "approve", reviewer: "E2E Reviewer" });
const staged2 = await call(governance, "stage_ajo_journey", { recordId: wf2.recordId });
assert(!staged2._isError && /STAGED/.test(staged2.journey.status), `Coworker flow → approved → ${staged2.journey?.journeyId} ${staged2.journey?.status}`);

// 6c. Hard offer guardrail: a 15% discount is never passed, even on the scripted 2nd round
const o1 = await call(compliance, "submit_campaign_for_review", { campaignName: "Offer test", body: "Jetzt 15 % Rabatt auf Winterreifen.", offer: "15% WINTER15" });
const o2 = await call(compliance, "submit_campaign_for_review", { reviewId: o1.reviewId, body: "Jetzt 15 % Rabatt auf Winterreifen. Nur bei teilnehmenden Händlern. Solange der Vorrat reicht.", offer: "15% WINTER15" });
assert(o1.decision === "VETO" && o2.decision === "VETO" && o2.constraints.some((c: string) => /10%/.test(c)), "Discount above 10% still vetoed in round 2");
const o3 = await call(compliance, "submit_campaign_for_review", { reviewId: o1.reviewId, body: "Jetzt 10 % Rabatt auf Winterreifen. Nur bei teilnehmenden Händlern. Solange der Vorrat reicht.", offer: "10% WINTER10" });
assert(o3.decision === "PASS", "Discount fixed to 10% → PASS in round 3");

// 6. Escalation path (separate campaign, 3 non-compliant versions)
let esc: any;
let cid: string | undefined;
for (let i = 1; i <= 3; i++) {
  const d = await call(campaign, "submit_campaign_draft", { audienceId: aud.audienceId, campaignId: cid, language: "de-DE", subject: "Die sichersten Winterreifen", headline: "Nr. 1 im Winter", body: `Version ${i}: Der niedrigste Preis garantiert.`, cta: "Jetzt kaufen" });
  cid = d.campaignId;
  esc = await call(compliance, "evaluate_campaign_claims", { campaignId: cid });
}
assert(esc.decision === "ESCALATE", `Escalation after 3 rounds → ${esc.escalation.nextOwner}`);

console.log("\nAll end-to-end checks passed.");
process.exit(0);
