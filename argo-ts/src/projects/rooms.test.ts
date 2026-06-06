import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { listRooms, resolveRoom, projectsBaseDir } from "./rooms.js";

describe("project rooms", () => {
  let base: string;
  let env: NodeJS.ProcessEnv;

  beforeEach(async () => {
    base = await mkdtemp(join(tmpdir(), "argo-rooms-test-"));
    env = { ...process.env, VANTA_PROJECTS_DIR: base };
  });

  afterEach(async () => {
    await rm(base, { recursive: true, force: true });
  });

  it("lists one room per subdir, sorted by name", async () => {
    // create out of order to prove the sort
    await mkdir(join(base, "gripe"));
    await mkdir(join(base, "argo"));
    await mkdir(join(base, "brutal"));

    const rooms = await listRooms(env);

    expect(rooms.map((r) => r.name)).toEqual(["argo", "brutal", "gripe"]);
    expect(rooms[0]).toEqual({ name: "argo", path: join(base, "argo") });
  });

  it("resolves a room by exact name and returns null for a miss", async () => {
    await mkdir(join(base, "argo"));
    await mkdir(join(base, "brutal"));

    const hit = await resolveRoom("brutal", env);
    expect(hit).toEqual({ name: "brutal", path: join(base, "brutal") });

    expect(await resolveRoom("nope", env)).toBeNull();
    // exact match only — no fuzzy/prefix matching
    expect(await resolveRoom("arg", env)).toBeNull();
  });

  it("returns [] when the base dir is absent", async () => {
    const missing = join(base, "does-not-exist");
    const absentEnv = { ...process.env, VANTA_PROJECTS_DIR: missing };

    expect(await listRooms(absentEnv)).toEqual([]);
    expect(await resolveRoom("anything", absentEnv)).toBeNull();
  });

  it("defaults the base dir to ~/Documents/GitHub/_active", () => {
    const noOverride = { ...process.env };
    delete noOverride.VANTA_PROJECTS_DIR;

    expect(projectsBaseDir(noOverride).endsWith(join("Documents", "GitHub", "_active"))).toBe(true);
  });
});
