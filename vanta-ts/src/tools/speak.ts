import { z } from "zod";
import type { Tool } from "./types.js";
import { resolveTtsProvider } from "../routing/tts.js";
import { synthesize } from "../tts/synth.js";

// Text-to-speech: Vanta speaks aloud. The backend is operator-chosen via
// `vanta setup tts` (VANTA_TTS_PROVIDER): edge (keyless neural, default) ·
// openai · elevenlabs · local macOS `say`. The provider is resolved per call
// from env (routing/tts.ts) so a config change takes effect without a restart;
// a key-based provider missing its key reports the fix instead of failing live.
// (STT / audio-file understanding live in `transcribe`.)

const Args = z.object({ text: z.string().min(1), voice: z.string().optional() });

export const speakTool: Tool = {
  schema: {
    name: "speak",
    description: "Speak text aloud via text-to-speech. Backend is set by `vanta setup tts` (edge keyless default, openai, elevenlabs, or local). Use when the user asks for a spoken reply.",
    parameters: {
      type: "object",
      properties: {
        text: { type: "string", description: "What to say" },
        voice: { type: "string", description: "Optional voice id, overriding the configured VANTA_TTS_VOICE for this call" },
      },
      required: ["text"],
    },
  },
  describeForSafety: () => "speak text aloud",
  async execute(raw) {
    const p = Args.safeParse(raw);
    if (!p.success) return { ok: false, output: 'speak needs a "text" string' };
    const resolved = resolveTtsProvider(process.env);
    if (!resolved.ready) {
      return {
        ok: false,
        output: `TTS provider "${resolved.provider.id}" needs ${resolved.missingKey}. Set it (or run \`vanta setup tts\`), or pick the keyless edge/local backend.`,
      };
    }
    const voice = p.data.voice ?? resolved.voice;
    return synthesize(p.data.text, { ...resolved, voice }, process.env);
  },
};
