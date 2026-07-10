import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { pollPlatformSession } from "./run.js";
import { initialState } from "./session-manager.js";
import { lookupSent, nodeReplyFs } from "./reply-store.js";
import type { InboundMessage, OutboundMessage, PlatformAdapter } from "./platforms/base.js";

const dirs: string[] = [];
afterEach(async () => Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))));

class RecordingAdapter implements PlatformAdapter {
  readonly id = "recording";
  sent: OutboundMessage[] = [];
  constructor(private inbox: InboundMessage[]) {}
  async connect(): Promise<void> {}
  async disconnect(): Promise<void> {}
  async poll(): Promise<InboundMessage[]> { const inbox = this.inbox; this.inbox = []; return inbox; }
  async send(message: OutboundMessage): Promise<void> { message.id = "out-1"; this.sent.push(message); }
}

describe("gateway typed stream path", () => {
  it("sends and records exactly the canonical final reply", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "vanta-gateway-stream-")); dirs.push(dataDir);
    const platform = new RecordingAdapter([{ chatId: "chat-1", text: "run it" }]);
    const result = await pollPlatformSession({
      dataDir,
      run: async () => ({ finalText: "" }),
      load: async () => [],
      log: () => {},
      now: () => new Date(2026, 6, 10, 12, 0),
      platform,
      handle: async (_text, _images, emit) => {
        emit?.({ type: "MessageChunk", text: "answer" });
        emit?.({ type: "Commentary", text: "tool activity" });
        emit?.({ type: "MessageChunk", text: " draft" });
        return "canonical answer";
      },
    }, initialState());

    expect(result.count).toBe(1);
    expect(platform.sent).toEqual([{ id: "out-1", chatId: "chat-1", threadId: undefined, text: "canonical answer" }]);
    await expect(lookupSent({ fs: nodeReplyFs(), dir: dataDir }, "out-1")).resolves.toBe("canonical answer");
  });
});
