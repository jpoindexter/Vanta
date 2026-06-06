import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { createInterface, type Interface as Readline } from "node:readline/promises";
import { PROVIDER_CATALOG, type ProviderEntry } from "./providers/catalog.js";

// `vanta setup` — first-run wizard. Picks a provider, takes a key (if needed) and
// a model, and MERGES the result into argo-ts/.env without disturbing any other
// keys (Google OAuth, search keys, etc.). No config file, no .env regeneration.

const KEY_LINE = /^(\s*)([A-Z0-9_]+)=/;

export function envPath(repoRoot: string): string {
  return join(repoRoot, "argo-ts", ".env");
}

/**
 * Merge `updates` into an existing `.env` text. Replaces the value of each key
 * that already appears uncommented; appends keys that don't. Every other
 * line — comments, blank lines, unrelated keys — is preserved verbatim, so a
 * re-run can never delete the user's other secrets. Pure.
 */
export function upsertEnv(existing: string, updates: Record<string, string>): string {
  const pending = new Map(Object.entries(updates));
  const lines = existing.length ? existing.split("\n") : [];

  const out = lines.map((line) => {
    const m = KEY_LINE.exec(line);
    if (m && pending.has(m[2] as string)) {
      const key = m[2] as string;
      const value = pending.get(key) as string;
      pending.delete(key);
      return `${key}=${value}`;
    }
    return line;
  });

  if (pending.size > 0) {
    if (out.length > 0 && (out[out.length - 1] ?? "").trim() !== "") out.push("");
    for (const [key, value] of pending) out.push(`${key}=${value}`);
  }

  const text = out.join("\n");
  return text.endsWith("\n") ? text : `${text}\n`;
}

/** Build the env keys a chosen provider implies. Pure. */
export function buildEnvUpdates(
  entry: ProviderEntry,
  apiKey: string | undefined,
  model: string,
): Record<string, string> {
  const updates: Record<string, string> = {
    VANTA_PROVIDER: entry.id,
    VANTA_MODEL: model,
  };
  if (entry.envVar && apiKey) updates[entry.envVar] = apiKey;
  return updates;
}

/** Read a secret without echoing it to the terminal. Falls back to plain prompt. */
export async function promptSecret(rl: Readline, query: string): Promise<string> {
  // readline's Interface writes echoed input via _writeToOutput; muting it while
  // the answer is typed hides the key. Typed-cast with a comment per house rules.
  const muted = rl as unknown as { _writeToOutput?: (s: string) => void };
  const original = muted._writeToOutput?.bind(rl);
  let hide = false;
  muted._writeToOutput = (s: string) => {
    if (!hide || s.includes("\n")) original?.(s);
  };
  hide = true;
  try {
    return (await rl.question(query)).trim();
  } finally {
    hide = false;
    if (original) muted._writeToOutput = original;
  }
}

function renderProviderMenu(): string {
  return PROVIDER_CATALOG.map((p, i) => {
    const tail = p.note ? `  (${p.note})` : "";
    return `  ${i + 1}. ${p.label}${tail}`;
  }).join("\n");
}

/**
 * Run the interactive wizard. Returns true if a config was written. `rl` is
 * injectable for testing; a real TTY interface is created when omitted.
 */
export async function runSetup(
  repoRoot: string,
  rl?: Readline,
): Promise<boolean> {
  const ownRl = rl ?? createInterface({ input: process.stdin, output: process.stdout });
  try {
    console.log("\n  Vanta setup — pick a model backend.\n");
    console.log(renderProviderMenu());

    const pick = (await ownRl.question(`\n  Provider [1-${PROVIDER_CATALOG.length}]: `)).trim();
    const idx = Number.parseInt(pick, 10) - 1;
    const entry = PROVIDER_CATALOG[idx];
    if (!entry) {
      console.log("  No valid provider chosen. Nothing written.");
      return false;
    }

    let apiKey: string | undefined;
    if (entry.envVar) {
      if (entry.signupUrl) console.log(`\n  Get a key: ${entry.signupUrl}`);
      apiKey = await promptSecret(ownRl, `  Paste your ${entry.envVar} (hidden): `);
      if (!apiKey) {
        console.log("  No key entered. Nothing written.");
        return false;
      }
    }

    const model =
      (await ownRl.question(`  Model [${entry.defaultModel}]: `)).trim() ||
      entry.defaultModel;

    const path = envPath(repoRoot);
    const existing = existsSync(path) ? await readFile(path, "utf8") : "";
    const merged = upsertEnv(existing, buildEnvUpdates(entry, apiKey, model));
    await writeFile(path, merged, { mode: 0o600 });

    console.log(`\n  ✓ Wrote ${entry.label} · ${model} to ${path}`);
    console.log("  Run `vanta` to start, or `vanta doctor` to check health.\n");
    return true;
  } finally {
    if (!rl) ownRl.close();
  }
}
