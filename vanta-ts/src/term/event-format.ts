import type { StreamEvent } from "../agent/agent-types.js";

/** A formatted, surface-neutral label for a stream event. */
export type EventLabel = { label: string; ok?: boolean };

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
    if (event.type === "tool_start") return { label: `→ ${event.name}` };
    if (event.type === "tool_end") {
      return { label: `${event.ok ? "✓" : "✗"} ${event.name}: ${event.output.slice(0, 90)}`, ok: event.ok };
    }
    if (event.type === "note") return { label: `note: ${event.text.slice(0, 100)}` };
    return null;
  },
};

/** Resolve the active string-surface formatter. Swap = a new adapter here. */
export function resolveEventFormatter(): StreamEventFormatter {
  return defaultEventFormatter;
}
