import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  formatRalphContinuityBlock,
  readRalphState,
  selectNextIncompleteFeature,
  updateFeatureStatus,
  writeRalphState,
} from "./state.js";
import type { RalphState } from "./state.js";

const SAMPLE: RalphState = {
  goal: "Ship durable long-task continuity",
  features: [
    { id: "a", title: "Persist state", status: "done" },
    { id: "b", title: "Inject paused prompt", status: "in_progress", files: ["src/prompt.ts"] },
    { id: "c", title: "Drop stale work", status: "pending" },
  ],
  lastSummary: "State module designed.",
  nextAction: "Wire startup prompt.",
  relevantFiles: ["src/session.ts"],
  updatedAt: "2026-06-15T10:00:00.000Z",
};

describe("Ralph loop state", () => {
  let dataDir: string;

  beforeEach(async () => {
    dataDir = await mkdtemp(join(tmpdir(), "vanta-ralph-"));
  });
  afterEach(async () => {
    await rm(dataDir, { recursive: true, force: true });
  });

  it("write + read round-trips validated state", async () => {
    await writeRalphState(dataDir, SAMPLE);
    await expect(readRalphState(dataDir)).resolves.toEqual(SAMPLE);
  });

  it("returns null for missing, malformed, or invalid state files", async () => {
    await expect(readRalphState(dataDir)).resolves.toBeNull();
    await writeFile(join(dataDir, "ralph-loop.json"), "{ broken", "utf8");
    await expect(readRalphState(dataDir)).resolves.toBeNull();
    await writeFile(join(dataDir, "ralph-loop.json"), JSON.stringify({ goal: "" }), "utf8");
    await expect(readRalphState(dataDir)).resolves.toBeNull();
  });

  it("selects the highest-priority incomplete feature", () => {
    expect(selectNextIncompleteFeature(SAMPLE)?.id).toBe("b");
    const doneOnly = { ...SAMPLE, features: SAMPLE.features.map((f) => ({ ...f, status: "done" as const })) };
    expect(selectNextIncompleteFeature(doneOnly)).toBeNull();
  });

  it("updates feature status and timestamp without mutating the input", () => {
    const updated = updateFeatureStatus(SAMPLE, "b", "blocked", {
      now: "2026-06-15T11:00:00.000Z",
      nextAction: "Ask user for decision.",
    });
    expect(updated.features[1]?.status).toBe("blocked");
    expect(updated.nextAction).toBe("Ask user for decision.");
    expect(updated.updatedAt).toBe("2026-06-15T11:00:00.000Z");
    expect(SAMPLE.features[1]?.status).toBe("in_progress");
  });

  it("formats a paused continuity block with resume/drop instructions", () => {
    const block = formatRalphContinuityBlock(SAMPLE);
    expect(block).toContain("PAUSED");
    expect(block).toContain("Ship durable long-task continuity");
    expect(block).toContain("Inject paused prompt");
    expect(block).toContain("/goal resume");
    expect(block).toContain("/goal drop");
    expect(block).toContain("Do NOT act");
  });

  it("writes pretty JSON to .vanta/ralph-loop.json", async () => {
    await writeRalphState(dataDir, SAMPLE);
    const raw = await readFile(join(dataDir, "ralph-loop.json"), "utf8");
    expect(raw).toContain("\n  \"goal\"");
  });
});
