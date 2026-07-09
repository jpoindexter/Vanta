import { describe, it, expect } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { shellCmdTool } from "../tools/shell-cmd.js";
import type { ToolContext } from "../tools/types.js";
import {
  formatFreshActivationReviewPacket,
  recordFreshActivationReview,
  runFreshContextActivationReview,
  runFreshWorkspaceActivationProof,
} from "./activation-review.js";
import {
  CAPABILITY_WORKFLOWS,
  formatWhatCanIDo,
  runColdActivationCheck,
  runWorkflowDemo,
  whatCanIDo,
  workflowViews,
} from "./what-can-i-do-cmd.js";

function toolCtx(root = "/tmp/vanta-gallery-fixture"): ToolContext {
  return {
    root,
    safety: {} as ToolContext["safety"],
    requestApproval: async () => true,
  };
}

describe("what-can-i-do workflow catalog", () => {
  it("defines eight concrete workflows", () => {
    expect(CAPABILITY_WORKFLOWS).toHaveLength(8);
    for (const workflow of CAPABILITY_WORKFLOWS) {
      expect(workflow.title).not.toMatch(/ledger|sentinel|vault|research_decompose/i);
      expect(workflow.outcome).not.toMatch(/ledger|sentinel|vault|research_decompose|cron_create|brain/i);
      expect(workflow.setup).not.toMatch(/ledger|sentinel|vault|research_decompose|cron_create|brain|send_chat/i);
      expect(workflow.command).toMatch(/^(vanta|\/)/);
      expect(workflow.example.length).toBeGreaterThan(10);
      expect(workflow.setup.length).toBeGreaterThan(10);
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
    expect(out).toContain("Needs: Shell, file reading, search, and edit tools are available.");
    expect(out).toContain("Demo: /what-can-i-do --demo fix-error");
    expect(out).not.toContain("Missing:");
    expect(out).not.toMatch(/research_decompose|cron_create|send_chat|brain/);
  });

  it("ships three runnable demo fixtures with exact commands", () => {
    const demoIds = CAPABILITY_WORKFLOWS.map((w) => w.demo).filter(Boolean);
    expect(demoIds).toEqual(["fix-error", "continue-roadmap", "spec-to-preview", "crash-log"]);
    expect(runWorkflowDemo("fix-error")).toContain("python3 -m http.server 8123");
    expect(runWorkflowDemo("fix-error")).toContain("VANTA_SHELL_SANDBOX=0 vanta");
    expect(runWorkflowDemo("continue-roadmap")).toContain(`Command: vanta run "Continue the top roadmap item and push the slice"`);
    expect(runWorkflowDemo("spec-to-preview")).toContain("vanta spec-to-app --demo posture");
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

  it("prints a self-contained fresh-context review packet", () => {
    const out = formatFreshActivationReviewPacket(workflowViews(["shell_cmd"]));
    expect(out).toContain("Fresh-context activation review packet");
    expect(out).toContain("assume you have never seen this repo");
    expect(out).toContain("vanta what-can-i-do --record-review");
    expect(out).toContain("[Try] Fix a pasted error");
  });

  it("records the first fresh-context confusion point to evidence", async () => {
    const dir = await mkdtemp(join(tmpdir(), "vanta-activation-review-"));
    try {
      const file = await recordFreshActivationReview(
        dir,
        { reviewer: "fresh-context", confusion: "I did not know which workflow to pick." },
        () => new Date("2026-07-09T12:00:00.000Z"),
      );
      expect(file).toContain("activation-reviews/fresh-context-2026-07-09T12-00-00-000Z.md");
      const body = await readFile(file, "utf8");
      expect(body).toContain("I did not know which workflow to pick.");
      expect(body).toContain("Blocking Fix Required");
      expect(body).toContain("- Blocking: no");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("records a fresh-context activation review attempt", async () => {
    const dir = await mkdtemp(join(tmpdir(), "vanta-fresh-context-"));
    const times = [
      new Date("2026-07-09T12:10:00.000Z"),
      new Date("2026-07-09T12:10:01.000Z"),
      new Date("2026-07-09T12:10:01.000Z"),
    ];
    try {
      const proof = await runFreshContextActivationReview(
        dir,
        workflowViews(["shell_cmd", "read_file", "grep_files", "edit_file"]),
        () => runColdActivationCheck(["shell_cmd", "read_file", "grep_files", "edit_file"], () => times.shift()!),
        () => times.shift()!,
      );
      expect(proof.ok).toBe(true);
      expect(proof.output).toContain("Fresh-context activation review: PASS");
      expect(proof.output).toContain("No blocking confusion");
      const body = await readFile(proof.file, "utf8");
      expect(body).toContain("- Reviewer: fresh-context-cli");
      expect(body).toContain("- Workflow: fix-error");
      expect(body).toContain("- Blocking: no");
      expect(body).toContain("No blocking confusion");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("records a fresh-workspace activation proof artifact", async () => {
    const dir = await mkdtemp(join(tmpdir(), "vanta-fresh-proof-"));
    const times = [
      new Date("2026-07-09T12:00:00.000Z"),
      new Date("2026-07-09T12:00:01.250Z"),
      new Date("2026-07-09T12:00:01.250Z"),
    ];
    try {
      const proof = await runFreshWorkspaceActivationProof(
        dir,
        () => runColdActivationCheck(["shell_cmd", "read_file", "grep_files", "edit_file"], () => times.shift()!),
        () => times.shift()!,
      );
      expect(proof.ok).toBe(true);
      expect(proof.output).toContain("Fresh-workspace activation proof: PASS");
      const body = await readFile(proof.file, "utf8");
      expect(body).toContain("Fresh-Workspace Activation Proof");
      expect(body).toContain("Time-to-first-useful-action: 1250ms");
      expect(body).toContain("Fix a pasted error");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("runs review-packet and record-review through the slash handler", async () => {
    const dir = await mkdtemp(join(tmpdir(), "vanta-review-slash-"));
    try {
      const setup = { registry: { schemas: () => [{ name: "shell_cmd" }] } };
      const packet = await whatCanIDo("--review-packet", { setup, dataDir: dir } as never);
      expect(packet.output).toContain("Fresh-context activation review packet");
      const recorded = await whatCanIDo("--record-review First screen was unclear", {
        setup, dataDir: dir, now: () => new Date("2026-07-09T00:00:00.000Z"),
      } as never);
      expect(recorded.output).toContain("fresh-context review recorded");
      expect(await readFile(join(dir, "activation-reviews", "fresh-context-2026-07-09T00-00-00-000Z.md"), "utf8")).toContain("First screen was unclear");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("gallery sandbox recovery fixture exercises the real shell_cmd refusal path", async () => {
    const prev = process.env.VANTA_SHELL_SANDBOX;
    process.env.VANTA_SHELL_SANDBOX = "1";
    try {
      const result = await shellCmdTool.execute(
        { command: "python3 -m http.server 8123", background: true },
        toolCtx("/tmp/vanta-gallery-fixture"),
      );
      expect(result.ok).toBe(false);
      expect(result.output).toContain("no working path under the shell sandbox");
      expect(result.output).toContain("cd '/tmp/vanta-gallery-fixture' && VANTA_SHELL_SANDBOX=0 vanta");
      expect(result.output).toContain("background:true");
    } finally {
      if (prev === undefined) delete process.env.VANTA_SHELL_SANDBOX;
      else process.env.VANTA_SHELL_SANDBOX = prev;
    }
  });
});
