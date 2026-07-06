import { z } from "zod";
import type { Tool } from "./types.js";
import type { SearchConfig, SearchProvider, SearchResult } from "../search/interface.js";
import { resolveSearchProviders } from "../search/index.js";
import { validateDomainScope, hasDomainScope, scopeQuery } from "../search/scope.js";

const Args = z.object({
  query: z.string().min(1),
  max_results: z.number().int().min(1).max(10).optional(),
  // WEB-DOMAIN-SCOPING: restrict to / exclude domains (mutually exclusive, capped).
  allowed_domains: z.array(z.string().min(1)).optional(),
  excluded_domains: z.array(z.string().min(1)).optional(),
  // WEB-SEARCH-CATEGORY-PAGINATION: honored natively by SearXNG, ignored elsewhere.
  category: z.string().min(1).optional(),
  page: z.number().int().min(1).optional(),
});

/** Render one result block: numbered title, then indented url and snippet. */
function formatResult(r: SearchResult, i: number): string {
  return `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.snippet}`;
}

type SearchOutcome =
  | { kind: "hit"; results: SearchResult[] }
  | { kind: "empty" }
  | { kind: "fail"; failures: string[] };

/**
 * Try each provider in order until one returns results. WEB-DOMAIN-SCOPING: a
 * provider that filters domains natively gets the raw query + domains in config;
 * every other provider gets a site:/-site: query rewrite (and no domain config).
 * Empty ≠ done — fall through to the next provider; only all-failed is an error.
 */
export async function searchAcross(
  providers: SearchProvider[],
  query: string,
  config: SearchConfig,
): Promise<SearchOutcome> {
  const scoped = hasDomainScope(config);
  const rewritten = scoped ? scopeQuery(query, config) : query;
  const noDomains: SearchConfig = { ...config, allowedDomains: undefined, excludedDomains: undefined };
  const failures: string[] = [];
  let anyEmpty = false;
  for (const provider of providers) {
    const native = !scoped || provider.filtersDomains === true;
    try {
      const results = await provider.search(native ? query : rewritten, native ? config : noDomains);
      if (results.length > 0) return { kind: "hit", results };
      anyEmpty = true;
    } catch (err) {
      failures.push(`${provider.id}: ${(err as Error).message}`);
    }
  }
  return anyEmpty ? { kind: "empty" } : { kind: "fail", failures };
}

export const webSearchTool: Tool = {
  schema: {
    name: "web_search",
    description:
      "Search the web and return a numbered list of result titles, URLs, and snippets. " +
      "Scope with allowed_domains OR excluded_domains (mutually exclusive) instead of hand-writing site: filters. " +
      "category and page are honored by backends that support them (SearXNG).",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "The search query" },
        max_results: {
          type: "integer",
          description: "Maximum results to return (1-10). Defaults to 5.",
          minimum: 1,
          maximum: 10,
        },
        allowed_domains: {
          type: "array",
          items: { type: "string" },
          description: 'Restrict results to these domains (e.g. ["docs.rs"]). Mutually exclusive with excluded_domains; max 10.',
        },
        excluded_domains: {
          type: "array",
          items: { type: "string" },
          description: "Exclude these domains from results. Mutually exclusive with allowed_domains; max 10.",
        },
        category: { type: "string", description: "Result category (e.g. news, images) — honored by SearXNG, ignored elsewhere." },
        page: { type: "integer", description: "1-based result page for backends that paginate (SearXNG).", minimum: 1 },
      },
      required: ["query"],
    },
  },
  describeForSafety: (a) => `web search: ${String(a.query ?? "")}`,
  async execute(raw) {
    const parsed = Args.safeParse(raw);
    if (!parsed.success) {
      return { ok: false, output: 'web_search needs a "query" string' };
    }
    const { query, max_results, allowed_domains, excluded_domains, category, page } = parsed.data;
    const scopeErr = validateDomainScope({ allowedDomains: allowed_domains, excludedDomains: excluded_domains });
    if (scopeErr) return { ok: false, output: scopeErr };
    try {
      const providers = resolveSearchProviders(process.env, "search");
      const config: SearchConfig = {
        maxResults: max_results,
        allowedDomains: allowed_domains,
        excludedDomains: excluded_domains,
        category,
        page,
      };
      const outcome = await searchAcross(providers, query, config);
      if (outcome.kind === "hit") return { ok: true, output: outcome.results.map(formatResult).join("\n") };
      if (outcome.kind === "empty") return { ok: true, output: "(no results)" };
      return { ok: false, output: `web search failed: ${outcome.failures.join("; ")}` };
    } catch (err) {
      return { ok: false, output: `web search failed: ${(err as Error).message}` };
    }
  },
};
