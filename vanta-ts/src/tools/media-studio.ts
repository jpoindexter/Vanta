import { join, relative } from "node:path";
import { z } from "zod";
import { MediaBriefSchema, previewMediaBrief, renderMediaBrief } from "../media-studio/studio.js";
import type { Tool } from "./types.js";

const Args = z.object({ action: z.enum(["preview", "render"]), brief: MediaBriefSchema });

function formatPreview(brief: z.infer<typeof MediaBriefSchema>): string {
  const preview = previewMediaBrief(brief);
  return [`${preview.title} -> ${preview.output}`, `${preview.duration}s · ${preview.dimensions} · ${preview.fps}fps · $${preview.estimatedCostUsd.toFixed(2)}`, `providers: ${preview.providers.join(", ")}`, ...preview.scenes.map((scene, index) => `${index + 1}. ${scene.title} · ${scene.duration}s · ${scene.source}`)].join("\n");
}

export const mediaStudioTool: Tool = {
  schema: { name: "media_studio", description: "Preview or approval-gated render a scoped local MP4 from bounded color/image scenes. FFmpeg/ffprobe verify duration, dimensions, streams, bytes, and a nonblank frame; receipts retain sources, provider, cost, and checks.", parameters: { type: "object", required: ["action", "brief"], properties: { action: { type: "string", enum: ["preview", "render"] }, brief: { type: "object", description: "Media brief: title, relative .mp4 output, dimensions/fps, and 1-24 color or project-image scenes." } } } },
  describeForSafety: (args) => `${String(args.action)} media studio brief`,
  async execute(raw, ctx) {
    const parsed = Args.safeParse(raw);
    if (!parsed.success) return { ok: false, output: `invalid media brief: ${parsed.error.issues[0]?.message ?? "invalid input"}` };
    const preview = formatPreview(parsed.data.brief);
    if (parsed.data.action === "preview") return { ok: true, output: preview };
    const approved = await ctx.requestApproval(`Render media:\n${preview}`, "runs local FFmpeg and writes the scoped output artifact", "media_studio", { diff: preview });
    if (!approved) return { ok: false, output: "media render denied; no artifact written" };
    try {
      const result = await renderMediaBrief(ctx.root, parsed.data.brief, { receiptDir: join(ctx.root, ".vanta", "media", "receipts") });
      return { ok: true, output: `media verified: ${relative(ctx.root, result.output)}\nreceipt: ${relative(ctx.root, result.receiptPath)}` };
    } catch (error) { return { ok: false, output: `media render failed: ${(error as Error).message}` }; }
  },
};
