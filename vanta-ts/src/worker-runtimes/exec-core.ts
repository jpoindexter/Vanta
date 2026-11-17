import { spawn as nodeSpawn } from "node:child_process";
import { runExternalAgent, type ChildLike, type Invocation, type SpawnFn } from "../agents/external-cli.js";
import type { EffectGateContext } from "../effects/execute-effect.js";
import { KILL_GRACE_MS } from "./constants.js";

// Launches an external agent CLI through the existing runExternalAgent (scrubbed
// child env, kernel effect gate, line-streamed output). This module adds only
// what that function lacks for ticket workers: the prompt on stdin (so it never
// appears in argv or `ps`) and an AbortSignal that kills the whole process group.

export type ExecParams = {
  inv: Invocation;
  stdin?: string;
  cwd: string;
  env: NodeJS.ProcessEnv;
  signal: AbortSignal;
  timeoutMs: number;
  onLine: (line: string) => void;
  effectGate?: EffectGateContext;
  /** Test seam: builds the spawn function from the stdin payload and the abort signal. */
  spawnFactory?: SpawnFactory;
};

export type SpawnFactory = (stdin: string | undefined, signal: AbortSignal) => SpawnFn;

export type ExecOutcome = {
  ok: boolean;
  code: number | null;
  stderr: string;
  notInstalled: boolean;
  aborted: boolean;
  /** The effect gate refused or denied the launch; nothing ran. */
  gateRefused: boolean;
};

function killGroup(pid: number | undefined, signal: NodeJS.Signals): void {
  if (pid === undefined) return;
  try { process.kill(-pid, signal); } catch { /* group already gone */ }
}

/** Real spawn: prompt on stdin, own process group, group kill on abort. */
export function spawnWithStdin(stdin: string | undefined, signal: AbortSignal): SpawnFn {
  return (cmd, args, opts): ChildLike => {
    const child = nodeSpawn(cmd, args, { cwd: opts.cwd, env: opts.env, detached: true, stdio: [stdin === undefined ? "ignore" : "pipe", "pipe", "pipe"] });
    if (stdin !== undefined) {
      child.stdin?.on("error", () => { /* the CLI exited before reading its prompt */ });
      child.stdin?.end(stdin);
    }
    const stop = (): void => {
      killGroup(child.pid, "SIGTERM");
      setTimeout(() => killGroup(child.pid, "SIGKILL"), KILL_GRACE_MS).unref();
    };
    if (signal.aborted) stop(); else signal.addEventListener("abort", stop, { once: true });
    child.on("close", () => signal.removeEventListener("abort", stop));
    return {
      stdout: child.stdout,
      stderr: child.stderr,
      on: ((event: string, cb: never) => child.on(event, cb)) as ChildLike["on"],
      kill: (sig) => killGroup(child.pid, sig ?? "SIGTERM"),
    };
  };
}

const GATE_MARKER = "external agent effect ";

export async function execCli(params: ExecParams): Promise<ExecOutcome> {
  const result = await runExternalAgent(params.inv, {
    cwd: params.cwd,
    env: params.env,
    spawn: (params.spawnFactory ?? spawnWithStdin)(params.stdin, params.signal),
    onChunk: params.onLine,
    timeoutMs: params.timeoutMs,
    effectGate: params.effectGate,
  });
  return {
    ok: result.ok,
    code: result.code,
    stderr: result.stderr,
    notInstalled: result.notInstalled === true,
    aborted: params.signal.aborted,
    gateRefused: result.stderr.startsWith(GATE_MARKER),
  };
}
