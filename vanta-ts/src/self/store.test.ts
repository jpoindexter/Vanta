import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ensureSelf, readSelf, selfDigest, writeSelfFile } from "./store.js";

let home: string;
let env: NodeJS.ProcessEnv;

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "vanta-self-"));
  env = { VANTA_HOME: home };
});

afterEach(async () => {
  await rm(home, { recursive: true }).catch(() => {});
});

describe("ensureSelf", () => {
  it("creates self/ dir and seeds all three regions", async () => {
    await ensureSelf(env);
    const identity = await readSelf("identity", env);
    const values = await readSelf("values", env);
    const honesty = await readSelf("honesty", env);
    expect(identity).toContain("Vanta");
    expect(values).toContain("Should");
    expect(honesty).toContain("guardrail");
  });

  it("does not overwrite existing files", async () => {
    await ensureSelf(env);
    await writeSelfFile("identity", "# Custom identity\n", "test", env);
    await ensureSelf(env); // should not overwrite
    const content = await readSelf("identity", env);
    expect(content).toContain("Custom identity");
  });
});

describe("selfDigest", () => {
  it("returns all three regions merged", async () => {
    const digest = await selfDigest(env);
    expect(digest).toContain("Identity");
    expect(digest).toContain("Values");
    expect(digest).toContain("Honesty guardrail");
  });
});

describe("writeSelfFile", () => {
  it("writes content and logs to changelog", async () => {
    await ensureSelf(env);
    await writeSelfFile("identity", "# New identity\nUpdated.\n", "test update", env);
    const content = await readSelf("identity", env);
    expect(content).toContain("New identity");
    const { readFile } = await import("node:fs/promises");
    const changelog = await readFile(join(home, "self", "changelog.md"), "utf8").catch(() => "");
    expect(changelog).toContain("identity");
    expect(changelog).toContain("test update");
  });

  it("is a no-op when content is unchanged", async () => {
    await ensureSelf(env);
    const before = await readSelf("identity", env);
    await writeSelfFile("identity", before ?? "", "no change");
    // Should not throw, changelog should not get a new entry for this call
  });
});
