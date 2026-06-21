import { parseVantaHints, type VantaHint } from "./vanta-hints.js";

/**
 * VANTA-PLUGIN-HINTS — a subprocess can ask Vanta to suggest a plugin install by
 * emitting a `<vanta-hint type="plugin" name="..." />` tag on stderr (the existing
 * Vanta hint protocol; the `claude-code-hint` form is the interop alias parsed
 * read-only by vanta-hints.ts). This module is the PURE layer that turns those
 * parsed hints into an operator-facing suggestion line. It NEVER auto-installs —
 * the suggestion only tells the operator the command to run themselves.
 *
 * Live wiring is deferred: `tools/shell-cmd.ts` already calls `parseVantaHints`
 * on captured stderr, so it is the dispatch point where `pluginHintSuggestions`
 * would surface these lines after a command completes.
 */

/** A plugin-name token is safe only if it is a bare slug: letters, digits, and
 * `-`/`_`, no shell metacharacters, path separators, or whitespace. Bounding the
 * length keeps a hostile hint from producing an unwieldy line. */
const SAFE_PLUGIN_NAME = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/;

/** Strip C0/DEL/C1 control characters so a hint cannot smuggle ANSI/escape bytes. */
function stripControl(value: string): string {
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\x00-\x1f\x7f-\x9f]/g, "");
}

/** True when `name` is a safe, runnable plugin-name token (post control-strip). */
export function isSafePluginName(name: string): boolean {
  return SAFE_PLUGIN_NAME.test(stripControl(name));
}

/**
 * The plugin names suggested for install — the `name` of every parsed hint whose
 * `type` is "plugin". Unsafe names (shell metachars, paths, spaces, control
 * bytes) are dropped so a hostile name can never reach the suggestion builder.
 * Order-preserving; not deduped (that's `pluginHintSuggestions`' job).
 */
export function parsePluginHints(hints: VantaHint[]): string[] {
  return hints
    .filter((h) => h.type === "plugin")
    .map((h) => stripControl(h.name))
    .filter((name) => isSafePluginName(name));
}

/**
 * The one-line operator suggestion for a single (already-validated) plugin name.
 * Returns null if the name is unsafe, so an injection token can never be wrapped
 * into a runnable-looking command. Never installs anything.
 */
export function buildPluginSuggestion(pluginName: string): string | null {
  const name = stripControl(pluginName);
  if (!isSafePluginName(name)) return null;
  return `💡 a tool suggested the ${name} plugin — run \`vanta plugins add ${name}\` to enable it`;
}

/**
 * The deduped suggestion lines for any plugin hints in `hints`. No plugin hints
 * (or none safe) → []. Convenience over raw text: parse first, then pass here.
 */
export function pluginHintSuggestions(hints: VantaHint[]): string[] {
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const name of parsePluginHints(hints)) {
    if (seen.has(name)) continue;
    seen.add(name);
    const line = buildPluginSuggestion(name);
    if (line) lines.push(line);
  }
  return lines;
}

/**
 * Convenience: parse raw stderr text via the Vanta hint protocol, then return the
 * deduped plugin suggestion lines. Mirrors how `shell-cmd.ts` already parses
 * stderr; given here so the live dispatch point is a one-call wire-up.
 */
export function pluginSuggestionsFromText(text: string): string[] {
  return pluginHintSuggestions(parseVantaHints(text).hints);
}
