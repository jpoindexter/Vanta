import { describe, it, expect } from "vitest";
import {
  explainVerdict,
  riskLabel,
  buildExplanationPrompt,
  explainPermission,
  type ExplainInput,
} from "./explain.js";

describe("riskLabel", () => {
  it("labels allow as safe", () => {
    expect(riskLabel("allow")).toBe("✓ safe");
  });
  it("labels ask as needs approval", () => {
    expect(riskLabel("ask")).toBe("⚠ needs approval");
  });
  it("labels block as blocked", () => {
    expect(riskLabel("block")).toBe("✕ blocked");
  });
});

describe("explainVerdict — deterministic why", () => {
  it("ask + outside-scope reason → the scope explanation naming the detail", () => {
    const out = explainVerdict({ tool: "write_file", risk: "ask", reason: "outside scope", detail: "/etc/hosts" });
    expect(out).toContain("⚠ needs approval");
    expect(out).toContain("outside the project folder");
    expect(out).toContain("/etc/hosts");
  });

  it("block + destructive reason → the blocked/destructive explanation", () => {
    const out = explainVerdict({ tool: "shell_cmd", risk: "block", reason: "destructive command: rm -rf" });
    expect(out).toContain("✕ blocked");
    expect(out.toLowerCase()).toContain("destructive");
  });

  it("ask + irreversible push reason → a hard-to-undo explanation", () => {
    const out = explainVerdict({ tool: "git_push", risk: "ask", reason: "irreversible push", detail: "push to origin/main" });
    expect(out).toContain("hard to undo");
    expect(out).toContain("push to origin/main");
  });

  it("ask + credential reason → a credentials explanation", () => {
    const out = explainVerdict({ tool: "shell_cmd", risk: "ask", reason: "touches credentials" });
    expect(out.toLowerCase()).toContain("credential");
  });

  it("appends a known tool's note (shell_cmd runs a command)", () => {
    const out = explainVerdict({ tool: "shell_cmd", risk: "ask", reason: "system keyword" });
    expect(out).toContain("shell_cmd runs a command");
  });

  it("write_file note describes a file write", () => {
    const out = explainVerdict({ tool: "write_file", risk: "ask", reason: "outside scope", detail: "~/Desktop/x.txt" });
    expect(out).toContain("write_file creates or overwrites a file");
  });

  it("git push note flags irreversibility", () => {
    const out = explainVerdict({ tool: "git", risk: "ask", reason: "irreversible push" });
    expect(out).toContain("git push is irreversible");
  });

  it("an unknown tool yields a generic-but-useful line (no tool note, still explains)", () => {
    const out = explainVerdict({ tool: "some_unknown_tool", risk: "ask", reason: "outside scope", detail: "/tmp/x" });
    expect(out).toContain("outside the project folder");
    // no parenthetical tool note for an unknown tool
    expect(out).not.toContain("(");
  });

  it("ask with no reason falls back to a risk-only approval explanation", () => {
    const out = explainVerdict({ tool: "unknown_tool", risk: "ask", detail: "/tmp/y" });
    expect(out).toContain("needs your approval");
    expect(out).toContain("/tmp/y");
  });

  it("allow with no reason reads as read-only/reversible", () => {
    const out = explainVerdict({ tool: "read_file", risk: "allow" });
    expect(out).toContain("✓ safe");
    expect(out.toLowerCase()).toMatch(/read-only|reversible/);
  });

  it("block with no reason falls back to a destructive/irreversible explanation", () => {
    const out = explainVerdict({ tool: "shell_cmd", risk: "block" });
    expect(out).toContain("✕ blocked");
    expect(out.toLowerCase()).toMatch(/destructive|irreversible/);
  });

  it("an unrecognized reason is surfaced verbatim (already control-stripped)", () => {
    const out = explainVerdict({ tool: "read_file", risk: "ask", reason: "some bespoke kernel reason" });
    expect(out.toLowerCase()).toContain("some bespoke kernel reason");
  });
});

describe("explainVerdict — control-stripping untrusted text", () => {
  it("strips ANSI/control chars from the reason (printable text survives)", () => {
    const out = explainVerdict({ tool: "read_file", risk: "ask", reason: "weird\x1b[31mred\x00reason" });
    expect(out).not.toContain("\x1b");
    expect(out).not.toContain("\x00");
    // the verbatim-reason path capitalizes the first char; printable bytes remain
    expect(out).toContain("red");
    expect(out).toContain("reason");
  });

  it("strips control chars from the detail", () => {
    const out = explainVerdict({ tool: "write_file", risk: "ask", reason: "outside scope", detail: "/etc/\x1b]0;evil\x07passwd" });
    expect(out).not.toContain("\x1b");
    expect(out).not.toContain("\x07");
  });

  it("caps an absurdly long detail (no unbounded echo)", () => {
    const out = explainVerdict({ tool: "write_file", risk: "ask", reason: "outside scope", detail: "a".repeat(5_000) });
    expect(out.length).toBeLessThan(600);
    expect(out).toContain("…");
  });
});

describe("buildExplanationPrompt", () => {
  it("includes the verdict, tool, reason, detail and the deterministic baseline", () => {
    const input: ExplainInput = { tool: "git_push", risk: "ask", reason: "irreversible push", detail: "origin/main" };
    const prompt = buildExplanationPrompt(input);
    expect(prompt).toContain("git_push");
    expect(prompt).toContain("ask");
    expect(prompt).toContain("irreversible push");
    expect(prompt).toContain("origin/main");
    expect(prompt).toContain(explainVerdict(input));
    // instructs the model NOT to re-decide
    expect(prompt.toLowerCase()).toContain("do not decide");
  });

  it("control-strips untrusted reason/detail into the prompt too", () => {
    const prompt = buildExplanationPrompt({ tool: "x", risk: "ask", reason: "bad\x1bvalue", detail: "p\x00ath" });
    expect(prompt).not.toContain("\x1b");
    expect(prompt).not.toContain("\x00");
  });
});

describe("explainPermission — best-effort enrichment, never re-decides", () => {
  const input: ExplainInput = { tool: "write_file", risk: "ask", reason: "outside scope", detail: "/etc/hosts" };

  it("returns the deterministic text when no completer is injected", async () => {
    const out = await explainPermission(input);
    expect(out).toBe(explainVerdict(input));
  });

  it("returns the enriched text when the completer succeeds", async () => {
    const enriched = "Approving this lets the tool write to /etc/hosts, which is outside your project.";
    const out = await explainPermission(input, { complete: async () => enriched });
    expect(out).toBe(enriched);
  });

  it("falls back to deterministic when the completer throws", async () => {
    const out = await explainPermission(input, {
      complete: async () => {
        throw new Error("provider down");
      },
    });
    expect(out).toBe(explainVerdict(input));
  });

  it("falls back to deterministic when the completer returns empty", async () => {
    const out = await explainPermission(input, { complete: async () => "   " });
    expect(out).toBe(explainVerdict(input));
  });

  it("control-strips the completer's enriched output (advisory, untrusted)", async () => {
    const out = await explainPermission(input, { complete: async () => "ok\x1b[2Jevil" });
    expect(out).not.toContain("\x1b");
    expect(out).toContain("ok");
  });

  it("never re-decides: a block stays a blocked explanation even with a completer present", async () => {
    const blockInput: ExplainInput = { tool: "shell_cmd", risk: "block", reason: "destructive command" };
    // completer returns nothing usable → deterministic block text is preserved
    const out = await explainPermission(blockInput, { complete: async () => "" });
    expect(out).toContain("✕ blocked");
  });
});
