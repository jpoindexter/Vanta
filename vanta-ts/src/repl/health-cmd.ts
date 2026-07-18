import { existsSync } from "node:fs";
import { join } from "node:path";
import { gatherStatus, type StatusReport } from "../status.js";
import { resolveVantaHome } from "../store/home.js";
import type { SlashHandler } from "./types.js";

// `/health` — capability view: each capability with ✓ ready / ✗ missing + the
// EXACT command to enable a missing one. Fixes the friction of hitting a
// "not authorized / not installed" wall mid-task. Builds on gatherStatus
// (kernel + provider) and adds the operator capabilities (google/vision/browser/mcp).

export type Cap = { name: string; ok: boolean; detail: string; fix?: string };

const kernelCap = (st: StatusReport): Cap => ({
  name: "kernel", ok: st.kernel.up, detail: st.kernel.up ? "up" : "down",
  fix: st.kernel.up ? undefined : "restart vanta (./run.sh)",
});

const modelCap = (st: StatusReport): Cap => ({
  name: "model + key", ok: st.provider.ok,
  detail: st.provider.ok ? `${st.provider.id} · ${st.provider.model}` : (st.provider.error ?? "unresolved"),
  fix: st.provider.ok ? undefined : "/setup — pick a backend + set its key",
});

const RELIABLE_SEARCH_ENV = ["FIRECRAWL_API_KEY", "PARALLEL_API_KEY", "TAVILY_API_KEY", "EXA_API_KEY", "XAI_API_KEY", "BRAVE_KEY", "SERPAPI_KEY", "VANTA_SEARCH_URL"];

export function searchCap(env: NodeJS.ProcessEnv): Cap {
  const selected = (env.VANTA_SEARCH_BACKEND ?? env.VANTA_SEARCH_PROVIDER ?? "auto").toLowerCase();
  if (selected === "ddg" || selected === "jina_ddg") {
    return {
      name: "web search",
      ok: false,
      detail: `${selected} is legacy and frequently bot-blocked`,
      fix: "set VANTA_SEARCH_PROVIDER=auto or configure SearXNG/a managed provider",
    };
  }
  const configured = RELIABLE_SEARCH_ENV.some((key) => Boolean(env[key]?.trim()));
  return {
    name: "web search",
    ok: true,
    detail: configured
      ? `${selected} routing with configured provider`
      : "best-effort keyless (Brave browser · Bing); configure a provider for reliability",
  };
}

export function googleCap(env: NodeJS.ProcessEnv, home: string): Cap {
  const creds = Boolean(env.VANTA_GOOGLE_CLIENT_ID?.trim() && env.VANTA_GOOGLE_CLIENT_SECRET?.trim());
  const token = existsSync(join(home, "google-tokens.json"));
  const ok = creds && token;
  const detail = ok ? "authorized" : creds ? "not authorized" : "no OAuth client";
  const fix = ok ? undefined : creds ? "run: vanta auth google" : "set VANTA_GOOGLE_CLIENT_ID/SECRET, then: vanta auth google";
  return { name: "gmail/calendar/drive", ok, detail, fix };
}

export function visionCap(env: NodeJS.ProcessEnv): Cap {
  const ok = Boolean(env.VANTA_VISION_MODEL?.trim());
  return {
    name: "vision", ok, detail: ok ? env.VANTA_VISION_MODEL!.trim() : "main model (may not be vision-capable)",
    fix: ok ? undefined : "set VANTA_VISION_MODEL (e.g. gpt-4o-mini)",
  };
}

async function browserCap(): Promise<Cap> {
  try {
    await import("playwright-core");
    return { name: "browser", ok: true, detail: "playwright ready" };
  } catch {
    return { name: "browser", ok: false, detail: "playwright-core absent", fix: "npx playwright install chromium" };
  }
}

async function mcpCap(env: NodeJS.ProcessEnv): Promise<Cap> {
  const { readMcpConfig } = await import("../mcp/mount.js");
  const cfg = await readMcpConfig(env).catch(() => ({ servers: {} as Record<string, unknown> }));
  const n = Object.keys(cfg.servers ?? {}).length;
  return { name: "mcp servers", ok: n > 0, detail: n > 0 ? `${n} configured` : "none (optional)", fix: n > 0 ? undefined : "add .mcp.json or VANTA_MCP_SERVERS" };
}

export async function gatherCapabilities(env: NodeJS.ProcessEnv): Promise<Cap[]> {
  const st = await gatherStatus(env);
  const home = resolveVantaHome(env);
  return [kernelCap(st), modelCap(st), searchCap(env), googleCap(env, home), visionCap(env), await browserCap(), await mcpCap(env)];
}

/** Pure: render the capability list with ✓/✗ + the fix for each missing one. */
export function formatHealth(caps: Cap[]): string {
  const missing = caps.filter((c) => !c.ok).length;
  const head = missing === 0 ? "  Capability health — all ready ✓" : `  Capability health — ${missing} need setup`;
  const rows = caps.map((c) => `  ${c.ok ? "✓" : "✗"} ${c.name.padEnd(22)} ${c.detail}${c.fix ? `\n      → ${c.fix}` : ""}`);
  return [head, ...rows].join("\n");
}

export const health: SlashHandler = async (_arg, ctx) => ({ output: formatHealth(await gatherCapabilities(ctx.env)) });
