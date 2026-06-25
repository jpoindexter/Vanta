// VANTA-AGENT-SESSION-VISIBLE — open a REAL terminal window the operator can watch,
// attached to the detached tmux session that agent-session.ts drives. So "open a claude
// session" actually pops a window where you SEE Claude work, while Vanta still types into
// it via tmux send-keys. The window runs `tmux attach -t <name>`; multiple tmux clients
// can attach at once, so the operator's window and Vanta's send-keys share one session.

import { execFileSync } from "node:child_process";

// tmux session names come from genId ("vanta-<alnum>"), never user text — but we still
// refuse anything outside this set before embedding it in an AppleScript/shell string.
const SAFE_NAME = /^[A-Za-z0-9_-]+$/;

export type TermLauncher = { cmd: string; args: string[] };

/** Build argv to open a visible terminal window running `tmux attach -t <tmuxName>`.
 * Returns null when the name is unsafe or no launcher is known for the platform. Pure. */
export function terminalOpenArgs(tmuxName: string, o: { platform: string; termProgram?: string }): TermLauncher | null {
  if (!SAFE_NAME.test(tmuxName)) return null;
  const attach = `tmux attach -t ${tmuxName}`;
  if (o.platform === "darwin") {
    if (o.termProgram === "iTerm.app") {
      const script = `tell application "iTerm"\ncreate window with default profile\ntell current session of current window to write text "${attach}"\nend tell`;
      return { cmd: "osascript", args: ["-e", script] };
    }
    return {
      cmd: "osascript",
      args: ["-e", `tell application "Terminal" to do script "${attach}"`, "-e", 'tell application "Terminal" to activate'],
    };
  }
  if (o.platform === "linux") {
    // x-terminal-emulator is the Debian alternative pointing at the user's terminal.
    return { cmd: "x-terminal-emulator", args: ["-e", "sh", "-c", attach] };
  }
  return null;
}

export type OpenTerminalDeps = {
  platform?: string;
  termProgram?: string;
  run?: (cmd: string, args: string[]) => void;
};

/** Open a visible terminal attached to the tmux session. Best-effort, errors-as-values —
 * a missing launcher or a failed `osascript` never breaks the (already-open) session. */
export function openVisibleTerminal(tmuxName: string, deps: OpenTerminalDeps = {}): { ok: true } | { error: string } {
  const launcher = terminalOpenArgs(tmuxName, {
    platform: deps.platform ?? process.platform,
    termProgram: deps.termProgram ?? process.env.TERM_PROGRAM,
  });
  if (!launcher) return { error: `no visible-terminal launcher for platform ${deps.platform ?? process.platform}` };
  try {
    const run = deps.run ?? ((c, a) => void execFileSync(c, a, { timeout: 10_000 }));
    run(launcher.cmd, launcher.args);
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}
