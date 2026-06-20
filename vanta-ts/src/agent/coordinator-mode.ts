// COORDINATOR-MODE — an opt-in "lead agent" persona with a RESTRICTED tool set.
// When enabled, Vanta acts as an orchestrator: it DELEGATES execution to workers
// and inspects/reads/plans, rather than directly mutating the world itself. The
// direct-mutation / execution tools (write_file, shell_cmd, run_code, git writes,
// browser_act, …) are excluded; the delegation + read/inspection tools (delegate,
// swarm, read_file, grep_files, inspect_state, todo, clarify, …) stay.
//
// Pure, env-gated, off by default = the full tool set + normal persona (current
// behavior). Same heuristic-bank / explicit-allowlist shape as clarity-gate and
// auto-mode's read-only allowlist (zero I/O, zero LLM). Two consumers (named, not
// wired this round — mirrors how clarity-gate names the `clarify` tool):
//   1. `buildRegistry({ exclude })` (tools/index.ts) — pass
//      `coordinatorToolExclusions(allNames)` as `exclude` when `coordinatorEnabled(env)`.
//   2. `buildSystemPrompt()` (prompt.ts) — inject `coordinatorPersona()` as a role
//      note when `coordinatorEnabled(env)`.

/**
 * The well-known direct-mutation / execution tools to EXCLUDE in coordinator mode.
 * A coordinator does not mutate the world directly — it delegates that to workers.
 * This is the explicit, conservative denylist: a tool is excluded ONLY if its name
 * is on this list. Any unknown tool therefore stays available by default.
 *
 * Covers: file writes/edits, shell + code execution, git writes (status/diff stay),
 * browser/desktop/LAN actuation, outbound comms (send/draft/create/update),
 * cron/worktree/skill mutation, and self-mutation (self_repair, regression_lock).
 */
export const COORDINATOR_EXCLUDED_TOOLS: readonly string[] = [
  // file mutation
  "write_file",
  "edit_file",
  // arbitrary execution
  "shell_cmd",
  "run_code",
  "self_correct",
  // git writes (read-only git_status / git_diff stay)
  "git_commit",
  "git_push",
  "git_branch",
  "git_checkout",
  // browser / desktop / device actuation
  "browser_act",
  "browser_navigate",
  "vision_action",
  "open_deep_link",
  "lan_control",
  // outbound communications (always-mutating side effects)
  "gmail_draft",
  "gmail_send",
  "calendar_create",
  "calendar_update",
  "drive_create",
  "drive_update",
  "send_message",
  "send_chat",
  "peer_send",
  "outreach",
  "speak",
  // scheduling / worktree / skill mutation
  "cron_create",
  "enter_worktree",
  "exit_worktree",
  "write_skill",
  // self-mutation / verification side effects
  "self_repair",
  "regression_lock",
  // roadmap mutation (read-only inspection stays)
  "roadmap_move",
  "roadmap_add",
] as const;

const EXCLUDED_SET = new Set<string>(COORDINATOR_EXCLUDED_TOOLS);

/**
 * True when coordinator mode is enabled. Opt-in via `VANTA_COORDINATOR=1`; any
 * other / unset value is OFF (the default = full tool set + normal persona). Pure.
 */
export function coordinatorEnabled(env: NodeJS.ProcessEnv): boolean {
  return env.VANTA_COORDINATOR === "1";
}

/**
 * Given every registered tool name, return the subset to EXCLUDE in coordinator
 * mode — the intersection of the well-known mutation denylist with the names that
 * actually exist. A tool not on {@link COORDINATOR_EXCLUDED_TOOLS} is never
 * excluded (unknown tools stay; delegation + read/inspection tools stay). The
 * result feeds `buildRegistry({ exclude })`. Pure, order-preserving, deduped.
 */
export function coordinatorToolExclusions(allToolNames: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const name of allToolNames) {
    if (EXCLUDED_SET.has(name) && !seen.has(name)) {
      seen.add(name);
      out.push(name);
    }
  }
  return out;
}

/**
 * The lead-agent persona note injected into the system prompt in coordinator mode.
 * Names the delegate-and-verify role: orchestrate workers, verify their output,
 * don't do the execution work yourself. Pure, deterministic.
 */
export function coordinatorPersona(): string {
  return [
    "COORDINATOR MODE — you are the LEAD agent / orchestrator.",
    "Your job is to DELEGATE execution to workers and to VERIFY their output —",
    "not to do the work yourself. Direct-mutation tools (write_file, shell_cmd,",
    "run_code, git writes, browser actions, outbound comms, …) are intentionally",
    "OUT of your tool set this session.",
    "- Break the goal into worker-sized tasks and dispatch them via `delegate` / `swarm`.",
    "- Use read/inspection tools (read_file, grep_files, glob_files, inspect_state,",
    "  code_search, todo) to plan, ground decisions, and check progress.",
    "- When a worker reports back, VERIFY the result against the goal before",
    "  treating it as done — do not assume success.",
    "- If intent is ambiguous, `clarify` before delegating rather than guessing.",
  ].join("\n");
}
