/**
 * HTTP host for the four agent MCP servers.
 *
 * Default (recommended for Dev Tunnels): ONE process, ONE port, four independent McpServer
 * instances on separate paths:
 *     /signal/mcp   /campaign/mcp   /compliance/mcp   /governance/mcp
 *
 * Split mode (optional): run one agent per process/port, e.g. to host the Compliance
 * referee on separate infrastructure:
 *     npx tsx src/server.ts --agent compliance --port 3003
 *
 * Transport: MCP Streamable HTTP, stateless (a fresh server+transport per request), JSON responses.
 */
import fs from "node:fs";
import path from "node:path";
import express, { type Request, type Response, type NextFunction } from "express";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { buildSignalServer } from "./agents/signal.js";
import { buildCampaignServer } from "./agents/campaign.js";
import { buildComplianceServer } from "./agents/compliance.js";
import { buildGovernanceServer } from "./agents/governance.js";
import { mountWeb } from "./web.js";
import { dataset } from "./lib/data.js";

const BUILDERS: Record<string, () => McpServer> = {
  signal: buildSignalServer,
  campaign: buildCampaignServer,
  compliance: buildComplianceServer,
  governance: buildGovernanceServer,
};

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

const agentArg = arg("agent") ?? process.env.AGENT ?? "all";
const PORT = Number(arg("port") ?? process.env.PORT ?? 3000);
const API_KEY = process.env.MCP_API_KEY || undefined;
const REQUIRE_KEY_FOR_WEB = process.env.REQUIRE_KEY_FOR_WEB === "true";
const agents = agentArg === "all" ? Object.keys(BUILDERS) : agentArg.split(",");
for (const a of agents) if (!BUILDERS[a]) throw new Error(`Unknown agent "${a}". Use one of: ${Object.keys(BUILDERS).join(", ")}, all`);

const app = express();
app.set("trust proxy", true);
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: false }));

// CORS (browser-based MCP clients)
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, x-api-key, Mcp-Session-Id, Mcp-Protocol-Version, Last-Event-ID");
  res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id");
  if (req.method === "OPTIONS") return void res.sendStatus(204);
  next();
});

// Optional shared-secret auth for MCP endpoints (Dev Tunnel runs with anonymous access)
function auth(req: Request, res: Response, next: NextFunction) {
  if (!API_KEY) return next();
  const bearer = req.headers.authorization?.replace(/^Bearer\s+/i, "");
  const provided = bearer ?? (req.headers["x-api-key"] as string | undefined) ?? (req.query.key as string | undefined);
  if (provided === API_KEY) return next();
  log(req.path.split("/")[1] ?? "?", req);
  console.log("  ↳ 401 Unauthorized (missing/invalid API key)");
  res.status(401).json({ jsonrpc: "2.0", error: { code: -32001, message: "Unauthorized: missing or invalid API key" }, id: null });
}

// Request log (console + runtime/requests.log) — shows exactly what the MCP client asks for.
const REQUEST_LOG = path.resolve(process.cwd(), "runtime", "requests.log");
function log(agent: string, req: Request) {
  const m = req.body?.method;
  const tool = m === "tools/call" ? ` → ${req.body?.params?.name}` : "";
  const line = `${new Date().toISOString()}  [${agent}] ${req.method} ${req.originalUrl.replace(/key=[^&]+/, "key=***")} ${m ?? ""}${tool}  ua="${req.headers["user-agent"] ?? ""}"`;
  console.log(line);
  try { fs.mkdirSync(path.dirname(REQUEST_LOG), { recursive: true }); fs.appendFileSync(REQUEST_LOG, line + "\n"); } catch { /* ignore */ }
}

for (const name of agents) {
  const handler = async (req: Request, res: Response) => {
    log(name, req);
    const server = BUILDERS[name]();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on("close", () => { void transport.close(); void server.close(); });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      console.error(`[${name}]`, err);
      if (!res.headersSent) res.status(500).json({ jsonrpc: "2.0", error: { code: -32603, message: "Internal server error" }, id: null });
    }
  };
  const notAllowed = (req: Request, res: Response) =>
    void (log(name, req), res.status(405)).json({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed (stateless server: use POST)" }, id: null });

  for (const p of [`/${name}/mcp`, `/${name}`]) {
    app.post(p, auth, handler);
    app.get(p, notAllowed);
    app.delete(p, notAllowed);
  }
}

mountWeb(app, { agents, apiKey: API_KEY, requireKeyForWeb: REQUIRE_KEY_FOR_WEB });

dataset(); // generate synthetic data at boot
app.listen(PORT, () => {
  const m = dataset().meta;
  console.log(`\nBridgestone Reactive Guardrails — agent simulator (SIMULATED, synthetic data)`);
  console.log(`Synthetic dataset: ${Object.entries(m.counts).map(([k, v]) => `${k}=${v}`).join(", ")}`);
  console.log(`Listening on http://localhost:${PORT}  (auth: ${API_KEY ? "API key required" : "none"})`);
  for (const a of agents) console.log(`  MCP  ${a.padEnd(11)} http://localhost:${PORT}/${a}/mcp`);
  console.log(`  Web  agents      http://localhost:${PORT}/`);
  console.log(`  Web  audit       http://localhost:${PORT}/audit\n`);
});
