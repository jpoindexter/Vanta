import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ModelDownloadsView } from "./model-downloads.js";
import type { ModelDownloadPayload } from "./types.js";

const payload: ModelDownloadPayload = {
  jobs: [{
    version: 1, id: "qwen", label: "Qwen local",
    source: { kind: "hugging_face", url: "https://huggingface.co/repo/model.gguf", sha256: "a".repeat(64), bytes: 100, filename: "model.gguf" },
    storageRoot: "/models", destination: "/models/model.gguf", profileId: "daily",
    status: "paused", downloadedBytes: 40, resumedAt: 0,
    recovery: "Resume to continue from the persisted partial artifact.",
    createdAt: "2026-07-17T12:00:00.000Z", updatedAt: "2026-07-17T12:01:00.000Z",
  }],
  receipts: [{ version: 1, jobId: "qwen", at: "2026-07-17T12:01:00.000Z", transition: "paused", downloadedBytes: 40, destination: "/models/model.gguf" }],
};

describe("model downloads panel", () => {
  it("shows durable progress, recovery, profile handoff, and lifecycle controls", () => {
    const html = renderToStaticMarkup(<ModelDownloadsView payload={payload} onAction={() => undefined} />);
    expect(html).toContain("Downloads");
    expect(html).toContain("Qwen local");
    expect(html).toContain("40%");
    expect(html).toContain("Resume to continue");
    expect(html).toContain("profile daily");
    expect(html).toContain("Resume");
    expect(html).toContain("Remove partial");
    expect(html).not.toContain("Storage destination");
  });
});
