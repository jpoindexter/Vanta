import type { ChannelStatus, ReachChannel } from "../channel.js";
import { orderedBackends } from "../channel.js";
import { probeCommand } from "../probe.js";

const MCP_URL = "http://localhost:18060/mcp";
const MCP_FIX = "start xiaohongshu-mcp, then run: mcporter config add xiaohongshu http://localhost:18060/mcp";

function ok(activeBackend: string, detail: string): ChannelStatus {
  return { name: "xiaohongshu", status: "ok", activeBackend, detail };
}

function warn(activeBackend: string, detail: string, fix: string): ChannelStatus {
  return { name: "xiaohongshu", status: "warn", activeBackend, detail, fix };
}

export async function xiaohongshuMcpReachable(fetcher: typeof fetch = fetch): Promise<boolean> {
  try {
    await fetcher(MCP_URL, { method: "GET" });
    return true;
  } catch {
    return false;
  }
}

async function checkMcp(env: NodeJS.ProcessEnv): Promise<ChannelStatus | undefined> {
  if (!(await xiaohongshuMcpReachable())) return undefined;
  const mcporter = await probeCommand("mcporter", ["config", "list"], env);
  if (mcporter.available && /xiaohongshu/i.test(mcporter.detail)) {
    return ok("xiaohongshu-mcp", "MCP server and mcporter route reachable");
  }
  return warn("xiaohongshu-mcp", "MCP server reachable but mcporter route is not configured", MCP_FIX);
}

function xhsCliStatus(detail: string): ChannelStatus {
  if (/ok:\s*true/i.test(detail) || /authenticated|logged in/i.test(detail)) return ok("xhs-cli", detail);
  if (/not_authenticated|expired|login/i.test(detail)) return warn("xhs-cli", detail, "refresh Xiaohongshu login: xhs login");
  return warn("xhs-cli", detail, "check xhs-cli status or refresh login: xhs login");
}

export const xiaohongshuChannel: ReachChannel = {
  name: "xiaohongshu",
  description: "Xiaohongshu search, note read, comments, and feed through logged-in backends",
  backends: ["OpenCLI", "xiaohongshu-mcp", "xhs-cli"],
  tier: 2,
  canHandle: (url) => /^https?:\/\/([^/]+\.)?(xiaohongshu\.com|xhslink\.com)\//i.test(url),
  async check(env) {
    for (const backend of orderedBackends(this, env)) {
      if (backend === "OpenCLI") {
        const probe = await probeCommand("opencli", ["--version"], env);
        if (probe.available) return ok("OpenCLI", `search/note/comments/feed ready · ${probe.detail}`);
      }
      if (backend === "xiaohongshu-mcp") {
        const status = await checkMcp(env);
        if (status) return status;
      }
      if (backend === "xhs-cli") {
        const probe = await probeCommand("xhs", ["status"], env);
        if (probe.available) return xhsCliStatus(probe.detail);
      }
    }
    return {
      name: "xiaohongshu",
      status: "off",
      activeBackend: null,
      detail: "no Xiaohongshu backend available",
      fix: "desktop: install/configure OpenCLI; server: run xiaohongshu-mcp and add mcporter config",
    };
  },
};
