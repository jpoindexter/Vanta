import { isSafePluginName } from "../hints/plugin-hints.js";
import type { RecommendSignals } from "./recommend.js";

/**
 * VANTA-PLUGIN-RECOMMEND — the candidate "lanes": pure mappers from session
 * signals to scored plugin candidates (language LSP / explicit hint / failing
 * capability) plus the dedupe step. The public engine (ranking, capping,
 * formatting) lives in ./recommend.js and re-exports `LANGUAGE_PLUGIN_MAP`.
 */

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

/** A candidate before dedupe/rank: the same plugin may arrive from several lanes. */
export interface Candidate {
  plugin: string;
  reason: string;
  score: number;
}

/** The language lane: every ext over threshold (by summed count for plugins that
 * serve multiple exts) becomes a candidate scored by that count. */
export function languageCandidates(
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
export function hintCandidates(
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
export function capabilityCandidates(
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
export function dedupeByPlugin(candidates: Candidate[]): Candidate[] {
  const best = new Map<string, Candidate>();
  for (const c of candidates) {
    const prior = best.get(c.plugin);
    if (!prior || c.score > prior.score) best.set(c.plugin, c);
  }
  return [...best.values()];
}
