import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  detectBroken,
  lastKnownGood,
  recordGood,
  readMarkers,
  type CapCheck,
  type RepairMarker,
} from "./detect.js";

// ---------------------------------------------------------------------------
// detectBroken
// ---------------------------------------------------------------------------

describe("detectBroken", () => {
  it("all-ok → healthy for every compartment", () => {
    const checks: CapCheck[] = [
      { name: "kernel", compartment: "brainstem", ok: true },
      { name: "prompt", compartment: "reflexes", ok: true },
      { name: "store", compartment: "memory", ok: true },
    ];
    const result = detectBroken(checks);
    for (const h of result) {
      expect(h.verdict).toBe("healthy");
    }
  });

  it("all-fail → down for the affected compartment", () => {
    const checks: CapCheck[] = [
      { name: "kernel", compartment: "brainstem", ok: false },
      { name: "kernel-http", compartment: "brainstem", ok: false },
    ];
    const result = detectBroken(checks);
    expect(result).toHaveLength(1);
    const row = result.find((h) => h.compartment === "brainstem");
    expect(row).toBeDefined();
    expect(row!.verdict).toBe("down");
  });

  it("mixed → impaired when some but not all checks fail", () => {
    const checks: CapCheck[] = [
      { name: "kernel", compartment: "brainstem", ok: true },
      { name: "manifesto", compartment: "brainstem", ok: false },
    ];
    const result = detectBroken(checks);
    expect(result).toHaveLength(1);
    const row = result.find((h) => h.compartment === "brainstem");
    expect(row).toBeDefined();
    expect(row!.verdict).toBe("impaired");
  });

  it("groups checks by compartment independently", () => {
    const checks: CapCheck[] = [
      { name: "kernel", compartment: "brainstem", ok: true },
      { name: "provider-key", compartment: "limbs", ok: false },
    ];
    const result = detectBroken(checks);
    const bs = result.find((h) => h.compartment === "brainstem");
    const lm = result.find((h) => h.compartment === "limbs");
    expect(bs?.verdict).toBe("healthy");
    expect(lm?.verdict).toBe("down");
  });

  it("returns empty array for empty input", () => {
    expect(detectBroken([])).toEqual([]);
  });

  it("preserves check detail in result", () => {
    const checks: CapCheck[] = [
      { name: "kernel", compartment: "brainstem", ok: false, detail: "ECONNREFUSED" },
    ];
    const result = detectBroken(checks);
    const row = result.find((h) => h.compartment === "brainstem");
    expect(row).toBeDefined();
    expect(row!.checks[0]?.detail).toBe("ECONNREFUSED");
  });
});

// ---------------------------------------------------------------------------
// lastKnownGood
// ---------------------------------------------------------------------------

describe("lastKnownGood", () => {
  it("returns newest sha per compartment", () => {
    const records: RepairMarker[] = [
      { compartment: "limbs", sha: "aaa", ts: "2024-01-01T00:00:00.000Z" },
      { compartment: "limbs", sha: "bbb", ts: "2024-01-02T00:00:00.000Z" },
    ];
    const result = lastKnownGood(records);
    expect(result.limbs).toBe("bbb");
  });

  it("handles multiple compartments independently", () => {
    const records: RepairMarker[] = [
      { compartment: "brainstem", sha: "c1", ts: "2024-01-01T00:00:00.000Z" },
      { compartment: "memory", sha: "c2", ts: "2024-01-01T00:00:00.000Z" },
      { compartment: "brainstem", sha: "c3", ts: "2024-01-02T00:00:00.000Z" },
    ];
    const result = lastKnownGood(records);
    expect(result.brainstem).toBe("c3");
    expect(result.memory).toBe("c2");
  });

  it("returns empty object for empty input", () => {
    expect(lastKnownGood([])).toEqual({});
  });

  it("picks the latest by ts string ordering", () => {
    const records: RepairMarker[] = [
      { compartment: "reflexes", sha: "old", ts: "2024-06-01T00:00:00.000Z" },
      { compartment: "reflexes", sha: "new", ts: "2024-12-01T00:00:00.000Z" },
    ];
    expect(lastKnownGood(records).reflexes).toBe("new");
  });
});

// ---------------------------------------------------------------------------
// Store: recordGood + readMarkers
// ---------------------------------------------------------------------------

let home: string;
let env: NodeJS.ProcessEnv;

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "vanta-repair-"));
  env = { VANTA_HOME: home };
});

afterEach(async () => {
  await rm(home, { recursive: true }).catch(() => {});
});

describe("recordGood / readMarkers", () => {
  it("round-trips a single marker", async () => {
    await recordGood({ compartment: "limbs", sha: "abc123" }, env);
    const markers = await readMarkers(env);
    expect(markers).toHaveLength(1);
    const m = markers[0];
    expect(m).toBeDefined();
    expect(m!.compartment).toBe("limbs");
    expect(m!.sha).toBe("abc123");
    expect(m!.ts).toBeTruthy();
  });

  it("appends multiple markers in order", async () => {
    await recordGood({ compartment: "brainstem", sha: "sha1" }, env);
    await recordGood({ compartment: "memory", sha: "sha2" }, env);
    const markers = await readMarkers(env);
    expect(markers).toHaveLength(2);
    expect(markers[0]?.compartment).toBe("brainstem");
    expect(markers[1]?.compartment).toBe("memory");
  });

  it("readMarkers returns [] when file missing", async () => {
    const markers = await readMarkers(env);
    expect(markers).toEqual([]);
  });

  it("silently drops malformed lines", async () => {
    const { appendFile, mkdir } = await import("node:fs/promises");
    const { join: pjoin } = await import("node:path");
    await mkdir(home, { recursive: true });
    // write one bad line and one good line
    await appendFile(pjoin(home, "repair.jsonl"), '{"bad":true}\n{"compartment":"reflexes","sha":"abc","ts":"2024-01-01T00:00:00.000Z"}\n', "utf8");
    const markers = await readMarkers(env);
    expect(markers).toHaveLength(1);
    expect(markers[0]?.compartment).toBe("reflexes");
  });
});
