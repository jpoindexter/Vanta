import { z } from "zod";
import type { Tool } from "./types.js";
import {
  readXiaohongshuComments,
  readXiaohongshuFeed,
  readXiaohongshuNote,
  searchXiaohongshu,
} from "../reach/xiaohongshu.js";

const Args = z.object({
  action: z.enum(["search", "note", "comments", "feed"]),
  query: z.string().optional(),
  url: z.string().optional(),
  noteId: z.string().optional(),
});

type ArgsData = z.infer<typeof Args>;

function out(r: Awaited<ReturnType<typeof searchXiaohongshu>>) {
  return r.ok ? { ok: true, output: r.output } : { ok: false, output: `${r.error}${r.fix ? `\nfix: ${r.fix}` : ""}` };
}

async function executeRead(a: ArgsData) {
  if (a.action === "search") {
    if (!a.query) return { ok: false, output: "xiaohongshu_read search needs query" };
    return out(await searchXiaohongshu(a.query));
  }
  if (a.action === "feed") return out(await readXiaohongshuFeed());
  const target = a.noteId ?? a.url;
  if (!target) return { ok: false, output: `xiaohongshu_read ${a.action} needs url or noteId` };
  return out(a.action === "note" ? await readXiaohongshuNote(target) : await readXiaohongshuComments(target));
}

export const xiaohongshuReadTool: Tool = {
  schema: {
    name: "xiaohongshu_read",
    description:
      "Read Xiaohongshu through a configured logged-in OpenCLI backend. " +
      "Actions: search {query}, note {url|noteId}, comments {url|noteId}, feed {}.",
    parameters: {
      type: "object",
      required: ["action"],
      properties: {
        action: { type: "string", enum: ["search", "note", "comments", "feed"] },
        query: { type: "string", description: "search query for action=search" },
        url: { type: "string", description: "Xiaohongshu note URL for action=note|comments" },
        noteId: { type: "string", description: "Xiaohongshu note id for action=note|comments" },
      },
    },
  },
  describeForSafety: (a) => `read xiaohongshu ${String(a.action ?? "")}`,
  async execute(raw) {
    const parsed = Args.safeParse(raw);
    if (!parsed.success) return { ok: false, output: 'xiaohongshu_read needs an "action" (search|note|comments|feed)' };
    return executeRead(parsed.data);
  },
};
