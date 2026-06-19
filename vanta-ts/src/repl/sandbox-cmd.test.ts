import { describe, it, expect } from "vitest";
import { formatSandbox } from "./sandbox-cmd.js";
import { sandboxState, sandboxDoctor } from "../settings/sandbox.js";

describe("formatSandbox — REPL text fallback", () => {
  it("renders the four sections with effective flags", () => {
    const state = sandboxState({}, { VANTA_SANDBOX: "1" });
    const out = formatSandbox(state, sandboxDoctor(state, "darwin"));
    expect(out).toContain("Config");
    expect(out).toContain("Dependencies");
    expect(out).toContain("Doctor");
    expect(out).toContain("Overrides");
    expect(out).toContain("[on]  code-runner sandbox");
    expect(out).toContain("[off] shell-only isolation");
  });

  it("lists dependencies and overrides when present", () => {
    const state = {
      ...sandboxState({}, {}),
      dependencies: ["ripgrep"],
      overrides: [{ tool: "git", rule: "bypass" as const }],
    };
    const out = formatSandbox(state, sandboxDoctor(state, "darwin"));
    expect(out).toContain("• ripgrep");
    expect(out).toContain("↓ git  bypass");
  });

  it("shows (none) for empty deps + overrides", () => {
    const state = sandboxState({}, {});
    const out = formatSandbox(state, sandboxDoctor(state, "darwin"));
    expect(out).toContain("Dependencies (0)");
    expect(out).toContain("Overrides (0)");
    expect(out).toContain("(none)");
  });
});
