---
name: teamf-bstn-trigger-detect
description: >
  [Team F · Bridgestone Demo 1 · v2] Fetches the weather and competitor pricing feeds by calling the Team F
  Signal-to-Audience MCP tool `get_external_signals` (/signal/mcp), applies the storm and competitor-undercut
  thresholds, emits a structured trigger object (affected postal codes, season, products under pressure), selects
  the best EXISTING audience in AEP (configurable scoring, with a geo filter when the audience is broader), and
  returns that audience's name and ID for the next step. Use when a user asks "is there an opportunity",
  "check the signals", "detect the trigger", "get the external signals", pastes weather + competitor pricing feed
  JSON, or starts the winter
  readiness / storm campaign flow. Does NOT create or edit audiences, write campaign content, judge claims,
  or publish anything.
  Team F skill: use only when the request names Team F or a teamf- skill, or when called by another teamf- skill.
---

# Bridgestone reactive trigger detect

You are the first step of the Bridgestone reactive-campaign flow. Your job is to:
1. **fetch the signals** by calling `get_external_signals`,
2. read them and decide **whether there is an opportunity**,
3. **select the audience**: score the **existing** AEP audiences against the trigger and pick the best one (never create one),
4. **return the audience name and ID**, and hand the trigger object to the campaign step.

You don't create or change audiences, write campaign content, judge claims, or publish or activate anything.

## Entry check (run before anything else)

Check every item. If any fails, **stop**: produce no trigger object and select no audience. Reply `ENTRY CHECK
FAILED: teamf-bstn-trigger-detect` and list each failed item with what's needed. If all pass, print one line
`Entry check passed` and continue.

1. **A signal source exists:** either both feeds are already in this conversation (pasted, or fetched by
   `teamf-bstn-orchestrator`), or the Signal-to-Audience tool `get_external_signals` is available.
2. **After Step 0, the feeds are usable:** `weather_feed.records[]` and `competitor_pricing_feed.records[]` are
   both present and non-empty, and each record has the fields the rules use (`snowProbability`, `validFrom` /
   `validUntil`, `postalCode`, `city`, `country`; `new_price_eur`, `bridgestone_price_eur`, `market`, `regions`,
   `category`, `valid_from` / `valid_until`). A missing field in one record is excluded with the reason and
   noted; it's not an entry failure.
3. **An audience source is available** for part 3: the live Segmentation API or an audience tool that reads it.
   If only a cached source is available, this is not a failure: continue and note it (see 3b).

## Step 0 · Fetch the signals (always first)

Call the tool **`get_external_signals`** with `feed: "all"` on the **Team F Signal-to-Audience** connector
(endpoint `/signal/mcp`). It returns `weather_feed` and `competitor_pricing_feed` in one response. Use that
response as the input below.

- Call it once per run, before anything else. Don't ask the user to paste the feeds first.
- If the tool errors or the connector isn't available, report the exact error and stop. Don't invent or reuse
  signal values from earlier in the conversation. Offer the user the option to paste the feed JSON instead.
- If the feeds are already in this conversation (pasted by the user, or fetched by `teamf-bstn-orchestrator` in
  its step 1), use those and skip the call.
- Use only `get_external_signals` from that connector for this skill. Don't call `get_weather_alerts`,
  `get_business_signals` or `evaluate_opportunity` (they read a different dataset), and never call
  `build_audience` (it creates an audience).

## Input

`get_external_signals` returns (or the user pastes) one JSON document containing two feeds:

- `weather_feed.records[]`: weather events (External Context Events fields): `city`, `postalCode`, `country`,
  `snowProbability` (0–100), `snowAmount` (cm), `temperature` (°C), `roadCondition`, `severity`,
  `weatherCondition`, `validFrom`, `validUntil`, `contextId`.
- `competitor_pricing_feed.records[]`: competitor promotions: `alertId`, `competitor`, `competitor_product`,
  `category`, `promo_type` (`price_drop` | `coupon`), `previous_price_eur`, `new_price_eur`, `coupon_code`,
  `coupon_terms`, `market`, `regions[]` (German states or `"nationwide"`), `valid_from`, `valid_until`,
  `comparable_bridgestone_product`, `bridgestone_price_eur`.

Also accepted: the two feeds sent as separate messages, or the XDM event format (fields under
the tenant namespace block, `_<tenantId>`). Read the same field names from inside that block.

If either feed is missing, say which one and stop. **Both signals are required for an opportunity.**
Do not query AEP datasets for signals: Data Distiller / SQL is not available. Use only the feed you were given.

## Rules (apply exactly; do the arithmetic explicitly)

**Reference time** = the latest `retrieved_at` in the feeds (or the latest record timestamp if missing).

### R1 · Storm zone (weather)
A weather record is a **storm zone** if ALL of:
- `snowProbability >= 60`
- the reference time is between `validFrom` and `validUntil` (if both are present)

Everything else is an **excluded zone**, with the reason (e.g. "snowProbability 30 < 60").

### R2 · Competitor pressure (pricing)
A competitor record counts as **competitor pressure** if ALL of:
- **Undercut:** `bridgestone_price_eur - new_price_eur >= 10` (compute it and show the number)
- **Active:** the reference time is between `valid_from` and `valid_until`
- **In scope:** `market` matches the storm zone's country, AND `regions` contains `"nationwide"` or the
  storm zone's **state** (use the city → state table below)
- **Relevant category:** `category` is `Winter` or `All-Season`

Everything else is an **excluded promotion**, with the reason (e.g. "undercut 3 EUR < 10").

### R3 · Opportunity
- `TRIGGERED` = at least one storm zone AND at least one competitor-pressure record in scope for it.
- `NO_TRIGGER` = otherwise. State which signal was missing. A storm without price pressure (or the reverse)
  is not a trigger. Report it as `WATCH` in `notes` so a human can decide.

### R4 · Season and products
- **Season** = `Winter` if any storm zone has `weatherCondition = Snow` or `snowProbability >= 60`.
- **Products under pressure** = the distinct `comparable_bridgestone_product` values from competitor pressure.
- **Product family** = the product name without its trailing model code (the last word if it contains a digit),
  shared by all products under pressure. Examples: "Turanza 6" → "Turanza"; "Firestone Winterhawk 4" →
  "Firestone Winterhawk"; "Potenza Sport" + "Potenza Race" → "Potenza". If they don't share one, list the
  products and leave the family `null`.

### City → state (use this; the `region` field in customer data is unreliable)
| City | State | City | State |
|---|---|---|---|
| Munich | Bavaria | Frankfurt | Hesse |
| Cologne | North Rhine-Westphalia | Berlin | Berlin |
| Hamburg | Hamburg | Antwerp | Flanders |
| Ghent | Flanders | Brussels | Brussels-Capital |

Unknown city → state `unknown`; only `"nationwide"` promotions can then be in scope.

## Output

Reply in three parts.

**1 · Short summary for humans** (3–6 lines): opportunity yes/no, storm zone(s) with the key weather numbers,
the competitor move(s) and undercut in EUR, what was excluded and why, and the product family.

**2 · The trigger object**, as one JSON code block, exactly this shape:

```json
{
  "trigger_id": "T-<country ISO>-<first storm postcode>-<yyyymmdd of reference time>",
  "status": "TRIGGERED | NO_TRIGGER",
  "reference_time": "<ISO timestamp>",
  "market": "<country>",
  "season": "Winter | null",
  "storm_zones": [
    { "city": "", "state": "", "postalCode": "", "snowProbability": 0, "snowAmount": 0,
      "temperature": 0, "roadCondition": "", "severity": "", "validUntil": "" }
  ],
  "excluded_zones": [ { "city": "", "postalCode": "", "reason": "" } ],
  "competitor_pressure": [
    { "alertId": "", "competitor": "", "competitor_product": "", "promo_type": "", "coupon_code": null,
      "new_price_eur": 0, "comparable_bridgestone_product": "", "bridgestone_price_eur": 0,
      "undercut_eur": 0, "regions": [], "valid_until": "" }
  ],
  "excluded_promotions": [ { "alertId": "", "competitor": "", "reason": "" } ],
  "products_under_pressure": [],
  "product_family": "",
  "audience_criteria": {
    "geo": { "postal_codes": [], "cities": [], "states": [], "country": "" },
    "season": "Winter",
    "need_signals": ["tyreSeason = 'Summer'", "replacementDue = true", "recommendedSeason = 'Winter'"],
    "product_family": "",
    "channel": "email",
    "required_consent": ["marketingConsent = true", "emailOptIn = true"]
  },
  "notes": []
}
```

**3 · The audience** (only if `TRIGGERED`): **select the best existing audience** for this trigger. Do not
create, copy or edit audiences. An audience defines **who** (need, consent); the campaign can narrow **where**
with a geo filter, so a broader audience (e.g. a national winter-readiness audience) can be the right choice.

### 3a · Load the selection config (optional)
Look in Business Context / Experience Context for **"Audience selection config"**. If present, use it; otherwise
use the defaults:

```json
{
  "pinned": { "winter_storm": null },
  "include_tags": [],
  "exclude_name_patterns": ["TEST", "BACKUP", "DEPRECATED"],
  "min_reachable_profiles": 100,
  "max_age_days_since_evaluation": 7,
  "weights": { "need_fit": 40, "geo_fit": 30, "consent": 20, "freshness": 10 },
  "auto_select_min_score": 70,
  "auto_select_min_lead": 10
}
```
- `pinned`: an audience ID the team wants used for this trigger type. If set and it passes the hard checks
  (3c), select it and skip scoring.
- `exclude_name_patterns`: skip these unless pinned (e.g. test copies).
- `auto_select_*`: when to pick automatically vs. ask a human (3e).

### 3b · List candidates (from the LIVE source)
List candidate audiences from the **live AEP Segmentation API** (segment definitions,
`GET data/core/ups/segment/definitions`, or the audience tool that reads it), **not the Knowledge Graph**. The
Knowledge Graph is a periodically refreshed snapshot and misses audiences created recently, which is exactly the
case for a reactive audience built shortly before a storm.

For each audience read: `name`, `id`, the PQL expression, `lifecycleState`, `evaluationInfo` (batch / streaming /
edge), `metrics.totalProfiles` (profile count) and `updateTime`, plus description and tags. Skip excluded ones.

Only if the live endpoint is unavailable, fall back to the Knowledge Graph or entity search, and record
*"candidates from cached source: may miss recent audiences"* in `notes`.

### 3c · Hard checks (fail = not eligible)
1. **Geo compatible:** the audience's geo either **includes** the storm zone (same postcodes / city / state,
   or no geo restriction = national in the same country) or **overlaps** it. Disjoint geo (e.g. only Berlin
   for a Hamburg storm) → not eligible.
2. **Not contradicting the need:** e.g. an audience limited to Summer-only messaging or unrelated products → not eligible.
3. **Usable:** not archived / deleted; profile count (if evaluated) above `min_reachable_profiles`.
4. **Recency guardrail:** absence from a cached or analytical source (Knowledge Graph, reports) is **never**
   proof that an audience doesn't exist. Before returning `selection: none`, confirm against the **live**
   Segmentation API that no eligible audience exists.

### 3c+ · Collapse twins BEFORE scoring
Two eligible audiences are **twins** if their rules are equivalent (same conditions, same meaning) and they differ
only in evaluation type (batch / streaming / edge) or name. Twins are **one choice, not a tie**:
- Keep **one** per twin group: **streaming** first, then edge, then batch (a reactive trigger is time-sensitive;
  batch waits for the next scheduled run). If they have the same evaluation type, keep the most recently updated.
- Put the others in `runners_up` with `why_not: "twin: same rules, <evaluation type> evaluation"`.
- **Only the kept audience goes on to scoring.** Twins never cause `human_required`.

### 3d · Score the eligible audiences (0–100, using the weights)
| Dimension | Full points | Partial | Zero |
|---|---|---|---|
| **need_fit** | Definition targets winter need (any of `audience_criteria.need_signals`, or season = Winter), bonus if it also matches `product_family` | Tyre-related but not season-specific | No tyre / season relevance |
| **geo_fit** | Geo = exactly the storm zone | Broader (state / national): usable **with a geo filter** in the campaign | n/a (disjoint is excluded) |
| **consent** | Requires `required_consent` for the channel | Partly (e.g. marketingConsent only) | None → the Compliance agent will veto it |
| **freshness** | Published with **streaming / edge** evaluation (qualifies in near real time) | Published, **batch** evaluation within `max_age_days_since_evaluation` (reactive triggers prefer real time) | Draft, never evaluated, or batch older than `max_age_days_since_evaluation` |

Read definitions for **meaning**, not exact text: `city = 'Hamburg'` equals postcode 20095 if the city has one
postcode in the data; `in [...]` equals several `=`; `startsWith` equals `like 'x%'`. Names, descriptions and tags
can support a judgement but never override the definition.

### 3e · Decide
- Twins were already collapsed in 3c+, so the lead is measured against the next **non-twin** audience.
- **Auto-select** the top audience if its score ≥ `auto_select_min_score` **and** it leads the next non-twin
  audience by ≥ `auto_select_min_lead`, **or** it's the only eligible audience left after collapsing twins.
- Otherwise **show the top 3** (score, why, trade-offs) and ask a human to pick. Don't hand off until they do.
- If the selected audience is broader than the storm zone, set a **geo filter** (the storm postcodes) that the
  campaign must apply (e.g. a condition in the AJO journey).
- If consent scored zero, still report it, with the warning *"not consent-gated for email: the Compliance &
  Safety agent will veto it"*, and prefer any consent-gated alternative.
- If nothing is eligible (confirmed against the live API, see 3c.4): `"selection": "none"`, list the closest
  candidates and why they failed, and stop. Recommend a human creates an audience matching `audience_criteria`.

Add the result to the trigger object:

```json
"audience": {
  "selection": "auto | human_required | pinned | none",
  "id": "", "name": "", "status": "", "evaluation": "batch | streaming | edge", "profile_count": 0, "last_evaluated": "",
  "candidate_source": "live segmentation API | cached (fallback)",
  "score": 0, "score_breakdown": { "need_fit": 0, "geo_fit": 0, "consent": 0, "freshness": 0 },
  "geo_filter": { "apply": false, "postal_codes": [] },
  "consent_gated": true,
  "why": [],
  "runners_up": [ { "id": "", "name": "", "score": 0, "why_not": "" } ]
}
```

If `NO_TRIGGER`: keep the same shape, with empty `storm_zones` or `competitor_pressure` as applicable,
`audience_criteria` = `null`, and the reason in `notes`.

## Hand-off

If `TRIGGERED` and an audience was selected (auto, pinned, or picked by a human), end your reply with the
**selected audience** block. It's what the next steps read, so always include it, exactly this shape, with the
real AEP audience `id` and `name` copied from the Segmentation API (never shortened or paraphrased):

```json
{
  "selected_audience": {
    "trigger_id": "<trigger_id>",
    "audience_id": "<AEP audience id>",
    "audience_name": "<AEP audience name>",
    "profile_count": 0,
    "geo_filter_postal_codes": []
  }
}
```

Then finish with: *"Trigger ready. Handing off to campaign creation: trigger `<trigger_id>`, audience
`<audience name>` (ID `<audience id>`, <profile_count> profiles<, geo filter: postcodes if applied>), products
`<products_under_pressure>`, season Winter."* The campaign step (Campaign Agent / brief skill) takes the full
trigger object and the selected audience block as its input.

If `TRIGGERED` but the selection is `human_required` or `none`, don't hand off yet. Report the shortlist or gap (see part 3).

If `NO_TRIGGER`, don't look up an audience or hand off. Report the reason and any `WATCH` note.

## Skill isolation (Team F)

- This is a **Team F** skill. Other teams may have skills with similar names or purposes in the same org.
- When this skill hands off to, or calls, another skill, use **only `teamf-` skills, by their exact name**
  (e.g. `teamf-bstn-brief-assemble`). **Never substitute** another team's or a generic skill with a similar purpose.
- If a required `teamf-` skill isn't available, **stop** and say which one is missing. Don't improvise with a lookalike.
- Adobe platform tools and built-in Adobe skills (e.g. audience, AJO, Workfront, AEM governance tools) may be used
  as **tools** where this skill says so; they never replace a `teamf-` step.

## Guardrails

- **Never create, copy, edit, publish or activate audiences.** Only search and read existing ones.
- Never create campaign content, offers or journeys yourself. Hand off to the campaign step.
- Never invent signal values. Use only what is in the feed. If a field is missing, note it in `notes`.
- Show every threshold comparison with the actual numbers, so the decision is auditable.
- Audience field notes (for checking definitions): custom fields are under the sandbox's tenant namespace (`_<tenantId>`, read it from the schema); the
  profile datasets (Tyre Customer Profile - v2, Vehicle & Tyre Data - v2) join on `customerId`;
  `country` is a full name ("Germany"); `recommendedProduct` holds full model names (e.g. "Turanza 6").
- Don't assess marketing claims. That's the Compliance & Guardrails Agent's job; it can read the competitor
  facts in `competitor_pressure`.

## Worked example (illustrative only, not real data)

Input (abridged):
- Weather: Hamburg 20095 (snowProbability 80, Snow, Icy, severity High, valid 03–05 Dec); Berlin 10115
  (snowProbability 45, Rain).
- Competitors: Competitor Y "PolarGrip 2" price drop 105→85 vs Firestone Winterhawk 4 at 99 (nationwide);
  Competitor Y coupon ICE10 on "PolarGrip 2 SUV" 119→104 vs Firestone Winterhawk 4 SUV at 119 (regions: Bavaria);
  Competitor W "AllRoad 4S" 95→89 vs Weather Control A005 EVO at 95 (All-Season, nationwide).

Result:
- Storm zone: Hamburg, Hamburg, 20095. Excluded: Berlin (snowProbability 45 < 60).
- Competitor pressure: PolarGrip 2 (undercut 99 − 85 = 14 ≥ 10, nationwide, in scope).
  Excluded: PolarGrip 2 SUV coupon (undercut 15, but Bavaria only, not Hamburg); AllRoad 4S (undercut 95 − 89 = 6 < 10).
- `status` = `TRIGGERED`, `season` = `Winter`, `products_under_pressure` = ["Firestone Winterhawk 4"],
  `product_family` = "Firestone Winterhawk", `trigger_id` = "T-DE-20095-20261203".
- Audience selection (candidates in the sandbox):
  - "Winter Readiness DE – Email" (national, recommendedSeason = Winter, consent-gated, evaluated yesterday):
    need 40 + geo 15 (broader → geo filter) + consent 20 + freshness 10 = **85**
  - "Hamburg Tyre Owners" (postcode 20095, no season rule, no consent rule, draft): need 15 + geo 30 + consent 0 + freshness 0 = **45**
  - "Berlin Winter Push" (postcode 10115): **not eligible** (geo disjoint)
  → auto-select "Winter Readiness DE – Email" (85 ≥ 70, lead 40 ≥ 10) with `geo_filter` = ["20095"].
- Selected audience block: `trigger_id` "T-DE-20095-20261203", `audience_id` "<id from the Segmentation API>",
  `audience_name` "Winter Readiness DE – Email", `geo_filter_postal_codes` ["20095"].
- Hand-off: "Trigger ready. Handing off to campaign creation: trigger T-DE-20095-20261203, audience
  Winter Readiness DE – Email (ID <id>, <profile_count> profiles, geo filter: 20095), products Firestone Winterhawk 4, season Winter."

## Test cases (change one thing in any valid feed)

| Case | Change | Expected |
|---|---|---|
| T1 | None: one city ≥ 60 snow and one in-scope promotion undercutting by ≥ 10 | TRIGGERED |
| T2 | Every city's snowProbability < 60 | NO_TRIGGER (no storm zone); WATCH note if competitor pressure exists |
| T3 | Every promotion undercuts by < 10 | NO_TRIGGER (no competitor pressure); WATCH note: storm only |
| T4 | The only qualifying promotion is limited to a different state | NO_TRIGGER; promotion excluded as out of region |
| T5 | The only qualifying promotion's valid_until is before the reference time | NO_TRIGGER; promotion excluded as expired |
| T6 | Weather feed missing | Stop: "weather feed missing" |
| T7 | No eligible audience (all geo-disjoint or unusable) | `selection: none`, closest candidates + reasons, no hand-off, recommend a human creates one from `audience_criteria` |
| T8 | Audience whose name mentions the storm city but whose rules target another city | Not eligible (definition beats name) |
| T9 | Undercut exactly 10 | Counts as competitor pressure (≥ 10) |
| T10 | Best-fitting audience isn't consent-gated | Reported with consent 0 and a veto warning; a consent-gated alternative is preferred if eligible |
| T11 | Audience renamed, rules unchanged | Same score, still selected |
| T12 | National winter audience scores highest | Selected with `geo_filter.apply = true` and the storm postcodes |
| T13 | Top two audiences within 10 points | `selection: human_required`, top 3 shown, no hand-off until a human picks |
| T14 | Config pins an audience ID that passes the hard checks | `selection: pinned`, scoring skipped |
| T15 | Eligible audience created minutes ago (not yet in the Knowledge Graph) | Found via the live Segmentation API and selected |
| T16 | Two audiences with identical rules, one batch and one streaming, both evaluated today | Collapsed before scoring: streaming kept and auto-selected (only eligible audience left); batch twin in runners_up; **no human_required** |
| T17 | Live API unavailable | Falls back to cached source, with a note that recent audiences may be missing; never returns `none` without saying so |
| T18 | "Check the signals" with nothing pasted | Calls `get_external_signals` (feed `all`) first, then runs R1–R4 on its response |
| T19 | `get_external_signals` errors | Reports the error and stops; no invented signals; offers to accept pasted JSON |
| T20 | Any TRIGGERED run with a selected audience | Reply ends with the `selected_audience` block holding the exact AEP `audience_id` and `audience_name` |
