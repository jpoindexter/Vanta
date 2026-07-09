import { describe, it, expect } from "vitest";
import {
  CAPABILITY_WORKFLOWS,
  formatWhatCanIDo,
  runColdActivationCheck,
  runWorkflowDemo,
  whatCanIDo,
  workflowViews,
} from "./what-can-i-do-cmd.js";

describe("what-can-i-do workflow catalog", () => {
  it("defines eight concrete workflows", () => {
    expect(CAPABILITY_WORKFLOWS).toHaveLength(8);
    for (const workflow of CAPABILITY_WORKFLOWS) {
      expect(workflow.title).not.toMatch(/ledger|sentinel|vault|research_decompose/i);
      expect(workflow.command).toMatch(/^(vanta|\/)/);
      expect(workflow.example.length).toBeGreaterThan(10);
    }
  });

  it("marks workflows Run/Try/Setup from actual tool availability", () => {
    const views = workflowViews(["shell_cmd", "read_file", "grep_files", "edit_file"]);
    expect(views.find((v) => v.id === "fix-error")?.state).toBe("Run");
    expect(views.find((v) => v.id === "continue-roadmap")?.state).toBe("Try");
    expect(views.find((v) => v.id === "research-receipts")?.state).toBe("Setup");
  });

  it("renders commands and missing setup gaps", () => {
    const out = formatWhatCanIDo(workflowViews(["shell_cmd"]));
    expect(out).toContain("What Vanta can do now");
    expect(out).toContain("[Try] Fix a pasted error");
    expect(out).toContain(`Command: vanta run "Fix this error: <paste the error>"`);
    expect(out).toContain("Demo: /what-can-i-do --demo fix-error");
    expect(out).toContain("Missing: read_file, grep_files, edit_file");
  });

  it("ships three runnable demo fixtures with exact commands", () => {
    const demoIds = CAPABILITY_WORKFLOWS.map((w) => w.demo).filter(Boolean);
    expect(demoIds).toEqual(["fix-error", "continue-roadmap", "crash-log"]);
    expect(runWorkflowDemo("fix-error")).toContain("VANTA_SHELL_SANDBOX=0 vanta");
    expect(runWorkflowDemo("continue-roadmap")).toContain(`Command: vanta run "Continue the top roadmap item and push the slice"`);
    expect(runWorkflowDemo("crash-log")).toContain("Library not loaded");
  });

  it("runs a demo through the slash handler branch", async () => {
    const result = await whatCanIDo("--demo crash-log", {} as never);
    expect(result.output).toContain("Demo: Diagnose a crash log");
    expect(result.output).toContain("Command:");
  });

  it("cold activation check picks a visible workflow and records time", () => {
    const times = [new Date("2026-07-09T00:00:00.000Z"), new Date("2026-07-09T00:00:01.250Z")];
    const result = runColdActivationCheck(["shell_cmd", "read_file", "grep_files", "edit_file"], () => times.shift()!);
    expect(result.ok).toBe(true);
    expect(result.workflowId).toBe("fix-error");
    expect(result.elapsedMs).toBe(1250);
    expect(result.output).toContain("Time-to-first-useful-action: 1250ms");
    expect(result.output).toContain("VANTA_SHELL_SANDBOX=0 vanta");
  });

  it("cold activation check fails when the gallery exposes no runnable demo", () => {
    const result = runColdActivationCheck([]);
    expect(result.ok).toBe(false);
    expect(result.output).toContain("FAIL");
  });
});
