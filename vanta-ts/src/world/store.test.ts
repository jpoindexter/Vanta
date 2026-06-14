import { afterEach, beforeEach, describe, it, expect } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appendWorld, readWorld, latestEntities, queryEntities, relationsOf } from "./store.js";

describe("world store", () => {
  let env: NodeJS.ProcessEnv;
  let home: string;
  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "vanta-world-"));
    env = { VANTA_HOME: home } as NodeJS.ProcessEnv;
  });
  afterEach(async () => { await rm(home, { recursive: true, force: true }); });

  it("appends + reads entities and relations", async () => {
    await appendWorld({ kind: "entity", id: "indx", type: "project", name: "Indx", ts: "t1" }, env);
    await appendWorld({ kind: "relation", from: "jason", to: "indx", rel: "owns", ts: "t2" }, env);
    const recs = await readWorld(env);
    expect(latestEntities(recs)).toHaveLength(1);
    expect(relationsOf(recs, "indx")).toHaveLength(1);
  });

  it("latest-write-wins per entity id (append-only)", async () => {
    await appendWorld({ kind: "entity", id: "x", type: "project", name: "Old", ts: "t1" }, env);
    await appendWorld({ kind: "entity", id: "x", type: "project", name: "New", ts: "t2" }, env);
    expect(latestEntities(await readWorld(env))[0]!.name).toBe("New");
  });

  it("queryEntities matches type/name/note; empty q returns all", async () => {
    await appendWorld({ kind: "entity", id: "a", type: "person", name: "Jason", note: "founder", ts: "t1" }, env);
    await appendWorld({ kind: "entity", id: "b", type: "repo", name: "vanta", ts: "t2" }, env);
    const recs = await readWorld(env);
    expect(queryEntities(recs, "founder").map((e) => e.id)).toEqual(["a"]);
    expect(queryEntities(recs, "repo").map((e) => e.id)).toEqual(["b"]);
    expect(queryEntities(recs, "")).toHaveLength(2);
  });

  it("readWorld on a missing file returns []", async () => {
    expect(await readWorld(env)).toEqual([]);
  });
});
