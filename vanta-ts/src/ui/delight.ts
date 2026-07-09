const TRUTHY = new Set(["1", "true", "yes", "on"]);
const FALSY = new Set(["0", "false", "no", "off"]);

export const SIGNATURE_LINE = "goal first · tools second · verified before done";
export const REDUCED_MOTION_ENV = "VANTA_REDUCED_MOTION";
export const DELIGHT_ENV = "VANTA_DELIGHT";

function truthy(value: string | undefined): boolean {
  return value !== undefined && TRUTHY.has(value.trim().toLowerCase());
}

function falsy(value: string | undefined): boolean {
  return value !== undefined && FALSY.has(value.trim().toLowerCase());
}

/** TUI identity affordances stay out of bare/scripted surfaces. */
export function delightEnabled(env: NodeJS.ProcessEnv = process.env, isTTY = true): boolean {
  if (!isTTY) return false;
  if (falsy(env[DELIGHT_ENV])) return false;
  if (truthy(env.VANTA_BARE) || truthy(env.VANTA_SCRIPTING)) return false;
  if (truthy(env.CI) || env.TERM === "dumb") return false;
  return true;
}

/** Motion is opt-out and also disabled for low-fidelity terminal contexts. */
export function prefersReducedMotion(env: NodeJS.ProcessEnv = process.env): boolean {
  return truthy(env[REDUCED_MOTION_ENV]) || truthy(env.VANTA_REDUCED_UI) || truthy(env.NO_COLOR);
}

/** Animated delight is a stricter subset of the identity layer. */
export function delightMotionEnabled(env: NodeJS.ProcessEnv = process.env, isTTY = true): boolean {
  if (!delightEnabled(env, isTTY)) return false;
  if (prefersReducedMotion(env)) return false;
  return true;
}

export function signatureLine(env: NodeJS.ProcessEnv = process.env, isTTY = true): string {
  return delightEnabled(env, isTTY) ? SIGNATURE_LINE : "";
}
