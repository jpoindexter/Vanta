import { afterEach, describe, it, expect, vi } from "vitest";
import {
  parseTeamsActivities,
  parseServiceUrls,
  buildTeamsActivity,
  parseTeamsAllowlist,
  teamsEnabled,
  stripControl,
  TeamsAdapter,
  httpTransport,
  type TeamsTransport,
} from "./teams.js";
import type { OutboundMessage } from "./base.js";

const SERVICE_URL = "https://smba.trafficmanager.net/teams";

afterEach(() => vi.restoreAllMocks());

/** A Bot Framework message Activity from a 1:1 (personal) conversation. */
function personalActivity(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: "message",
    id: "a1",
    text: "hi",
    serviceUrl: SERVICE_URL,
    timestamp: "2026-01-01T00:00:00Z",
    channelId: "msteams",
    conversation: { id: "C_alice", conversationType: "personal" },
    from: { id: "U_alice", name: "Alice" },
    recipient: { id: "BOT", name: "Vanta" },
    ...over,
  };
}

/** A Bot Framework message Activity from a Teams channel (group) conversation. */
function channelActivity(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: "message",
    id: "a2",
    text: "yo",
    serviceUrl: SERVICE_URL,
    conversation: { id: "C_team", conversationType: "channel" },
    from: { id: "U_bob", name: "Bob" },
    recipient: { id: "BOT", name: "Vanta" },
    ...over,
  };
}

describe("parseTeamsActivities", () => {
  it("maps a personal message Activity to an InboundMessage (chatId=conversation.id, not a group)", () => {
    expect(parseTeamsActivities(personalActivity())).toEqual([
      { chatId: "C_alice", from: "U_alice", text: "hi", id: "a1", isGroup: false },
    ]);
  });

  it("maps a channel message Activity (chatId=conversation.id, isGroup true, from=from.id)", () => {
    expect(parseTeamsActivities(channelActivity())).toEqual([
      { chatId: "C_team", from: "U_bob", text: "yo", id: "a2", isGroup: true },
    ]);
  });

  it("treats conversation.isGroup:true as a group regardless of conversationType", () => {
    const out = parseTeamsActivities(
      personalActivity({ conversation: { id: "C_grp", isGroup: true } }),
    );
    expect(out[0]?.isGroup).toBe(true);
  });

  it("accepts a single bare Activity object (the common webhook shape)", () => {
    expect(parseTeamsActivities(personalActivity()).map((m) => m.id)).toEqual(["a1"]);
  });

  it("accepts the {activities:[...]} wrapper a bridge buffer may batch", () => {
    expect(parseTeamsActivities({ activities: [personalActivity(), channelActivity()] }).map((m) => m.id)).toEqual([
      "a1",
      "a2",
    ]);
  });

  it("accepts a bare array of activities", () => {
    expect(parseTeamsActivities([personalActivity(), channelActivity()]).map((m) => m.id)).toEqual(["a1", "a2"]);
  });

  it("SKIPS a non-message activity (conversationUpdate/typing carry no agent text)", () => {
    const out = parseTeamsActivities([
      personalActivity({ id: "a1", text: "keep" }),
      { type: "conversationUpdate", conversation: { id: "C_x" }, serviceUrl: SERVICE_URL },
      { type: "typing", conversation: { id: "C_y" }, serviceUrl: SERVICE_URL },
    ]);
    expect(out.map((m) => m.id)).toEqual(["a1"]);
  });

  it("SKIPS a message activity with no text (a card/attachment-only post)", () => {
    const out = parseTeamsActivities([
      personalActivity({ id: "a1", text: "keep" }),
      personalActivity({ id: "a2", text: undefined, attachments: [{ contentType: "card" }] }),
    ]);
    expect(out.map((m) => m.id)).toEqual(["a1"]);
  });

  it("omits `from` when the Activity has no from.id, and omits `id` when absent", () => {
    const out = parseTeamsActivities({
      type: "message",
      text: "anon",
      serviceUrl: SERVICE_URL,
      conversation: { id: "C_a", conversationType: "personal" },
    });
    expect(out).toEqual([{ chatId: "C_a", text: "anon", isGroup: false }]);
  });

  it("control-strips untrusted inbound text (keeping newlines/tabs)", () => {
    const out = parseTeamsActivities(personalActivity({ text: "a\x1b[31mred\x07\x00b\nline2" }));
    expect(out[0]?.text).toBe("a[31mredb\nline2");
  });

  it("returns [] for garbage (non-object/array → empty out)", () => {
    expect(parseTeamsActivities(null)).toEqual([]);
    expect(parseTeamsActivities(undefined)).toEqual([]);
    expect(parseTeamsActivities("not json")).toEqual([]);
    expect(parseTeamsActivities(42)).toEqual([]);
    expect(parseTeamsActivities({ activities: "nope" })).toEqual([]);
  });

  it("drops only the malformed elements (missing conversation), keeps the valid ones", () => {
    const out = parseTeamsActivities([
      personalActivity({ id: "a1", text: "a" }),
      { type: "message", text: "no conversation" },
      channelActivity({ id: "a2", text: "b" }),
    ]);
    expect(out.map((m) => m.id)).toEqual(["a1", "a2"]);
  });
});

describe("parseServiceUrls", () => {
  it("maps each conversation.id to its serviceUrl", () => {
    const urls = parseServiceUrls([
      personalActivity({ conversation: { id: "C_alice", conversationType: "personal" }, serviceUrl: "https://a.example" }),
      channelActivity({ conversation: { id: "C_team", conversationType: "channel" }, serviceUrl: "https://b.example" }),
    ]);
    expect(urls.get("C_alice")).toBe("https://a.example");
    expect(urls.get("C_team")).toBe("https://b.example");
  });

  it("skips an activity with no serviceUrl", () => {
    const urls = parseServiceUrls(personalActivity({ serviceUrl: undefined }));
    expect(urls.size).toBe(0);
  });
});

describe("buildTeamsActivity", () => {
  it("builds {type:'message', text}", () => {
    expect(buildTeamsActivity("hello")).toEqual({ type: "message", text: "hello" });
  });

  it("control-strips the outbound text (keeping newlines/tabs)", () => {
    expect(buildTeamsActivity("a\x00b\x1b\tc\nd")).toEqual({ type: "message", text: "ab\tc\nd" });
  });

  it("truncates over-budget text to the Teams per-message cap", () => {
    const body = buildTeamsActivity("z".repeat(30000));
    expect(body.text.length).toBe(28000);
  });
});

describe("parseTeamsAllowlist", () => {
  it("parses a comma list of conversation/user ids", () => {
    expect(
      parseTeamsAllowlist({ VANTA_TEAMS_ALLOWLIST: "C_alice, C_team ,U_bob" } as NodeJS.ProcessEnv),
    ).toEqual(new Set(["C_alice", "C_team", "U_bob"]));
  });

  it("empty/absent → empty set (the adapter reads this as allow-all)", () => {
    expect(parseTeamsAllowlist({ VANTA_TEAMS_ALLOWLIST: "" } as NodeJS.ProcessEnv)).toEqual(new Set());
    expect(parseTeamsAllowlist({} as NodeJS.ProcessEnv)).toEqual(new Set());
    expect(parseTeamsAllowlist({ VANTA_TEAMS_ALLOWLIST: " , ," } as NodeJS.ProcessEnv)).toEqual(new Set());
  });
});

describe("teamsEnabled", () => {
  it("true only when BOTH app id and app password are present + non-blank", () => {
    expect(
      teamsEnabled({ VANTA_TEAMS_APP_ID: "id", VANTA_TEAMS_APP_PASSWORD: "pw" } as NodeJS.ProcessEnv),
    ).toBe(true);
  });

  it("false when either is absent or blank (one without the other = disabled)", () => {
    expect(teamsEnabled({} as NodeJS.ProcessEnv)).toBe(false);
    expect(teamsEnabled({ VANTA_TEAMS_APP_ID: "id" } as NodeJS.ProcessEnv)).toBe(false);
    expect(teamsEnabled({ VANTA_TEAMS_APP_PASSWORD: "pw" } as NodeJS.ProcessEnv)).toBe(false);
    expect(
      teamsEnabled({ VANTA_TEAMS_APP_ID: "  ", VANTA_TEAMS_APP_PASSWORD: "pw" } as NodeJS.ProcessEnv),
    ).toBe(false);
  });
});

describe("stripControl", () => {
  it("removes C0/C1 + DEL control chars but keeps \\n and \\t", () => {
    expect(stripControl("a\x00b\x1b\x7f\tc\nd")).toBe("ab\tc\nd");
  });
});

/** An injected fake transport recording sends; no real network. */
function fakeTransport(pollResult: unknown): {
  transport: TeamsTransport;
  sends: Array<{ serviceUrl: string; conversationId: string; activity: unknown }>;
} {
  const sends: Array<{ serviceUrl: string; conversationId: string; activity: unknown }> = [];
  const transport: TeamsTransport = {
    poll: async () => pollResult,
    send: async (serviceUrl, conversationId, activity) => {
      sends.push({ serviceUrl, conversationId, activity });
    },
  };
  return { transport, sends };
}

describe("TeamsAdapter (injected transport — no real Bot Framework API)", () => {
  it("polls via the injected transport and parses inbound messages", async () => {
    const { transport } = fakeTransport(personalActivity({ id: "a1", text: "ping" }));
    const adapter = new TeamsAdapter({ transport });
    expect(adapter.id).toBe("teams");
    const inbound = await adapter.poll();
    expect(inbound).toEqual([{ chatId: "C_alice", from: "U_alice", text: "ping", id: "a1", isGroup: false }]);
  });

  it("returns [] (never throws) when the transport poll rejects", async () => {
    const transport: TeamsTransport = {
      poll: async () => {
        throw new Error("network down");
      },
      send: async () => {},
    };
    const adapter = new TeamsAdapter({ transport });
    await expect(adapter.poll()).resolves.toEqual([]);
  });

  it("filters inbound by the allowlist (chatId OR sender id)", async () => {
    const { transport } = fakeTransport([
      personalActivity({ id: "a1", text: "ok", conversation: { id: "C_alice", conversationType: "personal" }, from: { id: "U_alice" } }),
      personalActivity({ id: "a2", text: "no", conversation: { id: "C_zed", conversationType: "personal" }, from: { id: "U_zed" } }),
    ]);
    const adapter = new TeamsAdapter({ transport, allow: new Set(["C_alice"]) });
    const inbound = await adapter.poll();
    expect(inbound.map((m) => m.id)).toEqual(["a1"]);
  });

  it("sends a reply routed to the conversation's recorded serviceUrl + conversationId", async () => {
    const { transport, sends } = fakeTransport(personalActivity());
    const adapter = new TeamsAdapter({ transport });
    await adapter.poll(); // records C_alice → SERVICE_URL
    const out: OutboundMessage = { chatId: "C_alice", text: "reply" };
    const receipt = await adapter.send(out);
    expect(sends).toEqual([
      { serviceUrl: SERVICE_URL, conversationId: "C_alice", activity: { type: "message", text: "reply" } },
    ]);
    expect(receipt).toEqual({ platform: "teams", transport: "bot-connector", accepted: true, parts: 1 });
  });

  it("drops a send (no throw) for a conversation it never saw an inbound activity for", async () => {
    const { transport, sends } = fakeTransport(personalActivity());
    const adapter = new TeamsAdapter({ transport });
    await adapter.poll(); // records only C_alice
    await expect(adapter.send({ chatId: "C_unknown", text: "reply" })).resolves.toBeUndefined();
    expect(sends).toEqual([]);
  });

  it("splits an over-budget reply into multiple sends (each a valid activity, same routing)", async () => {
    const { transport, sends } = fakeTransport(channelActivity());
    const adapter = new TeamsAdapter({ transport });
    await adapter.poll(); // records C_team → SERVICE_URL
    await adapter.send({ chatId: "C_team", text: "z".repeat(60000) });
    expect(sends.length).toBeGreaterThan(1);
    let total = 0;
    for (const s of sends) {
      expect(s.serviceUrl).toBe(SERVICE_URL);
      expect(s.conversationId).toBe("C_team");
      const a = s.activity as { type: string; text: string };
      expect(a.type).toBe("message");
      expect(a.text.length).toBeLessThanOrEqual(28000);
      total += a.text.length;
    }
    expect(total).toBe(60000);
  });

  it("does not throw through the loop when a send rejects (errors-as-values)", async () => {
    const transport: TeamsTransport = {
      poll: async () => personalActivity(),
      send: async () => {
        throw new Error("send failed");
      },
    };
    const adapter = new TeamsAdapter({ transport });
    await adapter.poll();
    await expect(adapter.send({ chatId: "C_alice", text: "reply" })).resolves.toBeUndefined();
  });

  it("connect/disconnect are no-ops (stateless REST)", async () => {
    const { transport } = fakeTransport(personalActivity());
    const adapter = new TeamsAdapter({ transport });
    await expect(adapter.connect()).resolves.toBeUndefined();
    await expect(adapter.disconnect()).resolves.toBeUndefined();
  });
});

describe("Teams Bot Connector transport", () => {
  it("resolves only after both token and Connector responses are successful", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ access_token: "minted", expires_in: 3600 }) })
      .mockResolvedValueOnce({ ok: true, status: 202 });
    vi.stubGlobal("fetch", fetchMock);
    await expect(httpTransport("app", "password").send(SERVICE_URL, "C1", { type: "message", text: "ok" }))
      .resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("rejects a non-2xx Connector response so no delivery receipt can be emitted", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ access_token: "minted", expires_in: 3600 }) })
      .mockResolvedValueOnce({ ok: false, status: 503 });
    vi.stubGlobal("fetch", fetchMock);
    await expect(httpTransport("app", "password").send(SERVICE_URL, "C1", { type: "message", text: "no" }))
      .rejects.toThrow("Teams Connector returned HTTP 503");
  });
});
