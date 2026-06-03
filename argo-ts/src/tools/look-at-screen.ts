import { z } from "zod";
import type { Tool } from "./types.js";
import { resolveProvider } from "../providers/index.js";

// Argo's "eyes": capture the user's screen and describe it with the ACTIVE vision
// model (Gemini/Codex/OpenAI — whatever's configured), via the multimodal message
// pipeline. Captures to a temp file Argo owns, so it works regardless of the
// filesystem scope. macOS only (screencapture); needs Screen Recording permission.

const Args = z.object({ prompt: z.string().optional() });
const DEFAULT_PROMPT = "Describe what is currently on the screen, including any visible text and UI state.";

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
    // Resolve the vision provider FIRST — fail fast without capturing the screen
    // if no backend is configured.
    let provider;
    try {
      provider = resolveProvider(process.env);
    } catch (err) {
      return { ok: false, output: `look_at_screen needs a model: ${(err as Error).message}` };
    }
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

      // Use the ACTIVE provider's vision (Gemini/Codex/OpenAI) via the multimodal pipeline.
      const result = await provider.complete(
        [{ role: "user", content: prompt ?? DEFAULT_PROMPT, images: [{ mime: "image/png", dataBase64: buf.toString("base64") }] }],
        [],
      );
      return result.text?.trim()
        ? { ok: true, output: result.text.trim() }
        : { ok: false, output: "vision model returned no description (is the active model vision-capable?)" };
    } catch (err) {
      const msg = (err as Error).message;
      if (/could not create image/i.test(msg)) {
        return { ok: false, output: "look_at_screen needs Screen Recording permission — open System Settings → Privacy & Security → Screen Recording and enable your terminal, then try again." };
      }
      return { ok: false, output: `look_at_screen failed: ${msg}` };
    }
  },
};
