import { z } from "zod";
import type { Tool, ToolResult, ToolContext } from "./types.js";
import { runGit } from "./git.js";
import { recordGood, readMarkers, lastKnownGood } from "../self/detect.js";
import { isCompartment, rollbackPaths } from "../self/rollback.js";
import type { Compartment } from "../self/compartments.js";
import { planToolSandboxTest, runToolSandboxTest } from "../self/tool-sandbox.js";

const Args = z.object({
  action: z.enum(["mark", "rollback", "status", "sandbox_test"]),
  compartment: z.string().min(1).optional(),
  toolPath: z.string().min(1).optional(),
  command: z.string().min(1).optional(),
});

// Protected compartments (maxAutonomy "none") are kernel-enforced and never
// auto-rolled-back — restoring the safety kernel / factory guardrails from an
// arbitrary sha is exactly what Rule Zero forbids without a human at the wheel.
const PROTECTED: ReadonlyArray<Compartment> = ["brainstem", "skeleton"];

async function doMark(compartment: Compartment, ctx: ToolContext): Promise<ToolResult> {
  const head = await runGit(["rev-parse", "HEAD"], ctx.root);
  if (head.code !== 0) return { ok: false, output: `could not read HEAD: ${head.out}` };
  const sha = head.out.trim().split("\n")[0] ?? "";
  if (!sha) return { ok: false, output: "could not resolve HEAD sha" };
  await recordGood({ compartment, sha });
  return { ok: true, output: `Marked ${compartment} last-known-good at ${sha.slice(0, 8)}` };
}

async function doRollback(compartment: Compartment, ctx: ToolContext): Promise<ToolResult> {
  if (PROTECTED.includes(compartment)) {
    return { ok: false, output: `${compartment} is protected (kernel-enforced, maxAutonomy:none) — no auto-rollback` };
  }
  const sha = lastKnownGood(await readMarkers())[compartment];
  if (!sha) {
    return { ok: false, output: `no last-known-good marker for ${compartment} — run self_repair(action:mark) while it's healthy` };
  }
  const paths = rollbackPaths(compartment);
  if (paths.length === 0) {
    return { ok: false, output: `${compartment} owns no narrow path set (everything else) — a rollback must be scoped; inspect with: git log ${sha.slice(0, 8)} -1` };
  }
  const cmd = `git checkout ${sha.slice(0, 12)} -- ${paths.join(" ")}`;
  const approved = await ctx.requestApproval(
    `Roll ${compartment} back to last-known-good:\n    ${cmd}`,
    `⚠ discards current uncommitted changes under: ${paths.join(", ")}`,
  );
  if (!approved) return { ok: false, output: "denied" };
  const res = await runGit(["checkout", sha, "--", ...paths], ctx.root);
  return res.code === 0
    ? { ok: true, output: `Rolled ${compartment} back to ${sha.slice(0, 8)}.\n${res.out || "(clean)"}` }
    : { ok: false, output: `rollback failed: ${res.out}` };
}

async function doStatus(): Promise<ToolResult> {
  const lkg = lastKnownGood(await readMarkers());
  const rows = Object.entries(lkg).map(([c, s]) => `  ${c} → ${s.slice(0, 8)}`);
  return rows.length
    ? { ok: true, output: ["Last-known-good markers:", ...rows].join("\n") }
    : { ok: true, output: "No last-known-good markers recorded yet." };
}

async function doSandboxTest(raw: { toolPath?: string; command?: string }, ctx: ToolContext): Promise<ToolResult> {
  const plan = planToolSandboxTest(raw);
  if (!plan.ok) return { ok: false, output: plan.reason };
  const approved = await ctx.requestApproval(
    `sandbox-test ${plan.toolPath}\n    ${plan.command}`,
    "runs the isolated pre-attach test for a new/replaced limb tool before attach",
  );
  if (!approved) return { ok: false, output: "denied" };
  const result = await runToolSandboxTest(ctx.root, plan.command);
  return result.ok
    ? { ok: true, output: `sandbox PASS for ${plan.toolPath}\n${result.output}` }
    : { ok: false, output: `sandbox FAIL for ${plan.toolPath}\n${result.output}` };
}

export const selfRepairTool: Tool = {
  schema: {
    name: "self_repair",
    description:
      "Self-repair: mark a compartment's current code as last-known-good, or roll it back to that sha. " +
      "action:mark {compartment} records the current HEAD as the compartment's good state. " +
      "action:rollback {compartment} restores it (git checkout of the compartment's paths) — approval-gated, " +
      "refuses protected compartments (brainstem/skeleton) and discards uncommitted changes under those paths. " +
      "action:sandbox_test {toolPath} runs a bounded OS-sandboxed test for a new/replaced limb tool before attach. " +
      "action:status lists recorded markers. Compartments: brainstem, skeleton, reflexes, memory, limbs.",
    parameters: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["mark", "rollback", "status", "sandbox_test"] },
        compartment: {
          type: "string",
          enum: ["brainstem", "skeleton", "reflexes", "memory", "limbs"],
          description: "the body compartment (required for mark/rollback)",
        },
        toolPath: {
          type: "string",
          description: "repo-relative vanta-ts/src/tools/*.ts path (required for sandbox_test)",
        },
        command: {
          type: "string",
          description: "optional bounded vanta-ts test command for sandbox_test",
        },
      },
      required: ["action"],
    },
  },
  // rollback surfaces the git op so the kernel assesses it; mark/status are benign.
  describeForSafety: (a) =>
    a.action === "rollback"
      ? `git checkout — rollback ${String(a.compartment ?? "")} to last-known-good`
      : a.action === "mark"
        ? "record self-repair marker"
        : a.action === "sandbox_test"
          ? `sandbox-test tool before attach: ${String(a.toolPath ?? "")}`
          : "list self-repair markers",
  async execute(raw, ctx) {
    const parsed = Args.safeParse(raw);
    if (!parsed.success) return { ok: false, output: 'self_repair needs an "action" (mark|rollback|status|sandbox_test)' };
    const { action, compartment, toolPath, command } = parsed.data;
    if (action === "status") return doStatus();
    if (action === "sandbox_test") return doSandboxTest({ toolPath, command }, ctx);
    if (!compartment || !isCompartment(compartment)) {
      return { ok: false, output: `${action} needs a valid compartment (brainstem|skeleton|reflexes|memory|limbs)` };
    }
    return action === "mark" ? doMark(compartment, ctx) : doRollback(compartment, ctx);
  },
};
