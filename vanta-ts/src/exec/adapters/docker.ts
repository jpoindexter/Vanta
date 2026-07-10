import { execFile } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { resolveWritableZones } from "../../tools/writable-zones.js";
import type { ExecBackendAdapter } from "../backend-port.js";

const run = promisify(execFile);

export const DEFAULT_DOCKER_IMAGE = "alpine:latest";

export async function dockerAvailable(): Promise<boolean> {
  try {
    await run("docker", ["version", "--format", "{{.Client.Version}}"], { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

export function dockerMounts(env: NodeJS.ProcessEnv, root: string): string[] {
  const tmp = realpathSync(tmpdir());
  const zones = resolveWritableZones(env).map((zone) => resolve(zone));
  return [...new Set([resolve(root), ...zones, tmp])].filter((path) => existsSync(path));
}

export function buildDockerArgs(opts: {
  image: string;
  mounts: string[];
  workdir: string;
  net: boolean;
  baseCmd: string;
  baseArgs: string[];
}): string[] {
  const args = ["run", "--rm"];
  for (const mount of opts.mounts) args.push("-v", `${mount}:${mount}`);
  args.push("-w", opts.workdir);
  if (!opts.net) args.push("--network", "none");
  args.push(opts.image, opts.baseCmd, ...opts.baseArgs);
  return args;
}

export function createDockerExecAdapter(
  available: () => Promise<boolean> = dockerAvailable,
): ExecBackendAdapter {
  return {
    id: "docker",
    async wrap(args) {
      if (!(await available())) return { ok: false, reason: "docker CLI unavailable" };
      const workdir = resolve(args.workdir ?? args.root);
      const mounts = [...new Set([...dockerMounts(args.env, args.root), workdir])].filter(existsSync);
      return {
        ok: true,
        invocation: {
          cmd: "docker",
          args: buildDockerArgs({
            image: args.env.VANTA_DOCKER_IMAGE || DEFAULT_DOCKER_IMAGE,
            mounts,
            workdir,
            net: args.env.VANTA_SANDBOX_NET === "1",
            baseCmd: args.baseCmd,
            baseArgs: args.baseArgs,
          }),
        },
      };
    },
  };
}
