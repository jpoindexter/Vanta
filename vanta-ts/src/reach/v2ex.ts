import { z } from "zod";

const API = "https://www.v2ex.com/api";
const UA = "vanta-v2ex/1.0";
const FETCH_TIMEOUT_MS = 15_000;

const Member = z.object({
  username: z.string().nullish(),
  url: z.string().nullish(),
  tagline: z.string().nullish(),
  location: z.string().nullish(),
  github: z.string().nullish(),
  website: z.string().nullish(),
});

const NodeInfo = z.object({
  name: z.string().nullish(),
  title: z.string().nullish(),
  url: z.string().nullish(),
});

const Topic = z.object({
  id: z.number(),
  title: z.string(),
  url: z.string().nullish(),
  content: z.string().nullish(),
  content_rendered: z.string().nullish(),
  replies: z.number().nullish(),
  created: z.number().nullish(),
  last_modified: z.number().nullish(),
  member: Member.optional(),
  node: NodeInfo.optional(),
});

const Reply = z.object({
  id: z.number().nullish(),
  content: z.string().nullish(),
  content_rendered: z.string().nullish(),
  created: z.number().nullish(),
  member: Member.optional(),
});

export type V2exTopic = z.infer<typeof Topic>;
export type V2exReply = z.infer<typeof Reply>;
export type V2exMember = z.infer<typeof Member> & { id?: number | null };

type JsonResult = { ok: true; json: unknown } | { ok: false; error: string };

function endpoint(path: string, params: Record<string, string | number | undefined> = {}): string {
  const url = new URL(`${API}/${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }
  return url.href;
}

async function fetchJson(url: string): Promise<JsonResult> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { "user-agent": UA } });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    return { ok: true, json: await res.json() };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  } finally {
    clearTimeout(timer);
  }
}

function parseTopicList(json: unknown): V2exTopic[] {
  const parsed = z.array(Topic).safeParse(json);
  return parsed.success ? parsed.data : [];
}

function parseReplies(json: unknown): V2exReply[] {
  const parsed = z.array(Reply).safeParse(json);
  return parsed.success ? parsed.data : [];
}

export async function v2exHot(): Promise<{ ok: true; topics: V2exTopic[] } | { ok: false; error: string }> {
  const r = await fetchJson(endpoint("topics/hot.json"));
  return r.ok ? { ok: true, topics: parseTopicList(r.json) } : r;
}

export async function v2exLatest(): Promise<{ ok: true; topics: V2exTopic[] } | { ok: false; error: string }> {
  const r = await fetchJson(endpoint("topics/latest.json"));
  return r.ok ? { ok: true, topics: parseTopicList(r.json) } : r;
}

export async function v2exNodeTopics(node: string): Promise<{ ok: true; topics: V2exTopic[] } | { ok: false; error: string }> {
  const r = await fetchJson(endpoint("topics/show.json", { node_name: node }));
  return r.ok ? { ok: true, topics: parseTopicList(r.json) } : r;
}

export async function v2exTopic(id: number): Promise<{ ok: true; topic: V2exTopic | null } | { ok: false; error: string }> {
  const r = await fetchJson(endpoint("topics/show.json", { id }));
  return r.ok ? { ok: true, topic: parseTopicList(r.json)[0] ?? null } : r;
}

export async function v2exReplies(topicId: number): Promise<{ ok: true; replies: V2exReply[] } | { ok: false; error: string }> {
  const r = await fetchJson(endpoint("replies/show.json", { topic_id: topicId }));
  return r.ok ? { ok: true, replies: parseReplies(r.json) } : r;
}

export async function v2exMember(username: string): Promise<{ ok: true; member: V2exMember | null } | { ok: false; error: string }> {
  const r = await fetchJson(endpoint("members/show.json", { username }));
  if (!r.ok) return r;
  const parsed = Member.extend({ id: z.number().nullish() }).safeParse(r.json);
  return { ok: true, member: parsed.success ? parsed.data : null };
}
