import { appendFile, mkdir, readFile, stat } from "node:fs/promises";
import { basename, join, relative, resolve } from "node:path";
import { z } from "zod";

export const CONTEXT_DOCUMENTS = ["VANTA.md", "ARGO.md", "AGENTS.md", "CLAUDE.md", "README.md"] as const;
const EventSchema = z.object({
  version: z.literal(1),
  ts: z.string(),
  kind: z.enum(["loaded", "referenced", "missing", "cycle"]),
  path: z.string().min(1),
  source: z.string().min(1),
});
export type DocRouterEvent = z.infer<typeof EventSchema>;
export type RouterDocument = { path: string; text: string; mtimeMs: number };
export type DocContradiction = { rule: string; positive: string; negative: string };
export type DocRouterReport = {
  documents: Array<{ path: string; loads: number; references: number; ageDays: number }>;
  stale: string[];
  neverConsulted: string[];
  missing: string[];
  contradictions: DocContradiction[];
};

function eventsPath(dataDir: string): string {
  return join(dataDir, "doc-router-events.jsonl");
}

export async function appendDocRouterEvent(
  dataDir: string,
  event: Omit<DocRouterEvent, "version" | "ts">,
  now: Date = new Date(),
): Promise<void> {
  const row = EventSchema.parse({ version: 1, ts: now.toISOString(), ...event });
  await mkdir(dataDir, { recursive: true });
  await appendFile(eventsPath(dataDir), `${JSON.stringify(row)}\n`, "utf8");
}

export async function listDocRouterEvents(dataDir: string): Promise<DocRouterEvent[]> {
  let raw: string;
  try { raw = await readFile(eventsPath(dataDir), "utf8"); } catch { return []; }
  const rows: DocRouterEvent[] = [];
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    try {
      const parsed = EventSchema.safeParse(JSON.parse(line));
      if (parsed.success) rows.push(parsed.data);
    } catch { /* one corrupt row cannot hide later evidence */ }
  }
  return rows;
}

export function detectDocReferences(text: string, paths: string[]): string[] {
  const lower = text.toLowerCase();
  return [...new Set(paths.filter((path) => {
    const normalized = path.replaceAll("\\", "/").toLowerCase();
    const name = basename(normalized);
    return lower.includes(normalized) || lower.includes(name);
  }))].sort();
}

export async function recordDocReferences(dataDir: string, text: string, source = "turn"): Promise<string[]> {
  const events = await listDocRouterEvents(dataDir);
  const loaded = [...new Set(events.filter((event) => event.kind === "loaded").map((event) => event.path))];
  const references = detectDocReferences(text, loaded);
  await Promise.all(references.map((path) => appendDocRouterEvent(dataDir, { kind: "referenced", path, source })));
  return references;
}

type Rule = { key: string; line: string; path: string; negative: boolean };
const INSTRUCTION_RE = /\b(always|never|must|must not|should|should not|do not|don['’]t)\b/i;
const NEGATIVE_RE = /\b(never|must not|should not|do not|don['’]t)\b/i;

function rules(doc: RouterDocument): Rule[] {
  return doc.text.split("\n").flatMap((raw) => {
    const line = raw.replace(/^\s*(?:[-*#>]+|\d+[.)])\s*/, "").trim();
    if (!INSTRUCTION_RE.test(line)) return [];
    const key = line.toLowerCase()
      .replace(/\b(always|never|must not|must|should not|should|do not|don['’]t)\b/g, "")
      .replace(/[^a-z0-9]+/g, " ").trim();
    return key.length >= 8 ? [{ key, line, path: doc.path, negative: NEGATIVE_RE.test(line) }] : [];
  });
}

export function detectContradictions(documents: RouterDocument[]): DocContradiction[] {
  const grouped = new Map<string, Rule[]>();
  for (const rule of documents.flatMap(rules)) grouped.set(rule.key, [...(grouped.get(rule.key) ?? []), rule]);
  const out: DocContradiction[] = [];
  for (const [key, variants] of grouped) {
    const positive = variants.find((item) => !item.negative);
    const negative = variants.find((item) => item.negative);
    if (positive && negative) out.push({
      rule: key,
      positive: `${positive.path}: ${positive.line}`,
      negative: `${negative.path}: ${negative.line}`,
    });
  }
  return out.sort((a, b) => a.rule.localeCompare(b.rule));
}

export function analyzeDocRouter(
  documents: RouterDocument[],
  events: DocRouterEvent[],
  options: { nowMs?: number; staleAfterMs?: number } = {},
): DocRouterReport {
  const nowMs = options.nowMs ?? Date.now();
  const staleAfterMs = options.staleAfterMs ?? 90 * 24 * 60 * 60 * 1000;
  const counts = (path: string, kind: DocRouterEvent["kind"]) => events.filter((event) => event.path === path && event.kind === kind).length;
  const rows = documents.map((doc) => ({
    path: doc.path,
    loads: counts(doc.path, "loaded"),
    references: counts(doc.path, "referenced"),
    ageDays: Math.max(0, Math.floor((nowMs - doc.mtimeMs) / 86_400_000)),
  })).sort((a, b) => a.path.localeCompare(b.path));
  return {
    documents: rows,
    stale: rows.filter((row) => row.ageDays * 86_400_000 >= staleAfterMs).map((row) => row.path),
    neverConsulted: rows.filter((row) => row.loads > 0 && row.references === 0).map((row) => row.path),
    missing: [...new Set(events.filter((event) => event.kind === "missing").map((event) => event.path))].sort(),
    contradictions: detectContradictions(documents),
  };
}

export async function readDocRouterHealth(
  repoRoot: string,
  dataDir: string,
  options: { nowMs?: number; staleAfterMs?: number } = {},
): Promise<DocRouterReport> {
  const events = await listDocRouterEvents(dataDir);
  const paths = new Set<string>(CONTEXT_DOCUMENTS);
  for (const event of events) paths.add(event.path);
  const documents: RouterDocument[] = [];
  for (const path of paths) {
    const abs = resolve(repoRoot, path);
    try {
      const [text, info] = await Promise.all([readFile(abs, "utf8"), stat(abs)]);
      documents.push({ path: relative(repoRoot, abs) || path, text, mtimeMs: info.mtimeMs });
    } catch { /* missing paths stay represented by their events */ }
  }
  return analyzeDocRouter(documents, events, options);
}

function list(label: string, values: string[]): string {
  return `${label}: ${values.length ? values.join(", ") : "none"}`;
}

export function formatDocRouterHealth(report: DocRouterReport): string {
  const rows = report.documents.length
    ? report.documents.map((doc) => `  ${doc.path}: ${doc.loads} load · ${doc.references} reference · ${doc.ageDays}d old`)
    : ["  (no context documents found)"];
  return [
    "Documentation router health",
    ...rows,
    list("Stale", report.stale),
    list("Never consulted", report.neverConsulted),
    list("Missing imports", report.missing),
    `Contradictions: ${report.contradictions.length}`,
    ...report.contradictions.map((item) => `  ${item.positive} <> ${item.negative}`),
  ].join("\n");
}
