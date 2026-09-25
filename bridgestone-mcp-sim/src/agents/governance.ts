/**
 * AGENT 4 — Governance & Approval Agent (MCP server)
 * Allowed: create/update (simulated) Workfront records, compile the audit trail, request human
 * approval, record the human decision, stage (never activate) the AJO journey.
 * NOT allowed: write copy, evaluate compliance, change audiences.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { APPROVED_OFFERS } from "../lib/rules.js";
import { audit, mutate, nextId, readState, now, type State, type WorkfrontRecord } from "../lib/store.js";
import { ok, fail } from "../lib/mcp.js";

export function relatedEvents(s: State, rec: WorkfrontRecord) {
  const campaign = rec.campaignId ? s.campaigns[rec.campaignId] : undefined;
  const ids = new Set([rec.recordId, rec.audienceId, rec.campaignId, campaign?.dealerNotificationId].filter(Boolean) as string[]);
  const audienceEvents = s.audit.filter((e) => Object.values(e.refs).some((v) => v && ids.has(v)));
  // include the signal reads that preceded audience creation
  const firstAud = audienceEvents[0];
  const pre = firstAud ? s.audit.filter((e) => e.agent === "signal" && e.timestamp <= firstAud.timestamp && !e.refs.audienceId) : [];
  return [...pre, ...audienceEvents].sort((a, b) => a.eventId.localeCompare(b.eventId));
}

export function approvalPackage(s: State, rec: WorkfrontRecord) {
  const a = s.audiences[rec.audienceId];
  const c = rec.campaignId ? s.campaigns[rec.campaignId] : undefined;
  const n = c?.dealerNotificationId ? s.notifications[c.dealerNotificationId] : undefined;
  const finalV = c?.versions[c.versions.length - 1];
  const lastVerdict = c?.verdicts[c.verdicts.length - 1];
  const offer = APPROVED_OFFERS.find((o) => o.offerId === finalV?.offerId);
  return {
    recordId: rec.recordId, status: rec.status,
    trigger: (() => {
      const ev = s.audit.filter((e) => e.eventType === "OPPORTUNITY_EVALUATED" && e.refs.market === a?.market && (!a || e.timestamp <= a.createdAt)).pop();
      const d = ev?.details as { checks?: { weather?: unknown; competitor?: { signals?: unknown } }; evaluatedAt?: string } | undefined;
      return d ? { evaluatedAt: d.evaluatedAt, weather: d.checks?.weather, competitor: d.checks?.competitor?.signals } : null;
    })(),
    audience: a ? { audienceId: a.audienceId, market: a.market, postalPrefixes: a.postalPrefixes, strategy: a.strategy, rationale: a.definition.rationale, funnel: a.funnel, finalCount: a.finalCount } : null,
    dealer: n ? { dealerId: n.dealerId, request: n.reply?.text, requestSource: n.reply?.source } : null,
    arbitration: c ? c.verdicts.map((v) => ({ round: `${v.round} of ${v.maxRounds}`, version: v.version, decision: v.decision, violations: v.violations, constraints: v.constraints, evidence: v.evidenceReferences, at: v.timestamp })) : [],
    guardrails: c ? c.guardrailChecks.map((g) => ({ type: g.type, decision: g.decision, at: g.timestamp })) : [],
    finalCopy: finalV ?? null,
    finalCompliance: lastVerdict ? { decision: lastVerdict.decision, evidence: lastVerdict.evidenceReferences } : null,
    offer: offer ?? null,
    humanDecision: rec.humanDecision ?? null,
    journey: rec.journey ?? null,
  };
}

export function applyHumanDecision(s: State, recordId: string, decision: "approve" | "amend" | "reject", reviewer: string, comment: string | undefined, channel: string) {
  const rec = s.workfront[recordId];
  rec.humanDecision = { decision, reviewer, comment, timestamp: now(), channel };
  rec.status = decision === "approve" ? "APPROVED" : decision === "amend" ? "AMEND_REQUESTED" : "REJECTED";
  audit(s, { agent: "human", tool: channel, eventType: "HUMAN_DECISION", summary: `${reviewer}: ${decision.toUpperCase()} on ${recordId}${comment ? ` — "${comment}"` : ""}`, refs: { recordId, campaignId: rec.campaignId, audienceId: rec.audienceId }, details: rec.humanDecision });
}

export function buildGovernanceServer(): McpServer {
  const server = new McpServer({ name: "bridgestone-governance-approval-agent", version: "0.1.0" });

  server.registerTool("create_workfront_record", {
    title: "Create Workfront record (simulated)",
    description: "Creates the governance record that ties together trigger, audience, campaign, arbitration and approval. SIMULATED Workfront (local record in the Workfront field schema).",
    inputSchema: { audienceId: z.string(), campaignId: z.string().optional(), title: z.string().default("Reactive winter campaign") },
  }, async ({ audienceId, campaignId, title }) => {
    const st = readState();
    if (!st.audiences[audienceId]) return fail(`Unknown audienceId ${audienceId}`);
    if (campaignId && !st.campaigns[campaignId]) return fail(`Unknown campaignId ${campaignId}`);
    const rec = mutate((s) => {
      const r: WorkfrontRecord = { recordId: nextId(s, "WF-SIM", 4), createdAt: now(), title, audienceId, campaignId, status: "OPEN" };
      s.workfront[r.recordId] = r;
      audit(s, { agent: "governance", tool: "create_workfront_record", eventType: "WORKFRONT_RECORD_CREATED", summary: `${r.recordId} created: ${title}`, refs: { recordId: r.recordId, audienceId, campaignId } });
      return r;
    });
    return ok({ ...rec, system: "SIMULATED Workfront (local fallback, Workfront field schema)", auditViewPath: `/audit/${rec.recordId}` });
  });

  server.registerTool("link_campaign", {
    title: "Link campaign to Workfront record",
    description: "Attaches a campaignId to an existing record.",
    inputSchema: { recordId: z.string(), campaignId: z.string() },
  }, async ({ recordId, campaignId }) => {
    const st = readState();
    if (!st.workfront[recordId]) return fail(`Unknown recordId ${recordId}`);
    if (!st.campaigns[campaignId]) return fail(`Unknown campaignId ${campaignId}`);
    mutate((s) => {
      s.workfront[recordId].campaignId = campaignId;
      audit(s, { agent: "governance", tool: "link_campaign", eventType: "WORKFRONT_RECORD_UPDATED", summary: `${campaignId} linked to ${recordId}`, refs: { recordId, campaignId } });
    });
    return ok({ recordId, campaignId, linked: true });
  });

  server.registerTool("log_decision_note", {
    title: "Log a decision note",
    description: "Adds a free-text note to the audit trail (e.g. business decision, rationale summary).",
    inputSchema: { recordId: z.string(), eventType: z.string().default("NOTE"), note: z.string() },
  }, async ({ recordId, eventType, note }) => {
    const st = readState();
    const rec = st.workfront[recordId];
    if (!rec) return fail(`Unknown recordId ${recordId}`);
    const ev = mutate((s) => audit(s, { agent: "governance", tool: "log_decision_note", eventType, summary: note, refs: { recordId, campaignId: rec.campaignId, audienceId: rec.audienceId } }));
    return ok({ logged: ev });
  });

  server.registerTool("get_audit_trail", {
    title: "Get audit trail",
    description: "Returns every automated and human event linked to the record, with real system timestamps, in order.",
    inputSchema: { recordId: z.string() },
  }, async ({ recordId }) => {
    const s = readState();
    const rec = s.workfront[recordId];
    if (!rec) return fail(`Unknown recordId ${recordId}`);
    const events = relatedEvents(s, rec).map((e) => ({ eventId: e.eventId, timestamp: e.timestamp, agent: e.agent, eventType: e.eventType, summary: e.summary }));
    return ok({ recordId, status: rec.status, eventCount: events.length, events, auditViewPath: `/audit/${recordId}` });
  });

  server.registerTool("request_human_approval", {
    title: "Request human approval",
    description: "Builds the approval package and routes it to the human reviewer. Requires the campaign's final compliance decision to be PASS (or ESCALATE, which routes to legal/brand). Returns a review page path where the human approves, amends or rejects.",
    inputSchema: { recordId: z.string() },
  }, async ({ recordId }) => {
    const st = readState();
    const rec = st.workfront[recordId];
    if (!rec) return fail(`Unknown recordId ${recordId}`);
    if (!rec.campaignId) return fail("No campaign linked. Use link_campaign first.");
    const c = st.campaigns[rec.campaignId];
    if (!["COMPLIANCE_PASSED", "ESCALATED"].includes(c.status)) return fail(`Campaign status is ${c.status}. Approval can only be requested after Compliance PASS or ESCALATE.`);
    const missing = ["audience", "offer"].filter((t) => !c.guardrailChecks.some((g) => g.type === t));
    const pkg = mutate((s) => {
      const r = s.workfront[recordId];
      r.status = c.status === "ESCALATED" ? "ESCALATED" : "PENDING_HUMAN_APPROVAL";
      r.approvalRequestedAt = now();
      audit(s, { agent: "governance", tool: "request_human_approval", eventType: "APPROVAL_REQUESTED", summary: `${recordId} routed to ${c.status === "ESCALATED" ? "legal/brand reviewer (escalated)" : "human reviewer"}`, refs: { recordId, campaignId: r.campaignId, audienceId: r.audienceId } });
      return approvalPackage(s, r);
    });
    return ok({ approvalPackage: pkg, reviewPath: `/review/${recordId}`, warnings: missing.length ? [`Guardrail group(s) not yet evaluated: ${missing.join(", ")}`] : [] });
  });

  server.registerTool("get_approval_status", {
    title: "Get approval status",
    description: "Returns the record status and the human decision (if any).",
    inputSchema: { recordId: z.string() },
  }, async ({ recordId }) => {
    const rec = readState().workfront[recordId];
    if (!rec) return fail(`Unknown recordId ${recordId}`);
    return ok({ recordId, status: rec.status, humanDecision: rec.humanDecision ?? null, reviewPath: `/review/${recordId}` });
  });

  server.registerTool("record_human_decision", {
    title: "Record human decision (relayed)",
    description: "Use ONLY when the human reviewer has explicitly stated their decision in the conversation. Records approve/amend/reject with reviewer name and real timestamp. Prefer the review page, where the human clicks the decision themselves.",
    inputSchema: { recordId: z.string(), decision: z.enum(["approve", "amend", "reject"]), reviewer: z.string().min(2), comment: z.string().optional() },
  }, async ({ recordId, decision, reviewer, comment }) => {
    const rec = readState().workfront[recordId];
    if (!rec) return fail(`Unknown recordId ${recordId}`);
    if (!rec.approvalRequestedAt) return fail("Approval has not been requested yet.");
    if (rec.humanDecision) return fail(`Decision already recorded: ${rec.humanDecision.decision} by ${rec.humanDecision.reviewer}`);
    mutate((s) => applyHumanDecision(s, recordId, decision, reviewer, comment, "chat (relayed by orchestrator)"));
    return ok({ recordId, recorded: { decision, reviewer, comment } });
  });

  server.registerTool("stage_ajo_journey", {
    title: "Stage AJO journey (simulated, NOT activated)",
    description: "Creates a draft journey definition with status STAGED FOR ACTIVATION. Requires human approval and a Compliance PASS. Offer code is SIMULATED Talon.One. Never activates.",
    inputSchema: { recordId: z.string() },
  }, async ({ recordId }) => {
    const st = readState();
    const rec = st.workfront[recordId];
    if (!rec) return fail(`Unknown recordId ${recordId}`);
    if (rec.status !== "APPROVED") return fail(`Record status is ${rec.status}; a human must approve before staging.`);
    const c = st.campaigns[rec.campaignId!];
    if (c.status !== "COMPLIANCE_PASSED") return fail("Final campaign version has not passed Compliance.");
    const a = st.audiences[rec.audienceId];
    const v = c.versions[c.versions.length - 1];
    const journey = mutate((s) => {
      const j = {
        journeyId: nextId(s, "AJO-SIM", 3),
        name: `Winter Replacement ${a.market} ${a.postalPrefixes.join("/")} — ${rec.recordId}`,
        status: "STAGED FOR ACTIVATION (not activated)",
        system: "SIMULATED Adobe Journey Optimizer",
        audience: { audienceId: a.audienceId, size: a.finalCount },
        steps: [
          { type: "audienceEntry", audienceId: a.audienceId },
          { type: "email", language: v.language, subject: v.subject, headline: v.headline, campaignId: c.campaignId, version: v.version },
          { type: "wait", duration: "P3D" },
          { type: "condition", rule: "quoteRequested OR purchaseCompleted", onFalse: "reminderEmail" },
        ],
        offerCode: v.offerId ? { code: `SIM-${v.offerId}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`, provider: "SIMULATED Talon.One" } : null,
        stagedAt: now(),
      };
      s.workfront[recordId].journey = j;
      audit(s, { agent: "governance", tool: "stage_ajo_journey", eventType: "AJO_JOURNEY_STAGED", summary: `${j.journeyId} STAGED (not activated)`, refs: { recordId, campaignId: c.campaignId, audienceId: a.audienceId }, details: j });
      return j;
    });
    return ok({ journey });
  });

  return server;
}
