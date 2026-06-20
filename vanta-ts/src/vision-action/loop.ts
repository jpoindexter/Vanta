// DESKTOP-VISION-TO-ACTION — the perceive → ground → act → verify → recover loop.
//
// From UI-TARS: a screenshot becomes a grounded action, then we re-observe to
// confirm the screen changed as expected and detect a mis-click. The loop logic
// is PURE — every perception/action is injected — so it is fully unit-testable;
// the live driver (real screenshots + clicks) is supplied by the `vision_action`
// tool, and each action is kernel-gated there. Recovery is a re-observe cadence:
// a grounded action that leaves the screen unchanged is treated as a mis-click,
// surfaced so the caller re-grounds and retries instead of blindly proceeding.

/** One perception of the current screen: an opaque shot reference (path/hash)
 *  plus an optional text summary the grounding step can read. */
export type Observation = { shot: string; summary?: string };

/** The result of locating a target in an observation. `found=false` means the
 *  target isn't on screen (scroll/recover); a found target carries whatever the
 *  actuator needs — a DOM selector and/or pixel coordinates. */
export type GroundedTarget = {
  found: boolean;
  selector?: string;
  x?: number;
  y?: number;
  label?: string;
  confidence?: number;
};

/** The injected substrate. Defaults (screenshot/vision/browser_act) live in the
 *  tool; tests pass fakes. */
export type VisionActionDeps = {
  perceive: () => Promise<Observation>;
  ground: (target: string, obs: Observation) => Promise<GroundedTarget>;
  act: (g: GroundedTarget) => Promise<void>;
  changed: (before: Observation, after: Observation) => Promise<boolean> | boolean;
};

export type StepStatus = "acted" | "not_found" | "misclick";

export type VisionActionStep = {
  status: StepStatus;
  target: string;
  grounded: GroundedTarget;
  before: Observation;
  after?: Observation;
  changed?: boolean;
  note: string;
};

/** One perceive → ground → act → re-perceive → verify pass. */
export async function visionActionStep(target: string, deps: VisionActionDeps): Promise<VisionActionStep> {
  const before = await deps.perceive();
  const grounded = await deps.ground(target, before);
  if (!grounded.found) {
    return { status: "not_found", target, grounded, before, note: `target "${target}" not located in the current screen` };
  }
  await deps.act(grounded);
  const after = await deps.perceive();
  const changed = await deps.changed(before, after);
  return changed
    ? { status: "acted", target, grounded, before, after, changed, note: "action landed; screen changed as expected" }
    : { status: "misclick", target, grounded, before, after, changed, note: "screen did not change — likely a mis-click; re-observe and retry" };
}

export type VisionActionResult = { ok: boolean; attempts: number; steps: VisionActionStep[]; note: string };

/**
 * Drive the loop with a recover-and-retry cadence: on a mis-click or a
 * not-found, re-observe and try again up to `maxAttempts`. Succeeds on the first
 * step whose grounded action visibly changes the screen.
 */
export async function runVisionAction(
  target: string,
  deps: VisionActionDeps,
  opts: { maxAttempts?: number } = {},
): Promise<VisionActionResult> {
  const max = Math.max(1, opts.maxAttempts ?? 2);
  const steps: VisionActionStep[] = [];
  for (let attempt = 1; attempt <= max; attempt++) {
    const step = await visionActionStep(target, deps);
    steps.push(step);
    if (step.status === "acted") {
      return { ok: true, attempts: attempt, steps, note: `grounded action landed on attempt ${attempt}` };
    }
  }
  const last = steps[steps.length - 1];
  const note = last?.status === "misclick"
    ? `exhausted ${max} attempt(s) after mis-click(s) — the screen never changed`
    : `target "${target}" was not located after ${max} attempt(s)`;
  return { ok: false, attempts: max, steps, note };
}
