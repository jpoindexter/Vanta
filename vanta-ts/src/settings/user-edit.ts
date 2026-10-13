import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { resolveVantaHome } from "../store/home.js";

export function userSettingsFile(env?: NodeJS.ProcessEnv): string {
  return join(resolveVantaHome(env), "settings.json");
}

export async function readUserSettingsRaw(env?: NodeJS.ProcessEnv): Promise<Record<string, unknown>> {
  try {
    const parsed: unknown = JSON.parse(await readFile(userSettingsFile(env), "utf8"));
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch { return {}; }
}

/**
 * Read-modify-write of the user settings.json object. Keys the caller does not touch (including
 * ones the schema does not know) are written back unchanged.
 */
export async function updateUserSettings(
  mutate: (current: Record<string, unknown>) => Record<string, unknown>,
  env?: NodeJS.ProcessEnv,
): Promise<void> {
  const path = userSettingsFile(env);
  const next = mutate(await readUserSettingsRaw(env));
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(next, null, 2)}\n`, "utf8");
}
