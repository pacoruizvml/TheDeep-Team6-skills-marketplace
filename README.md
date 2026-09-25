# The Deep · Team 6 (Team F) skills marketplace

Skills for **The Deep** hackathon (WPP Enterprise Solutions × Adobe, 2026): the **Bridgestone reactive-campaign
flow** for Adobe CX Enterprise Coworker. All data referenced is **synthetic**.

## Contents

Marketplace `teamf` → plugin `teamf-bridgestone` → 9 skills:

| Skill | Purpose |
|---|---|
| `teamf-bstn-orchestrator` | Runs the whole flow in order; stages, never sends, until Workfront approval |
| `teamf-bstn-trigger-detect` | Weather + competitor feeds → trigger object; scores and selects the best existing audience |
| `teamf-bstn-cja-insights` | *(optional)* CJA baseline before the brief; campaign read-back after release |
| `teamf-bstn-dealer-activation` | Dealer response to an opportunity; guarded self-serve local promos |
| `teamf-bstn-brief-assemble` | Trigger → hyper-localized campaign brief (offer, creative, messaging, dealer scope) |
| `teamf-bstn-campaign-draft` | Campaign Agent: brief → localized email draft; revises after a veto |
| `teamf-core-arbitration-loop` | Referee for agent-to-agent negotiation (max 3 rounds, decision record per turn) |
| `teamf-bstn-compliance-review` | Arbiter: checks copy / offer / audience against the brand's governance checks |
| `teamf-core-decision-trail` | Audit trail + human approval gate in Workfront (with fallback log) |

All skill names start with `teamf-`, and skills only call other `teamf-` skills by exact name, so they don't clash
with other teams' skills in a shared org.

## Install in Coworker

Customizations → **Marketplaces** → add this repository, then enable the `teamf-bridgestone` plugin.
(If the repository is private, Coworker needs an access token configured for it.)

## Install in Claude Code (for testing)

```text
/plugin marketplace add <owner>/<repository>
/plugin install teamf-bridgestone@teamf
```

## Prerequisites (configured in Coworker, not in this repo)

- Bridgestone brand guardrails in Experience Context (claim + operational guardrails, segment context)
- Routing entry: sandbox, campaign approver, legal reviewer, Workfront project
- At least one published, consent-gated winter audience covering the storm area
- Optional: a CJA data view with the customer interaction events

## Using the flow

Always name the skill, e.g. *"Use teamf-bstn-orchestrator to run the Team F reactive campaign flow in auto mode."*
and paste the signal feed JSON.

## Versioning

Change the skills, then bump `version` in `plugins/teamf-bridgestone/.claude-plugin/plugin.json`.
The demo runbook, mock signals and expected results are kept **outside** this repo.
