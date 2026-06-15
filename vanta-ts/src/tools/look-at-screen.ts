import { z } from "zod";
import type { Tool } from "./types.js";
import { resolveVisionProvider } from "../routing/vision.js";

// Vanta's "eyes": capture the user's screen and describe it with a vision model,
// via the multimodal message pipeline. Vision routes through the dedicated
// auxiliary vision model (VANTA_VISION_MODEL) when set, else the active provider —
// so a text-only main model (DeepSeek, local Ollama) doesn't blind Vanta.
// Captures to a temp file Vanta owns, so it works regardless of the filesystem
// scope. macOS only (screencapture); needs Screen Recording permission.

const Args = z.object({ prompt: z.string().optional() });
const DEFAULT_PROMPT = "Describe what is currently on the screen, including any visible text and UI state.";

export const lookAtScreenTool: Tool = {
  schema: {
    name: "look_at_screen",
    description:
      "Capture the user's current screen and describe it with a vision model — Vanta's eyes. Use to see " +
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
      provider = resolveVisionProvider(process.env);
    } catch (err) {
      return { ok: false, output: `look_at_screen needs a model: ${(err as Error).message}` };
    }
    try {
      const { tmpdir } = await import("node:os");
      const { join } = await import("node:path");
      const { execFile } = await import("node:child_process");
      const { promisify } = await import("node:util");
      const { readFile, rm } = await import("node:fs/promises");

      const tmp = join(tmpdir(), `vanta-screen-${process.pid}-${Date.now()}.png`);
      await promisify(execFile)("screencapture", ["-x", tmp]); // -x = silent
      const buf = await readFile(tmp).catch(() => Buffer.alloc(0));
      await rm(tmp, { force: true }).catch(() => {});
      if (!buf.length) {
        return { ok: false, output: "screen capture failed (macOS only; grant Screen Recording permission to the terminal)" };
      }

      // Route through the auxiliary vision model (VANTA_VISION_MODEL) or the active provider.
      const result = await provider.complete(
        [{ role: "user", content: prompt ?? DEFAULT_PROMPT, images: [{ mime: "image/png", dataBase64: buf.toString("base64") }] }],
        [],
      );
      return result.text?.trim()
        ? { ok: true, output: result.text.trim() }
        : { ok: false, output: "vision model returned no description — the model is not vision-capable. Set VANTA_VISION_MODEL (e.g. gpt-4o-mini) to delegate sight to a dedicated vision model." };
    } catch (err) {
      const msg = (err as Error).message;
      if (/could not create image/i.test(msg)) {
        // macOS won't re-prompt once dismissed — open the exact settings pane instead.
        const { execFile: ef } = await import("node:child_process");
        const { promisify: pf } = await import("node:util");
        await pf(ef)("open", [
          "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture",
        ]).catch(() => {});
        return { ok: false, output: "Screen Recording permission needed — opening System Settings to the right pane now. Toggle on your terminal app, then run look_at_screen again." };
      }
      return { ok: false, output: `look_at_screen failed: ${msg}` };
    }
  },
};
