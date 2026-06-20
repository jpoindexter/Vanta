// VANTA-CLIPBOARD-IMAGE-HINT — when the operator returns focus / submits and the
// clipboard currently holds an IMAGE, surface a one-line hint so they know they
// can attach it via /paste. Pure + injectable: the platform clipboard-image check
// is an injected `probe` (so tests never touch the real clipboard), a probe
// failure degrades to "no image" (never throws), and a disable env var short-
// circuits to null. Mirrors the clarity-gate shape — a best-effort, non-blocking
// hint string, not a hard gate. The real probe is a live boundary; this module
// only owns the detection-and-build, not the live wiring.
//
// WIRING (next round): call `maybeClipboardHint({ probe, env })` at the
// next-submit / focus-regain point — i.e. when `runUserTurn` (interactive.ts) or
// `sendToAgent` (ui/use-agent.ts) begins handling a submitted turn, alongside the
// existing pre-turn gates (clarity-gate / complexity-gate / closure-gate). A
// non-null return is surfaced via `deps.onText`, exactly like buildClarityNote.

/** The one-line hint string surfaced when the clipboard holds an image. Pure. */
export function buildClipboardImageHint(): string {
  return "📋 an image is on your clipboard — /paste to attach it";
}

/** True unless `VANTA_CLIPBOARD_HINT=0` disables it. Default on. Pure. */
export function clipboardHintEnabled(env: NodeJS.ProcessEnv): boolean {
  return env.VANTA_CLIPBOARD_HINT !== "0";
}

/** Side effects the detector needs, injected so no real clipboard is touched in tests. */
export type ClipboardHintDeps = {
  /** Platform clipboard-image check — returns true when an image is present. */
  probe: () => boolean;
  /** Process environment (read for the disable flag). */
  env: NodeJS.ProcessEnv;
};

/**
 * Best-effort "does the clipboard currently hold an image?" check. Delegates to
 * the injected `probe`; a probe that throws is treated as "no image" (returns
 * false, never throws) — the hint is a nicety, never worth crashing a turn over.
 * Pure aside from calling the injected probe.
 */
export function clipboardHasImage(deps: ClipboardHintDeps): boolean {
  try {
    return deps.probe() === true;
  } catch {
    return false;
  }
}

/**
 * The hint string when the gate is enabled AND the clipboard holds an image,
 * else null. Disabled (`VANTA_CLIPBOARD_HINT=0`) → null even with an image; no
 * image (or an unavailable/throwing probe) → null. Never throws.
 */
export function maybeClipboardHint(deps: ClipboardHintDeps): string | null {
  if (!clipboardHintEnabled(deps.env)) return null;
  if (!clipboardHasImage(deps)) return null;
  return buildClipboardImageHint();
}
