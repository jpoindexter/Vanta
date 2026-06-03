import { describe, it, expect } from "vitest";
import { classifyCompartment, compartmentMaxAutonomy, autonomyCapForFiles } from "./compartments.js";

describe("classifyCompartment", () => {
  it("classifies the kernel + factory + manifesto as skeleton", () => {
    expect(classifyCompartment("src/safety.rs")).toBe("skeleton");
    expect(classifyCompartment("Cargo.toml")).toBe("skeleton");
    expect(classifyCompartment("argo-ts/src/factory/run.ts")).toBe("skeleton");
    expect(classifyCompartment("argo-ts/src/factory/compartments.ts")).toBe("skeleton");
    expect(classifyCompartment("MANIFESTO.md")).toBe("skeleton");
  });

  it("classifies the agent loop + its lifeline as brainstem", () => {
    expect(classifyCompartment("argo-ts/src/agent.ts")).toBe("brainstem");
    expect(classifyCompartment("argo-ts/src/providers/openai.ts")).toBe("brainstem");
    expect(classifyCompartment("argo-ts/src/prompt.ts")).toBe("brainstem");
    expect(classifyCompartment("argo-ts/src/context.ts")).toBe("brainstem");
    expect(classifyCompartment("argo-ts/src/session.ts")).toBe("brainstem");
    expect(classifyCompartment("argo-ts/src/safety-client.ts")).toBe("brainstem");
  });

  it("classifies skills as reflexes", () => {
    expect(classifyCompartment("argo-ts/src/skills/recall.ts")).toBe("reflexes");
    expect(classifyCompartment("skills-library/debug/SKILL.md")).toBe("reflexes");
  });

  it("classifies brain + memory as memory", () => {
    expect(classifyCompartment("argo-ts/src/brain/store.ts")).toBe("memory");
    expect(classifyCompartment("argo-ts/src/memory/store.ts")).toBe("memory");
  });

  it("classifies tools + other app code as limbs", () => {
    expect(classifyCompartment("argo-ts/src/tools/web-search.ts")).toBe("limbs");
    expect(classifyCompartment("argo-ts/src/tui/transcript.tsx")).toBe("limbs");
    expect(classifyCompartment("argo-ts/src/status.ts")).toBe("limbs");
    expect(classifyCompartment("argo-ts/src/gateway/run.ts")).toBe("limbs");
  });
});

describe("compartmentMaxAutonomy", () => {
  it("never lets skeleton change autonomously", () => {
    expect(compartmentMaxAutonomy("skeleton")).toBe(0);
  });
  it("caps brainstem at L2 (implement + review only)", () => {
    expect(compartmentMaxAutonomy("brainstem")).toBe(2);
  });
  it("lets limbs / reflexes / memory reach L5 (merge)", () => {
    expect(compartmentMaxAutonomy("limbs")).toBe(5);
    expect(compartmentMaxAutonomy("reflexes")).toBe(5);
    expect(compartmentMaxAutonomy("memory")).toBe(5);
  });
});

describe("autonomyCapForFiles", () => {
  it("a pure-limbs slice permits L5", () => {
    const cap = autonomyCapForFiles(["argo-ts/src/tools/a.ts", "argo-ts/src/tools/a.test.ts"]);
    expect(cap.maxLevel).toBe(5);
    expect(cap.compartment).toBe("limbs");
  });

  it("takes the most restrictive compartment across a mixed slice", () => {
    const cap = autonomyCapForFiles(["argo-ts/src/tools/a.ts", "argo-ts/src/agent.ts"]);
    expect(cap.maxLevel).toBe(2);
    expect(cap.compartment).toBe("brainstem");
  });

  it("a skeleton-touching slice caps at 0", () => {
    const cap = autonomyCapForFiles(["argo-ts/src/tools/a.ts", "src/safety.rs"]);
    expect(cap.maxLevel).toBe(0);
    expect(cap.compartment).toBe("skeleton");
  });

  it("an empty slice is unconstrained (L5)", () => {
    expect(autonomyCapForFiles([]).maxLevel).toBe(5);
  });
});
