// VANTA-AGENT-SESSION-INTERACTIVE — the LIVE tmux backend for agent-session.ts.
//
// SECURITY: every tmux invocation is `execFileSync("tmux", argv)` with DISCRETE
// argv items — never a shell string — so neither the launch command (from a fixed
// allow-list in agent-session.ts) nor the typed `text` is shell-interpreted. Text
// is sent with `send-keys -l` (literal) so it is never parsed as tmux key names.
// tmux is the WHERE (which detached pane runs the agent); the kernel assess() gate
// upstream of the tool is the WHETHER. Mirrors fleet/tmux-backend.ts.

import { execFileSync } from "node:child_process";
import type { SessionBackend } from "./agent-session.js";

/** Run `tmux <argv>`; returns trimmed stdout. Throws on non-zero exit (10s cap). */
function tmux(argv: string[]): string {
  return execFileSync("tmux", argv, { encoding: "utf8", timeout: 10_000 }).toString();
}

export const tmuxSessionBackend: SessionBackend = {
  available() {
    try {
      tmux(["-V"]);
      return true;
    } catch {
      return false;
    }
  },
  start(name, command) {
    tmux(["new-session", "-d", "-s", name, command]);
  },
  sendText(name, text) {
    tmux(["send-keys", "-l", "-t", name, text]); // literal text…
    tmux(["send-keys", "-t", name, "Enter"]); // …then submit
  },
  sendKey(name, key) {
    tmux(["send-keys", "-t", name, key]); // a named key (Escape/Enter), interpreted by tmux
  },
  capture(name) {
    try {
      return tmux(["capture-pane", "-p", "-t", name]);
    } catch {
      return "";
    }
  },
  kill(name) {
    try {
      tmux(["kill-session", "-t", name]);
    } catch {
      // already gone — kill is idempotent
    }
  },
  has(name) {
    try {
      tmux(["has-session", "-t", name]);
      return true;
    } catch {
      return false;
    }
  },
};
