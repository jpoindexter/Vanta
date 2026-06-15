import { z } from "zod";
import type { Tool } from "./types.js";
import { fetchYouTubeInfo, fetchYouTubeSubtitles, type YouTubeInfo } from "../reach/youtube.js";

const Args = z.object({
  url: z.string().url(),
  mode: z.enum(["info", "subtitles", "both"]).optional(),
});

function formatInfo(info: YouTubeInfo): string {
  const dur = info.duration != null ? `${Math.floor(info.duration / 60)}m${info.duration % 60}s` : "";
  return [
    `# ${info.title}`,
    info.channel ? `Channel: ${info.channel}` : "",
    dur ? `Duration: ${dur}` : "",
    info.uploadDate ? `Uploaded: ${info.uploadDate}` : "",
    info.viewCount != null ? `Views: ${info.viewCount.toLocaleString()}` : "",
    "",
    info.description ?? "",
  ]
    .filter(Boolean)
    .join("\n");
}

export const youtubeReadTool: Tool = {
  schema: {
    name: "youtube_read",
    description:
      "Extract info and/or subtitles from a YouTube video via yt-dlp. " +
      "mode=info returns title/description/metadata; mode=subtitles returns the caption text; " +
      "mode=both (default) returns everything available. Zero-config if yt-dlp is installed.",
    parameters: {
      type: "object",
      required: ["url"],
      properties: {
        url: { type: "string", description: "YouTube URL (youtube.com/watch?v=... or youtu.be/...)" },
        mode: {
          type: "string",
          enum: ["info", "subtitles", "both"],
          description: "What to extract — both is default",
        },
      },
    },
  },
  describeForSafety: (a) => `read youtube video: ${String(a["url"] ?? "")}`,
  async execute(raw) {
    const parsed = Args.safeParse(raw);
    if (!parsed.success) return { ok: false, output: 'youtube_read needs a valid "url"' };
    const { url, mode = "both" } = parsed.data;

    const parts: string[] = [];

    if (mode === "info" || mode === "both") {
      const r = await fetchYouTubeInfo(url);
      if (!r.ok) return { ok: false, output: `youtube_read: ${r.error}` };
      parts.push(formatInfo(r.info));
    }

    if (mode === "subtitles" || mode === "both") {
      const r = await fetchYouTubeSubtitles(url);
      if (r.ok) {
        parts.push(`## Transcript\n\n${r.subtitles}`);
      } else if (mode === "subtitles") {
        return { ok: false, output: `youtube_read subtitles: ${r.error}` };
      }
      // mode=both: subtitles are best-effort, skip silently if unavailable
    }

    return { ok: true, output: parts.join("\n\n") || "no content extracted" };
  },
};
