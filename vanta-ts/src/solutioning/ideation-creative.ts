/**
 * Creative-ideation methods — the artist/thinker half of the catalog.
 *
 * These extend the analytic core (`ideation-catalog.ts`) toward the divergent
 * end of the feasibility↔creativity spectrum. Each entry is written from scratch
 * in Vanta's voice; the names are the conventional names of the techniques and
 * `origin` attributes the originator (a method earns its weight by being the
 * wrong tool for most problems and exactly right for one).
 */

import type { IdeationMethod } from "./ideation-catalog.js";

/** The 12 creative methods, ordered low→high on the creativity weight. */
export const CREATIVE_METHODS: readonly IdeationMethod[] = [
  {
    id: "polya",
    name: "Pólya's How to Solve It",
    origin: "George Pólya",
    creativity: 0.2,
    intent: "Work a well-posed problem with the four-move heuristic instead of staring at it.",
    whenToUse: "A problem that is well-defined and likely has a known method you can reuse.",
    whenNot: "Open-ended creative divergence — the heuristic converges, it doesn't explode.",
    procedure: [
      "Understand: restate it; name the knowns, the unknown, the condition.",
      "Plan: find a related problem you've already solved; can you reuse its method or result?",
      "Carry out + look back: execute the plan, then check whether the result or method generalizes.",
    ],
  },
  {
    id: "affinity-diagrams",
    name: "Affinity Diagrams (KJ Method)",
    origin: "Jiro Kawakita",
    creativity: 0.25,
    intent: "Let structure emerge bottom-up from scattered observations rather than imposing it.",
    whenToUse: "You're drowning in fragments — notes, signals, interview quotes — with no frame.",
    whenNot: "A single clean question with one answer; clustering one note is theatre.",
    procedure: [
      "Put every fragment on its own note — one observation each.",
      "Cluster by felt affinity in silence, before naming anything.",
      "Name each cluster last — the names you're forced to write are the insight.",
    ],
  },
  {
    id: "creative-discipline",
    name: "The Spine (Creative Discipline)",
    origin: "Twyla Tharp",
    creativity: 0.3,
    intent: "Sustain a long creative work past the novelty high by feeding its through-line.",
    whenToUse: "Refining or carrying a project that has lost its early dopamine but isn't done.",
    whenNot: "The very first divergent spark — discipline there just smothers the seed.",
    procedure: [
      "Name the spine: the one non-negotiable through-line the work is about.",
      "Run a repeatable ritual that feeds the spine on schedule, not on mood.",
      "Cut anything — however clever — that doesn't serve the spine.",
    ],
  },
  {
    id: "pattern-languages",
    name: "Pattern Languages",
    origin: "Christopher Alexander",
    creativity: 0.35,
    intent: "Capture a recurring solution as a reusable context→forces→resolution pattern.",
    whenToUse: "The same problem keeps recurring across contexts and you keep re-solving it.",
    whenNot: "A genuine one-off — generalizing a single case invents forces that aren't there.",
    procedure: [
      "Name the recurring problem-in-context precisely.",
      "Write it as a pattern: the context, the competing forces, the resolution that balances them.",
      "Compose several patterns into a coherent whole that reads as a language.",
    ],
  },
  {
    id: "compression-progress",
    name: "Compression-Progress",
    origin: "Jürgen Schmidhuber",
    creativity: 0.45,
    intent: "Select the idea whose insight compresses the most — one principle explaining many cases.",
    whenToUse: "Selecting among many candidates and you want a principled criterion, not taste.",
    whenNot: "Nothing generated yet — there's nothing to compress.",
    procedure: [
      "Lay the candidate ideas out side by side.",
      "Score each by how much it compresses: how many separate needs does one idea now explain?",
      "Keep the candidate whose 'aha' deletes the most description.",
    ],
  },
  {
    id: "volume-generation",
    name: "Volume Generation",
    origin: "Ira Glass · the quantity-beats-quality parable",
    creativity: 0.5,
    intent: "Buy the outliers with sheer volume, then cut hard — range first, judgment later.",
    whenToUse: "Your first ideas are timid and you need real range before deciding.",
    whenNot: "You already have the right answer; volume just delays it.",
    procedure: [
      "Generate a deliberately large batch with judgment suspended (aim for a number).",
      "Defer every filter until the whole batch exists.",
      "Cut hard to the few survivors — the volume is what surfaced the non-obvious ones.",
    ],
  },
  {
    id: "story-skeletons",
    name: "Story Skeletons",
    origin: "Kurt Vonnegut",
    creativity: 0.55,
    intent: "Borrow a narrative arc to give a pitch, sequence, or experience its shape.",
    whenToUse: "Something sequential — a pitch, a launch, an onboarding — that feels shapeless.",
    whenNot: "A non-sequential system with no beginning/middle/end to plot.",
    procedure: [
      "Reduce it to an arc (man-in-hole, boy-meets-girl, rise, fall).",
      "Plot your subject on that arc — where's the drop, the turn, the rise?",
      "Generate the missing beats the shape demands but the draft skipped.",
    ],
  },
  {
    id: "oulipo",
    name: "Oulipo Constraints",
    origin: "Raymond Queneau & Georges Perec (Oulipo)",
    creativity: 0.7,
    intent: "Let an arbitrary hard constraint do the inventing the blank page never would.",
    whenToUse: "A blank page, or too many free options paralyze you into the obvious.",
    whenNot: "Constraints are already over-tight — adding one suffocates the work.",
    procedure: [
      "Choose an arbitrary, hard constraint (a form, a forbidden element, a fixed structure).",
      "Generate strictly inside it — no cheating; the constraint is the engine.",
      "Keep what the constraint forced that a free choice never would have reached.",
    ],
  },
  {
    id: "defamiliarization",
    name: "Defamiliarization (Ostranenie)",
    origin: "Viktor Shklovsky",
    creativity: 0.75,
    intent: "Strip the names off an over-familiar thing so you can see it — and its flaws — again.",
    whenToUse: "You've stopped seeing a familiar object/flow and miss its obvious problems.",
    whenNot: "A brand-new thing — there's no familiarity to break.",
    procedure: [
      "Take the thing you've stopped noticing.",
      "Describe it as an alien would: no names, no conventions, only raw function.",
      "Redesign from that stripped description — the gaps are now visible.",
    ],
  },
  {
    id: "derive-mapping",
    name: "Dérive & Psychogeographic Mapping",
    origin: "Guy Debord & the Situationists",
    creativity: 0.8,
    intent: "Drift the problem space with no goal, then map the adjacencies the drift revealed.",
    whenToUse: "Discovery — you don't yet know the territory and a plan would prune too early.",
    whenNot: "A deadline-bound convergent task; drifting burns the clock.",
    procedure: [
      "Wander the space following pull, not plan — let interest, not the goal, steer.",
      "Map what you actually encountered, not what you set out to find.",
      "Name the unexpected adjacency the drift exposed — that's the opening.",
    ],
  },
  {
    id: "chance-remix",
    name: "Chance & Remix",
    origin: "John Cage · Brian Eno · Kirby Ferguson",
    creativity: 0.85,
    intent: "Let a real random input dictate a choice your taste would otherwise make for you.",
    whenToUse: "Your taste keeps returning the same move and you want out of your own groove.",
    whenNot: "A decision that needs accountability — chance can't be defended to a stakeholder.",
    procedure: [
      "Introduce a genuine random input (dice, shuffle, a found object, a coin).",
      "Let it dictate a choice you'd normally reason through.",
      "Remix the result back into the original; keep the collision that surprises you.",
    ],
  },
  {
    id: "pataphysics",
    name: "Pataphysics (Imaginary Solutions)",
    origin: "Alfred Jarry",
    creativity: 0.95,
    intent: "Treat an absurd premise as literally true, engineer it rigorously, port back what works.",
    whenToUse: "Every realistic idea is boring and you need the genuine extreme to break orbit.",
    whenNot: "You must ship now — this is the science of imaginary solutions, not real ones.",
    procedure: [
      "Take an absurd or impossible premise and treat it as literally true.",
      "Engineer rigorously for that fake world — follow its logic all the way.",
      "Port the one mechanism that still works back into the real problem.",
    ],
  },
];
