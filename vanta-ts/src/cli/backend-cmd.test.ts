import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runBackendCommand } from "./backend-cmd.js";
import { buildRemoteProofScript, manifestFixture } from "../exec/backend-proof.js";

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })));

function workspace(): string {
  const root = mkdtempSync(join(tmpdir(), "vanta-backend-cmd-"));
  roots.push(root);
  mkdirSync(join(root, "vanta-ts"));
  writeFileSync(join(root, "vanta-ts", "package.json"), '{"name":"vanta"}\n');
  return root;
}

const remoteEnv = {
  VANTA_EXEC_BACKEND: "serverless",
  VANTA_SERVERLESS_PROVIDER: "modal",
} as NodeJS.ProcessEnv;

describe("backend command", () => {
  it("reports the configured provider readiness", async () => {
    const lines: string[] = [];
    const code = await runBackendCommand(workspace(), ["status"], remoteEnv, {
      log: (line) => lines.push(line),
      readiness: async () => ({ ok: true }),
    });
    expect(code).toBe(0);
    expect(lines).toEqual(["execution backend: serverless/modal ready"]);
  });

  it("runs a nonce-bound proof only after the kernel allows it", async () => {
    const root = workspace();
    const manifest = manifestFixture(root)!;
    const assess = vi.fn(async () => ({ risk: "allow" as const, needsHuman: false, reason: "safe read" }));
    const run = vi.fn(async () => ({
      stdout: `VANTA_REMOTE_PROOF ${JSON.stringify({ nonce: "n-1", platform: "linux", arch: "x64", cwd: "/workspace", manifestSha256: manifest.sha256 })}\n`,
      stderr: "",
    }));
    const code = await runBackendCommand(root, ["verify"], remoteEnv, {
      nonce: () => "n-1",
      assess,
      wrap: async (args) => ({ cmd: "modal", args: [buildRemoteProofScript("n-1", manifest.relativePath), ...args.baseArgs.slice(2)] }),
      run,
      log: vi.fn(),
    });
    expect(code).toBe(0);
    expect(assess).toHaveBeenCalledOnce();
    expect(run).toHaveBeenCalledOnce();
  });

  it("fails closed before spawning when remote auth is unavailable", async () => {
    const run = vi.fn();
    const code = await runBackendCommand(workspace(), ["verify"], remoteEnv, {
      assess: async () => ({ risk: "allow", needsHuman: false, reason: "safe read" }),
      wrap: async () => ({ error: "remote execution backend unavailable: Modal is not authenticated" }),
      run,
      log: vi.fn(),
    });
    expect(code).toBe(1);
    expect(run).not.toHaveBeenCalled();
  });

  it("does not construct a remote invocation when the kernel does not allow it", async () => {
    const wrap = vi.fn();
    const code = await runBackendCommand(workspace(), ["verify"], remoteEnv, {
      assess: async () => ({ risk: "ask", needsHuman: true, reason: "review remote execution" }),
      wrap,
      log: vi.fn(),
    });
    expect(code).toBe(1);
    expect(wrap).not.toHaveBeenCalled();
  });

  it("does not assess or run when serverless was not explicitly selected", async () => {
    const assess = vi.fn();
    const run = vi.fn();
    expect(await runBackendCommand(workspace(), ["verify"], {}, { assess, run, log: vi.fn() })).toBe(1);
    expect(assess).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
  });
});
