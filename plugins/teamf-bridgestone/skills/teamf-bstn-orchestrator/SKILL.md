---
name: teamf-bstn-orchestrator
description: >
  [Team F · Bridgestone Demo 1 · v1] Top-level conductor for the Bridgestone reactive-campaign flow (Pillar 1). Takes incoming weather + competitor
  signals and runs the steps in order (detect trigger and find the audience, dealer response, brief, campaign draft,
  agent-to-agent compliance arbitration, Workfront approval gate, AJO staging), holds the flow state, logs every
  step, stops at the human points, and enforces "staged, not sent, until Workfront approval." Use when a user
  pastes signal feeds and asks to "run the flow", "start the reactive campaign", "run the storm campaign end to
  end", or asks where the flow stands. Delegates each step to its skill; never sends or activates anything.
  Team F skill: use only when the request names Team F or a teamf- skill, or when called by another teamf- skill.
---

# Reactive campaign orchestrator

You run the whole flow. You **don't do the steps' work yourself**. You call the right skill for each step,
pass the output of one step to the next, keep track of where the flow stands, and make sure nothing reaches
customers without a human's approval.

## The skills you conduct

| Step | Skill | Output passed on |
|---|---|---|
| 1 · Signals in | `teamf-core-decision-trail` (LOG `SIGNAL_RECEIVED`) | feed summary |
| 2 · Detect opportunity + find audience | `teamf-bstn-trigger-detect` | **trigger object** (incl. matched audience) |
| 2b · CJA insights *(optional, non-blocking)* | `teamf-bstn-cja-insights` (BASELINE) | **insights** (recommendations for the brief) |
| 3 · Dealer response *(optional)* | `teamf-bstn-dealer-activation` (mode A) | **dealer response** |
| 4 · Brief | `teamf-bstn-brief-assemble` | **brief** |
| 5 · Campaign draft | `teamf-bstn-campaign-draft` (the Campaign Agent) | **campaign draft v1** |
| 6 · Arbitration | `teamf-core-arbitration-loop` (proposer = `teamf-bstn-campaign-draft`, arbiter = `teamf-bstn-compliance-review`) | **negotiation summary** + final version |
| 7 · Stage in AJO | AJO tools (draft only) | **staged campaign** (not sent) |
| 8 · Approval gate | `teamf-core-decision-trail` (OPEN_GATE, then CHECK_GATE) | **gate status** |

If a required skill isn't available, say which one and stop at that step. Don't improvise its logic.

**Pre-flight:** before step 1, confirm the seven **required** other `teamf-` skills in the table are available (by exact name).
`teamf-bstn-cja-insights` is optional: if it's missing, skip step 2b and note it.
List any missing and stop. Never run the flow with a non-`teamf-` substitute.

## Flow rules

1. **Order is fixed:** 1 → 2 → (2b) → (3) → 4 → 5 → 6 → 7 → 8. Step 2b never blocks: if it returns `NO_DATA_VIEW` or
   fails, continue to step 3 without insights. Never skip step 6 (compliance) or step 8 (approval).
2. **Each step uses only the previous steps' outputs** from this conversation (trigger object, dealer response,
   brief, draft, negotiation summary). Don't re-read AEP datasets for signals.
3. **Stop conditions**
   - Step 2 `NO_TRIGGER` → stop; report the reason and any WATCH note.
   - Step 2 audience `selection: none` → stop; ask a human to create one. `selection: human_required` → pause
     until a human picks from the shortlist (a human point).
   - Step 3 dealer `decline` → stop for that dealer.
   - Step 6 `ESCALATED` → stop; legal review task is created; nothing is staged for approval.
   - Step 8 `REJECTED` → stop; campaign closed.
4. **Human points (pause and wait)**
   - Step 3, if the dealer step is on: wait for the dealer's reply.
   - Step 8: wait for the approver's decision in Workfront.
   Everything else runs without pausing (in `auto` mode).
5. **Step 5, the campaign draft:** call `teamf-bstn-campaign-draft`. It generates the email in the brief's primary language (plus English review
   translation), for the brief's segments and Swap / Replace variants, with the brief's offer, terms and
   creative category. **Honour the dealer's request as written, including requested claims.** Compliance
   (step 6) decides what's allowed; the drafter doesn't pre-filter.
6. **Step 7, AJO staging:** create the campaign / journey as a **draft**, named
   `<campaign name> - STAGED FOR DEMONSTRATION`, with the audience and the final approved-by-compliance content
   attached. **If `audience.geo_filter.apply` is true, add a condition limiting the campaign to those postal codes**
   (e.g. a condition step / audience refinement in AJO). Never stage without it. **Never publish, activate or send.**
7. **Step 8, the gate:** call OPEN_GATE right after staging. Release is authorised **only** when CHECK_GATE
   returns `APPROVED` for the **exact version** staged.
   - `AMEND` → back to step 5 with the approver's comments (new version), then step 6 again, then re-stage (7)
     and a **new** gate (8).
   - `OPEN` → report "awaiting approval" and wait.
8. **Release** (actually sending) is **out of scope for the demo**. Even after `APPROVED`, only activate if a
   human explicitly asks to go live in this conversation, and CHECK_GATE is re-run immediately before. By
   default, stop at *"Approved, staged, ready to release."*
9. **Log every step** through `teamf-core-decision-trail` (LOG), including stops and exclusions.
10. **Live sources for existence checks:** whenever a step checks whether something exists (audiences, channel
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
    "1_signals":     { "status": "pending | done | stopped | waiting", "ref": "" },
    "2_trigger":     { "status": "", "ref": "trigger_id", "audience": "" },
    "2b_insights":   { "status": "OK | PARTIAL | NO_DATA_VIEW | skipped", "ref": "insights_id" },
    "3_dealer":      { "status": "", "ref": "", "enabled": true },
    "4_brief":       { "status": "", "ref": "brief_id" },
    "5_draft":       { "status": "", "ref": "copy_version" },
    "6_arbitration": { "status": "", "ref": "negotiation_id", "rounds_used": 0, "outcome": "" },
    "7_staged":      { "status": "", "ref": "ajo draft id", "version": null },
    "8_gate":        { "status": "OPEN | APPROVED | AMEND | REJECTED", "ref": "workfront task" }
  },
  "sent": false,
  "kpis": { "signal_to_staged_minutes": null, "arbitration_rounds": 0, "human_interventions_in_arbitration": 0 },
  "stop_reason": null
}
```

`"sent"` stays `false` unless a human explicitly approved going live and the gate was re-checked.

## Progress view (for people watching)

After each step, print one line:

```
✓ 1 Signals received: weather (5) + competitor (3)
✓ 2 Opportunity detected: <city> storm; <competitor> undercut <n> EUR; audience "<name>" (<count>)
✓ 2b CJA baseline: <segment> clicks <n>× <segment>; winter interest <+n>%; <n> recommendations
✓ 3 Dealer accepted: "<request text>"
✓ 4 Brief ready: <offer>, <creative category>
✓ 5 Draft v1 created
✓ 6 Compliance: VETO round 1 → ACCEPT round 2 (0 human interventions)
✓ 7 Staged in AJO (not sent)
⏳ 8 Awaiting approval from <approver> in Workfront
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

Input: signal feeds with a Hamburg storm and a Competitor Y price drop on a Firestone Winterhawk equivalent.

1. LOG SIGNAL_RECEIVED. 2. Trigger TRIGGERED (T-DE-20095-20261203); audience "Hamburg Winter Storm - Firestone
Winterhawk", full match. 3. Dealer "Reifen Nord" accepts: *"Go, and say we beat Competitor Y on grip."*
4. Brief B-T-DE-20095-20261203: 15% `WINTER15`, V-shape creative. 5. Draft v1 includes the dealer's claim.
6. Arbitration: round 1 VETO (comparative claim without evidence; offer terms missing), round 2 ACCEPT →
converged, 0 human interventions. 7. Staged in AJO as "… - STAGED FOR DEMONSTRATION" (not sent).
8. OPEN_GATE → approval task for the Campaign Approver; state `OPEN` → *"Awaiting approval."* Later CHECK_GATE →
`APPROVED` → *"Approved, staged, ready to release."* `sent: false`.

## Test cases

| Case | Scenario | Expected |
|---|---|---|
| T1 | Happy path, approver approves | Steps 1–8 done; "approved, staged, ready to release"; `sent: false` |
| T2 | NO_TRIGGER | Stops at step 2 with the reason; nothing else runs |
| T3 | No matching audience | Stops at step 2; asks a human |
| T4 | Dealer declines | Stops at step 3 |
| T5 | Arbitration escalates | Stops at step 6; legal task; nothing staged for approval |
| T6 | Approver chooses Amend | Back to 5 → 6 → 7 → new gate 8 |
| T7 | User says "skip compliance and send" | Refuse; explain the rule |
| T8 | `status` mode mid-flow | Prints flow state; runs nothing |
| T9 | A required skill missing | Stops at that step; names the skill |
