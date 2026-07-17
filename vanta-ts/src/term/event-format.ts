import type { StreamEvent } from "../agent/agent-types.js";

/** A formatted, surface-neutral label for a stream event. */
export type EventLabel = {
  label: string;
  ok?: boolean;
  kind?: "tool_start" | "tool_end" | "note" | "summary";
  name?: string;
  detail?: string;
};

/**
 * The display-formatter PORT for STRING surfaces (desktop SSE, logs, future
 * remote UIs): turn a {@link StreamEvent} into a label, or null to drop it.
 * The Ink TUI renders React and deliberately does NOT use this — it's a
 * different output type, not a forced shared abstraction. (ports/adapters,
 * DECISIONS 2026-06-17.)
 */
export interface StreamEventFormatter {
  format(event: StreamEvent): EventLabel | null;
}

/** The default label formatter — the one string presentation, shared, swappable. */
export const defaultEventFormatter: StreamEventFormatter = {
  format(event) {
    if (event.type === "tool_start") return { label: `→ ${event.name}`, kind: "tool_start", name: event.name };
    if (event.type === "tool_end") {
      return { label: `${event.ok ? "✓" : "✗"} ${event.name}: ${event.output.slice(0, 90)}`, ok: event.ok, kind: "tool_end", name: event.name, detail: event.output };
    }
    if (event.type === "note") return { label: `note: ${event.text.slice(0, 100)}`, kind: "note", detail: event.text };
    return null;
  },
};

/**
 * A machine-readable output MODE that plugs into the SAME port: each event
 * becomes a compact JSON line, for programmatic SSE/log consumers. The label
 * IS the JSON; `ok` is carried through so a string surface can still colour it.
 */
export const jsonEventFormatter: StreamEventFormatter = {
  format(event) {
    if (event.type === "tool_start") return { label: JSON.stringify({ event: "tool_start", name: event.name }) };
    if (event.type === "tool_end") {
      return { label: JSON.stringify({ event: "tool_end", name: event.name, ok: event.ok, output: event.output.slice(0, 90) }), ok: event.ok };
    }
    if (event.type === "note") return { label: JSON.stringify({ event: "note", text: event.text.slice(0, 100) }) };
    return null;
  },
};

// PORT-DISPLAY-FORMATTER — string-surface formatters register by MODE name, so a
// new output mode is a `registerEventFormatter` call, not an edit to resolve().
const FORMATTERS = new Map<string, StreamEventFormatter>([
  ["default", defaultEventFormatter],
  ["json", jsonEventFormatter],
]);

/** Register (or override) the formatter for a `VANTA_EVENT_FORMAT` mode. */
export function registerEventFormatter(mode: string, formatter: StreamEventFormatter): void {
  FORMATTERS.set(mode, formatter);
}

/** Resolve the active string-surface formatter by `VANTA_EVENT_FORMAT` (default → labels). */
export function resolveEventFormatter(env: NodeJS.ProcessEnv = process.env): StreamEventFormatter {
  return FORMATTERS.get(env.VANTA_EVENT_FORMAT ?? "default") ?? defaultEventFormatter;
}
