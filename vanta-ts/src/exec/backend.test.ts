import { afterEach, beforeEach, describe, it, expect } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { resolveExecBackend, buildDockerArgs, dockerMounts, wrapExec, DEFAULT_DOCKER_IMAGE } from "./backend.js";

describe("resolveExecBackend", () => {
  it("selects docker only when VANTA_EXEC_BACKEND=docker", () => {
    expect(resolveExecBackend({ VANTA_EXEC_BACKEND: "docker" } as NodeJS.ProcessEnv)).toBe("docker");
    expect(resolveExecBackend({} as NodeJS.ProcessEnv)).toBe("local");
    expect(resolveExecBackend({ VANTA_EXEC_BACKEND: "sandbox" } as NodeJS.ProcessEnv)).toBe("local");
  });
});

describe("buildDockerArgs", () => {
  it("mounts each path, sets workdir, isolates the network, then the command", () => {
    expect(buildDockerArgs({ image: "alpine", mounts: ["/repo", "/tmp"], workdir: "/repo", net: false, baseCmd: "sh", baseArgs: ["-c", "ls"] }))
      .toEqual(["run", "--rm", "-v", "/repo:/repo", "-v", "/tmp:/tmp", "-w", "/repo", "--network", "none", "alpine", "sh", "-c", "ls"]);
  });
  it("omits --network when network is allowed", () => {
    expect(buildDockerArgs({ image: "alpine", mounts: [], workdir: "/r", net: true, baseCmd: "sh", baseArgs: [] })).not.toContain("--network");
  });
});

describe("wrapExec", () => {
  let root: string;
  beforeEach(async () => { root = await mkdtemp(join(tmpdir(), "vanta-exec-")); });
  afterEach(async () => { await rm(root, { recursive: true, force: true }); });

  it("containerises the command when docker is selected and available", async () => {
    const r = await wrapExec(
      { env: { VANTA_EXEC_BACKEND: "docker" } as NodeJS.ProcessEnv, root, baseCmd: "sh", baseArgs: ["-c", "echo hi"] },
      { dockerAvailable: async () => true },
    );
    expect("error" in r).toBe(false);
    if ("error" in r) return;
    expect(r.cmd).toBe("docker");
    expect(r.args.slice(0, 2)).toEqual(["run", "--rm"]);
    expect(r.args).toContain("-v");
    expect(r.args).toContain(`${resolve(root)}:${resolve(root)}`);
    expect(r.args).toContain(DEFAULT_DOCKER_IMAGE);
    expect(r.args.slice(-3)).toEqual(["sh", "-c", "echo hi"]);
  });

  it("falls back to local when docker is selected but absent", async () => {
    const r = await wrapExec(
      { env: { VANTA_EXEC_BACKEND: "docker" } as NodeJS.ProcessEnv, root, baseCmd: "sh", baseArgs: ["-c", "echo hi"] },
      { dockerAvailable: async () => false },
    );
    if ("error" in r) throw new Error("unexpected refuse");
    expect(r.cmd).toBe("sh");
    expect(r.args).toEqual(["-c", "echo hi"]);
  });

  it("is byte-identical to the base command when no backend is selected", async () => {
    const r = await wrapExec({ env: {} as NodeJS.ProcessEnv, root, baseCmd: "sh", baseArgs: ["-c", "x"] });
    if ("error" in r) throw new Error("unexpected refuse");
    expect(r).toEqual({ cmd: "sh", args: ["-c", "x"] });
  });

  it("mounts the project root", () => {
    expect(dockerMounts({} as NodeJS.ProcessEnv, root)).toContain(resolve(root));
  });
});
