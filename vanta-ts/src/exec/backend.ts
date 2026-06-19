import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { resolveWritableZones } from "../tools/writable-zones.js";
import { maybeSandbox, type MaybeSandboxArgs, type MaybeSandboxResult } from "../sandbox/run.js";

// Execution backend: where shell_cmd / run_code actually run. This composes the
// run-anywhere backends over the existing sandbox seam — local (default),
// VANTA_SANDBOX (OS sandbox), and docker (containerised). The docker adapter
// wraps the base command in `docker run --rm`, mounting only the project root +
// writable zones + tmp, so writes outside that set never reach the host. The
// kernel assess() gate still runs upstream (the backend only changes WHERE a
// command runs, never WHETHER it is allowed). Docker absent → clean local fallback.

const run = promisify(execFile);

export const DEFAULT_DOCKER_IMAGE = "alpine:latest";

export type ExecBackend = "docker" | "local";

export type ExecDeps = { dockerAvailable?: () => Promise<boolean> };

/** Which backend the env selects. Sandbox is layered by maybeSandbox, not here. */
export function resolveExecBackend(env: NodeJS.ProcessEnv): ExecBackend {
  return env.VANTA_EXEC_BACKEND === "docker" ? "docker" : "local";
}

/** True when the `docker` CLI is present (client version needs no daemon). */
export async function dockerAvailable(): Promise<boolean> {
  try {
    await run("docker", ["version", "--format", "{{.Client.Version}}"], { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

/** Host paths the container may write through: project root + writable zones + tmp. */
export function dockerMounts(env: NodeJS.ProcessEnv, root: string): string[] {
  const tmp = realpathSync(tmpdir());
  const zones = resolveWritableZones(env).map((z) => resolve(z));
  return [...new Set([resolve(root), ...zones, tmp])].filter((p) => existsSync(p));
}

/** Build `docker run` argv. Pure. `--rm` ⇒ container FS is ephemeral; only the
 *  mounted paths persist to the host, so out-of-container writes are refused. */
export function buildDockerArgs(opts: {
  image: string;
  mounts: string[];
  workdir: string;
  net: boolean;
  baseCmd: string;
  baseArgs: string[];
}): string[] {
  const args = ["run", "--rm"];
  for (const m of opts.mounts) args.push("-v", `${m}:${m}`);
  args.push("-w", opts.workdir);
  if (!opts.net) args.push("--network", "none");
  args.push(opts.image, opts.baseCmd, ...opts.baseArgs);
  return args;
}

/**
 * Wrap a base command for the selected execution backend. docker → containerised
 * (falls back to local when the docker CLI is absent); otherwise defers to
 * maybeSandbox (OS sandbox when VANTA_SANDBOX=1, else the base unchanged). The
 * default (no VANTA_EXEC_BACKEND) path is byte-identical to calling maybeSandbox.
 */
export async function wrapExec(a: MaybeSandboxArgs, deps: ExecDeps = {}): Promise<MaybeSandboxResult> {
  if (resolveExecBackend(a.env) === "docker" && (await (deps.dockerAvailable ?? dockerAvailable)())) {
    return {
      cmd: "docker",
      args: buildDockerArgs({
        image: a.env.VANTA_DOCKER_IMAGE || DEFAULT_DOCKER_IMAGE,
        mounts: dockerMounts(a.env, a.root),
        workdir: resolve(a.root),
        net: a.env.VANTA_SANDBOX_NET === "1",
        baseCmd: a.baseCmd,
        baseArgs: a.baseArgs,
      }),
    };
  }
  return maybeSandbox(a);
}
