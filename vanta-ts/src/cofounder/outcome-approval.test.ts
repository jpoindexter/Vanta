import { describe, it, expect } from "vitest";
import {
  appendRevision,
  approveArtifact,
  artifactReviewsPath,
  listPendingArtifacts,
  readRevisions,
  requestRevision,
  writeRevisions,
  type ReviewDeps,
  type ReviewStoreFs,
  type RevisionRecord,
} from "./outcome-approval.js";
import { recordWorkProduct, setApproved, type WorkProduct } from "./work-products.js";

const NOW = new Date("2026-06-20T12:00:00.000Z");

/** Seed one valid work product (throws on the never-taken error path). */
function wp(
  spec?: Partial<Parameters<typeof recordWorkProduct>[1]>,
  existing: WorkProduct[] = [],
  at: Date = NOW,
): WorkProduct {
  const r = recordWorkProduct(
    existing,
    { artifact: "Q3 plan.md", sourceTaskId: "task-7", departmentId: "growth", producedBy: "scout", ...spec },
    at,
  );
  if (!r.ok) throw new Error(r.error);
  return r.value;
}

/** A ReviewDeps whose setApproved/rerunTask/appendRevision close over a mutable list + call log. */
function harness(list: WorkProduct[]) {
  const state = { list };
  const reran: string[] = [];
  const appended: RevisionRecord[] = [];
  const deps: ReviewDeps = {
    setApproved: async (id, approved) => {
      const r = setApproved(state.list, id, approved);
      if (r.ok) state.list = r.value;
      return r;
    },
    rerunTask: async (sourceTaskId) => {
      reran.push(sourceTaskId);
    },
    appendRevision: async (record) => {
      appended.push(record);
    },
    now: () => NOW,
  };
  return { deps, reran, appended, list: () => state.list };
}

describe("listPendingArtifacts", () => {
  it("returns only the not-yet-approved artifacts", () => {
    const a = wp({ departmentId: "a" });
    const b = wp({ departmentId: "b", approved: true });
    const c = wp({ departmentId: "c" });
    const pending = listPendingArtifacts([a, b, c]);
    // same createdAt → id tie-break is ascending; the approved one is excluded
    expect(pending.map((p) => p.id)).toEqual(["a-wp-1", "c-wp-1"]);
    expect(pending.some((p) => p.id === "b-wp-1")).toBe(false); // approved excluded
  });

  it("orders newest-first by createdAt", () => {
    const older = wp({ departmentId: "a" }, [], new Date("2026-06-19T00:00:00.000Z"));
    const newer = wp({ departmentId: "b" }, [], new Date("2026-06-20T00:00:00.000Z"));
    expect(listPendingArtifacts([older, newer]).map((p) => p.id)).toEqual(["b-wp-1", "a-wp-1"]);
  });

  it("returns [] when everything is approved", () => {
    expect(listPendingArtifacts([wp({ approved: true })])).toEqual([]);
  });
});

describe("approveArtifact", () => {
  it("flips the work product's approved state via the injected setApproved", async () => {
    const h = harness([wp()]);
    const r = await approveArtifact("growth-wp-1", h.deps);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.find((p) => p.id === "growth-wp-1")?.approved).toBe(true);
    expect(h.list().find((p) => p.id === "growth-wp-1")?.approved).toBe(true);
  });

  it("returns the error for an unknown work product", async () => {
    const h = harness([wp()]);
    const r = await approveArtifact("nope", h.deps);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain("nope");
  });

  it("rejects a blank id without touching the list", async () => {
    const h = harness([wp()]);
    const r = await approveArtifact("   ", h.deps);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain("required");
  });
});

describe("requestRevision", () => {
  it("records the reason AND re-runs the producing task", async () => {
    const list = [wp({ sourceTaskId: "task-42" })];
    const h = harness(list);
    const r = await requestRevision("growth-wp-1", "tone is off, redo intro", list, h.deps);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toEqual({
      workProductId: "growth-wp-1",
      reason: "tone is off, redo intro",
      at: NOW.toISOString(),
    });
    expect(h.appended).toHaveLength(1);
    expect(h.appended[0]?.reason).toBe("tone is off, redo intro");
    expect(h.reran).toEqual(["task-42"]); // re-runs the PRODUCING task by its sourceTaskId
  });

  it("leaves the artifact pending (does not approve it)", async () => {
    const list = [wp()];
    const h = harness(list);
    await requestRevision("growth-wp-1", "needs work", list, h.deps);
    expect(h.list().find((p) => p.id === "growth-wp-1")?.approved).toBe(false);
  });

  it("errors on an unknown work product, without recording or re-running", async () => {
    const h = harness([wp()]);
    const r = await requestRevision("ghost", "x", [wp()], h.deps);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain("ghost");
    expect(h.appended).toHaveLength(0);
    expect(h.reran).toHaveLength(0);
  });

  it("errors on a blank reason", async () => {
    const list = [wp()];
    const h = harness(list);
    const r = await requestRevision("growth-wp-1", "  ", list, h.deps);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain("reason");
    expect(h.reran).toHaveLength(0);
  });
});

// ---- Store: tolerant reader, injected fs ----

function memFs(seed?: Record<string, string>): ReviewStoreFs {
  const files = new Map<string, string>(Object.entries(seed ?? {}));
  return {
    readFile: async (p) => {
      const v = files.get(p);
      if (v === undefined) throw new Error("ENOENT");
      return v;
    },
    writeFile: async (p, d) => void files.set(p, d),
    mkdir: async () => {},
  };
}

const ENV: NodeJS.ProcessEnv = { VANTA_HOME: "/tmp/vanta-test-home" };

describe("revision store", () => {
  it("reads [] when the file is missing", async () => {
    expect(await readRevisions(ENV, memFs())).toEqual([]);
  });

  it("round-trips written records", async () => {
    const fs = memFs();
    const rec: RevisionRecord = { workProductId: "growth-wp-1", reason: "redo", at: NOW.toISOString() };
    await writeRevisions([rec], ENV, fs);
    expect(await readRevisions(ENV, fs)).toEqual([rec]);
  });

  it("appendRevision adds to the existing log", async () => {
    const fs = memFs();
    const a: RevisionRecord = { workProductId: "growth-wp-1", reason: "a", at: NOW.toISOString() };
    const b: RevisionRecord = { workProductId: "growth-wp-2", reason: "b", at: NOW.toISOString() };
    await appendRevision(a, ENV, fs);
    await appendRevision(b, ENV, fs);
    expect(await readRevisions(ENV, fs)).toEqual([a, b]);
  });

  it("is tolerant: drops malformed rows, keeps valid ones", async () => {
    const good: RevisionRecord = { workProductId: "growth-wp-1", reason: "ok", at: NOW.toISOString() };
    const raw = JSON.stringify({ version: 1, revisions: [good, { reason: "no id" }, 42] });
    const fs = memFs({ [artifactReviewsPath(ENV)]: raw });
    expect(await readRevisions(ENV, fs)).toEqual([good]);
  });

  it("returns [] on corrupt JSON", async () => {
    const fs = memFs({ [artifactReviewsPath(ENV)]: "{not json" });
    expect(await readRevisions(ENV, fs)).toEqual([]);
  });
});
