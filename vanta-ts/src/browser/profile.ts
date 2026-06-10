import { existsSync } from "node:fs";
import { join } from "node:path";
import { resolveVantaHome } from "../store/home.js";

/**
 * AUTH-BROWSER — the persistent Playwright profile dir. Lives inside the Vanta
 * home store (mirrors skillsDir/memoriesDir), NOT the real browser's profile, so
 * authenticated sessions never touch the user's own cookies. Override with
 * VANTA_BROWSER_PROFILE. Default: ~/.vanta/browser-profile.
 */
export function browserProfileDir(env: NodeJS.ProcessEnv = process.env): string {
  const override = env.VANTA_BROWSER_PROFILE?.trim();
  return override ? override : join(resolveVantaHome(env), "browser-profile");
}

/**
 * Whether browser tools should launch a PERSISTENT context (reusing saved
 * cookies/logins) instead of an ephemeral one. True when explicitly enabled
 * (VANTA_BROWSER_PROFILE_ENABLED=1) OR the profile dir already exists — so once
 * you run `vanta browser auth <site>` and create the profile, later headless
 * tool calls automatically reuse the logged-in session. Pure: `exists` is
 * injectable for testing.
 */
export function usesPersistentProfile(
  env: NodeJS.ProcessEnv = process.env,
  exists: (path: string) => boolean = existsSync,
): boolean {
  if (env.VANTA_BROWSER_PROFILE_ENABLED === "1") return true;
  return exists(browserProfileDir(env));
}
