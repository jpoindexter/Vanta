// VANTA-SANDBOX-AGENT-REDIRECT — when a shell_cmd tries to launch another agent CLI
// via background/tmux (which dead-ends under the auto-on macOS sandbox — the exact
// trap from the 2026-06-25 session), point the model at the supported path
// (call_agent / agent_session) instead of leaving it at a bare "Operation not
// permitted". The supported tools spawn the agent through a Vanta-owned channel
// (execFile/tmux directly, not shell_cmd's sandbox wrapper), so they actually work.

const KNOWN_AGENTS = /\b(claude|codex|gemini|cursor-agent|opencode)\b/i;

const REDIRECT =
  "\n→ To drive another agent, use the call_agent tool (one-shot) or agent_session (open/send/read/close, interactive). They spawn it through a Vanta-owned channel that works under the sandbox — don't launch an agent via background shell or tmux.";

/** The redirect tail when `command` launches a known agent CLI, else null. Pure. */
export function agentLaunchRedirect(command: string): string | null {
  return KNOWN_AGENTS.test(command) ? REDIRECT : null;
}

/** True when the command drives a known agent via tmux (the sandbox dead-end case). Pure. */
export function isTmuxAgentLaunch(command: string): boolean {
  return /\btmux\b/.test(command) && KNOWN_AGENTS.test(command);
}
