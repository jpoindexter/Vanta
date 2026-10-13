import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { answerApproval, startControlHarness, type ControlHarness } from "./__fixtures__/control-harness.js";
import { importSourceError } from "./profiles-api.js";

let h: ControlHarness;
beforeEach(async () => { h = await startControlHarness(); });
afterEach(async () => { await h.stop(); });

const names = async () => (await h.get("/api/profiles")).body.profiles.map((p: { name: string }) => p.name);

async function writeDistribution(dir: string, name: string): Promise<void> {
  await mkdir(join(dir, "skills", "triage"), { recursive: true });
  await writeFile(join(dir, "SOUL.md"), "You triage inbound mail.\n");
  await writeFile(join(dir, "skills", "triage", "SKILL.md"), "# triage\n");
  await writeFile(join(dir, "vanta-profile.json"), JSON.stringify({ version: 1, name, soul: "SOUL.md", skills: ["skills/triage"] }));
}

describe("profiles routes", () => {
  it("lists the implicit default first and marks it the sticky default", async () => {
    const { profiles } = (await h.get("/api/profiles")).body;
    expect(profiles).toHaveLength(1);
    expect(profiles[0]).toMatchObject({ id: "default", isDefault: true, isImplicit: true, home: h.home });
  });

  it("creates, clones, renames, switches and deletes a profile in the real store", async () => {
    expect((await h.post("/api/profiles/create", { name: "Research" })).body).toMatchObject({ ok: true, id: "research" });
    expect((await h.post("/api/profiles/clone", { source: "research", name: "scout" })).status).toBe(200);
    expect(await names()).toEqual(["default", "Research", "scout"]);

    expect((await h.post("/api/profiles/rename", { name: "scout", newName: "Scouting" })).status).toBe(200);
    expect((await h.post("/api/profiles/switch", { name: "research" })).body).toMatchObject({ ok: true, appliesOnRestart: true });
    const after = (await h.get("/api/profiles")).body.profiles;
    expect(after.find((p: { id: string }) => p.id === "research").isDefault).toBe(true);
    expect(after.find((p: { id: string }) => p.id === "default").isDefault).toBe(false);

    expect((await h.post("/api/profiles/set-default", { name: "default" })).status).toBe(200);
    expect((await h.get("/api/profiles")).body.profiles[0].isDefault).toBe(true);

    expect((await h.post("/api/profiles/delete", { name: "scouting" })).body).toMatchObject({ ok: true, archived: true });
    expect(await names()).toEqual(["default", "Research"]);
  });

  it("refuses reserved, duplicate and unknown names with actionable errors", async () => {
    expect((await h.post("/api/profiles/create", { name: "default" })).status).toBe(409);
    await h.post("/api/profiles/create", { name: "dup" });
    expect((await h.post("/api/profiles/create", { name: "dup" })).body.error).toMatch(/already exists/);
    expect((await h.post("/api/profiles/delete", { name: "default" })).status).toBe(409);
    expect((await h.post("/api/profiles/switch", { name: "ghost" })).status).toBe(404);
    expect((await h.post("/api/profiles/create", {})).status).toBe(400);
  });

  it("reads and writes SOUL.md for the default and a named profile", async () => {
    await h.post("/api/profiles/create", { name: "writer" });
    expect((await h.get("/api/profiles/soul?name=writer")).body).toEqual({ content: "", exists: false });
    expect((await h.post("/api/profiles/soul", { name: "writer", content: "Be concise." })).status).toBe(200);
    expect((await h.get("/api/profiles/soul?name=writer")).body).toEqual({ content: "Be concise.", exists: true });
    await h.post("/api/profiles/soul", { name: "default", content: "Base soul" });
    expect(await readFile(join(h.home, "SOUL.md"), "utf8")).toBe("Base soul");
    expect((await h.get("/api/profiles/soul?name=ghost")).status).toBe(404);
  });

  it("exports a validated distribution and re-imports it only after approval", async () => {
    await h.post("/api/profiles/create", { name: "shared" });
    await h.post("/api/profiles/soul", { name: "shared", content: "Shared soul" });
    const exported = (await h.post("/api/profiles/export", { name: "shared" })).body;
    expect(exported.files).toContain("SOUL.md");

    const manifestPath = join(exported.path, "vanta-profile.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    await writeFile(manifestPath, JSON.stringify({ ...manifest, name: "Shared Copy" }));

    const pending = h.post("/api/profiles/import", { source: exported.path });
    const shown = await answerApproval(h, "allow");
    expect(shown.toolName).toBe("profile_import");
    expect(shown.request.fresh).toBe(true);
    expect(shown.action).toContain("SOUL.md");
    expect((await pending).body).toMatchObject({ ok: true, id: "shared-copy" });
    expect((await h.get("/api/profiles/soul?name=shared-copy")).body.content).toBe("Shared soul");
  });

  it("installs nothing when the import approval is denied", async () => {
    const dir = join(h.root, "dist");
    await writeDistribution(dir, "Triage");
    const pending = h.post("/api/profiles/import", { source: dir });
    await answerApproval(h, "deny");
    expect((await pending).status).toBe(403);
    expect(await names()).toEqual(["default"]);
  });

  it("refuses an approval-gated import when no window could show the approval", async () => {
    await h.stop();
    h = await startControlHarness({ listen: false });
    const dir = join(h.root, "dist");
    await writeDistribution(dir, "Triage");
    const answer = await h.post("/api/profiles/import", { source: dir });
    expect(answer.status).toBe(409);
    expect(answer.body.error).toMatch(/Open a chat/);
    expect(await names()).toEqual(["default"]);
  });

  it("rejects option-shaped and non-https remote import sources", async () => {
    expect(importSourceError("--upload-pack=evil")).toMatch(/'-'/);
    expect(importSourceError("git@github.com:a/b.git")).toMatch(/absolute directory/);
    expect(importSourceError("ext::sh -c id")).toMatch(/absolute directory/);
    expect(importSourceError("https://github.com/a/b.git")).toBeNull();
    expect(importSourceError("/tmp/dist")).toBeNull();
    expect((await h.post("/api/profiles/import", { source: "file:///etc" })).status).toBe(400);
  });
});
