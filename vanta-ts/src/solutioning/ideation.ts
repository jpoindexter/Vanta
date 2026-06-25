/**
 * Routed creative-ideation surface (COFOUNDER-IDEATION-METHODS).
 *
 * The deterministic router over the 22-method catalog (`ideation-catalog.ts` +
 * `ideation-creative.ts`). A problem reduces to signals (phase / domain /
 * specificity, plus an optional feasibility↔creativity `balance` lever) and maps
 * to exactly ONE method. Feeds the solutioning / cofounder pillar — `solutioning-mode`
 * and the bundled `ideation-methods` skill consume this surface.
 *
 * Original content in Vanta's voice — no external method text is copied.
 */

import {
  METHOD_CATALOG,
  getMethod,
  type IdeationMethod,
  type IdeationMethodId,
} from "./ideation-catalog.js";

// Re-export the catalog surface so existing imports of "./ideation.js" still resolve.
export { METHOD_CATALOG, getMethod };
export type { IdeationMethod, IdeationMethodId };

/** Where the problem sits in the build arc. */
export type IdeationPhase = "discovery" | "framing" | "generation" | "stuck" | "validation";

/** Coarse domain the problem lives in — biases which method earns the route. */
export type IdeationDomain = "product" | "technical" | "business" | "creative" | "process" | "writing";

/** How constrained the problem already is. */
export type IdeationSpecificity = "vague" | "focused" | "constrained";

/**
 * Optional feasibility↔creativity lever. Unset (or "balanced") keeps the
 * deterministic base route; "feasible" grounds it; "novel" escalates toward the
 * divergent end of the catalog. This is the axis Hermes' prose router lacks.
 */
export type IdeationBalance = "feasible" | "balanced" | "novel";

/** The routing signals: a problem reduced to its axes. */
export type IdeationSignals = {
  phase: IdeationPhase;
  domain: IdeationDomain;
  specificity: IdeationSpecificity;
  balance?: IdeationBalance;
};

/** The default route when no signal rule fires — broadly applicable, low-risk. */
export const DEFAULT_METHOD: IdeationMethodId = "first-principles";

/**
 * Phase is the strongest signal — it nearly determines the method family. This
 * table is the primary route; domain and specificity only refine `generation`,
 * where the catalog is widest.
 */
const PHASE_ROUTE: Record<IdeationPhase, IdeationMethodId> = {
  discovery: "jobs-to-be-done",
  framing: "first-principles",
  generation: "scamper", // overridden by the generation refinement below
  stuck: "oblique-strategies",
  validation: "premortem-inversion",
};

/** Within `generation`, domain picks the family best suited to that medium. */
const GENERATION_BY_DOMAIN: Record<IdeationDomain, IdeationMethodId> = {
  product: "jobs-to-be-done",
  technical: "biomimicry",
  business: "analogy-blending",
  creative: "lateral-provocations",
  process: "leverage-points",
  writing: "story-skeletons",
};

/** When the operator wants maximum novelty, the divergent method for each phase. */
const NOVEL_BY_PHASE: Record<IdeationPhase, IdeationMethodId> = {
  discovery: "derive-mapping",
  framing: "defamiliarization",
  generation: "chance-remix",
  stuck: "pataphysics",
  validation: "lateral-provocations",
};

/** When the operator wants maximum buildability, the grounding method for each phase. */
const FEASIBLE_BY_PHASE: Record<IdeationPhase, IdeationMethodId> = {
  discovery: "affinity-diagrams",
  framing: "polya",
  generation: "first-principles",
  stuck: "pattern-languages",
  validation: "premortem-inversion",
};

/**
 * The base route — IDENTICAL to the pre-balance behavior (first match wins):
 *  1. `stuck` always routes to a fixation-breaker.
 *  2. A `technical` + `constrained` problem is a trade-off → TRIZ.
 *  3. In `generation`, domain selects the family; still-`vague` grounds first.
 *  4. `framing` + `writing` is a constraint problem → Oulipo.
 *  5. Otherwise the phase route applies.
 */
function routeBase(phase: IdeationPhase, domain: IdeationDomain, specificity: IdeationSpecificity): IdeationMethodId {
  if (phase === "stuck") return PHASE_ROUTE.stuck;
  if (domain === "technical" && specificity === "constrained") return "triz";
  if (phase === "generation") {
    if (specificity === "vague") return "first-principles";
    return GENERATION_BY_DOMAIN[domain];
  }
  if (phase === "framing" && domain === "writing") return "oulipo";
  return PHASE_ROUTE[phase];
}

/**
 * Route a problem to exactly ONE ideation method (deterministic, no I/O).
 *
 * The `balance` lever sits on top of the base route: "novel" escalates to the
 * phase's divergent method, "feasible" grounds to its buildable method, and
 * unset / "balanced" keeps the base route unchanged (full backward compatibility).
 */
export function routeIdeationMethod(signals: IdeationSignals): IdeationMethodId {
  const { phase, domain, specificity, balance } = signals;
  let id: IdeationMethodId | undefined;
  if (balance === "novel") id = NOVEL_BY_PHASE[phase];
  else if (balance === "feasible") id = FEASIBLE_BY_PHASE[phase];
  else id = routeBase(phase, domain, specificity);
  return id ?? DEFAULT_METHOD; // catches an out-of-type phase from any path
}

/** Route then resolve to the full method entry; `undefined` only if the id is somehow unknown. */
export function recommendMethod(signals: IdeationSignals): IdeationMethod | undefined {
  return getMethod(routeIdeationMethod(signals));
}
