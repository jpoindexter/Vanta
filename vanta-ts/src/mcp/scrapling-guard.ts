import { assertPublicUrl, type GuardResult } from "../net/ssrf-guard.js";

const SINGLE_TOOLS = new Set(["get", "fetch", "stealthy_fetch"]);
const BULK_TOOLS = new Set(["bulk_get", "bulk_fetch", "bulk_stealthy_fetch"]);
const MAX_BULK_URLS = 20;
type UrlGuard = (url: string) => Promise<GuardResult>;

function optionalNetworkTargets(args: Record<string, unknown>): string[] {
  const proxy = args.proxy;
  const proxyServer = proxy && typeof proxy === "object"
    ? (proxy as Record<string, unknown>).server
    : proxy;
  return [args.cdp_url, proxyServer].filter((value): value is string => typeof value === "string" && value.length > 0);
}

function targetUrls(tool: string, args: Record<string, unknown>): { urls: string[]; error?: string } {
  const bulk = BULK_TOOLS.has(tool);
  if (!bulk && !SINGLE_TOOLS.has(tool)) return { urls: [], error: `unsupported Scrapling tool: ${tool}` };
  const candidate = bulk ? args.urls : [args.url];
  const valid = Array.isArray(candidate) && candidate.length > 0 && candidate.every((url) => typeof url === "string");
  if (!valid) return { urls: [], error: bulk ? "Scrapling bulk tools need a non-empty urls array" : "Scrapling tools need a url" };
  if (bulk && candidate.length > MAX_BULK_URLS) {
    return { urls: [], error: `Scrapling bulk tools accept at most ${MAX_BULK_URLS} URLs per call` };
  }
  return { urls: candidate as string[] };
}

/** Apply Vanta's public-network boundary before Scrapling receives any target. */
export async function validateScraplingToolArgs(
  server: string,
  tool: string,
  args: Record<string, unknown>,
  guard: UrlGuard = assertPublicUrl,
): Promise<string | null> {
  if (server !== "scrapling") return null;
  const targets = targetUrls(tool, args);
  if (targets.error) return targets.error;
  for (const url of [...targets.urls, ...optionalNetworkTargets(args)]) {
    const result = await guard(url);
    if (!result.ok) return result.error;
  }
  return null;
}
