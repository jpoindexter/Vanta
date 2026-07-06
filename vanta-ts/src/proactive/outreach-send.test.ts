import { describe, it, expect } from "vitest";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sendOutreach, type OutreachDeps } from "./outreach-send.js";
import { outreachPath, saveOutreachState } from "./outreach-store.js";
import { newOutreachState, recordOutreach } from "./outreach.js";
import type { PlatformAdapter, OutboundMessage } from "../gateway/platforms/base.js";

const NOW = new Date("2026-07-06T12:00:00.000Z");
const ENV = { VANTA_OUTREACH: "1", VANTA_OUTREACH_TO: "telegram:123" };

function fakeAdapter(log: string[], opts: { failSend?: boolean } = {}): PlatformAdapter {
  return {
    id: "telegram",
    connect: async () => void log.push("connect"),
    disconnect: async () => void log.push("disconnect"),
    send: async (msg: OutboundMessage) => {
      if (opts.failSend) throw new Error("boom");
      log.push(`send ${msg.chatId}: ${msg.text}`);
    },
    poll: async () => [],
  };
}

function deps(log: string[], opts: { failSend?: boolean; budget?: boolean; buildError?: string } = {}): OutreachDeps {
  return {
    buildAdapter: (platform, _env) =>
      opts.buildError ? { ok: false, error: opts.buildError } : (log.push(`build ${platform}`), fakeAdapter(log, opts)),
    budgetExceeded: async () => opts.budget ?? false,
  };
}

async function tmpDataDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "vanta-outreach-"));
}

describe("sendOutreach", () => {
  it("sends through the adapter and records the send", async () => {
    const dataDir = await tmpDataDir();
    const log: string[] = [];
    const res = await sendOutreach({ dataDir, env: ENV, now: NOW, text: "ping", deps: deps(log) });
    expect(res).toEqual({ sent: true, reason: "ok" });
    expect(log).toEqual(["build telegram", "connect", "send 123: ping", "disconnect"]);
    const persisted = JSON.parse(await readFile(outreachPath(dataDir), "utf8"));
    expect(persisted.lastSentAt).toBe(NOW.toISOString());
    expect(persisted.sentToday).toBe(1);
  });

  it("skips without touching the adapter when the throttle refuses", async () => {
    const dataDir = await tmpDataDir();
    await saveOutreachState(dataDir, recordOutreach(newOutreachState(), new Date(NOW.getTime() - 60_000)));
    const log: string[] = [];
    const res = await sendOutreach({ dataDir, env: ENV, now: NOW, text: "ping", deps: deps(log) });
    expect(res.sent).toBe(false);
    expect(res.reason).toContain("cadence");
    expect(log).toEqual([]);
  });

  it("skips when disabled (opt-in) and when the budget is exhausted", async () => {
    const dataDir = await tmpDataDir();
    const log: string[] = [];
    const off = await sendOutreach({ dataDir, env: {}, now: NOW, text: "x", deps: deps(log) });
    expect(off.sent).toBe(false);
    expect(off.reason).toContain("disabled");
    const broke = await sendOutreach({ dataDir, env: ENV, now: NOW, text: "x", deps: deps(log, { budget: true }) });
    expect(broke.sent).toBe(false);
    expect(broke.reason).toContain("budget");
    expect(log).toEqual([]);
  });

  it("reports an unconfigured adapter as a reason, not a throw", async () => {
    const dataDir = await tmpDataDir();
    const res = await sendOutreach({
      dataDir,
      env: ENV,
      now: NOW,
      text: "x",
      deps: deps([], { buildError: 'Messaging platform "telegram" is not configured (missing required env).' }),
    });
    expect(res.sent).toBe(false);
    expect(res.reason).toContain("not configured");
  });

  it("a failed send reports the error, still disconnects, and does NOT count against the throttle", async () => {
    const dataDir = await tmpDataDir();
    const log: string[] = [];
    const res = await sendOutreach({ dataDir, env: ENV, now: NOW, text: "x", deps: deps(log, { failSend: true }) });
    expect(res.sent).toBe(false);
    expect(res.reason).toContain("boom");
    expect(log).toContain("disconnect");
    // No send recorded → an immediate retry is still allowed by the throttle.
    const retry = await sendOutreach({ dataDir, env: ENV, now: NOW, text: "x", deps: deps([]) });
    expect(retry.sent).toBe(true);
  });
});
