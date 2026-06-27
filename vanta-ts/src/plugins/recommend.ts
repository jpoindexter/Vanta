import {
  buildPluginSuggestion,
  isSafePluginName,
} from "../hints/plugin-hints.js";
import {
  languageCandidates,
  hintCandidates,
  capabilityCandidates,
  dedupeByPlugin,
} from "./recommend-lanes.js";

// The maps + candidate lanes live in ./recommend-lanes.js. `LANGUAGE_PLUGIN_MAP`
// is re-exported so importers/tests keep `import { LANGUAGE_PLUGIN_MAP } from "./recommend.js"`.
export { LANGUAGE_PLUGIN_MAP } from "./recommend-lanes.js";

/**
 * VANTA-PLUGIN-RECOMMEND — the PROACTIVE engine over the reactive plugin-hints
 * layer. `plugin-hints.ts` turns a single stderr `<vanta-hint type="plugin" />`
 * into one suggestion line (a tool asking, reactively). This module maps the
 * AMBIENT signals of a session — which file types the project is heavy in, which
 * plugins recent stderr hints already asked for, which capabilities keep failing
 * — onto a ranked, deduped list of one-line install suggestions.
 *
 * It is PURE and SUGGESTION-ONLY: it never spawns, never installs, never touches
 * the registry. It takes signals in, returns recommendations out. Unsafe plugin
 * names (from a hostile hint) are dropped via the shared `isSafePluginName`
 * check, and the rendered line reuses `buildPluginSuggestion` so the proactive
 * and reactive surfaces speak with one voice.
 *
 * Live wiring is DEFERRED (mirror clarity-gate): a periodic/first-run point —
 * `session.ts prepareRun` is the natural spot — would gather `RecommendSignals`
 * (a one-pass file-extension scan of the project root for `fileExtCounts`, the
 * recent parsed plugin hints for `hintPluginNames`, and the tool-failure tally
 * for `failingCapabilities`), call `recommendPlugins`, and surface
 * `formatRecommendations(recs)` to the operator. No auto-install at that point
 * either — the operator runs `vanta plugins add <name>` themselves.
 */

/** A signal bag describing the current project + session. No field is required
 * to be populated; an empty bag yields no recommendations. */
export interface RecommendSignals {
  /** How many files of each extension the project has, e.g. `{ ".rs": 40 }`.
   * Keys are extensions WITH the leading dot, lowercased by the caller. */
  fileExtCounts: Record<string, number>;
  /** Plugin names already asked for by recent stderr plugin-hints. An explicit
   * request — scored highest. */
  hintPluginNames: string[];
  /** Capabilities (free-form labels) that have repeatedly failed this session,
   * each mapping to a plugin that would provide it. Optional. */
  failingCapabilities?: string[];
}

/** One ranked recommendation: which plugin, why, and its rank score (higher =
 * surface first). */
export interface PluginRecommendation {
  plugin: string;
  reason: string;
  score: number;
}

/** Tunables for the engine. Bounded so a pathological signal bag can't produce
 * an unwieldy suggestion block. */
export interface RecommendOptions {
  /** A language plugin is only recommended when its summed extension count meets
   * this threshold — keeps a stray `.rs` file from suggesting a Rust LSP. */
  languageThreshold: number;
  /** Score given to an explicitly hint-requested plugin (the highest lane). */
  hintScore: number;
  /** Score given to a plugin that resolves a repeatedly-failing capability. */
  capabilityScore: number;
  /** Maximum number of recommendations returned. */
  cap: number;
}

export const DEFAULT_RECOMMEND_OPTIONS: RecommendOptions = {
  languageThreshold: 3,
  hintScore: 100,
  capabilityScore: 50,
  cap: 5,
};

/**
 * Map session/project SIGNALS to a ranked, deduped list of plugin install
 * recommendations. PURE: same signals → same output, no side effects, never
 * installs. No signals (or none that map / clear thresholds) → `[]`. Results are
 * sorted by score descending (plugin name as a stable tie-break) and capped.
 *
 * Lanes, by score: an explicitly hint-requested plugin (highest), a plugin that
 * resolves a repeatedly-failing capability, then a language LSP plugin scored by
 * its file-extension count once that count clears the threshold.
 */
export function recommendPlugins(
  signals: RecommendSignals,
  opts: RecommendOptions = DEFAULT_RECOMMEND_OPTIONS,
): PluginRecommendation[] {
  const candidates = [
    ...hintCandidates(signals, opts.hintScore),
    ...capabilityCandidates(signals, opts.capabilityScore),
    ...languageCandidates(signals, opts.languageThreshold),
  ].filter((c) => isSafePluginName(c.plugin));

  return dedupeByPlugin(candidates)
    .sort((a, b) =>
      b.score - a.score || a.plugin.localeCompare(b.plugin),
    )
    .slice(0, opts.cap)
    .map(({ plugin, reason, score }) => ({ plugin, reason, score }));
}

/**
 * Render the ranked recommendations as an operator-facing suggestion block.
 * Reuses `buildPluginSuggestion` for the install line (one voice with the
 * reactive hint surface) and appends each recommendation's reason. A
 * recommendation whose name fails the safe-name check (defense in depth) is
 * skipped. No recommendations → `""`. SUGGESTION-ONLY — never installs.
 */
export function formatRecommendations(
  recs: PluginRecommendation[],
): string {
  const lines: string[] = [];
  for (const rec of recs) {
    const line = buildPluginSuggestion(rec.plugin);
    if (!line) continue;
    lines.push(`${line}\n   ↳ ${rec.reason}`);
  }
  return lines.join("\n");
}
