import {
  buildPluginSuggestion,
  isSafePluginName,
} from "../hints/plugin-hints.js";

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

/** File extension → the LSP plugin that serves that language. The proactive
 * mapping for the language-signal lane. Keys are lowercased, dot-prefixed. */
export const LANGUAGE_PLUGIN_MAP: Readonly<Record<string, string>> = {
  ".rs": "rust-analyzer-lsp",
  ".py": "pyright-lsp",
  ".go": "gopls-lsp",
  ".ts": "typescript-lsp",
  ".tsx": "typescript-lsp",
  ".js": "typescript-lsp",
  ".jsx": "typescript-lsp",
  ".rb": "ruby-lsp",
  ".java": "jdtls-lsp",
  ".c": "clangd-lsp",
  ".cpp": "clangd-lsp",
  ".cs": "omnisharp-lsp",
  ".php": "intelephense-lsp",
};

/** Capability label → the plugin that provides it. Used by the failing-capability
 * lane so a repeatedly-failing capability suggests the plugin that fixes it. */
const CAPABILITY_PLUGIN_MAP: Readonly<Record<string, string>> = {
  lsp: "typescript-lsp",
  format: "prettier-format",
  lint: "eslint-lint",
  test: "vitest-runner",
  search: "ripgrep-search",
};

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

/** A candidate before dedupe/rank: the same plugin may arrive from several lanes. */
interface Candidate {
  plugin: string;
  reason: string;
  score: number;
}

/** The language lane: every ext over threshold (by summed count for plugins that
 * serve multiple exts) becomes a candidate scored by that count. */
function languageCandidates(
  signals: RecommendSignals,
  threshold: number,
): Candidate[] {
  const byPlugin = new Map<string, number>();
  for (const [ext, count] of Object.entries(signals.fileExtCounts)) {
    if (count <= 0) continue;
    const plugin = LANGUAGE_PLUGIN_MAP[ext.toLowerCase()];
    if (!plugin) continue;
    byPlugin.set(plugin, (byPlugin.get(plugin) ?? 0) + count);
  }
  const out: Candidate[] = [];
  for (const [plugin, total] of byPlugin) {
    if (total < threshold) continue;
    out.push({
      plugin,
      reason: `project has ${total} matching files — its LSP would add diagnostics`,
      score: total,
    });
  }
  return out;
}

/** The hint lane: each safely-named hint plugin is an explicit request, scored
 * highest. Unsafe names are dropped via the shared safe-name check. */
function hintCandidates(
  signals: RecommendSignals,
  hintScore: number,
): Candidate[] {
  const out: Candidate[] = [];
  for (const name of signals.hintPluginNames) {
    if (!isSafePluginName(name)) continue;
    out.push({
      plugin: name,
      reason: "explicitly requested by a tool hint",
      score: hintScore,
    });
  }
  return out;
}

/** The capability lane: each repeatedly-failing capability maps to its plugin. */
function capabilityCandidates(
  signals: RecommendSignals,
  capabilityScore: number,
): Candidate[] {
  const out: Candidate[] = [];
  for (const cap of signals.failingCapabilities ?? []) {
    const plugin = CAPABILITY_PLUGIN_MAP[cap.toLowerCase()];
    if (!plugin) continue;
    out.push({
      plugin,
      reason: `the "${cap}" capability keeps failing — this plugin provides it`,
      score: capabilityScore,
    });
  }
  return out;
}

/** Dedupe candidates by plugin name, keeping the highest-scoring instance (and
 * its reason). Insertion order of first sighting is irrelevant — ranking is by
 * score afterward. */
function dedupeByPlugin(candidates: Candidate[]): Candidate[] {
  const best = new Map<string, Candidate>();
  for (const c of candidates) {
    const prior = best.get(c.plugin);
    if (!prior || c.score > prior.score) best.set(c.plugin, c);
  }
  return [...best.values()];
}

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
