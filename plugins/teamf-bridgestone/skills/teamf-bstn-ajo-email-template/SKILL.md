---
name: teamf-bstn-ajo-email-template
description: >
  [Team F · Bridgestone Demo 1 · v1] Builds an on-brand Bridgestone email template in Adobe Journey Optimizer (AJO)
  and saves it as a new template (never overwrites). In the reactive flow (step 5 of teamf-bstn-orchestrator) it
  lays out the compliance-PASSED campaign content exactly as approved: storm alert bar, hero, body, offer panel,
  footer with required links and disclaimer. Standalone, it starts from a built-in winter-storm default brief that
  the user can override in plain text (city, market, language, audience, offer). Returns template name, ID and link.
  Use when asked to "create the Bridgestone email template", "build the storm email in AJO", "stage the email",
  or when called by teamf-bstn-orchestrator in step 5. Never writes new claims into the email, never sends or
  activates anything.
  Team F skill: use only when the request names Team F or a teamf- skill, or when called by another teamf- skill.
---

# Bridgestone AJO email template builder

You turn campaign content into a visual-editor-ready HTML email template in AJO. You are a **layout** step:
in the reactive flow the words come from the compliance-PASSED version, not from you.

## Two modes

| Mode | When | Where the words come from |
|---|---|---|
| **Flow** (default when called by `teamf-bstn-orchestrator`) | Step 5 of the reactive flow | The **PASSED** content from step 4 (subject, preheader, headline, body, CTA, offer, terms, language) + the brief. Use it **verbatim**. |
| **Standalone** | A user asks for a Bridgestone email template directly | The built-in default brief below, with any overrides the user typed |

**Flow-mode rule: no new copy.** Everything a customer reads must be the PASSED text or one of the neutral
boilerplate strings listed in "Fixed boilerplate". If a section needs text you don't have, leave the section out;
don't invent it. Changing wording after PASS would bypass compliance: if the content must change, stop and send it
back through `teamf-bstn-campaign-draft` and compliance (step 4).

## Entry check (run before anything else)

Check every item. If any fails, **stop**: create nothing. Reply `ENTRY CHECK FAILED: teamf-bstn-ajo-email-template`
and list each failed item with what's needed. If all pass, print one line `Entry check passed` and continue.

1. **Sandbox is known:** the sandbox the flow / session is working in, or one the user named. Never guess one.
   Ask only if no sandbox is known.
2. **AJO content tools are available** to create an email template (find them by tool name / capability, not by
   connector name).
3. **Flow mode only:** the step 4 verdict is **PASS** and you have that exact version's content, its
   `copy_version` and `reviewId`, the `brief_id`, and the audience (`audience_id`, `audience_name`).

## Built-in default brief (standalone mode only): "Inside The Deep – Winter Storm Reactive"

| Item | Default value |
|---|---|
| Trigger | Early-winter severe storm forecast for the recipient's area |
| Market / language | Germany, de-DE (English if the user asks for EN / North America) |
| Audience | Consumer drivers (fleet block is optional, see Conditional content) |
| Competitive angle | A competitor has cut winter-tyre prices; respond on value (offer + service), never by naming or comparing to the competitor |
| Offer | Free fitting with a set of 4 winter tyres at participating dealers; any discount is a **placeholder** and never above the maximum in the Bridgestone governance checks (10% unless the checks say otherwise) |
| Primary CTA | Drivers: "Reifenwechsel buchen" / "Book my tyre swap". Fleet: "Flotten-Termine reservieren" / "Reserve fleet slots" |
| Secondary CTA | "Händler in meiner Nähe finden" / "Find my nearest dealer" |
| Tone | Urgent but calm, practical, helpful |

List the final brief back to the user in 3–5 bullets, marking every override and every placeholder.
In standalone mode the result is **not compliance-reviewed**: say so, and recommend running it through
`submit_campaign_for_review` before any use.

## 1 · Resolve the brand

Use the Bridgestone brand kit if a brand / asset tool provides one. Otherwise:
- Colors: red `#E60012`, black `#000000`, white `#FFFFFF`, light grey `#EEEEEE`, storm blue gradient `#3D5A73` → `#101820`
- Wordmark: text "BRIDGESTONE", bold, uppercase, letter-spaced (no logo file unless an AEM asset is given)
- Font: Arial, Helvetica, sans-serif
- Voice: confident, practical, never exaggerated

## 2 · Build the HTML

600px, table-based, inline styles. Class names keep it editable in the AJO visual editor: outer table
`acr-container`, each section `acr-structure`, content cells `acr-fragment`.
Hidden preheader right after `<body>` (flow: the PASSED preheader; standalone: the boilerplate one).

| # | Section | Content |
|---|---|---|
| 1 | Alert bar | Black strip: red "● LIVE" + alert label + city, and the "View online" mirror-page link |
| 2 | Header | Red rounded block with the white wordmark; links "Händler finden" / "Reifen" (Find a dealer / Tyres) |
| 3 | Hero | Storm-blue gradient, ❄ glyphs, red eyebrow (alert label), H1 = PASSED **headline**, greeting with first name |
| 4 | Body | PASSED **body** text, as paragraphs. Optional audience-conditional block (section 3 below) |
| 5 | Offer | Red panel: PASSED **offer** line + code + validity + "bei teilnehmenden Händlern", white button = PASSED **CTA**, secondary link "Händler in meiner Nähe finden ›" |
| 6 | Footer | Black: wordmark, customer-care and social links, disclaimer, **AJO opt-out link**, mirror-page link, Privacy Policy, © year |

**Required links, exact markup** (AJO only recognises these attributes; plain "Abmelden" / "unsubscribe" text
or a normal URL triggers *"The opt-out link is not present in the email body"*):
- Opt-out (footer): `<a href="#" data-nl-type="optOut" data-tracking-type="DIRECT_OPTOUT" data-tags="optoutLevel:identity">Abmelden</a>` (EN text: "Unsubscribe")
- Mirror page (alert bar): `<a href="#" data-nl-type="mirrorPage" data-tracking-type="MIRROR_PAGE">Im Browser ansehen</a>` (EN text: "View online")
- Privacy policy: a normal link (placeholder URL)

**Plain-text version (required):** also produce `text_body`: the same PASSED text as plain text, in section
order (headline, body, offer line + terms, CTA with the dealer-finder URL, disclaimer), ending with an
"Abmelden" / "Unsubscribe" line that uses the opt-out link or placeholder the AJO text editor provides. No HTML
tags, no new wording. An empty text version triggers *"Text version of HTML is empty."*

**Visuals without image files:** color blocks, gradients, rounded badges, icons (❄ 📏 🌡 🔧). If AEM asset
locations are given, use the AEM image embed markup instead.

**Personalization** (AJO expression syntax, always with a fallback):
- First name: `{%= profile.person.name.firstName ?: "Kundin, Kunde" %}` (EN: `?: "there"`)
- City: `{%= profile.homeAddress.city ?: "Ihrer Region" %}` (EN: `?: "your area"`)
- These paths are the standard XDM ones. If the sandbox schema uses tenant fields, map them and say which paths
  you used. **Flow mode:** the storm city is known from the trigger, so you may write it as fixed text
  (e.g. "München") instead of the profile city; the audience is already geo-limited.

## 3 · Conditional content (optional)

Include only if the audience from step 2 contains fleet managers (segments in the brief), or the user asks:

```
{%#if profile.person.occupation = "Fleet Manager"%}
  fleet block (flow mode: only PASSED fleet text; otherwise omit the block)
{%else%}
  driver block: the "3 checks" list from Fixed boilerplate
{%/if%}
```
Say which profile attribute you used and that it must be mapped to the real fleet attribute.

## 4 · Fixed boilerplate (neutral, no claims; allowed in both modes)

| Use | de-DE | en |
|---|---|---|
| Alert label | "UNWETTERWARNUNG" | "SEVERE WEATHER ADVISORY" |
| Eyebrow | "FRÜHER WINTEREINBRUCH" | "EARLY-WINTER STORM FORECAST" |
| Preheader (standalone) | "Jetzt winterfit werden – bei Ihrem Bridgestone-Händler vor Ort." | "Get winter-ready before the storm arrives. Book at your local Bridgestone dealer." |
| 3 checks | "Profiltiefe prüfen · Reifendruck prüfen · Auf Winterreifen wechseln" | "Check tread depth · Check pressure · Swap to winter tyres" |
| Secondary CTA | "Händler in meiner Nähe finden" | "Find my nearest dealer" |
| Opt-out link text | "Abmelden" | "Unsubscribe" |
| Mirror-page link text | "Im Browser ansehen" | "View online" |
| Privacy link text | "Datenschutz" | "Privacy Policy" |
| Disclaimer (required) | "Angebot gültig bei teilnehmenden Händlern für begrenzte Zeit; es gelten die Teilnahmebedingungen. Die Reifenleistung hängt von Fahrzeug, Straßenverhältnissen, Reifendruck und Wartung ab. Fahren Sie stets den Bedingungen angepasst." | "Offer valid at participating dealers for a limited time; terms apply. Tyre performance varies with vehicle, road conditions, inflation and maintenance. Always drive for the conditions." |

Anything else is a claim and must come from the PASSED content.

## 5 · Compliance and technical rules

- Never add: "safest", "best", "No. 1", percentages other than the approved offer, stopping distances,
  guarantees, competitor names or price comparisons.
- Offer value never above the governance maximum (10% unless the Bridgestone checks say otherwise).
- Required links: opt-out and mirror page with the exact markup in section 2, and a privacy-policy link.
  These links, their fixed labels and the plain-text version are technical elements, **not copy changes**: they
  need no new compliance review. Any other wording change does.
- Public links point to bridgestone.de (DE) or bridgestonetire.com (NA); mark them as placeholders.
- No `<script>`, no `javascript:` links, no external CSS.

## 6 · Subject

- **Flow:** the PASSED subject, verbatim.
- **Standalone:** `{%= profile.person.name.firstName ?: "Hallo" %}, ein schwerer Wintersturm zieht auf {%= profile.homeAddress.city ?: "Ihre Region" %} zu`
  (EN: `{%= profile.person.name.firstName ?: "Hi" %}, a severe winter storm is heading to {%= profile.homeAddress.city ?: "your area" %}`).

## 7 · Create in AJO

- Channel: email; sandbox from the entry check.
- **Name:** flow: `TeamF - Bridgestone - <campaign name> - v<copy_version> - STAGED FOR DEMONSTRATION`;
  standalone: `TeamF - Bridgestone - Inside The Deep - Winter Storm Reactive (<audience>)`.
  If the name exists, add ` - run <HHmm>`; **always create a new template, never overwrite** unless asked.
- **Description:** one line: trigger, audience, `reviewId` + PASS round (flow), "not compliance-reviewed" (standalone).
- Save **subject, preheader, HTML body and plain-text body** in the template (a template without a subject or text
  version produces the same errors later in the campaign).
- After saving, **read the template back** and check: subject and headline match the PASSED text; HTML contains
  `data-nl-type="optOut"` and `data-nl-type="mirrorPage"`; text version not empty; no `<script>`. If you couldn't
  read it back, say so and ask the user to preview it.

## 7b · A template is not a staged campaign

AJO validates the **campaign's email message**, not the template. The orchestrator (step 5b) must: set an active
email configuration on the campaign, then write this output's `subject`, `preheader`, `html_body` and `text_body`
into the message's default variant (or apply this template to it), then run the readiness check. Standalone: say
this plainly when you report back.

**Known AJO validation errors and their fix:**

| Code / title | Level | Cause | Fix |
|---|---|---|---|
| CJMCMP-2302-400 "Incorrect package surface ID" | ERROR | Campaign email action has no / an invalid email configuration | Set an **active email configuration** of the sandbox on the email action |
| CJMCMP-4012-404 "Requested object not found" (source SURFACE) | ERROR | Same: configuration reference empty or deleted | Same as above; re-list active configurations, never reuse an old ID |
| CJMMAS-2000-422 "The subject line is missing." | ERROR | Message default variant has no subject | Write the PASSED subject into the message |
| CJMMAS-2005-422 "The email version of the message is empty." | ERROR | Message has no HTML body | Write `html_body` into the message / apply the template |
| CJMMAS-2001-200 "The opt-out link is not present in the email body." | WARNING | No link with `data-nl-type="optOut"` | Add the opt-out markup from section 2 |
| CJMMAS-2008-200 "Text version of HTML is empty." | WARNING | No plain-text body | Write `text_body` into the message |

Report "staged" only when the readiness check shows **zero ERROR items**; list remaining warnings.

## 8 · Output

Return this block (the orchestrator stores it in `steps.5_staged` and passes it to the approval gate):

```json
{
  "template_name": "", "template_id": "", "template_link": "", "sandbox": "",
  "copy_version": 1, "review_id": "", "brief_id": "", "audience_id": "", "audience_name": "",
  "language": "de-DE", "sections": ["alert", "header", "hero", "body", "offer", "footer"],
  "conditional_block": "none | fleet/driver on <attribute>",
  "subject": "", "preheader": "", "html_body_ref": "stored in template <template_id>", "text_body": "",
  "required_links": { "opt_out": true, "mirror_page": true, "privacy": true },
  "read_back_check": "passed | failed | not_done",
  "placeholders": ["phone number", "public links", "text wordmark instead of logo"]
}
```

Then a short section-by-section summary and the **before-sending list**: placeholders (offer amount if
invented, phone number), public links, text wordmark instead of the real logo, profile / fleet attribute mapping.

## Hand-off

- Flow → back to `teamf-bstn-orchestrator` with the output block. It attaches **this template** (the PASSED content)
  to the draft campaign's email, adds the audience and email configuration, runs the readiness check and opens the gate.
- Nothing is sent, published or activated here.

## Skill isolation (Team F)

- Hand off to, or call, only `teamf-` skills by exact name. If a required one is missing, stop and say which.
- Adobe platform tools (AJO content / template tools, AEM assets) are used as tools; they never replace a `teamf-` step.

## Guardrails

- Flow mode: PASSED text only; any wording change goes back to step 4.
- Never guess the sandbox; never overwrite a template; never send, publish or activate.
- Mark invented values (offer amount, phone number, links) as placeholders.

## Test cases

| Case | Input | Expected |
|---|---|---|
| T1 | Flow, PASS on v<n>, de-DE | New template "TeamF - Bridgestone - <campaign> - v<n> - STAGED FOR DEMONSTRATION"; subject/headline verbatim; output block with link |
| T2 | Flow, verdict still VETO | Entry check fails; nothing created |
| T3 | Flow, a section needs text not in the PASSED content | Section omitted; no invented copy |
| T4 | Standalone "Bridgestone storm email for Munich" | Default brief with city override; marked "not compliance-reviewed" |
| T5 | No sandbox known | Ask for it; create nothing |
| T6 | Name already exists | New template with " - run <HHmm>" suffix; old one untouched |
| T7 | Offer above 10% in input | Refuse to render it; report the governance limit |
| T8 | Any template created | HTML has optOut + mirrorPage markup; text_body not empty; subject saved |
| T9 | Campaign readiness shows CJMMAS-2000 / 2005 | Orchestrator writes subject/HTML/text into the message; re-checks; not "staged" until zero errors |
| T10 | Campaign readiness shows CJMCMP-2302 / 4012 | Active email configuration set on the email action; re-check |
