import { describe, expect, it } from "vitest";
import {
  buildCloseoutPlan,
  formatCloseoutPrompt,
  isRuntimeCodeFile,
  isUiFile,
} from "./visual-closeout.js";

describe("visual verification close-out", () => {
  it("requires screenshot evidence for UI changes", () => {
    const plan = buildCloseoutPlan(["vanta-ts/src/ui/app.tsx", "vanta-ts/src/ui/theme.css"]);
    const prompt = formatCloseoutPrompt(plan);

    expect(plan.hasUi).toBe(true);
    expect(plan.kinds).toContain("visual");
    expect(prompt).toContain("capture a browser screenshot");
    expect(prompt).toContain("cite the screenshot path");
  });

  it("requires command evidence for runtime code changes", () => {
    const plan = buildCloseoutPlan(["vanta-ts/src/tools/shell-cmd.ts"]);
    const prompt = formatCloseoutPrompt(plan);

    expect(plan.hasRuntimeCode).toBe(true);
    expect(plan.kinds).toEqual(["rules", "behavior"]);
    expect(prompt).toContain("representative command/tool call");
  });

  it("does not treat tests or docs as runtime code", () => {
    expect(isRuntimeCodeFile("vanta-ts/src/tools/tools.test.ts")).toBe(false);
    expect(isRuntimeCodeFile("HANDOFF.md")).toBe(false);
    expect(isUiFile("vanta-ts/src/ui/app.test.tsx")).toBe(false);
    expect(isUiFile("docs/design-refs/demo.png")).toBe(false);
  });

  it("keeps docs-only changes to doc proof", () => {
    const plan = buildCloseoutPlan(["AGENTS.md", "vanta-ts/CLAUDE.md"]);

    expect(plan.kinds).toEqual(["docs"]);
    expect(formatCloseoutPrompt(plan)).toContain("changed doc text");
  });
});
