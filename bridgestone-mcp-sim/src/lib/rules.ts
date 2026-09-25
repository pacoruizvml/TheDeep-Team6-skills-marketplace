/**
 * SYNTHETIC BRIDGESTONE RULESET + CLAIMS LIBRARY + DEMO CONFIGURATION
 * "Synthetic demonstration claims library. Not production legal guidance."
 * All wording, evidence references, thresholds and offers are demo configuration.
 */

export const RULESET_LABEL = "Synthetic demonstration ruleset & claims library. Not production legal guidance.";

// ---------------- demo configuration (not confirmed business values) ----------------
export const CONFIG = {
  maxArbitrationRounds: 3,
  maxDiscountPct: 10,
  frequencyCapContacts30d: 3, // customers with >= 3 contacts in last 30 days are excluded
  purchaseSuppressionDays: 90,
  winterIntentWindowDays: 30,
  quoteWindowDays: 30,
  minDealerCapacityForFittingOffer: 20,
  actionableSeverities: ["high", "severe"],
  minSnowProbability: 0.6,
  minCompetitorPriceDropPct: 10,
  competitorSignalMaxAgeDays: 7,
};

export interface ApprovedOffer {
  offerId: string;
  market: string;
  type: "service" | "discount";
  description: string;
  discountPct: number;
  requiresDealerCapacity: boolean;
  linkedClaimId: string;
  validFrom: string;
  validUntil: string;
}

export const APPROVED_OFFERS: ApprovedOffer[] = [
  {
    offerId: "OFFER-DE-FIT-01", market: "DE", type: "service",
    description: "Free fitting (Kostenlose Montage) with purchase of 4 winter tyres at participating dealers",
    discountPct: 0, requiresDealerCapacity: true, linkedClaimId: "CLAIM-DE-OFFER-001",
    validFrom: "2026-09-01", validUntil: "2027-02-28",
  },
  {
    offerId: "OFFER-DE-DISC-05", market: "DE", type: "discount",
    description: "5% off a set of 4 winter tyres at participating dealers",
    discountPct: 5, requiresDealerCapacity: false, linkedClaimId: "CLAIM-DE-OFFER-002",
    validFrom: "2026-09-01", validUntil: "2027-02-28",
  },
];

// ---------------- claims library ----------------
export interface ClaimEntry {
  claimId: string;
  claimFamily: string;
  category: "seasonal_readiness" | "performance" | "safety" | "offer" | "availability";
  market: string;
  language: string;
  product: string;
  approvedWording: string;
  allowedVariations: string[];
  requiredQualifiers: string[];
  prohibitedComparisons: string[];
  evidenceReference: string;
  validFrom: string;
  validUntil: string;
  status: "active" | "expired" | "draft";
}

export const CLAIMS_LIBRARY: ClaimEntry[] = [
  {
    claimId: "CLAIM-DE-READY-001", claimFamily: "winter_readiness", category: "seasonal_readiness", market: "DE", language: "de-DE", product: "all-winter",
    approvedWording: "Jetzt ist der richtige Zeitpunkt, Ihr Fahrzeug auf den Winter vorzubereiten.",
    allowedVariations: ["Bereiten Sie Ihr Fahrzeug jetzt auf den Winter vor.", "Machen Sie Ihr Fahrzeug jetzt winterfit."],
    requiredQualifiers: [], prohibitedComparisons: ["competitor"], evidenceReference: "EVIDENCE-SYN-001",
    validFrom: "2026-09-01", validUntil: "2027-03-31", status: "active",
  },
  {
    claimId: "CLAIM-DE-WINTER-001", claimFamily: "winter_performance", category: "performance", market: "DE", language: "de-DE", product: "SYN-WIN-A",
    approvedWording: "Winterreifen sind für Temperaturen unter 7 °C sowie für Schnee und Eis entwickelt.",
    allowedVariations: ["Winterreifen sind für Schnee, Eis und Temperaturen unter 7 °C entwickelt."],
    requiredQualifiers: [], prohibitedComparisons: ["competitor", "absolute_superiority"], evidenceReference: "EVIDENCE-SYN-002",
    validFrom: "2026-09-01", validUntil: "2027-03-31", status: "active",
  },
  {
    claimId: "CLAIM-DE-OFFER-001", claimFamily: "offer_free_fitting", category: "offer", market: "DE", language: "de-DE", product: "SYN-WIN-A",
    approvedWording: "Kostenlose Montage beim Kauf von vier Winterreifen.",
    allowedVariations: ["Beim Kauf von vier Winterreifen ist die Montage kostenlos."],
    requiredQualifiers: ["Nur bei teilnehmenden Händlern", "Solange der Vorrat reicht"],
    prohibitedComparisons: ["competitor", "absolute_price"], evidenceReference: "EVIDENCE-SYN-003",
    validFrom: "2026-09-01", validUntil: "2027-02-28", status: "active",
  },
  {
    claimId: "CLAIM-DE-OFFER-002", claimFamily: "offer_discount_5", category: "offer", market: "DE", language: "de-DE", product: "SYN-WIN-A",
    approvedWording: "5 % Rabatt auf einen Satz von vier Winterreifen.",
    allowedVariations: [],
    requiredQualifiers: ["Nur bei teilnehmenden Händlern", "Solange der Vorrat reicht"],
    prohibitedComparisons: ["competitor", "absolute_price"], evidenceReference: "EVIDENCE-SYN-004",
    validFrom: "2026-09-01", validUntil: "2027-02-28", status: "active",
  },
  {
    claimId: "CLAIM-DE-AVAIL-001", claimFamily: "local_availability", category: "availability", market: "DE", language: "de-DE", product: "SYN-WIN-A",
    approvedWording: "Winterreifen jetzt bei Ihrem Händler vor Ort erhältlich.",
    allowedVariations: ["Jetzt bei Ihrem Händler vor Ort erhältlich."],
    requiredQualifiers: ["Solange der Vorrat reicht"], prohibitedComparisons: ["competitor"], evidenceReference: "EVIDENCE-SYN-005",
    validFrom: "2026-09-01", validUntil: "2027-03-31", status: "active",
  },
  {
    claimId: "CLAIM-DE-OLD-001", claimFamily: "winter_performance", category: "performance", market: "DE", language: "de-DE", product: "SYN-WIN-A",
    approvedWording: "Bis zu 10 % kürzerer Bremsweg auf Schnee.",
    allowedVariations: [], requiredQualifiers: ["Im Vergleich zum Vorgängermodell"], prohibitedComparisons: ["competitor"],
    evidenceReference: "EVIDENCE-SYN-099", validFrom: "2024-09-01", validUntil: "2025-03-31", status: "expired",
  },
  // English mirrors (so English test copy can be evaluated; the live demo copy is German)
  {
    claimId: "CLAIM-EN-READY-001", claimFamily: "winter_readiness", category: "seasonal_readiness", market: "DE", language: "en", product: "all-winter",
    approvedWording: "Now is the right time to prepare your vehicle for winter.",
    allowedVariations: ["Prepare your vehicle for winter now.", "Get your vehicle winter-ready now."],
    requiredQualifiers: [], prohibitedComparisons: ["competitor"], evidenceReference: "EVIDENCE-SYN-001",
    validFrom: "2026-09-01", validUntil: "2027-03-31", status: "active",
  },
  {
    claimId: "CLAIM-EN-OFFER-001", claimFamily: "offer_free_fitting", category: "offer", market: "DE", language: "en", product: "SYN-WIN-A",
    approvedWording: "Free fitting when you buy four winter tyres.",
    allowedVariations: [], requiredQualifiers: ["At participating dealers only", "While stocks last"],
    prohibitedComparisons: ["competitor", "absolute_price"], evidenceReference: "EVIDENCE-SYN-003",
    validFrom: "2026-09-01", validUntil: "2027-02-28", status: "active",
  },
];

// ---------------- governance categories (from the team overview doc) ----------------
export const GOVERNANCE_RULESET = {
  label: RULESET_LABEL,
  brandIdentity: {
    mission: "Help drivers stay safe and mobile in every season (synthetic placeholder)",
    positioning: "Trusted local tyre expertise (synthetic placeholder)",
    approvedTaglines: ["Sicher durch den Winter mit Ihrem Händler vor Ort (synthetic)"],
  },
  tone: ["Professional", "Helpful", "Authoritative", "Safety-oriented", "No fear-based urgency"],
  writingStyle: ["Clear", "Technical where useful", "Customer-focused", "Max one exclamation mark", "No ALL-CAPS words"],
  claims: {
    rules: [
      { ruleId: "CLM-01", name: "Comparative claims require like-for-like evidence", severity: "veto" },
      { ruleId: "CLM-02", name: "No absolute superiority claims (best, safest, No. 1)", severity: "veto" },
      { ruleId: "CLM-03", name: "No absolute price claims (lowest price, price guarantee)", severity: "veto" },
      { ruleId: "CLM-04", name: "Safety and performance claims must match an active claims-library entry", severity: "veto" },
      { ruleId: "CLM-05", name: "Environmental claims must match an active claims-library entry", severity: "veto" },
      { ruleId: "CLM-06", name: "Offers must carry all required qualifiers", severity: "veto" },
      { ruleId: "CLM-07", name: "Expired claims may not be used", severity: "veto" },
    ],
  },
  audienceGuardrails: ["Marketing consent", "Channel opt-in (email)", "Recent-purchase suppression", "Frequency cap", "Regional relevance", "Purpose match"],
  offerGuardrails: ["Approved offer only", "Discount limit", "Inventory condition", "Demand condition", "Dealer capacity"],
  segmentContext: ["Replacement", "Seasonal Swap", "B2B Fleet (not in live scope)", "B2C Consumer"],
};

// ---------------- deterministic claim detection ----------------
export type ClaimCategory = "comparative" | "absolute_superiority" | "absolute_price" | "safety" | "performance" | "environmental" | "offer" | "availability";

const PATTERNS: { category: ClaimCategory; ruleId: string; re: RegExp }[] = [
  { category: "comparative", ruleId: "CLM-01", re: /\b(günstiger|billiger|preiswerter|besser|stärker|sicherer|leiser)\s+als\b|\b(cheaper|better|safer|quieter|stronger)\s+than\b|\bmoins\s+cher\s+que\b|\bgoedkoper\s+dan\b|\bcompetitor\s*x\b|\bwettbewerb(er|s)?\b|\bkonkurren(z|t)\b|\bvs\.?\s/i },
  { category: "absolute_superiority", ruleId: "CLM-02", re: /\b(sicherste[nmrs]?|beste[nmrs]?|nr\.?\s*1|nummer\s*(1|eins)|marktführer|unschlagbar|safest|best|number\s*one|#\s*1|unbeatable|market\s*leader)\b/i },
  { category: "absolute_price", ruleId: "CLM-03", re: /niedrigste[nmrs]?\s+preis|tiefstpreis|bestpreis|preisgarantie|günstigste[nmrs]?|billigste[nmrs]?|lowest\s+price|best\s+price|price\s+guarantee|cheapest/i },
  { category: "safety", ruleId: "CLM-04", re: /\b(sicherheit|sicher|unfall\w*|lebensgefahr|safe|safety|accident\w*)\b/i },
  { category: "performance", ruleId: "CLM-04", re: /bremsweg|grip|haftung|traktion|aquaplaning|entwickelt|braking|traction|handling|laufleistung|mileage/i },
  { category: "environmental", ruleId: "CLM-05", re: /umweltfreundlich|nachhaltig|klimaneutral|co2|co₂|\beco\b|green|sustainab|environment/i },
  { category: "offer", ruleId: "CLM-06", re: /kostenlos|gratis|rabatt|\d+\s*%|\bfree\b|discount|sparen|\bsave\b/i },
  { category: "availability", ruleId: "CLM-06", re: /erhältlich|verfügbar|vorrätig|available|in stock/i },
];

const PROHIBITED: ClaimCategory[] = ["comparative", "absolute_superiority", "absolute_price"];

export function norm(s: string) {
  return s.toLowerCase().normalize("NFKC").replace(/[\s ]+/g, " ").replace(/[.!?,;:„“"'()]/g, "").trim();
}

export function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function libraryMatch(sentence: string, language: string): ClaimEntry | undefined {
  const n = norm(sentence);
  const lang = language.toLowerCase().startsWith("de") ? "de-DE" : "en";
  return CLAIMS_LIBRARY.find((c) => {
    if (c.language !== lang) return false;
    return [c.approvedWording, ...c.allowedVariations].some((w) => {
      const nw = norm(w);
      return n === nw || n.includes(nw);
    });
  });
}

function isQualifierSentence(sentence: string): boolean {
  const n = norm(sentence);
  return CLAIMS_LIBRARY.some((c) => c.requiredQualifiers.some((q) => n.includes(norm(q))));
}

export interface DetectedClaim {
  sentence: string;
  field: string;
  categories: ClaimCategory[];
  matchedClaimId?: string;
  matchedClaimStatus?: string;
  outcome: "approved" | "violation" | "neutral";
  ruleIds: string[];
  reason?: string;
}

export function analyseCopy(fields: Record<string, string | undefined>, language: string, todayIso: string) {
  const detected: DetectedClaim[] = [];
  const fullText = Object.values(fields).filter(Boolean).join("\n");
  const fullNorm = norm(fullText);

  for (const [field, value] of Object.entries(fields)) {
    if (!value) continue;
    for (const sentence of splitSentences(value)) {
      const cats = PATTERNS.filter((p) => p.re.test(sentence)).map((p) => p.category);
      const uniqueCats = [...new Set(cats)];
      const match = libraryMatch(sentence, language);
      const prohibitedHit = uniqueCats.filter((c) => PROHIBITED.includes(c));

      if (prohibitedHit.length > 0) {
        detected.push({
          sentence, field, categories: uniqueCats, matchedClaimId: match?.claimId, outcome: "violation",
          ruleIds: PATTERNS.filter((p) => prohibitedHit.includes(p.category)).map((p) => p.ruleId).filter((v, i, a) => a.indexOf(v) === i),
          reason: `Prohibited claim type without approved like-for-like evidence: ${prohibitedHit.join(", ")}`,
        });
        continue;
      }
      if (match) {
        const expired = match.status !== "active" || match.validUntil < todayIso.slice(0, 10);
        detected.push({
          sentence, field, categories: uniqueCats.length ? uniqueCats : [match.category as ClaimCategory], matchedClaimId: match.claimId,
          matchedClaimStatus: expired ? "expired" : "active", outcome: expired ? "violation" : "approved",
          ruleIds: expired ? ["CLM-07"] : [], reason: expired ? `Claim ${match.claimId} is expired (validUntil ${match.validUntil})` : undefined,
        });
        continue;
      }
      if (isQualifierSentence(sentence)) {
        detected.push({ sentence, field, categories: [], outcome: "neutral", ruleIds: [], reason: "Required qualifier text" });
        continue;
      }
      const claimCats = uniqueCats.filter((c) => ["safety", "performance", "environmental", "offer", "availability"].includes(c));
      if (claimCats.length > 0) {
        detected.push({
          sentence, field, categories: claimCats, outcome: "violation",
          ruleIds: PATTERNS.filter((p) => claimCats.includes(p.category)).map((p) => p.ruleId).filter((v, i, a) => a.indexOf(v) === i),
          reason: `Unsubstantiated ${claimCats.join("/")} claim: no active claims-library entry matches this wording`,
        });
      } else {
        detected.push({ sentence, field, categories: [], outcome: "neutral", ruleIds: [] });
      }
    }
  }

  // Required qualifiers for every approved claim used
  const missingQualifiers: { claimId: string; qualifier: string }[] = [];
  for (const d of detected.filter((x) => x.outcome === "approved" && x.matchedClaimId)) {
    const c = CLAIMS_LIBRARY.find((x) => x.claimId === d.matchedClaimId)!;
    for (const q of c.requiredQualifiers) if (!fullNorm.includes(norm(q))) missingQualifiers.push({ claimId: c.claimId, qualifier: q });
  }

  // Tone / style warnings (non-blocking)
  const warnings: { ruleId: string; message: string }[] = [];
  const exclamations = (fullText.match(/!/g) ?? []).length;
  if (exclamations > 1) warnings.push({ ruleId: "STY-01", message: `${exclamations} exclamation marks (max 1)` });
  const caps = fullText.match(/\b[A-ZÄÖÜ]{4,}\b/g) ?? [];
  if (caps.length) warnings.push({ ruleId: "STY-02", message: `ALL-CAPS words: ${caps.join(", ")}` });
  if (/lebensgefahr|gefährlich|danger|deadly/i.test(fullText)) warnings.push({ ruleId: "TON-01", message: "Fear-based wording" });

  return { detected, missingQualifiers, warnings };
}

export function constraintsFor(violations: DetectedClaim[], missingQualifiers: { claimId: string; qualifier: string }[]): string[] {
  const c = new Set<string>();
  const cats = new Set(violations.flatMap((v) => v.categories));
  if (cats.has("comparative")) {
    c.add("Remove the unsubstantiated competitor comparison");
    c.add("Do not name or allude to any competitor");
  }
  if (cats.has("absolute_price")) c.add("Do not imply absolute price leadership or a price guarantee");
  if (cats.has("absolute_superiority")) c.add("Remove absolute superiority language (best, safest, No. 1)");
  if (["safety", "performance", "environmental", "offer", "availability"].some((x) => cats.has(x as ClaimCategory)))
    c.add("Use only claims linked to active evidence records in the claims library (see list_approved_claims)");
  if (violations.some((v) => v.ruleIds.includes("CLM-07"))) c.add("Do not use expired claims");
  if (missingQualifiers.length) c.add(`Include all required qualifiers: ${[...new Set(missingQualifiers.map((m) => `"${m.qualifier}"`))].join(", ")}`);
  if (violations.length) c.add("Preserve the approved offer and its mandatory terms");
  return [...c];
}
