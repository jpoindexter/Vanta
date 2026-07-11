import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { loadCorpus } from "./store.js";
import type { CorpusSource } from "./schema.js";

type VaultPage = { rel: string; body: string };

export async function exportCorpusVault(vault: string, opts: { env?: NodeJS.ProcessEnv; apply?: boolean } = {}): Promise<{ changed: string[]; diff: string; sourceIds: string[] }> {
  const corpus = await loadCorpus(opts.env);
  const pages = makePages(corpus.sources);
  const changed: string[] = [];
  const diff: string[] = [];
  for (const page of pages) {
    const current = await readFile(join(vault, page.rel), "utf8").catch(() => "");
    if (current === page.body) continue;
    changed.push(page.rel);
    diff.push(`--- ${page.rel}\n+++ ${page.rel}\n${page.body.slice(0, 800)}`);
    if (opts.apply) await writePage(vault, page);
  }
  return { changed, diff: diff.join("\n\n") || "(no vault changes)", sourceIds: corpus.sources.map((source) => source.id) };
}

function makePages(sources: CorpusSource[]): VaultPage[] {
  const pages = sources.flatMap((source) => [sourcePage(source), rawPage(source)]);
  pages.push({
    rel: "wiki/corpus/INDEX.md",
    body: ["# Corpus Index", "", ...sources.map((source) => `- [[wiki/corpus/${source.id}|${source.title}]] - ${source.freshness} - ${source.sourceDate}`), ""].join("\n"),
  });
  return pages;
}

function sourcePage(source: CorpusSource): VaultPage {
  const entities = source.entities.map((entity) => `- [[wiki/entities/${slug(entity)}|${title(entity)}]]`).join("\n") || "- None detected";
  return {
    rel: `wiki/corpus/${source.id}.md`,
    body: ["---", "type: corpus-source", `source: ${source.origin}`, `source_date: ${source.sourceDate}`, `freshness: ${source.freshness}`, "---", "", `# ${source.title}`, "", `Raw: [[raw/corpus/${source.id}/source.md|source]]`, "", "## Entity Links", entities, ""].join("\n"),
  };
}

function rawPage(source: CorpusSource): VaultPage {
  return { rel: `raw/corpus/${source.id}/source.md`, body: [`# ${source.title}`, "", `Original: ${source.origin}`, "", ...source.chunks.map((chunk) => chunk.text), ""].join("\n") };
}

async function writePage(vault: string, page: VaultPage): Promise<void> {
  const path = join(vault, page.rel);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, page.body, "utf8");
}

function slug(value: string): string { return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }
function title(value: string): string { return value.replace(/\b\w/g, (letter) => letter.toUpperCase()); }
