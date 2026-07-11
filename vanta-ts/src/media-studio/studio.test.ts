import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { MediaBriefSchema, mediaProductionBoard, previewMediaBrief, renderMediaBrief, productionStages, type MediaRunner } from "./studio.js";

const brief = MediaBriefSchema.parse({
  title: "Launch proof", output: "artifacts/launch.mp4", width: 640, height: 360, fps: 24,
  scenes: [{ title: "Opening", duration: 1, background: "#224466" }, { title: "Result", duration: 1, image: "assets/result.png" }],
});

describe("media studio", () => {
  it("previews providers, sources, duration, cost, and production stages", () => {
    const preview = previewMediaBrief(brief);
    expect(preview).toMatchObject({ duration: 2, estimatedCostUsd: 0, providers: ["ffmpeg-local", "project-image"] });
    expect(productionStages().map((stage) => stage.id)).toEqual(["script", "visual", "audio", "render", "review"]);
    const board = mediaProductionBoard(brief, new Date("2026-07-11T00:00:00Z"));
    expect(board.lanes.find((lane) => lane.id === "render")).toMatchObject({ requiredSkills: ["media-render"], dependencies: ["visual", "audio"] });
  });

  it("rejects invalid or unsafe media briefs", () => {
    expect(MediaBriefSchema.safeParse({ ...brief, output: "../outside.mp4" }).success).toBe(false);
    expect(MediaBriefSchema.safeParse({ ...brief, scenes: [{ title: "x", duration: 999 }] }).success).toBe(false);
  });

  it("renders through injected ffmpeg, verifies ffprobe/frame checks, and writes a receipt", async () => {
    const root = await mkdtemp(join(tmpdir(), "vanta-media-"));
    await writeFile(join(root, "result.png"), "fake");
    const run = vi.fn<MediaRunner>(async (tool, args) => {
      if (tool === "ffprobe") return JSON.stringify({ streams: [{ codec_type: "video", width: 640, height: 360 }], format: { duration: "1.000" } });
      if (args.some((arg) => arg.includes("signalstats"))) return "lavfi.signalstats.YAVG=45.2";
      const output = args.at(-1); if (output?.endsWith(".mp4")) await writeFile(output, "video-bytes");
      return "";
    });
    const localBrief = { ...brief, output: "launch.mp4", scenes: [brief.scenes[0]!] };
    const result = await renderMediaBrief(root, localBrief, { run, receiptDir: join(root, "receipts"), now: new Date("2026-07-11T00:00:00Z") });
    expect(result.checks).toEqual(expect.arrayContaining([{ name: "video-stream", ok: true }, { name: "nonblank-frame", ok: true }]));
    expect(JSON.parse(await readFile(result.receiptPath, "utf8"))).toMatchObject({ provider: "ffmpeg-local", verified: true, output: join(root, "launch.mp4") });
  });
});
