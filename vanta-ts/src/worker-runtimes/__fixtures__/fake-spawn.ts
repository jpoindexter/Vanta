import { EventEmitter } from "node:events";
import type { ChildLike, SpawnFn } from "../../agents/external-cli.js";
import type { SpawnFactory } from "../exec-core.js";

// A fake CLI process for tests: replays recorded output lines and records how it
// was launched. `hold` keeps it running until the abort signal fires.

export type Launch = { cmd: string; args: string[]; cwd: string; env: NodeJS.ProcessEnv; stdin: string | undefined };
export type FakePlan = { stdout?: string[]; stderr?: string[]; code?: number; hold?: boolean; missing?: boolean; run?: (launch: Launch) => void | Promise<void> };

export function fakeSpawn(plan: FakePlan): { factory: SpawnFactory; launches: Launch[] } {
  const launches: Launch[] = [];
  const factory: SpawnFactory = (stdin, signal) => (cmd, args, opts): ChildLike => {
    const launch = { cmd, args, cwd: opts.cwd, env: opts.env, stdin };
    launches.push(launch);
    const out = new EventEmitter();
    const err = new EventEmitter();
    const child = new EventEmitter();
    const finish = (code: number | null, sig: NodeJS.Signals | null = null): void => { child.emit("close", code, sig); };
    setImmediate(async () => {
      if (plan.missing) { child.emit("error", Object.assign(new Error("spawn ENOENT"), { code: "ENOENT" })); return; }
      await plan.run?.(launch);
      for (const line of plan.stdout ?? []) out.emit("data", `${line}\n`);
      for (const line of plan.stderr ?? []) err.emit("data", `${line}\n`);
      if (plan.hold) {
        if (signal.aborted) finish(null, "SIGTERM"); else signal.addEventListener("abort", () => finish(null, "SIGTERM"), { once: true });
        return;
      }
      finish(plan.code ?? 0);
    });
    return {
      stdout: out as unknown as ChildLike["stdout"],
      stderr: err as unknown as ChildLike["stderr"],
      on: ((event: string, cb: never) => child.on(event, cb)) as ChildLike["on"],
      kill: () => finish(null, "SIGTERM"),
    };
  };
  return { factory, launches };
}

export const passGate = { authorize: async () => ({ ok: true as const }) };
