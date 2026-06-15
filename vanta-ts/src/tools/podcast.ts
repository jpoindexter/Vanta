import { z } from "zod";
import type { Tool } from "./types.js";
import { transcribePodcastUrl } from "../reach/podcast.js";

const Args = z.object({
  url: z.string().url(),
});

export const podcastReadTool: Tool = {
  schema: {
    name: "podcast_read",
    description:
      "Transcribe a podcast episode or audio file via Groq Whisper (whisper-large-v3). " +
      "Pass a direct audio URL (.mp3/.m4a etc.). Requires GROQ_API_KEY (free at console.groq.com). " +
      "Audio must be ≤24 MB.",
    parameters: {
      type: "object",
      required: ["url"],
      properties: {
        url: { type: "string", description: "Direct audio URL (.mp3, .m4a, .ogg, .wav, etc.)" },
      },
    },
  },
  describeForSafety: (a) => `transcribe podcast audio: ${String(a["url"] ?? "")}`,
  async execute(raw) {
    const parsed = Args.safeParse(raw);
    if (!parsed.success) return { ok: false, output: 'podcast_read needs a valid "url"' };
    const { url } = parsed.data;
    const r = await transcribePodcastUrl(url);
    if (!r.ok) return { ok: false, output: `podcast_read: ${r.error}` };
    return { ok: true, output: r.transcript };
  },
};
