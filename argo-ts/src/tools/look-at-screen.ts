import { z } from "zod";
import type { Tool } from "./types.js";

// Argo's "eyes": capture the user's screen and describe it with a vision model.
// Unlike describe_image (root-scoped file), this captures to a temp file Argo
// owns and sends it straight to the vision model — so it works regardless of the
// filesystem scope. macOS only (screencapture); needs Screen Recording permission.

const Args = z.object({ prompt: z.string().optional() });
const DEFAULT_PROMPT = "Describe what is currently on the screen, including any visible text and UI state.";
const DEFAULT_MODEL = "gpt-4o-mini";

export const lookAtScreenTool: Tool = {
  schema: {
    name: "look_at_screen",
    description:
      "Capture the user's current screen and describe it with a vision model — Argo's eyes. Use to see " +
      "what the user is looking at, read on-screen content, or check the state of an app or UI.",
    parameters: {
      type: "object",
      properties: {
        prompt: { type: "string", description: "What to look for (defaults to a general description)" },
      },
    },
  },
  describeForSafety: () => "capture and analyze the screen",
  async execute(raw) {
    const parsed = Args.safeParse(raw);
    const prompt = parsed.success ? parsed.data.prompt : undefined;
    const key = process.env.OPENAI_API_KEY;
    if (!key) return { ok: false, output: "OPENAI_API_KEY required for look_at_screen (vision)" };
    try {
      const { tmpdir } = await import("node:os");
      const { join } = await import("node:path");
      const { execFile } = await import("node:child_process");
      const { promisify } = await import("node:util");
      const { readFile, rm } = await import("node:fs/promises");

      const tmp = join(tmpdir(), `argo-screen-${process.pid}-${Date.now()}.png`);
      await promisify(execFile)("screencapture", ["-x", tmp]); // -x = silent
      const buf = await readFile(tmp).catch(() => Buffer.alloc(0));
      await rm(tmp, { force: true }).catch(() => {});
      if (!buf.length) {
        return { ok: false, output: "screen capture failed (macOS only; grant Screen Recording permission to the terminal)" };
      }

      const { default: OpenAI } = await import("openai");
      const client = new OpenAI({ apiKey: key });
      const model = process.env.ARGO_VISION_MODEL ?? DEFAULT_MODEL;
      const res = await client.chat.completions.create({
        model,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt ?? DEFAULT_PROMPT },
              { type: "image_url", image_url: { url: `data:image/png;base64,${buf.toString("base64")}` } },
            ],
          },
        ],
      });
      const text = res.choices[0]?.message?.content?.trim();
      return text ? { ok: true, output: text } : { ok: false, output: "vision model returned no description" };
    } catch (err) {
      return { ok: false, output: `look_at_screen failed: ${(err as Error).message}` };
    }
  },
};
