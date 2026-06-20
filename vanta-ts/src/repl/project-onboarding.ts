// VANTA-PROJECT-ONBOARDING — the FIRST time Vanta runs in a project with no
// Vanta config, surface a compact ordered checklist of the steps to get set up.
// Pure + injectable: the step model (which steps apply given the detected state)
// and the checklist render are decoupled from any I/O. `needsOnboarding` is true
// only for a genuinely fresh project; an already-configured project = no
// onboarding (current behavior). Mirrors the clarity-gate shape: a pure detector
// + a pure renderer the host wires in, never a hard block.

/** Detected project state the step model reads. Each flag is "is this already done". */
export type OnboardingState = {
  /** A model backend resolves (provider/key configured) — `isConfigured` in cli/startup.ts. */
  hasModel: boolean;
  /** At least one goal is seeded (kernel goal ledger / `.vanta/goals.tsv`). */
  hasGoal: boolean;
  /** A project context doc exists (`.claude/CLAUDE.md`, written by `/init`). */
  hasProjectContext: boolean;
  /** A `.vanta/` data dir already exists — the project has been run in before. */
  hasVantaDir: boolean;
};

/** One ordered onboarding step: stable id, what it is, a one-line how, and whether it's done. */
export type OnboardingStep = {
  id: "model" | "goal" | "context" | "tools";
  title: string;
  /** One-line "how" — the concrete command/action that completes the step. */
  how: string;
  done: boolean;
};

/** Steps whose completion is REQUIRED to get started — drives `needsOnboarding`. */
const CORE_STEP_IDS: ReadonlySet<OnboardingStep["id"]> = new Set(["model", "goal"]);

/** Box glyphs for the checklist (literal — the card's spec calls for ☐/☑ directly). */
const UNCHECKED = "☐";
const CHECKED = "☑";

/**
 * Build the ordered onboarding steps with their done flags derived from `state`.
 * Order is fixed (model → goal → context → tools): a setup-progression sequence.
 * Pure, deterministic, no I/O.
 *
 * The `tools` step has no detectable completion signal (there's always more to
 * explore), so it's "done" exactly when the project has been run in before (a
 * `.vanta/` dir exists) — a returning project isn't nagged to explore tools.
 */
export function buildOnboardingSteps(state: OnboardingState): OnboardingStep[] {
  return [
    {
      id: "model",
      title: "pick a model backend",
      how: "run `vanta setup`",
      done: state.hasModel,
    },
    {
      id: "goal",
      title: "seed a first goal",
      how: 'run `vanta goals add "<what you\'re building>"`',
      done: state.hasGoal,
    },
    {
      id: "context",
      title: "capture project context (optional)",
      how: "run `/init` to write `.claude/CLAUDE.md`",
      done: state.hasProjectContext,
    },
    {
      id: "tools",
      title: "explore tools & MCPs (optional)",
      how: "run `/help`, or wire a server in `.mcp.json`",
      done: state.hasVantaDir,
    },
  ];
}

/**
 * True only when the project looks FRESH (no prior `.vanta/` dir) AND some CORE
 * step (pick a model, seed a goal) is still undone. A configured project — or one
 * with all core steps done — returns false, so no checklist is shown (current
 * behavior preserved). Pure.
 */
export function needsOnboarding(state: OnboardingState): boolean {
  if (state.hasVantaDir) return false; // run here before — not a first run
  return buildOnboardingSteps(state).some((step) => CORE_STEP_IDS.has(step.id) && !step.done);
}

/**
 * Render the steps as a compact checklist string with ☐/☑ marks and each step's
 * how. Returns "" for an empty step list. Pure — the host decides when to call it
 * (it gates on `needsOnboarding`). Mirrors the clarity-gate note shape.
 */
export function renderOnboarding(steps: OnboardingStep[]): string {
  if (steps.length === 0) return "";
  const lines = steps.map((step) => {
    const mark = step.done ? CHECKED : UNCHECKED;
    return `  ${mark} ${step.title} — ${step.how}`;
  });
  return [`◇ Get started:`, ...lines].join("\n");
}
