import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { resolveVantaHome } from "../store/home.js";

export const LEADERSHIP_WORK_KINDS = ["issue", "plan", "approval", "decision"] as const;
export type LeadershipWorkKind = (typeof LEADERSHIP_WORK_KINDS)[number];

export const LeadershipWorkObjectSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(LEADERSHIP_WORK_KINDS),
  title: z.string().min(1),
  detail: z.string().min(1),
  sourceMessage: z.string().min(1),
  status: z.enum(["open", "approved", "decided"]).default("open"),
  createdAt: z.string().min(1),
});
export type LeadershipWorkObject = z.infer<typeof LeadershipWorkObjectSchema>;

export type LeadershipChatResult = {
  reply: string;
  objects: LeadershipWorkObject[];
};

const StoreSchema = z.object({
  version: z.literal(1).default(1),
  objects: z.array(z.unknown()).default([]),
});

export type LeadershipWorkStoreFs = {
  readFile: (path: string) => Promise<string>;
  writeFile: (path: string, data: string) => Promise<void>;
  mkdir: (path: string) => Promise<void>;
};

const realFs: LeadershipWorkStoreFs = {
  readFile: (p) => readFile(p, "utf8"),
  writeFile: (p, d) => writeFile(p, d, "utf8"),
  mkdir: async (p) => void (await mkdir(p, { recursive: true })),
};

export function leadershipWorkPath(env: NodeJS.ProcessEnv = process.env): string {
  return join(resolveVantaHome(env), "leadership-work.json");
}

export async function readLeadershipWork(
  env: NodeJS.ProcessEnv = process.env,
  fs: LeadershipWorkStoreFs = realFs,
): Promise<LeadershipWorkObject[]> {
  let raw: string;
  try {
    raw = await fs.readFile(leadershipWorkPath(env));
  } catch {
    return [];
  }
  let parsed: z.infer<typeof StoreSchema>;
  try {
    parsed = StoreSchema.parse(JSON.parse(raw));
  } catch {
    return [];
  }
  const out: LeadershipWorkObject[] = [];
  for (const row of parsed.objects) {
    const ok = LeadershipWorkObjectSchema.safeParse(row);
    if (ok.success) out.push(ok.data);
  }
  return out;
}

export async function writeLeadershipWork(
  objects: LeadershipWorkObject[],
  env: NodeJS.ProcessEnv = process.env,
  fs: LeadershipWorkStoreFs = realFs,
): Promise<void> {
  await fs.mkdir(resolveVantaHome(env));
  await fs.writeFile(leadershipWorkPath(env), `${JSON.stringify({ version: 1, objects }, null, 2)}\n`);
}

export function resolveLeadershipMessage(
  message: string,
  existing: LeadershipWorkObject[] = [],
  now: Date = new Date(),
): LeadershipChatResult {
  const source = message.trim();
  if (!source) return { reply: "Say what you want the lead agent to turn into work.", objects: [] };

  const kinds = classifyKinds(source);
  const createdAt = now.toISOString();
  const objects: LeadershipWorkObject[] = [];
  for (const kind of kinds) {
    objects.push(makeObject(kind, source, [...existing, ...objects], createdAt));
  }
  const noun = objects.length === 1 ? "object" : "objects";
  return {
    reply: `Created ${objects.length} tracked work ${noun}: ${objects.map((o) => o.id).join(", ")}`,
    objects,
  };
}

export async function recordLeadershipMessage(
  message: string,
  env: NodeJS.ProcessEnv = process.env,
  fs: LeadershipWorkStoreFs = realFs,
  now: Date = new Date(),
): Promise<LeadershipChatResult> {
  const existing = await readLeadershipWork(env, fs);
  const result = resolveLeadershipMessage(message, existing, now);
  if (result.objects.length > 0) await writeLeadershipWork([...existing, ...result.objects], env, fs);
  return result;
}

export function formatLeadershipWorkObject(object: LeadershipWorkObject): string {
  return `${object.id} · ${object.kind} · ${object.status}\n  ${object.title}`;
}

function classifyKinds(message: string): LeadershipWorkKind[] {
  const text = message.toLowerCase();
  const kinds: LeadershipWorkKind[] = [];
  if (/\b(approve|approval|permission|greenlight|go-ahead|sign off|sign-off)\b/.test(text)) kinds.push("approval");
  if (/\b(plan|strategy|roadmap|spec|proposal|outline)\b/.test(text)) kinds.push("plan");
  if (/\b(decide|decision|choose|picked|call is|tradeoff|trade-off)\b/.test(text)) kinds.push("decision");
  if (/\b(issue|bug|task|todo|follow up|fix|ship|build|implement)\b/.test(text)) kinds.push("issue");
  return kinds.length > 0 ? dedupe(kinds) : ["issue"];
}

function makeObject(
  kind: LeadershipWorkKind,
  sourceMessage: string,
  existing: LeadershipWorkObject[],
  createdAt: string,
): LeadershipWorkObject {
  const id = nextId(kind, existing);
  return {
    id,
    kind,
    title: titleFor(kind, sourceMessage),
    detail: sourceMessage,
    sourceMessage,
    status: kind === "decision" ? "decided" : "open",
    createdAt,
  };
}

function nextId(kind: LeadershipWorkKind, existing: LeadershipWorkObject[]): string {
  const prefix = `lead-${kind}`;
  const taken = new Set(existing.map((o) => o.id));
  let n = 1;
  while (taken.has(`${prefix}-${n}`)) n += 1;
  return `${prefix}-${n}`;
}

function titleFor(kind: LeadershipWorkKind, source: string): string {
  const clipped = source.replace(/\s+/g, " ").slice(0, 96);
  const prefix: Record<LeadershipWorkKind, string> = {
    issue: "Issue",
    plan: "Plan",
    approval: "Approval",
    decision: "Decision",
  };
  return `${prefix[kind]}: ${clipped}`;
}

function dedupe<T>(values: T[]): T[] {
  return [...new Set(values)];
}
