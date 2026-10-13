import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { dataDirFor } from "../cli/ops.js";
import { recordLearning } from "../learning/ledger.js";
import { readSkillOverrides } from "../skills/enable-state.js";
import { LEARNED_TAG, listSkills, writeSkill } from "../skills/store.js";
import { answerApproval, startControlHarness, type ControlHarness } from "./__fixtures__/control-harness.js";

let h: ControlHarness;
beforeEach(async () => {
  h = await startControlHarness();
  delete process.env.VANTA_SKILL_REGISTRY;
});
afterEach(async () => { delete process.env.VANTA_SKILL_REGISTRY; await h.stop(); });

const rows = async () => (await h.get("/api/skills")).body as Array<{ name: string; enabled: boolean; provenance: string; usage: number; category: string }>;

async function registryWith(slug: string, content: string): Promise<string> {
  const dir = join(h.root, "registry");
  await mkdir(join(dir, slug), { recursive: true });
  await writeFile(join(dir, slug, "SKILL.md"), content);
  const sha256 = createHash("sha256").update(content).digest("hex");
  await writeFile(join(dir, "index.json"), JSON.stringify({ version: 1, skills: [{ slug, name: slug, version: "1.0.0", description: "A registry skill", source: `${slug}/SKILL.md`, sha256, files: [] }] }));
  return join(dir, "index.json");
}

describe("skills list and toggle", () => {
  it("lists installed skills with provenance, category, usage and enabled state", async () => {
    await writeSkill({ name: "Invoice triage", description: "Triage invoices", body: "steps", tags: ["finance"] }, { env: process.env });
    await writeSkill({ name: "Learned trick", description: "Found it", body: "steps", tags: [LEARNED_TAG] }, { env: process.env });
    await recordLearning(dataDirFor(h.root), { ts: "2026-10-13T09:00:00Z", skill: "Learned trick", kind: "reused", adopted: true, reason: "x" });
    await recordLearning(dataDirFor(h.root), { ts: "2026-10-13T10:00:00Z", skill: "Learned trick", kind: "reused", adopted: true, reason: "x" });

    const list = await rows();
    expect(list.find((row) => row.name === "Invoice triage")).toMatchObject({ enabled: true, provenance: "external", category: "finance", usage: 0 });
    expect(list.find((row) => row.name === "Learned trick")).toMatchObject({ provenance: "agent", usage: 2, category: "general" });
  });

  it("turns a skill off and on by writing only skillOverrides to user settings", async () => {
    await writeSkill({ name: "Noisy", description: "d", body: "b" }, { env: process.env });
    await writeFile(join(h.home, "settings.json"), JSON.stringify({ allowedTools: ["read_file"] }));

    expect((await h.post("/api/skills/toggle", { name: "Noisy", enabled: false })).body).toMatchObject({ ok: true, enabled: false });
    expect((await rows()).find((row) => row.name === "Noisy")?.enabled).toBe(false);
    expect(await readSkillOverrides(process.env)).toEqual({ Noisy: { disabled: true } });
    expect(JSON.parse(await readFile(join(h.home, "settings.json"), "utf8")).allowedTools).toEqual(["read_file"]);

    await h.post("/api/skills/toggle", { name: "Noisy", enabled: true });
    expect((await rows()).find((row) => row.name === "Noisy")?.enabled).toBe(true);
    expect(JSON.parse(await readFile(join(h.home, "settings.json"), "utf8")).skillOverrides).toBeUndefined();
  });

  it("keeps a disabled skill out of the model-facing recall", async () => {
    await writeSkill({ name: "Secret sauce", description: "make the sauce", body: "stir" }, { env: process.env });
    const { recallTool } = await import("../tools/recall.js");
    expect((await recallTool.execute({ query: "sauce" }, { root: h.root } as never)).output).toContain("Secret sauce");
    await h.post("/api/skills/toggle", { name: "Secret sauce", enabled: false });
    expect((await recallTool.execute({ query: "sauce" }, { root: h.root } as never)).output).toBe("(no matching skills)");
  });

  it("rejects an unknown skill and a malformed toggle", async () => {
    expect((await h.post("/api/skills/toggle", { name: "ghost", enabled: false })).status).toBe(404);
    expect((await h.post("/api/skills/toggle", { name: "x" })).status).toBe(400);
  });
});

describe("skills install", () => {
  it("installs a registry skill only after approval that names the exact package", async () => {
    process.env.VANTA_SKILL_REGISTRY = await registryWith("useful", "---\nname: useful\ndescription: A registry skill\ncreated: 2026-10-13T00:00:00Z\nupdated: 2026-10-13T00:00:00Z\ntags: []\n---\nDo the thing.\n");
    const pending = h.post("/api/skills/install", { slug: "useful" });
    const shown = await answerApproval(h, "allow");
    expect(shown).toMatchObject({ toolName: "skill_install" });
    expect(shown.action).toMatch(/install skill useful v1\.0\.0 from .*index\.json \(sha256:[a-f0-9]{12}, 1 file/);
    expect(shown.request.fresh).toBe(true);
    expect((await pending).body).toMatchObject({ ok: true, name: "useful", status: "active" });
    expect((await listSkills(process.env)).map((skill) => skill.meta.name)).toContain("useful");
    expect((await rows()).find((row) => row.name === "useful")?.provenance).toBe("hub");
  });

  it("installs nothing when approval is denied", async () => {
    process.env.VANTA_SKILL_REGISTRY = await registryWith("useful", "body\n");
    const pending = h.post("/api/skills/install", { slug: "useful" });
    await answerApproval(h, "deny");
    expect((await pending).status).toBe(403);
    expect(await rows()).toEqual([]);
  });

  it("refuses without a configured registry, for unknown slugs, and for tampered content", async () => {
    expect((await h.post("/api/skills/install", { slug: "useful" })).status).toBe(503);
    process.env.VANTA_SKILL_REGISTRY = await registryWith("useful", "original\n");
    expect((await h.post("/api/skills/install", { slug: "ghost" })).status).toBe(404);
    await writeFile(join(h.root, "registry", "useful", "SKILL.md"), "tampered\n");
    expect((await h.post("/api/skills/install", { slug: "useful" })).body.error).toMatch(/integrity/);
    expect((await h.post("/api/skills/install", { slug: "../etc" })).status).toBe(400);
  });
});
