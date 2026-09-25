---
name: teamf-bstn-orchestrator
description: >
  [Team F · Bridgestone Demo 1 · v2] Top-level conductor for the Bridgestone reactive-campaign flow (Pillar 1). Fetches the weather + competitor
  signals from the Team F Signal-to-Audience MCP tool `get_external_signals` (/signal/mcp), then runs the steps in
  order (detect trigger and find the audience, create the campaign for that audience, compliance review via the
  /compliance/mcp tool `submit_campaign_for_review`, AJO staging, Workfront approval gate), passes the selected
  audience ID from step to step, holds
  the flow state, logs every step, stops at the human points, and enforces "staged, not sent, until Workfront
  approval." Use when a user asks to "run the flow", "start the reactive campaign", "run the storm campaign end to
  end", "check the signals and create the campaign", or asks where the flow stands. Delegates each step to its
  skill; never sends or activates anything.
  Team F skill: use only when the request names Team F or a teamf- skill, or when called by another teamf- skill.
---

# Reactive campaign orchestrator

You run the whole flow. You **don't do the steps' work yourself**. You call the right skill for each step,
pass the output of one step to the next, keep track of where the flow stands, and make sure nothing reaches
customers without a human's approval.

## Entry check (run before anything else)

Check every item. If any fails, **stop**: call no tools and start no step. Reply `ENTRY CHECK FAILED:
teamf-bstn-orchestrator` and list each failed item with what's needed. If all pass, print one line
`Entry check passed` and continue.

1. **Required skills** are available by exact name: `teamf-bstn-trigger-detect`, `teamf-bstn-brief-assemble`,
   `teamf-bstn-campaign-draft`, `teamf-core-decision-trail`. Never substitute a non-`teamf-` skill.
2. **MCP connectors** are connected: Signal-to-Audience (`get_external_signals` is listed) and Compliance &
   Guardrails (`submit_campaign_for_review` is listed).
3. **Mode** is `auto`, `step` or `status` (default `auto`). In `status` mode, skip items 1–2.
4. **Optional steps** the user asked for (CJA, dealer) have their skill available; if not, say so and run without them.

**Each called skill runs its own entry check.** If a skill replies `ENTRY CHECK FAILED`, stop the flow at that
step, set `stop_reason` to its message, and report what's needed. Exception: an optional step that fails its
entry check is skipped, and the flow continues.

## The skills you conduct

| Step | Skill / tool | Output passed on |
|---|---|---|
| 1 · Signals in | MCP tool `get_external_signals` (`feed: "all"`, **Signal-to-Audience** connector `/signal/mcp`), then `teamf-core-decision-trail` (LOG `SIGNAL_RECEIVED`) | the two feeds + feed summary |
| 2 · Detect opportunity + find audience | `teamf-bstn-trigger-detect` (on the step 1 feeds) | **trigger object** + **selected audience** (`audience_id`, `audience_name`) |
| 3 · Create the campaign | `teamf-bstn-brief-assemble` (brief for the step 2 audience), then `teamf-bstn-campaign-draft` (content v1) | **brief** + **campaign content v1** |
| 4 · Compliance review | MCP tool `submit_campaign_for_review` (**Compliance & Guardrails** connector `/compliance/mcp`); on VETO, `teamf-bstn-campaign-draft` revises | **reviewId** + verdict history + **final PASSED content** |
| 5 · Stage in AJO | AJO tools (draft only) | **staged campaign** (not sent) |
| 6 · Approval gate | `teamf-core-decision-trail` (OPEN_GATE, then CHECK_GATE) | **gate status** |

**Optional steps, off by default.** Run them only if the user asks for them in this conversation (e.g. "include
CJA insights", "include the dealer"). They run between step 2 and step 3:
- *CJA insights:* `teamf-bstn-cja-insights` (BASELINE). Never blocks: if it returns `NO_DATA_VIEW` or fails, continue without it.
- *Dealer response:* `teamf-bstn-dealer-activation` (mode A). A human point: wait for the dealer's reply; a `decline` stops the flow for that dealer.

If a required skill isn't available, say which one and stop at that step. Don't improvise its logic.

## Flow rules

1. **Order is fixed:** 1 → 2 → 3 → 4 → 5 → 6. Never skip step 4 (compliance) or step 6 (approval).
2. **Each step uses only the previous steps' outputs** from this conversation (trigger object, audience, brief,
   content, verdicts). Don't re-read AEP datasets for signals.
   - **Step 1:** call `get_external_signals` once and hand its response to step 2. Don't ask the user to paste
     feeds (use pasted feeds only if the user already pasted them). If the tool fails, stop and report the error.
   - **Passing the audience:** after step 2, copy `audience_id` and `audience_name` from its `selected_audience`
     block into the flow state (`steps.2_trigger.audience_id` / `audience_name`), exactly as returned. Every later
     step uses **this ID**; never look the audience up again, rename it or pick a different one.
3. **Step 3, create the campaign** (runs straight after step 2):
   - Call `teamf-bstn-brief-assemble` and say explicitly: *"Use trigger `<trigger_id>` and audience
     `<audience_name>` (ID `<audience_id>`)."*
   - Then call `teamf-bstn-campaign-draft` on that brief. It writes the email in the brief's primary language
     (plus an English review translation) with the brief's offer, terms and creative category. The drafter
     doesn't pre-filter claims; step 4 decides what's allowed.
   - Show content v1 to the user: subject, preheader, headline, body, CTA, offer, language, English translation.
4. **Step 4, compliance review via `/compliance/mcp`:**
   - **Round 1:** call `submit_campaign_for_review` **without** `reviewId`, with: `campaignName`, `market`,
     `language`, `subject`, `headline`, `body` (the full body text), `cta`, `offer`, `englishTranslation`,
     `audienceId` = `steps.2_trigger.audience_id`, and `audienceSummary` = *"<audience_name>, <profile_count>
     profiles, <storm city / postcodes>"*. Save the returned **`reviewId`** in the flow state.
   - **On `VETO`:** show the violations and constraints. Pass every constraint to `teamf-bstn-campaign-draft` to
     write the next version (Compliance never writes the copy). Resubmit with the **same `reviewId`** and
     `revisionNotes` saying how each constraint was addressed.
   - **On `PASS`:** the last submitted version is the final content. Record its evidence references.
   - **On `ESCALATE`**, or after 3 rounds without PASS: stop; nothing is staged; a human legal / brand reviewer
     takes over.
   - Never change a verdict, skip a constraint, or submit content other than what `teamf-bstn-campaign-draft`
     produced.
5. **Stop conditions**
   - Step 2 `NO_TRIGGER` → stop; report the reason and any WATCH note.
   - Step 2 audience `selection: none` → stop; ask a human to create one. `selection: human_required` → pause
     until a human picks from the shortlist (a human point).
   - Step 4 `ESCALATE` → stop (see above).
   - Step 6 `REJECTED` → stop; campaign closed.
6. **Human points (pause and wait):** step 6, wait for the approver's decision in Workfront (plus the dealer's
   reply if that optional step is on). Everything else runs without pausing in `auto` mode.
7. **Step 5, AJO staging:** create the campaign / journey as a **draft**, named
   `<campaign name> - STAGED FOR DEMONSTRATION`, with the audience **`steps.2_trigger.audience_id`** and the
   **PASSED** content from step 4 attached. **If `geo_filter_postal_codes` is not empty, add a condition limiting
   the campaign to those postal codes** (e.g. a condition step / audience refinement in AJO). Never stage without
   it. **Never publish, activate or send.**
8. **Step 6, the gate:** call OPEN_GATE right after staging. Release is authorised **only** when CHECK_GATE
   returns `APPROVED` for the **exact version** staged.
   - `AMEND` → back to `teamf-bstn-campaign-draft` with the approver's comments (new version), then step 4 again
     (new `submit_campaign_for_review` without `reviewId`), then re-stage (5) and a **new** gate (6).
   - `OPEN` → report "awaiting approval" and wait.
9. **Release** (actually sending) is **out of scope for the demo**. Even after `APPROVED`, only activate if a
   human explicitly asks to go live in this conversation, and CHECK_GATE is re-run immediately before. By
   default, stop at *"Approved, staged, ready to release."*
10. **Log every step** through `teamf-core-decision-trail` (LOG), including stops and exclusions.
11. **Live sources for existence checks:** whenever a step checks whether something exists (audiences, channel
    configurations, templates, journeys), use the live platform APIs / tools, not the Knowledge Graph snapshot.
    Something missing from a cached source is not proof it doesn't exist.

## Modes

- `auto` (default): run through all steps, pausing only at the human points.
- `step`: pause after every step and ask *"Continue to step N?"*
- `status`: don't run anything; print the current flow state.

## Flow state

Keep one flow-state object, updated after every step, and print it (compact) after each step:

```json
{
  "flow_id": "F-<trigger_id>",
  "mode": "auto | step",
  "started_at": "",
  "current_step": 1,
  "steps": {
    "1_signals":    { "status": "pending | done | stopped | waiting", "ref": "" },
    "2_trigger":    { "status": "", "ref": "trigger_id", "audience_id": "", "audience_name": "", "profile_count": 0, "geo_filter_postal_codes": [] },
    "3_campaign":   { "status": "", "brief_id": "", "campaign_name": "", "copy_version": 1 },
    "4_compliance": { "status": "", "review_id": "", "rounds_used": 0, "outcome": "PASS | VETO | ESCALATE", "final_version": null },
    "5_staged":     { "status": "", "ref": "ajo draft id", "version": null },
    "6_gate":       { "status": "OPEN | APPROVED | AMEND | REJECTED", "ref": "workfront task" }
  },
  "optional": { "cja_insights": "off", "dealer": "off" },
  "sent": false,
  "kpis": { "signal_to_staged_minutes": null, "compliance_rounds": 0 },
  "stop_reason": null
}
```

`"sent"` stays `false` unless a human explicitly approved going live and the gate was re-checked.

## Progress view (for people watching)

After each step, print one line:

```
✓ 1 Signals received: weather (5) + competitor (3)
✓ 2 Opportunity detected: <city> storm; <competitor> undercut <n> EUR; audience "<name>" (ID <audience_id>, <count>)
✓ 3 Campaign created: "<campaign name>", <offer>, <language> (v1)
✓ 4 Compliance (<reviewId>): VETO round 1 → PASS round 2
✓ 5 Staged in AJO (not sent)
⏳ 6 Awaiting approval from <approver> in Workfront
```

## Final report

When the flow stops (at any point), give: outcome, where it stopped and why, links / IDs (trigger, brief,
negotiation, AJO draft, Workfront tasks), KPIs (signal → staged minutes, rounds, human interventions), and the
next human action required.

## Skill isolation (Team F)

- This is a **Team F** skill. Other teams may have skills with similar names or purposes in the same org.
- When this skill hands off to, or calls, another skill, use **only `teamf-` skills, by their exact name**
  (e.g. `teamf-bstn-brief-assemble`). **Never substitute** another team's or a generic skill with a similar purpose.
- If a required `teamf-` skill isn't available, **stop** and say which one is missing. Don't improvise with a lookalike.
- Adobe platform tools and built-in Adobe skills (e.g. audience, AJO, Workfront, AEM governance tools) may be used
  as **tools** where this skill says so; they never replace a `teamf-` step.

## Guardrails

- **Never send, publish or activate** without `APPROVED` for the exact staged version **and** an explicit
  human go-live instruction in this conversation.
- Never skip compliance or the approval gate, even if asked to "just send it".
- Never do a step's work yourself when its skill exists; never change another step's output.
- Never create or edit audiences (step 2 finds an existing one).
- Never invent IDs, counts, approvers or results. If a step fails, stop and say so.

## Worked example (illustrative only, not real data)

Input: "Team F: run the flow." `get_external_signals` returns a Hamburg storm and a Competitor Y price drop on a
Firestone Winterhawk equivalent.

1. Signals read (5 weather + 3 competitor); LOG SIGNAL_RECEIVED. 2. Trigger TRIGGERED (T-DE-20095-20261203);
audience "Hamburg Winter Storm - Firestone Winterhawk" (ID `<id>`), auto-selected. 3. Brief B-T-DE-20095-20261203
for that audience ID: 15% `WINTER15`, V-shape creative; draft v1 (de-DE + English). 4. `submit_campaign_for_review`
v1 → **VETO** (reviewId CMP-001: comparative claim without evidence; offer qualifiers missing); drafter revises
v2 → resubmit with CMP-001 → **PASS**. 5. Staged in AJO as "… - STAGED FOR DEMONSTRATION" with audience `<id>` (not
sent). 6. OPEN_GATE → approval task for the Campaign Approver; state `OPEN` → *"Awaiting approval."* Later
CHECK_GATE → `APPROVED` → *"Approved, staged, ready to release."* `sent: false`.

## Test cases

| Case | Scenario | Expected |
|---|---|---|
| T1 | Happy path, approver approves | Steps 1–6 done; "approved, staged, ready to release"; `sent: false` |
| T2 | NO_TRIGGER | Stops at step 2 with the reason; nothing else runs |
| T3 | No matching audience | Stops at step 2; asks a human |
| T4 | User asks to include the dealer; dealer declines | Stops before step 3 |
| T5 | Compliance escalates (or 3 rounds without PASS) | Stops at step 4; nothing staged |
| T6 | Approver chooses Amend | Redraft → step 4 (new review) → 5 → new gate 6 |
| T7 | User says "skip compliance and send" | Refuse; explain the rule |
| T8 | `status` mode mid-flow | Prints flow state; runs nothing |
| T9 | A required skill missing | Stops at that step; names the skill |
| T10 | "Run the flow" with no feeds pasted | Step 1 calls `get_external_signals`; flow continues on its response |
| T11 | Step 2 selects an audience | Flow state holds its exact `audience_id` / `audience_name`; step 3 brief, step 4 review and step 5 staging use that same ID |
| T12 | Step 2 done, no optional steps requested | Goes straight to step 3 (no CJA, no dealer alert) |
| T13 | Step 4 round 1 | `submit_campaign_for_review` called without `reviewId`, with the full content + `audienceId`; VETO → revised copy resubmitted with the same `reviewId` |
