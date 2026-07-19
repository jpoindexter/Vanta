import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { PROVIDER_CATALOG, providerById } from "../providers/catalog.js";
import { buildEnvUpdates, upsertEnvMigratingLegacy } from "../setup.js";
import type { DesktopState } from "./handlers.js";
import { readJson, sendJson } from "./handlers.js";
import type http from "node:http";
import type { ProviderEntry } from "../providers/catalog.js";
import { resolveProvider } from "../providers/index.js";
import type { LLMProvider } from "../providers/interface.js";
import { redactForLog } from "../store/redact-structural.js";
import { clearProviderAuthRequired } from "./provider-auth-store.js";

export type DesktopSetupConfiguration = { provider: ProviderEntry; model: string; apiKey: string };
type SetupInput = DesktopSetupConfiguration | { error: string };
type SetupValidationDeps = { resolveProvider: (env: NodeJS.ProcessEnv) => LLMProvider };
const PLACEHOLDER_KEY = /^(?:sk[-_]?secret|your[-_ ]?api[-_ ]?key|api[-_ ]?key|test|secret|placeholder|change[-_ ]?me|replace[-_ ]?me|x{3,})$/i;
const LOCAL_PROVIDERS = new Set(["ollama", "lmstudio"]);

export function desktopSetupOptions() {
  return PROVIDER_CATALOG.map((provider) => ({
    id: provider.id, label: provider.label, short: provider.short, models: provider.models,
    defaultModel: provider.defaultModel, requiresKey: !!provider.envVar,
    signupUrl: provider.signupUrl, note: provider.note,
  }));
}

export async function handleDesktopSetup(state: DesktopState, req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  if (req.method === "GET") return sendJson(res, 200, desktopSetupOptions());
  const input = setupInput(await readJson(req));
  if ("error" in input) return sendJson(res, 400, { error: input.error });
  try {
    await validateDesktopProviderSetup(input);
    await persistSetup(state, input);
    sendJson(res, 200, { ok: true, provider: input.provider.id, model: input.model });
  } catch (error) {
    sendJson(res, 400, { error: redactForLog(error instanceof Error ? error.message : String(error)) });
  }
}

function setupInput(raw: unknown): SetupInput {
  const body = raw as { provider?: unknown; model?: unknown; apiKey?: unknown };
  const provider = typeof body.provider === "string" ? providerById(body.provider) : undefined;
  if (!provider) return { error: "Choose a supported provider." };
  const model = typeof body.model === "string" && body.model.trim() ? body.model.trim() : provider.defaultModel;
  const apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
  if (provider.envVar && !apiKey && !process.env[provider.envVar]) return { error: `${provider.envVar} is required.` };
  return { provider, model, apiKey };
}

export async function validateDesktopProviderSetup(
  input: DesktopSetupConfiguration,
  env: NodeJS.ProcessEnv = process.env,
  deps: SetupValidationDeps = { resolveProvider },
): Promise<void> {
  const key = input.apiKey || (input.provider.envVar ? env[input.provider.envVar] : "") || "";
  if (input.provider.envVar && !key) throw new Error(`${input.provider.envVar} is required.`);
  if (input.provider.envVar && PLACEHOLDER_KEY.test(key.trim())) {
    throw new Error(`${input.provider.label} credential looks like a placeholder. Add a real credential and test again.`);
  }
  if (LOCAL_PROVIDERS.has(input.provider.id)) return;

  const probeEnv = { ...env, ...buildEnvUpdates(input.provider, key, input.model) };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const provider = deps.resolveProvider(probeEnv);
    await provider.complete(
      [{ role: "user", content: "Reply with OK." }],
      [],
      { maxTokens: 1, signal: controller.signal },
    );
  } catch (error) {
    const raw = error instanceof Error ? error.message : String(error);
    const detail = redactForLog(raw.replaceAll(key, "[redacted]")).split("\n")[0];
    throw new Error(`Could not verify ${input.provider.label} credentials: ${detail}`);
  } finally {
    clearTimeout(timeout);
  }
}

async function persistSetup(state: DesktopState, input: Exclude<SetupInput, { error: string }>): Promise<void> {
  const updates = buildEnvUpdates(input.provider, input.apiKey || undefined, input.model);
  const path = join(state.root, ".vanta", ".env");
  await mkdir(join(state.root, ".vanta"), { recursive: true });
  const existing = existsSync(path) ? await readFile(path, "utf8") : "";
  await writeFile(path, upsertEnvMigratingLegacy(existing, updates), { mode: 0o600 });
  Object.assign(process.env, updates);
  await clearProviderAuthRequired(state.root);
  state.setup = undefined; state.convo = undefined; state._setupError = undefined; state._providerAuthRequired = undefined;
}
