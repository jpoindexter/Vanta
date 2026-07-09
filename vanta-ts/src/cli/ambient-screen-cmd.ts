import { dataDirFor } from "./ops.js";
import { collectActiveContext, type ActiveContext } from "../ambient/active-context.js";
import {
  formatAmbientState,
  loadAmbientScreen,
  runAmbientScreenTick,
  saveAmbientScreen,
  setAmbientEnabled,
} from "../ambient/screen-context.js";
import { screenToTask } from "../repl/screen-to-task.js";

export type AmbientScreenCommandDeps = {
  collectActiveContext?: () => Promise<ActiveContext>;
};

export async function runAmbientScreenCommand(
  repoRoot: string,
  rest: string[],
  deps: AmbientScreenCommandDeps = {},
): Promise<number> {
  const dataDir = dataDirFor(repoRoot);
  const sub = rest[0] ?? "status";
  if (sub === "status") {
    console.log(formatAmbientState(await loadAmbientScreen(dataDir)));
    return 0;
  }
  if (sub === "look") return look(repoRoot, deps);
  if (sub === "enable") return enable(dataDir, rest);
  if (sub === "disable" || sub === "kill") {
    console.log(formatAmbientState(await setAmbientEnabled(dataDir, false)));
    return 0;
  }
  if (sub === "redact") return redact(dataDir, rest.slice(1));
  if (sub === "tick") return tick(repoRoot, dataDir, rest.slice(1), deps);
  console.error("usage: vanta ambient-screen [status|look|enable [--interval-sec N]|disable|redact <text>|tick [--context <text>]]");
  return 1;
}

async function redact(dataDir: string, rest: string[]): Promise<number> {
  const pattern = rest.join(" ").trim();
  if (!pattern) {
    console.error("usage: vanta ambient-screen redact <text>");
    return 1;
  }
  const state = await loadAmbientScreen(dataDir);
  const next = { ...state, redact: [...new Set([...state.redact, pattern])] };
  await saveAmbientScreen(dataDir, next);
  console.log(`ambient-screen redacts ${next.redact.length} pattern(s)`);
  return 0;
}

async function enable(dataDir: string, rest: string[]): Promise<number> {
  const interval = value(rest, "--interval-sec");
  console.log(formatAmbientState(await setAmbientEnabled(dataDir, true, interval ? Number(interval) : undefined)));
  return 0;
}

async function look(repoRoot: string, deps: AmbientScreenCommandDeps): Promise<number> {
  const active = await activeContext(repoRoot, deps);
  const task = screenToTask(active.context);
  console.log(formatActiveLook(active, task.title, task.confidence, task.why));
  return 0;
}

async function tick(
  repoRoot: string,
  dataDir: string,
  rest: string[],
  deps: AmbientScreenCommandDeps,
): Promise<number> {
  const context = value(rest, "--context") ?? (await activeContext(repoRoot, deps)).context;
  const result = await runAmbientScreenTick(dataDir, context);
  console.log(result.ran ? `ambient proposal: ${result.proposal} · ${result.lane} · ${result.reason}` : `ambient skipped: ${result.reason}`);
  return 0;
}

async function activeContext(repoRoot: string, deps: AmbientScreenCommandDeps): Promise<ActiveContext> {
  return deps.collectActiveContext?.() ?? collectActiveContext({ cwd: () => repoRoot });
}

function formatActiveLook(active: ActiveContext, title: string, confidence: string, why: string): string {
  const app = active.app ?? "unknown";
  const window = active.window ?? "unknown";
  const fallback = active.source === "cwd-only" ? `  capture: cwd-only (${active.error ?? "no active window"})` : "";
  return [
    `ambient look: ${app} · ${window}`,
    `  repo: ${active.cwd}`,
    `  next: ${title} · ${confidence} · ${why}`,
    fallback.trimEnd(),
  ].filter(Boolean).join("\n");
}

function value(args: string[], flag: string): string | null {
  const idx = args.indexOf(flag);
  return idx === -1 ? null : args[idx + 1] ?? null;
}
