import { z } from "zod";

// VANTA-SETTINGS-UX — the `ui`/display UX settings block + a pure settings→env
// map. Standalone schema (no import from store.ts) so store.ts can fold it into
// SettingsSchema without a circular import. Every field is optional and unset =
// today's behavior, because each maps to an existing VANTA_* env var that the
// existing readers already default to current behavior when unset:
//   - spinnerVerbs       → VANTA_SPINNER_VERBS (comma-joined list)
//   - messageTimestamps  → VANTA_MSG_TIMESTAMPS ("1"/"0"; reader is == "1")
//   - timestampStyle     → VANTA_MSG_TIMESTAMP_STYLE ("relative"|"absolute")
//   - effortIndicator    → VANTA_EFFORT_INDICATOR ("1"/"0")
//   - terminalTitle      → VANTA_TERMINAL_TITLE ("1"/"0"; "0"/"false" disables)
//   - hyperlinks         → VANTA_HYPERLINKS ("1"/"0")
//   - awaySummaryMs      → VANTA_AWAY_SUMMARY_MS (the number as a string)
//   - idleReturn         → VANTA_IDLE_RETURN ("1"/"0"; reader is != "0")
//   - jsonFormat         → VANTA_JSON_FORMAT ("1"/"0"; reader is == "1")
// The map only emits keys for fields that are SET, so an unset block produces no
// env keys and changes nothing. Env wins at application time (the store applies
// these only for keys not already present in env). Pure — no I/O.

/** Operator-configurable display/UX block on settings.json (the `ui` key). */
export const UxSettingsSchema = z
  .object({
    /** Spinner verb override. Maps to VANTA_SPINNER_VERBS (comma-joined). */
    spinnerVerbs: z.array(z.string()).optional(),
    /** Per-message timestamps on/off. Maps to VANTA_MSG_TIMESTAMPS. */
    messageTimestamps: z.boolean().optional(),
    /** Timestamp style. Maps to VANTA_MSG_TIMESTAMP_STYLE. */
    timestampStyle: z.enum(["relative", "absolute"]).optional(),
    /** Show the effort indicator. Maps to VANTA_EFFORT_INDICATOR. */
    effortIndicator: z.boolean().optional(),
    /** Set the terminal window title. Maps to VANTA_TERMINAL_TITLE. */
    terminalTitle: z.boolean().optional(),
    /** Emit OSC-8 hyperlinks. Maps to VANTA_HYPERLINKS. */
    hyperlinks: z.boolean().optional(),
    /** Away/idle recap threshold in ms. Maps to VANTA_AWAY_SUMMARY_MS. */
    awaySummaryMs: z.number().optional(),
    /** Re-engagement prompt on return from idle. Maps to VANTA_IDLE_RETURN. */
    idleReturn: z.boolean().optional(),
    /** Pretty-print JSON in shell-tool output. Maps to VANTA_JSON_FORMAT. */
    jsonFormat: z.boolean().optional(),
  })
  .strict();

export type UxSettings = z.infer<typeof UxSettingsSchema>;

/** Optional boolean → the kernel/term readers' on/off flag, or undefined when unset. */
function optFlag(value: boolean | undefined): string | undefined {
  return value === undefined ? undefined : value ? "1" : "0";
}
/** Optional number → its string form, or undefined when unset. */
function optStr(value: number | undefined): string | undefined {
  return value === undefined ? undefined : String(value);
}
/** Optional string list → a comma-joined string, or undefined when unset. */
function optList(value: string[] | undefined): string | undefined {
  return value === undefined ? undefined : value.join(",");
}

/**
 * Map a UX settings block to the env vars its set fields control. Only fields
 * that are present produce env keys, so an empty/unset block returns {} and
 * changes nothing (today's behavior). Pure — reads only the passed settings.
 */
export function uxSettingsToEnv(ux: UxSettings | undefined): Record<string, string> {
  if (!ux) return {};
  const map: [string, string | undefined][] = [
    ["VANTA_SPINNER_VERBS", optList(ux.spinnerVerbs)],
    ["VANTA_MSG_TIMESTAMPS", optFlag(ux.messageTimestamps)],
    ["VANTA_MSG_TIMESTAMP_STYLE", ux.timestampStyle],
    ["VANTA_EFFORT_INDICATOR", optFlag(ux.effortIndicator)],
    ["VANTA_TERMINAL_TITLE", optFlag(ux.terminalTitle)],
    ["VANTA_HYPERLINKS", optFlag(ux.hyperlinks)],
    ["VANTA_AWAY_SUMMARY_MS", optStr(ux.awaySummaryMs)],
    ["VANTA_IDLE_RETURN", optFlag(ux.idleReturn)],
    ["VANTA_JSON_FORMAT", optFlag(ux.jsonFormat)],
  ];
  const out: Record<string, string> = {};
  for (const [k, v] of map) if (v !== undefined) out[k] = v;
  return out;
}
