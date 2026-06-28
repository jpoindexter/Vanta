import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// Universal-use readiness for the autonomous Docker box. A fresh machine may not have Docker running
// or the agent image built — so before running a boxed agent we probe for both and return an
// ACTIONABLE setup hint instead of letting `docker run` fail cryptically. The probe is injected so
// the logic is unit-tested without Docker.

export type ExecProbe = (cmd: string, args: string[]) => { ok: boolean; stdout: string };
export type Preflight = { ready: boolean; reason?: string; hint?: string };

export const AUTONOMOUS_IMAGE_DEFAULT = "vanta-agent";

/** Real probe: run a command, capture stdout; `ok:false` if it can't run (e.g. Docker absent/down). */
export const defaultExecProbe: ExecProbe = (cmd, args) => {
  try {
    return { ok: true, stdout: execFileSync(cmd, args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 8000 }) };
  } catch {
    return { ok: false, stdout: "" };
  }
};

/** Is the autonomous box runnable on this machine? Checks Docker is up and `image` is built. */
export function autonomousPreflight(image: string, probe: ExecProbe = defaultExecProbe): Preflight {
  const docker = probe("docker", ["version", "--format", "{{.Server.Version}}"]);
  if (!docker.ok) {
    return { ready: false, reason: "Docker isn't available or running", hint: "Install Docker Desktop (or the Docker engine) and start it, then retry." };
  }
  const img = probe("docker", ["images", "-q", image]);
  if (!img.stdout.trim()) {
    return { ready: false, reason: `the "${image}" container image isn't built`, hint: `Build it once: vanta agent-image build (creates ${image} with the agent CLI).` };
  }
  return { ready: true };
}

/** Path to the bundled agent Dockerfile (vanta-ts/docker/agent.Dockerfile). */
export function agentDockerfilePath(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "..", "..", "docker", "agent.Dockerfile");
}

/** `docker build` argv that builds the boxed-agent image from the bundled Dockerfile. Pure. */
export function agentImageBuildArgs(image: string, dockerfile: string): string[] {
  return ["build", "-t", image, "-f", dockerfile, dirname(dockerfile)];
}

/** Build the image (real `docker build`, streamed to the parent's stdio). */
export function buildAgentImage(image = AUTONOMOUS_IMAGE_DEFAULT): { ok: boolean } {
  try {
    execFileSync("docker", agentImageBuildArgs(image, agentDockerfilePath()), { stdio: "inherit", timeout: 600_000 });
    return { ok: true };
  } catch {
    return { ok: false };
  }
}
