import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  readUmbrellas,
  pinSkill,
  unpinSkill,
  resolveUmbrella,
} from "./umbrella.js";

const VANTA_HOME = join(tmpdir(), "vanta-umbrella-test");
const env = { ...process.env, VANTA_HOME };

describe("umbrella", () => {
  beforeEach(async () => {
    await rm(VANTA_HOME, { recursive: true, force: true });
  });

  afterEach(async () => {
    await rm(VANTA_HOME, { recursive: true, force: true });
  });

  it("readUmbrellas returns [] for missing file", async () => {
    const result = await readUmbrellas(env);
    expect(result).toEqual([]);
  });

  it("pinSkill creates umbrella with pinned skill", async () => {
    await pinSkill("testing", "jest-basics", env);
    const umbrellas = await readUmbrellas(env);
    expect(umbrellas).toHaveLength(1);
    expect(umbrellas[0]).toEqual({ name: "testing", pins: ["jest-basics"] });
  });

  it("pinSkill deduplicates — pinning the same slug twice keeps only one", async () => {
    await pinSkill("testing", "jest-basics", env);
    await pinSkill("testing", "jest-basics", env);
    const umbrellas = await readUmbrellas(env);
    expect(umbrellas[0]?.pins).toEqual(["jest-basics"]);
  });

  it("unpinSkill removes the skill from the umbrella", async () => {
    await pinSkill("testing", "jest-basics", env);
    await pinSkill("testing", "vitest-patterns", env);
    await unpinSkill("testing", "jest-basics", env);
    const umbrellas = await readUmbrellas(env);
    expect(umbrellas[0]?.pins).toEqual(["vitest-patterns"]);
  });

  it("unpinSkill deletes the umbrella when it becomes empty", async () => {
    await pinSkill("testing", "jest-basics", env);
    await unpinSkill("testing", "jest-basics", env);
    const umbrellas = await readUmbrellas(env);
    expect(umbrellas).toHaveLength(0);
  });

  it("resolveUmbrella returns [] for an unknown name", () => {
    const result = resolveUmbrella("nonexistent", []);
    expect(result).toEqual([]);
  });

  it("resolveUmbrella returns the pin list for a known umbrella", () => {
    const umbrellas = [
      { name: "testing", pins: ["jest-basics", "vitest-patterns"] },
    ];
    expect(resolveUmbrella("testing", umbrellas)).toEqual([
      "jest-basics",
      "vitest-patterns",
    ]);
  });
});
