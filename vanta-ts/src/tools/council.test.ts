import { describe, it, expect } from "vitest";
import { councilTool } from "./council.js";
import { runCouncil, formatCouncil, COUNCIL_ROLES, type RoleRunner } from "../council/council.js";
import type { ToolContext } from "./types.js";

function ctx(): ToolContext {
  return {
    root: "/tmp/vanta-council",
    safety: {} as ToolContext["safety"],
    requestApproval: async () => true,
  };
}

describe("council tool", () => {
  // The execute path spawns real subagents (LLM/network); that orchestration is
  // unit-tested with an INJECTED runRole in council/council.test.ts. Here we
  // cover the tool surface that needs no network.
  it("describeForSafety is a constant council-run string (kernel gates the spawn)", () => {
    const desc = councilTool.describeForSafety?.({ question: "should we delete prod?" });
    expect(desc).toBe("convene a bounded role council of worker agents");
    expect(desc).not.toContain("delete"); // never leaks the question into the classifier
  });

  it("errors-as-values on a missing question (never throws)", async () => {
    const res = await councilTool.execute({}, ctx());
    expect(res.ok).toBe(false);
    expect(res.output).toContain("question");
  });

  it("errors-as-values on a non-string question", async () => {
    const res = await councilTool.execute({ question: 42 }, ctx());
    expect(res.ok).toBe(false);
    expect(res.output).toContain("question");
  });

  it("schema declares the council tool with a required question", () => {
    expect(councilTool.schema.name).toBe("council");
    expect(councilTool.schema.parameters.required).toContain("question");
  });

  it("formats a runCouncil result the way the tool reports it (with an injected runner)", async () => {
    // Mirrors the tool's output path without spawning: runCouncil → formatCouncil.
    const runRole: RoleRunner = async ({ role, priorAnswers }) =>
      priorAnswers ? `decision after ${priorAnswers.length} lenses` : `${role.name} take`;
    const result = await runCouncil("build vs buy?", { runRole });
    const text = formatCouncil("build vs buy?", result);
    expect(text).toContain("Council on: build vs buy?");
    expect(text).toContain("[Recommendation]");
    expect(text).toContain(`decision after ${COUNCIL_ROLES.length - 1} lenses`);
  });
});
