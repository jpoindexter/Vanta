// VANTA-TERMINAL-CAPTURE — LIVE terminal capture via tmux.
//
// Resolves the node-pty blocker (node-pty's native binding does not load on
// node v24): instead of a PTY library, this captures REAL terminal content by
// running a command inside a throwaway tmux pane and reading it back with
// `tmux capture-pane` — so the agent sees what a real terminal would show
// (colors, TUI redraws, carriage-return rewrites), then strips the control
// sequences to a clean snapshot via the pure `processCapture`.
//
// SECURITY: the captured buffer is UNTRUSTED — `processCapture` strips the whole
// ANSI/CSI/OSC sequence (not just ESC) so a captured byte stream can't inject
// control codes when the snapshot is rendered or fed back to the model. The
// command itself runs in a real shell, so the tool is kernel-gated: its
// `describeForSafety` surfaces the command to `assess()` exactly like a shell
// command — tmux is the WHERE, the kernel is the WHETHER.

import { z } from "zod";
import type { Tool, ToolResult } from "./types.js";
import { processCapture } from "../term/terminal-capture.js";
import { realTmuxRunner, tmuxAvailable, type TmuxRunner } from "../fleet/tmux-backend.js";

/** Injected seams for {@link captureViaTmux} (the tmux runner; defaulted real). */
export type CaptureDeps = {
  run?: TmuxRunner;
  session?: string;
  maxLines?: number;
};

/** The capture outcome: a clean snapshot + line metadata, or an error. */
export type CaptureResult =
  | { ok: true; snapshot: string; lineCount: number }
  | { ok: false; error: string };

/** Drop the typed command-echo line (it carries our `tmux wait-for` marker); the
 * command's actual output lines survive intact. */
function stripCommandEcho(raw: string, marker: string): string {
  return raw
    .split("\n")
    .filter((line) => !line.includes(marker))
    .join("\n");
}

/** Pre-clean a leftover session of this name (best-effort, never throws). */
function preClean(run: TmuxRunner, session: string): void {
  try {
    run(["kill-session", "-t", session]);
  } catch {
    /* none to clean */
  }
}

/** Run the command in the pane and BLOCK until it completes using tmux's own
 * `wait-for` signal — robust, because (unlike a text sentinel) the channel name
 * is never confused with the typed command. Returns the captured pane buffer.
 * `marker` is the unique wait-for channel, also used to drop the command-echo
 * line. The blocking `wait-for` is capped by the runner's exec timeout. */
function runAndWait(run: TmuxRunner, pane: string, command: string, marker: string): string {
  run(["send-keys", "-t", pane, `${command}; tmux wait-for -S ${marker}`, "Enter"]);
  run(["wait-for", marker]); // blocks until the command signals completion
  return run(["capture-pane", "-t", pane, "-p"]);
}

/**
 * Run `command` in a real tmux pane and capture its terminal output as a clean,
 * control-stripped snapshot. Errors-as-values — a missing tmux / any tmux
 * failure returns `{ ok:false }`, never throws. The throwaway session is always
 * killed (finally).
 */
export async function captureViaTmux(command: string, deps: CaptureDeps = {}): Promise<CaptureResult> {
  const run = deps.run ?? realTmuxRunner;
  const session = deps.session ?? `vanta_cap_${process.pid}`;
  const marker = `${session}_wait`;
  if (!tmuxAvailable(run)) return { ok: false, error: "tmux not available for terminal capture" };
  preClean(run, session);
  try {
    run(["new-session", "-d", "-s", session, "-x", "200", "-y", "60"]);
    const pane = run(["list-panes", "-t", session, "-F", "#{pane_id}"]).split("\n").filter(Boolean)[0];
    if (pane === undefined) return { ok: false, error: "tmux created no pane" };
    const raw = runAndWait(run, pane, command, marker);
    const snapshot = processCapture(stripCommandEcho(raw, marker), { maxLines: deps.maxLines });
    return { ok: true, snapshot, lineCount: snapshot ? snapshot.split("\n").length : 0 };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  } finally {
    preClean(run, session);
  }
}

const ArgsSchema = z.object({ command: z.string().min(1, "command is required") });

/**
 * `terminal_capture` tool — runs a command in a real tmux terminal and returns
 * its terminal-faithful, control-stripped output. Kernel-gated on the command
 * (describeForSafety surfaces it to assess()). The live TUI Meta+J panel that
 * toggles a persistent capture view is the named host wire (see
 * term/terminal-capture.ts toggleCapturePanel); this tool is the agent-callable
 * capture.
 */
export const terminalCaptureTool: Tool = {
  schema: {
    name: "terminal_capture",
    description:
      "Run a command in a real terminal (tmux) and capture its terminal-faithful output (colors/TUI redraws), returned as clean stripped text. Use when piped stdout loses formatting or a TUI program needs a real terminal.",
    parameters: {
      type: "object",
      properties: { command: { type: "string", description: "The shell command to run and capture." } },
      required: ["command"],
    },
  },
  describeForSafety: (args) => {
    const parsed = ArgsSchema.safeParse(args);
    return parsed.success ? `capture terminal: ${parsed.data.command}` : "capture terminal output";
  },
  async execute(args): Promise<ToolResult> {
    const parsed = ArgsSchema.safeParse(args);
    if (!parsed.success) return { ok: false, output: parsed.error.issues[0]?.message ?? "invalid args" };
    const res = await captureViaTmux(parsed.data.command);
    if (!res.ok) return { ok: false, output: res.error };
    return { ok: true, output: res.snapshot || "(no terminal output captured)" };
  },
};
