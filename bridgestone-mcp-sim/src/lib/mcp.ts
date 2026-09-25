import { SIMULATION_LABEL } from "./data.js";

export type ToolResult = { content: { type: "text"; text: string }[]; isError?: boolean };

/** Every response carries the simulation label so nothing is ever mistaken for live Adobe data. */
export function ok(payload: Record<string, unknown>): ToolResult {
  return { content: [{ type: "text", text: JSON.stringify({ _label: SIMULATION_LABEL, ...payload }, null, 2) }] };
}

export function fail(message: string, extra: Record<string, unknown> = {}): ToolResult {
  return { content: [{ type: "text", text: JSON.stringify({ _label: SIMULATION_LABEL, error: message, ...extra }, null, 2) }], isError: true };
}
