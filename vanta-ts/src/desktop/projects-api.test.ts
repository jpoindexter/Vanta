import { mkdir } from "node:fs/promises";
import { basename, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { startControlHarness, type ControlHarness } from "./__fixtures__/control-harness.js";

let h: ControlHarness;
beforeEach(async () => { h = await startControlHarness(); });
afterEach(async () => { await h.stop(); });

const list = async () => (await h.get("/api/projects")).body as { projects: Array<{ id: string; name: string; path: string; derived: boolean }>; activeId: string | null };

describe("named projects", () => {
  it("derives one project from the working folder when nothing is stored", async () => {
    const { projects, activeId } = await list();
    expect(projects).toEqual([{ id: h.root, name: basename(h.root), path: h.root, createdAt: "", derived: true }]);
    expect(activeId).toBeNull();
  });

  it("creates, renames, activates and deletes a project, keeping the folder", async () => {
    const folder = join(h.root, "acme");
    await mkdir(folder);
    const made = (await h.post("/api/projects/create", { name: "Acme", path: folder })).body.project;
    expect(made).toMatchObject({ name: "Acme", path: folder });
    expect(made.id).toMatch(/^p_[a-f0-9]{12}$/);

    expect((await h.post("/api/projects/rename", { id: made.id, name: "Acme Corp" })).body.project.name).toBe("Acme Corp");
    expect((await h.post("/api/projects/set-active", { id: made.id })).body).toMatchObject({ ok: true, activeId: made.id });
    const after = await list();
    expect(after.activeId).toBe(made.id);
    expect(after.projects.map((p) => [p.name, p.derived])).toEqual([["Acme Corp", false], [basename(h.root), true]]);

    expect((await h.post("/api/projects/delete", { id: made.id })).body).toMatchObject({ ok: true, activeId: null });
    expect((await list()).projects.map((p) => p.derived)).toEqual([true]);
  });

  it("defaults the folder to the working folder and then no longer lists a derived duplicate", async () => {
    const made = (await h.post("/api/projects/create", { name: "Here" })).body.project;
    expect(made.path).toBe(h.root);
    expect((await list()).projects.map((p) => p.name)).toEqual(["Here"]);
  });

  it("accepts the derived project as the active one and clears the pointer with null", async () => {
    expect((await h.post("/api/projects/set-active", { id: h.root })).status).toBe(200);
    expect((await list()).activeId).toBe(h.root);
    await h.post("/api/projects/set-active", { id: null });
    expect((await list()).activeId).toBeNull();
  });

  it("refuses duplicate names, bad folders and unknown ids with actionable errors", async () => {
    await h.post("/api/projects/create", { name: "Acme" });
    expect((await h.post("/api/projects/create", { name: "acme" })).body.error).toMatch(/already exists/);
    expect((await h.post("/api/projects/create", { name: "  " })).status).toBe(400);
    expect((await h.post("/api/projects/create", { name: "Rel", path: "relative/dir" })).body.error).toMatch(/absolute/);
    expect((await h.post("/api/projects/create", { name: "Gone", path: join(h.root, "missing") })).body.error).toMatch(/does not exist/);
    expect((await h.post("/api/projects/rename", { id: "p_deadbeef00", name: "x" })).status).toBe(404);
    expect((await h.post("/api/projects/set-active", { id: "p_deadbeef00" })).status).toBe(404);
    expect((await h.post("/api/projects/delete", { id: "p_deadbeef00" })).status).toBe(404);
  });
});
