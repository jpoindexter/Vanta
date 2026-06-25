/**
 * Ideation method catalog — the analytic core (COFOUNDER-IDEATION-METHODS).
 *
 * The 10 grounding/analytic methods plus the assembled 22-method catalog
 * (core + `ideation-creative.ts`). Each entry carries a `creativity` weight
 * (0 = grounding/feasible, 1 = wild/divergent) and an `origin` attribution, so
 * the router in `ideation.ts` can balance feasibility against novelty. Frozen so
 * consumers can't mutate the shared library. Original content in Vanta's voice.
 */

import { CREATIVE_METHODS } from "./ideation-creative.js";

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

/** The analytic/grounding half — original 10, now weighted + attributed. */
const CORE_METHODS: readonly IdeationMethod[] = [
  {
    id: "first-principles",
    name: "First-Principles Decomposition",
    origin: "Aristotle → Descartes; revived in modern product/engineering practice",
    creativity: 0.3,
    intent: "Rebuild the problem from what must be true, not from how it's usually done.",
    whenToUse: "Inherited framing you suspect carries dead weight, or you want a clean early foundation.",
    whenNot: "Constraints are genuinely fixed and understood — re-deriving only burns time.",
    procedure: [
      "Write the goal as a single outcome, stripped of any named solution.",
      "List every assumption the current approach smuggles in.",
      "Keep only the irreducible truths (laws of physics/economics); discard conventions.",
      "Recompose a solution that satisfies only those truths.",
    ],
  },
  {
    id: "biomimicry",
    name: "Biomimicry",
    origin: "Janine Benyus",
    creativity: 0.5,
    intent: "Borrow a structure or strategy biology already evolved for this class of problem.",
    whenToUse: "The problem is a function (move, sense, distribute, cool) that living systems solved under harder constraints.",
    whenNot: "The problem is abstract, social, or purely economic — a nature metaphor decorates, not leverages.",
    procedure: [
      "Restate the problem as a verb: what function must be achieved?",
      "Find organisms/ecosystems that achieve that function and survive on it.",
      "Name the mechanism (not the animal); strip the biology to an abstract principle.",
      "Map that principle onto your medium and test whether it transfers.",
    ],
  },
  {
    id: "oblique-strategies",
    name: "Oblique Provocation Cards",
    origin: "Brian Eno & Peter Schmidt",
    creativity: 0.8,
    intent: "Break a fixation with an unrelated, slightly absurd instruction that forces a sideways move.",
    whenToUse: "You're looping on the same few ideas and need to dislodge a fixation, not reason out of it.",
    whenNot: "The problem needs rigor right now — a provocation injects noise a high-stakes call can't absorb.",
    procedure: [
      "State your current fixation in one sentence so you know what to break.",
      "Draw one provocation ('remove the most important part', 'do the opposite').",
      "Apply it literally for sixty seconds — no defending the original.",
      "Keep whatever fragment it surfaces; discard the provocation.",
    ],
  },
  {
    id: "jobs-to-be-done",
    name: "Jobs-To-Be-Done",
    origin: "Clayton Christensen & Tony Ulwick",
    creativity: 0.3,
    intent: "Reframe around the progress a user is trying to make, not the product they hold.",
    whenToUse: "Generating product/feature ideas and at risk of solving for features instead of the underlying job.",
    whenNot: "Purely technical or internal with no user making progress — there's no 'job' to anchor on.",
    procedure: [
      "Name the person and the situation that triggers the need.",
      "Write the job as 'when I _, I want to _, so I can _'.",
      "List what they currently hire (including non-products and workarounds).",
      "Find where today's hire under-serves the job — that gap is the opening.",
    ],
  },
  {
    id: "triz",
    name: "TRIZ Contradiction Resolution",
    origin: "Genrich Altshuller",
    creativity: 0.4,
    intent: "Find the design contradiction and resolve it instead of trading one good for another.",
    whenToUse: "A technical trade-off where improving one property degrades another and compromise feels unavoidable.",
    whenNot: "There's no real contradiction — open-ended exploration where this adds ceremony.",
    procedure: [
      "Name the contradiction: 'to improve X, Y gets worse'.",
      "Restate both X and Y as measurable properties.",
      "Ask whether they separate in time, space, scale, or condition.",
      "Apply an inventive move (segment, nest, do-in-advance, invert) that dissolves the trade-off.",
    ],
  },
  {
    id: "scamper",
    name: "SCAMPER Transform Sweep",
    origin: "Alex Osborn & Bob Eberle",
    creativity: 0.5,
    intent: "Systematically transform an existing thing along seven operators to mutate it into options.",
    whenToUse: "You have a concrete artifact and want fast breadth of variations, not a blank-page rethink.",
    whenNot: "Nothing to transform yet — on an empty page SCAMPER spins.",
    procedure: [
      "Pin the existing thing you'll transform.",
      "Sweep each operator: Substitute, Combine, Adapt, Modify, Put-to-other-use, Eliminate, Reverse.",
      "Force at least one concrete change per operator; keep the non-obvious mutations.",
      "Combine survivors and re-sweep once if a hybrid looks promising.",
    ],
  },
  {
    id: "leverage-points",
    name: "Systems Leverage Points",
    origin: "Donella Meadows",
    creativity: 0.4,
    intent: "Intervene where a system yields most — rules and goals, not surface parameters.",
    whenToUse: "A process/system with feedback where shallow fixes keep failing because structure dominates.",
    whenNot: "A one-shot artifact with no feedback loops — no system to find leverage in.",
    procedure: [
      "Map the system: stocks, flows, and the feedback loops between them.",
      "Climb the leverage ladder: parameters → loop strength → information → rules → goals → paradigm.",
      "Pick the highest rung you can actually move.",
      "Design one intervention there and predict the loop's response.",
    ],
  },
  {
    id: "lateral-provocations",
    name: "Lateral Provocation (PO)",
    origin: "Edward de Bono",
    creativity: 0.85,
    intent: "Plant a deliberately unreasonable statement and harvest the path your mind takes to make it work.",
    whenToUse: "You need genuinely new ideas in open space and step-by-step logic keeps returning the familiar.",
    whenNot: "You're converging toward a decision or need defensible reasoning — provocations diverge, not decide.",
    procedure: [
      "Take a normal assumption and reverse, exaggerate, or escape it.",
      "State it as a provocation you don't have to believe ('the product ships with no UI').",
      "Ask what would have to be true for it to be useful; follow that path.",
      "Drop the provocation; keep the idea it led to.",
    ],
  },
  {
    id: "premortem-inversion",
    name: "Premortem Inversion",
    origin: "Gary Klein",
    creativity: 0.25,
    intent: "Assume the plan already failed, then generate ideas by removing every cause you find.",
    whenToUse: "You have a candidate plan and want to validate and harden it before committing.",
    whenNot: "You have nothing to fail yet — with no plan to invert, a premortem has no target.",
    procedure: [
      "Fast-forward and declare the plan a clear failure.",
      "Brainstorm every plausible reason it failed, no self-censoring.",
      "Rank the causes by likelihood × damage.",
      "For each top cause, generate the change that removes or detects it early; fold it back in.",
    ],
  },
  {
    id: "analogy-blending",
    name: "Analogy & Conceptual Blending",
    origin: "Gilles Fauconnier & Mark Turner",
    creativity: 0.6,
    intent: "Fuse a distant domain with yours to inherit a solution shape your field hasn't tried.",
    whenToUse: "The problem feels novel in your domain but is probably well-solved somewhere else.",
    whenNot: "Tightly specified and constrained — a borrowed frame adds translation overhead.",
    procedure: [
      "Abstract your problem to its bare relationship ('many producers, one scarce channel').",
      "Find a far domain that shares that relationship (traffic, ecology, markets, music).",
      "Name the transferable move; blend the two frames — keep your goal, adopt their mechanism.",
      "Test the blend for what breaks in translation and patch only that.",
    ],
  },
];

/**
 * The full 22-method catalog: analytic core + creative half, frozen so consumers
 * can't mutate the shared library.
 */
export const METHOD_CATALOG: readonly IdeationMethod[] = Object.freeze([
  ...CORE_METHODS,
  ...CREATIVE_METHODS,
]);

/** Lookup map for O(1) catalog access by id. */
const BY_ID: ReadonlyMap<IdeationMethodId, IdeationMethod> = new Map(
  METHOD_CATALOG.map((m) => [m.id, m]),
);

/** Fetch one method by id, or `undefined` if the id is unknown. */
export function getMethod(id: IdeationMethodId): IdeationMethod | undefined {
  return BY_ID.get(id);
}
