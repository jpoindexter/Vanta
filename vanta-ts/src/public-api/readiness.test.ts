import { afterEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { collectRuntimeReadiness } from "./readiness.js";
import { writeGatewayReadiness } from "../gateway/readiness-state.js";
import type { SessionMap } from "../desktop/session-state.js";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

describe("runtime readiness", () => {
  it("degrades on corrupt stores, low disk, and a down channel without leaking stored data", async () => {
    const base = await mkdtemp(join(tmpdir(), "vanta-readiness-")); roots.push(base);
    const root = join(base, "project"), home = join(base, "home"), dataDir = join(root, ".vanta");
    await mkdir(join(home, "sessions"), { recursive: true });
    await mkdir(join(dataDir, "bg-tasks"), { recursive: true });
    await writeFile(join(home, "sessions", "corrupt.json"), "{broken", "utf8");
    await writeFile(join(dataDir, "bg-tasks", "running.json"), JSON.stringify({ status: "running", command: "SECRET_COMMAND" }), "utf8");
    await writeFile(join(dataDir, "bg-tasks", "done.json"), JSON.stringify({ status: "done", command: "SECRET_COMMAND" }), "utf8");
    await writeFile(join(dataDir, "agent-sessions.json"), JSON.stringify([{ backendName: "SECRET_BACKEND" }, { backendName: "OTHER" }]), "utf8");
    await writeFile(join(dataDir, "async-delegate.jsonl"), `${JSON.stringify({ id: "1", output: "SECRET_OUTPUT" })}\n{broken\n`, "utf8");
    await writeGatewayReadiness(dataDir, [{ id: "telegram", status: "down", failures: 1, lastError: "SECRET_ERROR" }], new Date(10_000));
    const sessions: SessionMap = new Map([
      ["active", { root, _chatActive: true }],
      ["idle", { root, _chatActive: false }],
    ]);

    const result = await collectRuntimeReadiness(root, home, sessions, {
      env: { VANTA_PROVIDER: "openai", OPENAI_API_KEY: "SECRET_KEY", VANTA_TELEGRAM_TOKEN: "SECRET_TOKEN" },
      now: () => 20_000,
      kernelStatus: async () => true,
      diskStat: async () => ({ bavail: 1, blocks: 100, bsize: 4096 }),
    });

    expect(result.status).toBe("degraded");
    expect(result.checks).toMatchObject({
      kernel: { status: "ok" }, provider: { status: "ok", configured: 1 },
      stores: { status: "degraded", checked: 6, corrupt: 2 },
      disk: { status: "degraded", freePercent: 1 },
      gateway: { status: "degraded", configured: 1, up: 0, down: 1, stale: 0 },
      activity: { activeTurns: 1, backgroundRunning: 1, backgroundCompleted: 1, delegatedWorkers: 2, delegationCompletions: 1 },
    });
    const serialized = JSON.stringify(result);
    for (const secret of [base, "SECRET_KEY", "SECRET_TOKEN", "SECRET_COMMAND", "SECRET_BACKEND", "SECRET_OUTPUT", "SECRET_ERROR", "telegram", "openai"]) {
      expect(serialized).not.toContain(secret);
    }
  });

  it("treats a configured channel without a fresh gateway observation as degraded", async () => {
    const base = await mkdtemp(join(tmpdir(), "vanta-readiness-stale-")); roots.push(base);
    const result = await collectRuntimeReadiness(join(base, "project"), join(base, "home"), new Map(), {
      env: { VANTA_PROVIDER: "codex", VANTA_NTFY_TOPIC: "configured" },
      kernelStatus: async () => true,
      diskStat: async () => ({ bavail: 90, blocks: 100, bsize: 1024 ** 3 }),
    });
    expect(result.status).toBe("degraded");
    expect(result.checks.gateway).toMatchObject({ status: "unknown", configured: 1, stale: 0 });
  });
});
