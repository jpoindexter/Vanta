/**
 * Routed creative-ideation method catalog (COFOUNDER-IDEATION-METHODS).
 *
 * A pure library of named ideation methods, each with when-to-use / when-not /
 * a short procedure, plus a deterministic router that maps a problem's signals
 * (phase / domain / specificity) to exactly ONE method. Feeds the
 * solutioning / cofounder pillar — `solutioning-mode` and the bundled
 * `ideation-methods` skill consume this surface.
 *
 * Original content in Vanta's voice — no external method text is copied.
 */

/** Where the problem sits in the build arc. */
export type IdeationPhase = "discovery" | "framing" | "generation" | "stuck" | "validation";

/** Coarse domain the problem lives in — biases which method earns the route. */
export type IdeationDomain = "product" | "technical" | "business" | "creative" | "process";

/** How constrained the problem already is. */
export type IdeationSpecificity = "vague" | "focused" | "constrained";

/** The routing signals: a problem reduced to three axes. */
export type IdeationSignals = {
  phase: IdeationPhase;
  domain: IdeationDomain;
  specificity: IdeationSpecificity;
};

/** Stable method identifiers — the route output and catalog keys. */
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
  | "analogy-blending";

/** One catalog entry: identity + when/when-not + a runnable procedure. */
export type IdeationMethod = {
  id: IdeationMethodId;
  name: string;
  /** One-line intent — what this method is for. */
  intent: string;
  /** Conditions under which this method is the right reach. */
  whenToUse: string;
  /** Conditions under which it misfires — reach for something else. */
  whenNot: string;
  /** Ordered, concrete steps to actually run the method. */
  procedure: string[];
};

/** The default route when no signal rule fires — broadly applicable, low-risk. */
export const DEFAULT_METHOD: IdeationMethodId = "first-principles";

/**
 * The method catalog. Each entry is written from scratch in Vanta's voice; the
 * names are the conventional names of the techniques, the descriptions and
 * procedures are original. Frozen so consumers can't mutate the shared library.
 */
export const METHOD_CATALOG: readonly IdeationMethod[] = Object.freeze([
  {
    id: "first-principles",
    name: "First-Principles Decomposition",
    intent: "Rebuild the problem from what must be true, not from how it's usually done.",
    whenToUse:
      "The problem is inherited as a given and you suspect the conventional framing is carrying dead weight, or you're early and want a clean foundation.",
    whenNot:
      "The constraints are genuinely fixed and well-understood — decomposing them again only re-derives the obvious and burns time.",
    procedure: [
      "Write the goal as a single outcome, stripped of any named solution.",
      "List every assumption the current approach smuggles in.",
      "For each assumption ask: is this a law of physics/economics, or just convention?",
      "Discard the conventions; keep only the irreducible truths.",
      "Recompose a solution that satisfies only those truths.",
    ],
  },
  {
    id: "biomimicry",
    name: "Biomimicry",
    intent: "Borrow a structure or strategy that biology already evolved for this class of problem.",
    whenToUse:
      "The problem is a function (move, sense, distribute, self-heal, cool, signal) that living systems have solved under harder constraints than yours.",
    whenNot:
      "The problem is abstract, social, or purely economic — forcing a nature metaphor produces decoration, not leverage.",
    procedure: [
      "Restate the problem as a verb: what function must be achieved?",
      "Ask which organisms or ecosystems achieve that function and survive on it.",
      "Name the mechanism (not the animal) — the actual strategy that works.",
      "Strip the biology away and keep the mechanism as an abstract principle.",
      "Map that principle onto your medium and test whether it transfers.",
    ],
  },
  {
    id: "oblique-strategies",
    name: "Oblique Provocation Cards",
    intent: "Break a fixation with an unrelated, slightly absurd instruction that forces a sideways move.",
    whenToUse:
      "You're looping on the same few ideas, the work feels precious, and you need to dislodge a fixation rather than reason your way out.",
    whenNot:
      "The problem needs rigor or correctness right now — a provocation injects noise that a constrained, high-stakes decision can't absorb.",
    procedure: [
      "State your current fixation in one sentence so you know what to break.",
      "Draw one provocation, e.g. 'remove the most important part', 'do the opposite', 'what would the lazy version be?'.",
      "Apply it literally for sixty seconds — no defending the original.",
      "Capture whatever the forced move surfaces, even if it's only a fragment.",
      "Keep the fragment, discard the provocation, and resume.",
    ],
  },
  {
    id: "jobs-to-be-done",
    name: "Jobs-To-Be-Done",
    intent: "Reframe around the progress a user is trying to make, not the product they hold.",
    whenToUse:
      "You're generating product or feature ideas and risk solving for features instead of the underlying job a person hires the product to do.",
    whenNot:
      "The problem is purely technical or internal with no user making progress — there's no 'job' to anchor on.",
    procedure: [
      "Name the person and the situation that triggers the need.",
      "Write the job as 'when I _, I want to _, so I can _'.",
      "List what they currently hire (including non-products and workarounds).",
      "Find where today's hire under-serves the job — that gap is the opening.",
      "Generate solutions judged only by how well they get the job done.",
    ],
  },
  {
    id: "triz",
    name: "TRIZ Contradiction Resolution",
    intent: "Find the design contradiction and resolve it instead of trading one good for another.",
    whenToUse:
      "You're stuck on a technical trade-off where improving one property degrades another and a compromise feels unavoidable.",
    whenNot:
      "There's no real contradiction — the problem is open-ended exploration, where contradiction analysis adds ceremony with no payoff.",
    procedure: [
      "Name the contradiction: 'to improve X, Y gets worse'.",
      "Restate both X and Y as measurable properties.",
      "Ask whether the two can be separated in time, space, scale, or condition.",
      "Look for a known inventive move (segment, nest, do-it-in-advance, invert) that dissolves the trade-off.",
      "Prototype the resolution that keeps X high without paying Y.",
    ],
  },
  {
    id: "scamper",
    name: "SCAMPER Transform Sweep",
    intent: "Systematically transform an existing thing along seven operators to mutate it into options.",
    whenToUse:
      "You already have a concrete artifact (a feature, flow, product) and want a fast breadth of incremental variations, not a blank-page rethink.",
    whenNot:
      "You have nothing to transform yet — SCAMPER mutates an existing thing, so on an empty page it spins.",
    procedure: [
      "Pin the existing thing you'll transform.",
      "Sweep each operator: Substitute, Combine, Adapt, Modify, Put-to-other-use, Eliminate, Reverse.",
      "For each operator force at least one concrete change to the thing.",
      "Keep the two or three mutations that feel non-obvious.",
      "Combine survivors and re-sweep once if a hybrid looks promising.",
    ],
  },
  {
    id: "leverage-points",
    name: "Systems Leverage Points",
    intent: "Intervene where a system yields most — rules and goals, not surface parameters.",
    whenToUse:
      "The problem is a process or system with feedback, and shallow fixes (tweaking numbers) keep failing because structure dominates.",
    whenNot:
      "The problem is a one-shot artifact with no feedback loops — there's no system to find leverage in.",
    procedure: [
      "Map the system: stocks, flows, and the feedback loops between them.",
      "Locate where the current effort is aimed (usually a parameter).",
      "Climb the leverage ladder: parameters → loop strength → information flow → rules → goals → paradigm.",
      "Pick the highest rung you can actually move.",
      "Design one intervention at that rung and predict the loop's response.",
    ],
  },
  {
    id: "lateral-provocations",
    name: "Lateral Provocation (PO)",
    intent: "Plant a deliberately unreasonable statement and harvest the path your mind takes to make it work.",
    whenToUse:
      "You need genuinely new ideas in an open creative space and logical, step-by-step generation keeps returning to the familiar.",
    whenNot:
      "You're converging toward a decision or need defensible reasoning — provocations are for diverging, not deciding.",
    procedure: [
      "Take a normal assumption about the problem and reverse, exaggerate, or escape it.",
      "State it as a provocation you don't have to believe ('the product ships with no UI').",
      "Don't judge it — ask what would have to be true for it to be useful.",
      "Follow that path to a usable idea the provocation suggested.",
      "Drop the provocation; keep the idea it led to.",
    ],
  },
  {
    id: "premortem-inversion",
    name: "Premortem Inversion",
    intent: "Assume the plan already failed, then generate ideas by removing every cause you find.",
    whenToUse:
      "You have a candidate plan and want to validate and harden it — surfacing failure modes before you commit, then designing them out.",
    whenNot:
      "You have nothing to fail yet — with no plan to invert, a premortem has no target.",
    procedure: [
      "Fast-forward and declare the plan a clear failure.",
      "Brainstorm every plausible reason it failed, no self-censoring.",
      "Rank the failure causes by likelihood × damage.",
      "For each top cause, generate the change that removes or detects it early.",
      "Fold those changes back into the plan as concrete safeguards.",
    ],
  },
  {
    id: "analogy-blending",
    name: "Analogy & Conceptual Blending",
    intent: "Fuse a distant domain with yours to inherit a solution shape your field hasn't tried.",
    whenToUse:
      "The problem feels novel in your domain but is probably a well-solved pattern somewhere else; you want a fresh frame to import.",
    whenNot:
      "The problem is tightly specified and constrained — a borrowed frame adds translation overhead and dilutes precision.",
    procedure: [
      "Abstract your problem to its bare relationship ('many producers, one scarce channel').",
      "Find a far domain that shares that relationship (traffic, ecology, markets, music).",
      "Study how that domain handles it and name the transferable move.",
      "Blend the two frames: keep your goal, adopt their mechanism.",
      "Test the blend for what breaks in translation and patch only that.",
    ],
  },
]);

/** Lookup map for O(1) catalog access by id. */
const BY_ID: ReadonlyMap<IdeationMethodId, IdeationMethod> = new Map(
  METHOD_CATALOG.map((m) => [m.id, m]),
);

/** Fetch one method by id, or `undefined` if the id is unknown. */
export function getMethod(id: IdeationMethodId): IdeationMethod | undefined {
  return BY_ID.get(id);
}

/**
 * Phase is the strongest signal — it nearly determines the method family. This
 * table is the primary route; domain and specificity only refine the
 * `generation` phase, where the catalog is widest.
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
};

/**
 * Route a problem to exactly ONE ideation method.
 *
 * Rules (first match wins, fully deterministic, no I/O):
 *  1. A `stuck` problem always routes to a fixation-breaker, regardless of
 *     domain/specificity — being stuck is the dominant signal.
 *  2. A `technical` + `constrained` problem is a trade-off — route to TRIZ,
 *     which exists precisely for design contradictions, in any phase but stuck.
 *  3. In `generation`, domain selects the family (the catalog is widest here);
 *     a still-`vague` generation problem falls back to first-principles to
 *     ground it before diverging.
 *  4. Otherwise the phase route applies.
 *  5. Unknown / unmatched input falls back to {@link DEFAULT_METHOD}.
 */
export function routeIdeationMethod(signals: IdeationSignals): IdeationMethodId {
  const { phase, domain, specificity } = signals;

  if (phase === "stuck") return PHASE_ROUTE.stuck;
  // Reached only when phase !== "stuck": a constrained technical trade-off.
  if (domain === "technical" && specificity === "constrained") return "triz";
  if (phase === "generation") {
    if (specificity === "vague") return "first-principles";
    return GENERATION_BY_DOMAIN[domain] ?? DEFAULT_METHOD;
  }
  return PHASE_ROUTE[phase] ?? DEFAULT_METHOD;
}

/** Route then resolve to the full method entry; `undefined` only if the id is somehow unknown. */
export function recommendMethod(signals: IdeationSignals): IdeationMethod | undefined {
  return getMethod(routeIdeationMethod(signals));
}
