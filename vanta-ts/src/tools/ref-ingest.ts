import { z } from "zod";
import type { Tool } from "./types.js";
import { addRef, detectRefType, searchRefs, listRefs, formatRefs, formatRefForContext } from "../refs/store.js";

// REF-INGEST tool: the agent can ingest a reference (URL/file/repo/image/transcript)
// into the durable project-scoped context. Fetches URLs via web_fetch; reads files
// inline. The result is stored in ~/.vanta/refs/ and available across sessions.

const IngestArgs = z.object({
  source: z.string().min(1).describe("URL, file path, or repo path to ingest"),
  excerpt: z.string().optional().describe("Pre-extracted summary or content (skip fetch)"),
  title: z.string().optional().describe("Human-readable title for the reference"),
  tags: z.array(z.string()).optional().describe("Tags for later search"),
});

const SearchArgs = z.object({
  query: z.string().min(1).describe("Search query for ingested references"),
});

export const refIngestTool: Tool = {
  schema: {
    name: "ref_ingest",
    description:
      "Ingest a reference (URL / file / repo / image / transcript) into durable project context. " +
      "Stored under ~/.vanta/refs/ and recallable across sessions without re-pasting. " +
      "Pass an excerpt to skip fetching; or let the tool read the source.",
    parameters: {
      type: "object",
      properties: {
        source: { type: "string", description: "URL, file path, or repo path to ingest" },
        excerpt: { type: "string", description: "Pre-extracted content (skips fetch if provided)" },
        title: { type: "string", description: "Human label" },
        tags: { type: "array", items: { type: "string" }, description: "Tags for search" },
      },
      required: ["source"],
    },
  },
  describeForSafety: (a) => `ingest reference: ${String(a.source ?? "")}`,
  async execute(raw, ctx) {
    const parsed = IngestArgs.safeParse(raw);
    if (!parsed.success) return { ok: false, output: "ref_ingest needs a source" };
    const { source, excerpt: providedExcerpt, title, tags } = parsed.data;

    let excerpt = providedExcerpt ?? "";
    if (!excerpt && /^https?:\/\//.test(source)) {
      try {
        const { extractReadable } = await import("./web-fetch.js");
        const res = await fetch(source);
        const html = await res.text();
        excerpt = extractReadable(html, source).text.slice(0, 2000);
      } catch { excerpt = `(fetch failed for ${source})`; }
    } else if (!excerpt) {
      try {
        const { readFile } = await import("node:fs/promises");
        excerpt = (await readFile(source, "utf8")).slice(0, 2000);
      } catch { excerpt = `(could not read ${source})`; }
    }

    void ctx; // env pulled from process.env for the store
    const ref = await addRef({ source, excerpt, title, tags });
    return { ok: true, output: `✓ ingested: ${ref.id}\n  ${ref.title}\n  ${source}` };
  },
};

export const refSearchTool: Tool = {
  schema: {
    name: "ref_search",
    description: "Search ingested references by keyword. Returns matching refs with their excerpts.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query" },
      },
      required: ["query"],
    },
  },
  describeForSafety: () => "search ingested references",
  async execute(raw) {
    const parsed = SearchArgs.safeParse(raw);
    if (!parsed.success) return { ok: false, output: "ref_search needs a query" };
    const refs = await searchRefs(parsed.data.query);
    if (!refs.length) return { ok: true, output: `(no refs matched "${parsed.data.query}")` };
    const lines = refs.slice(0, 5).map((r) => formatRefForContext(r));
    return { ok: true, output: lines.join("\n\n---\n\n") };
  },
};

export const refListTool: Tool = {
  schema: {
    name: "ref_list",
    description: "List all ingested references, most recent first.",
    parameters: { type: "object", properties: {} },
  },
  describeForSafety: () => "list ingested references",
  async execute() {
    const refs = await listRefs();
    return { ok: true, output: formatRefs(refs) };
  },
};
