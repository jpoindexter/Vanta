import { describe, expect, it, vi } from "vitest";
import { detectRecorder, type RecorderProbe } from "./recorder.js";

describe("detectRecorder", () => {
  it("uses each recorder's valid version flag and falls back to ffmpeg", async () => {
    const probe = vi.fn<RecorderProbe>(async (tool) => {
      if (tool === "sox") throw new Error("missing");
    });
    await expect(detectRecorder(probe)).resolves.toBe("ffmpeg");
    expect(probe.mock.calls).toEqual([["sox", ["--version"]], ["ffmpeg", ["-version"]]]);
  });

  it("returns null when neither recorder is installed", async () => {
    await expect(detectRecorder(async () => { throw new Error("missing"); })).resolves.toBeNull();
  });
});
