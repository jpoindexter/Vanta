import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appendPlay, loadPlays, matchingPlays, formatPlay, playbookDigest } from "./playbook.js";

let home: string;
let env: NodeJS.ProcessEnv;
const origHome = process.env.VANTA_HOME;

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "vanta-playbook-"));
  env = { ...process.env, VANTA_HOME: home };
});

afterEach(async () => {
  if (origHome === undefined) delete process.env.VANTA_HOME;
  else process.env.VANTA_HOME = origHome;
  await rm(home, { recursive: true, force: true });
});

describe("appendPlay / loadPlays", () => {
  it("roundtrips a play through the JSONL store", async () => {
    await appendPlay({ task: "deploy to prod", strategy: "blue-green swap", outcome: "zero downtime", tags: ["deploy"] }, env);
    const plays = await loadPlays(env);
    expect(plays).toHaveLength(1);
    const p0 = plays[0]!;
    expect(p0.task).toBe("deploy to prod");
    expect(p0.strategy).toBe("blue-green swap");
    expect(p0.tags).toEqual(["deploy"]);
    expect(p0.useCount).toBe(0);
  });

  it("returns [] when the store file does not exist", async () => {
    expect(await loadPlays(env)).toEqual([]);
  });

  it("latest record per id wins (idempotent upsert simulation)", async () => {
    const { appendFileSync } = await import("node:fs");
    const { join: pathJoin } = await import("node:path");
    const p = await appendPlay({ task: "t", strategy: "s", outcome: "o", tags: [] }, env);
    const updated = { ...p, strategy: "s2", updated: Date.now() + 1000 };
    appendFileSync(pathJoin(home, "playbook.jsonl"), JSON.stringify(updated) + "\n");
    const plays = await loadPlays(env);
    expect(plays).toHaveLength(1);
    expect(plays[0]!.strategy).toBe("s2");
  });
});

describe("matchingPlays", () => {
  it("ranks by token overlap score", () => {
    const p1 = { id: "1", task: "deploy rust binary", strategy: "cargo build --release", outcome: "ok", tags: [], useCount: 0, created: 0, updated: 0 };
    const p2 = { id: "2", task: "write tests for api", strategy: "vitest + fixtures", outcome: "ok", tags: ["test"], useCount: 0, created: 0, updated: 0 };
    const p3 = { id: "3", task: "deploy docker container", strategy: "docker compose up", outcome: "ok", tags: ["deploy"], useCount: 0, created: 0, updated: 0 };
    const matches = matchingPlays("deploy", [p1, p2, p3]);
    expect(matches.map((p) => p.id)).toContain("1");
    expect(matches.map((p) => p.id)).toContain("3");
    expect(matches.map((p) => p.id)).not.toContain("2");
  });

  it("returns [] when nothing matches", () => {
    const p = { id: "1", task: "deploy binary", strategy: "cargo build", outcome: "ok", tags: [], useCount: 0, created: 0, updated: 0 };
    expect(matchingPlays("typescript lint", [p])).toEqual([]);
  });

  it("respects topK", () => {
    const plays = Array.from({ length: 5 }, (_, i) => ({
      id: String(i), task: `deploy step ${i}`, strategy: "s", outcome: "o", tags: [], useCount: 0, created: i, updated: i,
    }));
    expect(matchingPlays("deploy", plays, 2)).toHaveLength(2);
  });
});

describe("formatPlay", () => {
  it("includes task, strategy, outcome, and tags", () => {
    const s = formatPlay({ id: "x", task: "do X", strategy: "use Y", outcome: "worked", tags: ["a", "b"], useCount: 0, created: 0, updated: 0 });
    expect(s).toContain("do X");
    expect(s).toContain("use Y");
    expect(s).toContain("worked");
    expect(s).toContain("[a, b]");
  });

  it("omits the tag brackets when tags is empty", () => {
    const s = formatPlay({ id: "x", task: "t", strategy: "s", outcome: "o", tags: [], useCount: 0, created: 0, updated: 0 });
    expect(s).not.toContain("[");
  });
});

describe("playbookDigest", () => {
  it("returns empty string when no plays match", async () => {
    await appendPlay({ task: "deploy binary", strategy: "cargo", outcome: "ok", tags: [] }, env);
    const d = await playbookDigest("write unit tests in typescript", env);
    expect(d).toBe("");
  });

  it("returns formatted plays when instruction matches", async () => {
    await appendPlay({ task: "deploy binary", strategy: "cargo build --release", outcome: "shipped", tags: ["deploy"] }, env);
    const d = await playbookDigest("deploy the release binary", env);
    expect(d).toContain("deploy binary");
    expect(d).toContain("cargo build");
  });
});
