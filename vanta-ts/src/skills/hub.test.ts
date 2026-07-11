import { afterEach, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { addHubTap, inspectHub, listHubTaps, materializeHub, searchHub } from "./hub.js";
import { approveRegistrySkill, installRegistrySkill } from "./registry-client.js";

let root = "";
afterEach(async () => { if (root) await rm(root, { recursive: true, force: true }); });

describe("multi-source skill hub", () => {
  it("normalizes official, URL, well-known, GitHub, skills.sh, and configured taps", async () => {
    const fixture = await hubFixture();
    await addHubTap({ repo: "acme/tap", path: "skills" }, fixture.env);
    expect(await listHubTaps(fixture.env)).toEqual([{ repo: "acme/tap", path: "skills" }]);
    const report = await searchHub({
      query: "https://docs.example", sources: ["official", "url", "well-known", "github", "skills-sh", "tap"],
      env: fixture.env, fetcher: fixture.fetcher,
    });
    expect(report.failures).toEqual([]);
    expect(new Set(report.skills.map((skill) => skill.source))).toEqual(new Set(["official", "url", "well-known", "github", "skills-sh", "tap"]));
    expect(report.skills.every((skill) => skill.provenance && skill.cache.status === "fresh")).toBe(true);
    expect(report.skills.find((skill) => skill.source === "github")).toMatchObject({ category: "Development", signature: "unsigned" });
  });

  it("isolates source failures and falls back visibly to stale cache", async () => {
    const fixture = await hubFixture();
    const first = await searchHub({ query: "https://docs.example", sources: ["well-known"], env: fixture.env, fetcher: fixture.fetcher, now: new Date("2026-07-11T10:00:00Z"), ttlMs: 1_000 });
    expect(first.skills[0]?.cache.status).toBe("fresh");
    const offline = await searchHub({ query: "https://docs.example", sources: ["well-known", "skills-sh"], env: fixture.env,
      fetcher: async () => { throw new Error("offline"); }, now: new Date("2026-07-11T10:01:00Z"), ttlMs: 1_000 });
    expect(offline.skills[0]?.cache.status).toBe("stale-offline");
    expect(offline.failures).toEqual([{ source: "skills-sh", error: "offline" }]);
  });

  it("requires a source for duplicate slugs and materializes packages through quarantine", async () => {
    const fixture = await hubFixture();
    const report = await searchHub({ query: "https://docs.example", sources: ["official", "well-known"], env: fixture.env, fetcher: fixture.fetcher });
    expect(report.skills.filter((skill) => skill.slug === "useful")).toHaveLength(2);
    await expect(inspectHub("useful", { candidates: report.skills, env: fixture.env, fetcher: fixture.fetcher })).rejects.toThrow(/ambiguous.*source/i);
    const selected = report.skills.find((skill) => skill.source === "well-known")!;
    const materialized = await materializeHub(selected.identifier, { candidates: report.skills, env: fixture.env, fetcher: fixture.fetcher });
    expect(materialized.registryPath).toContain("skill-hub-cache");
    const installEnv = { ...fixture.env, VANTA_SKILL_REGISTRY: materialized.registryPath };
    await installRegistrySkill(materialized.slug, { env: installEnv, confirmed: true });
    await approveRegistrySkill(materialized.slug, installEnv);
    expect(await readFile(join(fixture.home, "skills/useful/references/api.md"), "utf8")).toBe("# API\n");
  });

  it("refuses oversized source content before materialization", async () => {
    const fixture = await hubFixture(), fetcher: typeof fetch = async () => response("x".repeat(512 * 1024 + 1));
    const report = await searchHub({ query: "https://large.example/SKILL.md", sources: ["url"], env: fixture.env, fetcher });
    expect(report.skills).toEqual([]);
    expect(report.failures[0]?.error).toContain("512 KiB");
  });

  it("refuses oversized GitHub trees before downloading package files", async () => {
    const fixture = await hubFixture(), env = { ...fixture.env, VANTA_SKILL_GITHUB: "large/repo/skills/huge" };
    const paths = ["skills/huge/SKILL.md", ...Array.from({ length: 65 }, (_value, index) => `skills/huge/references/${index}.md`)];
    const fetcher: typeof fetch = async (input) => {
      const url = String(input);
      if (url === "https://api.github.com/repos/large/repo") return response({ default_branch: "main" });
      if (url.includes("/git/trees/main")) return response({ tree: paths.map((path) => ({ type: "blob", path })) });
      if (url.endsWith("/SKILL.md")) return response("---\nname: huge\ndescription: Huge\n---\n# Huge\n");
      return new Response("missing", { status: 404 });
    };
    const report = await searchHub({ query: "huge", sources: ["github"], env, fetcher });
    await expect(inspectHub(report.skills[0]!.identifier, { candidates: report.skills, env, fetcher })).rejects.toThrow(/exceeds 65 files/);
  });
});

async function hubFixture() {
  root = await mkdtemp(join(tmpdir(), "vanta-hub-"));
  const home = join(root, "home"), registry = join(root, "official");
  await mkdir(join(registry, "useful"), { recursive: true });
  const content = "---\nname: useful\ndescription: Official useful\n---\n# Useful\n";
  await writeFile(join(registry, "useful/SKILL.md"), content);
  await writeFile(join(registry, "index.json"), JSON.stringify({ version: 1, skills: [{ slug: "useful", name: "Useful", version: "1.0.0", description: "Official", source: "useful/SKILL.md", sha256: sha(content), capabilities: [], platforms: [], dependencies: [], files: [] }] }));
  const env = { VANTA_HOME: home, VANTA_SKILL_REGISTRY: join(registry, "index.json"), VANTA_SKILL_URL: "https://direct.example/useful/SKILL.md", VANTA_SKILL_GITHUB: "acme/repo/skills/useful" };
  const fetcher: typeof fetch = async (input) => {
    const url = String(input);
    if (url === "https://docs.example/.well-known/skills/index.json") return response({ skills: [{ name: "useful", description: "Well known", files: ["SKILL.md", "references/api.md"] }] });
    if (url === "https://docs.example/.well-known/skills/useful/SKILL.md") return response(content);
    if (url === "https://docs.example/.well-known/skills/useful/references/api.md") return response("# API\n");
    if (url === "https://direct.example/useful/SKILL.md") return response(content);
    if (url.startsWith("https://skills.sh/api/search")) return response({ skills: [{ id: "acme/repo/skills/useful", skillId: "skills/useful", name: "useful", source: "acme/repo", installs: 12 }] });
    if (url === "https://api.github.com/repos/acme/repo") return response({ default_branch: "main" });
    if (url === "https://api.github.com/repos/acme/repo/git/trees/main?recursive=1") return response({ tree: [{ type: "blob", path: "skills/useful/SKILL.md" }, { type: "blob", path: "skills.sh.json" }] });
    if (url === "https://raw.githubusercontent.com/acme/repo/main/skills/useful/SKILL.md") return response(content);
    if (url === "https://raw.githubusercontent.com/acme/repo/main/skills.sh.json") return response({ groupings: [{ title: "Development", skills: ["useful"] }] });
    if (url === "https://api.github.com/repos/acme/tap") return response({ default_branch: "main" });
    if (url === "https://api.github.com/repos/acme/tap/git/trees/main?recursive=1") return response({ tree: [{ type: "blob", path: "skills/tapped/SKILL.md" }] });
    if (url === "https://raw.githubusercontent.com/acme/tap/main/skills/tapped/SKILL.md") return response("---\nname: tapped\ndescription: Tap skill\n---\n# Tap\n");
    return new Response("not found", { status: 404 });
  };
  return { home, env, fetcher };
}

const sha = (content: string) => createHash("sha256").update(content).digest("hex");
function response(value: unknown): Response {
  return new Response(typeof value === "string" ? value : JSON.stringify(value), { status: 200, headers: { "content-type": "application/json" } });
}
