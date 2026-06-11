import type { SlashHandler } from "./types.js";

// ND3 — plan-first mode with enforced read-only gate.
//
// /planmode on|off|approve
//
// ON:      injects PLAN_MARKER + instruction into the live system prompt; resets
//          ctx.state.planApproved to false so the agent is read-only gated.
// OFF:     removes the marker + instruction; clears planApproved.
// APPROVE: sets planApproved = true, lifting the read-only gate for the session.
//
// The agent gate (agent.ts PLAN_MODE_ALLOWED_TOOLS) reads planGate() — a closure
// over ctx.state.planApproved — on every tool dispatch. Any write/shell tool
// returns "blocked: plan mode" until the user explicitly approves.

export const PLAN_MARKER = "<!-- plan-first-mode -->";

const INSTRUCTION = `\n\n${PLAN_MARKER}
⚡ Plan-first mode is active (enforced). Write and shell tools are blocked until the user
approves the plan. Before acting:
1. Lay out a numbered step-by-step plan using read-only tools only.
2. Present it clearly and wait for the user to run /planmode approve.
3. Only after approval execute the steps — kernel gating still applies per step.
`;

type PlanAction = "turn-on" | "turn-off" | "approve" | "already-on" | "already-off" | "already-approved";

function resolvePlanAction(arg: string, isOn: boolean, isApproved: boolean): PlanAction {
  if (arg === "approve") return isApproved ? "already-approved" : "approve";
  const explicit = arg === "on" ? true : arg === "off" ? false : undefined;
  const wantOn = explicit ?? !isOn;
  if (wantOn === isOn) return isOn ? "already-on" : "already-off";
  return wantOn ? "turn-on" : "turn-off";
}

type DispatchCtx = {
  action: PlanAction;
  sys: { content: string };
  isOn: boolean;
  isApproved: boolean;
  state: { planApproved?: boolean };
};

function dispatchPlanAction({ action, sys, isOn, isApproved, state }: DispatchCtx): { output: string } {
  if (action === "turn-on") {
    if (!isOn) sys.content += INSTRUCTION;
    state.planApproved = false;
    return { output: "  ⚡ plan-first mode ON (enforced) — write tools blocked. Run /planmode approve after reviewing the plan." };
  }
  if (action === "turn-off") {
    sys.content = sys.content.replace(INSTRUCTION, "");
    state.planApproved = false;
    return { output: "  · plan-first mode OFF — Vanta acts immediately again" };
  }
  if (action === "approve") {
    if (!isOn) return { output: "  plan mode is not active — nothing to approve" };
    state.planApproved = true;
    return { output: "  ✓ plan approved — write tools unlocked. Kernel gating still applies per action." };
  }
  if (action === "already-approved") return { output: "  ✓ plan already approved — write tools are unlocked" };
  if (action === "already-on") {
    const approvedLine = isApproved
      ? "plan approved — write tools unlocked"
      : "write tools BLOCKED — run /planmode approve after reviewing the plan";
    return { output: `  ⚡ plan-first mode is already ON (${approvedLine})` };
  }
  return { output: "  · plan-first mode is already OFF (use /planmode on to enable)" };
}

export const planMode: SlashHandler = (arg, ctx) => {
  const sys = ctx.convo.messages[0];
  if (!sys || sys.role !== "system") {
    return { output: "  plan mode unavailable (no system message in conversation)" };
  }
  const isOn = sys.content.includes(PLAN_MARKER);
  const isApproved = ctx.state.planApproved ?? false;
  const action = resolvePlanAction(arg, isOn, isApproved);
  return dispatchPlanAction({ action, sys: sys as { content: string }, isOn, isApproved, state: ctx.state });
};
