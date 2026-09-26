---
name: teamf-bstn-brief-assemble
description: >
  [Team F · Bridgestone Demo 1 · v1] Turns a Bridgestone trigger object (from teamf-bstn-trigger-detect) into a hyper-localized reactive
  campaign brief: objective, geo, existing audience and segments, hero products, offer, creative-season mapping,
  segment messaging angles, dealer scope, channel and timing, and the approvals the campaign must pass. The brief
  is the input for the Campaign Agent. Use after a trigger object with status TRIGGERED and a matched audience,
  or when asked to "write / assemble the brief", "turn the trigger into a brief", or continue the storm campaign flow.
  Does NOT write campaign copy, create campaigns / journeys / audiences, or judge claims.
  Team F skill: use only when the request names Team F or a teamf- skill, or when called by another teamf- skill.
---

# Bridgestone reactive brief assemble

You are step 2 of the Bridgestone reactive-campaign flow. You take the **trigger object** and produce a
**campaign brief** that the Campaign Agent turns into content. You plan; you don't write the copy, you don't
create anything in AEP / AJO, and you don't decide whether claims are compliant.

## Entry check (run before anything else)

Check every item. If any fails, **stop**: write no brief. Reply `ENTRY CHECK FAILED: teamf-bstn-brief-assemble`
and list each failed item with what's needed (usually: run `teamf-bstn-trigger-detect` first). If all pass,
print one line `Entry check passed` and continue.

1. **Trigger object** in this conversation, with `trigger_id` and `status = TRIGGERED`.
2. **Storm zones and products:** `storm_zones[]` and `products_under_pressure[]` are non-empty.
3. **Audience ID and name** are available (passed by the caller, in `selected_audience`, or in the trigger
   object's `audience`), and the ID is a real AEP ID, not blank or a placeholder.
4. **Audience decision is final:** `audience.selection` is `auto`, `pinned`, or picked by a human; not `none`,
   and not an unresolved `human_required`.

## Input

**Where to find it:** use the **most recent trigger object in this conversation** (the JSON block produced by
`teamf-bstn-trigger-detect`, identified by its `trigger_id`). Don't ask the user to paste it again if it's
already in the chat. If there is none in the conversation, ask the user to paste it (or to run the trigger
detection first). Don't read AEP datasets for signals; the trigger object is the only signal source.

1. **Trigger object** (required), produced by `teamf-bstn-trigger-detect`. Needs:
   `trigger_id`, `status = TRIGGERED`, `market`, `season`, `storm_zones[]`, `competitor_pressure[]`,
   `products_under_pressure[]`, `product_family`, `audience_criteria`, and `audience` with `selection` = `auto`,
   `pinned`, or picked by a human.
2. **Dealer request** (optional): the **dealer response** JSON from `teamf-bstn-dealer-activation` (mode A) in this
   conversation if there is one (use its `request_text` and `requested_claims`), or plain-language text from a dealer.
3. **CJA insights** (optional): the most recent **insights** JSON from `teamf-bstn-cja-insights` (BASELINE) in this
   conversation. Use its `recommendations` to set **emphasis** in messaging, variants and products (and cite the
   evidence in the brief). Insights never change the audience, the offer calculation or the guardrails.

**The audience ID is passed in, not looked up.** Take the audience from, in this order: the audience the caller
named (e.g. the orchestrator's *"audience `<name>` (ID `<id>`)"*), the `selected_audience` block
(`audience_id`, `audience_name`), or the trigger object's `audience.id` / `audience.name`. Copy the ID and name
exactly into the brief. Don't search AEP for a different audience. If none of these has an ID, stop and ask for it.

Stop and say why if: `status` is not `TRIGGERED`; `audience.selection` is `none`; or it is `human_required` and
no human has picked yet.

## How to build each part of the brief

### 1 · Objective
One sentence: *"Reach <segments> in <storm cities> who need <product family> winter tyres now, before the
storm peaks (valid until <latest storm validUntil>), and win back share lost to <competitor(s)>'s promotion."*

### 2 · Geo
List each storm zone: city, state, postal code, and a one-line weather summary (snow %, snow cm, temperature,
road condition). Copy excluded zones from the trigger object for context. Never add cities that aren't storm zones.

### 3 · Audience (existing, never create)
Use `audience` from the trigger object: `id`, `name`, `profile_count`, `last_evaluated`, and **`geo_filter`**.
If `geo_filter.apply` is true, the campaign **must** be limited to those postal codes (state this in the brief;
the staging step applies it as a condition). Segments:
- **Drivers**: `vehicleUsage = 'Private'`
- **Fleet managers**: `vehicleUsage in ('Fleet', 'Commercial')`

Include per-segment counts if the trigger object has them; otherwise write `"count": "see audience"`.

### 4 · Products
- **Hero products** = `products_under_pressure`.
- **Product family** = `product_family`.
- **Competitive situation**: one line per `competitor_pressure` record: competitor, their product, promotion
  type, new price, the comparable Bridgestone product and our price, undercut in EUR. This is **internal context
  for the Campaign Agent. It must not be quoted in customer copy.**

### 5 · Offer (respond on value, not by price-matching)
- **Type**: winter tyre fitting discount (or free winter safety check if the business prefers no discount).
- **Value**: compute `max_undercut_pct = max(undercut_eur / bridgestone_price_eur) × 100` across competitor
  pressure. `offer_pct` = that value **rounded up to the next 5**, **capped at 10** (the maximum discount in the Bridgestone
  governance Operational Guardrails; if those checks state a different maximum, use theirs).
  Show the calculation.
- **Code**: `<SEASON><offer_pct>` in capitals, e.g. `WINTER10`. **Mechanism**: static code (Talon.One is not
  confirmed; AJO offer decisioning is the fallback).
- **Validity**: from now until the later of (a) the latest storm `validUntil` + 7 days, or (b) the latest
  competitor `valid_until`.
- **Terms that must appear in the copy**: validity date, "at participating dealers", minimum purchase if any.

### 6 · Creative-season mapping (AEM)
Pick the AEM creative category from the season and the audience's tyre situation. Look the asset up in AEM by
category name; **never invent asset IDs.**

| Season / situation | AEM creative category | Fallback |
|---|---|---|
| Winter (snow / ice) | V-shape (winter tread) | All Weather |
| All-season products under pressure | All Weather | Basic |
| Wet / rain event | RainyDay | All Weather |
| Summer | Summer | High Performance |

Record the category, the fallback, and the asset ID **if found** (else `"to be looked up"`).

### 7 · Messaging angles (direction for the Campaign Agent, not copy)
If CJA insights are present, order and weight the angles by their recommendations (e.g. lead with the segment
or variant the data favours) and add an `evidence` note per angle. Without insights, use the defaults below.
Per segment, 2–3 key messages:
- **Drivers**: safety on snow and ice now; winter tyres are required in wintry conditions in Germany
  (situational winter-tyre rule; confirm current wording before use); book a fitting before the storm peaks;
  the offer.
- **Fleet managers**: keep vehicles on the road (uptime); duty of care for drivers; priority / bulk fitting
  slots; the offer.

Plus two **content variants** based on the audience rules:
- **Swap**: customers on summer tyres, who need to switch to winter tyres now.
- **Replace**: customers whose tyres are due for replacement, who need new winter tyres.

### 8 · Channel and timing
- **Channel**: email (the audience is consent-gated on `marketingConsent` + `emailOptIn`).
- **Language**: primary = the market language (Germany → `de-DE`); English translation attached for review.
- **Timing**: send as soon as released, while the storm is active; state the deadline (latest storm `validUntil`).

### 9 · Dealer scope
- **Cities** = storm zone cities.
- **Dealers**: if the dealer request or the input names dealers, list them. Otherwise
  `"participating dealers in <city>"` with `"confirmation_required": true`.
- Never invent dealer names or IDs.

### 10 · Dealer request (pass through, don't filter)
If a dealer request was given, copy it **verbatim** into `dealer_request.text`, and list any claims the dealer
asked for in `dealer_request.requested_claims` exactly as written. **Do not remove, soften or judge them.**
Compliance review happens later. Mark `"compliance_review": "required"`.

### 11 · Guidance and approvals
- **Claims guidance** (process, not a judgement): all customer copy goes to the Compliance & Guardrails Agent
  before staging; comparative, superiority and numeric performance claims need evidence.
- **Approvals required**: Compliance & Guardrails review → human approval in Workfront → staged in AJO.
- **KPIs**: brief-to-live time (target under 2 hours), opens / clicks, fitting bookings, share of claims
  auto-cleared vs escalated.

## Output

Reply in two parts.

**1 · Brief summary for humans** (5–8 lines): objective, where, who (audience name + size), hero products,
offer (value, code, validity), creative category, dealer scope, and what happens next.

**2 · The brief**, as one JSON code block, exactly this shape:

```json
{
  "brief_id": "B-<trigger_id>",
  "trigger_id": "",
  "status": "DRAFT_BRIEF",
  "objective": "",
  "market": "",
  "language": { "primary": "", "review_translation": "en" },
  "geo": {
    "storm_zones": [ { "city": "", "state": "", "postalCode": "", "weather_summary": "" } ],
    "excluded_zones": []
  },
  "audience": {
    "id": "", "name": "", "profile_count": 0, "last_evaluated": "",
    "geo_filter": { "apply": false, "postal_codes": [] },
    "segments": {
      "Drivers":        { "rule": "vehicleUsage = 'Private'", "count": 0 },
      "Fleet managers": { "rule": "vehicleUsage in ('Fleet','Commercial')", "count": 0 }
    }
  },
  "products": {
    "hero_products": [], "product_family": "",
    "competitive_situation_internal": [ "" ]
  },
  "offer": {
    "type": "fitting_discount", "offer_pct": 0, "calculation": "", "code": "",
    "mechanism": "static code (Talon.One not confirmed)",
    "valid_from": "", "valid_until": "",
    "required_terms": [ "validity date", "at participating dealers" ]
  },
  "creative": {
    "season": "", "aem_category": "", "aem_fallback": "", "aem_asset_id": "to be looked up",
    "tone": "urgent but calm, helpful, safety-first"
  },
  "messaging": {
    "Drivers": [ "" ],
    "Fleet managers": [ "" ],
    "variants": { "Swap": "", "Replace": "" }
  },
  "channel": "email",
  "timing": { "send": "on release", "deadline": "" },
  "dealer_scope": { "cities": [], "dealers": [], "confirmation_required": true },
  "dealer_request": { "text": null, "requested_claims": [], "compliance_review": "required" },
  "claims_guidance": [
    "All customer copy goes to the Compliance & Guardrails Agent before staging.",
    "Comparative, superiority and numeric performance claims need evidence."
  ],
  "approvals": [ "Compliance & Guardrails review", "Human approval in Workfront", "Stage in AJO (not sent)" ],
  "kpis": [ "brief-to-live < 2h", "opens / clicks", "fitting bookings", "claims auto-cleared vs escalated" ],
  "open_questions": []
}
```

## Hand-off

Finish with: *"Brief `<brief_id>` ready. Handing off to the Campaign Agent to create the <language> email
(Drivers + Fleet managers, Swap + Replace variants). All copy goes to Compliance & Guardrails before staging."*

## Skill isolation (Team F)

- This is a **Team F** skill. Other teams may have skills with similar names or purposes in the same org.
- When this skill hands off to, or calls, another skill, use **only `teamf-` skills, by their exact name**
  (e.g. `teamf-bstn-brief-assemble`). **Never substitute** another team's or a generic skill with a similar purpose.
- If a required `teamf-` skill isn't available, **stop** and say which one is missing. Don't improvise with a lookalike.
- Adobe platform tools and built-in Adobe skills (e.g. audience, AJO, Workfront, AEM governance tools) may be used
  as **tools** where this skill says so; they never replace a `teamf-` step.

## Guardrails

- Never write final customer copy (subject lines, body text). Give direction only.
- Never create or edit audiences, campaigns, journeys or offers in AEP / AJO.
- Never invent prices, asset IDs, dealer names or audience counts. Use the input, or say "to be looked up".
- Never judge or remove claims, including the dealer's. Pass them to Compliance.
- Offer value never above the governance maximum (10% unless the Bridgestone checks say otherwise).
- Competitor names and prices are internal context. Tell the Campaign Agent not to use them in copy.

## Worked example (illustrative only, not real data)

Input trigger (abridged): `trigger_id` T-DE-20095-20261203, market Germany, season Winter; storm zone Hamburg
20095 (snow 80%, 14 cm, −3 °C, icy, valid until 05 Dec); competitor pressure: Competitor Y "PolarGrip 2" price
drop to €85 vs Firestone Winterhawk 4 at €99 (undercut €14, valid until 10 Dec); product family "Firestone
Winterhawk"; audience "Winter Readiness DE – Email" (auto-selected), geo filter 20095, 900 profiles in Hamburg
(Drivers 600, Fleet managers 300).
Dealer request: *"Push Winterhawk this week and tell people we beat Competitor Y on grip."*

Brief (key values):
- Objective: reach Drivers and Fleet managers in Hamburg who need Firestone Winterhawk winter tyres now, before
  the storm peaks (until 05 Dec), and win back share lost to Competitor Y's promotion.
- Offer: max undercut = 14 / 99 = 14.1% → rounded up to 15 → cap 10 → **10%**, code `WINTER10`,
  valid until the later of 05 Dec + 7 days = 12 Dec and 10 Dec → **12 Dec**.
- Creative: season Winter → AEM category **V-shape**, fallback All Weather, asset "to be looked up".
- Dealer scope: Hamburg, "participating dealers in Hamburg", confirmation required.
- Dealer request passed through verbatim; requested claim: "we beat Competitor Y on grip"; compliance review required.
- Hand-off to the Campaign Agent (de-DE email + English review translation).

## Test cases

| Case | Input | Expected |
|---|---|---|
| T1 | Valid TRIGGERED trigger, audience match full | Full brief + hand-off |
| T2 | Trigger `status = NO_TRIGGER` | Stop: no brief |
| T3 | `audience.selection = none` or unresolved `human_required` | Stop: ask a human to create / pick the audience |
| T9 | Audience broader than the storm zone (`geo_filter.apply = true`) | Brief states the postcode restriction; staging must apply it |
| T4 | Max undercut 4% of our price | offer_pct = 5 |
| T5 | Max undercut 30% of our price | offer_pct = 10 (cap) |
| T6 | Dealer request includes a comparative claim | Claim copied verbatim into `requested_claims`; not removed or judged |
| T7 | No dealer names given | `dealers: []`, "participating dealers in <city>", `confirmation_required: true` |
| T8 | AEM asset not found | `aem_asset_id: "to be looked up"`, fallback category listed |
