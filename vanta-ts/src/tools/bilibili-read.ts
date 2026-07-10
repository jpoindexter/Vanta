import { z } from "zod";
import type { Tool } from "./types.js";
import { readBilibiliSubtitles, readBilibiliVideo, searchBilibili } from "../reach/bilibili.js";

const Args = z.object({
  action: z.enum(["search", "video", "subtitles"]),
  query: z.string().optional(),
  url: z.string().optional(),
  bvid: z.string().optional(),
  limit: z.number().int().min(1).max(20).optional(),
});

type ArgsData = z.infer<typeof Args>;

function output(r: Awaited<ReturnType<typeof searchBilibili>>) {
  return r.ok ? { ok: true, output: r.output } : { ok: false, output: `${r.error}${r.fix ? `\nfix: ${r.fix}` : ""}` };
}

async function executeRead(a: ArgsData) {
  if (a.action === "search") {
    if (!a.query) return { ok: false, output: "bilibili_read search needs query" };
    return output(await searchBilibili(a.query, a.limit ?? 5));
  }
  const id = a.bvid ?? a.url;
  if (!id) return { ok: false, output: `bilibili_read ${a.action} needs url or bvid` };
  const r = a.action === "video" ? await readBilibiliVideo(id) : await readBilibiliSubtitles(id);
  return output(r);
}

export const bilibiliReadTool: Tool = {
  schema: {
    name: "bilibili_read",
    description:
      "Search Bilibili videos and read video detail through bili-cli when installed, with Bilibili's public search API as a search-only fallback. " +
      "Subtitles use OpenCLI when configured. Actions: search {query, limit?}, video {url|bvid}, subtitles {url|bvid}.",
    parameters: {
      type: "object",
      required: ["action"],
      properties: {
        action: { type: "string", enum: ["search", "video", "subtitles"] },
        query: { type: "string", description: "search query for action=search" },
        url: { type: "string", description: "Bilibili video URL for action=video|subtitles" },
        bvid: { type: "string", description: "Bilibili BV id for action=video|subtitles" },
        limit: { type: "integer", minimum: 1, maximum: 20, description: "search result limit, default 5" },
      },
    },
  },
  describeForSafety: (a) => `read bilibili ${String(a.action ?? "")}`,
  async execute(raw) {
    const parsed = Args.safeParse(raw);
    if (!parsed.success) return { ok: false, output: 'bilibili_read needs an "action" (search|video|subtitles)' };
    return executeRead(parsed.data);
  },
};
