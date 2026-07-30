import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { contextTier, promptContextCachePath } from "./prompt-tiers.js";

describe("prompt context metadata cache", () => {
  let root: string;
  let home: string;
  let previousHome: string | undefined;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "vanta-prompt-root-"));
    home = await mkdtemp(join(tmpdir(), "vanta-prompt-home-"));
    previousHome = process.env.VANTA_HOME;
    process.env.VANTA_HOME = home;
  });

  afterEach(async () => {
    if (previousHome === undefined) delete process.env.VANTA_HOME;
    else process.env.VANTA_HOME = previousHome;
    await Promise.all([
      rm(root, { recursive: true, force: true }),
      rm(home, { recursive: true, force: true }),
    ]);
  });

  it("persists resolved context and replays observer evidence on a cache hit", async () => {
    await writeFile(join(root, "AGENTS.md"), "# Rules\n@rules.md\n", "utf8");
    await writeFile(join(root, "rules.md"), "Always test the real path.\n", "utf8");
    const firstEvents: string[] = [];
    const first = await contextTier(root, (event) => { firstEvents.push(`${event.kind}:${event.path}`); });

    const cache = promptContextCachePath(root);
    expect(JSON.parse(await readFile(cache, "utf8"))).toBeTruthy();
    expect(first).toContain("Always test the real path.");
    expect(firstEvents).toContain("loaded:AGENTS.md");
    expect(firstEvents).toContain("loaded:rules.md");

    const cachedEvents: string[] = [];
    expect(await contextTier(root, (event) => { cachedEvents.push(`${event.kind}:${event.path}`); })).toBe(first);
    expect(cachedEvents).toEqual(firstEvents);
  });

  it("invalidates for changed and newly-created imported files", async () => {
    await writeFile(join(root, "AGENTS.md"), "@rules.md\n@later.md\n", "utf8");
    await writeFile(join(root, "rules.md"), "First rule.\n", "utf8");
    const initial = await contextTier(root);
    expect(initial).toContain("First rule.");
    expect(initial).toContain("@later.md");

    await writeFile(join(root, "rules.md"), "Changed rule with a longer body.\n", "utf8");
    await writeFile(join(root, "later.md"), "Newly available rule.\n", "utf8");
    const changed = await contextTier(root);
    expect(changed).toContain("Changed rule with a longer body.");
    expect(changed).toContain("Newly available rule.");
  });

  it("recovers from a corrupt cache", async () => {
    await writeFile(join(root, "README.md"), "Repository guide.\n", "utf8");
    await contextTier(root);
    const cache = promptContextCachePath(root);
    await mkdir(join(home, "cache", "prompt-context"), { recursive: true });
    await writeFile(cache, "{broken", "utf8");
    expect(await contextTier(root)).toContain("Repository guide.");
  });
});
