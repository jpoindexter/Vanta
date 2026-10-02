import { loadRules, saveRules } from "./store.js";

export async function grantAlways(toolName: string | undefined, env: NodeJS.ProcessEnv = process.env): Promise<void> {
  if (!toolName) return;
  await setToolPreference(toolName, "allow", env);
}

export async function grantNever(toolName: string | undefined, env: NodeJS.ProcessEnv = process.env): Promise<void> {
  if (!toolName) return;
  await setToolPreference(toolName, "deny", env);
}

/** Replace only the selected tool-wide preference; narrower rules still win. */
async function setToolPreference(tool: string, action: "allow" | "deny", env: NodeJS.ProcessEnv): Promise<void> {
  const rules = await loadRules(env);
  const retained = rules.filter((rule) => rule.tool !== tool || rule.pattern !== undefined);
  await saveRules([...retained, { action, tool }], env);
}
