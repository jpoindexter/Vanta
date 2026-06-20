import { describe, it, expect } from "vitest";
import {
  addObjective,
  deriveObjectiveId,
  furthestFromTarget,
  keyResultGap,
  keyResultProgress,
  objectiveProgress,
  okrsPath,
  readObjectives,
  updateKeyResult,
  writeObjectives,
  type KeyResult,
  type Objective,
  type OkrStoreFs,
} from "./okr.js";

const NOW = new Date("2026-06-20T12:00:00.000Z");

function kr(name: string, current: number, target: number): KeyResult {
  return { name, current, target };
}

function objective(id: string, keyResults: KeyResult[], departmentId?: string): Objective {
  return {
    id,
    title: id,
    ...(departmentId ? { departmentId } : {}),
    keyResults,
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
  };
}

describe("keyResultProgress", () => {
  it("is current/target clamped into 0..1", () => {
    expect(keyResultProgress(kr("k", 50, 100))).toBe(0.5);
    expect(keyResultProgress(kr("k", 0, 100))).toBe(0);
  });

  it("clamps over-target progress to 1", () => {
    expect(keyResultProgress(kr("k", 250, 100))).toBe(1);
  });

  it("clamps a negative current to 0", () => {
    expect(keyResultProgress(kr("k", -10, 100))).toBe(0);
  });

  it("never returns NaN/Infinity for a non-positive target", () => {
    expect(keyResultProgress(kr("k", 0, 0))).toBe(1); // met (current >= target)
    expect(keyResultProgress(kr("k", -1, 0))).toBe(0); // below
  });
});

describe("objectiveProgress", () => {
  it("averages clamped per-KR progress", () => {
    const obj = objective("o", [kr("a", 50, 100), kr("b", 100, 100)]);
    expect(objectiveProgress(obj)).toBe(0.75); // (0.5 + 1) / 2
  });

  it("is 0 for an objective with no key results", () => {
    expect(objectiveProgress(objective("o", []))).toBe(0);
  });

  it("clamps each KR before averaging (over-target does not inflate)", () => {
    const obj = objective("o", [kr("a", 200, 100), kr("b", 0, 100)]);
    expect(objectiveProgress(obj)).toBe(0.5); // (1 + 0) / 2, not (2 + 0)/2
  });
});

describe("furthestFromTarget (cadence ranking helper)", () => {
  it("picks the key result with the largest remaining gap across objectives", () => {
    const objectives = [
      objective("growth", [kr("signups", 90, 100)], "growth"), // gap 0.1
      objective("revenue", [kr("mrr", 20, 100)], "sales"), // gap 0.8 — furthest
    ];
    const r = furthestFromTarget(objectives);
    expect(r).not.toBeNull();
    expect(r?.objective.id).toBe("revenue");
    expect(r?.keyResult.name).toBe("mrr");
    expect(r?.gap).toBeCloseTo(0.8, 10);
  });

  it("returns null when no objective has any key result", () => {
    expect(furthestFromTarget([objective("o", [])])).toBeNull();
    expect(furthestFromTarget([])).toBeNull();
  });

  it("keeps the first seen on a tie (stable)", () => {
    const objectives = [
      objective("first", [kr("x", 50, 100)]),
      objective("second", [kr("y", 50, 100)]),
    ];
    expect(furthestFromTarget(objectives)?.objective.id).toBe("first");
  });

  it("gap equals 1 - progress", () => {
    expect(keyResultGap(kr("k", 25, 100))).toBe(0.75);
  });
});

describe("addObjective", () => {
  it("creates an objective with department + key results", () => {
    const r = addObjective([], {
      title: "Grow Revenue",
      departmentId: "sales",
      keyResults: [kr("mrr", 10, 100)],
    }, NOW);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.id).toBe("grow-revenue");
    expect(r.value.departmentId).toBe("sales");
    expect(r.value.keyResults).toEqual([kr("mrr", 10, 100)]);
  });

  it("requires a title", () => {
    const r = addObjective([], { title: "  " }, NOW);
    expect(r.ok).toBe(false);
  });

  it("derives a unique id when the slug is taken", () => {
    const existing = [objective("grow-revenue", [])];
    const r = addObjective(existing, { title: "Grow Revenue" }, NOW);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.id).toBe("grow-revenue-2");
  });

  it("omits departmentId when not provided", () => {
    const r = addObjective([], { title: "Solo" }, NOW);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.departmentId).toBeUndefined();
  });
});

describe("deriveObjectiveId", () => {
  it("slugs and de-duplicates with a counter", () => {
    const existing = [objective("growth", []), objective("growth-2", [])];
    expect(deriveObjectiveId(existing, "Growth")).toBe("growth-3");
  });
});

describe("updateKeyResult", () => {
  const seed = (): Objective[] => [objective("rev", [kr("mrr", 10, 100)])];

  it("persists a new current value on an existing key result", () => {
    const r = updateKeyResult(seed(), { objectiveId: "rev", name: "mrr", current: 60 }, NOW);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const obj = r.value[0];
    expect(obj?.keyResults[0]).toEqual(kr("mrr", 60, 100));
    expect(objectiveProgress(obj as Objective)).toBe(0.6);
    expect(obj?.updatedAt).toBe(NOW.toISOString());
  });

  it("upserts a new key result when a target is given", () => {
    const r = updateKeyResult(seed(), { objectiveId: "rev", name: "logos", current: 3, target: 10 }, NOW);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value[0]?.keyResults).toHaveLength(2);
    expect(r.value[0]?.keyResults[1]).toEqual(kr("logos", 3, 10));
  });

  it("errors when the objective is unknown", () => {
    const r = updateKeyResult(seed(), { objectiveId: "nope", name: "mrr", current: 1 }, NOW);
    expect(r.ok).toBe(false);
  });

  it("errors on a new key result without a target", () => {
    const r = updateKeyResult(seed(), { objectiveId: "rev", name: "new-kr", current: 1 }, NOW);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/target/);
  });
});

describe("store (tolerant reader, injected fs)", () => {
  function memFs(files: Map<string, string>): OkrStoreFs {
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

  const env = { VANTA_HOME: "/tmp/vanta-okr-test" } as NodeJS.ProcessEnv;

  it("round-trips objectives", async () => {
    const files = new Map<string, string>();
    const fs = memFs(files);
    const list = [objective("rev", [kr("mrr", 10, 100)], "sales")];
    await writeObjectives(list, env, fs);
    expect(await readObjectives(env, fs)).toEqual(list);
  });

  it("returns [] for a missing file", async () => {
    expect(await readObjectives(env, memFs(new Map()))).toEqual([]);
  });

  it("returns [] for a corrupt file", async () => {
    const files = new Map<string, string>([[okrsPath(env), "{not json"]]);
    expect(await readObjectives(env, memFs(files))).toEqual([]);
  });

  it("drops a malformed entry but keeps the valid rows", async () => {
    const valid = objective("rev", [kr("mrr", 10, 100)]);
    const payload = JSON.stringify({ version: 1, objectives: [valid, { id: "" /* invalid */ }] });
    const files = new Map<string, string>([[okrsPath(env), payload]]);
    const out = await readObjectives(env, memFs(files));
    expect(out).toEqual([valid]);
  });
});
