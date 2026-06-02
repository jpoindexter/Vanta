import { z } from "zod";
import type { Tool } from "./types.js";
import type { ImageAttachment } from "../types.js";
import { resolveProvider } from "../providers/index.js";

// Video understanding: extract evenly-sampled frames with ffmpeg and send them as
// native images to the ACTIVE vision model. v1 samples ~1 fps up to `frames`
// frames (best for short clips); needs ffmpeg on PATH.

const Args = z.object({
  path: z.string().min(1),
  prompt: z.string().optional(),
  frames: z.number().int().min(1).max(8).optional(),
});
const DEFAULT_PROMPT = "These are sampled frames from a video, in order. Describe what happens.";

export const watchVideoTool: Tool = {
  schema: {
    name: "watch_video",
    description:
      "Watch a video: sample frames with ffmpeg and describe them with the active vision model. " +
      "Args: path (video file), prompt (optional), frames (1-8, default 4).",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Path to a video file" },
        prompt: { type: "string", description: "What to look for (optional)" },
        frames: { type: "integer", minimum: 1, maximum: 8, description: "How many frames to sample (default 4)" },
      },
      required: ["path"],
    },
  },
  describeForSafety: (a) => `watch video ${String(a.path ?? "")}`,
  async execute(raw) {
    const parsed = Args.safeParse(raw);
    if (!parsed.success) return { ok: false, output: 'watch_video needs a "path" string' };
    const { path, prompt, frames = 4 } = parsed.data;

    let provider;
    try {
      provider = resolveProvider(process.env);
    } catch (err) {
      return { ok: false, output: `watch_video needs a model: ${(err as Error).message}` };
    }
    try {
      const { tmpdir, homedir } = await import("node:os");
      const { join } = await import("node:path");
      const { execFile } = await import("node:child_process");
      const { promisify } = await import("node:util");
      const { mkdtemp, readdir, readFile, rm } = await import("node:fs/promises");

      const abs = path.startsWith("~") ? join(homedir(), path.slice(1)) : path;
      const dir = await mkdtemp(join(tmpdir(), "argo-video-"));
      try {
        // ~1 fps sampling, capped at `frames` — robust without probing duration.
        await promisify(execFile)("ffmpeg", ["-i", abs, "-vf", "fps=1", "-frames:v", String(frames), "-y", join(dir, "f%03d.png")]);
        const files = (await readdir(dir)).filter((f) => f.endsWith(".png")).sort();
        const images: ImageAttachment[] = [];
        for (const f of files.slice(0, frames)) {
          images.push({ mime: "image/png", dataBase64: (await readFile(join(dir, f))).toString("base64") });
        }
        if (!images.length) return { ok: false, output: "no frames extracted (is the path a valid video?)" };
        const result = await provider.complete([{ role: "user", content: prompt ?? DEFAULT_PROMPT, images }], []);
        return result.text?.trim()
          ? { ok: true, output: result.text.trim() }
          : { ok: false, output: "vision model returned no description (is the active model vision-capable?)" };
      } finally {
        await rm(dir, { recursive: true, force: true }).catch(() => {});
      }
    } catch (err) {
      const msg = (err as Error).message;
      return { ok: false, output: /ENOENT|ffmpeg/i.test(msg) ? "watch_video needs ffmpeg on PATH (brew install ffmpeg)" : `watch_video failed: ${msg}` };
    }
  },
};
