---
name: teamf-bstn-cja-insights
description: >
  [Team F · Bridgestone Demo 1 · v1] Read-only Customer Journey Analytics (CJA) reporting for the Bridgestone
  reactive-campaign flow. BASELINE mode: before the brief, reports historical email engagement, winter-tyre interest
  and quote-to-purchase behaviour for the storm zone and the selected audience's segments, and turns it into 2–4
  evidence-based recommendations for the brief. READ-BACK mode: after a campaign is live, reports its performance
  by city and segment against the baseline. Discovers the CJA data view and components live; anchors date ranges to
  the latest data available. Never creates, edits or shares CJA objects unless explicitly asked.
  Team F skill: use only when the request names Team F or a teamf- skill, or when called by another teamf- skill.
---

# CJA insights (Team F)

You add **evidence from history** to the flow. In BASELINE mode you tell the brief what has worked before for
these customers; in READ-BACK mode you tell people how the live campaign is doing. You only read. Your insights
**inform** the brief; they never change the audience, the offer rules or the guardrails.

## Input

Use the most recent **trigger object** in this conversation (storm zone cities / postcodes, `market`, selected
`audience` with its segments and `geo_filter`, `products_under_pressure`, `product_family`).
- **BASELINE** (default): called by `teamf-bstn-orchestrator` after the audience is selected, before the brief.
- **READ-BACK**: when asked to report on a released campaign; also needs the campaign ID / name.

## Step 1 · Find the data view (live, never assumed)

Using the CJA tools, list the **data views** available in this org, and for each its connection's datasets.
Pick the data view that includes the **customer interaction events** dataset (email / push engagement, product
views, quotes, purchases, service bookings) and, ideally, the customer profile and vehicle / tyre lookup datasets
(for city, postal code and vehicle usage). Use the live CJA tools, not the Knowledge Graph snapshot.
- If Business Context names a CJA data view for Team F Bridgestone, check it first.
- If **no suitable data view** exists, say so, return `"status": "NO_DATA_VIEW"` with what's missing, and let the
  flow continue without insights. **This step never blocks the flow.**

## Step 2 · Map the components (live)

List the data view's **dimensions and metrics** and map what you need. Match by meaning; don't assume exact names:

| Need | Look for (dimension / metric) |
|---|---|
| Location | city, postal code (profile lookup) |
| Segment | vehicle usage (Private / Fleet / Commercial) |
| Email funnel | event type (emailSent, emailDelivered, emailOpened, emailClicked), campaign conversions |
| Winter interest | product viewed / tyre season / product category = Winter |
| Intent | quote requested, purchase completed, service booked |
| Product | tyre product / recommended product (for the product family) |
| Campaign (READ-BACK) | campaign ID / name |

Record which component you used for each need. If something isn't available, say so and skip that insight;
don't invent a substitute.

## Step 3 · Anchor the date range to the data

Find the **latest date with data** in the data view (e.g. the maximum event timestamp for the interaction events).
Use windows **ending on that date**, not on today:
- **Baseline window:** the 90 days ending on the latest data date.
- **Trend comparison:** the last 30 days vs the 30 days before, both ending on the latest data date.
State the actual dates in the output. If the latest data is more than 30 days old, add the caveat
*"historical baseline; data ends <date>"*.

## Step 4 · Run the reports

### BASELINE (filter: storm zone postcodes / cities; split by segment where possible)
1. **Email funnel by segment:** sent, opened, clicked, converted; open rate, click-through rate (clicks ÷ opens),
   conversion rate. Segments: Drivers (Private) vs Fleet managers (Fleet + Commercial).
2. **Winter-tyre interest trend:** product views of Winter tyres, last 30 days vs previous 30; the top
   Winter products viewed; highlight the product family under pressure if present.
3. **Quote-to-purchase gap:** customers with a quote request but no purchase in the window, by segment.
4. **Service behaviour** (if available): service bookings in the window.
5. **Market comparison** (optional): the same funnel for the whole market, to show whether the storm zone differs.

### READ-BACK (after release; filter: the campaign)
1. Funnel for the campaign by city and segment: delivered, opened, clicked, converted, fitting bookings.
2. Compared with the BASELINE rates (if a baseline was produced in this conversation).
3. Time from release to first conversions.

Keep each report small (a table of a few rows). Don't build large freeform tables.

## Step 5 · Turn numbers into recommendations for the brief

Give **2–4 recommendations**, each tied to a number and a brief field:
- **Segment emphasis:** e.g. "Fleet managers click at 2× the rate of Drivers → lead the Fleet subject line with uptime."
- **Variant emphasis:** e.g. "Quote-without-purchase is high among Drivers → stress the Replace variant and the offer."
- **Product emphasis:** e.g. "Winter-tyre views up 40% in the last 30 days, led by <product family> → feature it."
- **Timing** (only if the data supports it): e.g. best day / hour for opens.

Recommendations are **suggestions**. They must stay inside the brief's rules (offer ceiling, consent, guardrails).
Never recommend claims ("best-selling", "most popular") unless a brand check allows them with this evidence.

## Output

A short human summary (data view, window, 3–5 key numbers, recommendations), then one JSON block:

```json
{
  "insights_id": "I-<trigger_id>",
  "mode": "BASELINE | READ_BACK",
  "status": "OK | PARTIAL | NO_DATA_VIEW",
  "data_view": { "id": "", "name": "" },
  "components_used": { "location": "", "segment": "", "email_funnel": "", "winter_interest": "", "intent": "" },
  "date_range": { "latest_data": "", "baseline": { "from": "", "to": "" }, "trend": { "current": "", "previous": "" } },
  "email_funnel": [ { "segment": "", "sent": 0, "opened": 0, "clicked": 0, "converted": 0, "open_rate": 0, "ctr": 0, "conversion_rate": 0 } ],
  "winter_interest": { "current_30d": 0, "previous_30d": 0, "change_pct": 0, "top_products": [] },
  "quote_gap": [ { "segment": "", "quoted_not_purchased": 0 } ],
  "recommendations": [ { "for_brief_field": "messaging | variants | products | timing", "recommendation": "", "evidence": "" } ],
  "caveats": []
}
```

## Hand-off

- BASELINE → *"Insights `<insights_id>` ready: <n> recommendations for the brief."* The brief step reads them from
  the conversation.
- `NO_DATA_VIEW` → *"No suitable CJA data view: continuing without insights."*
- READ-BACK → report only; log it via `teamf-core-decision-trail` (LOG) if the flow is running.

## Skill isolation (Team F)

- This is a **Team F** skill. Other teams may have skills with similar names or purposes in the same org.
- When this skill hands off to, or calls, another skill, use **only `teamf-` skills, by their exact name**.
  **Never substitute** another team's or a generic skill with a similar purpose.
- If a required `teamf-` skill isn't available, **stop** and say which one is missing.
- Adobe CJA tools and built-in Adobe skills may be used as **tools**; they never replace a `teamf-` step.

## Guardrails

- **Read-only.** Don't create, edit, share or delete CJA projects, data views, segments, calculated metrics or
  schedules, unless a human explicitly asks. If asked to save a report, create it as a private project named
  `TeamF - <insights_id>`.
- Never invent numbers, component names or dates. If a metric isn't available, say so.
- Never present historical data as live. Always state the window and the latest data date.
- Insights never change the audience, the offer limits or the guardrails. They only inform messaging emphasis.
- Keep personal data out of outputs: aggregates only, no individual customer rows.

## Worked example (illustrative only, not real data)

Trigger: Hamburg storm (20095), audience with Drivers + Fleet managers, product family "Firestone Winterhawk".
- Data view found: "Tyre Customer Journeys" (includes interaction, profile and vehicle datasets). Latest data: 30 Nov.
- Baseline 2 Sep – 30 Nov, Hamburg: Drivers open 41%, CTR 16%, conversion 20%; Fleet managers open 45%, CTR 27%,
  conversion 24%. Winter-tyre views +38% (last 30 days vs previous). Quote-without-purchase: Drivers 310, Fleet 95.
- Recommendations: (1) Fleet CTR ≈ 1.7× Drivers → lead the Fleet subject with uptime. (2) 310 Driver quote
  abandoners → emphasise the Replace variant and the offer terms. (3) Winter interest rising → feature Firestone
  Winterhawk in the hero. Caveat: historical baseline; data ends 30 Nov.

## Test cases

| Case | Scenario | Expected |
|---|---|---|
| T1 | Suitable data view exists | BASELINE with funnel, trend, quote gap and 2–4 recommendations |
| T2 | No data view with interaction events | `NO_DATA_VIEW`; flow continues |
| T3 | Data ends months before today | Windows anchored to the latest data date; caveat added |
| T4 | No vehicle-usage dimension | Funnel without segment split; `PARTIAL`; noted |
| T5 | Asked to "save this as a dashboard" | Private project `TeamF - <insights_id>` only |
| T6 | Tempted to recommend "best-selling" claim | Not recommended unless a brand check allows it |
| T7 | READ-BACK before any release | Says there's no campaign data yet |
