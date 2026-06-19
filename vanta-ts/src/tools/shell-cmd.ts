import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join } from "node:path";
import { z } from "zod";
import type { Tool, ToolResult } from "./types.js";
import { spawnBackground } from "./bg-tasks.js";
import { destructiveWarning } from "./destructive-warn.js";
import { isSandboxError } from "../sandbox/run.js";
import { wrapExec } from "../exec/backend.js";
import { loadSettings } from "../settings/store.js";
import { resolveSshProfile, buildSshArgs } from "../ssh/config.js";

type RunError = { code?: number | string; stdout?: string; stderr?: string; message: string };

/** Build the result for a non-zero/failed run: reclassify benign exits, else error. */
function formatRunFailure(command: string, e: RunError, pfx: string): ToolResult {
  const out = [e.stdout, e.stderr].filter(Boolean).join("\n").trim();
  // A numeric exit code means the command ran (vs. ENOENT/timeout, where code is
  // a string/undefined and we keep it an error). Reclassify no-match/differs/partial.
  if (typeof e.code === "number") {
    const cls = classifyExitCode(command, e.code);
    if (cls.ok) return { ok: true, output: pfx + (out ? `${cls.note}\n${out}` : `(${cls.note})`) };
  }
  return { ok: false, output: pfx + (out || e.message) };
}

const run = promisify(execFile);
const Args = z.object({
  command: z.string().min(1),
  background: z.boolean().optional(),
  /** Name of a settings.sshConfigs profile — run the command on that host. */
  ssh: z.string().min(1).optional(),
});

// Belt-and-suspenders local block, in addition to the kernel safety gate.
const DESTRUCTIVE = /\brm\s+-rf?\b|\bsudo\b|\bchmod\s+777\b|\bmkfs\b|>\s*\/dev\/|:\(\)\s*\{/;

const MAX_OUTPUT = 1024 * 1024;
const TIMEOUT_MS = 30_000;

/**
 * The program whose exit code we actually received: the first token of the
 * LAST segment of a pipeline/chain (`a | grep x`, `find . && echo`), since the
 * shell reports that command's status. `git grep`/`git diff` keep both words;
 * a leading path (`/usr/bin/grep`) is stripped to its basename.
 */
export function lastCommandWord(command: string): string {
  const seg = command.split(/&&|\|\||;|\|/).pop() ?? command;
  const tok = seg.trim().split(/\s+/).filter(Boolean);
  let w = tok[0] ?? "";
  if (w === "git" && tok[1]) w = `git ${tok[1]}`;
  return w.replace(/^.*\//, "");
}

/**
 * Per-command exit-code semantics. grep/rg/find/diff
 * exit 1 is a valid *outcome*, not a failure — treating it as an error makes
 * the agent see false failures and retry needlessly. Returns ok=true (with an
 * info note) for those cases; everything else stays a real error.
 */
export function classifyExitCode(command: string, code: number): { ok: boolean; note?: string } {
  let w = lastCommandWord(command);
  if (w.startsWith("git ")) w = w.slice(4);
  if (code === 1) {
    if (["grep", "rg", "egrep", "fgrep", "ripgrep"].includes(w)) return { ok: true, note: "No matches found" };
    if (w === "diff") return { ok: true, note: "Differences found" };
    if (w === "find") return { ok: true, note: "Some paths were inaccessible" };
  }
  return { ok: false };
}

export function shellSandboxEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return env.VANTA_SHELL_SANDBOX === "1" ? { ...env, VANTA_SANDBOX: "1" } : env;
}

/** Run the command on a named SSH host (settings.sshConfigs). The kernel still
 *  assessed the command via describeForSafety; the local sandbox is not applied
 *  because execution happens on the remote host, not this machine. */
async function runRemote(profileName: string, command: string, root: string, pfx: string): Promise<ToolResult> {
  const settings = await loadSettings(root, process.env);
  const profile = resolveSshProfile(profileName, settings.sshConfigs);
  if (!profile) {
    return { ok: false, output: `unknown ssh profile "${profileName}" — configure it in settings.sshConfigs` };
  }
  try {
    const { stdout, stderr } = await run("ssh", buildSshArgs(profile, command), { timeout: TIMEOUT_MS, maxBuffer: MAX_OUTPUT });
    const out = [stdout, stderr].filter(Boolean).join("\n").trim();
    return { ok: true, output: pfx + (out || "(command produced no output)") };
  } catch (err) {
    return formatRunFailure(command, err as RunError, pfx);
  }
}

function warnPrefix(command: string): string {
  const warn = destructiveWarning(command);
  return warn ? `⚠ ${warn}\n` : "";
}

/** Run the command on the active execution backend (local / OS sandbox / docker). */
async function runLocal(command: string, root: string, pfx: string): Promise<ToolResult> {
  const sb = await wrapExec({ env: shellSandboxEnv(process.env), root, baseCmd: "sh", baseArgs: ["-c", command] });
  if (isSandboxError(sb)) return { ok: false, output: pfx + sb.error };
  try {
    const { stdout, stderr } = await run(sb.cmd, sb.args, { cwd: root, timeout: TIMEOUT_MS, maxBuffer: MAX_OUTPUT });
    const out = [stdout, stderr].filter(Boolean).join("\n").trim();
    return { ok: true, output: pfx + (out || "(command produced no output)") };
  } catch (err) {
    return formatRunFailure(command, err as RunError, pfx);
  } finally {
    await sb.cleanup?.();
  }
}

export const shellCmdTool: Tool = {
  schema: {
    name: "shell_cmd",
    description:
      "Run a shell command inside the project scope. Returns combined stdout/stderr. Destructive commands are blocked. Set background=true for long-running commands — returns a task id immediately. Set ssh to a settings.sshConfigs profile name to run the command on that host.",
    parameters: {
      type: "object",
      properties: {
        command: { type: "string", description: "The shell command to run" },
        background: { type: "boolean", description: "Run in background (returns task id immediately; check with bg_status)" },
        ssh: { type: "string", description: "Name of a configured SSH profile — run the command on that host instead of locally" },
      },
      required: ["command"],
    },
  },
  describeForSafety: (a) => (a.ssh ? `run shell command on ssh "${String(a.ssh)}": ${String(a.command ?? "")}` : `run shell command: ${String(a.command ?? "")}`),
  async execute(raw, ctx) {
    const parsed = Args.safeParse(raw);
    if (!parsed.success) {
      return { ok: false, output: 'shell_cmd needs a "command" string' };
    }
    const { command, background, ssh } = parsed.data;
    if (DESTRUCTIVE.test(command)) {
      return { ok: false, output: "refused: command matches a destructive pattern" };
    }
    const pfx = warnPrefix(command);
    if (ssh) {
      if (background) return { ok: false, output: "refused: background tasks are not supported over ssh" };
      return runRemote(ssh, command, ctx.root, pfx);
    }
    if (background) {
      // Sandbox: detached background tasks aren't wrapped (no exit-time profile
      // cleanup for an unref'd child). The sandbox only ever TIGHTENS, so when it's
      // requested we REFUSE the unsandboxed bypass rather than silently weaken it.
      if (shellSandboxEnv(process.env).VANTA_SANDBOX === "1") {
        return { ok: false, output: "refused: background tasks are not sandboxed; run without background=true under sandbox mode, or unset VANTA_SANDBOX/VANTA_SHELL_SANDBOX" };
      }
      const task = await spawnBackground(command, join(ctx.root, ".vanta"), ctx.root);
      return { ok: true, output: `background task started: ${task.id}\ncheck with: bg_status(${task.id})` };
    }
    // Sandbox: opt-in OS isolation (VANTA_SANDBOX=1 or shell-only VANTA_SHELL_SANDBOX=1). Off → base unchanged.
    return runLocal(command, ctx.root, pfx);
  },
};
