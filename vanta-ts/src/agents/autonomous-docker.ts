import type { Invocation } from "./external-cli.js";

// VANTA-A2A-DOCKER-AUTONOMOUS — run an agent FULLY autonomously (`--dangerously-skip-permissions`)
// inside a Docker container scoped to exactly the folders Vanta mounts. The container is the safety
// boundary that replaces the macOS-seatbelt approach (which couldn't even run the agent): a mount
// can't be talked past the way a keyword denylist can, so the agent runs normally but can only touch
// what's mounted. Pure here — builds the `docker run` argv; runtime/launch lives in the caller.

export type Mount = { host: string; container: string; mode: "ro" | "rw" };

export type AutonomousDockerOpts = {
  /** Container image (must have the agent CLI + a runtime). Defaults to a plain Node image. */
  image?: string;
  /** The blast radius. rw = where the agent may write (its output dir); ro = inputs it may read. */
  mounts: Mount[];
  /** Container working directory — must be one of the mounts. */
  workdir: string;
  /** Egress. Off by default (`--network none`); only opened when a task genuinely needs it. */
  network?: boolean;
  /** Env var NAMES to forward into the container (`-e NAME`). The VALUE comes from the parent process
   *  env at run time, so a credential never appears in the docker argv / `ps` / logs. */
  passEnv?: string[];
};

const DEFAULT_IMAGE = "node:22-slim";

/**
 * Wrap a base agent `Invocation` to run inside a Docker container pinned to `mounts`. The returned
 * invocation is `docker run --rm -i <-v host:container:mode ...> -w <workdir> [--network none]
 * <image> <base.cmd> <base.args...>`. Refuses an empty mount-set — an unscoped container has no
 * boundary, which is the whole point.
 */
export function buildAutonomousDockerInvocation(base: Invocation, opts: AutonomousDockerOpts): Invocation {
  if (!opts.mounts.length) {
    throw new Error("autonomous container needs at least one mount — the mount-set is the boundary");
  }
  const mountArgs = opts.mounts.flatMap((m) => ["-v", `${m.host}:${m.container}:${m.mode}`]);
  const envArgs = (opts.passEnv ?? []).flatMap((name) => ["-e", name]); // name-only → value from parent env
  const net = opts.network ? [] : ["--network", "none"];
  return {
    cmd: "docker",
    args: [
      "run", "--rm", "-i",
      ...mountArgs,
      ...envArgs,
      "-w", opts.workdir,
      ...net,
      opts.image ?? DEFAULT_IMAGE,
      base.cmd, ...base.args,
    ],
  };
}
