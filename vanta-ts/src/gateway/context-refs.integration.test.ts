import { afterEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pollPlatformSession } from "./run-session.js";
import { initialState } from "./session-manager.js";
import { createWebChatBuffer, WebChatAdapter } from "./platforms/webchat.js";
import type { InboundMessage, OutboundMessage, PlatformAdapter } from "./platforms/base.js";

const dirs: string[] = [];
afterEach(async () => Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))));

class QueueAdapter implements PlatformAdapter {
  readonly id = "queue-proof";
  sent: OutboundMessage[] = [];
  constructor(private inbox: InboundMessage[]) {}
  async connect() {}
  async disconnect() {}
  async poll() { return this.inbox.splice(0); }
  async send(message: OutboundMessage) { this.sent.push(message); }
}

function base(dataDir: string) {
  return {
    dataDir,
    run: async () => ({ finalText: "" }),
    load: async () => [],
    log: () => {},
    now: () => new Date(2026, 6, 12, 12, 0),
  };
}

describe("gateway context references", () => {
  it("expands the full grammar and returns receipts through a configured WebChat round trip", async () => {
    const root = await mkdtemp(join(tmpdir(), "vanta-webchat-refs-")); dirs.push(root);
    const dataDir = join(root, ".vanta");
    await mkdir(join(root, "notes"), { recursive: true });
    await writeFile(join(root, "notes", "a.txt"), "line one\nline two", "utf8");
    const buffer = createWebChatBuffer();
    const platform = new WebChatAdapter({ buffer, allow: new Set(["allowed-chat"]) });
    await platform.connect();
    buffer.pushInbound({
      chatId: "allowed-chat",
      text: "review @file:notes/a.txt:2-2 @folder:notes @diff @staged @git:2 @url:https://example.com/doc",
    });
    let handled = "";

    const result = await pollPlatformSession({
      ...base(dataDir),
      platform,
      handle: async (text) => { handled = text; return "done"; },
      contextRefs: {
        resolveScope: () => ({ root, contextWindow: 32_000, scopeId: "default" }),
        deps: {
          git: async (args) => `git:${args.join(" ")}`,
          fetchUrl: async () => "remote document",
        },
      },
    }, initialState());

    expect(result.count).toBe(1);
    expect(handled).toContain('<file path="notes/a.txt" lines="2-2">\nline two');
    expect(handled).toContain('<folder path="notes">\na.txt');
    expect(handled).toContain('kind="diff"');
    expect(handled).toContain('kind="staged"');
    expect(handled).toContain('kind="history" count="2"');
    expect(handled).toContain('<url href="https://example.com/doc">\nremote document');
    const outbound = buffer.drainOutbound("allowed-chat");
    expect(outbound[0]).toContain("Context references · scope default");
    expect(outbound[0]).toContain("@file:notes/a.txt:2-2");
    expect(outbound.at(-1)).toBe("done");
    await platform.disconnect();
  });

  it("binds queued messages to their original profile root and refuses cross-root reads", async () => {
    const baseRoot = await mkdtemp(join(tmpdir(), "vanta-profile-refs-")); dirs.push(baseRoot);
    const rootA = join(baseRoot, "a"), rootB = join(baseRoot, "b");
    await mkdir(rootA); await mkdir(rootB);
    await writeFile(join(rootA, "only.txt"), "PROFILE_A_ONLY", "utf8");
    await writeFile(join(rootB, "only.txt"), "PROFILE_B_ONLY", "utf8");
    const platform = new QueueAdapter([
      { chatId: "a", text: "read @file:only.txt" },
      { chatId: "b", text: "read @file:only.txt" },
      { chatId: "a", text: "escape @file:../b/only.txt" },
    ]);
    const handled: string[] = [];

    await pollPlatformSession({
      ...base(join(baseRoot, ".vanta")),
      platform,
      handle: async (text) => { handled.push(text); return "ok"; },
      contextRefs: {
        resolveScope: (message) => ({
          root: message.chatId === "a" ? rootA : rootB,
          contextWindow: 8_000,
          scopeId: `profile-${message.chatId}`,
        }),
      },
    }, initialState());

    expect(handled).toHaveLength(3);
    expect(handled[0]).toContain("PROFILE_A_ONLY");
    expect(handled[0]).not.toContain("PROFILE_B_ONLY");
    expect(handled[1]).toContain("PROFILE_B_ONLY");
    expect(handled[1]).not.toContain("PROFILE_A_ONLY");
    expect(handled[2]).toContain("outside project root");
    expect(handled[2]).not.toContain("PROFILE_B_ONLY");
    expect(platform.sent.some((message) => message.chatId === "a" && message.text.includes("scope profile-a"))).toBe(true);
    expect(platform.sent.some((message) => message.chatId === "b" && message.text.includes("scope profile-b"))).toBe(true);
  });
});
