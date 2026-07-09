import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  activeBeliefs,
  addBeliefToStore,
  beliefsPath,
  evidence,
  loadBeliefStore,
  rejectBeliefInStore,
  reviseBeliefInStore,
  saveBeliefStore,
} from "./beliefs.js";

let home: string;
const NOW = new Date("2026-07-10T10:00:00.000Z");

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "vanta-beliefs-"));
});
afterEach(async () => {
  await rm(home, { recursive: true, force: true });
});

function env(): NodeJS.ProcessEnv {
  return { VANTA_HOME: home };
}

function selfReport(text: string) {
  return evidence({ kind: "self_report", sourceRef: "session:s1:turn:2", excerpt: text }, NOW);
}

describe("operator belief store", () => {
  it("round-trips accepted beliefs with provenance across loads", async () => {
    const store = await loadBeliefStore(env());
    const belief = addBeliefToStore(store, {
      statement: "Keep status updates concise",
      facet: "communication",
      status: "accepted",
      confidence: 1,
      evidence: selfReport("I prefer concise status updates"),
    }, { now: NOW, id: () => "belief-one" });
    await saveBeliefStore(store, env());

    const loaded = await loadBeliefStore(env());
    expect(loaded.beliefs[0]).toEqual(belief);
    expect(loaded.beliefs[0]?.evidence[0]?.sourceRef).toBe("session:s1:turn:2");
  });

  it("fails open to an empty store for corrupt or invalid data", async () => {
    await writeFile(beliefsPath(env()), "not-json", "utf8");
    await expect(loadBeliefStore(env())).resolves.toEqual({ version: 1, beliefs: [] });
    await writeFile(beliefsPath(env()), JSON.stringify({ version: 1, beliefs: [{ id: 2 }] }), "utf8");
    await expect(loadBeliefStore(env())).resolves.toEqual({ version: 1, beliefs: [] });
  });

  it("revises a belief without erasing the prior claim or evidence", () => {
    const store = { version: 1 as const, beliefs: [] };
    const first = addBeliefToStore(store, {
      statement: "The user wants detailed answers",
      facet: "communication",
      status: "hypothesis",
      confidence: 0.6,
      evidence: evidence({ kind: "dialectic", sourceRef: "session:s1:turn:4", excerpt: "Please explain that" }, NOW),
    }, { now: NOW, id: () => "old-belief" });
    const revised = reviseBeliefInStore(store, first.id, {
      statement: "The user wants concise answers by default",
      status: "accepted",
      confidence: 1,
      evidence: selfReport("No, keep it concise by default"),
    }, { now: new Date("2026-07-10T11:00:00.000Z"), id: () => "new-belief" });

    expect(first.status).toBe("superseded");
    expect(first.supersededBy).toBe("new-belief");
    expect(revised?.revisionOf).toBe("old-belief");
    expect(revised?.status).toBe("accepted");
    expect(store.beliefs).toHaveLength(2);
  });

  it("keeps rejected and low-confidence hypotheses out of active prompt beliefs", () => {
    const store = { version: 1 as const, beliefs: [] };
    const low = addBeliefToStore(store, {
      statement: "Maybe the user likes long plans",
      facet: "workflow",
      status: "hypothesis",
      confidence: 0.4,
      evidence: evidence({ kind: "observation", sourceRef: "session:s1:turn:8", excerpt: "asked for a plan" }, NOW),
    }, { now: NOW, id: () => "low" });
    const accepted = addBeliefToStore(store, {
      statement: "The user prefers one choice at a time",
      facet: "workflow",
      status: "accepted",
      confidence: 1,
      evidence: selfReport("Give me one choice at a time"),
    }, { now: NOW, id: () => "accepted" });
    rejectBeliefInStore(store, accepted.id, selfReport("That is no longer true"), { now: NOW });

    expect(low.status).toBe("hypothesis");
    expect(activeBeliefs(store)).toEqual([]);
  });
});
