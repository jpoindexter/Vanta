import { dataDirFor } from "./ops.js";
import {
  formatAmbientState,
  loadAmbientScreen,
  runAmbientScreenTick,
  saveAmbientScreen,
  setAmbientEnabled,
} from "../ambient/screen-context.js";

export async function runAmbientScreenCommand(repoRoot: string, rest: string[]): Promise<number> {
  const dataDir = dataDirFor(repoRoot);
  const sub = rest[0] ?? "status";
  if (sub === "status") {
    console.log(formatAmbientState(await loadAmbientScreen(dataDir)));
    return 0;
  }
  if (sub === "enable") return enable(dataDir, rest);
  if (sub === "disable" || sub === "kill") {
    console.log(formatAmbientState(await setAmbientEnabled(dataDir, false)));
    return 0;
  }
  if (sub === "redact") return redact(dataDir, rest.slice(1));
  if (sub === "tick") return tick(dataDir, rest.slice(1));
  console.error("usage: vanta ambient-screen [status|enable [--interval-sec N]|disable|redact <text>|tick --context <text>]");
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

async function tick(dataDir: string, rest: string[]): Promise<number> {
  const context = value(rest, "--context");
  if (!context) {
    console.error("usage: vanta ambient-screen tick --context <screen/app context>");
    return 1;
  }
  const result = await runAmbientScreenTick(dataDir, context);
  console.log(result.ran ? `ambient proposal: ${result.proposal} · ${result.lane} · ${result.reason}` : `ambient skipped: ${result.reason}`);
  return 0;
}

function value(args: string[], flag: string): string | null {
  const idx = args.indexOf(flag);
  return idx === -1 ? null : args[idx + 1] ?? null;
}
