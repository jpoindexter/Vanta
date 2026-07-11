import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { pollPlatformSession } from "./run.js";
import { initialState } from "./session-manager.js";
import { lookupSent, nodeReplyFs } from "./reply-store.js";
import type { InboundMessage, OutboundFile, OutboundMessage, PlatformAdapter } from "./platforms/base.js";

const dirs: string[] = [];
afterEach(async () => Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))));

class RecordingAdapter implements PlatformAdapter {
  readonly id = "recording";
  sent: OutboundMessage[] = [];
  files: OutboundFile[] = [];
  constructor(private inbox: InboundMessage[]) {}
  async connect(): Promise<void> {}
  async disconnect(): Promise<void> {}
  async poll(): Promise<InboundMessage[]> { const inbox = this.inbox; this.inbox = []; return inbox; }
  async send(message: OutboundMessage): Promise<void> { message.id = "out-1"; this.sent.push(message); }
  async sendFile(file: OutboundFile) {
    this.files.push(file);
    return { platform: this.id, transport: "native", accepted: true as const, name: file.name, mime: file.mime, bytes: file.data.length };
  }
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

  it("sanitizes a produced path, uploads it natively, and writes a receipt", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "vanta-gateway-deliverable-")); dirs.push(dataDir);
    const artifact = join(dataDir, "report.pdf"); await writeFile(artifact, "PDF body");
    const platform = new RecordingAdapter([{ chatId: "chat-1", text: "build report" }]);
    await pollPlatformSession({
      dataDir, run: async () => ({ finalText: "" }), load: async () => [], log: () => {},
      platform, handle: async () => `Report ready: ${artifact}`,
    }, initialState());
    expect(platform.sent[0]?.text).toBe("Report ready:");
    expect(platform.files).toMatchObject([{ chatId: "chat-1", name: "report.pdf", mime: "application/pdf" }]);
    expect(await readFile(join(dataDir, "deliverable-receipts.jsonl"), "utf8")).toContain('"name":"report.pdf"');
  });
});
