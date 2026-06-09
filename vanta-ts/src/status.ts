import { readdir } from "node:fs/promises";
import { SafetyClient } from "./safety-client.js";
import { resolveProvider } from "./providers/index.js";
import { PROVIDER_CATALOG } from "./providers/catalog.js";
import { resolveVantaHome, memoriesDir } from "./store/home.js";
import { listSkills } from "./skills/store.js";
import { readVelocityEvents, velocityStats, type VelocityStats } from "./velocity/store.js";

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
};

const mark = (ok: boolean): string => (ok ? "✓" : "✗");

/** Render a report to a boxed terminal block. Pure. */
export function formatStatus(r: StatusReport): string {
  const lines: string[] = ["", "  ⚕ Vanta Status", ""];

  lines.push(`  ${mark(r.kernel.up)} kernel    ${r.kernel.up ? "up" : "down"}  (${r.kernel.url})`);

  if (r.provider.ok) {
    lines.push(
      `  ${mark(true)} provider  ${r.provider.id} · ${r.provider.model} · ${r.provider.contextWindow?.toLocaleString()} ctx`,
    );
  } else {
    lines.push(`  ${mark(false)} provider  ${r.provider.id} — ${r.provider.error}`);
  }

  lines.push("", "  API keys:");
  for (const k of r.keys) {
    lines.push(`    ${mark(k.present)} ${k.envVar}  (${k.label})`);
  }

  lines.push("", `  store     ${r.store.home}`);
  lines.push(`            ${r.store.skills} skill(s) · ${r.store.memories} memory file(s)`);

  if ("error" in r.goals) {
    lines.push(`  goals     — ${r.goals.error}`);
  } else {
    lines.push(`  goals     ${r.goals.active} active / ${r.goals.total} total`);
  }

  if (r.velocity && (r.velocity.captures > 0 || r.velocity.ships > 0)) {
    const v = r.velocity;
    const ratioStr = v.ratio === null ? "∞:1" : `${v.ratio.toFixed(0)}:1`;
    const note = v.warn ? "  ⚠ consider closing before opening" : "";
    lines.push(`  velocity  capture:ship 7d  ${v.captures}:${v.ships} (${ratioStr})${note}`);
  }

  lines.push("");
  return lines.join("\n");
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
  const client = new SafetyClient(url);
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
    goals = { error: "kernel down" };
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
  };
}

export async function runStatus(env: NodeJS.ProcessEnv = process.env): Promise<void> {
  console.log(formatStatus(await gatherStatus(env)));
}
