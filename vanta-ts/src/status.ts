import { readdir } from "node:fs/promises";
import { createKernelClient } from "./kernel/client.js";
import { resolveProvider } from "./providers/index.js";
import { PROVIDER_CATALOG, providerById } from "./providers/catalog.js";
import { resolveVantaHome, memoriesDir } from "./store/home.js";
import { listSkills } from "./skills/store.js";
import { readVelocityEvents, velocityStats, type VelocityStats } from "./velocity/store.js";
import { detectAuthConflicts } from "./providers/auth-conflict.js";
import { modelDeprecationNotices } from "./providers/model-deprecation.js";
import { validateConfigFiles } from "./config/validate.js";

// `vanta status` / `vanta doctor` — read-only health. Pings the kernel (never
// spawns it — a status check that starts the thing it's checking is useless),
// resolves the provider in a try/catch, and reports key PRESENCE only (never the
// value).

export type StatusReport = {
  kernel: { url: string; up: boolean };
  provider: { id: string; ok: boolean; model?: string; contextWindow?: number; error?: string };
  keys: { envVar: string; label: string; present: boolean }[];
  store: { home: string; skills: number; memories: number };
  goals: { active: number; total: number } | { error: string };
  velocity?: VelocityStats;
  notices: string[];
};

const mark = (ok: boolean): string => (ok ? "✓" : "✗");

/** The velocity line, or nothing if there's no capture/ship activity yet. */
function velocityLines(v: VelocityStats): string[] {
  if (!(v.captures > 0 || v.ships > 0)) return [];
  const ratioStr = v.ratio === null ? "∞:1" : `${v.ratio.toFixed(0)}:1`;
  const note = v.warn ? "  ⚠ consider closing before opening" : "";
  return [`  velocity  capture:ship 7d  ${v.captures}:${v.ships} (${ratioStr})${note}`];
}

/** Kernel line — neutral idle before first use (it auto-starts on first run), not a red failure. */
function kernelLine(r: StatusReport): string {
  return r.kernel.up
    ? `  ${mark(true)} kernel    up  (${r.kernel.url})`
    : `  ○ kernel    idle — starts on first run  (${r.kernel.url})`;
}

/** Active-provider line (or its resolution error). */
function providerLine(r: StatusReport): string {
  return r.provider.ok
    ? `  ${mark(true)} provider  ${r.provider.id} · ${r.provider.model} · ${r.provider.contextWindow?.toLocaleString()} ctx`
    : `  ${mark(false)} provider  ${r.provider.id} — ${r.provider.error}`;
}

/** API-key section: the full matrix when expanded; only the ACTIVE provider's key
 *  when condensed (the per-provider matrix is the firehose a configured user hit). */
function keysSection(r: StatusReport, condensed: boolean): string[] {
  if (!condensed) {
    return ["", "  API keys:", ...r.keys.map((k) => `    ${mark(k.present)} ${k.envVar}  (${k.label})`)];
  }
  const envVar = providerById(r.provider.id)?.envVar;
  if (!envVar) return ["", `  API key   ${r.provider.id} — local, none needed`];
  const k = r.keys.find((x) => x.envVar === envVar);
  return ["", `  API key   ${mark(Boolean(k?.present))} ${envVar}`];
}

function storeLines(r: StatusReport): string[] {
  return ["", `  store     ${r.store.home}`, `            ${r.store.skills} skill(s) · ${r.store.memories} memory file(s)`];
}

function goalsLine(r: StatusReport): string {
  return "error" in r.goals ? `  goals     — ${r.goals.error}` : `  goals     ${r.goals.active} active / ${r.goals.total} total`;
}

function noticesSection(r: StatusReport): string[] {
  return r.notices.length ? ["", "  ⚠ notices:", ...r.notices.map((n) => `    • ${n}`)] : [];
}

/**
 * Render a report to a terminal block. `condensed` drops the full per-provider key
 * matrix + velocity (the firehose a configured user complained about) and keeps the
 * essentials; the default (and `--verbose`) restore the full dump. Pure.
 */
export function formatStatus(r: StatusReport, opts: { condensed?: boolean } = {}): string {
  const condensed = opts.condensed ?? false;
  const lines: string[] = ["", "  ⚕ Vanta Status", "", kernelLine(r), providerLine(r)];
  lines.push(...keysSection(r, condensed), ...storeLines(r), goalsLine(r));
  if (!condensed && r.velocity) lines.push(...velocityLines(r.velocity));
  lines.push(...noticesSection(r));
  if (condensed) lines.push("", "  · condensed — `vanta status --verbose` for the full report");
  lines.push("");
  return lines.join("\n");
}

/**
 * Is the active config the out-of-box default — the provider running its catalog
 * DEFAULT model? A user who picked a specific non-default model is "non-default"
 * and gets the condensed report. Unknown provider → treated as non-default. Pure.
 */
export function isDefaultConfig(env: NodeJS.ProcessEnv): boolean {
  const entry = providerById(env.VANTA_PROVIDER ?? "openai");
  if (!entry) return false;
  return (env.VANTA_MODEL ?? entry.defaultModel) === entry.defaultModel;
}

/**
 * Decide status verbosity: `--verbose` always full; a non-TTY (scripted/piped) run
 * is condensed; otherwise condensed only when the config is non-default. Pure.
 */
export function resolveStatusCondensed(env: NodeJS.ProcessEnv, opts: { verbose: boolean; isTTY: boolean }): boolean {
  if (opts.verbose) return false;
  if (!opts.isTTY) return true;
  return !isDefaultConfig(env);
}

async function countMemories(env: NodeJS.ProcessEnv): Promise<number> {
  try {
    const entries = await readdir(memoriesDir(env));
    return entries.filter((e) => e.endsWith(".md")).length;
  } catch {
    return 0;
  }
}

/** Resolve the active provider into a status entry. Failure degrades to a flag, never throws. */
function resolveProviderStatus(env: NodeJS.ProcessEnv): StatusReport["provider"] {
  const id = env.VANTA_PROVIDER ?? "openai";
  try {
    const p = resolveProvider(env);
    return { id, ok: true, model: p.modelId(), contextWindow: p.contextWindow() };
  } catch (err: unknown) {
    return { id, ok: false, error: err instanceof Error ? err.message.split(".")[0] : String(err) };
  }
}

/** Gather the live health report. Best-effort: any probe failure degrades to a flag, never throws. */
export async function gatherStatus(env: NodeJS.ProcessEnv): Promise<StatusReport> {
  const url = env.VANTA_KERNEL_URL ?? "http://127.0.0.1:7788";
  const client = createKernelClient(url);
  const up = await client.status();

  const provider = resolveProviderStatus(env);

  const keys = PROVIDER_CATALOG.filter((p) => p.envVar).map((p) => ({
    envVar: p.envVar as string,
    label: p.label,
    present: Boolean(env[p.envVar as string]),
  }));

  const skills = await listSkills(env).then((s) => s.length).catch(() => 0);
  const memories = await countMemories(env);

  let goals: StatusReport["goals"];
  if (up) {
    try {
      const all = await client.getGoals();
      goals = { active: all.filter((g) => g.status === "active").length, total: all.length };
    } catch {
      goals = { error: "kernel up but goals unavailable" };
    }
  } else {
    goals = { error: "kernel idle (starts on first run)" };
  }

  const velEvents = await readVelocityEvents(env).catch(() => []);
  const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
  const velocity = velocityStats(velEvents, SEVEN_DAYS_MS, new Date());

  return {
    kernel: { url, up },
    provider,
    keys,
    store: { home: resolveVantaHome(env), skills, memories },
    goals,
    velocity,
    notices: [
      ...detectAuthConflicts(env),
      ...modelDeprecationNotices(env, new Date()),
      ...(await validateConfigFiles(env)),
    ],
  };
}

export async function runStatus(
  env: NodeJS.ProcessEnv = process.env,
  argv: string[] = [],
  isTTY: boolean = Boolean(process.stdout.isTTY),
): Promise<void> {
  const verbose = argv.includes("--verbose") || argv.includes("-v") || env.VANTA_STATUS_VERBOSE === "1";
  const condensed = resolveStatusCondensed(env, { verbose, isTTY });
  console.log(formatStatus(await gatherStatus(env), { condensed }));
}
