import type { Asset, TasteTag } from "./asset-index.js";
import { loadAssets, searchAssets } from "./asset-index.js";

// TASTE-ENGINE: private reference vocabulary + taste-grounded critique.
// Given two design options (or one to evaluate), uses the stored asset library
// to give a reasoned recommendation based on Jason's curated vocabulary.
// Pure critique functions are offline-testable.

export type TasteVerdict = {
  recommendation: "fits" | "borderline" | "avoid";
  reason: string;
  matchedTags: TasteTag[];
  conflictTags: TasteTag[];
};

/** Tags that are POSITIVE for the Vanta aesthetic. */
export const POSITIVE_TAGS: TasteTag[] = [
  "operator-dossier",
  "schematic-rail",
  "glyph-system",
  "signal-panel",
  "warm-precise",
  "editorial",
  "terminal-first",
];

/** Tags that indicate a style to avoid. */
export const AVOID_TAGS: TasteTag[] = [
  "too-generic",
  "too-mascot",
];

/**
 * Score a description against the taste library. Pure.
 * Returns a verdict based on tag frequency in the library.
 */
export function scoreTasteAlignment(description: string, assets: Asset[]): TasteVerdict {
  const desc = description.toLowerCase();
  const positiveHits: TasteTag[] = [];
  const avoidHits: TasteTag[] = [];

  // Check which positive tags are mentioned or appear in similar assets
  for (const tag of POSITIVE_TAGS) {
    if (desc.includes(tag) || assets.some((a) => a.tags.includes(tag) && (a.notes ?? "").toLowerCase().includes(desc.split(" ")[0] ?? ""))) {
      positiveHits.push(tag);
    }
  }

  for (const tag of AVOID_TAGS) {
    if (desc.includes(tag) || desc.includes(tag.replace("-", " "))) {
      avoidHits.push(tag);
    }
  }

  if (avoidHits.length > 0) {
    return {
      recommendation: "avoid",
      reason: `Matches avoid tags: ${avoidHits.join(", ")}. Generic or mascot-forward aesthetics conflict with the operator/dossier vocabulary.`,
      matchedTags: positiveHits,
      conflictTags: avoidHits,
    };
  }

  if (positiveHits.length >= 2) {
    return {
      recommendation: "fits",
      reason: `Aligns with ${positiveHits.length} taste tag(s): ${positiveHits.join(", ")}. Strong match for the operator/dossier vocabulary.`,
      matchedTags: positiveHits,
      conflictTags: [],
    };
  }

  return {
    recommendation: "borderline",
    reason: `Weak signal: ${positiveHits.length} positive tag(s) matched. Inspect a reference from the asset library before committing.`,
    matchedTags: positiveHits,
    conflictTags: [],
  };
}

/**
 * Compare two design options using the taste library. Pure.
 * Returns which one fits better and why.
 */
export function compareDesigns(optionA: string, optionB: string, assets: Asset[]): {
  winner: "A" | "B" | "tie";
  verdictA: TasteVerdict;
  verdictB: TasteVerdict;
  reason: string;
} {
  const verdictA = scoreTasteAlignment(optionA, assets);
  const verdictB = scoreTasteAlignment(optionB, assets);

  const scoreMap = { fits: 2, borderline: 1, avoid: 0 };
  const sa = scoreMap[verdictA.recommendation];
  const sb = scoreMap[verdictB.recommendation];

  if (sa > sb) return { winner: "A", verdictA, verdictB, reason: `A fits the taste vocabulary better: ${verdictA.reason}` };
  if (sb > sa) return { winner: "B", verdictA, verdictB, reason: `B fits the taste vocabulary better: ${verdictB.reason}` };
  return { winner: "tie", verdictA, verdictB, reason: "Both options score similarly. Check the asset library for closer references." };
}

/** Load assets and score a description against the library. */
export async function evaluateTaste(description: string, env?: NodeJS.ProcessEnv): Promise<TasteVerdict> {
  const assets = await loadAssets(env);
  return scoreTasteAlignment(description, assets);
}

/** Look up relevant references for a query. */
export async function findReferences(query: string, env?: NodeJS.ProcessEnv): Promise<Asset[]> {
  return searchAssets(query, env);
}
