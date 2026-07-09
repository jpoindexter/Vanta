import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";
import { slugify } from "./vault-bridge.js";

export type CompilePage = { rel: string; title: string; body: string };
export type CompileResult = { pages: CompilePage[]; diff: string; rawFiles: string[]; changed: string[] };

type RawDoc = { path: string; text: string };
type Mention = { title: string; source: string; line: number; excerpt: string };

const RAW_EXT = new Set([".md", ".txt"]);

export async function compileVault(rawDir: string, vault: string, opts: { apply?: boolean } = {}): Promise<CompileResult> {
  const docs = await readRawDocs(rawDir);
  const entities = collectEntities(docs);
  const concepts = collectConcepts(docs);
  const pages = [
    ...[...entities.values()].map((m) => renderPage("entities", m)),
    ...[...concepts.values()].map((m) => renderPage("concepts", m)),
  ].sort((a, b) => a.rel.localeCompare(b.rel));
  pages.push(renderIndex(pages, docs));
  const { diff, changed } = await diffPages(vault, pages);
  if (opts.apply) await writePages(vault, pages);
  return { pages, diff, rawFiles: docs.map((d) => d.path), changed };
}

async function readRawDocs(rawDir: string): Promise<RawDoc[]> {
  const files = await walk(rawDir);
  const docs: RawDoc[] = [];
  for (const file of files) {
    const rel = relative(rawDir, file).split(sep).join("/");
    docs.push({ path: rel, text: await readFile(file, "utf8") });
  }
  return docs;
}

async function walk(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const ent of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
    if (ent.name.startsWith(".")) continue;
    const full = join(dir, ent.name);
    if (ent.isDirectory()) out.push(...await walk(full));
    else if (ent.isFile() && RAW_EXT.has(ext(ent.name))) out.push(full);
  }
  return out.sort();
}

function collectEntities(docs: RawDoc[]): Map<string, Mention[]> {
  const map = new Map<string, Mention[]>();
  for (const doc of docs) {
    const lines = doc.text.split("\n");
    for (let i = 0; i < lines.length; i++) {
      for (const title of entityNames(lines[i] ?? "")) addMention(map, title, doc, i);
    }
  }
  return prune(map);
}

function collectConcepts(docs: RawDoc[]): Map<string, Mention[]> {
  const map = new Map<string, Mention[]>();
  for (const doc of docs) {
    const lines = doc.text.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] ?? "";
      const heading = line.match(/^#{1,4}\s+(.+)/)?.[1];
      if (heading) addMention(map, heading, doc, i);
      for (const phrase of quotedPhrases(line)) addMention(map, phrase, doc, i);
    }
  }
  return prune(map);
}

function renderPage(kind: "entities" | "concepts", mentions: Mention[]): CompilePage {
  const title = mentions[0]?.title ?? "Untitled";
  const rel = join("wiki", kind, `${slugify(title)}.md`);
  const body = [
    "---",
    `type: ${kind === "entities" ? "entity" : "concept"}`,
    "source: vault-compile",
    "---",
    "",
    `# ${title}`,
    "",
    "## Sources",
    ...mentions.map((m) => `- [[raw/${m.source}#L${m.line}|${m.source}:L${m.line}]] — ${m.excerpt}`),
    "",
    "## Links",
    "_Review and connect this page to related entities or concepts._",
    "",
  ].join("\n");
  return { rel, title, body };
}

function renderIndex(pages: CompilePage[], docs: RawDoc[]): CompilePage {
  const body = [
    "# Compiled Knowledge Index",
    "",
    "## Raw Sources",
    ...docs.map((d) => `- raw/${d.path}`),
    "",
    "## Entities",
    ...pages.filter((p) => p.rel.includes("/entities/")).map((p) => `- [[${p.rel}|${p.title}]]`),
    "",
    "## Concepts",
    ...pages.filter((p) => p.rel.includes("/concepts/")).map((p) => `- [[${p.rel}|${p.title}]]`),
    "",
  ].join("\n");
  return { rel: join("wiki", "INDEX.md"), title: "Compiled Knowledge Index", body };
}

async function diffPages(vault: string, pages: CompilePage[]): Promise<{ diff: string; changed: string[] }> {
  const changed: string[] = [];
  const chunks: string[] = [];
  for (const page of pages) {
    const current = await readFile(join(vault, page.rel), "utf8").catch(() => "");
    if (current === page.body) continue;
    changed.push(page.rel);
    chunks.push(formatDiff(page.rel, current, page.body));
  }
  return { changed, diff: chunks.join("\n") || "(no vault changes)" };
}

async function writePages(vault: string, pages: CompilePage[]): Promise<void> {
  for (const page of pages) {
    await mkdir(dirname(join(vault, page.rel)), { recursive: true });
    await writeFile(join(vault, page.rel), page.body, "utf8");
  }
}

function addMention(map: Map<string, Mention[]>, title: string, doc: RawDoc, line: number): void {
  const cleaned = title.replace(/\s+/g, " ").trim().slice(0, 80);
  if (cleaned.length < 3) return;
  const source = doc.path;
  const excerpt = (doc.text.split("\n")[line] ?? "").trim().slice(0, 180);
  map.set(cleaned, [...(map.get(cleaned) ?? []), { title: cleaned, source, line: line + 1, excerpt }]);
}

function entityNames(line: string): string[] {
  const names = line.match(/\b[A-Z][a-z0-9]+(?:\s+[A-Z][a-z0-9]+){0,3}\b/g) ?? [];
  return names.filter((n) => !["The", "This", "That", "Given", "When", "Then"].includes(n));
}

function quotedPhrases(line: string): string[] {
  return [...line.matchAll(/`([^`]{3,80})`|"([^"]{3,80})"/g)].map((m) => (m[1] ?? m[2] ?? "").trim());
}

function prune(map: Map<string, Mention[]>): Map<string, Mention[]> {
  return new Map([...map.entries()].filter(([, v]) => v.length > 0).map(([k, v]) => [k, v.slice(0, 8)]));
}

function formatDiff(path: string, oldText: string, newText: string): string {
  return [`--- ${path} (current)`, oldText ? oldText.slice(0, 1000) : "(new file)", `+++ ${path} (compiled)`, newText.slice(0, 2000), ""].join("\n");
}

function ext(name: string): string {
  const idx = name.lastIndexOf(".");
  return idx === -1 ? "" : name.slice(idx);
}
