import type { SlashHandler } from "./types.js";

// ND3 — plan-first mode. Injects a plan-before-tools instruction into the
// live system prompt (ephemeral; lasts the current session). Toggled by
// /planmode with no arg; /planmode on|off sets it explicitly.
//
// The marker embeds into the system string so the toggle is detectable
// without extra state. The LLM sees the instruction on every turn while on.

export const PLAN_MARKER = "<!-- plan-first-mode -->";

const INSTRUCTION = `\n\n${PLAN_MARKER}
⚡ Plan-first mode is active. Before using any tools or making any changes:
1. Lay out a numbered step-by-step plan.
2. Present it clearly and wait for explicit user confirmation ("yes", "ok", "proceed", or "go").
3. Only then execute the steps — one at a time, confirming after each if the user asks.
`;

type PlanAction = "turn-on" | "turn-off" | "already-on" | "already-off";

/** Decide what /planmode does: explicit on|off, else toggle the current state. */
function resolvePlanAction(arg: string | undefined, isOn: boolean): PlanAction {
  const explicit = arg === "on" ? true : arg === "off" ? false : undefined;
  const wantOn = explicit ?? !isOn; // bare /planmode toggles
  if (wantOn === isOn) return isOn ? "already-on" : "already-off";
  return wantOn ? "turn-on" : "turn-off";
}

export const planMode: SlashHandler = (arg, ctx) => {
  const sys = ctx.convo.messages[0];
  if (!sys || sys.role !== "system") {
    return { output: "  plan mode unavailable (no system message in conversation)" };
  }
  const isOn = sys.content.includes(PLAN_MARKER);
  const action = resolvePlanAction(arg, isOn);
  if (action === "turn-on") {
    sys.content += INSTRUCTION;
    return { output: "  ⚡ plan-first mode ON — Vanta will plan + confirm before acting" };
  }
  if (action === "turn-off") {
    sys.content = sys.content.replace(INSTRUCTION, "");
    return { output: "  · plan-first mode OFF — Vanta acts immediately again" };
  }
  if (action === "already-on") {
    return { output: "  ⚡ plan-first mode is already ON (use /planmode off to disable)" };
  }
  return { output: "  · plan-first mode is already OFF (use /planmode on to enable)" };
};
