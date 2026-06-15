import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ReachChannel } from "../channel.js";
import { probeCommand } from "../probe.js";

const run = promisify(execFile);

async function hasJsRuntime(): Promise<boolean> {
  for (const bin of ["node", "deno"]) {
    try {
      await run(bin, ["--version"], { timeout: 5_000 });
      return true;
    } catch {
      // not found or broken
    }
  }
  return false;
}

export const youtubeChannel: ReachChannel = {
  name: "youtube",
  description: "YouTube video info + subtitles (yt-dlp)",
  backends: ["yt-dlp"],
  tier: 0,
  canHandle: (url) => /youtube\.com\/watch|youtu\.be\//i.test(url),
  async check(env) {
    const probe = await probeCommand("yt-dlp", ["--version"], env);
    if (!probe.available) {
      return {
        name: "youtube",
        status: "off",
        activeBackend: null,
        detail: "yt-dlp not installed",
        fix: "pip install yt-dlp",
      };
    }
    const hasJs = await hasJsRuntime();
    if (!hasJs) {
      return {
        name: "youtube",
        status: "warn",
        activeBackend: "yt-dlp",
        detail: "yt-dlp installed but no JS runtime (YouTube bot protection requires it)",
        fix: "install node.js: https://nodejs.org",
      };
    }
    return { name: "youtube", status: "ok", activeBackend: "yt-dlp", detail: probe.detail };
  },
};
