import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  resolveExecBackend,
  buildDockerArgs,
  dockerMounts,
  wrapExec,
  DEFAULT_DOCKER_IMAGE,
  type ExecBackendAdapter,
} from "./backend.js";

describe("resolveExecBackend", () => {
  it("selects only registered backend ids and otherwise stays local", () => {
    expect(resolveExecBackend({ VANTA_EXEC_BACKEND: "docker" } as NodeJS.ProcessEnv)).toBe("docker");
    expect(resolveExecBackend({ VANTA_EXEC_BACKEND: "serverless" } as NodeJS.ProcessEnv)).toBe("serverless");
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

  it("routes a configured Modal backend through the bundled Sandbox helper", async () => {
    const r = await wrapExec(
      {
        env: {
          VANTA_EXEC_BACKEND: "serverless",
          VANTA_SERVERLESS_PROVIDER: "modal",
          VANTA_SERVERLESS_APP: "worker.py",
          VANTA_SERVERLESS_IDLE_SEC: "90",
        } as NodeJS.ProcessEnv,
        root,
        workdir: join(root, "nested"),
        baseCmd: "sh",
        baseArgs: ["-c", "echo hi"],
      },
      { serverlessCliAvailable: async () => true },
    );
    if ("error" in r) throw new Error("unexpected refuse");
    expect(r.cmd).toBe("modal");
    expect(r.args.slice(0, 3)).toEqual(["run", "-q", expect.stringMatching(/modal-sandbox\.py$/)]);
    expect(r.args[3]).toBe("--payload");
    const payload = JSON.parse(Buffer.from(r.args[4]!, "base64url").toString("utf8"));
    expect(payload).toEqual({
      root: resolve(root, "nested"),
      idleTimeoutSec: 90,
      image: "node:24-bookworm-slim",
      network: false,
      command: ["sh", "-c", "echo hi"],
    });
  });

  it("refuses instead of silently changing location when the selected remote CLI is unavailable", async () => {
    const r = await wrapExec(
      {
        env: { VANTA_EXEC_BACKEND: "serverless", VANTA_SERVERLESS_PROVIDER: "daytona" } as NodeJS.ProcessEnv,
        root,
        baseCmd: "echo",
        baseArgs: ["local"],
      },
      { serverlessCliAvailable: async () => false },
    );
    expect(r).toEqual({
      error: expect.stringMatching(/daytona CLI unavailable.*Refusing to run locally/),
    });
  });

  it("does not probe a remote CLI when its config is invalid", async () => {
    const probe = vi.fn(async () => true);
    const r = await wrapExec(
      {
        env: { VANTA_EXEC_BACKEND: "serverless", VANTA_SERVERLESS_PROVIDER: "invalid" } as NodeJS.ProcessEnv,
        root,
        baseCmd: "echo",
        baseArgs: ["fallback"],
      },
      { serverlessCliAvailable: probe },
    );
    expect(probe).not.toHaveBeenCalled();
    expect(r).toEqual({
      error: expect.stringMatching(/serverless config invalid.*Refusing to run locally/),
    });
  });

  it("lets consumers execute through a fake adapter without concrete coupling", async () => {
    const fake: ExecBackendAdapter = {
      id: "serverless",
      wrap: vi.fn(async () => ({ ok: true as const, invocation: { cmd: "fake-remote", args: ["ok"] } })),
    };
    const r = await wrapExec(
      {
        env: { VANTA_EXEC_BACKEND: "serverless" } as NodeJS.ProcessEnv,
        root,
        baseCmd: "ignored",
        baseArgs: [],
      },
      { adapters: { serverless: fake } },
    );
    expect(fake.wrap).toHaveBeenCalledOnce();
    expect(r).toEqual({ cmd: "fake-remote", args: ["ok"] });
  });

  it("mounts the project root", () => {
    expect(dockerMounts({} as NodeJS.ProcessEnv, root)).toContain(resolve(root));
  });
});
