import { describe, it, expect } from "vitest";
import {
  buildOnboardingSteps,
  needsOnboarding,
  renderOnboarding,
  type OnboardingState,
} from "./project-onboarding.js";

const FRESH: OnboardingState = {
  hasModel: false,
  hasGoal: false,
  hasProjectContext: false,
  hasVantaDir: false,
};

const CONFIGURED: OnboardingState = {
  hasModel: true,
  hasGoal: true,
  hasProjectContext: true,
  hasVantaDir: true,
};

describe("buildOnboardingSteps", () => {
  it("returns the four steps in a fixed setup order", () => {
    const ids = buildOnboardingSteps(FRESH).map((s) => s.id);
    expect(ids).toEqual(["model", "goal", "context", "tools"]);
  });

  it("marks every step undone for a fresh project", () => {
    expect(buildOnboardingSteps(FRESH).every((s) => !s.done)).toBe(true);
  });

  it("marks every step done for a fully configured project", () => {
    expect(buildOnboardingSteps(CONFIGURED).every((s) => s.done)).toBe(true);
  });

  it("flags done per the matching state flag, independently", () => {
    const steps = buildOnboardingSteps({
      hasModel: true,
      hasGoal: false,
      hasProjectContext: true,
      hasVantaDir: false,
    });
    const byId = Object.fromEntries(steps.map((s) => [s.id, s.done]));
    expect(byId).toEqual({ model: true, goal: false, context: true, tools: false });
  });

  it("gives every step a one-line how", () => {
    for (const step of buildOnboardingSteps(FRESH)) {
      expect(step.how.trim().length).toBeGreaterThan(0);
      expect(step.how.includes("\n")).toBe(false);
    }
  });

  it("points the model step at `vanta setup` and the goal step at `vanta goals add`", () => {
    const byId = Object.fromEntries(buildOnboardingSteps(FRESH).map((s) => [s.id, s.how]));
    expect(byId.model).toContain("vanta setup");
    expect(byId.goal).toContain("vanta goals add");
    expect(byId.context).toContain("/init");
  });
});

describe("needsOnboarding", () => {
  it("is true for a fresh project (no model, no goal, no .vanta dir)", () => {
    expect(needsOnboarding(FRESH)).toBe(true);
  });

  it("is true when a core step is undone (model picked, goal not seeded)", () => {
    expect(needsOnboarding({ ...FRESH, hasModel: true })).toBe(true);
  });

  it("is false once all core steps are done, even with no .vanta dir", () => {
    expect(needsOnboarding({ ...FRESH, hasModel: true, hasGoal: true })).toBe(false);
  });

  it("is false when the project has been run in before (a .vanta dir exists)", () => {
    expect(needsOnboarding({ ...FRESH, hasVantaDir: true })).toBe(false);
  });

  it("is false for a fully configured project (no onboarding)", () => {
    expect(needsOnboarding(CONFIGURED)).toBe(false);
  });

  it("does not count optional steps (context/tools) as a reason to onboard", () => {
    // both core steps done; only the optional context step is undone
    expect(
      needsOnboarding({ hasModel: true, hasGoal: true, hasProjectContext: false, hasVantaDir: false }),
    ).toBe(false);
  });
});

describe("renderOnboarding", () => {
  it("renders a header plus one ☐ line per undone step with the how", () => {
    const out = renderOnboarding(buildOnboardingSteps(FRESH));
    expect(out).toContain("◇ Get started:");
    expect(out).toContain("☐ pick a model backend — run `vanta setup`");
    // four steps -> four checklist lines + the header
    expect(out.split("\n")).toHaveLength(5);
  });

  it("uses ☑ for done steps and ☐ for undone steps in the same list", () => {
    const out = renderOnboarding(
      buildOnboardingSteps({
        hasModel: true,
        hasGoal: false,
        hasProjectContext: false,
        hasVantaDir: false,
      }),
    );
    expect(out).toContain("☑ pick a model backend");
    expect(out).toContain("☐ seed a first goal");
  });

  it("shows the how for every rendered step", () => {
    const out = renderOnboarding(buildOnboardingSteps(FRESH));
    expect(out).toContain("run `/init`");
    expect(out).toContain("/help");
  });

  it("returns an empty string for no steps", () => {
    expect(renderOnboarding([])).toBe("");
  });
});

describe("the onboarding flow end-to-end", () => {
  it("a fresh project needs onboarding and renders a non-empty checklist", () => {
    expect(needsOnboarding(FRESH)).toBe(true);
    expect(renderOnboarding(buildOnboardingSteps(FRESH)).length).toBeGreaterThan(0);
  });

  it("a configured project needs no onboarding -> host shows no checklist", () => {
    expect(needsOnboarding(CONFIGURED)).toBe(false);
    // all steps done, so even if rendered it's all ☑ — but the host gates on
    // needsOnboarding and never renders it.
    const out = renderOnboarding(buildOnboardingSteps(CONFIGURED));
    expect(out).not.toContain("☐");
  });
});
