/**
 * Shared runtime state (file-backed so it works whether the 4 agents run in one
 * process (multiplexed) or in 4 separate processes (multi-port)).
 * Every tool call writes an audit event automatically — agents cannot "forget" to log.
 */
import fs from "node:fs";
import path from "node:path";

const STATE_FILE = process.env.STATE_FILE ?? path.resolve(process.cwd(), "runtime", "state.json");

export type AgentName = "signal" | "campaign" | "compliance" | "governance" | "human" | "system";

export interface AuditEvent {
  eventId: string;
  timestamp: string; // real system time
  agent: AgentName;
  tool: string;
  eventType: string;
  summary: string;
  refs: Record<string, string | undefined>;
  details?: unknown;
}

export interface AudienceRecord {
  audienceId: string;
  createdAt: string;
  market: string;
  postalPrefixes: string[];
  strategy: "replacement" | "seasonalSwap";
  productId: string;
  definition: Record<string, unknown>;
  funnel: { step: string; rule: string; count: number }[];
  finalCount: number;
  memberIds: string[];
  opportunity?: unknown;
}

export interface DealerNotification {
  notificationId: string;
  createdAt: string;
  audienceId: string;
  dealerId: string;
  message: string;
  audienceSizeForDealer: number;
  reply?: { text: string; receivedAt: string; source: string };
}

export interface CampaignVersion {
  version: number;
  submittedAt: string;
  language: string;
  subject: string;
  preheader?: string;
  headline: string;
  body: string;
  cta: string;
  offerId?: string;
  englishTranslation?: string;
  revisionNotes?: string;
}

export interface ComplianceVerdict {
  verdictId: string;
  timestamp: string;
  campaignId: string;
  version: number;
  round: number;
  maxRounds: number;
  decision: "PASS" | "VETO" | "ESCALATE";
  ruleGroups: Record<string, unknown>;
  violations: unknown[];
  constraints: string[];
  evidenceReferences: string[];
  warnings: unknown[];
}

export interface CampaignRecord {
  campaignId: string;
  createdAt: string;
  audienceId: string;
  dealerNotificationId?: string;
  status: "DRAFT" | "VETOED" | "COMPLIANCE_PASSED" | "ESCALATED";
  versions: CampaignVersion[];
  verdicts: ComplianceVerdict[];
  guardrailChecks: { type: string; timestamp: string; decision: string; result: unknown }[];
}

export interface WorkfrontRecord {
  recordId: string;
  createdAt: string;
  title: string;
  audienceId: string;
  campaignId?: string;
  status: "OPEN" | "PENDING_HUMAN_APPROVAL" | "APPROVED" | "AMEND_REQUESTED" | "REJECTED" | "ESCALATED";
  approvalRequestedAt?: string;
  humanDecision?: { decision: "approve" | "amend" | "reject"; reviewer: string; comment?: string; timestamp: string; channel: string };
  journey?: unknown;
}

export interface State {
  counters: Record<string, number>;
  audit: AuditEvent[];
  audiences: Record<string, AudienceRecord>;
  notifications: Record<string, DealerNotification>;
  campaigns: Record<string, CampaignRecord>;
  workfront: Record<string, WorkfrontRecord>;
}

const empty = (): State => ({ counters: {}, audit: [], audiences: {}, notifications: {}, campaigns: {}, workfront: {} });

export function readState(): State {
  try {
    return { ...empty(), ...JSON.parse(fs.readFileSync(STATE_FILE, "utf8")) };
  } catch {
    return empty();
  }
}

function writeState(s: State) {
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  const tmp = `${STATE_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(s, null, 2));
  fs.renameSync(tmp, STATE_FILE);
}

/** Read-modify-write. Synchronous so calls in one process never interleave. */
export function mutate<T>(fn: (s: State) => T): T {
  const s = readState();
  const out = fn(s);
  writeState(s);
  return out;
}

export function nextId(s: State, prefix: string, pad = 4): string {
  s.counters[prefix] = (s.counters[prefix] ?? 0) + 1;
  return `${prefix}-${String(s.counters[prefix]).padStart(pad, "0")}`;
}

export function audit(s: State, e: Omit<AuditEvent, "eventId" | "timestamp">): AuditEvent {
  const ev: AuditEvent = { eventId: nextId(s, "AUD", 5), timestamp: new Date().toISOString(), ...e };
  s.audit.push(ev);
  return ev;
}

export function resetState() {
  writeState(empty());
}

export const now = () => new Date().toISOString();
