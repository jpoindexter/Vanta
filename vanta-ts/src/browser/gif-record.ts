// VANTA-CHROME-GIF-RECORDER — turn a multi-step browser_act sequence into a
// shareable GIF replay. This module is the PURE planning layer only: it builds
// the frame plan (one frame per executed step), resolves the GIF spec
// (dimensions/fps/loop), and describes the encode job. It NEVER captures a
// screenshot and NEVER encodes bytes.
//
// Capture + encode wire (NOT built this round, named for clarity-gate):
//   1. When gifRecordEnabled(process.env) is true, browser_act
//      (browser/act.ts → browser-act-run.ts) would, after each executed action,
//      capture one screenshot frame via the screenshot capability
//      (tools/screenshot.ts — the injected boundary, the frame SOURCE) and
//      collect the resulting PNG paths in step order.
//   2. buildFramePlan(steps, opts) pairs each captured frame with its label +
//      per-frame delay; resolveGifSpec(opts) fixes the output spec.
//   3. buildAssemblyPlan(frames, spec) is handed to a GIF ENCODER (a real
//      image/gif encoder dep — the documented dep boundary; NOT added here) to
//      assemble the captured PNGs into the final .gif.
// No steps → no frames → no GIF (buildFramePlan([]) === []).

/** A single planned GIF frame: which step it follows, its label, its hold time. */
export type GifFrame = {
  /** 0-based index of the browser_act step this frame is captured AFTER. */
  afterStepIndex: number;
  /** Human label for the frame, derived from the action (control-stripped). */
  label: string;
  /** How long this frame is held on screen, in milliseconds. */
  delayMs: number;
};

/** The output GIF spec. Dimensions are optional (encoder may infer from frames). */
export type GifSpec = {
  /** Output width in px; undefined = encoder infers from the first frame. */
  width?: number;
  /** Output height in px; undefined = encoder infers from the first frame. */
  height?: number;
  /** Frames per second (clamped to FPS_MIN..FPS_MAX). */
  fps: number;
  /** Whether the GIF loops forever. */
  loop: boolean;
};

/** One input step: the action drives the label; an explicit label overrides it. */
export type GifStep = {
  /** The browser action that ran (e.g. "navigate → https://…", "click → #buy"). */
  action: string;
  /** Optional explicit label; falls back to the action when absent. */
  label?: string;
};

/** Options for the frame plan + spec. All optional — sane defaults applied. */
export type GifRecordOptions = {
  fps?: number;
  loop?: boolean;
  width?: number;
  height?: number;
  /** Append a final frame that re-holds the last step (a "rest" beat). */
  finalHold?: boolean;
  /** Hold time for the appended final frame; defaults to FINAL_HOLD_MS. */
  finalHoldMs?: number;
};

/** A description of the encode job — NOT the encoded bytes. Handed to the encoder. */
export type GifAssemblyPlan = {
  /** Number of frames the encoder must assemble. */
  frameCount: number;
  /** Sum of every frame's delayMs — the GIF's total playback duration. */
  totalDurationMs: number;
  /** The resolved output spec the encoder targets. */
  spec: GifSpec;
};

/** Default playback rate when a caller doesn't specify one. */
export const DEFAULT_FPS = 2;
/** Lowest sane fps (1 frame/sec). */
export const FPS_MIN = 1;
/** Highest sane fps (GIF playback ceiling). */
export const FPS_MAX = 30;
/** Default hold time for an appended final frame (ms). */
export const FINAL_HOLD_MS = 1_000;
/** Env flag enabling per-step capture. OFF unless set to exactly "1". */
export const GIF_RECORD_ENV = "VANTA_GIF_RECORD";

// Control chars (incl. ESC \x1b / BEL \x07 / newlines) + C1 controls — a label is
// derived from action data (URLs/selectors/typed text), so strip anything that
// could inject an escape sequence into a rendered frame label (no escape
// injection). Mirrors ui/status-notices.ts sanitizeText.
const CONTROL_CHARS = new RegExp("[\\u0000-\\u001f\\u007f-\\u009f]", "g");
const WHITESPACE_RUN = /\s+/g;

/** Strip control chars, collapse whitespace runs to single spaces, trim. */
function sanitizeLabel(text: string): string {
  return text.replace(CONTROL_CHARS, " ").replace(WHITESPACE_RUN, " ").trim();
}

/** Clamp an fps to the sane GIF range; non-finite/≤0 → DEFAULT_FPS. */
function clampFps(fps: number | undefined): number {
  if (fps === undefined || !Number.isFinite(fps) || fps <= 0) return DEFAULT_FPS;
  return Math.min(FPS_MAX, Math.max(FPS_MIN, Math.round(fps)));
}

/**
 * Resolve the GIF output spec from options. fps defaults to DEFAULT_FPS and is
 * clamped to FPS_MIN..FPS_MAX; loop defaults to true; dimensions stay optional
 * (the encoder infers them from the captured frames when omitted).
 */
export function resolveGifSpec(opts: GifRecordOptions = {}): GifSpec {
  const spec: GifSpec = {
    fps: clampFps(opts.fps),
    loop: opts.loop ?? true,
  };
  if (opts.width !== undefined && Number.isFinite(opts.width) && opts.width > 0) {
    spec.width = Math.round(opts.width);
  }
  if (opts.height !== undefined && Number.isFinite(opts.height) && opts.height > 0) {
    spec.height = Math.round(opts.height);
  }
  return spec;
}

/** Per-frame delay for a spec: 1000/fps ms (rounded). The pacing of the replay. */
export function frameDelayMs(spec: GifSpec): number {
  return Math.round(1000 / spec.fps);
}

/**
 * Build the frame plan: one frame per executed step, in order. Each frame's
 * label comes from the step's explicit label, else its action (control-stripped);
 * each frame's delay is the spec's per-frame delay. With finalHold, one extra
 * frame re-holds the last step for a rest beat. No steps → no frames → [].
 */
export function buildFramePlan(steps: GifStep[], opts: GifRecordOptions = {}): GifFrame[] {
  if (steps.length === 0) return [];
  const spec = resolveGifSpec(opts);
  const delayMs = frameDelayMs(spec);
  const frames: GifFrame[] = steps.map((step, i) => ({
    afterStepIndex: i,
    label: sanitizeLabel(step.label ?? step.action),
    delayMs,
  }));
  const last = frames[frames.length - 1];
  if (opts.finalHold && last) {
    frames.push({
      afterStepIndex: last.afterStepIndex,
      label: last.label,
      delayMs: opts.finalHoldMs ?? FINAL_HOLD_MS,
    });
  }
  return frames;
}

/**
 * Describe the encode job for a planned frame set + spec: the frame count, the
 * total playback duration (sum of every frame's delayMs), and the target spec.
 * This is the hand-off to the GIF encoder (the dep boundary) — NOT the bytes.
 */
export function buildAssemblyPlan(frames: GifFrame[], spec: GifSpec): GifAssemblyPlan {
  const totalDurationMs = frames.reduce((sum, f) => sum + f.delayMs, 0);
  return { frameCount: frames.length, totalDurationMs, spec };
}

/** Is per-step GIF capture enabled? OFF by default; on only at VANTA_GIF_RECORD=1. */
export function gifRecordEnabled(env: NodeJS.ProcessEnv): boolean {
  return env[GIF_RECORD_ENV] === "1";
}
