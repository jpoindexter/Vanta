import { afterEach, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  approveRegistrySkill, browseRegistry, doctorRegistrySkills, installRegistrySkill,
  removeRegistrySkill, searchRegistry, updateRegistrySkill, viewRegistrySkill,
} from "./registry-client.js";

let root = "";
afterEach(async () => { if (root) await rm(root, { recursive: true, force: true }); });

describe("public skill registry client", () => {
  it("searches, previews complete content, quarantines, approves, and removes reversibly", async () => {
    const fixture = await registryFixture("1.0.0", "# Do the useful thing\n");
    expect((await browseRegistry(fixture.env)).map((item) => item.slug)).toEqual(["useful"]);
    expect((await searchRegistry("use", fixture.env))[0]?.version).toBe("1.0.0");
    const view = await viewRegistrySkill("useful", fixture.env);
    expect(view).toMatchObject({ source: expect.stringContaining("SKILL.md"), capabilities: ["read files"], integrityOk: true });
    expect(view?.content).toContain("# Do the useful thing");
    const installed = await installRegistrySkill("useful", { env: fixture.env, confirmed: true });
    expect(installed.status).toBe("disabled");
    await expect(readFile(join(fixture.home, "skills", "useful", "SKILL.md"), "utf8")).rejects.toThrow();
    await approveRegistrySkill("useful", fixture.env);
    expect(await readFile(join(fixture.home, "skills", "useful", "SKILL.md"), "utf8")).toContain("Do the useful thing");
    expect((await doctorRegistrySkills(fixture.env))[0]).toMatchObject({ slug: "useful", status: "ok" });
    await removeRegistrySkill("useful", fixture.env);
    await expect(readFile(join(fixture.home, "skills", "useful", "SKILL.md"), "utf8")).rejects.toThrow();
    expect(await readFile(join(fixture.home, "skill-registry-removed", "useful", "SKILL.md"), "utf8")).toContain("Do the useful thing");
  });

  it("updates unmodified installs but preserves local edits as a conflict", async () => {
    const fixture = await registryFixture("1.0.0", "version one\n");
    await installRegistrySkill("useful", { env: fixture.env, confirmed: true });
    await approveRegistrySkill("useful", fixture.env);
    await fixture.publish("2.0.0", "version two\n");
    const preview = await updateRegistrySkill("useful", { env: fixture.env, confirmed: false });
    expect(preview.diff).toContain("-version one");
    expect(preview.diff).toContain("+version two");
    await updateRegistrySkill("useful", { env: fixture.env, confirmed: true });
    expect(await readFile(join(fixture.home, "skills", "useful", "SKILL.md"), "utf8")).toBe("version two\n");
    await writeFile(join(fixture.home, "skills", "useful", "SKILL.md"), "my local edit\n");
    await fixture.publish("3.0.0", "version three\n");
    const conflict = await updateRegistrySkill("useful", { env: fixture.env, confirmed: true });
    expect(conflict.status).toBe("local-edits-preserved");
    expect(await readFile(join(fixture.home, "skills", "useful", "SKILL.md"), "utf8")).toBe("my local edit\n");
  });
});

async function registryFixture(version: string, content: string) {
  root = await mkdtemp(join(tmpdir(), "vanta-skill-registry-"));
  const home = join(root, "home"), registry = join(root, "registry");
  await mkdir(join(registry, "useful"), { recursive: true });
  const env = { VANTA_HOME: home, VANTA_SKILL_REGISTRY: join(registry, "index.json") };
  const publish = async (nextVersion: string, nextContent: string) => {
    await writeFile(join(registry, "useful", "SKILL.md"), nextContent);
    await writeFile(join(registry, "index.json"), JSON.stringify({ version: 1, skills: [{
      slug: "useful", name: "Useful", version: nextVersion, description: "A useful skill",
      source: "useful/SKILL.md", sha256: createHash("sha256").update(nextContent).digest("hex"), capabilities: ["read files"],
    }] }));
  };
  await publish(version, content);
  return { home, env, publish };
}
