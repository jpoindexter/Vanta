// VISION-WATCH-ALERT — change-detect a camera/screen, describe, alert via gateway.
//
// The "watch what's next" sense: periodically capture a frame, detect a
// meaningful change versus the prior frame, and on a meaningful change produce a
// vision description + push an alert through the gateway. The detection and the
// orchestration are PURE — every effect (capture, hash, describe, alert) is
// injected — so the loop is fully unit-testable with no real camera, vision
// model, or network. The live substrate (macOS screencapture, a vision provider,
// send_chat) is supplied by the `vision_watch` tool and is the documented
// boundary. Every effect degrades to errors-as-values: a capture/vision/alert
// failure surfaces in the result, never throws through the loop.

/** A captured frame: opaque bytes the hasher reduces to a comparable digest. */
export type Frame = { bytes: Uint8Array };

/** The prior-hash state a watch carries between steps. A fresh watch starts with
 *  `prevHash: null` (the first capture is the baseline, never an alert). */
export type WatchState = { prevHash: string | null };

/** Start a watch with no prior frame. Pure. */
export function newWatchState(): WatchState {
  return { prevHash: null };
}

/**
 * Difference between two equal-length hashes as a fraction (0 = identical,
 * 1 = every position differs) — a Hamming distance normalized by length, so it
 * composes with perceptual hashes (near-identical frames score near 0). Hashes
 * of unequal length are maximally different (1). Pure.
 */
export function hashDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length !== b.length) return 1;
  let differing = 0;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) differing++;
  }
  return differing / a.length;
}

/**
 * Did the frame meaningfully change versus the prior one? With no prior hash
 * there is nothing to compare against, so it is NOT a change (the first frame is
 * the baseline). Otherwise the normalized hash distance must exceed `threshold`
 * (default 0 — any difference counts). Pure.
 */
export function detectChange(prevHash: string | null, nextHash: string, threshold = 0): boolean {
  if (prevHash === null) return false;
  return hashDistance(prevHash, nextHash) > threshold;
}

/** The injected substrate. Live defaults (screencapture/vision/send_chat) live in
 *  the tool; tests pass fakes that return canned frames/hashes/descriptions. */
export type VisionWatchDeps = {
  capture: () => Promise<Frame>;
  hash: (frame: Frame) => string;
  describe: (frame: Frame) => Promise<string>;
  alert: (description: string) => Promise<boolean>;
  /** 0..1 normalized hash-distance a change must exceed to count (default 0). */
  threshold?: number;
};

export type VisionWatchStep = {
  /** A meaningful change versus the prior frame was detected. */
  changed: boolean;
  /** The new frame's hash, to carry forward as the next step's prior. */
  hash: string;
  /** The vision description — present only when `changed` and describe succeeded. */
  description?: string;
  /** The alert was dispatched and accepted by the gateway. */
  alerted: boolean;
  /** A one-line human-readable summary of what the step did. */
  note: string;
};

/** Failure note for a degraded effect; keeps the step a value, never a throw. */
function failure(stage: string, err: unknown): string {
  return `${stage} failed: ${(err as Error).message}`;
}

/**
 * One watch step: capture → hash → compare to the prior hash → on a meaningful
 * change, describe + alert. Mutates `state.prevHash` to the new hash so the next
 * step compares against it. Every effect is error-tolerant: a capture failure
 * returns an unchanged step; a describe/alert failure surfaces in the note but
 * still advances the baseline so the watch doesn't re-alert on the same frame.
 */
export async function runVisionWatchStep(deps: VisionWatchDeps, state: WatchState): Promise<VisionWatchStep> {
  let frame: Frame;
  try {
    frame = await deps.capture();
  } catch (err) {
    return { changed: false, hash: state.prevHash ?? "", alerted: false, note: failure("capture", err) };
  }

  const hash = deps.hash(frame);
  const changed = detectChange(state.prevHash, hash, deps.threshold ?? 0);
  const isBaseline = state.prevHash === null;
  state.prevHash = hash;

  if (!changed) {
    return { changed: false, hash, alerted: false, note: isBaseline ? "baseline frame captured" : "no meaningful change" };
  }

  let description: string;
  try {
    description = await deps.describe(frame);
  } catch (err) {
    return { changed: true, hash, alerted: false, note: failure("describe", err) };
  }

  try {
    const alerted = await deps.alert(description);
    return {
      changed: true,
      hash,
      description,
      alerted,
      note: alerted ? "change detected — described and alerted" : "change detected and described, but the alert was not delivered",
    };
  } catch (err) {
    return { changed: true, hash, description, alerted: false, note: failure("alert", err) };
  }
}
