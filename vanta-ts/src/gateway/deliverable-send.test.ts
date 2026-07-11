import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sendDeliverables } from "./deliverable-send.js";
import type { PlatformAdapter } from "./platforms/base.js";

let dir = "";
afterEach(async () => { if (dir) await rm(dir, { recursive: true, force: true }); });

describe("sendDeliverables", () => {
  it("uploads through the native port and records a receipt without file contents", async () => {
    dir = await mkdtemp(join(tmpdir(), "vanta-delivery-"));
    const path = join(dir, "report.pdf"); await writeFile(path, "private report body");
    const sent: string[] = [];
    const platform = adapter(async (file) => {
      sent.push(`${file.name}:${file.data.length}`);
      return { platform: "test", transport: "native", accepted: true, name: file.name, mime: file.mime, bytes: file.data.length };
    });
    const result = await sendDeliverables({
      dataDir: dir, platform, target: { chatId: "42" },
      files: [{ path, name: "report.pdf", mime: "application/pdf", source: "reply" }],
      now: () => new Date("2026-07-11T12:00:00Z"),
    });
    expect(result).toEqual({ sent: 1, skipped: [] });
    expect(sent).toEqual(["report.pdf:19"]);
    const receipt = await readFile(join(dir, "deliverable-receipts.jsonl"), "utf8");
    expect(receipt).toContain('"name":"report.pdf"');
    expect(receipt).not.toContain("private report body");
  });

  it("does not read files when the channel lacks native upload", async () => {
    dir = await mkdtemp(join(tmpdir(), "vanta-delivery-"));
    const result = await sendDeliverables({
      dataDir: dir, platform: adapter(), target: { chatId: "42" },
      files: [{ path: join(dir, "missing.pdf"), name: "missing.pdf", mime: "application/pdf", source: "reply" }],
    });
    expect(result).toEqual({ sent: 0, skipped: ["missing.pdf: channel test does not support native files"] });
  });
});

function adapter(sendFile?: NonNullable<PlatformAdapter["sendFile"]>): PlatformAdapter {
  return { id: "test", connect: async () => {}, disconnect: async () => {}, poll: async () => [], send: async () => {}, ...(sendFile ? { sendFile } : {}) };
}
