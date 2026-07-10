import type { ReachChannel, ChannelStatus } from "../channel.js";
import { orderedBackends } from "../channel.js";
import { probeCommand } from "../probe.js";
import { searchBilibiliApi } from "../bilibili.js";

function ok(name: string, activeBackend: string, detail: string): ChannelStatus {
  return { name, status: "ok", activeBackend, detail };
}

export const bilibiliChannel: ReachChannel = {
  name: "bilibili",
  description: "Bilibili search, video detail, and subtitles",
  backends: ["bili-cli", "OpenCLI", "Bilibili search API"],
  tier: 0,
  canHandle: (url) => /^https?:\/\/([^/]+\.)?(bilibili\.com|b23\.tv)\//i.test(url),
  async check(env) {
    for (const backend of orderedBackends(this, env)) {
      if (backend === "bili-cli") {
        const probe = await probeCommand("bili", ["--version"], env);
        if (probe.available) return ok("bilibili", "bili-cli", `search/video detail ready · ${probe.detail}`);
      }
      if (backend === "OpenCLI") {
        const probe = await probeCommand("opencli", ["--version"], env);
        if (probe.available) return ok("bilibili", "OpenCLI", `subtitles + browser-session fallback ready · ${probe.detail}`);
      }
      if (backend === "Bilibili search API") {
        const probe = await searchBilibiliApi("test", 1);
        if (probe.ok) {
          return {
            name: "bilibili",
            status: "warn",
            activeBackend: "Bilibili search API",
            detail: "search-only fallback reachable",
            fix: "install full video-detail backend: pipx install bilibili-cli",
          };
        }
      }
    }
    return {
      name: "bilibili",
      status: "off",
      activeBackend: null,
      detail: "no Bilibili backend available",
      fix: "install bili-cli: pipx install bilibili-cli; optional subtitles: install/configure OpenCLI",
    };
  },
};
