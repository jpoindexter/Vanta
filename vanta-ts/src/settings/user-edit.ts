import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { resolveVantaHome } from "../store/home.js";

export function userSettingsFile(env?: NodeJS.ProcessEnv): string {
  return join(resolveVantaHome(env), "settings.json");
}

export async function readUserSettingsRaw(env?: NodeJS.ProcessEnv): Promise<Record<string, unknown>> {
  const path = userSettingsFile(env);
  try {
    const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new Error("not an object");
    return parsed as Record<string, unknown>;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw new Error(`User settings need recovery at ${path}. Inspect the existing file and restore a valid JSON object before retrying; nothing was written.`);
  }
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
