import { readFile, writeFile } from "node:fs/promises";
import { resolveProvider } from "../providers/index.js";
import { providerById } from "../providers/catalog.js";
import { upsertEnv, envPath, buildEnvUpdates } from "../setup.js";
import type { LLMProvider } from "../providers/interface.js";
import type { ModelSelection } from "./model-picker.js";

// Applies a /model picker selection. Reuses resolveProvider (so all the backend
// construction + key validation lives in one place) by handing it a merged env,
// and reuses the setup wizard's upsertEnv for the global-persist case so the
// two writers can never diverge. No console output (would corrupt Ink).

/** The env the selection implies, layered over the current process env. */
export function mergedEnv(sel: ModelSelection, env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const entry = providerById(sel.providerId);
  const merged: NodeJS.ProcessEnv = { ...env, ARGO_PROVIDER: sel.providerId, ARGO_MODEL: sel.model };
  if (entry?.envVar && sel.apiKey) merged[entry.envVar] = sel.apiKey;
  return merged;
}

/** Build the live provider for a selection. Throws (actionably) on a missing key. */
export function buildProviderForSelection(sel: ModelSelection, env: NodeJS.ProcessEnv): LLMProvider {
  return resolveProvider(mergedEnv(sel, env));
}

/** Write the selection to argo-ts/.env, preserving every other line. */
export async function persistSelectionGlobal(
  sel: ModelSelection,
  repoRoot: string,
): Promise<void> {
  const entry = providerById(sel.providerId);
  if (!entry) return;
  const path = envPath(repoRoot);
  const existing = await readFile(path, "utf8").catch(() => "");
  await writeFile(path, upsertEnv(existing, buildEnvUpdates(entry, sel.apiKey, sel.model)), "utf8");
}
