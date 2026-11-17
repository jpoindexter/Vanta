import { runStatus } from "../status.js";
import { contextDoctorReport } from "./harness-thickness-cmd.js";

type DoctorDeps = {
  status: (args: string[]) => Promise<void>;
  context: (repoRoot: string, limit: number) => Promise<string>;
  log: (text: string) => void;
};

const defaultDeps: DoctorDeps = {
  status: (args) => runStatus(process.env, args),
  context: contextDoctorReport,
  log: console.log,
};

function resultLimit(args: string[]): number {
  const index = args.indexOf("--limit");
  const parsed = Number(index === -1 ? undefined : args[index + 1]);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 5;
}

/** Full Vanta doctor: runtime health plus a read-only context-engineering audit. */
export async function runDoctorCommand(
  repoRoot: string,
  args: string[] = [],
  deps: DoctorDeps = defaultDeps,
): Promise<number> {
  if (args.includes("--fallbacks")) {
    const { inspectFallbackReadiness } = await import("../providers/fallback-readiness.js");
    const entries = inspectFallbackReadiness(process.env);
    deps.log("Fallback configuration (static only; no connections or credential-store lookups)");
    if (!entries.length) deps.log("No fallback entries configured; primary route unchanged. Set VANTA_FALLBACK_PROVIDERS to configure an ordered list.");
    for (const entry of entries) deps.log(`${entry.index}. ${entry.provider}: ${entry.status} — ${entry.detail}`);
    return entries.some(entry => entry.status !== "configuration-resolved") ? 1 : 0;
  }
  await deps.status(args);
  deps.log(await deps.context(repoRoot, resultLimit(args)));
  deps.log(
    "\nNext: `vanta skill context-doctor` for semantic conflicts and a reviewed cleanup diff.",
  );
  return 0;
}
