import { envForPermissionMode, parsePermissionMode } from "../modes/permission-mode.js";

/**
 * Desktop is a coding surface by default. File edits should not stall every turn,
 * but full auto mode still wins. Use VANTA_DESKTOP_PERMISSION_MODE=default when
 * testing the manual approval path in the desktop app.
 */
export function ensureDesktopPermissionMode(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const desktopMode = parsePermissionMode(env.VANTA_DESKTOP_PERMISSION_MODE);
  if (desktopMode) {
    Object.assign(env, envForPermissionMode(desktopMode));
    return env;
  }
  if (env.VANTA_AUTO_MODE === "1" || parsePermissionMode(env.VANTA_PERMISSION_MODE) === "auto") return env;
  Object.assign(env, envForPermissionMode("acceptEdits"));
  return env;
}
