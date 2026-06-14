import type { ReachChannel } from "../channel.js";

// The search channel — full-web search. Backed by Vanta's web_search, whose
// provider is selected by VANTA_SEARCH_PROVIDER (auto = the reliable configured
// chain). Always has a usable backend (the keyless default), so status is ok;
// the active backend reflects the resolved provider.
const KEYED = new Set(["serpapi", "brave"]);

export const searchChannel: ReachChannel = {
  name: "search",
  description: "Full-web search",
  backends: ["auto", "ddg", "searxng", "serpapi", "brave", "bing", "jina"],
  tier: 0,
  canHandle: () => false, // query-based, not URL-routed
  async check(env) {
    const provider = env.VANTA_SEARCH_PROVIDER ?? "auto";
    const needsKey = KEYED.has(provider);
    const hasKey = provider === "serpapi" ? Boolean(env.SERPAPI_KEY) : provider === "brave" ? Boolean(env.BRAVE_KEY) : true;
    return needsKey && !hasKey
      ? {
          name: "search",
          status: "warn",
          activeBackend: provider,
          detail: "provider key missing — falls back to keyless",
          fix: provider === "serpapi" ? "set SERPAPI_KEY" : "set BRAVE_KEY",
        }
      : { name: "search", status: "ok", activeBackend: provider, detail: "web_search" };
  },
};
