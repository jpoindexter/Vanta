import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { z } from "zod";
import type { Tool } from "./types.js";

const run = promisify(execFile);
const TIMEOUT_MS = 15_000;

const Args = z.object({
  action: z.enum(["repo", "issues", "prs", "readme", "search"]),
  repo: z.string().optional(),
  query: z.string().optional(),
  limit: z.number().int().min(1).max(50).optional(),
});

async function gh(
  args: string[],
): Promise<{ ok: true; out: string } | { ok: false; error: string }> {
  try {
    const { stdout } = await run("gh", args, { timeout: TIMEOUT_MS });
    return { ok: true, out: stdout.trim() };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

function slugify(repo: string): string {
  return repo.replace(/^https?:\/\/github\.com\//, "").replace(/\.git$/, "");
}

function formatSearch(json: string): string {
  try {
    const rows = JSON.parse(json) as Array<{ fullName: string; description?: string; stargazerCount: number; url: string }>;
    return rows
      .map((r, i) => `${i + 1}. ${r.fullName} ⭐${r.stargazerCount}\n   ${r.description ?? ""}\n   ${r.url}`)
      .join("\n\n");
  } catch {
    return json;
  }
}

import type { ToolResult } from "./types.js";

async function actionSearch(query: string, limit: number): Promise<ToolResult> {
  const r = await gh(["search", "repos", query, "--limit", String(limit), "--json", "fullName,description,stargazerCount,url"]);
  return r.ok ? { ok: true, output: formatSearch(r.out) } : { ok: false, output: r.error };
}

async function actionRepo(slug: string): Promise<ToolResult> {
  const r = await gh(["repo", "view", slug, "--json", "name,description,stargazerCount,forkCount,language,topics,url"]);
  return r.ok ? { ok: true, output: r.out } : { ok: false, output: r.error };
}

async function actionReadme(slug: string): Promise<ToolResult> {
  const r = await gh(["api", `repos/${slug}/readme`, "--jq", ".content"]);
  if (!r.ok) return { ok: false, output: r.error };
  const content = Buffer.from(r.out.replace(/\n/g, ""), "base64").toString("utf8");
  return { ok: true, output: content.slice(0, 8_000) };
}

async function actionList(action: "issues" | "prs", slug: string, limit: number): Promise<ToolResult> {
  const cmd = action === "issues" ? "issue" : "pr";
  const r = await gh([cmd, "list", "--repo", slug, "--limit", String(limit), "--json", "number,title,state,url,createdAt"]);
  return r.ok ? { ok: true, output: r.out } : { ok: false, output: r.error };
}

async function dispatch(
  action: "repo" | "issues" | "prs" | "readme" | "search",
  repo: string | undefined,
  query: string | undefined,
  limit: number,
): Promise<ToolResult> {
  if (action === "search") {
    if (!query) return { ok: false, output: "github_read search needs a query" };
    return actionSearch(query, limit);
  }
  if (!repo) return { ok: false, output: `github_read ${action} needs a repo (owner/repo or URL)` };
  const slug = slugify(repo);
  if (action === "repo") return actionRepo(slug);
  if (action === "readme") return actionReadme(slug);
  return actionList(action, slug, limit);
}

export const githubReadTool: Tool = {
  schema: {
    name: "github_read",
    description:
      "Read GitHub repos, issues, PRs, and READMEs via gh CLI. " +
      "Zero-config for public repos. Run gh auth login to unlock private repos, fork, issue, PR creation.",
    parameters: {
      type: "object",
      required: ["action"],
      properties: {
        action: {
          type: "string",
          enum: ["repo", "issues", "prs", "readme", "search"],
          description: "repo=view details, issues=list open issues, prs=list open PRs, readme=read README, search=search GitHub",
        },
        repo: { type: "string", description: "owner/repo or full GitHub URL (not needed for search)" },
        query: { type: "string", description: "Search query (action=search only)" },
        limit: { type: "integer", minimum: 1, maximum: 50, description: "Max items (default 10)" },
      },
    },
  },
  describeForSafety: (a) => `github_read ${String(a["action"] ?? "")} ${String(a["repo"] ?? a["query"] ?? "")}`,
  async execute(raw) {
    const parsed = Args.safeParse(raw);
    if (!parsed.success) return { ok: false, output: "github_read: invalid args" };
    const { action, repo, query, limit = 10 } = parsed.data;
    return dispatch(action, repo, query, limit);
  },
};
