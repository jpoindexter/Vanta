import { describe, expect, it, vi } from "vitest";
import { runModelDownloadCommand } from "./model-download-cmd.js";

function job(status = "queued") {
  return { id: "qwen", status, downloadedBytes: status === "completed" ? 10 : 0, destination: "/models/qwen.gguf", source: { bytes: 10 } };
}

describe("local model download CLI", () => {
  it("enqueues a manifest and prints machine-readable status", async () => {
    const lines: string[] = [];
    const queue = { enqueue: vi.fn(async () => ({ job: job(), duplicate: false })) } as any;
    const code = await runModelDownloadCommand("/project", ["add", "--id", "qwen", "--label", "Qwen", "--url", "https://huggingface.co/repo/model.gguf", "--sha256", "a".repeat(64), "--bytes", "10", "--filename", "qwen.gguf", "--json"], { queue, log: (line) => lines.push(line) });
    expect(code).toBe(0);
    expect(queue.enqueue).toHaveBeenCalledWith(expect.objectContaining({ id: "qwen", source: expect.objectContaining({ kind: "hugging_face" }) }));
    expect(JSON.parse(lines[0]!)).toMatchObject({ id: "qwen", status: "queued" });
  });

  it("exposes retry and confirmation-gated cleanup", async () => {
    const retry = vi.fn(async () => job("completed"));
    const cleanup = vi.fn(async (_id, confirmed) => { if (!confirmed) throw new Error("requires confirmation"); return job(); });
    const queue = { retry, cleanup } as any;
    expect(await runModelDownloadCommand("/project", ["retry", "qwen"], { queue, log: () => undefined })).toBe(0);
    expect(await runModelDownloadCommand("/project", ["cleanup", "qwen"], { queue, log: () => undefined })).toBe(1);
    expect(await runModelDownloadCommand("/project", ["cleanup", "qwen", "--confirm"], { queue, log: () => undefined })).toBe(0);
    expect(cleanup).toHaveBeenLastCalledWith("qwen", true);
  });
});
