import { z } from "zod";
import type { Tool } from "./types.js";
import { resolveProvider } from "../providers/index.js";

// Camera eyes: capture a webcam frame and describe it with the active vision
// model. macOS via `imagesnap` (brew install imagesnap). Mirrors look_at_screen.

const Args = z.object({ prompt: z.string().optional() });
const DEFAULT_PROMPT = "Describe what the camera sees.";

export const lookAtCameraTool: Tool = {
  schema: {
    name: "look_at_camera",
    description: "Capture a frame from the webcam and describe it with the active vision model (macOS, needs imagesnap).",
    parameters: {
      type: "object",
      properties: { prompt: { type: "string", description: "What to look for (optional)" } },
    },
  },
  describeForSafety: () => "capture and analyze a camera frame",
  async execute(raw) {
    const parsed = Args.safeParse(raw);
    const prompt = parsed.success ? parsed.data.prompt : undefined;
    let provider;
    try {
      provider = resolveProvider(process.env);
    } catch (err) {
      return { ok: false, output: `look_at_camera needs a model: ${(err as Error).message}` };
    }
    try {
      const { tmpdir } = await import("node:os");
      const { join } = await import("node:path");
      const { execFile } = await import("node:child_process");
      const { promisify } = await import("node:util");
      const { readFile, rm } = await import("node:fs/promises");

      const tmp = join(tmpdir(), `argo-cam-${process.pid}-${Date.now()}.jpg`);
      await promisify(execFile)("imagesnap", ["-q", tmp]);
      const buf = await readFile(tmp).catch(() => Buffer.alloc(0));
      await rm(tmp, { force: true }).catch(() => {});
      if (!buf.length) return { ok: false, output: "camera capture failed (needs macOS + imagesnap; grant Camera permission)" };

      const result = await provider.complete(
        [{ role: "user", content: prompt ?? DEFAULT_PROMPT, images: [{ mime: "image/jpeg", dataBase64: buf.toString("base64") }] }],
        [],
      );
      return result.text?.trim()
        ? { ok: true, output: result.text.trim() }
        : { ok: false, output: "vision model returned no description (is the active model vision-capable?)" };
    } catch (err) {
      const msg = (err as Error).message;
      return { ok: false, output: /ENOENT|imagesnap/i.test(msg) ? "look_at_camera needs imagesnap (brew install imagesnap)" : `look_at_camera failed: ${msg}` };
    }
  },
};
