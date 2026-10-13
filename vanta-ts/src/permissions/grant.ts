import { canonicalRoot } from "./rules.js";
import { loadRules, saveRules } from "./store.js";

/** Serializes read-modify-write so two concurrent choices cannot drop each other's rule. */
let queue: Promise<unknown> = Promise.resolve();

/** `root` limits the saved rule to one project; omit for a rule that applies everywhere. */
export async function grantAlways(toolName: string | undefined, env: NodeJS.ProcessEnv = process.env, root?: string): Promise<void> {
  if (!toolName) return;
  await setToolPreference(toolName, "allow", env, root);
}

export async function grantNever(toolName: string | undefined, env: NodeJS.ProcessEnv = process.env, root?: string): Promise<void> {
  if (!toolName) return;
  await setToolPreference(toolName, "deny", env, root);
}

/** Replace only the selected tool-wide preference in this scope; narrower rules and other projects keep theirs. */
function setToolPreference(tool: string, action: "allow" | "deny", env: NodeJS.ProcessEnv, root?: string): Promise<void> {
  const run = async (): Promise<void> => {
    const scope = root ? canonicalRoot(root) : undefined;
    const rules = await loadRules(env);
    const retained = rules.filter((rule) => rule.tool !== tool || rule.pattern !== undefined || rule.root !== scope);
    await saveRules([...retained, { action, tool, ...(scope ? { root: scope } : {}) }], env);
  };
  const result = queue.then(run, run);
  queue = result.catch(() => undefined);
  return result;
}
