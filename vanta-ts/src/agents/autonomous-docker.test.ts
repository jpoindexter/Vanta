import { describe, it, expect } from "vitest";
import { buildAutonomousDockerInvocation, type Mount } from "./autonomous-docker.js";

// VANTA-A2A-DOCKER-AUTONOMOUS — the mount-set IS the boundary. These prove the argv we hand Docker
// pins the container to exactly the declared mounts (rw output, ro inputs) with network off by default.
describe("buildAutonomousDockerInvocation — mount-set is the OS-enforced boundary", () => {
  const mounts: Mount[] = [
    { host: "/tmp/out", container: "/work", mode: "rw" },
    { host: "/repo", container: "/ro/0", mode: "ro" },
  ];

  it("wraps a base invocation in `docker run` scoped to exactly the mounts, network off", () => {
    const inv = buildAutonomousDockerInvocation(
      { cmd: "claude", args: ["-p", "build it", "--dangerously-skip-permissions"] },
      { image: "node:22-slim", mounts, workdir: "/work" },
    );
    expect(inv.cmd).toBe("docker");
    expect(inv.args).toEqual([
      "run", "--rm", "-i",
      "-v", "/tmp/out:/work:rw",
      "-v", "/repo:/ro/0:ro",
      "-w", "/work",
      "--network", "none",
      "node:22-slim",
      "claude", "-p", "build it", "--dangerously-skip-permissions",
    ]);
  });

  it("opens network only when explicitly enabled (default is no egress)", () => {
    const inv = buildAutonomousDockerInvocation(
      { cmd: "sh", args: ["-c", "echo hi"] },
      { mounts: [{ host: "/tmp/o", container: "/work", mode: "rw" }], workdir: "/work", network: true },
    );
    expect(inv.args).not.toContain("none");
    expect(inv.args).toContain("/tmp/o:/work:rw");
    expect(inv.args.slice(-3)).toEqual(["sh", "-c", "echo hi"]);
  });

  it("refuses to build with no mounts — an unscoped container has no boundary", () => {
    expect(() => buildAutonomousDockerInvocation({ cmd: "sh", args: [] }, { mounts: [], workdir: "/work" }))
      .toThrow(/mount/i);
  });
});
