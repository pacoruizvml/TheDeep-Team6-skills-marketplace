# Bridgestone Reactive Guardrails — Agent Simulator (MCP)

> **SIMULATED.** Synthetic data only. This is not connected to Adobe Experience Platform, Workfront, AJO, CJA or Talon.One. Every tool response carries a `_label` saying so. Keep that label visible in the demo.

There are four independent **MCP servers**, one per agent. Each has its own restricted tool list. Adobe CX Coworker (or any MCP client) acts as the orchestrator.

| Agent | Endpoint | Can do | Cannot do |
|---|---|---|---|
| 1 · Signal-to-Audience | `/signal/mcp` | **`get_external_signals`** (weather + competitor pricing trigger feeds), weather + business signals, opportunity check, Replace vs Swap data, build/size audience, notify dealer, dealer reply | write copy, judge compliance, approve |
| 2 · Campaign | `/campaign/mcp` | brief inputs, brand voice, read claims library, submit drafts/revisions, read veto feedback | judge compliance, approve, stage |
| 3 · Compliance & Guardrails (veto) | `/compliance/mcp` | **`submit_campaign_for_review`** (scripted: 1st VETO, 2nd PASS), ruleset, audience guardrails, offer guardrails, claim evaluation → PASS / VETO + constraints / ESCALATE | write or edit copy, approve, stage |
| 4 · Governance & Approval | `/governance/mcp` | Workfront record (simulated), audit trail, approval request, human decision, stage AJO journey (simulated, never activated) | write copy, judge compliance |

Human-facing pages (same port):

- `/`: agent separation view (who can call what). Show this to judges.
- `/audit` and `/audit/<recordId>`: audit trail with real system timestamps, plus the approval package.
- `/review/<recordId>`: the **human reviewer** clicks Approve / Request amend / Reject.
- `/dealer/<notificationId>`: dealer inbox. A human can type the dealer's reply live.

---

## 1. Run locally

Requires **Node.js 22.9+**.

```bash
npm install
npm start          # all 4 agents on http://localhost:3000
npm run e2e        # (second terminal) drives the full demo flow through MCP and checks every step
npm run reset      # clear runtime state before a fresh demo run
```

`npm run e2e` checks the following:

1. Tool separation.
2. The opportunity: DE, postal 80/81/85/86/70, a competitor winter price cut of 15%.
3. The audience funnel.
4. The dealer's off-policy claim.
5. Round 1 **VETO** on the comparative claim.
6. The revision, then **PASS** with evidence references.
7. Staging is blocked before approval.
8. Human approval on the review page.
9. The journey is **STAGED (not activated)**.
10. The escalation path: 3 non-compliant rounds lead to **ESCALATE**.

## Coworker-driven flow (scripted veto → approval)

This is the fastest demo path. Coworker generates the audience reasoning and the campaign text itself.

1. **Signal-to-Audience → `get_external_signals`** returns the trigger feeds from `src/fixtures/external-signals.json`: 5 WeatherGridAPI records and 3 Competitor Price Monitor alerts. The file is re-read on every call, so you can edit it without restarting. To point at another file, set `EXTERNAL_SIGNALS_FILE`.
2. Coworker decides the opportunity: Munich 80331 has snow, icy roads and severity High, and Competitor X has a winter promotion. Coworker then writes the campaign text. Optionally, `build_audience(market="DE", postalPrefixes=["80"], ...)` gives a sized audience.
3. **Compliance → `submit_campaign_for_review`** takes the subject, headline, body, CTA and language:
   - **First submission → VETO**, with violations and constraints. If the rule engine finds real issues in the text (for example "günstiger als Competitor X"), those are quoted. Otherwise a scripted comparative-price/qualifier veto is returned. No replacement copy is ever given.
   - **Second submission** (same `reviewId`) → **PASS**, with any matched claims-library evidence.
   - If Coworker forgets the `reviewId`, the revision is attached to the open vetoed review.
   - Every verdict is logged with `decisionMode: SCRIPTED_DEMO` in the audit trail.
4. **Governance → `create_workfront_record(campaignId=<reviewId>)` → `request_human_approval`**. The human approves on `/review/<recordId>`. Then `stage_ajo_journey` runs.

Run `npm run reset` before each demo so the first submission is vetoed again.

## 2. Which exposure option? → **Multiplexing (one port)** ✅

**Recommended: one Express app on port 3000 with four endpoints, each tied to its own independent `McpServer` instance.** This is the default (`npm start`).

Why this is better for a hackathon demo behind Dev Tunnels:

- **One port, one tunnel URL.** Only one thing to host and keep alive, with a single hostname in Coworker. The four connectors differ only by path.
- **One process.** There is one terminal to watch, one log (every tool call is printed with its agent name), and one thing to restart if the demo breaks.
- **Separation of duties still holds.** It is enforced by the **tool list on each endpoint**, not by the port. The Campaign endpoint has no evaluation or approval tools. The Compliance endpoint has no copy-writing or approval tools.
- The human pages (review, dealer inbox, audit) live on the same URL.

**Multi-port is supported, but only use it if you need process isolation.** An example is if you want to say "the referee runs as a separate service":

```bash
npm run start:signal       # :3001
npm run start:campaign     # :3002
npm run start:compliance   # :3003
npm run start:governance   # :3004
SPLIT=true npm run e2e
```

> Limitation: agents share state through `runtime/state.json`, so all processes must run on the **same machine** from the same folder.

## 3. Expose with Microsoft Dev Tunnels

Install the CLI: `winget install Microsoft.devtunnel` (Windows) · `brew install --cask devtunnel` (macOS) · `curl -sL https://aka.ms/DevTunnelCliInstall | bash` (Linux).

Use a **persistent, named tunnel** so the URL stays the same between restarts. You configure it in Coworker once.

```bash
devtunnel user login                                  # Microsoft or GitHub account (-g)
devtunnel create bridgestone-mcp --allow-anonymous    # anonymous = Coworker can reach it without a Microsoft login
devtunnel port create bridgestone-mcp -p 3000 --protocol http
devtunnel host bridgestone-mcp                        # keep this running during the demo
```

`devtunnel host` prints the public URL, e.g. `https://bridgestone-mcp-3000.euw.devtunnels.ms`. Your four MCP endpoints are then:

```
https://<tunnel-host>/signal/mcp
https://<tunnel-host>/campaign/mcp
https://<tunnel-host>/compliance/mcp
https://<tunnel-host>/governance/mcp
```

**Secure it:** because the tunnel is anonymous, set a shared secret before hosting:

```bash
# PowerShell:  $env:MCP_API_KEY="choose-a-long-random-string"; npm start
# bash/zsh:    MCP_API_KEY=choose-a-long-random-string npm start
# or put MCP_API_KEY=... in a .env file (see .env.example)
```

Clients then send `Authorization: Bearer <key>`, or `x-api-key: <key>`. If the client only accepts a URL, append `?key=<key>` instead. Set `REQUIRE_KEY_FOR_WEB=true` to protect the review and dealer pages too. Then open them with `?key=<key>`.

Multi-port variant: `devtunnel port create bridgestone-mcp -p 3001` (repeat for 3002–3004), then `devtunnel host bridgestone-mcp`. Each port gets its own hostname (`…-3001…`, `…-3002…`).

Check it through the tunnel: `BASE_URL=https://<tunnel-host> MCP_API_KEY=<key> npm run e2e`.

Notes:

- Dev Tunnels shows a browser anti-phishing interstitial on first visit to the web pages. Click through once. Non-browser MCP clients are not affected. If a client is affected, it can send the header `X-Tunnel-Skip-AntiPhishing-Page: true`.
- Transport is **MCP Streamable HTTP**, stateless, with JSON responses (POST only; GET returns 405). If Coworker's connector only supports the legacy SSE transport, it will not connect. Tell me and I'll add an SSE endpoint.
- The demo runs from your laptop: keep it awake and plugged in, and record a backup run.

## 4. Connect in Coworker

Add four MCP connections, one per endpoint above, with the API key header. Then give each Coworker sub-agent **only its own connection**. Suggested sub-agent instructions and an orchestration runbook are in [`docs/coworker-agent-prompts.md`](docs/coworker-agent-prompts.md).

## 5. The synthetic data

The data is generated at boot from a fixed seed, so the counts are identical every run:

- 12,000 DE and 5,000 BE profiles.
- Vehicle/tyre records and about 39k interaction events.
- Business signals: competitor price, inventory, demand, dealer capacity.
- Weather alerts.

Field names mirror the real sandbox schema (`postalCode`, `severity`, `snowProbability`, `competitorPrice`, `currentPrice`, `dealerId`, `dealerCapacity`, `replacementDue`, `tyreSeason`, `recommendedProduct`, `quoteRequested`, `purchaseCompleted`, `productViewed`, `marketingConsent`).

The built-in scenario: a severe snow alert in Bavaria and Stuttgart; Competitor X cut its winter tyre by 15% two days ago (a directly comparable product). There is also an older all-season cut that is ignored as stale, and a BE all-season cut that is only partially relevant. Winter inventory is available for SYN-WIN-A and constrained for SYN-WIN-B, and winter demand is rising.

Products, dealers, claims, evidence IDs, offers and thresholds are all **synthetic demo configuration**. They are in `src/lib/data.ts` and `src/lib/rules.ts`. Run `npm run export-data` to dump the dataset to JSON.

## 6. How Compliance decides

The decision is deterministic and does not depend on an LLM:

1. Split the copy into sentences.
2. Detect claim types with DE and EN patterns: comparative, superiority, absolute price, safety, performance, environmental, offer, availability.
3. Look each sentence up in the synthetic claims library, which holds active and expired entries with required qualifiers.
4. Comparative, superiority and absolute-price claims → **VETO**.
5. Other claim sentences that don't match an active library entry → **VETO**.
6. A matched claim that is missing a required qualifier → **VETO**.
7. At round 3 → **ESCALATE**.

Compliance returns **reasons and constraints only, never replacement wording**. The Campaign Agent authors every revision. The LLM may pass the claims it extracted itself (`llmExtractedClaims`); they are logged for comparison but do not change the decision.

## 7. Project layout

```
src/server.ts            Express host (multiplexed by default, --agent/--port for split mode)
src/agents/*.ts          one McpServer per agent (tool definitions)
src/lib/data.ts          seeded synthetic dataset
src/lib/rules.ts         synthetic ruleset, claims library, offers, thresholds, claim detection
src/lib/store.ts         shared file-backed state + automatic audit log
src/web.ts               agent view, audit trail, review page, dealer inbox
scripts/e2e.ts           end-to-end MCP test (plays the orchestrator)
docs/coworker-agent-prompts.md
```
