import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeCheckpoint, readCheckpoint, clearCheckpoint } from "./checkpoint.js";
import type { CheckpointData } from "./checkpoint.js";

const SAMPLE: CheckpointData = {
  sessionId: "20260601-120000",
  turnIndex: 3,
  lastGoal: "refactor auth module",
  lastAction: "read_file src/auth.ts",
  savedAt: "2026-06-01T12:00:00.000Z",
};

describe("checkpoint (disk)", () => {
  let dataDir: string;

  beforeEach(async () => {
    dataDir = await mkdtemp(join(tmpdir(), "vanta-cp-"));
  });
  afterEach(async () => {
    await rm(dataDir, { recursive: true, force: true });
  });

  it("write + read round-trips correctly", async () => {
    await writeCheckpoint(dataDir, SAMPLE);
    const result = await readCheckpoint(dataDir);
    expect(result).toEqual(SAMPLE);
  });

  it("readCheckpoint returns null for a missing file", async () => {
    const result = await readCheckpoint(dataDir);
    expect(result).toBeNull();
  });

  it("readCheckpoint returns null for corrupt JSON", async () => {
    const { writeFile } = await import("node:fs/promises");
    await writeFile(join(dataDir, "checkpoint.json"), "{ not valid json", "utf8");
    const result = await readCheckpoint(dataDir);
    expect(result).toBeNull();
  });

  it("clearCheckpoint removes the file", async () => {
    await writeCheckpoint(dataDir, SAMPLE);
    await clearCheckpoint(dataDir);
    const result = await readCheckpoint(dataDir);
    expect(result).toBeNull();
  });

  it("clearCheckpoint is idempotent on a missing file", async () => {
    await expect(clearCheckpoint(dataDir)).resolves.toBeUndefined();
  });
});
