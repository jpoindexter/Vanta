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
  await deps.status(args);
  deps.log(await deps.context(repoRoot, resultLimit(args)));
  deps.log(
    "\nNext: `vanta skill context-doctor` for semantic conflicts and a reviewed cleanup diff.",
  );
  return 0;
}
