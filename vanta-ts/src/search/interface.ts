/** One web search result. */
export type SearchResult = {
  title: string;
  url: string;
  snippet: string;
};

/** Runtime config for a single search call. */
export type SearchConfig = {
  /** Max results to return. Default 5. */
  maxResults?: number;
  /**
   * WEB-DOMAIN-SCOPING: restrict results to (allowedDomains) or exclude
   * (excludedDomains) these domains. Mutually exclusive. Providers that filter
   * domains natively ({@link SearchProvider.filtersDomains}) read these; for the
   * rest the calling tool rewrites the query with site:/-site: instead.
   */
  allowedDomains?: string[];
  excludedDomains?: string[];
  /** WEB-SEARCH-CATEGORY-PAGINATION: SearXNG-style result category (news/images/…). */
  category?: string;
  /** WEB-SEARCH-CATEGORY-PAGINATION: 1-based result page for backends that paginate. */
  page?: number;
};

/**
 * A web search backend. Mirrors {@link LLMProvider}: typed, swappable, resolved
 * from environment. Implementations MAY throw on network or auth failure — the
 * calling tool catches and returns errors-as-values, so the agent loop never
 * crashes on a failed search.
 */
export interface SearchProvider {
  /** Stable id: "ddg" | "bing" | "jina_ddg" | "searxng" | "serpapi" | "brave". */
  readonly id: string;
  /**
   * WEB-DOMAIN-SCOPING: true when the provider applies config.allowedDomains /
   * excludedDomains itself (native domain filtering). When absent/false, the
   * calling tool rewrites the query with site:/-site: before dispatch instead.
   */
  readonly filtersDomains?: boolean;
  search(query: string, config?: SearchConfig): Promise<SearchResult[]>;
}

/** Default result count when a caller does not specify one. */
export const DEFAULT_MAX_RESULTS = 5;
