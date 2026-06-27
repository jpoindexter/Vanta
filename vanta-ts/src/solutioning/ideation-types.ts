/**
 * Ideation method catalog — shared types (COFOUNDER-IDEATION-METHODS).
 *
 * The entry shape and the stable id union span BOTH halves of the catalog
 * (`ideation-catalog.ts` analytic core + `ideation-creative.ts` creative half),
 * so they live in a neutral module both data files and the router import.
 */

/** Stable method identifiers — the route output and catalog keys (22 total). */
export type IdeationMethodId =
  | "first-principles"
  | "biomimicry"
  | "oblique-strategies"
  | "jobs-to-be-done"
  | "triz"
  | "scamper"
  | "leverage-points"
  | "lateral-provocations"
  | "premortem-inversion"
  | "analogy-blending"
  | "polya"
  | "affinity-diagrams"
  | "creative-discipline"
  | "pattern-languages"
  | "compression-progress"
  | "volume-generation"
  | "story-skeletons"
  | "oulipo"
  | "defamiliarization"
  | "derive-mapping"
  | "chance-remix"
  | "pataphysics";

/** One catalog entry: identity + when/when-not + a runnable procedure. */
export type IdeationMethod = {
  id: IdeationMethodId;
  name: string;
  /** Who originated the technique — attribution is part of using it well. */
  origin: string;
  /** Where this method sits on the feasibility↔creativity axis (0..1). */
  creativity: number;
  /** One-line intent — what this method is for. */
  intent: string;
  /** Conditions under which this method is the right reach. */
  whenToUse: string;
  /** Conditions under which it misfires — reach for something else. */
  whenNot: string;
  /** Ordered, concrete steps to actually run the method. */
  procedure: string[];
};
