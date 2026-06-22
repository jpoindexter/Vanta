import { describe, it, expect, vi, afterEach } from "vitest";
import { generateKeyPairSync, verify, type KeyObject } from "node:crypto";
import {
  parseGoogleChatEvents,
  buildGoogleChatSend,
  parseGoogleChatAllowlist,
  googleChatEnabled,
  stripControl,
  buildServiceAccountJwt,
  serviceAccountTransport,
  GoogleChatAdapter,
  type GoogleChatTransport,
  type ServiceAccount,
} from "./google-chat.js";
import type { OutboundMessage } from "./base.js";

/** A Google Chat MESSAGE event as it arrives from the bot endpoint. */
function event(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: "MESSAGE",
    message: {
      name: "spaces/AAA/messages/m1",
      text: "hi",
      sender: { name: "users/alice", type: "HUMAN" },
      space: { name: "spaces/AAA" },
    },
    ...over,
  };
}

/** A MESSAGE event with a patched `message` sub-object (keeps the other message fields). */
function messageEvent(message: Record<string, unknown>): Record<string, unknown> {
  return {
    type: "MESSAGE",
    message: {
      name: "spaces/AAA/messages/m1",
      text: "hi",
      sender: { name: "users/alice", type: "HUMAN" },
      space: { name: "spaces/AAA" },
      ...message,
    },
  };
}

describe("parseGoogleChatEvents", () => {
  it("maps a MESSAGE event to an InboundMessage on the shared contract", () => {
    expect(parseGoogleChatEvents([event()])).toEqual([
      {
        chatId: "spaces/AAA",
        from: "users/alice",
        text: "hi",
        id: "spaces/AAA/messages/m1",
        isGroup: true,
      },
    ]);
  });

  it("SKIPS a BOT-sent event (anti-loop — never replies to its own/another bot's message)", () => {
    const out = parseGoogleChatEvents([
      messageEvent({ name: "spaces/AAA/messages/m1", sender: { name: "users/alice", type: "HUMAN" } }),
      messageEvent({ name: "spaces/AAA/messages/m2", sender: { name: "users/vanta", type: "BOT" } }),
    ]);
    expect(out).toEqual([
      {
        chatId: "spaces/AAA",
        from: "users/alice",
        text: "hi",
        id: "spaces/AAA/messages/m1",
        isGroup: true,
      },
    ]);
  });

  it("SKIPS a non-MESSAGE event type (ADDED_TO_SPACE carries no agent-facing text)", () => {
    const out = parseGoogleChatEvents([
      messageEvent({ name: "spaces/AAA/messages/m1" }),
      { type: "ADDED_TO_SPACE", message: messageEvent({ name: "spaces/AAA/messages/m2" }).message },
    ]);
    expect(out.map((m) => m.id)).toEqual(["spaces/AAA/messages/m1"]);
  });

  it("control-strips untrusted inbound text (keeping newlines/tabs)", () => {
    const out = parseGoogleChatEvents([messageEvent({ text: "a\x1b[31mred\x07\x00b\nline2" })]);
    expect(out[0]?.text).toBe("a[31mredb\nline2");
  });

  it("returns [] for a non-array (garbage in → empty out)", () => {
    expect(parseGoogleChatEvents(null)).toEqual([]);
    expect(parseGoogleChatEvents(undefined)).toEqual([]);
    expect(parseGoogleChatEvents({})).toEqual([]);
    expect(parseGoogleChatEvents("not json")).toEqual([]);
  });

  it("drops only the malformed elements, keeps the valid ones", () => {
    const out = parseGoogleChatEvents([
      messageEvent({ name: "spaces/AAA/messages/m1" }),
      { junk: true },
      messageEvent({ name: "spaces/AAA/messages/m2" }),
    ]);
    expect(out.map((m) => m.id)).toEqual(["spaces/AAA/messages/m1", "spaces/AAA/messages/m2"]);
  });
});

describe("buildGoogleChatSend", () => {
  it("wraps text in a {text} body object", () => {
    expect(buildGoogleChatSend("hello")).toEqual({ text: "hello" });
  });

  it("control-strips the outbound body (keeping newlines/tabs)", () => {
    expect(buildGoogleChatSend("a\x00b\x1b\tc\nd")).toEqual({ text: "ab\tc\nd" });
  });
});

describe("parseGoogleChatAllowlist", () => {
  it("parses a comma list of space/sender names", () => {
    expect(
      parseGoogleChatAllowlist({
        VANTA_GOOGLE_CHAT_ALLOWLIST: "spaces/AAA, users/u2 ,spaces/BBB",
      } as NodeJS.ProcessEnv),
    ).toEqual(new Set(["spaces/AAA", "users/u2", "spaces/BBB"]));
  });

  it("empty/absent → empty set (the adapter reads this as allow-all)", () => {
    expect(parseGoogleChatAllowlist({ VANTA_GOOGLE_CHAT_ALLOWLIST: "" } as NodeJS.ProcessEnv)).toEqual(new Set());
    expect(parseGoogleChatAllowlist({} as NodeJS.ProcessEnv)).toEqual(new Set());
    expect(parseGoogleChatAllowlist({ VANTA_GOOGLE_CHAT_ALLOWLIST: " , ," } as NodeJS.ProcessEnv)).toEqual(new Set());
  });
});

describe("googleChatEnabled", () => {
  it("true only when the service-account JSON is present + non-blank", () => {
    expect(googleChatEnabled({ VANTA_GOOGLECHAT_SA: '{"client_email":"x"}' } as NodeJS.ProcessEnv)).toBe(true);
  });

  it("false when the SA is absent or blank (not configured = disabled)", () => {
    expect(googleChatEnabled({} as NodeJS.ProcessEnv)).toBe(false);
    expect(googleChatEnabled({ VANTA_GOOGLECHAT_SA: "" } as NodeJS.ProcessEnv)).toBe(false);
    expect(googleChatEnabled({ VANTA_GOOGLECHAT_SA: "  " } as NodeJS.ProcessEnv)).toBe(false);
  });
});

describe("stripControl", () => {
  it("removes C0/C1 + DEL control chars but keeps \\n and \\t", () => {
    expect(stripControl("a\x00b\x1b\x7f\tc\nd")).toBe("ab\tc\nd");
  });
});

/** An injected fake transport recording sends; no real network. */
function fakeTransport(pollResult: unknown): {
  transport: GoogleChatTransport;
  sends: Array<{ space: string; body: unknown }>;
} {
  const sends: Array<{ space: string; body: unknown }> = [];
  const transport: GoogleChatTransport = {
    poll: async () => pollResult,
    postMessage: async (space, body) => {
      sends.push({ space, body });
    },
  };
  return { transport, sends };
}

describe("GoogleChatAdapter (injected transport — no real Google Chat API)", () => {
  it("polls via the injected transport and parses inbound messages", async () => {
    const { transport } = fakeTransport([messageEvent({ text: "ping" })]);
    const adapter = new GoogleChatAdapter({ transport });
    expect(adapter.id).toBe("googlechat");
    const inbound = await adapter.poll();
    expect(inbound).toEqual([
      {
        chatId: "spaces/AAA",
        from: "users/alice",
        text: "ping",
        id: "spaces/AAA/messages/m1",
        isGroup: true,
      },
    ]);
  });

  it("skips BOT-sent events on poll (anti-loop through the adapter)", async () => {
    const { transport } = fakeTransport([
      messageEvent({ name: "spaces/AAA/messages/m1", sender: { name: "users/alice", type: "HUMAN" } }),
      messageEvent({ name: "spaces/AAA/messages/m2", sender: { name: "users/vanta", type: "BOT" } }),
    ]);
    const adapter = new GoogleChatAdapter({ transport });
    const inbound = await adapter.poll();
    expect(inbound.map((m) => m.id)).toEqual(["spaces/AAA/messages/m1"]);
  });

  it("returns [] (never throws) when the transport poll rejects", async () => {
    const transport: GoogleChatTransport = {
      poll: async () => {
        throw new Error("network down");
      },
      postMessage: async () => {},
    };
    const adapter = new GoogleChatAdapter({ transport });
    await expect(adapter.poll()).resolves.toEqual([]);
  });

  it("filters inbound by the allowlist (space OR sender name)", async () => {
    const { transport } = fakeTransport([
      messageEvent({
        name: "spaces/AAA/messages/m1",
        space: { name: "spaces/AAA" },
        sender: { name: "users/u1", type: "HUMAN" },
      }),
      messageEvent({
        name: "spaces/ZZZ/messages/m2",
        space: { name: "spaces/ZZZ" },
        sender: { name: "users/u9", type: "HUMAN" },
      }),
    ]);
    const adapter = new GoogleChatAdapter({ transport, allow: new Set(["spaces/AAA"]) });
    const inbound = await adapter.poll();
    expect(inbound.map((m) => m.id)).toEqual(["spaces/AAA/messages/m1"]);
  });

  it("sends via postMessage with the {text} body to the space", async () => {
    const { transport, sends } = fakeTransport([]);
    const adapter = new GoogleChatAdapter({ transport });
    const out: OutboundMessage = { chatId: "spaces/AAA", text: "reply" };
    await adapter.send(out);
    expect(sends).toEqual([{ space: "spaces/AAA", body: { text: "reply" } }]);
  });

  it("splits an over-budget reply into multiple sends (each a valid {text} body)", async () => {
    const { transport, sends } = fakeTransport([]);
    const adapter = new GoogleChatAdapter({ transport });
    await adapter.send({ chatId: "spaces/AAA", text: "z".repeat(9000) });
    expect(sends.length).toBeGreaterThan(1);
    for (const s of sends) {
      const body = s.body as { text: string };
      expect(body.text.length).toBeLessThanOrEqual(4000);
    }
    const total = sends.reduce((n, s) => n + (s.body as { text: string }).text.length, 0);
    expect(total).toBe(9000);
  });

  it("does not throw through the loop when a send rejects (errors-as-values)", async () => {
    const transport: GoogleChatTransport = {
      poll: async () => [],
      postMessage: async () => {
        throw new Error("send failed");
      },
    };
    const adapter = new GoogleChatAdapter({ transport });
    await expect(adapter.send({ chatId: "spaces/AAA", text: "reply" })).resolves.toBeUndefined();
  });

  it("connect/disconnect are no-ops (stateless REST)", async () => {
    const { transport } = fakeTransport([]);
    const adapter = new GoogleChatAdapter({ transport });
    await expect(adapter.connect()).resolves.toBeUndefined();
    await expect(adapter.disconnect()).resolves.toBeUndefined();
  });
});

/** Generate a throwaway RSA keypair + an SA using its private key — no real Google credential. */
function testServiceAccount(over: Partial<ServiceAccount> = {}): { sa: ServiceAccount; publicKey: KeyObject } {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const sa: ServiceAccount = {
    client_email: "bot@vanta-test.iam.gserviceaccount.com",
    private_key: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    ...over,
  };
  return { sa, publicKey };
}

/** Decode a base64url JWT segment back to its JSON object. */
function decodeSegment(seg: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(seg, "base64url").toString("utf8"));
}

/** Split a JWT into its three string segments (asserts the shape so segments aren't `undefined`). */
function jwtSegments(jwt: string): [header: string, claims: string, signature: string] {
  const parts = jwt.split(".");
  expect(parts).toHaveLength(3);
  return parts as [string, string, string];
}

describe("buildServiceAccountJwt", () => {
  it("builds a 3-segment JWT with the correct RS256 header", () => {
    const { sa } = testServiceAccount();
    const [header, claims, signature] = jwtSegments(buildServiceAccountJwt(sa, 1_700_000_000));
    expect([header, claims, signature].every(Boolean)).toBe(true);
    expect(decodeSegment(header)).toEqual({ alg: "RS256", typ: "JWT" });
  });

  it("builds the documented claim set (iss/scope/aud/iat/exp, exp = iat + 1h)", () => {
    const { sa } = testServiceAccount();
    const now = 1_700_000_000;
    const [, claims] = jwtSegments(buildServiceAccountJwt(sa, now));
    expect(decodeSegment(claims)).toEqual({
      iss: "bot@vanta-test.iam.gserviceaccount.com",
      scope: "https://www.googleapis.com/auth/chat.bot",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    });
  });

  it("signs header.claims with the SA private key — verifies against the public key", () => {
    const { sa, publicKey } = testServiceAccount();
    const [header, claims, signature] = jwtSegments(buildServiceAccountJwt(sa, 1_700_000_000));
    const ok = verify("RSA-SHA256", Buffer.from(`${header}.${claims}`), publicKey, Buffer.from(signature, "base64url"));
    expect(ok).toBe(true);
  });

  it("a tampered claim set fails signature verification", () => {
    const { sa, publicKey } = testServiceAccount();
    const [header, , signature] = jwtSegments(buildServiceAccountJwt(sa, 1_700_000_000));
    const forged = Buffer.from(JSON.stringify({ iss: "attacker" }), "utf8").toString("base64url");
    const ok = verify("RSA-SHA256", Buffer.from(`${header}.${forged}`), publicKey, Buffer.from(signature, "base64url"));
    expect(ok).toBe(false);
  });

  it("honors a token_uri override as the JWT aud", () => {
    const { sa } = testServiceAccount({ token_uri: "https://oauth2.example.test/token" });
    const [, claims] = jwtSegments(buildServiceAccountJwt(sa, 1));
    expect(decodeSegment(claims).aud).toBe("https://oauth2.example.test/token");
  });
});

describe("serviceAccountTransport (mints + caches a bearer token from the SA JSON)", () => {
  afterEach(() => vi.unstubAllGlobals());

  /** A fetch stub: the SA's token_uri returns a token; the Chat API records calls. */
  function stubFetch(opts: { tokenOk?: boolean; expiresIn?: number } = {}): {
    calls: Array<{ url: string; init?: RequestInit }>;
    mintCount: () => number;
  } {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const tokenOk = opts.tokenOk ?? true;
    const expiresIn = opts.expiresIn ?? 3600;
    const handler = async (url: string, init?: RequestInit): Promise<unknown> => {
      calls.push({ url, init });
      if (url.includes("/token")) {
        return tokenOk
          ? { ok: true, status: 200, json: async () => ({ access_token: "minted-tok", token_type: "Bearer", expires_in: expiresIn }) }
          : { ok: false, status: 401, json: async () => ({}) };
      }
      return { ok: true, status: 200, json: async () => [] };
    };
    vi.stubGlobal("fetch", vi.fn(handler));
    return { calls, mintCount: () => calls.filter((c) => c.url.includes("/token")).length };
  }

  function saJsonWithTokenUri(): string {
    const { sa } = testServiceAccount({ token_uri: "https://oauth2.example.test/token" });
    return JSON.stringify(sa);
  }

  it("mints a token then sends with `Authorization: Bearer <minted>` to the Chat API", async () => {
    const { calls } = stubFetch();
    const t = serviceAccountTransport(saJsonWithTokenUri(), "https://chat.example.test/v1");
    await t.postMessage("spaces/AAA", { text: "hi" });
    const tokenCall = calls.find((c) => c.url.includes("/token"));
    expect(tokenCall?.init?.method).toBe("POST");
    expect(String(tokenCall?.init?.body)).toContain("grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer");
    const apiCall = calls.find((c) => c.url.includes("chat.example.test"));
    expect((apiCall?.init?.headers as Record<string, string>).Authorization).toBe("Bearer minted-tok");
  });

  it("caches the token — two calls mint exactly once", async () => {
    const { mintCount } = stubFetch();
    const t = serviceAccountTransport(saJsonWithTokenUri(), "https://chat.example.test/v1");
    await t.poll();
    await t.postMessage("spaces/AAA", { text: "hi" });
    expect(mintCount()).toBe(1);
  });

  it("errors-as-values: a failed token mint makes poll → undefined, postMessage → no-op (never throws)", async () => {
    stubFetch({ tokenOk: false });
    const t = serviceAccountTransport(saJsonWithTokenUri(), "https://chat.example.test/v1");
    await expect(t.poll()).resolves.toBeUndefined();
    await expect(t.postMessage("spaces/AAA", { text: "hi" })).resolves.toBeUndefined();
  });

  it("errors-as-values: an unparseable SA JSON never throws (poll → undefined)", async () => {
    stubFetch();
    const t = serviceAccountTransport("not json", "https://chat.example.test/v1");
    await expect(t.poll()).resolves.toBeUndefined();
    await expect(t.postMessage("spaces/AAA", { text: "hi" })).resolves.toBeUndefined();
  });

  it("a minted-token transport drives the adapter end-to-end (SA JSON → live poll → InboundMessage)", async () => {
    const handler = async (url: string): Promise<unknown> => {
      if (url.includes("/token")) {
        return { ok: true, status: 200, json: async () => ({ access_token: "minted-tok", token_type: "Bearer", expires_in: 3600 }) };
      }
      return { ok: true, status: 200, json: async () => [messageEvent({ text: "ping" })] };
    };
    vi.stubGlobal("fetch", vi.fn(handler));
    const transport = serviceAccountTransport(saJsonWithTokenUri(), "https://chat.example.test/v1");
    const adapter = new GoogleChatAdapter({ transport });
    const inbound = await adapter.poll();
    expect(inbound.map((m) => m.text)).toEqual(["ping"]);
  });
});
