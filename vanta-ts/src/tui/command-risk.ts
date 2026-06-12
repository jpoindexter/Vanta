/** Risk tier for slash commands and agent tools. */
export type RiskTier = "local" | "kernel-gated" | "approval-gated";

/**
 * Map slash commands to their risk tier. Risk tiers:
 * - local: no kernel assessment, safe to execute immediately (help, history, model, etc.)
 * - kernel-gated: kernel assesses the action (shell-cmd, run-code, etc.)
 * - approval-gated: requires explicit human approval (git commit/push, write_file on sensitive paths, etc.)
 */
export const COMMAND_RISKS: Readonly<Record<string, RiskTier>> = {
  // Local operations
  help: "local",
  clear: "local",
  reset: "local",
  history: "local",
  export: "local",
  retry: "local",
  undo: "local",
  model: "local",
  tools: "local",
  skills: "local",
  status: "local",
  theme: "local",
  goals: "local",
  plan: "local",
  memory: "local",
  compress: "local",
  sessions: "local",
  resume: "local",
  title: "local",
  fork: "local",
  cron: "local",
  image: "local",
  paste: "local",
  attachments: "local",
  context: "local",
  mcp: "local",
  usage: "local",
  copy: "local",
  update: "local",
  moim: "local",
  next: "local",
  planmode: "local",
  boundary: "local",
  where: "local",
  wm: "local",
  bug: "local",
  handoff: "local",
  open: "local",
  edit: "local",
  btw: "local",
  diff: "local",
  search: "local",
  repro: "local",
  dashboard: "local",
  brief: "local",
  simplify: "local",
  verify: "local",
  run: "local",

  // Kernel-gated (safety assessment)
  "add-dir": "kernel-gated",

  // Approval-gated (requires explicit human approval)
  goal: "approval-gated",
  tasks: "approval-gated",
  restart: "approval-gated",
  review: "approval-gated",
  exit: "approval-gated",
};

/** Format a risk tier for display in the palette. */
export function formatRiskLabel(risk: RiskTier): string {
  const labels: Record<RiskTier, string> = {
    local: "[local]",
    "kernel-gated": "[kernel]",
    "approval-gated": "[approval]",
  };
  return labels[risk];
}

/** Get the risk tier for a command, defaulting to kernel-gated if unmapped. */
export function getRiskTier(commandName: string): RiskTier {
  return COMMAND_RISKS[commandName] ?? "kernel-gated";
}
