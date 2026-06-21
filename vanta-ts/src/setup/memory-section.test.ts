import { describe, expect, it } from "vitest";

import {
  MEMORY_BACKEND_KEY,
  MEMORY_BACKEND_CHOICES,
  MEM0_KEY_ENV,
  FEATURE_TOGGLE_CHOICES,
  buildMemorySection,
  memoryChoiceEnv,
  type MemoryBackendChoice,
} from "./memory-section.js";

function choiceByValue(value: string): MemoryBackendChoice {
  const c = MEMORY_BACKEND_CHOICES.find((m) => m.value === value);
  if (!c) throw new Error(`no memory choice "${value}"`);
  return c;
}

describe("MEMORY_BACKEND_CHOICES", () => {
  it("offers exactly local, drive, mem0, memanto", () => {
    expect(MEMORY_BACKEND_CHOICES.map((c) => c.value)).toEqual(["local", "drive", "mem0", "memanto"]);
  });

  it("local is the default and writes nothing", () => {
    expect(memoryChoiceEnv(choiceByValue("local"))).toEqual({});
  });

  it("drive selects the drive backend via the resolver var (reuses google OAuth, no key)", () => {
    const drive = choiceByValue("drive");
    expect(memoryChoiceEnv(drive)).toEqual({ [MEMORY_BACKEND_KEY]: "drive" });
    expect(drive.needsKey).toBeFalsy();
    expect(drive.note).toMatch(/vanta auth google/i);
  });

  it("mem0 selects mem0 + needs a key, but writes NO key literal in its env", () => {
    const mem0 = choiceByValue("mem0");
    expect(mem0.needsKey).toBe(true);
    expect(memoryChoiceEnv(mem0)).toEqual({ [MEMORY_BACKEND_KEY]: "mem0" });
    // the secret env var is collected via the hidden prompt, never written as a value here
    expect(memoryChoiceEnv(mem0)).not.toHaveProperty(MEM0_KEY_ENV);
  });

  it("memanto selects memanto + a local-first URL (no secret)", () => {
    const memanto = choiceByValue("memanto");
    expect(memoryChoiceEnv(memanto)).toEqual({
      [MEMORY_BACKEND_KEY]: "memanto",
      VANTA_MEMANTO_URL: "http://localhost:8000",
    });
    expect(memanto.needsKey).toBeFalsy();
    expect(memanto.note).toMatch(/local-first/i);
  });

  it("only the resolver var + adapter-real vars are referenced (no invented VANTA_MEMORY_PROVIDER/SYNC)", () => {
    const allKeys = new Set(MEMORY_BACKEND_CHOICES.flatMap((c) => Object.keys(memoryChoiceEnv(c))));
    expect(allKeys).toEqual(new Set([MEMORY_BACKEND_KEY, "VANTA_MEMANTO_URL"]));
    expect(allKeys.has("VANTA_MEMORY_PROVIDER")).toBe(false);
    expect(allKeys.has("VANTA_MEMORY_SYNC")).toBe(false);
  });
});

describe("memoryChoiceEnv", () => {
  it("returns a fresh copy (does not alias the choice's env)", () => {
    const memanto = choiceByValue("memanto");
    const env = memoryChoiceEnv(memanto);
    env.VANTA_MEMANTO_URL = "mutated";
    expect(memoryChoiceEnv(memanto).VANTA_MEMANTO_URL).toBe("http://localhost:8000");
  });

  it("maps every choice to its declared env (local empty, others their keys)", () => {
    expect(MEMORY_BACKEND_CHOICES.map((c) => memoryChoiceEnv(c))).toEqual([
      {},
      { [MEMORY_BACKEND_KEY]: "drive" },
      { [MEMORY_BACKEND_KEY]: "mem0" },
      { [MEMORY_BACKEND_KEY]: "memanto", VANTA_MEMANTO_URL: "http://localhost:8000" },
    ]);
  });
});

describe("buildMemorySection", () => {
  it("has the 'Memory backend' heading keyed on the resolver var", () => {
    const section = buildMemorySection();
    expect(section.header).toBe("Memory backend");
    expect(section.key).toBe(MEMORY_BACKEND_KEY);
    expect(section.intro).toMatch(/memory/i);
  });

  it("produces one setup-sections Choice per memory backend", () => {
    const section = buildMemorySection();
    expect(section.choices).toHaveLength(MEMORY_BACKEND_CHOICES.length);
  });

  it("each choice carries its memory env via the multi-key `env` field", () => {
    const section = buildMemorySection();
    expect(section.choices.map((c) => c.env)).toEqual([
      {},
      { [MEMORY_BACKEND_KEY]: "drive" },
      { [MEMORY_BACKEND_KEY]: "mem0" },
      { [MEMORY_BACKEND_KEY]: "memanto", VANTA_MEMANTO_URL: "http://localhost:8000" },
    ]);
  });

  it("the mem0 choice wires the hidden secret prompt (keyEnv) but no key literal", () => {
    const mem0Choice = buildMemorySection().choices[2];
    expect(mem0Choice?.keyEnv).toBe(MEM0_KEY_ENV);
    expect(mem0Choice?.env).not.toHaveProperty(MEM0_KEY_ENV);
  });

  it("non-mem0 choices carry no secret prompt", () => {
    const section = buildMemorySection();
    for (const value of ["local", "drive", "memanto"]) {
      const idx = MEMORY_BACKEND_CHOICES.findIndex((c) => c.value === value);
      expect(section.choices[idx]?.keyEnv).toBeUndefined();
    }
  });
});

describe("FEATURE_TOGGLE_CHOICES", () => {
  it("offers proactive heartbeat, glimmer, and startup tips against REAL env vars", () => {
    expect(FEATURE_TOGGLE_CHOICES.map((t) => t.envVar)).toEqual([
      "VANTA_PROACTIVE",
      "VANTA_GLIMMER",
      "VANTA_TIPS",
    ]);
  });

  it("proactive + glimmer enable with =1", () => {
    const proactive = FEATURE_TOGGLE_CHOICES.find((t) => t.envVar === "VANTA_PROACTIVE");
    const glimmer = FEATURE_TOGGLE_CHOICES.find((t) => t.envVar === "VANTA_GLIMMER");
    expect(proactive?.on).toEqual({ VANTA_PROACTIVE: "1" });
    expect(glimmer?.on).toEqual({ VANTA_GLIMMER: "1" });
  });

  it("startup tips is marked already-on (default behavior)", () => {
    const tips = FEATURE_TOGGLE_CHOICES.find((t) => t.envVar === "VANTA_TIPS");
    expect(tips?.alwaysOn).toBe(true);
  });

  it("every toggle has a one-line note", () => {
    for (const t of FEATURE_TOGGLE_CHOICES) expect(t.note.length).toBeGreaterThan(0);
  });
});
