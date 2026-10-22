import { execFile } from "node:child_process";
import { existsSync } from "node:fs";

export const NEXT_APP_PATH = "/Applications/Vanta.app";

export type DesktopLaunchChoice =
  | { target: "next-app"; appPath: string }
  | { target: "classic"; args: string[] };

/**
 * Bare `vanta desktop` opens the installed app. Any argument (port, --companion, --no-open),
 * --classic, VANTA_DESKTOP_CLASSIC=1 or a missing app keeps the browser server, so scripts
 * and the companion behave as before.
 */
export function chooseDesktopLaunch(
  rest: string[],
  env: NodeJS.ProcessEnv,
  appExists: (path: string) => boolean = existsSync,
): DesktopLaunchChoice {
  const appPath = env.VANTA_NEXT_APP_PATH?.trim() || NEXT_APP_PATH;
  const args = rest.filter((arg) => arg !== "--classic");
  const forcedClassic = rest.includes("--classic") || env.VANTA_DESKTOP_CLASSIC === "1";
  if (forcedClassic || args.length > 0 || !appExists(appPath)) return { target: "classic", args };
  return { target: "next-app", appPath };
}

/** Opens the app with macOS `open`. Resolves false when it could not be opened. */
export function openNextApp(appPath: string): Promise<boolean> {
  return new Promise((resolve) => {
    execFile("open", [appPath], (error) => resolve(!error));
  });
}
