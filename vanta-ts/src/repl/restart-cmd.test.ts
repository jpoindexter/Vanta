import { describe, it, expect } from "vitest";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { restart, RESTART_EXIT_CODE } from "./restart-cmd.js";
import { consumeRestartHandoff } from "./restart-handoff.js";
import { loadSession } from "../sessions/store.js";
import type { ReplCtx } from "./types.js";

async function ctxWith(env: NodeJS.ProcessEnv): Promise<ReplCtx> {
  const root = await mkdtemp(join(tmpdir(), "vanta-restart-command-"));
  return {
    env: { ...env, VANTA_HOME: join(root, "home") },
    dataDir: join(root, ".vanta"),
    state: { sessionId: "session-1", started: "2026-07-29T10:00:00.000Z", turnIndex: 1 },
    convo: { messages: [{ role: "user", content: "keep this context" }] },
    now: () => new Date("2026-07-29T10:05:00.000Z"),
  } as unknown as ReplCtx;
}

describe("/restart handler", () => {
  it("signals a restart when the run.sh relaunch loop is active", async () => {
    const ctx = await ctxWith({ VANTA_RELAUNCH: "1" });
    const r = await restart("", ctx);
    expect(r.restart).toBe(true);
    expect(r.output).toContain("reloading");
    await expect(consumeRestartHandoff(ctx.dataDir, ctx.now())).resolves.toBe("session-1");
    const saved = await loadSession("session-1", ctx.env);
    expect(saved?.messages.at(-1)?.content).toBe("keep this context");
  });

  it("refuses with a hint when the relaunch loop is absent (no surprise quit)", async () => {
    const r = await restart("", await ctxWith({}));
    expect(r.restart).toBeUndefined();
    expect(r.output).toMatch(/run\.sh/);
  });

  it("uses the sysexits TEMPFAIL sentinel 75", () => {
    expect(RESTART_EXIT_CODE).toBe(75);
  });
});
