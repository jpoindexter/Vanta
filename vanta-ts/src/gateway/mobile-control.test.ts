import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createReplyBus } from "../permissions/reply-bus.js";
import {
  finishMobileRun,
  handleMobileControlCommand,
  loadMobileRuns,
  pauseMobileRun,
  startMobileRun,
} from "./mobile-control.js";

describe("mobile control store", () => {
  it("records, lists, reads, and pauses a channel run", async () => {
    const dir = await mkdtemp(join(tmpdir(), "vanta-mobile-control-"));
    try {
      const run = await startMobileRun(dir, { chatId: "phone-1", text: "ship preview" }, new Date("2026-07-09T00:00:00.000Z"));
      await finishMobileRun(dir, run.id, "Preview shipped\nTests passed", new Date("2026-07-09T00:01:00.000Z"));
      expect((await loadMobileRuns(dir))[0]).toMatchObject({ id: run.id, status: "done", work: "Preview shipped\nTests passed" });
      expect((await handleMobileControlCommand({ dataDir: dir, msg: { chatId: "phone-1", text: "/runs" } })).reply).toContain(run.id);
      expect((await handleMobileControlCommand({ dataDir: dir, msg: { chatId: "phone-1", text: `/work ${run.id}` } })).reply).toContain("Preview shipped");
      expect(await pauseMobileRun(dir, run.id, new Date("2026-07-09T00:02:00.000Z"))).toBe(true);
      expect((await loadMobileRuns(dir))[0]?.status).toBe("paused");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("routes /approve through the pending approval reply bus", async () => {
    const dir = await mkdtemp(join(tmpdir(), "vanta-mobile-control-"));
    const bus = createReplyBus();
    try {
      bus.register("abc123");
      const ac = new AbortController();
      const stream = bus.stream(ac.signal)[Symbol.asyncIterator]();
      const result = await handleMobileControlCommand({
        dataDir: dir,
        msg: { chatId: "phone-1", text: "/approve abc123" },
        replyBus: bus,
      });
      expect(result).toEqual({ consumed: true, reply: "Approved abc123." });
      const got = await stream.next();
      ac.abort();
      expect(got.done).toBe(false);
      if (!got.done) expect(got.value).toEqual({ chatId: "phone-1", text: "yes abc123" });
    } finally {
      bus.unregister("abc123");
      await rm(dir, { recursive: true, force: true });
    }
  });
});
