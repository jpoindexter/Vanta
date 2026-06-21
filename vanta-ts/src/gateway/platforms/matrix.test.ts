import { describe, it, expect } from "vitest";
import {
  parseMatrixEvents,
  buildMatrixSendContent,
  parseMatrixAllowlist,
  matrixEnabled,
  stripControl,
  MatrixAdapter,
  type MatrixTransport,
} from "./matrix.js";
import type { OutboundMessage } from "./base.js";

/** An `m.room.message` timeline event as it arrives from a /sync response. */
function event(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    event_id: "$e1",
    sender: "@alice:hs",
    room_id: "!room:hs",
    content: { msgtype: "m.text", body: "hi" },
    ...over,
  };
}

describe("parseMatrixEvents", () => {
  it("maps an m.room.message event to an InboundMessage on the shared contract", () => {
    expect(parseMatrixEvents([event()])).toEqual([
      { chatId: "!room:hs", from: "@alice:hs", text: "hi", id: "$e1", isGroup: true },
    ]);
  });

  it("SKIPS a self-sent event (anti-loop — never replies to its own echoed message)", () => {
    const out = parseMatrixEvents(
      [
        event({ event_id: "$e1", sender: "@alice:hs", content: { msgtype: "m.text", body: "from human" } }),
        event({ event_id: "$e2", sender: "@vanta:hs", content: { msgtype: "m.text", body: "from self" } }),
      ],
      "@vanta:hs",
    );
    expect(out).toEqual([
      { chatId: "!room:hs", from: "@alice:hs", text: "from human", id: "$e1", isGroup: true },
    ]);
  });

  it("routes every sender when no selfUserId is given (no anti-loop filtering)", () => {
    const out = parseMatrixEvents([event({ sender: "@anyone:hs" })]);
    expect(out).toHaveLength(1);
    expect(out[0]?.from).toBe("@anyone:hs");
  });

  it("SKIPS a non-text msgtype (m.image carries no agent-facing text)", () => {
    const out = parseMatrixEvents([
      event({ event_id: "$e1", content: { msgtype: "m.text", body: "real message" } }),
      event({ event_id: "$e2", content: { msgtype: "m.image", body: "photo.png" } }),
    ]);
    expect(out.map((m) => m.id)).toEqual(["$e1"]);
  });

  it("control-strips untrusted inbound text (keeping newlines/tabs)", () => {
    const out = parseMatrixEvents([event({ content: { msgtype: "m.text", body: "a\x1b[31mred\x07\x00b\nline2" } })]);
    expect(out[0]?.text).toBe("a[31mredb\nline2");
  });

  it("returns [] for a non-array (garbage in → empty out)", () => {
    expect(parseMatrixEvents(null)).toEqual([]);
    expect(parseMatrixEvents(undefined)).toEqual([]);
    expect(parseMatrixEvents({})).toEqual([]);
    expect(parseMatrixEvents("not json")).toEqual([]);
  });

  it("drops only the malformed elements, keeps the valid ones", () => {
    const out = parseMatrixEvents([event({ event_id: "$e1" }), { junk: true }, event({ event_id: "$e2" })]);
    expect(out.map((m) => m.id)).toEqual(["$e1", "$e2"]);
  });
});

describe("buildMatrixSendContent", () => {
  it("wraps text in an {msgtype:'m.text', body} content object", () => {
    expect(buildMatrixSendContent("hello")).toEqual({ msgtype: "m.text", body: "hello" });
  });

  it("control-strips the outbound body (keeping newlines/tabs)", () => {
    expect(buildMatrixSendContent("a\x00b\x1b\tc\nd")).toEqual({ msgtype: "m.text", body: "ab\tc\nd" });
  });
});

describe("parseMatrixAllowlist", () => {
  it("parses a comma list of room/user ids", () => {
    expect(parseMatrixAllowlist({ VANTA_MATRIX_ALLOWLIST: "!r1:hs, @u2:hs ,!r3:hs" } as NodeJS.ProcessEnv)).toEqual(
      new Set(["!r1:hs", "@u2:hs", "!r3:hs"]),
    );
  });

  it("empty/absent → empty set (the adapter reads this as allow-all)", () => {
    expect(parseMatrixAllowlist({ VANTA_MATRIX_ALLOWLIST: "" } as NodeJS.ProcessEnv)).toEqual(new Set());
    expect(parseMatrixAllowlist({} as NodeJS.ProcessEnv)).toEqual(new Set());
    expect(parseMatrixAllowlist({ VANTA_MATRIX_ALLOWLIST: " , ," } as NodeJS.ProcessEnv)).toEqual(new Set());
  });
});

describe("matrixEnabled", () => {
  it("true only when BOTH homeserver and token are present + non-blank", () => {
    expect(
      matrixEnabled({ VANTA_MATRIX_HOMESERVER: "https://hs", VANTA_MATRIX_TOKEN: "tok" } as NodeJS.ProcessEnv),
    ).toBe(true);
  });

  it("false when either env is absent or blank (not configured = disabled)", () => {
    expect(matrixEnabled({} as NodeJS.ProcessEnv)).toBe(false);
    expect(matrixEnabled({ VANTA_MATRIX_HOMESERVER: "https://hs" } as NodeJS.ProcessEnv)).toBe(false);
    expect(matrixEnabled({ VANTA_MATRIX_TOKEN: "tok" } as NodeJS.ProcessEnv)).toBe(false);
    expect(
      matrixEnabled({ VANTA_MATRIX_HOMESERVER: "  ", VANTA_MATRIX_TOKEN: "tok" } as NodeJS.ProcessEnv),
    ).toBe(false);
  });
});

describe("stripControl", () => {
  it("removes C0/C1 + DEL control chars but keeps \\n and \\t", () => {
    expect(stripControl("a\x00b\x1b\x7f\tc\nd")).toBe("ab\tc\nd");
  });
});

/** An injected fake transport recording sends; no real network. */
function fakeTransport(syncResult: unknown): {
  transport: MatrixTransport;
  sends: Array<{ roomId: string; content: unknown }>;
} {
  const sends: Array<{ roomId: string; content: unknown }> = [];
  const transport: MatrixTransport = {
    sync: async () => syncResult,
    sendEvent: async (roomId, content) => {
      sends.push({ roomId, content });
    },
  };
  return { transport, sends };
}

describe("MatrixAdapter (injected transport — no real Matrix API)", () => {
  it("polls via the injected transport and parses inbound messages", async () => {
    const { transport } = fakeTransport([event({ content: { msgtype: "m.text", body: "ping" } })]);
    const adapter = new MatrixAdapter({ transport });
    expect(adapter.id).toBe("matrix");
    const inbound = await adapter.poll();
    expect(inbound).toEqual([{ chatId: "!room:hs", from: "@alice:hs", text: "ping", id: "$e1", isGroup: true }]);
  });

  it("skips its own events on poll when selfUserId is set (anti-loop through the adapter)", async () => {
    const { transport } = fakeTransport([
      event({ event_id: "$e1", sender: "@alice:hs" }),
      event({ event_id: "$e2", sender: "@vanta:hs" }),
    ]);
    const adapter = new MatrixAdapter({ transport, selfUserId: "@vanta:hs" });
    const inbound = await adapter.poll();
    expect(inbound.map((m) => m.id)).toEqual(["$e1"]);
  });

  it("returns [] (never throws) when the transport sync rejects", async () => {
    const transport: MatrixTransport = {
      sync: async () => {
        throw new Error("network down");
      },
      sendEvent: async () => {},
    };
    const adapter = new MatrixAdapter({ transport });
    await expect(adapter.poll()).resolves.toEqual([]);
  });

  it("filters inbound by the allowlist (room OR sender id)", async () => {
    const { transport } = fakeTransport([
      event({ event_id: "$e1", room_id: "!r1:hs", sender: "@u1:hs" }),
      event({ event_id: "$e2", room_id: "!r9:hs", sender: "@u9:hs" }),
    ]);
    const adapter = new MatrixAdapter({ transport, allow: new Set(["!r1:hs"]) });
    const inbound = await adapter.poll();
    expect(inbound.map((m) => m.id)).toEqual(["$e1"]);
  });

  it("sends via sendEvent with the {msgtype, body} content to the room", async () => {
    const { transport, sends } = fakeTransport([]);
    const adapter = new MatrixAdapter({ transport });
    const out: OutboundMessage = { chatId: "!room:hs", text: "reply" };
    await adapter.send(out);
    expect(sends).toEqual([{ roomId: "!room:hs", content: { msgtype: "m.text", body: "reply" } }]);
  });

  it("splits an over-budget reply into multiple sends (each a valid m.text event)", async () => {
    const { transport, sends } = fakeTransport([]);
    const adapter = new MatrixAdapter({ transport });
    await adapter.send({ chatId: "!room:hs", text: "z".repeat(65000) });
    expect(sends.length).toBeGreaterThan(1);
    for (const s of sends) {
      const content = s.content as { msgtype: string; body: string };
      expect(content.msgtype).toBe("m.text");
      expect(content.body.length).toBeLessThanOrEqual(30000);
    }
    const total = sends.reduce((n, s) => n + (s.content as { body: string }).body.length, 0);
    expect(total).toBe(65000);
  });

  it("does not throw through the loop when a send rejects (errors-as-values)", async () => {
    const transport: MatrixTransport = {
      sync: async () => [],
      sendEvent: async () => {
        throw new Error("send failed");
      },
    };
    const adapter = new MatrixAdapter({ transport });
    await expect(adapter.send({ chatId: "!room:hs", text: "reply" })).resolves.toBeUndefined();
  });

  it("connect/disconnect are no-ops (stateless REST)", async () => {
    const { transport } = fakeTransport([]);
    const adapter = new MatrixAdapter({ transport });
    await expect(adapter.connect()).resolves.toBeUndefined();
    await expect(adapter.disconnect()).resolves.toBeUndefined();
  });
});
