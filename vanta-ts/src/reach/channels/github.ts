import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ReachChannel } from "../channel.js";
import { probeCommand } from "../probe.js";

const run = promisify(execFile);

export const githubChannel: ReachChannel = {
  name: "github",
  description: "GitHub repos, issues, PRs (gh CLI)",
  backends: ["gh"],
  tier: 0,
  canHandle: (url) => /^https?:\/\/(www\.)?github\.com\//i.test(url),
  async check(env) {
    const probe = await probeCommand("gh", ["--version"], env);
    if (!probe.available) {
      return {
        name: "github",
        status: "off",
        activeBackend: null,
        detail: "gh CLI not installed",
        fix: "brew install gh  or  https://cli.github.com",
      };
    }
    try {
      const { stdout } = await run("gh", ["auth", "status"], { timeout: 5_000, env });
      const authed = stdout.includes("Logged in") || stdout.includes("✓");
      return {
        name: "github",
        status: "ok",
        activeBackend: "gh",
        detail: authed ? "authenticated" : "public repos only",
        fix: authed ? undefined : "gh auth login to unlock private repos, fork, issue, PR",
      };
    } catch {
      return {
        name: "github",
        status: "ok",
        activeBackend: "gh",
        detail: "public repos (not authenticated)",
        fix: "gh auth login",
      };
    }
  },
};
