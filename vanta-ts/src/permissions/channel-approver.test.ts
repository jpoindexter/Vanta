import { describe, it, expect } from "vitest";
import { createReplyBus } from "./reply-bus.js";
import { buildChannelApprover, resolveApproverChats, approvalTimeoutMs } from "./channel-approver.js";

// CHANNEL-PERMISSIONS-WIRE — an approval prompt reaches the configured channel;
// an allowlisted "yes/no <id>" reply resolves it, raced against the local
// resolver (first wins); strangers can't approve; the poll pump breaks the
// blocked-gateway-loop deadlock and loses no bypassed message.

const APPROVER = "9001";

function idFrom(sent: string[]): string {
  const m = /\[([a-z0-9-]+)\]/i.exec(sent[0] ?? "");
  if (!m) throw new Error(`no request id in prompt: ${sent[0]}`);
  return m[1]!;
}

describe("config", () => {
  it("parses VANTA_APPROVER_CHATS and the timeout", () => {
    expect(resolveApproverChats({ VANTA_APPROVER_CHATS: "123, 456" })).toEqual(["123", "456"]);
    expect(resolveApproverChats({})).toEqual([]);
    expect(approvalTimeoutMs({})).toBe(120_000);
    expect(approvalTimeoutMs({ VANTA_CHANNEL_APPROVAL_TIMEOUT_SEC: "5" })).toBe(5_000);
  });
});

describe("channel approval race (injected gateway stream)", () => {
  it("an allowlisted yes resolves allow; the prompt carried the request id", async () => {
    const bus = createReplyBus();
    const sent: string[] = [];
    const approve = buildChannelApprover({
      send: async (t) => void sent.push(t),
      bus,
      allowlist: [APPROVER],
      timeoutMs: 5_000,
    });
    const pending = approve("push to origin", "irreversible publish", "shell_cmd");
    await new Promise((r) => setTimeout(r, 10)); // prompt sent, relay listening
    expect(bus.tryConsume({ chatId: APPROVER, text: `yes ${idFrom(sent)}` })).toBe(true);
    await expect(pending).resolves.toBe(true);
  });

  it("an allowlisted no denies; a stranger's yes is ignored (never approves)", async () => {
    const bus = createReplyBus();
    const sent: string[] = [];
    const approve = buildChannelApprover({
      send: async (t) => void sent.push(t),
      bus,
      allowlist: [APPROVER],
      timeoutMs: 300, // stranger case falls through to timer-deny
    });
    const pending = approve("rm -rf tmp", "destructive", "shell_cmd");
    await new Promise((r) => setTimeout(r, 10));
    const id = idFrom(sent);
    bus.tryConsume({ chatId: "6666", text: `yes ${id}` }); // stranger — consumed but ignored
    bus.tryConsume({ chatId: APPROVER, text: `no ${id}` });
    await expect(pending).resolves.toBe(false);
  });

  it("no reply → the local timer denies at the timeout (headless default)", async () => {
    const bus = createReplyBus();
    const approve = buildChannelApprover({
      send: async () => {},
      bus,
      allowlist: [APPROVER],
      timeoutMs: 50,
    });
    await expect(approve("brew install x", "system change", "shell_cmd")).resolves.toBe(false);
  });

  it("a normal message is NOT consumed and no request id means pass-through", async () => {
    const bus = createReplyBus();
    expect(bus.tryConsume({ chatId: APPROVER, text: "hello vanta, status?" })).toBe(false);
  });
});

describe("gateway loop integration (pollPlatformSession)", () => {
  it("consumes an approval reply before it becomes an agent turn; drains parked messages", async () => {
    const { pollPlatformSession } = await import("../gateway/run-session.js");
    const { initialState } = await import("../gateway/session-manager.js");
    const bus = createReplyBus();
    bus.register("abc123");
    bus.stashBypassed({ chatId: "777", text: "parked instruction", id: "p1" });
    const handled: string[] = [];
    const deps = {
      dataDir: "/tmp/unused",
      run: async () => ({ finalText: "" }),
      platform: {
        id: "fake",
        connect: async () => {},
        disconnect: async () => {},
        send: async () => {},
        poll: async () => [{ chatId: "9001", text: "yes abc123", id: "m1" }],
      },
      handle: async (text: string) => {
        handled.push(text);
        return "ok";
      },
      replyBus: bus,
      log: () => {},
    };
    // Subscribe BEFORE the poll (as a live relay does), so the consumed reply
    // lands in this stream's buffer.
    const ac = new AbortController();
    const stream = bus.stream(ac.signal)[Symbol.asyncIterator]();
    const r = await pollPlatformSession(deps, initialState());
    // The parked instruction ran as a turn; the approval reply did NOT.
    expect(handled).toHaveLength(1);
    expect(handled[0]).toContain("parked instruction");
    expect(r.count).toBe(1);
    const got = await stream.next();
    ac.abort();
    expect(got.done).toBe(false);
    if (!got.done) expect(got.value.text).toBe("yes abc123");
  });
});

describe("the poll pump (blocked-loop deadlock breaker)", () => {
  it("pumps the reply in while the loop is blocked; parks bypassed messages for the main loop", async () => {
    const bus = createReplyBus();
    const sent: string[] = [];
    let polls = 0;
    const approve = buildChannelApprover({
      send: async (t) => void sent.push(t),
      bus,
      allowlist: [APPROVER],
      timeoutMs: 5_000,
      pollIntervalMs: 10,
      poll: async () => {
        polls += 1;
        if (polls === 1) return [{ chatId: "777", text: "unrelated instruction" }];
        if (polls === 2) return [{ chatId: APPROVER, text: `approve ${idFrom(sent)}` }];
        return [];
      },
    });
    await expect(approve("deploy", "publish", "shell_cmd")).resolves.toBe(true);
    // The unrelated message the pump polled is parked, not lost.
    const parked = bus.drainBypassed() as Array<{ text: string }>;
    expect(parked.map((m) => m.text)).toEqual(["unrelated instruction"]);
    expect(bus.drainBypassed()).toEqual([]); // drain empties
  });
});
