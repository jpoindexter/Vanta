import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rm } from "node:fs/promises";
import { listSkills } from "../skills/store.js";
import { OPERATOR_MODES, installModes } from "./builtin.js";

const HOME = join(tmpdir(), "argo-modes-builtin-test");
const env = { ...process.env, ARGO_HOME: HOME };

const NOW = "2026-06-02T10:00:00.000Z";

const EXPECTED_NAMES = [
  "build-product-slice",
  "research-to-offer",
  "weekly-review",
  "revenue-push",
  "pre-ship-review",
  "inspect-opportunity",
];

describe("operator modes", () => {
  beforeEach(async () => {
    await rm(HOME, { recursive: true, force: true });
  });

  afterEach(async () => {
    await rm(HOME, { recursive: true, force: true });
  });

  it("defines exactly the six expected modes", () => {
    expect(OPERATOR_MODES.map((m) => m.name).sort()).toEqual(
      [...EXPECTED_NAMES].sort(),
    );
  });

  it("installs all six modes and returns their names", async () => {
    const installed = await installModes({ env, now: NOW });
    expect(installed.sort()).toEqual([...EXPECTED_NAMES].sort());
  });

  it("writes six skills retrievable via listSkills", async () => {
    await installModes({ env, now: NOW });
    const names = (await listSkills(env)).map((s) => s.meta.name);
    for (const expected of EXPECTED_NAMES) {
      expect(names).toContain(expected);
    }
    expect(names.length).toBe(EXPECTED_NAMES.length);
  });

  it("stores a real multi-step body for build-product-slice", async () => {
    await installModes({ env, now: NOW });
    const skills = await listSkills(env);
    const slice = skills.find((s) => s.meta.name === "build-product-slice");
    expect(slice).toBeDefined();
    // The body must carry runnable steps that name real tools and the discipline.
    expect(slice?.body).toContain("run_code the test suite");
    expect(slice?.body).toContain("Verify before done");
    expect(slice?.body).toContain("Goal first");
  });

  it("every mode body references goal-before-tool and verify-before-done", () => {
    for (const mode of OPERATOR_MODES) {
      expect(mode.body).toContain("Goal first");
      expect(mode.body).toContain("Verify before done");
    }
  });
});
