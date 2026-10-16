import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { listSkills, writeSkill } from "../skills/store.js";
import { answerApproval, startControlHarness, type ControlHarness } from "./__fixtures__/control-harness.js";

let h: ControlHarness;
beforeEach(async () => { h = await startControlHarness(); });
afterEach(async () => { await h.stop(); });

async function memory(name: string, text: string): Promise<string> {
  await mkdir(join(h.home, "memories"), { recursive: true });
  const path = join(h.home, "memories", name);
  await writeFile(path, text);
  return path;
}

describe("archiving a Memory Graph node", () => {
  it("moves a skill to the archive only after an approval that names it", async () => {
    await writeSkill({ name: "Old trick", description: "d", body: "steps" }, { env: process.env });
    const pending = h.post("/api/learning/node-archive", { id: "skill:Old trick" });
    const shown = await answerApproval(h, "allow");

    expect(shown.action).toMatch(/archive skill Old trick \(moved to _archive, restorable\)/);
    expect((await pending).body).toMatchObject({ ok: true });
    expect((await listSkills(process.env)).map((skill) => skill.meta.name)).not.toContain("Old trick");
  });

  it("moves a memory file into _archive and never deletes it", async () => {
    const path = await memory("7.md", "remember this");
    const pending = h.post("/api/learning/node-archive", { id: "memory:7.md" });
    await answerApproval(h, "allow");
    await pending;

    await expect(stat(path)).rejects.toThrow();
    expect(await readFile(join(h.home, "memories", "_archive", "7.md"), "utf8")).toBe("remember this");
  });

  it("changes nothing when the approval is denied", async () => {
    const path = await memory("8.md", "keep me");
    const pending = h.post("/api/learning/node-archive", { id: "memory:8.md" });
    await answerApproval(h, "deny");

    expect((await pending).status).toBe(403);
    expect(await readFile(path, "utf8")).toBe("keep me");
  });

  it("refuses a malformed id or a skill that is not there, before asking", async () => {
    expect((await h.post("/api/learning/node-archive", { id: "memory:../../etc.md" })).status).toBe(400);
    expect((await h.post("/api/learning/node-archive", { id: "skill:Ghost" })).status).toBe(404);
    expect((await h.post("/api/learning/node-archive", { id: "Ghost" })).status).toBe(404);
  });
});

describe("editing a Memory Graph node", () => {
  it("replaces a memory's text after approval", async () => {
    const path = await memory("9.md", "old text");
    const pending = h.post("/api/learning/node-edit", { id: "memory:9.md", content: "new text\nline two" });
    const shown = await answerApproval(h, "allow");

    expect(shown.action).toMatch(/change memory 9\.md \(2 lines\)/);
    expect((await pending).body).toMatchObject({ ok: true });
    expect(await readFile(path, "utf8")).toBe("new text\nline two");
  });

  it("accepts a bare skill name, as the Skills tab editor sends it", async () => {
    await writeSkill({ name: "Bare name", description: "d", body: "before" }, { env: process.env });
    const pending = h.post("/api/learning/node-edit", { id: "Bare name", content: "after bare" });
    await answerApproval(h, "allow");
    await pending;

    expect((await listSkills(process.env)).find((entry) => entry.meta.name === "Bare name")?.body.trim()).toBe("after bare");
  });

  it("rewrites a skill body but keeps its name and description", async () => {
    await writeSkill({ name: "Editable", description: "keeps this", body: "before", tags: ["x"] }, { env: process.env });
    const pending = h.post("/api/learning/node-edit", { id: "skill:Editable", content: "after" });
    await answerApproval(h, "allow");
    await pending;

    const skill = (await listSkills(process.env)).find((entry) => entry.meta.name === "Editable");
    expect(skill?.body.trim()).toBe("after");
    expect(skill?.meta.description).toBe("keeps this");
  });

  it("does not write when denied, and 404s a memory that is not there", async () => {
    const path = await memory("10.md", "same");
    const pending = h.post("/api/learning/node-edit", { id: "memory:10.md", content: "changed" });
    await answerApproval(h, "deny");
    expect((await pending).status).toBe(403);
    expect(await readFile(path, "utf8")).toBe("same");

    const missing = h.post("/api/learning/node-edit", { id: "memory:99.md", content: "x" });
    await answerApproval(h, "allow");
    expect((await missing).status).toBe(404);
  });
});
