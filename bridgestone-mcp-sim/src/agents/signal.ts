/**
 * AGENT 1 — Signal-to-Audience Agent (MCP server)
 * Allowed: read weather/business signals, evaluate opportunity, compare strategies,
 * build & size audiences (simulated AEP segment evaluation), notify dealer, read dealer reply.
 * NOT allowed: write campaign copy, evaluate compliance, approve, stage journeys.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { customers, dataset, anchorTime, type Market, type TyreCategory } from "../lib/data.js";
import { CONFIG } from "../lib/rules.js";
import { audit, mutate, nextId, readState, now, type AudienceRecord } from "../lib/store.js";
import { ok, fail } from "../lib/mcp.js";
import fs from "node:fs";

/** External trigger feeds (weather + competitor pricing). Read on every call, so edits to the JSON apply without restart. */
const EXTERNAL_SIGNALS_FILE = process.env.EXTERNAL_SIGNALS_FILE ?? new URL("../fixtures/external-signals.json", import.meta.url);
function loadExternalSignals(): { weather_feed: Record<string, unknown>; competitor_pricing_feed: Record<string, unknown> } {
  return JSON.parse(fs.readFileSync(EXTERNAL_SIGNALS_FILE, "utf8"));
}

const DAY = 86_400_000;
const SEV_RANK = { low: 0, moderate: 1, high: 2, severe: 3 } as const;
const MarketZ = z.enum(["DE", "BE"]).describe("EMEA market code. Only DE and BE exist in the synthetic dataset.");

export const DEFAULT_DEALER_REPLY =
  "Prepare the winter-readiness campaign for the affected postal codes with the approved local offer. Tell customers that we are cheaper than Competitor X.";

function activeAlerts(market: Market) {
  const t = Date.now();
  return dataset().externalContext.filter((w) => w.market === market && Date.parse(w.validFrom) <= t && Date.parse(w.validUntil) >= t);
}

function withinDays(ts: string, days: number) {
  const t = Date.parse(ts);
  const ref = Math.max(Date.now(), anchorTime());
  return t <= ref && t >= ref - days * DAY;
}

export function buildSignalServer(): McpServer {
  const server = new McpServer({ name: "bridgestone-signal-to-audience-agent", version: "0.1.0" });

  server.registerTool("get_external_signals", {
    title: "Get external trigger signals (weather + competitor pricing)",
    description: "START HERE. Returns the external signal feeds that trigger a reactive campaign: the weather feed (WeatherGridAPI) and the competitor pricing feed (Competitor Price Monitor) for Germany. Use them to decide whether the opportunity is actionable, which postal areas are affected, and which competitor promotion is relevant. SIMULATED feeds.",
    inputSchema: { feed: z.enum(["all", "weather", "competitor"]).default("all").describe("Which feed to return") },
  }, async ({ feed }) => {
    const data = loadExternalSignals();
    const payload: Record<string, unknown> = {};
    if (feed !== "competitor") payload.weather_feed = data.weather_feed;
    if (feed !== "weather") payload.competitor_pricing_feed = data.competitor_pricing_feed;
    mutate((s) => audit(s, {
      agent: "signal", tool: "get_external_signals", eventType: "EXTERNAL_SIGNALS_READ",
      summary: `Read external feeds (${feed}): weather ${feed !== "competitor" ? (data.weather_feed.record_count as number) : 0} records, competitor ${feed !== "weather" ? (data.competitor_pricing_feed.record_count as number) : 0} records`,
      refs: { market: "DE" },
    }));
    return ok(payload);
  });

  server.registerTool("get_weather_alerts", {
    title: "Get active weather alerts",
    description: "Returns currently valid weather alerts (External Context Events, lake-only dataset) for a market, by postal prefix. SIMULATED data. Expired alerts are filtered out.",
    inputSchema: { market: MarketZ, minSeverity: z.enum(["low", "moderate", "high", "severe"]).optional() },
  }, async ({ market, minSeverity }) => {
    const alerts = activeAlerts(market)
      .filter((a) => !minSeverity || SEV_RANK[a.severity] >= SEV_RANK[minSeverity])
      .sort((a, b) => SEV_RANK[b.severity] - SEV_RANK[a.severity] || b.snowProbability - a.snowProbability);
    mutate((s) => audit(s, { agent: "signal", tool: "get_weather_alerts", eventType: "SIGNAL_READ", summary: `Read ${alerts.length} active weather alerts for ${market}`, refs: { market } }));
    return ok({ dataset: "External Context Events (synthetic)", market, evaluatedAt: now(), count: alerts.length, alerts });
  });

  server.registerTool("get_business_signals", {
    title: "Get business signals",
    description: "Returns Business Signal Events (lake-only dataset): competitor price moves, inventory, demand and dealer capacity. SIMULATED data.",
    inputSchema: { market: MarketZ, signalType: z.enum(["competitorPrice", "inventory", "demand", "dealerCapacity"]).optional() },
  }, async ({ market, signalType }) => {
    const signals = dataset().businessSignals
      .filter((s) => s.market === market && (!signalType || s.signalType === signalType))
      .map((s) => s.signalType === "competitorPrice" && s.competitorPrice && s.competitorPreviousPrice
        ? { ...s, competitorPriceChangePct: Math.round(((s.competitorPrice - s.competitorPreviousPrice) / s.competitorPreviousPrice) * 1000) / 10 }
        : s);
    mutate((s) => audit(s, { agent: "signal", tool: "get_business_signals", eventType: "SIGNAL_READ", summary: `Read ${signals.length} business signals for ${market}${signalType ? ` (${signalType})` : ""}`, refs: { market } }));
    return ok({ dataset: "Business Signal Events (synthetic)", market, count: signals.length, signals });
  });

  server.registerTool("evaluate_opportunity", {
    title: "Evaluate reactive opportunity (rule-based facts)",
    description: "Deterministic factor check: which postal areas meet the weather threshold, whether a recent competitor price drop is relevant to the product category, inventory and demand. Returns FACTS and threshold results; the agent decides and explains. Thresholds are demo configuration.",
    inputSchema: { market: MarketZ, productCategory: z.enum(["winter", "allSeason", "summer"]).default("winter") },
  }, async ({ market, productCategory }) => {
    const ds = dataset();
    const alerts = activeAlerts(market);
    const affected = alerts.filter((a) => CONFIG.actionableSeverities.includes(a.severity) && a.snowProbability >= CONFIG.minSnowProbability);
    const comp = ds.businessSignals
      .filter((s) => s.market === market && s.signalType === "competitorPrice" && withinDays(s.timestamp, CONFIG.competitorSignalMaxAgeDays))
      .map((s) => {
        const dropPct = Math.round(((s.competitorPreviousPrice! - s.competitorPrice!) / s.competitorPreviousPrice!) * 1000) / 10;
        const relevance = s.competitorCategory === productCategory ? "direct" : (s.competitorCategory === "allSeason" && productCategory === "winter") ? "partial (all-season is a partial substitute for winter)" : "none";
        return { signalId: s.signalId, competitor: s.competitorName, competitorProduct: s.competitorProduct, competitorCategory: s.competitorCategory, ourProductId: s.productId, dropPct, relevance, timestamp: s.timestamp, meetsThreshold: dropPct >= CONFIG.minCompetitorPriceDropPct };
      });
    const staleComp = ds.businessSignals.filter((s) => s.market === market && s.signalType === "competitorPrice" && !withinDays(s.timestamp, CONFIG.competitorSignalMaxAgeDays)).map((s) => ({ signalId: s.signalId, timestamp: s.timestamp, note: `older than ${CONFIG.competitorSignalMaxAgeDays} days — ignored` }));
    const inventory = ds.businessSignals.filter((s) => s.market === market && s.signalType === "inventory" && s.productCategory === productCategory);
    const demand = ds.businessSignals.find((s) => s.market === market && s.signalType === "demand" && s.productCategory === productCategory);
    const directComp = comp.filter((c) => c.relevance === "direct" && c.meetsThreshold);
    const availableProduct = inventory.find((i) => i.inventoryStatus !== "constrained");

    const checks = {
      weather: { pass: affected.length > 0, rule: `severity in [${CONFIG.actionableSeverities}] AND snowProbability >= ${CONFIG.minSnowProbability}`, affectedPostalPrefixes: affected.map((a) => a.postalCode), cities: [...new Set(affected.map((a) => a.city))] },
      competitor: { pass: directComp.length > 0, rule: `price drop >= ${CONFIG.minCompetitorPriceDropPct}% within ${CONFIG.competitorSignalMaxAgeDays} days on a directly comparable ${productCategory} product`, signals: comp, ignored: staleComp },
      inventory: { pass: !!availableProduct, products: inventory.map((i) => ({ productId: i.productId, units: i.inventoryUnits, status: i.inventoryStatus })) },
      demand: demand ? { demandIndex: demand.demandIndex, trend: demand.demandTrend } : null,
    };
    const allPass = checks.weather.pass && checks.competitor.pass && checks.inventory.pass;
    const result = {
      market, productCategory, evaluatedAt: now(), method: "Rule-based threshold checks (deterministic, not AI). Agent must interpret and justify.",
      checks, allThresholdsMet: allPass,
      candidateProductId: availableProduct?.productId ?? null,
    };
    mutate((s) => audit(s, { agent: "signal", tool: "evaluate_opportunity", eventType: "OPPORTUNITY_EVALUATED", summary: `${market}/${productCategory}: weather=${checks.weather.pass} competitor=${checks.competitor.pass} inventory=${checks.inventory.pass}`, refs: { market }, details: result }));
    return ok(result);
  });

  server.registerTool("compare_strategies", {
    title: "Compare Replacement vs Seasonal Swap",
    description: "Returns data for both strategies in the given postal areas: eligible population, inventory condition, dealer capacity and whether the competitor price signal is relevant. The agent chooses and logs its reasoning with build_audience.",
    inputSchema: { market: MarketZ, postalPrefixes: z.array(z.string()).min(1), productId: z.string().default("SYN-WIN-A") },
  }, async ({ market, postalPrefixes, productId }) => {
    const ds = dataset();
    let replacement = 0, swap = 0;
    for (const c of customers().values()) {
      if (c.profile.market !== market || !postalPrefixes.includes(c.profile.postalCode.slice(0, 2))) continue;
      if (c.vehicle.replacementDue) replacement++;
      const booked = c.events.some((e) => e.eventType === "serviceBooked");
      if (c.vehicle.tyreSeason === "summer" && !booked) swap++;
    }
    const inv = ds.businessSignals.find((s) => s.market === market && s.signalType === "inventory" && s.productId === productId);
    const dealers = ds.dealers.filter((d) => d.market === market && d.postalPrefixes.some((p) => postalPrefixes.includes(p)));
    const capacity = dealers.map((d) => ({ dealerId: d.dealerId, city: d.city, dealerCapacity: ds.businessSignals.find((s) => s.signalType === "dealerCapacity" && s.dealerId === d.dealerId)?.dealerCapacity }));
    const result = {
      market, postalPrefixes, productId,
      replacement: { basePopulation_replacementDue: replacement, needs: "inventory of the recommended product", inventory: inv ? { units: inv.inventoryUnits, status: inv.inventoryStatus } : null, competitorPriceSignalRelevant: true, note: "Replacement buyers compare tyre prices, so competitor price pressure is relevant." },
      seasonalSwap: { basePopulation_summerTyresNoBooking: swap, needs: "dealer fitting capacity", dealerCapacity: capacity, competitorPriceSignalRelevant: false, note: "Swap customers already own winter tyres; competitor tyre price is not relevant to them." },
      guidance: "Competitor price pressure favours Replacement; constrained inventory favours Swap; weather severity justifies either.",
    };
    mutate((s) => audit(s, { agent: "signal", tool: "compare_strategies", eventType: "STRATEGY_COMPARED", summary: `Replacement base ${replacement} vs Swap base ${swap} in ${postalPrefixes.join(",")}`, refs: { market }, details: result }));
    return ok(result);
  });

  server.registerTool("build_audience", {
    title: "Build and size audience (simulated AEP segment)",
    description: "Step 2 of the two-step design: qualifies the profile audience for the affected postal areas using deterministic segment rules (consent, suppression and frequency are built into the definition). Returns funnel counts after each filter. The agent must pass its strategy rationale, which is logged.",
    inputSchema: {
      market: MarketZ,
      postalPrefixes: z.array(z.string()).min(1).describe("Affected postal prefixes from evaluate_opportunity (Step 1)"),
      strategy: z.enum(["replacement", "seasonalSwap"]),
      productId: z.string().default("SYN-WIN-A"),
      rationale: z.string().min(10).describe("Why this strategy was chosen over the other (logged to the audit trail)"),
    },
  }, async ({ market, postalPrefixes, strategy, productId, rationale }) => {
    const ts = Date.now();
    const recent = (e: { timestamp: string }, days: number) => Date.parse(e.timestamp) <= ts + DAY && Date.parse(e.timestamp) >= ts - days * DAY;
    type Step = { step: string; rule: string; test: (c: ReturnType<typeof customers> extends Map<string, infer V> ? V : never) => boolean };
    const common: Step[] = [
      { step: `All customers in ${market}`, rule: `profile.market = '${market}'`, test: (c) => c.profile.market === market },
      { step: "Affected area", rule: `LEFT(profile.postalCode,2) IN (${postalPrefixes.map((p) => `'${p}'`).join(",")})`, test: (c) => postalPrefixes.includes(c.profile.postalCode.slice(0, 2)) },
    ];
    const stratSteps: Step[] = strategy === "replacement"
      ? [
          { step: "Replacement due", rule: "vehicle.replacementDue = true", test: (c) => c.vehicle.replacementDue },
          { step: "Winter-tyre intent", rule: `productViewed(category='winter') within ${CONFIG.winterIntentWindowDays}d`, test: (c) => c.events.some((e) => e.eventType === "productViewed" && e.productCategory === "winter" && recent(e, CONFIG.winterIntentWindowDays)) },
          { step: "Quote requested", rule: `quoteRequested within ${CONFIG.quoteWindowDays}d`, test: (c) => c.events.some((e) => e.eventType === "quoteRequested" && recent(e, CONFIG.quoteWindowDays)) },
          { step: "No recent purchase", rule: `NOT purchaseCompleted within ${CONFIG.purchaseSuppressionDays}d`, test: (c) => !c.events.some((e) => e.eventType === "purchaseCompleted" && recent(e, CONFIG.purchaseSuppressionDays)) },
        ]
      : [
          { step: "Fitted summer tyres", rule: "vehicle.tyreSeason = 'summer'", test: (c) => c.vehicle.tyreSeason === "summer" },
          { step: "No service booking", rule: "NOT serviceBooked (recent/upcoming)", test: (c) => !c.events.some((e) => e.eventType === "serviceBooked") },
        ];
    const guard: Step[] = [
      { step: "Marketing consent", rule: "profile.marketingConsent = true", test: (c) => c.profile.marketingConsent },
      { step: "Email channel opt-in", rule: "profile.emailOptIn = true", test: (c) => c.profile.emailOptIn },
      { step: "Within frequency cap", rule: `profile.contactsLast30d < ${CONFIG.frequencyCapContacts30d}`, test: (c) => c.profile.contactsLast30d < CONFIG.frequencyCapContacts30d },
    ];
    let pool = [...customers().values()];
    const funnel: AudienceRecord["funnel"] = [];
    for (const st of [...common, ...stratSteps, ...guard]) {
      pool = pool.filter(st.test);
      funnel.push({ step: st.step, rule: st.rule, count: pool.length });
    }
    const rec = mutate((s) => {
      const audienceId = nextId(s, "AUD-SEG", 3);
      const r: AudienceRecord = {
        audienceId, createdAt: now(), market, postalPrefixes, strategy, productId,
        definition: { strategy, rules: funnel.map((f) => f.rule), rationale },
        funnel, finalCount: pool.length, memberIds: pool.map((c) => c.profile.customerId),
      };
      s.audiences[audienceId] = r;
      audit(s, { agent: "signal", tool: "build_audience", eventType: "AUDIENCE_QUALIFIED", summary: `${audienceId}: ${strategy} audience in ${market} ${postalPrefixes.join(",")} = ${pool.length} profiles`, refs: { audienceId, market }, details: { funnel, rationale } });
      return r;
    });
    return ok({ audienceId: rec.audienceId, execution: "SIMULATED AEP segment evaluation over synthetic profiles", market, postalPrefixes, strategy, productId, funnel, finalCount: rec.finalCount, rationaleLogged: rationale });
  });

  server.registerTool("get_audience", {
    title: "Get audience summary",
    description: "Returns the audience definition, funnel and language mix (no personal data).",
    inputSchema: { audienceId: z.string() },
  }, async ({ audienceId }) => {
    const a = readState().audiences[audienceId];
    if (!a) return fail(`Unknown audienceId ${audienceId}`);
    const langs: Record<string, number> = {};
    for (const id of a.memberIds) { const l = customers().get(id)!.profile.preferredLanguage; langs[l] = (langs[l] ?? 0) + 1; }
    const { memberIds, ...rest } = a;
    return ok({ ...rest, languageMix: langs });
  });

  server.registerTool("get_dealer_breakdown", {
    title: "Get dealer breakdown for an audience",
    description: "Maps audience members to dealers. Mapping rule (demo configuration): last 'dealerSelected' interaction, fallback = dealer serving the customer's postal prefix.",
    inputSchema: { audienceId: z.string() },
  }, async ({ audienceId }) => {
    const a = readState().audiences[audienceId];
    if (!a) return fail(`Unknown audienceId ${audienceId}`);
    const ds = dataset();
    const counts: Record<string, number> = {};
    for (const id of a.memberIds) {
      const c = customers().get(id)!;
      const last = c.events.filter((e) => e.eventType === "dealerSelected").sort((x, y) => y.timestamp.localeCompare(x.timestamp))[0];
      const dealerId = last?.dealerId ?? ds.regions.find((r) => r.market === c.profile.market && r.postalPrefix === c.profile.postalCode.slice(0, 2))!.dealerId;
      counts[dealerId] = (counts[dealerId] ?? 0) + 1;
    }
    const dealers = Object.entries(counts).sort((x, y) => y[1] - x[1]).map(([dealerId, n]) => {
      const d = ds.dealers.find((x) => x.dealerId === dealerId)!;
      return { dealerId, name: d.name, city: d.city, audienceMembers: n, dealerCapacity: ds.businessSignals.find((s) => s.signalType === "dealerCapacity" && s.dealerId === dealerId)?.dealerCapacity };
    });
    return ok({ audienceId, mappingRule: "last dealerSelected, fallback postal-prefix dealer (configuration)", dealers });
  });

  server.registerTool("notify_dealer", {
    title: "Notify dealer of opportunity",
    description: "Sends (simulated) the opportunity alert to a dealer, including the real audience size for that dealer. Returns a notificationId and a dealer inbox URL where a human can type the dealer's reply.",
    inputSchema: { audienceId: z.string(), dealerId: z.string(), message: z.string().min(10) },
  }, async ({ audienceId, dealerId, message }) => {
    const st = readState();
    const a = st.audiences[audienceId];
    if (!a) return fail(`Unknown audienceId ${audienceId}`);
    const d = dataset().dealers.find((x) => x.dealerId === dealerId);
    if (!d) return fail(`Unknown dealerId ${dealerId}`);
    const n = mutate((s) => {
      const notificationId = nextId(s, "NTF", 3);
      const nn = { notificationId, createdAt: now(), audienceId, dealerId, message, audienceSizeForDealer: a.finalCount };
      s.notifications[notificationId] = nn;
      audit(s, { agent: "signal", tool: "notify_dealer", eventType: "DEALER_NOTIFIED", summary: `${notificationId} sent to ${dealerId} (${d.city})`, refs: { audienceId, notificationId, dealerId }, details: { message } });
      return nn;
    });
    return ok({ ...n, delivery: "SIMULATED (no real dealer channel)", dealerInboxPath: `/dealer/${n.notificationId}` });
  });

  server.registerTool("get_dealer_reply", {
    title: "Get dealer reply",
    description: "Returns the dealer's plain-language reply. If a human typed a reply in the dealer inbox page it is returned; otherwise the scripted demo reply is used (labelled as scripted).",
    inputSchema: { notificationId: z.string() },
  }, async ({ notificationId }) => {
    const n = readState().notifications[notificationId];
    if (!n) return fail(`Unknown notificationId ${notificationId}`);
    if (n.reply) return ok({ notificationId, dealerId: n.dealerId, reply: n.reply });
    if (process.env.SCRIPTED_DEALER_REPLY === "off") return ok({ notificationId, status: "WAITING_FOR_DEALER", hint: `Dealer has not replied yet. Reply at /dealer/${notificationId}` });
    const reply = { text: process.env.DEALER_REPLY_TEXT ?? DEFAULT_DEALER_REPLY, receivedAt: now(), source: "SIMULATED scripted dealer reply" };
    mutate((s) => {
      s.notifications[notificationId].reply = reply;
      audit(s, { agent: "signal", tool: "get_dealer_reply", eventType: "DEALER_REPLIED", summary: `Dealer ${n.dealerId} replied (scripted)`, refs: { notificationId, audienceId: n.audienceId, dealerId: n.dealerId }, details: reply });
    });
    return ok({ notificationId, dealerId: n.dealerId, reply });
  });

  return server;
}

export type { TyreCategory };
