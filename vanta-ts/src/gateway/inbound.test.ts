import { describe, it, expect } from "vitest";
import {
  dedup,
  newSeenIds,
  requireMention,
  stripMention,
  withTimestamp,
  stripTimestampPrefix,
  formatTimestamp,
  injectQuote,
  processInbound,
  type InboundContext,
  type MentionConfig,
} from "./inbound.js";
import type { InboundMessage } from "./platforms/base.js";
import { recordSent, type ReplyFs, type ReplyStoreDeps } from "./reply-store.js";

const msg = (over: Partial<InboundMessage> = {}): InboundMessage => ({
  chatId: "c1",
  text: "hello",
  ...over,
});

// --- MSG-SELF-ECHO-DEDUP -----------------------------------------------------

describe("dedup (MSG-SELF-ECHO-DEDUP)", () => {
  it("drops the bot's own message echoed back (self-id)", () => {
    const r = dedup(msg({ id: "1", fromMe: true }), newSeenIds());
    expect(r.drop).toBe(true);
    if (r.drop) expect(r.reason).toBe("self-echo");
  });

  it("drops a replayed duplicate id from a reconnect", () => {
    let seen = newSeenIds();
    const first = dedup(msg({ id: "abc" }), seen);
    expect(first.drop).toBe(false);
    seen = first.seen;
    const replay = dedup(msg({ id: "abc" }), seen);
    expect(replay.drop).toBe(true);
    if (replay.drop) expect(replay.reason).toBe("duplicate");
  });

  it("passes a fresh, non-echo message and records its id", () => {
    const r = dedup(msg({ id: "new" }), newSeenIds());
    expect(r.drop).toBe(false);
    expect(r.seen.ids.has("new")).toBe(true);
  });

  it("never treats an id-less message as a duplicate", () => {
    let seen = newSeenIds();
    seen = dedup(msg(), seen).seen;
    const r = dedup(msg(), seen);
    expect(r.drop).toBe(false);
  });

  it("evicts the oldest id when the bounded set overflows", () => {
    let seen = newSeenIds(2);
    seen = dedup(msg({ id: "a" }), seen).seen;
    seen = dedup(msg({ id: "b" }), seen).seen;
    seen = dedup(msg({ id: "c" }), seen).seen; // evicts "a"
    expect(seen.ids.has("a")).toBe(false);
    // "a" can be seen again (it was evicted) → not a duplicate
    expect(dedup(msg({ id: "a" }), seen).drop).toBe(false);
  });
});

// --- MSG-REQUIRE-MENTION -----------------------------------------------------

const cfg: MentionConfig = { handle: "vantabot" };

describe("stripMention (MSG-REQUIRE-MENTION strip)", () => {
  it("removes the @handle and tidies whitespace", () => {
    expect(stripMention("@vantabot what's up", "vantabot")).toBe("what's up");
    expect(stripMention("hey @vantabot now", "vantabot")).toBe("hey now");
  });

  it("is case-insensitive on the handle", () => {
    expect(stripMention("@VantaBot hi", "vantabot")).toBe("hi");
  });
});

describe("requireMention (MSG-REQUIRE-MENTION gate)", () => {
  it("DM always responds, unchanged", () => {
    const r = requireMention(msg({ isGroup: false }), cfg, false);
    expect(r.respond).toBe(true);
    if (r.respond) expect(r.message.text).toBe("hello");
  });

  it("ignores a group message with no mention / reply / command", () => {
    const r = requireMention(msg({ isGroup: true, text: "just chatting" }), cfg, false);
    expect(r.respond).toBe(false);
  });

  it("handles a mentioned group message and strips the handle", () => {
    const r = requireMention(msg({ isGroup: true, text: "@vantabot ship it" }), cfg, false);
    expect(r.respond).toBe(true);
    if (r.respond) expect(r.message.text).toBe("ship it");
  });

  it("responds to a group `/command` even without a mention", () => {
    const r = requireMention(msg({ isGroup: true, text: "/status" }), cfg, false);
    expect(r.respond).toBe(true);
  });

  it("responds when the message replies to the bot's own message", () => {
    const r = requireMention(msg({ isGroup: true, text: "yes do that" }), cfg, true);
    expect(r.respond).toBe(true);
  });

  it("respects per-chat gating: a non-gated group responds without a mention", () => {
    const scoped: MentionConfig = { handle: "vantabot", requireMentionIn: new Set(["other"]) };
    const r = requireMention(msg({ isGroup: true, chatId: "c1", text: "free chat" }), scoped, false);
    expect(r.respond).toBe(true);
  });
});

// --- MSG-INBOUND-TIMESTAMP ---------------------------------------------------

describe("withTimestamp (MSG-INBOUND-TIMESTAMP)", () => {
  const at = new Date(2026, 3, 28, 13, 40); // Tue 2026-04-28 13:40 (local)

  it("prefixes one human timestamp", () => {
    expect(withTimestamp("the body", at, "CEST")).toBe("[Tue 2026-04-28 13:40 CEST] the body");
  });

  it("is idempotent: re-processing never stacks [ts][ts]", () => {
    const once = withTimestamp("the body", at, "CEST");
    const twice = withTimestamp(once, at, "CEST");
    expect(twice).toBe(once);
    expect((twice.match(/\[/g) ?? []).length).toBe(1);
  });

  it("strips an existing prefix before re-stamping with a new time", () => {
    const old = "[Mon 2026-04-27 09:00 CEST] the body";
    expect(withTimestamp(old, at, "CEST")).toBe("[Tue 2026-04-28 13:40 CEST] the body");
  });

  it("works without a zone label", () => {
    expect(withTimestamp("x", at)).toBe("[Tue 2026-04-28 13:40] x");
  });

  it("stripTimestampPrefix leaves a non-prefixed string untouched", () => {
    expect(stripTimestampPrefix("no prefix here")).toBe("no prefix here");
  });

  it("formatTimestamp composes parts", () => {
    expect(formatTimestamp({ weekday: "Tue", date: "2026-04-28", time: "13:40", zone: "CEST" })).toBe(
      "Tue 2026-04-28 13:40 CEST",
    );
  });
});

// --- MSG-REPLY-CONTEXT -------------------------------------------------------

describe("injectQuote (MSG-REPLY-CONTEXT)", () => {
  it("prepends the quoted text as a context block", () => {
    expect(injectQuote("yes", "earlier bot line")).toBe("[in reply to: earlier bot line]\nyes");
  });
});

// --- Composition -------------------------------------------------------------

function memReplyDeps(): { deps: ReplyStoreDeps } {
  const files = new Map<string, string>();
  const fs: ReplyFs = {
    readFile: async (p) => {
      const v = files.get(p);
      if (v === undefined) throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
      return v;
    },
    writeFile: async (p, d) => void files.set(p, d),
    rename: async (from, to) => {
      const v = files.get(from)!;
      files.set(to, v);
      files.delete(from);
    },
  };
  return { deps: { fs, dir: "/data" } };
}

function ctx(over: Partial<InboundContext> = {}): InboundContext {
  return {
    seen: newSeenIds(),
    mention: cfg,
    now: () => new Date(2026, 3, 28, 13, 40),
    zone: "CEST",
    ...over,
  };
}

describe("processInbound (pipeline composition)", () => {
  it("skips a self-echo without producing a handle message", async () => {
    const r = await processInbound(msg({ id: "1", fromMe: true }), ctx());
    expect(r.verdict.kind).toBe("skip");
    if (r.verdict.kind === "skip") expect(r.verdict.reason).toBe("self-echo");
  });

  it("skips a replayed duplicate (threaded seen-set)", async () => {
    let c = ctx();
    const first = await processInbound(msg({ id: "dup" }), c);
    c = { ...c, seen: first.seen };
    const second = await processInbound(msg({ id: "dup" }), c);
    expect(second.verdict.kind).toBe("skip");
    if (second.verdict.kind === "skip") expect(second.verdict.reason).toBe("duplicate");
  });

  it("skips an un-mentioned group message (no agent turn)", async () => {
    const r = await processInbound(msg({ isGroup: true, text: "chatter" }), ctx());
    expect(r.verdict.kind).toBe("skip");
    if (r.verdict.kind === "skip") expect(r.verdict.reason).toBe("no-mention");
  });

  it("handles a DM: enriches llmText with the timestamp, keeps text clean", async () => {
    const r = await processInbound(msg({ isGroup: false, text: "status?" }), ctx());
    expect(r.verdict.kind).toBe("handle");
    if (r.verdict.kind === "handle") {
      expect(r.verdict.message.text).toBe("status?"); // clean (routable/persistable)
      expect(r.verdict.message.llmText).toBe("[Tue 2026-04-28 13:40 CEST] status?");
    }
  });

  it("handles a mentioned group message: strips handle (text), timestamps (llmText)", async () => {
    const r = await processInbound(msg({ isGroup: true, text: "@vantabot deploy" }), ctx());
    expect(r.verdict.kind).toBe("handle");
    if (r.verdict.kind === "handle") {
      expect(r.verdict.message.text).toBe("deploy"); // handle stripped, no timestamp
      expect(r.verdict.message.llmText).toBe("[Tue 2026-04-28 13:40 CEST] deploy");
    }
  });

  it("injects quoted bot text into llmText when replying to a stored bot message", async () => {
    const { deps } = memReplyDeps();
    await recordSent(deps, "bot-9", "the prior bot answer");
    const r = await processInbound(msg({ isGroup: false, text: "yes", replyToId: "bot-9" }), ctx({ reply: deps }));
    expect(r.verdict.kind).toBe("handle");
    if (r.verdict.kind === "handle") {
      expect(r.verdict.message.text).toBe("yes"); // raw stays clean
      expect(r.verdict.message.llmText).toBe(
        "[in reply to: the prior bot answer]\n[Tue 2026-04-28 13:40 CEST] yes",
      );
    }
  });

  it("a reply-to a stored bot message satisfies the group mention gate", async () => {
    const { deps } = memReplyDeps();
    await recordSent(deps, "bot-9", "prior answer");
    const r = await processInbound(
      msg({ isGroup: true, text: "do it", replyToId: "bot-9" }),
      ctx({ reply: deps }),
    );
    expect(r.verdict.kind).toBe("handle");
  });

  it("degrades to no quote when the reply-to id is a miss", async () => {
    const { deps } = memReplyDeps();
    const r = await processInbound(
      msg({ isGroup: false, text: "hi", replyToId: "absent" }),
      ctx({ reply: deps }),
    );
    expect(r.verdict.kind).toBe("handle");
    if (r.verdict.kind === "handle") {
      expect(r.verdict.message.llmText).toBe("[Tue 2026-04-28 13:40 CEST] hi");
    }
  });
});
