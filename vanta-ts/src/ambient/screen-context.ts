import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { decideAutonomy, loadAutonomyContract, logAutonomyDecision } from "../autonomy/contract.js";
import { applyTrustGate, loadTrustLedger, loadTrustPolicy } from "../autonomy/trust.js";
import { screenToTask } from "../repl/screen-to-task.js";
import { redactForLog } from "../store/redact-structural.js";

export const AmbientScreenStateSchema = z.object({
  enabled: z.boolean().default(false),
  intervalSec: z.number().int().positive().default(300),
  redact: z.array(z.string()).default([]),
  lastAt: z.string().optional(),
  lastContext: z.string().optional(),
});
export type AmbientScreenState = z.infer<typeof AmbientScreenStateSchema>;
export type AmbientTick = { ran: boolean; reason: string; proposal?: string; lane?: string };

export function ambientScreenPath(dataDir: string): string {
  return join(dataDir, "ambient-screen.json");
}

export async function loadAmbientScreen(dataDir: string): Promise<AmbientScreenState> {
  try {
    const parsed = AmbientScreenStateSchema.safeParse(JSON.parse(await readFile(ambientScreenPath(dataDir), "utf8")));
    return parsed.success ? parsed.data : { enabled: false, intervalSec: 300, redact: [] };
  } catch {
    return { enabled: false, intervalSec: 300, redact: [] };
  }
}

export async function saveAmbientScreen(dataDir: string, state: AmbientScreenState): Promise<string> {
  await mkdir(dataDir, { recursive: true });
  const file = ambientScreenPath(dataDir);
  await writeFile(file, `${JSON.stringify(AmbientScreenStateSchema.parse(state), null, 2)}\n`, "utf8");
  return file;
}

export async function setAmbientEnabled(dataDir: string, enabled: boolean, intervalSec?: number): Promise<AmbientScreenState> {
  const state = await loadAmbientScreen(dataDir);
  const next = { ...state, enabled, intervalSec: intervalSec ?? state.intervalSec };
  await saveAmbientScreen(dataDir, next);
  return next;
}

export async function runAmbientScreenTick(
  dataDir: string,
  context: string,
  now: Date = new Date(),
): Promise<AmbientTick> {
  const state = await loadAmbientScreen(dataDir);
  if (!state.enabled) return { ran: false, reason: "ambient screen disabled" };
  if (!context.trim()) return { ran: false, reason: "no ambient context source" };
  if (state.lastAt && now.getTime() - new Date(state.lastAt).getTime() < state.intervalSec * 1000) {
    return { ran: false, reason: "ambient screen throttled" };
  }
  const safe = redactCustom(redactForLog(context), state.redact);
  const task = screenToTask(safe);
  const decision = applyTrustGate(
    decideAutonomy(await loadAutonomyContract(dataDir), {
      kind: "ambient.screen.propose",
      risk: "medium",
      summary: task.title,
      source: "ambient-screen",
    }),
    await loadTrustLedger(dataDir),
    await loadTrustPolicy(dataDir),
  );
  await logAutonomyDecision(dataDir, decision);
  await saveAmbientScreen(dataDir, { ...state, lastAt: now.toISOString(), lastContext: safe.slice(0, 1000) });
  return { ran: true, reason: task.why, proposal: task.title, lane: decision.lane };
}

export function formatAmbientState(state: AmbientScreenState): string {
  return `ambient-screen: ${state.enabled ? "enabled" : "disabled"} · interval=${state.intervalSec}s${state.lastAt ? ` · last=${state.lastAt}` : ""}`;
}

function redactCustom(text: string, patterns: string[]): string {
  return patterns.reduce((out, pattern) => out.split(pattern).join("[redacted]"), text);
}
