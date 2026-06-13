import { readFile, writeFile } from "node:fs/promises";
import { resolveProvider } from "../providers/index.js";
import { providerById } from "../providers/catalog.js";
import { upsertEnvMigratingLegacy, envPath, buildEnvUpdates } from "../setup.js";
import type { LLMProvider } from "../providers/interface.js";

/** A resolved /model picker choice — provider + model, optional key, persist scope. */
export type ModelSelection = {
  providerId: string;
  model: string;
  apiKey?: string;
  persistGlobal: boolean;
};

// Applies a /model picker selection. Reuses resolveProvider (so all the backend
// construction + key validation lives in one place) by handing it a merged env,
// and reuses the setup wizard's upsertEnv for the global-persist case so the
// two writers can never diverge. No console output (would corrupt Ink).

/**
 * Parse a `/model <arg>` argument into a selection (the readline + TUI text path,
 * the analogue of the visual picker). Forms:
 *   "<provider> <model…>"  → that provider at that model
 *   "<provider>"           → that provider at its default model
 *   "<model…>"             → the current provider at that model
 * The first whitespace token is treated as a provider only when it matches a
 * catalog id (so "gpt-4o-mini" stays a model, "gemini" becomes a provider).
 * `persistGlobal` is true — a typed switch should stick next launch, like the
 * picker's default. Returns null for an empty arg. Pure.
 */
export function parseModelArg(arg: string, currentProviderId: string): ModelSelection | null {
  const trimmed = arg.trim();
  if (!trimmed) return null;
  const tokens = trimmed.split(/\s+/);
  const head = providerById((tokens[0] ?? "").toLowerCase());
  if (head) {
    const model = tokens.slice(1).join(" ").trim() || head.defaultModel;
    return { providerId: head.id, model, persistGlobal: true };
  }
  return { providerId: currentProviderId, model: trimmed, persistGlobal: true };
}

/** The env the selection implies, layered over the current process env. */
export function mergedEnv(sel: ModelSelection, env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const entry = providerById(sel.providerId);
  const merged: NodeJS.ProcessEnv = { ...env, VANTA_PROVIDER: sel.providerId, VANTA_MODEL: sel.model };
  if (entry?.envVar && sel.apiKey) merged[entry.envVar] = sel.apiKey;
  return merged;
}

/** Build the live provider for a selection. Throws (actionably) on a missing key. */
export function buildProviderForSelection(sel: ModelSelection, env: NodeJS.ProcessEnv): LLMProvider {
  return resolveProvider(mergedEnv(sel, env));
}

/** Write the selection to vanta-ts/.env, preserving every other line. */
export async function persistSelectionGlobal(
  sel: ModelSelection,
  repoRoot: string,
): Promise<void> {
  const entry = providerById(sel.providerId);
  if (!entry) return;
  const path = envPath(repoRoot);
  const existing = await readFile(path, "utf8").catch(() => "");
  await writeFile(path, upsertEnvMigratingLegacy(existing, buildEnvUpdates(entry, sel.apiKey, sel.model)), "utf8");
}
