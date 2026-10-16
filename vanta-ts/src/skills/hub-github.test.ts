import { describe, expect, it } from "vitest";
import { inspectHub } from "./hub.js";

const SKILL = "---\nname: on-page-seo-auditor\ndescription: Audit a page\ncreated: 2026-10-15T00:00:00Z\nupdated: 2026-10-15T00:00:00Z\ntags: []\n---\nSteps.\n";

function githubFetcher(seen: Array<{ url: string; auth: string | undefined }>, status = 200): typeof fetch {
  return (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const url = String(input);
    seen.push({ url, auth: (init?.headers as Record<string, string> | undefined)?.authorization });
    if (status !== 200 && url.startsWith("https://api.github.com/")) return new Response("limited", { status });
    if (url === "https://api.github.com/repos/acme/skills") return Response.json({ default_branch: "main" });
    if (url.includes("/git/trees/")) return Response.json({ tree: [{ type: "blob", path: "skills/seo/on-page-seo-auditor/SKILL.md" }, { type: "blob", path: "skills/seo/on-page-seo-auditor/notes.md" }] });
    return new Response(SKILL);
  }) as typeof fetch;
}

const env = (extra: Record<string, string> = {}) => ({ VANTA_HOME: `/tmp/vanta-hub-github-${process.pid}`, ...extra });

describe("skills.sh aliases on GitHub", () => {
  it("finds a skill in a nested folder named for the alias", async () => {
    const seen: Array<{ url: string; auth: string | undefined }> = [];
    const pkg = await inspectHub("skills-sh:acme/skills/on-page-seo-auditor", { candidates: [], env: env(), fetcher: githubFetcher(seen) });

    expect([...pkg.files.keys()].sort()).toEqual(["SKILL.md", "notes.md"]);
  });

  it("sends a GitHub token only to api.github.com", async () => {
    const seen: Array<{ url: string; auth: string | undefined }> = [];
    await inspectHub("skills-sh:acme/skills/on-page-seo-auditor", { candidates: [], env: env({ GITHUB_TOKEN: "t0ken" }), fetcher: githubFetcher(seen) });

    expect(seen.filter((call) => call.url.startsWith("https://api.github.com/")).every((call) => call.auth === "Bearer t0ken")).toBe(true);
    expect(seen.filter((call) => !call.url.startsWith("https://api.github.com/")).every((call) => call.auth === undefined)).toBe(true);
  });

  it("explains GitHub's request limit in plain words", async () => {
    await expect(inspectHub("skills-sh:acme/skills/on-page-seo-auditor", { candidates: [], env: env(), fetcher: githubFetcher([], 403) }))
      .rejects.toThrow(/request limit was reached.*GITHUB_TOKEN/);
  });
});
