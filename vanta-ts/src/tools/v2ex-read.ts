import { z } from "zod";
import type { Tool, ToolResult } from "./types.js";
import {
  v2exHot,
  v2exLatest,
  v2exMember,
  v2exNodeTopics,
  v2exReplies,
  v2exTopic,
  type V2exReply,
  type V2exTopic,
} from "../reach/v2ex.js";

const Args = z.object({
  action: z.enum(["hot", "latest", "node", "topic", "replies", "member"]),
  node: z.string().optional(),
  topicId: z.number().int().positive().optional(),
  username: z.string().optional(),
  limit: z.number().int().min(1).max(50).optional(),
});

const DEFAULT_LIMIT = 10;

function when(unix: number | null | undefined): string {
  return unix ? new Date(unix * 1000).toISOString().slice(0, 10) : "";
}

function plain(text: string | null | undefined): string {
  return (text ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function topicUrl(topic: V2exTopic): string {
  return topic.url ?? `https://www.v2ex.com/t/${topic.id}`;
}

function formatTopics(label: string, topics: V2exTopic[], limit: number): string {
  const shown = topics.slice(0, limit);
  if (shown.length === 0) return `${label}: no topics found`;
  const rows = shown.map((topic, index) => {
    const node = topic.node?.name ? `/${topic.node.name}` : "";
    const author = topic.member?.username ? ` · @${topic.member.username}` : "";
    const replies = topic.replies !== undefined ? ` · ${topic.replies} repl${topic.replies === 1 ? "y" : "ies"}` : "";
    const date = when(topic.created);
    const meta = [node, date].filter(Boolean).join(" · ");
    return `${index + 1}. ${topic.title}${author}${replies}\n   ${topicUrl(topic)}${meta ? `\n   ${meta}` : ""}`;
  });
  return [`${label} — ${shown.length} topic(s)`, ...rows].join("\n");
}

function formatReplies(topicId: number, replies: V2exReply[], limit: number): string {
  const shown = replies.slice(0, limit);
  if (shown.length === 0) return `V2EX topic ${topicId}: no replies found`;
  const rows = shown.map((reply, index) => {
    const author = reply.member?.username ? `@${reply.member.username}` : "unknown";
    const date = when(reply.created);
    const body = plain(reply.content_rendered || reply.content).slice(0, 280);
    return `${index + 1}. ${author}${date ? ` · ${date}` : ""}\n   ${body}`;
  });
  return [`V2EX topic ${topicId} replies — ${shown.length}`, ...rows].join("\n");
}

async function executeRead(args: z.infer<typeof Args>): Promise<ToolResult> {
  const limit = args.limit ?? DEFAULT_LIMIT;
  if (args.action === "hot") {
    const r = await v2exHot();
    return r.ok ? { ok: true, output: formatTopics("V2EX hot", r.topics, limit) } : { ok: false, output: `v2ex_read failed: ${r.error}` };
  }
  if (args.action === "latest") {
    const r = await v2exLatest();
    return r.ok ? { ok: true, output: formatTopics("V2EX latest", r.topics, limit) } : { ok: false, output: `v2ex_read failed: ${r.error}` };
  }
  if (args.action === "node") {
    if (!args.node) return { ok: false, output: "v2ex_read node needs node" };
    const r = await v2exNodeTopics(args.node);
    return r.ok ? { ok: true, output: formatTopics(`V2EX /${args.node}`, r.topics, limit) } : { ok: false, output: `v2ex_read failed: ${r.error}` };
  }
  if (args.action === "topic") {
    if (!args.topicId) return { ok: false, output: "v2ex_read topic needs topicId" };
    const r = await v2exTopic(args.topicId);
    return r.ok ? { ok: true, output: formatTopics(`V2EX topic ${args.topicId}`, r.topic ? [r.topic] : [], 1) } : { ok: false, output: `v2ex_read failed: ${r.error}` };
  }
  if (args.action === "replies") {
    if (!args.topicId) return { ok: false, output: "v2ex_read replies needs topicId" };
    const r = await v2exReplies(args.topicId);
    return r.ok ? { ok: true, output: formatReplies(args.topicId, r.replies, limit) } : { ok: false, output: `v2ex_read failed: ${r.error}` };
  }
  if (!args.username) return { ok: false, output: "v2ex_read member needs username" };
  const r = await v2exMember(args.username);
  if (!r.ok) return { ok: false, output: `v2ex_read failed: ${r.error}` };
  if (!r.member) return { ok: true, output: `V2EX member ${args.username}: not found` };
  const bits = [
    `V2EX member ${r.member.username ?? args.username}`,
    r.member.tagline,
    r.member.location ? `location: ${r.member.location}` : "",
    r.member.github ? `github: ${r.member.github}` : "",
    r.member.website ? `website: ${r.member.website}` : "",
    r.member.url,
  ].filter(Boolean);
  return { ok: true, output: bits.join("\n") };
}

export const v2exReadTool: Tool = {
  schema: {
    name: "v2ex_read",
    description:
      "Read V2EX public community data with no auth. Actions: hot, latest, node {node}, topic {topicId}, replies {topicId}, member {username}.",
    parameters: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["hot", "latest", "node", "topic", "replies", "member"] },
        node: { type: "string", description: "V2EX node name for action=node, e.g. python" },
        topicId: { type: "integer", minimum: 1, description: "V2EX topic id for action=topic|replies" },
        username: { type: "string", description: "V2EX username for action=member" },
        limit: { type: "integer", minimum: 1, maximum: 50, description: "Max topics/replies (default 10)" },
      },
      required: ["action"],
    },
  },
  describeForSafety: (a) => `read v2ex ${String(a.action ?? "")}`,
  async execute(raw) {
    const parsed = Args.safeParse(raw);
    if (!parsed.success) return { ok: false, output: 'v2ex_read needs an "action" (hot|latest|node|topic|replies|member)' };
    return executeRead(parsed.data);
  },
};
