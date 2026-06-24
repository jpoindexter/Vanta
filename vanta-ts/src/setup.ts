import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { createInterface, type Interface as Readline } from "node:readline/promises";
import { PROVIDER_CATALOG, type ProviderEntry } from "./providers/catalog.js";
import { select } from "./term/select.js";

// `vanta setup` — first-run wizard. Picks a provider, takes a key (if needed) and
// a model, and MERGES the result into vanta-ts/.env without disturbing any other
// keys (Google OAuth, search keys, etc.). No config file, no .env regeneration.

const KEY_LINE = /^(\s*)([A-Z0-9_]+)=/;
type SetupProbe = { ok: boolean; detail: string };
type SetupOpts = { quiet?: boolean; validate?: (updates: Record<string, string>) => Promise<SetupProbe> };

export function envPath(repoRoot: string): string {
  return join(repoRoot, "vanta-ts", ".env");
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

/** Remove uncommented lines for the given keys from a .env body. Pure. */
export function removeEnvKeys(existing: string, keys: readonly string[]): string {
  if (!keys.length || !existing) return existing;
  const drop = new Set(keys);
  return existing
    .split("\n")
    .filter((line) => {
      const m = KEY_LINE.exec(line);
      return !(m && drop.has(m[2] as string));
    })
    .join("\n");
}

/**
 * Upsert `updates` AND strip any stale legacy `ARGO_*` twin of each updated
 * `VANTA_*` key, so an explicit model write becomes the single source of truth
 * and can't be shadowed by a leftover ARGO_* config the back-compat shim mirrors
 * (the "stuck on codex" bug: `.env` still held ARGO_PROVIDER=codex). Pure.
 */
export function upsertEnvMigratingLegacy(existing: string, updates: Record<string, string>): string {
  const twins = Object.keys(updates)
    .filter((k) => k.startsWith("VANTA_"))
    .map((k) => `ARGO_${k.slice("VANTA_".length)}`);
  return upsertEnv(removeEnvKeys(existing, twins), updates);
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

const CUSTOM = "↳ enter a custom model id";

/** One-shot line prompt (cooked mode), created + closed per call so it never
 *  fights the raw-mode select(). Returns trimmed input, or `def` if empty. */
export async function askLine(question: string, def = ""): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return (await rl.question(question)).trim() || def;
  } finally {
    rl.close();
  }
}

/** One-shot hidden prompt for a secret (created + closed per call). */
export async function askSecret(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return await promptSecret(rl, question);
  } finally {
    rl.close();
  }
}

/** Provider picker (↑/↓ · Enter). Cursor starts on the current provider. Always returns an entry. */
async function chooseProviderStep(): Promise<ProviderEntry> {
  const labels = PROVIDER_CATALOG.map((p) => `${p.label}${p.note ? `  (${p.note})` : ""}`);
  const current = PROVIDER_CATALOG.findIndex((p) => p.id === process.env.VANTA_PROVIDER);
  const i = await select("Select provider:", labels, {
    initial: Math.max(0, current),
    current: current >= 0 ? current : undefined,
  });
  const entry = PROVIDER_CATALOG[i < 0 ? Math.max(0, current) : i] ?? PROVIDER_CATALOG[0]; // ESC = keep current
  if (!entry) throw new Error("provider catalog is empty"); // unreachable — non-empty const
  return entry;
}

/** Model picker (↑↓ · Enter · Esc = back). Returns the model id, or "" for back. */
async function chooseModelStep(entry: ProviderEntry): Promise<string> {
  // A router reaches every model it proxies, so don't pin a list — free-type any id.
  if (entry.router) {
    const eg = entry.models[0] ?? entry.defaultModel;
    return askLine(`  ${entry.short} routes to many models — enter any model id (e.g. ${eg}) [${entry.defaultModel}]: `, entry.defaultModel);
  }
  const opts = [...entry.models, CUSTOM];
  const cur = entry.models.indexOf(process.env.VANTA_MODEL ?? "");
  const i = await select(`Select model for ${entry.short}:`, opts, {
    canBack: true,
    initial: cur >= 0 ? cur : Math.max(0, entry.models.indexOf(entry.defaultModel)),
    current: cur >= 0 ? cur : undefined,
  });
  if (i < 0) return "";
  if (i === opts.length - 1) return askLine(`  Custom model id [${entry.defaultModel}]: `, entry.defaultModel);
  return entry.models[i] ?? entry.defaultModel;
}

/** Merge `updates` into vanta-ts/.env (0600), preserving everything else. */
export async function setEnv(repoRoot: string, updates: Record<string, string>): Promise<void> {
  const path = envPath(repoRoot);
  const existing = existsSync(path) ? await readFile(path, "utf8") : "";
  await writeFile(path, upsertEnvMigratingLegacy(existing, updates), { mode: 0o600 });
}

async function writeProvider(o: {
  repoRoot: string; entry: ProviderEntry; apiKey?: string; model: string; opts?: SetupOpts;
}): Promise<boolean> {
  const updates = buildEnvUpdates(o.entry, o.apiKey, o.model);
  const probe = o.opts?.validate ? await o.opts.validate(updates) : { ok: true, detail: "not checked" };
  if (!probe.ok) {
    console.log(`\n  ✗ ${o.entry.label} validation failed: ${probe.detail}`);
    return false;
  }
  await setEnv(o.repoRoot, updates);
  console.log(`\n  ✓ Wrote ${o.entry.label} · ${o.model} to ${envPath(o.repoRoot)}`);
  if (!o.opts?.quiet) console.log("  Run `vanta` to start, or `vanta doctor` to check health.\n");
  return true;
}

/**
 * Interactive model wizard with arrow-key menus (↑/↓ · Enter · Esc = back):
 * provider → key (if needed) → model. Returns true when a config is written.
 */
export async function runSetup(repoRoot: string, opts: SetupOpts = {}): Promise<boolean> {
  if (!opts.quiet) console.log("\n  Vanta setup — pick a model backend.\n");
  let entry = await chooseProviderStep();
  let apiKey: string | undefined;
  for (;;) {
    if (entry.envVar) {
      console.log(`\n  Get a key: ${entry.signupUrl ?? "(provider console)"}`);
      apiKey = await askSecret(`  Paste your ${entry.envVar} (hidden · empty = back to providers): `);
      if (!apiKey) { entry = await chooseProviderStep(); continue; }
    }
    const model = await chooseModelStep(entry);
    if (model) return writeProvider({ repoRoot, entry, apiKey, model, opts });
    if (!entry.envVar) entry = await chooseProviderStep(); // keyless: model-back re-picks provider
  }
}
