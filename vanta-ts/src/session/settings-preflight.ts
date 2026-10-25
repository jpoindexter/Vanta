import { resolveIsolation, skipSettings } from "../cli/isolation.js";

/** Validate authoritative policy before startup effects, without applying env. */
export async function validateSettingsBeforeEffects(
  root: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  if (skipSettings(resolveIsolation(env))) return;
  const { loadSettings } = await import("../settings/store.js");
  await loadSettings(root, env);
}
