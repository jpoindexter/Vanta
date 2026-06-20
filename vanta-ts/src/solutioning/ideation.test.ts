import { describe, expect, it } from "vitest";
import {
  DEFAULT_METHOD,
  METHOD_CATALOG,
  getMethod,
  recommendMethod,
  routeIdeationMethod,
  type IdeationDomain,
  type IdeationMethodId,
  type IdeationPhase,
  type IdeationSignals,
  type IdeationSpecificity,
} from "./ideation.js";

const PHASES: IdeationPhase[] = ["discovery", "framing", "generation", "stuck", "validation"];
const DOMAINS: IdeationDomain[] = ["product", "technical", "business", "creative", "process"];
const SPECIFICITIES: IdeationSpecificity[] = ["vague", "focused", "constrained"];

const signals = (
  phase: IdeationPhase,
  domain: IdeationDomain,
  specificity: IdeationSpecificity,
): IdeationSignals => ({ phase, domain, specificity });

describe("METHOD_CATALOG", () => {
  it("contains the ten named ideation methods", () => {
    expect(METHOD_CATALOG).toHaveLength(10);
  });

  it("has unique ids", () => {
    const ids = METHOD_CATALOG.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("gives every method a when-to-use, when-not, and a multi-step procedure", () => {
    for (const m of METHOD_CATALOG) {
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

describe("routeIdeationMethod", () => {
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
    expect(routeIdeationMethod(signals("stuck", "technical", "constrained"))).toBe(
      "oblique-strategies",
    );
  });

  it("routes discovery to jobs-to-be-done", () => {
    expect(routeIdeationMethod(signals("discovery", "product", "focused"))).toBe("jobs-to-be-done");
  });

  it("routes framing to first-principles", () => {
    expect(routeIdeationMethod(signals("framing", "business", "focused"))).toBe("first-principles");
  });

  it("routes validation to a premortem", () => {
    expect(routeIdeationMethod(signals("validation", "process", "focused"))).toBe(
      "premortem-inversion",
    );
  });

  it("grounds a vague generation problem in first-principles before diverging", () => {
    expect(routeIdeationMethod(signals("generation", "creative", "vague"))).toBe("first-principles");
  });

  it("routes focused generation by domain to the medium-appropriate family", () => {
    expect(routeIdeationMethod(signals("generation", "technical", "focused"))).toBe("biomimicry");
    expect(routeIdeationMethod(signals("generation", "product", "focused"))).toBe("jobs-to-be-done");
    expect(routeIdeationMethod(signals("generation", "business", "focused"))).toBe(
      "analogy-blending",
    );
    expect(routeIdeationMethod(signals("generation", "creative", "focused"))).toBe(
      "lateral-provocations",
    );
    expect(routeIdeationMethod(signals("generation", "process", "focused"))).toBe("leverage-points");
  });

  it("always returns a method id that exists in the catalog for every signal combo", () => {
    for (const phase of PHASES) {
      for (const domain of DOMAINS) {
        for (const spec of SPECIFICITIES) {
          const id = routeIdeationMethod(signals(phase, domain, spec));
          expect(getMethod(id)).toBeDefined();
        }
      }
    }
  });

  it("falls back to the safe default for an unrecognised phase", () => {
    const weird = signals("unknown" as IdeationPhase, "product", "focused");
    expect(routeIdeationMethod(weird)).toBe(DEFAULT_METHOD);
  });
});

describe("recommendMethod", () => {
  it("returns the full method entry for a routed problem", () => {
    const m = recommendMethod(signals("stuck", "creative", "vague"));
    expect(m?.id).toBe("oblique-strategies");
    expect(m?.procedure.length).toBeGreaterThanOrEqual(3);
  });
});
