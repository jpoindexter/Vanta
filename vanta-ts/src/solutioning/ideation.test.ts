import { describe, expect, it } from "vitest";
import {
  DEFAULT_METHOD,
  METHOD_CATALOG,
  getMethod,
  recommendMethod,
  routeIdeationMethod,
  type IdeationBalance,
  type IdeationDomain,
  type IdeationMethodId,
  type IdeationPhase,
  type IdeationSignals,
  type IdeationSpecificity,
} from "./ideation.js";

const PHASES: IdeationPhase[] = ["discovery", "framing", "generation", "stuck", "validation"];
const DOMAINS: IdeationDomain[] = ["product", "technical", "business", "creative", "process", "writing"];
const SPECIFICITIES: IdeationSpecificity[] = ["vague", "focused", "constrained"];
const BALANCES: IdeationBalance[] = ["feasible", "balanced", "novel"];

const CREATIVE_IDS: IdeationMethodId[] = [
  "polya", "affinity-diagrams", "creative-discipline", "pattern-languages",
  "compression-progress", "volume-generation", "story-skeletons", "oulipo",
  "defamiliarization", "derive-mapping", "chance-remix", "pataphysics",
];

const signals = (
  phase: IdeationPhase,
  domain: IdeationDomain,
  specificity: IdeationSpecificity,
  balance?: IdeationBalance,
): IdeationSignals => ({ phase, domain, specificity, ...(balance ? { balance } : {}) });

describe("METHOD_CATALOG", () => {
  it("contains the twenty-two named ideation methods", () => {
    expect(METHOD_CATALOG).toHaveLength(22);
  });

  it("includes all twelve creative methods", () => {
    const ids = new Set(METHOD_CATALOG.map((m) => m.id));
    for (const id of CREATIVE_IDS) expect(ids.has(id)).toBe(true);
  });

  it("has unique ids", () => {
    const ids = METHOD_CATALOG.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("gives every method an origin, a 0..1 creativity weight, when/when-not, and a multi-step procedure", () => {
    for (const m of METHOD_CATALOG) {
      expect(m.origin.trim().length).toBeGreaterThan(0);
      expect(m.creativity).toBeGreaterThanOrEqual(0);
      expect(m.creativity).toBeLessThanOrEqual(1);
      expect(m.whenToUse.trim().length).toBeGreaterThan(0);
      expect(m.whenNot.trim().length).toBeGreaterThan(0);
      expect(m.procedure.length).toBeGreaterThanOrEqual(3);
      expect(m.procedure.every((step) => step.trim().length > 0)).toBe(true);
    }
  });

  it("is frozen so consumers cannot mutate the shared library", () => {
    expect(Object.isFrozen(METHOD_CATALOG)).toBe(true);
  });
});

describe("getMethod", () => {
  it("resolves a known id to its full entry", () => {
    const m = getMethod("triz");
    expect(m?.id).toBe("triz");
    expect(m?.name).toContain("TRIZ");
  });

  it("returns undefined for an unknown id", () => {
    expect(getMethod("not-a-method" as IdeationMethodId)).toBeUndefined();
  });
});

describe("routeIdeationMethod — base route (unchanged behavior)", () => {
  it("routes any stuck problem to a fixation-breaker regardless of other signals", () => {
    for (const domain of DOMAINS) {
      for (const spec of SPECIFICITIES) {
        expect(routeIdeationMethod(signals("stuck", domain, spec))).toBe("oblique-strategies");
      }
    }
  });

  it("routes a constrained technical trade-off to TRIZ", () => {
    expect(routeIdeationMethod(signals("framing", "technical", "constrained"))).toBe("triz");
    expect(routeIdeationMethod(signals("validation", "technical", "constrained"))).toBe("triz");
  });

  it("lets stuck win over the technical-constrained contradiction rule", () => {
    expect(routeIdeationMethod(signals("stuck", "technical", "constrained"))).toBe("oblique-strategies");
  });

  it("routes discovery to jobs-to-be-done", () => {
    expect(routeIdeationMethod(signals("discovery", "product", "focused"))).toBe("jobs-to-be-done");
  });

  it("routes framing to first-principles", () => {
    expect(routeIdeationMethod(signals("framing", "business", "focused"))).toBe("first-principles");
  });

  it("routes a writing-framing constraint problem to Oulipo", () => {
    expect(routeIdeationMethod(signals("framing", "writing", "focused"))).toBe("oulipo");
  });

  it("routes validation to a premortem", () => {
    expect(routeIdeationMethod(signals("validation", "process", "focused"))).toBe("premortem-inversion");
  });

  it("grounds a vague generation problem in first-principles before diverging", () => {
    expect(routeIdeationMethod(signals("generation", "creative", "vague"))).toBe("first-principles");
  });

  it("routes focused generation by domain to the medium-appropriate family", () => {
    expect(routeIdeationMethod(signals("generation", "technical", "focused"))).toBe("biomimicry");
    expect(routeIdeationMethod(signals("generation", "product", "focused"))).toBe("jobs-to-be-done");
    expect(routeIdeationMethod(signals("generation", "business", "focused"))).toBe("analogy-blending");
    expect(routeIdeationMethod(signals("generation", "creative", "focused"))).toBe("lateral-provocations");
    expect(routeIdeationMethod(signals("generation", "process", "focused"))).toBe("leverage-points");
    expect(routeIdeationMethod(signals("generation", "writing", "focused"))).toBe("story-skeletons");
  });

  it("always returns a catalog method for every signal combo (with and without balance)", () => {
    for (const phase of PHASES) {
      for (const domain of DOMAINS) {
        for (const spec of SPECIFICITIES) {
          expect(getMethod(routeIdeationMethod(signals(phase, domain, spec)))).toBeDefined();
          for (const balance of BALANCES) {
            expect(getMethod(routeIdeationMethod(signals(phase, domain, spec, balance)))).toBeDefined();
          }
        }
      }
    }
  });

  it("falls back to the safe default for an unrecognised phase", () => {
    const weird = signals("unknown" as IdeationPhase, "product", "focused");
    expect(routeIdeationMethod(weird)).toBe(DEFAULT_METHOD);
  });
});

describe("routeIdeationMethod — feasibility↔creativity balance lever", () => {
  it("'balanced' is identical to the unset base route", () => {
    const base = signals("generation", "technical", "focused");
    expect(routeIdeationMethod({ ...base, balance: "balanced" })).toBe(routeIdeationMethod(base));
  });

  it("'novel' escalates to the phase's divergent method", () => {
    expect(routeIdeationMethod(signals("stuck", "product", "vague", "novel"))).toBe("pataphysics");
    expect(routeIdeationMethod(signals("generation", "creative", "focused", "novel"))).toBe("chance-remix");
    expect(routeIdeationMethod(signals("framing", "business", "focused", "novel"))).toBe("defamiliarization");
  });

  it("'feasible' grounds to the phase's buildable method", () => {
    expect(routeIdeationMethod(signals("framing", "product", "vague", "feasible"))).toBe("polya");
    expect(routeIdeationMethod(signals("discovery", "product", "focused", "feasible"))).toBe("affinity-diagrams");
    expect(routeIdeationMethod(signals("stuck", "creative", "vague", "feasible"))).toBe("pattern-languages");
  });
});

describe("recommendMethod", () => {
  it("returns the full method entry for a routed problem", () => {
    const m = recommendMethod(signals("stuck", "creative", "vague"));
    expect(m?.id).toBe("oblique-strategies");
    expect(m?.procedure.length).toBeGreaterThanOrEqual(3);
  });

  it("returns a divergent entry when novelty is requested", () => {
    const m = recommendMethod(signals("generation", "creative", "focused", "novel"));
    expect(m?.id).toBe("chance-remix");
    expect(m?.creativity).toBeGreaterThan(0.7);
  });
});
