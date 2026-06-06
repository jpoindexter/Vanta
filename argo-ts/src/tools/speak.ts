import { z } from "zod";
import type { Tool } from "./types.js";

// Text-to-speech: Vanta speaks aloud via the macOS `say` command. (STT / audio-file
// understanding need whisper or provider audio input — tracked separately.)

const Args = z.object({ text: z.string().min(1), voice: z.string().optional() });

export const speakTool: Tool = {
  schema: {
    name: "speak",
    description: "Speak text aloud via text-to-speech (macOS `say`). Use when the user asks for a spoken reply.",
    parameters: {
      type: "object",
      properties: {
        text: { type: "string", description: "What to say" },
        voice: { type: "string", description: "Optional macOS voice name (e.g. Samantha)" },
      },
      required: ["text"],
    },
  },
  describeForSafety: () => "speak text aloud",
  async execute(raw) {
    const p = Args.safeParse(raw);
    if (!p.success) return { ok: false, output: 'speak needs a "text" string' };
    try {
      const { execFile } = await import("node:child_process");
      const { promisify } = await import("node:util");
      const args = p.data.voice ? ["-v", p.data.voice, p.data.text] : [p.data.text];
      await promisify(execFile)("say", args);
      return { ok: true, output: `spoke ${p.data.text.length} chars` };
    } catch (err) {
      return { ok: false, output: `speak failed (needs macOS 'say'): ${(err as Error).message}` };
    }
  },
};
