/**
 * SYNTHETIC DATA GENERATOR
 * ------------------------------------------------------------------
 * Generates a deterministic (seeded) fake dataset that mirrors the field
 * names confirmed in the real AEP sandbox (see project handoff, Section 7).
 * NOTHING here is real Bridgestone, customer, weather or competitor data.
 * Same seed => same counts every run, so demo numbers are reproducible.
 */

export const SIMULATION_LABEL =
  "SIMULATED — synthetic demo data, not connected to Adobe Experience Platform";

// ---------- seeded RNG ----------
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- types (field names mirror the real schema where confirmed) ----------
export type Market = "DE" | "BE";
export type TyreCategory = "winter" | "allSeason" | "summer";

export interface Region {
  market: Market;
  postalPrefix: string; // first 2 digits of the postal code
  city: string;
  dealerId: string;
}

export interface Dealer {
  dealerId: string;
  market: Market;
  name: string;
  city: string;
  postalPrefixes: string[];
}

export interface Product {
  productId: string;
  name: string;
  category: TyreCategory;
  currentPrice: number;
}

export interface CustomerProfile {
  customerId: string;
  market: Market;
  postalCode: string; // string, keeps leading zeros (e.g. Dresden 01xxx)
  city: string;
  preferredLanguage: string;
  marketingConsent: boolean;
  emailOptIn: boolean;
  smsOptIn: boolean;
  contactsLast30d: number; // campaign contacts in last 30 days (frequency rule)
}

export interface VehicleTyre {
  customerId: string;
  vehicleMake: string;
  tyreSeason: TyreCategory; // currently fitted
  tyreAgeMonths: number;
  treadDepthMm: number;
  replacementDue: boolean;
  recommendedProduct: string;
}

export type InteractionType = "productViewed" | "quoteRequested" | "purchaseCompleted" | "dealerSelected" | "serviceBooked";
export interface InteractionEvent {
  eventId: string;
  customerId: string;
  eventType: InteractionType;
  timestamp: string;
  productId?: string;
  productCategory?: TyreCategory;
  dealerId?: string;
}

export type SignalType = "competitorPrice" | "inventory" | "demand" | "dealerCapacity";
export interface BusinessSignal {
  signalId: string;
  signalType: SignalType;
  market: Market;
  timestamp: string;
  productId?: string;
  productCategory?: TyreCategory;
  competitorName?: string;
  competitorProduct?: string;
  competitorCategory?: TyreCategory;
  competitorPrice?: number;
  competitorPreviousPrice?: number;
  currentPrice?: number;
  productPromotion?: string | null;
  inventoryUnits?: number;
  inventoryStatus?: "available" | "limited" | "constrained";
  demandIndex?: number; // 1.0 = seasonal baseline
  demandTrend?: "rising" | "flat" | "falling";
  dealerId?: string;
  dealerCapacity?: number; // free fitting slots, next 7 days
}

export interface ExternalContextEvent {
  eventId: string;
  eventType: "weatherAlert";
  market: Market;
  postalCode: string; // postal prefix level (2 digits) — join key to profiles
  city: string;
  severity: "low" | "moderate" | "high" | "severe";
  snowProbability: number;
  minTempC: number;
  description: string;
  validFrom: string;
  validUntil: string;
  source: string;
}

export interface Dataset {
  meta: { label: string; seed: number; anchorDate: string; generatedAt: string; counts: Record<string, number> };
  regions: Region[];
  dealers: Dealer[];
  products: Product[];
  profiles: CustomerProfile[];
  vehicles: VehicleTyre[];
  interactions: InteractionEvent[];
  businessSignals: BusinessSignal[];
  externalContext: ExternalContextEvent[];
}

// ---------- static reference data (synthetic) ----------
export const DEALERS: Dealer[] = [
  { dealerId: "DE-D01", market: "DE", name: "Reifenpartner München (synthetic)", city: "München", postalPrefixes: ["80", "81"] },
  { dealerId: "DE-D02", market: "DE", name: "Reifenpartner Ingolstadt (synthetic)", city: "Ingolstadt", postalPrefixes: ["85"] },
  { dealerId: "DE-D03", market: "DE", name: "Reifenpartner Augsburg (synthetic)", city: "Augsburg", postalPrefixes: ["86"] },
  { dealerId: "DE-D04", market: "DE", name: "Reifenpartner Stuttgart (synthetic)", city: "Stuttgart", postalPrefixes: ["70"] },
  { dealerId: "DE-D05", market: "DE", name: "Reifenpartner Köln (synthetic)", city: "Köln", postalPrefixes: ["50"] },
  { dealerId: "DE-D06", market: "DE", name: "Reifenpartner Hamburg (synthetic)", city: "Hamburg", postalPrefixes: ["20"] },
  { dealerId: "DE-D07", market: "DE", name: "Reifenpartner Berlin (synthetic)", city: "Berlin", postalPrefixes: ["10"] },
  { dealerId: "DE-D08", market: "DE", name: "Reifenpartner Dresden (synthetic)", city: "Dresden", postalPrefixes: ["01"] },
  { dealerId: "DE-D09", market: "DE", name: "Reifenpartner Frankfurt (synthetic)", city: "Frankfurt", postalPrefixes: ["60"] },
  { dealerId: "BE-D01", market: "BE", name: "Pneus Partenaire Bruxelles (synthetic)", city: "Bruxelles", postalPrefixes: ["10"] },
  { dealerId: "BE-D02", market: "BE", name: "Bandenpartner Antwerpen (synthetic)", city: "Antwerpen", postalPrefixes: ["20"] },
  { dealerId: "BE-D03", market: "BE", name: "Bandenpartner Gent (synthetic)", city: "Gent", postalPrefixes: ["90"] },
  { dealerId: "BE-D04", market: "BE", name: "Pneus Partenaire Liège (synthetic)", city: "Liège", postalPrefixes: ["40"] },
  { dealerId: "BE-D05", market: "BE", name: "Pneus Partenaire Namur (synthetic)", city: "Namur", postalPrefixes: ["50"] },
];

export const REGIONS: Region[] = DEALERS.flatMap((d) =>
  d.postalPrefixes.map((p) => ({ market: d.market, postalPrefix: p, city: d.city, dealerId: d.dealerId })),
);

export const PRODUCTS: Product[] = [
  { productId: "SYN-WIN-A", name: "Winter Tyre Model A (synthetic)", category: "winter", currentPrice: 129 },
  { productId: "SYN-WIN-B", name: "Winter Tyre Model B (synthetic)", category: "winter", currentPrice: 159 },
  { productId: "SYN-ALL-A", name: "All-Season Tyre Model A (synthetic)", category: "allSeason", currentPrice: 139 },
  { productId: "SYN-SUM-A", name: "Summer Tyre Model A (synthetic)", category: "summer", currentPrice: 119 },
];

// Weather scenario per region (synthetic). Bavaria gets the severe event.
const WEATHER: Record<string, { severity: ExternalContextEvent["severity"]; snow: number; minTemp: number }> = {
  "DE-80": { severity: "severe", snow: 0.93, minTemp: -9 },
  "DE-81": { severity: "severe", snow: 0.91, minTemp: -9 },
  "DE-85": { severity: "severe", snow: 0.88, minTemp: -11 },
  "DE-86": { severity: "high", snow: 0.82, minTemp: -8 },
  "DE-70": { severity: "high", snow: 0.71, minTemp: -6 },
  "DE-01": { severity: "moderate", snow: 0.48, minTemp: -4 },
  "DE-10": { severity: "moderate", snow: 0.35, minTemp: -2 },
  "DE-60": { severity: "low", snow: 0.22, minTemp: 0 },
  "DE-50": { severity: "low", snow: 0.12, minTemp: 2 },
  "DE-20": { severity: "low", snow: 0.1, minTemp: 1 },
  "BE-40": { severity: "high", snow: 0.66, minTemp: -5 },
  "BE-50": { severity: "high", snow: 0.62, minTemp: -5 },
  "BE-10": { severity: "low", snow: 0.18, minTemp: 1 },
  "BE-20": { severity: "low", snow: 0.14, minTemp: 2 },
  "BE-90": { severity: "low", snow: 0.11, minTemp: 2 },
};

const DEALER_CAPACITY: Record<string, number> = {
  "DE-D01": 140, "DE-D02": 45, "DE-D03": 12, "DE-D04": 80, "DE-D05": 90, "DE-D06": 110, "DE-D07": 150, "DE-D08": 60, "DE-D09": 95,
  "BE-D01": 70, "BE-D02": 65, "BE-D03": 40, "BE-D04": 18, "BE-D05": 22,
};

const MAKES = ["VW", "BMW", "Mercedes-Benz", "Audi", "Opel", "Ford", "Skoda", "Renault", "Peugeot", "Toyota"];

// ---------- generator ----------
export function generateDataset(opts: { seed?: number; anchor?: Date; deCustomers?: number; beCustomers?: number } = {}): Dataset {
  const seed = opts.seed ?? 20261124;
  const rnd = mulberry32(seed);
  const anchor = opts.anchor ?? startOfUtcDay(new Date());
  const DAY = 86_400_000;
  const iso = (msOffset: number) => new Date(anchor.getTime() + msOffset).toISOString();
  const pick = <T,>(arr: T[]) => arr[Math.floor(rnd() * arr.length)];
  const chance = (p: number) => rnd() < p;

  const profiles: CustomerProfile[] = [];
  const vehicles: VehicleTyre[] = [];
  const interactions: InteractionEvent[] = [];
  let ev = 0;
  const addEvent = (e: Omit<InteractionEvent, "eventId">) => interactions.push({ eventId: `EVT-${String(++ev).padStart(7, "0")}`, ...e });

  const makeCustomers = (market: Market, n: number) => {
    const regions = REGIONS.filter((r) => r.market === market);
    for (let i = 0; i < n; i++) {
      const customerId = `${market}-C${String(i + 1).padStart(6, "0")}`;
      const region = pick(regions);
      const postalCode = market === "DE"
        ? region.postalPrefix + String(Math.floor(rnd() * 1000)).padStart(3, "0")
        : region.postalPrefix + String(Math.floor(rnd() * 100)).padStart(2, "0");
      const preferredLanguage = market === "DE" ? "de-DE" : ["40", "50", "10"].includes(region.postalPrefix) ? "fr-BE" : "nl-BE";
      profiles.push({
        customerId, market, postalCode, city: region.city, preferredLanguage,
        marketingConsent: chance(0.74),
        emailOptIn: chance(0.9),
        smsOptIn: chance(0.35),
        contactsLast30d: chance(0.1) ? 3 + Math.floor(rnd() * 3) : Math.floor(rnd() * 3),
      });

      const tyreSeason: TyreCategory = chance(0.55) ? "summer" : chance(0.6) ? "allSeason" : "winter";
      const tyreAgeMonths = 6 + Math.floor(rnd() * 66);
      const treadDepthMm = Math.round((8 - tyreAgeMonths / 12 - rnd() * 1.5) * 10) / 10;
      const replacementDue = treadDepthMm < 4 || tyreAgeMonths > 60;
      vehicles.push({
        customerId, vehicleMake: pick(MAKES), tyreSeason, tyreAgeMonths,
        treadDepthMm: Math.max(1.6, treadDepthMm), replacementDue,
        recommendedProduct: chance(0.7) ? "SYN-WIN-A" : "SYN-WIN-B",
      });

      // interaction history (last 120 days relative to anchor)
      const ago = (maxDays: number) => iso(-Math.floor(rnd() * maxDays * DAY));
      const winterIntent = chance(replacementDue ? 0.5 : 0.2);
      const views = Math.floor(rnd() * 3) + (winterIntent ? 1 : 0);
      for (let v = 0; v < views; v++) {
        const prod = winterIntent && v === 0 ? pick(PRODUCTS.filter((p) => p.category === "winter")) : pick(PRODUCTS);
        addEvent({ customerId, eventType: "productViewed", timestamp: winterIntent && v === 0 ? ago(21) : ago(120), productId: prod.productId, productCategory: prod.category });
      }
      if (winterIntent && chance(0.45)) {
        addEvent({ customerId, eventType: "quoteRequested", timestamp: ago(21), productId: "SYN-WIN-A", productCategory: "winter", dealerId: region.dealerId });
      }
      if (chance(0.12)) {
        const prod = pick(PRODUCTS);
        addEvent({ customerId, eventType: "purchaseCompleted", timestamp: ago(120), productId: prod.productId, productCategory: prod.category, dealerId: region.dealerId });
      }
      if (chance(0.6)) {
        addEvent({ customerId, eventType: "dealerSelected", timestamp: ago(120), dealerId: chance(0.9) ? region.dealerId : pick(DEALERS.filter((d) => d.market === market)).dealerId });
      }
      if (chance(0.08)) addEvent({ customerId, eventType: "serviceBooked", timestamp: iso(Math.floor(rnd() * 10) * DAY), dealerId: region.dealerId });
    }
  };
  makeCustomers("DE", opts.deCustomers ?? 12000);
  makeCustomers("BE", opts.beCustomers ?? 5000);

  // ---------- business signals ----------
  const businessSignals: BusinessSignal[] = [];
  let sg = 0;
  const addSignal = (s: Omit<BusinessSignal, "signalId">) => businessSignals.push({ signalId: `SIG-${String(++sg).padStart(5, "0")}`, ...s });

  // Competitor price movements (synthetic "Competitor X")
  addSignal({ signalType: "competitorPrice", market: "DE", timestamp: iso(-2 * DAY), productId: "SYN-WIN-A", productCategory: "winter", competitorName: "Competitor X", competitorProduct: "Competitor X Winter (comparable to SYN-WIN-A)", competitorCategory: "winter", competitorPreviousPrice: 135, competitorPrice: 114.75, currentPrice: 129, productPromotion: null });
  addSignal({ signalType: "competitorPrice", market: "DE", timestamp: iso(-24 * DAY), productId: "SYN-ALL-A", productCategory: "allSeason", competitorName: "Competitor X", competitorProduct: "Competitor X AllSeason", competitorCategory: "allSeason", competitorPreviousPrice: 145, competitorPrice: 133.4, currentPrice: 139, productPromotion: null });
  addSignal({ signalType: "competitorPrice", market: "BE", timestamp: iso(-3 * DAY), productId: "SYN-ALL-A", productCategory: "allSeason", competitorName: "Competitor X", competitorProduct: "Competitor X AllSeason", competitorCategory: "allSeason", competitorPreviousPrice: 149, competitorPrice: 131.1, currentPrice: 142, productPromotion: null });

  // Inventory
  addSignal({ signalType: "inventory", market: "DE", timestamp: iso(-6 * 3600_000), productId: "SYN-WIN-A", productCategory: "winter", inventoryUnits: 2380, inventoryStatus: "available" });
  addSignal({ signalType: "inventory", market: "DE", timestamp: iso(-6 * 3600_000), productId: "SYN-WIN-B", productCategory: "winter", inventoryUnits: 160, inventoryStatus: "constrained" });
  addSignal({ signalType: "inventory", market: "DE", timestamp: iso(-6 * 3600_000), productId: "SYN-ALL-A", productCategory: "allSeason", inventoryUnits: 1900, inventoryStatus: "available" });
  addSignal({ signalType: "inventory", market: "BE", timestamp: iso(-6 * 3600_000), productId: "SYN-WIN-A", productCategory: "winter", inventoryUnits: 210, inventoryStatus: "constrained" });
  addSignal({ signalType: "inventory", market: "BE", timestamp: iso(-6 * 3600_000), productId: "SYN-ALL-A", productCategory: "allSeason", inventoryUnits: 1400, inventoryStatus: "available" });

  // Demand
  addSignal({ signalType: "demand", market: "DE", timestamp: iso(-6 * 3600_000), productCategory: "winter", demandIndex: 1.34, demandTrend: "rising" });
  addSignal({ signalType: "demand", market: "DE", timestamp: iso(-6 * 3600_000), productCategory: "allSeason", demandIndex: 1.02, demandTrend: "flat" });
  addSignal({ signalType: "demand", market: "BE", timestamp: iso(-6 * 3600_000), productCategory: "winter", demandIndex: 1.18, demandTrend: "rising" });

  // Dealer capacity
  for (const d of DEALERS) addSignal({ signalType: "dealerCapacity", market: d.market, timestamp: iso(-6 * 3600_000), dealerId: d.dealerId, dealerCapacity: DEALER_CAPACITY[d.dealerId] });

  // ---------- external context (weather) ----------
  const externalContext: ExternalContextEvent[] = [];
  let wx = 0;
  for (const r of REGIONS) {
    const w = WEATHER[`${r.market}-${r.postalPrefix}`];
    // current alert window
    externalContext.push({
      eventId: `WX-${String(++wx).padStart(5, "0")}`, eventType: "weatherAlert", market: r.market, postalCode: r.postalPrefix, city: r.city,
      severity: w.severity, snowProbability: w.snow, minTempC: w.minTemp,
      description: w.severity === "severe" ? "Heavy snowfall and black ice expected (synthetic)" : w.severity === "high" ? "Snow and freezing temperatures expected (synthetic)" : "Cold, mostly dry (synthetic)",
      validFrom: iso(-6 * 3600_000), validUntil: iso(72 * 3600_000), source: "Synthetic Weather Forecast Service",
    });
    // expired historical record (should be ignored by validity filters)
    externalContext.push({
      eventId: `WX-${String(++wx).padStart(5, "0")}`, eventType: "weatherAlert", market: r.market, postalCode: r.postalPrefix, city: r.city,
      severity: "high", snowProbability: 0.7, minTempC: -5, description: "Expired historical alert (synthetic)",
      validFrom: iso(-40 * DAY), validUntil: iso(-37 * DAY), source: "Synthetic Weather Forecast Service",
    });
  }

  return {
    meta: {
      label: SIMULATION_LABEL, seed, anchorDate: anchor.toISOString(), generatedAt: new Date().toISOString(),
      counts: { profiles: profiles.length, vehicles: vehicles.length, interactions: interactions.length, businessSignals: businessSignals.length, externalContext: externalContext.length },
    },
    regions: REGIONS, dealers: DEALERS, products: PRODUCTS,
    profiles, vehicles, interactions, businessSignals, externalContext,
  };
}

function startOfUtcDay(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

// ---------- singleton + indexes ----------
let _ds: Dataset | null = null;
export function dataset(): Dataset {
  if (!_ds) {
    const anchor = process.env.DEMO_ANCHOR_DATE ? new Date(process.env.DEMO_ANCHOR_DATE) : undefined;
    _ds = generateDataset({ anchor, seed: process.env.DATA_SEED ? Number(process.env.DATA_SEED) : undefined });
  }
  return _ds;
}

export interface CustomerView {
  profile: CustomerProfile;
  vehicle: VehicleTyre;
  events: InteractionEvent[];
}
let _byCustomer: Map<string, CustomerView> | null = null;
export function customers(): Map<string, CustomerView> {
  if (_byCustomer) return _byCustomer;
  const ds = dataset();
  const m = new Map<string, CustomerView>();
  const veh = new Map(ds.vehicles.map((v) => [v.customerId, v]));
  for (const p of ds.profiles) m.set(p.customerId, { profile: p, vehicle: veh.get(p.customerId)!, events: [] });
  for (const e of ds.interactions) m.get(e.customerId)?.events.push(e);
  _byCustomer = m;
  return m;
}

export function anchorTime(): number {
  return new Date(dataset().meta.anchorDate).getTime();
}
