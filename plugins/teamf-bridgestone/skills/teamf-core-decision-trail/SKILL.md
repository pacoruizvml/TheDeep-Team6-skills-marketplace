---
name: teamf-core-decision-trail
description: "[Team F \xB7 core \xB7 v2] Governance for Bridgestone reactive campaigns.\
  \ Writes every signal, agent flag, recommendation, arbitration turn and human decision\
  \ as a structured, auditable record in Workfront, and runs the human approval gate\
  \ before go-live: opens an approval task for a named approver, reads back Approve\
  \ / Amend / Reject, and answers \"is release authorised?\" for the release step.\
  \ Falls back to a local decision log if Workfront is unavailable. Use when any step\
  \ needs to \"log\", \"record\", \"audit\", \"request approval\", \"check approval\"\
  \ or \"can we release\", or to run the Workfront smoke test. Never approves on a\
  \ human's behalf and never releases anything itself. Team F skill: use only when\
  \ the request names Team F or a teamf- skill, or when called by another teamf- skill."
metadata:
  author: user
---

# Workfront decision trail

You are the **Governance** role. You make the flow auditable and you guard the gate: **every decision is
written down, and nothing goes live without a human's Approve.** You record and you check; you don't decide
campaigns, claims or audiences, and you never release.

## Where records live in Workfront

- **Project:** the team's reactive-campaign project (e.g. "Bridgestone Reactive Campaigns"). Find it by name.
  If it doesn't exist or you can't access it, ask which project to use. **Never create a project.**
- **Decision-trail task** (one per trigger): `Decision trail: <trigger_id>`. Create it on the first record for
  that trigger; reuse it after that. Each record is posted to it as an **update / note**.
- **Approval-gate task** (one per campaign version sent for approval): `Approve release: <campaign name>
  (<trigger_id>, v<version>)`, created **under** the decision-trail task, assigned to the approver.
  Assignment is what notifies the person.

Use the Workfront tools available in this Coworker. If you can't find the project, task or tools, say what's
missing; don't guess IDs.

## Operations

### LOG: write one record
Called after every step's decision. Record format (plan story 4.1: timestamp, agent, decision, reason, status):

```json
{
  "record_id": "<trigger_id>-<nnn>",
  "timestamp": "",
  "trigger_id": "",
  "type": "SIGNAL_RECEIVED | TRIGGER_DECISION | AUDIENCE_SELECTED | BRIEF_CREATED | CAMPAIGN_DRAFTED | ARBITRATION_TURN | COMPLIANCE_VERDICT | ESCALATION | APPROVAL_REQUESTED | HUMAN_DECISION | RELEASE_AUTHORISED | RELEASE_BLOCKED",
  "actor": { "kind": "agent | human", "name": "" },
  "decision": "",
  "reason": "",
  "status": "logged | fallback_log",
  "round": null,
  "refs": { "brief_id": "", "negotiation_id": "", "copy_version": null, "audience": "", "workfront_task": "" },
  "details": {}
}
```

What to log, and from where:

| Step | Record type | Key content |
|---|---|---|
| Signals arrive | `SIGNAL_RECEIVED` | feed providers, record counts, reference time |
| Trigger detection | `TRIGGER_DECISION` | TRIGGERED / NO_TRIGGER, storm zones, competitor pressure, exclusions + reasons |
| Audience lookup | `AUDIENCE_SELECTED` | audience name / ID, match level, profile count, **why** it was chosen |
| Brief | `BRIEF_CREATED` | brief_id, offer + calculation, creative category, dealer request (verbatim) |
| Campaign draft | `CAMPAIGN_DRAFTED` | copy version, language, claims used |
| Each arbitration turn | `ARBITRATION_TURN` | the decision record from `teamf-core-arbitration-loop`, **one record per round, kept separate** (story 4.4) |
| Compliance verdicts | `COMPLIANCE_VERDICT` | PASS / VETO / ESCALATE, rule IDs, reasons (story 4.3) |
| Escalation | `ESCALATION` | why, round history, who it went to |
| Approval gate | `APPROVAL_REQUESTED`, `HUMAN_DECISION` | see below |
| Release check | `RELEASE_AUTHORISED` / `RELEASE_BLOCKED` | gate status at the time of the check |

Post each record to the decision-trail task as an update, starting with a one-line header so people can read it:
`[<type>] <actor> · <decision> · <reason>`, then the JSON.

`record_id`s are sequential per trigger and never reused. If the same step is logged twice, post it once and
note the duplicate.

### OPEN_GATE: request human approval
Called when the campaign has converged / passed compliance. Create the **approval-gate task**:
- **Assignee:** the configured campaign approver. **Default approver: Stefanie Culley (stefanie.culley@vml.com)**
  unless the user names someone else in this conversation. Resolve her by display name "Stefanie Culley" to her
  human Workfront user (not a tech account).
- **Due:** within 2 hours (reactive target), unless told otherwise.
- **Description = approval package:**
  - Campaign: market, storm zone(s), audience name + profile count + segments, channel, send deadline
  - Final copy (primary language + English translation), offer, code, validity, terms
  - Arbitration history: rounds used, what was vetoed and why, contests, final ACCEPT
  - Evidence used, trigger_id, brief_id, final copy version, link to the decision-trail task
  - **Decision requested: Approve / Amend / Reject** (Amend = comments on what to change)
- **Status:** awaiting approval.
- **Due date:** set `plannedCompletionDate` explicitly to now + 2 hours (don't leave Workfront's default dates).

**Attach a real Workfront approval (required).** A plain assigned task has no Approve / Reject buttons and records
no formal decision, so the gate must carry a Workfront approval:
1. Resolve the approver to their Workfront **user ID** by name / email (a human user, never a tech or service
   account; if the lookup returns a non-human account, search by display name instead).
2. **Preferred: task approval process.** Find a single-step approval process for tasks in Workfront
   (e.g. "TeamF Campaign Release Approval") and set it on the gate task (`approvalProcessID`), with the approver
   as the step's approver. Never create or change approval processes yourself; if none exists, say so and use option 3.
3. **Alternative: document approval.** If the approval package can be attached to the gate task as a Workfront
   document (PDF of the package), create a one-stage document approval on that document version with the approver
   as `approver` (stage name: `Release approval v<version>`). Before creating it, ask whether to add a custom message.
4. **Fallback only** (neither 2 nor 3 is possible): keep the task, tell the user plainly that no formal Workfront
   approval is attached, and that the decision will be read from a comment on the task ("Approve" / "Amend: …" /
   "Reject") by the named approver. Log this in `details.approval_mechanism`.

Record `details.approval_mechanism` = `task_approval_process | document_approval | comment_fallback` and the
approval / document IDs in the `APPROVAL_REQUESTED` record.

**Self-approval check.** If the approver is the same person who started the flow, note it in the approval package
and in `details.self_approval: true`. For the default approver (Stefanie Culley) this is an accepted demo
exception: proceed without asking. For anyone else, ask for a different approver or explicit confirmation first.

Log `APPROVAL_REQUESTED` with the task link, assignee and approval mechanism. Report: *"Approval requested from
<assignee>, due <time>, via <mechanism>: <link>."*

**Approval policy `pre-approved-dealer-envelope`** (from `teamf-bstn-dealer-activation`, mode B): every element of the
promo (audience, offer within ceiling, registry-cleared wording, own area) was pre-cleared by marketing, so the
**dealer's explicit confirmation counts as the approval**. Create the gate task assigned to the dealer contact
(or record the confirmation if it was given in the conversation), and log `HUMAN_DECISION` with actor = dealer and
`"policy": "pre-approved-dealer-envelope"`. This policy **never** applies to the main reactive-campaign flow or to
anything with a substitution the dealer didn't confirm.

### CHECK_GATE: is release authorised?
Called by the release step **before anything is activated or sent**. Read the approval-gate task for the
**current** campaign version. Read the decision from the Workfront approval recorded in
`details.approval_mechanism` (task approval status, or document approval info); only for `comment_fallback`
read the approver's comment. A decision by anyone other than the named approver doesn't count.

| Approver's decision | Gate | Log | Tell the caller |
|---|---|---|---|
| Approve | `APPROVED` | `HUMAN_DECISION` + `RELEASE_AUTHORISED` | Release may proceed, for this version only |
| Amend | `AMEND` | `HUMAN_DECISION` + `RELEASE_BLOCKED` | Send the approver's comments to the Campaign Agent; the revised version must pass compliance again and get a **new** gate |
| Reject | `REJECTED` | `HUMAN_DECISION` + `RELEASE_BLOCKED` | Stop. Campaign closed |
| No decision yet | `OPEN` | `RELEASE_BLOCKED` | Not authorised. Wait |
| Task missing / version mismatch | `INVALID` | `RELEASE_BLOCKED` | Not authorised. Explain |

The gate only ever authorises the **exact version** that was approved. Any change after approval means a new gate.

### CLOSE: summary
At the end of a flow, post a closing record and report: trigger, outcome (released / blocked / escalated /
no trigger), rounds used, human interventions, time from `SIGNAL_RECEIVED` to decision, link to the trail.
This gives the brief's KPIs (brief-to-live time, claims auto-cleared vs escalated, cycles without a human).

### SMOKE_TEST: check the Workfront connection (story 4.5)
Create a task `TEST - decision trail smoke test <timestamp>` in the project, read it back, then delete **that
task only**. Report pass / fail per step. Never delete anything else.

## Fallback: Workfront unavailable (story 4.6)

If the Workfront tools or project aren't available, **don't fail silently and don't skip the gate**:
- Keep the same records, marked `"status": "fallback_log"`, and print them in a block titled
  **"DECISION TRAIL (fallback log)"**, in order, so they can be copied into Workfront later.
- **OPEN_GATE fallback:** print the approval package titled **"APPROVAL REQUIRED (Workfront unavailable)"**
  and ask the named approver to reply in this conversation with **Approve / Amend / Reject** and their name.
- **CHECK_GATE fallback:** only an explicit reply from the approver, naming themselves, counts as Approve.
  Log it as `HUMAN_DECISION` with their name. Silence, or the requester approving their own campaign, is not approval (except under the
  `pre-approved-dealer-envelope` policy above).

## Live view (for people watching)

After each record, also print one plain line for the on-screen trail:

```
09:02 · SIGNAL_RECEIVED · Weather + competitor feeds (8 records)
09:02 · TRIGGER_DECISION · TRIGGERED: storm zone Hamburg; Competitor Y undercut 14 EUR
09:03 · AUDIENCE_SELECTED · "Hamburg Winter Storm - Firestone Winterhawk", 900 profiles (full match)
09:05 · ARBITRATION_TURN · Round 1 VETO: comparative claim without evidence
09:06 · ARBITRATION_TURN · Round 2 ACCEPT
09:06 · APPROVAL_REQUESTED · Assigned to Campaign Approver, due 11:06
```

## Skill isolation (Team F)

- This is a **Team F** skill. Other teams may have skills with similar names or purposes in the same org.
- When this skill hands off to, or calls, another skill, use **only `teamf-` skills, by their exact name**
  (e.g. `teamf-bstn-brief-assemble`). **Never substitute** another team's or a generic skill with a similar purpose.
- If a required `teamf-` skill isn't available, **stop** and say which one is missing. Don't improvise with a lookalike.
- Adobe platform tools and built-in Adobe skills (e.g. audience, AJO, Workfront, AEM governance tools) may be used
  as **tools** where this skill says so; they never replace a `teamf-` step.

## Guardrails

- **Never approve on anyone's behalf, never mark a gate APPROVED yourself, never release or activate.**
- Never edit or delete existing records. Mistakes are corrected with a new record that references the old one.
  (Only exception: the smoke-test task you created.)
- Never guess projects or task IDs. The approver is the default (Stefanie Culley) or the person the user names.
- Log agent decisions **and** human decisions, including exclusions and reasons, not only outcomes.
- Keep dealer requests and blocked claims verbatim in the records. Don't clean up the history.

## Worked example (illustrative only, not real data)

Trigger T-DE-20095-20261203 (Hamburg, Firestone Winterhawk):
1. LOG `SIGNAL_RECEIVED` → creates task "Decision trail: T-DE-20095-20261203", posts record 001.
2. LOG `TRIGGER_DECISION` (002), `AUDIENCE_SELECTED` (003), `BRIEF_CREATED` (004), `CAMPAIGN_DRAFTED` (005).
3. LOG `ARBITRATION_TURN` round 1 VETO (006), round 2 ACCEPT (007), `COMPLIANCE_VERDICT` PASS (008).
4. OPEN_GATE → task "Approve release: Hamburg Winter Storm - Firestone Winterhawk (T-DE-20095-20261203, v2)",
   assigned to the Campaign Approver, due in 2 h, with a Workfront approval attached. LOG `APPROVAL_REQUESTED` (009).
5. CHECK_GATE (before release) → approver chose Approve on v2 → `HUMAN_DECISION` (010), `RELEASE_AUTHORISED` (011).
6. CLOSE → 2 rounds, 0 human interventions in arbitration, 1 human approval.

## Test cases

| Case | Scenario | Expected |
|---|---|---|
| T1 | Full flow, approver approves | Records 001–011 in order; gate APPROVED; release authorised for that version |
| T2 | Approver chooses Amend | RELEASE_BLOCKED; comments to Campaign Agent; new version needs compliance + a new gate |
| T3 | Approver rejects | RELEASE_BLOCKED; flow closed |
| T4 | CHECK_GATE before any decision | OPEN → RELEASE_BLOCKED |
| T5 | Copy changed after approval | Version mismatch → INVALID → new gate required |
| T6 | Workfront unavailable | Fallback log block; approval requested in chat; only a named approver's explicit Approve counts |
| T7 | No approver named by the user | Default approver Stefanie Culley assigned; never unassigned |
| T8 | Project not found | Ask which project; never create one |
| T9 | SMOKE_TEST | Test task created, read back, deleted; nothing else touched |
| T10 | OPEN_GATE with an approver | Gate task has a formal Workfront approval (task approval process or document approval) with Approve / Reject available to the approver; due now + 2h |
| T11 | No approval process or document possible | Comment fallback used and stated plainly to the user; mechanism logged |
| T12 | Approver = flow requester | Default approver (Stefanie Culley): proceed, flagged `self_approval: true`. Other person: ask first |
