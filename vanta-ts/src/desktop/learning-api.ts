import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { listSkills } from "../skills/store.js";
import { memoriesDir } from "../store/home.js";
import { type ControlCtx, type ControlTable, sendFail } from "./control-http.js";
import { sendJson } from "./handler-http.js";
import { skillRows } from "./skills-api.js";

// The Memory Graph view reads what the agent has learned: skills as graph nodes, memories as cards.
// Read-only: editing or archiving a node is not served yet, so the view says so instead of failing silently.
// Skill nodes carry the time of their last change so the "core = oldest" layout can place them.

const env = (ctx: ControlCtx): NodeJS.ProcessEnv => ctx.state._env ?? process.env;
const MEMORY_FILE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,120}\.md$/;
const TITLE_CHARS = 60;

type MemoryCard = { source: "memory"; timestamp: number | null; title: string; body: string; fingerprint: string };

const firstLine = (text: string): string => (text.split("\n").find((line) => line.trim()) ?? "").replace(/^#+\s*/, "").trim().slice(0, TITLE_CHARS);

async function memoryCards(e: NodeJS.ProcessEnv): Promise<MemoryCard[]> {
  const dir = memoriesDir(e);
  const names = (await readdir(dir).catch(() => [] as string[])).filter((name) => MEMORY_FILE.test(name)).sort();
  const cards = await Promise.all(names.map(async (name) => {
    const [body, info] = await Promise.all([readFile(join(dir, name), "utf8").catch(() => ""), stat(join(dir, name)).catch(() => null)]);
    return { source: "memory" as const, timestamp: info ? Math.round(info.mtimeMs / 1000) : null, title: firstLine(body) || name, body, fingerprint: name };
  }));
  return cards.filter((card) => card.body.trim());
}

/** When each skill was last changed, in seconds: its own `updated` stamp, else `created`. The view places older skills nearer the core. */
async function skillTimes(e: NodeJS.ProcessEnv): Promise<Map<string, number>> {
  const times = new Map<string, number>();
  for (const skill of await listSkills(e).catch(() => [])) {
    const ms = Date.parse(skill.meta.updated) || Date.parse(skill.meta.created);
    if (Number.isFinite(ms)) times.set(skill.meta.name, Math.round(ms / 1000));
  }
  return times;
}

async function graph(ctx: ControlCtx): Promise<void> {
  const skills = await skillRows(ctx);
  const times = await skillTimes(env(ctx));
  const cards = await memoryCards(env(ctx));
  const clusters = new Map<string, number>();
  for (const skill of skills) clusters.set(skill.category, (clusters.get(skill.category) ?? 0) + 1);
  sendJson(ctx.res, 200, {
    nodes: skills.map((skill) => ({
      id: `skill:${skill.name}`, label: skill.name, kind: "skill", category: skill.category, useCount: skill.usage,
      state: skill.enabled ? "active" : "disabled", createdBy: skill.provenance === "agent" ? "agent" : null, pinned: false, timestamp: times.get(skill.name) ?? null,
    })),
    edges: [],
    clusters: [...clusters].map(([category, count]) => ({ category, count })),
    memory: cards,
    stats: { skills: skills.length, memories: cards.length, learned: skills.filter((skill) => skill.provenance === "agent").length },
  });
}

async function node(ctx: ControlCtx): Promise<void> {
  const raw = new URL(ctx.req.url ?? "", "http://127.0.0.1").searchParams.get("id") ?? "";
  // The Skills tab asks for a bare skill name; the graph asks for skill:<name>. Memories are always memory:<file>.md.
  const id = raw.startsWith("memory:") || raw.startsWith("skill:") || !raw.trim() ? raw : `skill:${raw.trim()}`;
  if (id.startsWith("skill:")) {
    const skill = (await listSkills(env(ctx))).find((entry) => entry.meta.name === id.slice("skill:".length));
    if (!skill) return sendFail(ctx.res, 404, `skill not found: ${id.slice(6)}`);
    return sendJson(ctx.res, 200, { ok: true, kind: "skill", label: skill.meta.name, content: skill.body });
  }
  const file = id.startsWith("memory:") ? id.slice("memory:".length) : "";
  if (!MEMORY_FILE.test(file)) return sendFail(ctx.res, 400, "id must be skill:<name> or memory:<file>.md");
  const content = await readFile(join(memoriesDir(env(ctx)), file), "utf8").catch(() => null);
  if (content === null) return sendFail(ctx.res, 404, `memory not found: ${file}`);
  sendJson(ctx.res, 200, { ok: true, kind: "memory", label: firstLine(content) || file, content });
}

export const learningGet: ControlTable = { "/api/learning/graph": graph, "/api/learning/node": node };
