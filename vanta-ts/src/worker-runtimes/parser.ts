import type { RunEvent, Usage } from "./types.js";
import { EVENT_TEXT_MAX_CHARS } from "./constants.js";

// What a runtime learns from a CLI's output stream. One parser per CLI format,
// fed one stdout/stderr line at a time. Parsers never throw: an unreadable line
// is skipped, and absent figures stay undefined ("not reported").

export type ParsedRun = {
  finalMessage?: string;
  failed: boolean;
  errorText?: string;
  usage?: Usage;
  sessionId?: string;
  model?: string;
};

export type OutputParser = {
  feed: (line: string) => RunEvent[];
  result: () => ParsedRun;
};

export const asRecord = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;

export const asString = (value: unknown): string | undefined => (typeof value === "string" && value.length > 0 ? value : undefined);

export const asCount = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.round(value) : undefined;

export function parseJsonLine(line: string): Record<string, unknown> | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith("{")) return null;
  try {
    return asRecord(JSON.parse(trimmed));
  } catch {
    return null;
  }
}

export const event = (kind: RunEvent["kind"], text: string): RunEvent => ({ kind, text: text.replace(/\s+/g, " ").trim().slice(0, EVENT_TEXT_MAX_CHARS) });

/** The runExternalAgent heartbeat line ("… claude working (8s)") is a sign of life, not output. */
export const isHeartbeat = (line: string): boolean => line.startsWith("… ");
