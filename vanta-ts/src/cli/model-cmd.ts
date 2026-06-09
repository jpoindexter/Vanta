import { readFile, writeFile } from "node:fs/promises";
import { PROVIDER_CATALOG, providerById } from "../providers/catalog.js";
import { parseModelArg } from "../tui/model-switch.js";
import { upsertEnvMigratingLegacy, envPath, buildEnvUpdates } from "../setup.js";

// `vanta model` — standalone CLI provider+model selector (MODEL-CMD).
// Mirrors the `/model <arg>` REPL handler but works outside a session:
//   vanta model                    → print current provider + model
//   vanta model <provider>         → switch to that provider at its default model
//   vanta model <provider> <model> → switch to that provider + model
//   vanta model <model>            → switch the current provider to that model
// Persists the choice to vanta-ts/.env just like the REPL picker.

function listProviders(): void {
  console.log("Available providers:");
  for (const p of PROVIDER_CATALOG) {
    const note = p.note ? `  (${p.note})` : "";
    console.log(`  ${p.id.padEnd(14)} ${p.label}${note}`);
    console.log(`               default model: ${p.defaultModel}`);
  }
}

/** Show the current provider and model from env. */
function showCurrent(env: NodeJS.ProcessEnv): void {
  const provider = env.VANTA_PROVIDER ?? "(not set)";
  const model = env.VANTA_MODEL ?? "(not set)";
  const entry = providerById(provider);
  const label = entry ? entry.label : provider;
  console.log(`provider: ${provider}  (${label})`);
  console.log(`model:    ${model}`);
}

/** Run `vanta model [args…]`. */
export async function runModelCommand(repoRoot: string, rest: string[]): Promise<number> {
  if (rest[0] === "--list" || rest[0] === "list") {
    listProviders();
    return 0;
  }

  if (rest.length === 0) {
    showCurrent(process.env);
    return 0;
  }

  const arg = rest.join(" ").trim();
  const currentProvider = process.env.VANTA_PROVIDER ?? "openai";
  const sel = parseModelArg(arg, currentProvider);
  if (!sel) {
    console.error("usage: vanta model [list | <provider> [<model>] | <model>]");
    return 1;
  }

  const entry = providerById(sel.providerId);
  if (!entry) {
    console.error(`unknown provider: ${sel.providerId}`);
    console.error(`run 'vanta model list' to see available providers`);
    return 1;
  }

  const path = envPath(repoRoot);
  const existing = await readFile(path, "utf8").catch(() => "");
  const updates = buildEnvUpdates(entry, undefined, sel.model);
  await writeFile(path, upsertEnvMigratingLegacy(existing, updates), "utf8");

  console.log(`provider: ${sel.providerId}`);
  console.log(`model:    ${sel.model}`);
  console.log(`saved to ${path}`);
  return 0;
}
