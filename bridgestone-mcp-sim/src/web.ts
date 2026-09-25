/**
 * Small human-facing pages (no framework): agent separation view, audit trail,
 * human review/approval page, dealer inbox. All clearly labelled SIMULATED.
 */
import type { Express, Request, Response, NextFunction } from "express";
import { SIMULATION_LABEL, dataset } from "./lib/data.js";
import { readState, mutate, audit, now } from "./lib/store.js";
import { approvalPackage, applyHumanDecision, relatedEvents } from "./agents/governance.js";

const esc = (v: unknown) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function page(title: string, body: string, key?: string) {
  const k = key ? `?key=${encodeURIComponent(key)}` : "";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><style>
:root{--bg:#f6f6f4;--fg:#1b1b1b;--muted:#666;--card:#fff;--line:#e2e2de;--red:#c8102e;--ok:#1f7a3a;--warn:#a15c00;--veto:#b3261e}
@media (prefers-color-scheme:dark){:root{--bg:#141414;--fg:#eee;--muted:#aaa;--card:#1e1e1e;--line:#333;--ok:#5fc27e;--warn:#e0a24a;--veto:#ff8a80}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,Segoe UI,Roboto,sans-serif}
header{background:var(--red);color:#fff;padding:12px 16px}header a{color:#fff}
.banner{background:#fff3cd;color:#5c4400;padding:8px 16px;font-size:13px;border-bottom:1px solid #e6d9a8}
main{max-width:1100px;margin:0 auto;padding:16px}.card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:16px;margin:12px 0}
table{width:100%;border-collapse:collapse;font-size:14px}td,th{border-bottom:1px solid var(--line);padding:6px 8px;text-align:left;vertical-align:top}
code,pre{font-family:ui-monospace,Consolas,monospace;font-size:13px}pre{white-space:pre-wrap;background:rgba(127,127,127,.08);padding:10px;border-radius:6px;overflow:auto}
.PASS,.APPROVED,.COMPLIANCE_PASS{color:var(--ok);font-weight:600}.VETO,.COMPLIANCE_VETO,.REJECTED{color:var(--veto);font-weight:600}.ESCALATE,.ESCALATED,.COMPLIANCE_ESCALATED,.WARN{color:var(--warn);font-weight:600}
.tag{display:inline-block;padding:1px 8px;border-radius:999px;border:1px solid var(--line);font-size:12px;margin-right:4px}
button{font:inherit;padding:8px 16px;border-radius:6px;border:1px solid var(--line);cursor:pointer;margin-right:8px}
button.approve{background:var(--ok);color:#fff}button.reject{background:var(--veto);color:#fff}
input,textarea{font:inherit;width:100%;padding:8px;border:1px solid var(--line);border-radius:6px;background:var(--card);color:var(--fg)}
nav a{margin-right:12px}
</style></head><body><header><strong>Bridgestone Reactive Guardrails</strong> — agent simulator &nbsp; <nav style="display:inline"><a href="/${k}">Agents</a><a href="/audit${k}">Audit trail</a></nav></header>
<div class="banner">⚠ ${esc(SIMULATION_LABEL)}. Workfront, AJO and Talon.One are simulated. Nothing here is live.</div><main>${body}</main></body></html>`;
}

export const AGENT_TOOLS: Record<string, { title: string; purpose: string; tools: string[]; cannot: string[] }> = {
  signal: { title: "1 · Signal-to-Audience Agent", purpose: "Detect actionable opportunity, choose strategy, qualify and size the audience, notify dealer.", tools: ["get_weather_alerts", "get_business_signals", "evaluate_opportunity", "compare_strategies", "build_audience", "get_audience", "get_dealer_breakdown", "notify_dealer", "get_dealer_reply"], cannot: ["write copy", "judge compliance", "approve", "stage journeys"] },
  campaign: { title: "2 · Campaign Agent", purpose: "Write localized campaign copy and author its own revisions from Compliance constraints.", tools: ["get_campaign_brief_inputs", "get_brand_voice", "list_approved_claims", "submit_campaign_draft", "get_compliance_feedback"], cannot: ["judge compliance", "approve", "create Workfront records", "stage journeys"] },
  compliance: { title: "3 · Compliance & Guardrails Agent (veto)", purpose: "Referee: audience, offer and claim guardrails. PASS / VETO + constraints / ESCALATE. Never rewrites.", tools: ["get_ruleset", "evaluate_audience_guardrails", "evaluate_offer_guardrails", "evaluate_campaign_claims"], cannot: ["write or edit copy", "approve", "stage journeys"] },
  governance: { title: "4 · Governance & Approval Agent", purpose: "Workfront record, audit trail, human approval routing, stage AJO journey.", tools: ["create_workfront_record", "link_campaign", "log_decision_note", "get_audit_trail", "request_human_approval", "get_approval_status", "record_human_decision", "stage_ajo_journey"], cannot: ["write copy", "judge compliance", "change audiences"] },
};

export function mountWeb(app: Express, opts: { agents: string[]; apiKey?: string; requireKeyForWeb: boolean }) {
  const guard = (req: Request, res: Response, next: NextFunction) => {
    if (!opts.requireKeyForWeb || !opts.apiKey) return next();
    const k = (req.query.key as string) ?? (req.body?.key as string);
    if (k === opts.apiKey) return next();
    res.status(401).send(page("Unauthorized", "<p>Append <code>?key=YOUR_KEY</code> to the URL.</p>"));
  };
  const keyOf = (req: Request) => (opts.requireKeyForWeb ? ((req.query.key as string) ?? (req.body?.key as string)) : undefined);
  const kq = (req: Request) => { const k = keyOf(req); return k ? `?key=${encodeURIComponent(k)}` : ""; };

  app.get("/health", (_req, res) => res.json({ ok: true, agents: opts.agents, label: SIMULATION_LABEL, time: now() }));
  app.get("/agents", (_req, res) => res.json(Object.fromEntries(opts.agents.map((a) => [a, { ...AGENT_TOOLS[a], endpoint: `/${a}/mcp` }]))));

  app.get("/", guard, (req, res) => {
    const base = `${req.headers["x-forwarded-proto"] ?? req.protocol}://${req.headers["x-forwarded-host"] ?? req.get("host")}`;
    const m = dataset().meta;
    const cards = opts.agents.map((a) => {
      const t = AGENT_TOOLS[a];
      return `<div class="card"><h3 style="margin-top:0">${esc(t.title)}</h3><p>${esc(t.purpose)}</p>
<p><strong>MCP endpoint:</strong> <code>${esc(base)}/${a}/mcp</code></p>
<p><strong>Can call:</strong> ${t.tools.map((x) => `<span class="tag">${esc(x)}</span>`).join("")}</p>
<p style="color:var(--muted)"><strong>Cannot:</strong> ${t.cannot.map(esc).join(" · ")}</p></div>`;
    }).join("");
    res.send(page("Agents", `<h2>Agent separation of duties</h2><p>Each agent is an independent MCP server with its own restricted tool list.</p>${cards}
<div class="card"><strong>Synthetic dataset</strong> (seed ${m.seed}, anchor ${esc(m.anchorDate.slice(0, 10))}): ${Object.entries(m.counts).map(([k, v]) => `${esc(k)} ${v.toLocaleString()}`).join(" · ")}</div>`, keyOf(req)));
  });

  const eventsTable = (events: ReturnType<typeof readState>["audit"]) => `<table><tr><th>#</th><th>Time (UTC)</th><th>Agent</th><th>Event</th><th>Summary</th></tr>${events.map((e) =>
    `<tr><td><code>${esc(e.eventId)}</code></td><td>${esc(e.timestamp.replace("T", " ").slice(0, 19))}</td><td><span class="tag">${esc(e.agent)}</span></td><td class="${esc(e.eventType)}">${esc(e.eventType)}</td><td>${esc(e.summary)}</td></tr>`).join("")}</table>`;

  app.get("/audit", guard, (req, res) => {
    const s = readState();
    const recs = Object.values(s.workfront);
    res.send(page("Audit trail", `<h2>Workfront records (simulated)</h2>${recs.length ? `<table><tr><th>Record</th><th>Status</th><th>Campaign</th><th>Audience</th></tr>${recs.map((r) => `<tr><td><a href="/audit/${esc(r.recordId)}${kq(req)}">${esc(r.recordId)}</a></td><td class="${esc(r.status)}">${esc(r.status)}</td><td>${esc(r.campaignId)}</td><td>${esc(r.audienceId)}</td></tr>`).join("")}</table>` : "<p>No records yet.</p>"}
<h2>All events</h2>${eventsTable(s.audit)}`, keyOf(req)));
  });

  app.get("/audit/:recordId", guard, (req, res) => {
    const s = readState();
    const rec = s.workfront[String(req.params.recordId)];
    if (!rec) return void res.status(404).send(page("Not found", "<p>Unknown record.</p>"));
    const pkg = approvalPackage(s, rec);
    res.send(page(rec.recordId, `<h2>${esc(rec.recordId)} — <span class="${esc(rec.status)}">${esc(rec.status)}</span></h2>
<p><a href="/review/${esc(rec.recordId)}${kq(req)}">Open review page →</a></p>
<div class="card"><h3>Audit trail</h3>${eventsTable(relatedEvents(s, rec))}</div>
<div class="card"><h3>Approval package</h3><pre>${esc(JSON.stringify(pkg, null, 2))}</pre></div>`, keyOf(req)));
  });

  app.get("/review/:recordId", guard, (req, res) => {
    const s = readState();
    const rec = s.workfront[String(req.params.recordId)];
    if (!rec) return void res.status(404).send(page("Not found", "<p>Unknown record.</p>"));
    const pkg = approvalPackage(s, rec);
    const v = pkg.finalCopy;
    const rounds = pkg.arbitration.map((r) => `<tr><td>${esc(r.round)}</td><td>v${esc(r.version)}</td><td class="${esc(r.decision)}">${esc(r.decision)}</td><td>${(r.violations as { quotedText: string; reason: string }[]).map((x) => `“${esc(x.quotedText)}” — ${esc(x.reason)}`).join("<br>") || "—"}</td><td>${r.constraints.map(esc).join("<br>") || "—"}</td><td>${r.evidence.map(esc).join("<br>") || "—"}</td></tr>`).join("");
    const canDecide = (rec.status === "PENDING_HUMAN_APPROVAL" || rec.status === "ESCALATED") && !rec.humanDecision;
    res.send(page(`Review ${rec.recordId}`, `<h2>Human review — ${esc(rec.recordId)}</h2><p>Status: <span class="${esc(rec.status)}">${esc(rec.status)}</span></p>
<div class="card"><h3>Audience</h3>${pkg.audience ? `<p>${esc(pkg.audience.market)} · postal ${esc(pkg.audience.postalPrefixes.join(", "))} · <strong>${esc(pkg.audience.strategy)}</strong> · <strong>${esc(pkg.audience.finalCount)}</strong> profiles (simulated)</p><p><em>Rationale:</em> ${esc(pkg.audience.rationale)}</p><table>${pkg.audience.funnel.map((f) => `<tr><td>${esc(f.step)}</td><td><code>${esc(f.rule)}</code></td><td>${esc(f.count)}</td></tr>`).join("")}</table>` : ""}</div>
<div class="card"><h3>Dealer request</h3><p>${esc(pkg.dealer?.request)} <span class="tag">${esc(pkg.dealer?.requestSource)}</span></p></div>
<div class="card"><h3>Arbitration</h3><table><tr><th>Round</th><th>Ver.</th><th>Decision</th><th>Violations</th><th>Constraints</th><th>Evidence</th></tr>${rounds}</table>
<p>Guardrail groups: ${pkg.guardrails.map((g) => `<span class="tag">${esc(g.type)}: <span class="${esc(g.decision)}">${esc(g.decision)}</span></span>`).join("")}</p></div>
<div class="card"><h3>Final copy (v${esc(v?.version)}, ${esc(v?.language)})</h3>${v ? `<p><strong>Subject:</strong> ${esc(v.subject)}</p><p><strong>Headline:</strong> ${esc(v.headline)}</p><pre>${esc(v.body)}</pre><p><strong>CTA:</strong> ${esc(v.cta)}</p>${v.englishTranslation ? `<details><summary>English translation</summary><pre>${esc(v.englishTranslation)}</pre></details>` : ""}` : ""}</div>
<div class="card"><h3>Decision</h3>${rec.humanDecision ? `<p class="${esc(rec.status)}">${esc(rec.humanDecision.decision.toUpperCase())} by ${esc(rec.humanDecision.reviewer)} at ${esc(rec.humanDecision.timestamp)}</p><p>${esc(rec.humanDecision.comment)}</p>` : canDecide ? `
<form method="post" action="/review/${esc(rec.recordId)}${kq(req)}"><p><label>Reviewer name<input name="reviewer" required></label></p><p><label>Comment<textarea name="comment" rows="2"></textarea></label></p>
<button class="approve" name="decision" value="approve">Approve</button><button name="decision" value="amend">Request amend</button><button class="reject" name="decision" value="reject">Reject</button></form>` : `<p>Approval has not been requested yet (status ${esc(rec.status)}).</p>`}</div>`, keyOf(req)));
  });

  app.post("/review/:recordId", guard, (req, res) => {
    const id = String(req.params.recordId);
    const { decision, reviewer, comment } = req.body ?? {};
    const s = readState();
    const rec = s.workfront[id];
    if (!rec || rec.humanDecision || !["approve", "amend", "reject"].includes(decision) || !reviewer) return void res.status(400).send(page("Error", "<p>Invalid or duplicate decision.</p>"));
    if (!(rec.status === "PENDING_HUMAN_APPROVAL" || rec.status === "ESCALATED")) return void res.status(400).send(page("Error", "<p>Approval not requested.</p>"));
    mutate((st) => applyHumanDecision(st, id, decision, String(reviewer), comment ? String(comment) : undefined, "review page"));
    res.redirect(`/review/${id}${kq(req)}`);
  });

  app.get("/dealer/:notificationId", guard, (req, res) => {
    const n = readState().notifications[String(req.params.notificationId)];
    if (!n) return void res.status(404).send(page("Not found", "<p>Unknown notification.</p>"));
    const d = dataset().dealers.find((x) => x.dealerId === n.dealerId);
    res.send(page("Dealer inbox", `<h2>Dealer inbox — ${esc(d?.name)}</h2><div class="card"><p><strong>From:</strong> Signal-to-Audience Agent · ${esc(n.createdAt)}</p><pre>${esc(n.message)}</pre><p>Audience size: <strong>${esc(n.audienceSizeForDealer)}</strong> (simulated)</p></div>
<div class="card"><h3>Reply</h3>${n.reply ? `<pre>${esc(n.reply.text)}</pre><p class="tag">${esc(n.reply.source)} · ${esc(n.reply.receivedAt)}</p>` : `<form method="post" action="/dealer/${esc(n.notificationId)}${kq(req)}"><textarea name="text" rows="4" required>Prepare the winter-readiness campaign for the affected postal codes with the approved local offer. Tell customers that we are cheaper than Competitor X.</textarea><p><button class="approve">Send reply</button></p></form>`}</div>`, keyOf(req)));
  });

  app.post("/dealer/:notificationId", guard, (req, res) => {
    const id = String(req.params.notificationId);
    const text = String(req.body?.text ?? "").trim();
    const n = readState().notifications[id];
    if (!n || n.reply || !text) return void res.status(400).send(page("Error", "<p>Invalid or duplicate reply.</p>"));
    mutate((s) => {
      s.notifications[id].reply = { text, receivedAt: now(), source: "Dealer inbox (typed by a human)" };
      audit(s, { agent: "human", tool: "dealer inbox", eventType: "DEALER_REPLIED", summary: `Dealer ${n.dealerId} replied (typed)`, refs: { notificationId: id, audienceId: n.audienceId, dealerId: n.dealerId }, details: { text } });
    });
    res.redirect(`/dealer/${id}${kq(req)}`);
  });
}
