import { describe, it, expect } from "vitest";
import { classifyPath, compartmentMap } from "./compartments.js";

describe("classifyPath", () => {
  it("classifies src/safety.rs as brainstem/none", () => {
    const r = classifyPath("src/safety.rs");
    expect(r.compartment).toBe("brainstem");
    expect(r.maxAutonomy).toBe("none");
  });

  it("classifies any src/*.rs as brainstem", () => {
    expect(classifyPath("src/app.rs").compartment).toBe("brainstem");
    expect(classifyPath("src/goals.rs").compartment).toBe("brainstem");
  });

  it("classifies Cargo.toml as brainstem/none", () => {
    const r = classifyPath("Cargo.toml");
    expect(r.compartment).toBe("brainstem");
    expect(r.maxAutonomy).toBe("none");
  });

  it("classifies Cargo.lock as brainstem/none", () => {
    expect(classifyPath("Cargo.lock").compartment).toBe("brainstem");
  });

  it("classifies manifesto.md as brainstem/none", () => {
    expect(classifyPath("manifesto.md").compartment).toBe("brainstem");
  });

  it("classifies vanta-ts/src/factory/x.ts as skeleton/none", () => {
    const r = classifyPath("vanta-ts/src/factory/x.ts");
    expect(r.compartment).toBe("skeleton");
    expect(r.maxAutonomy).toBe("none");
  });

  it("classifies vanta-ts/src/prompt.ts as reflexes/review", () => {
    const r = classifyPath("vanta-ts/src/prompt.ts");
    expect(r.compartment).toBe("reflexes");
    expect(r.maxAutonomy).toBe("review");
  });

  it("classifies vanta-ts/src/agent.ts as reflexes/review", () => {
    expect(classifyPath("vanta-ts/src/agent.ts").compartment).toBe("reflexes");
  });

  it("classifies vanta-ts/src/agent/dispatch-tool.ts as reflexes/review", () => {
    expect(classifyPath("vanta-ts/src/agent/dispatch-tool.ts").compartment).toBe("reflexes");
  });

  it("classifies vanta-ts/src/world/store.ts as memory/auto", () => {
    const r = classifyPath("vanta-ts/src/world/store.ts");
    expect(r.compartment).toBe("memory");
    expect(r.maxAutonomy).toBe("auto");
  });

  it("classifies .vanta/events.jsonl as memory/auto", () => {
    expect(classifyPath(".vanta/events.jsonl").compartment).toBe("memory");
  });

  it("classifies vanta-ts/src/brain/brain.ts as memory/auto", () => {
    expect(classifyPath("vanta-ts/src/brain/brain.ts").compartment).toBe("memory");
  });

  it("classifies vanta-ts/src/tools/foo.ts as limbs/auto", () => {
    const r = classifyPath("vanta-ts/src/tools/foo.ts");
    expect(r.compartment).toBe("limbs");
    expect(r.maxAutonomy).toBe("auto");
  });

  it("classifies vanta-ts/src/ui/app.tsx as limbs/auto", () => {
    expect(classifyPath("vanta-ts/src/ui/app.tsx").compartment).toBe("limbs");
  });

  it("classifies vanta-ts/src/repl/handlers.ts as limbs/auto", () => {
    expect(classifyPath("vanta-ts/src/repl/handlers.ts").compartment).toBe("limbs");
  });

  it("includes why text in every result", () => {
    const paths = [
      "src/safety.rs",
      "vanta-ts/src/factory/core.ts",
      "vanta-ts/src/agent.ts",
      "vanta-ts/src/world/store.ts",
      "vanta-ts/src/tools/foo.ts",
    ];
    for (const p of paths) {
      expect(classifyPath(p).why.length).toBeGreaterThan(0);
    }
  });
});

describe("compartmentMap", () => {
  it("returns all 5 compartments", () => {
    const map = compartmentMap();
    expect(map).toHaveLength(5);
    const names = map.map((c) => c.compartment);
    expect(names).toContain("brainstem");
    expect(names).toContain("skeleton");
    expect(names).toContain("reflexes");
    expect(names).toContain("memory");
    expect(names).toContain("limbs");
  });

  it("brainstem and skeleton have maxAutonomy none", () => {
    const map = compartmentMap();
    for (const c of map.filter((m) => m.compartment === "brainstem" || m.compartment === "skeleton")) {
      expect(c.maxAutonomy).toBe("none");
    }
  });

  it("every entry has a non-empty scope", () => {
    for (const c of compartmentMap()) {
      expect(c.scope.length).toBeGreaterThan(0);
    }
  });
});
