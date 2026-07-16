import { envForPermissionMode } from "../modes/permission-mode.js";

/**
 * Desktop is a coding surface by default. File edits should not stall every turn,
 * but explicit operator choices and full auto mode still win.
 */
export function ensureDesktopPermissionMode(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  if (env.VANTA_PERMISSION_MODE || env.VANTA_AUTO_MODE === "1") return env;
  Object.assign(env, envForPermissionMode("acceptEdits"));
  return env;
}
