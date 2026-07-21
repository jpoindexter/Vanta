import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { promisify } from "node:util";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { z } from "zod";
import type { Tool, ToolResult } from "./types.js";
import { spawnBackground } from "./bg-tasks.js";
import { destructiveWarning } from "./destructive-warn.js";
import { isSandboxError } from "../sandbox/run.js";
import { agentLaunchRedirect, isTmuxAgentLaunch } from "./agent-launch-hint.js";
import { needsBackground, looksLikeServeIntent } from "./shell-background-detect.js";
import { resolveExecBackend, wrapExec } from "../exec/backend.js";
import { loadSettings } from "../settings/store.js";
import { resolveSshTarget, buildSshArgs } from "../ssh/config.js";
import { applySessionEnv, sessionEnvStore } from "../repl/session-env.js";
import { sessionCwd, isCwdChanged } from "../repl/session-cwd.js";
import { combineOutput, formatRunFailure, withTimingNote, type RunError } from "./shell-output.js";
import { sandboxBackgroundRecovery, sandboxServeRecovery } from "./sandbox-recovery.js";
import { resolveShellInvocation } from "../platform/shell.js";
import { canonicalPath, isDangerousPath } from "./writable-zones.js";

export { lastCommandWord, classifyExitCode } from "./shell-output.js";

const run = promisify(execFile);
const Args = z.object({
  command: z.string().min(1),
  background: z.boolean().optional(),
  /** Name of a settings.sshConfigs profile — run the command on that host. */
  ssh: z.string().min(1).optional(),
});

// Belt-and-suspenders local block, in addition to the kernel safety gate.
// Writes to a real device node (> /dev/sda, dd of=/dev/disk0) are destructive,
// but the safe pseudo-devices (/dev/null, /dev/stderr, etc.) are not — the old
// `>\s*/dev/` flagged the ubiquitous `2>/dev/null` as destructive (false positive).
const SAFE_DEV = "null|zero|stdout|stderr|stdin|tty|fd|random|urandom|console|full|ptmx";
const DESTRUCTIVE = new RegExp(
  `\\brm\\s+-rf?\\b|\\bsudo\\b|\\bchmod\\s+777\\b|\\bmkfs\\b|(?:>\\s*|of=)\\/dev\\/(?!(?:${SAFE_DEV})\\b)|:\\(\\)\\s*\\{`,
);

const MAX_OUTPUT = 1024 * 1024;
const TIMEOUT_MS = 30_000;

const TRUTHY = new Set(["1", "true", "on", "yes"]);
const FALSY = new Set(["0", "false", "off", "no"]);

/** Decide whether shell_cmd/self_correct should run sandboxed. SECURITY: default ON
 * wherever a usable OS sandbox backend exists (seatbelt on macOS — always present;
 * bwrap on Linux only if installed), because the sandbox (network-denied, deny-default
 * fs) is the REAL containment a keyword denylist can't provide. Explicit
 * VANTA_SHELL_SANDBOX wins either way. We never enable it where the backend is absent,
 * so no platform is bricked (it falls back to host exec under the kernel denylist). */
export function shouldSandboxShell(env: NodeJS.ProcessEnv, platform: NodeJS.Platform, hasBwrap: boolean): boolean {
  const flag = env.VANTA_SHELL_SANDBOX?.trim().toLowerCase();
  if (flag && FALSY.has(flag)) return false; // explicit opt-out
  if (flag && TRUTHY.has(flag)) return true; // explicit opt-in
  if (env.VANTA_SANDBOX === "1") return true; // global sandbox already on
  return platform === "darwin" || (platform === "linux" && hasBwrap); // default: on where contained
}

/** True when shell sandboxing was explicitly requested (vs auto-defaulted). */
function explicitSandbox(env: NodeJS.ProcessEnv): boolean {
  const flag = env.VANTA_SHELL_SANDBOX?.trim().toLowerCase();
  return (flag !== undefined && TRUTHY.has(flag)) || env.VANTA_SANDBOX === "1";
}

let bwrapCache: boolean | undefined;
function bwrapOnPath(): boolean {
  if (bwrapCache !== undefined) return bwrapCache;
  bwrapCache = (process.env.PATH ?? "").split(":").some((d) => d && existsSync(join(d, "bwrap")));
  return bwrapCache;
}

export function shellSandboxEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  if (!shouldSandboxShell(env, process.platform, bwrapOnPath())) return env;
  // AUTO-enabled (no explicit flag) keeps network ON so npm/git/curl still work — the
  // high-value containment is the deny-default FS (secrets unreadable, writes bounded).
  // Explicitly-requested sandboxing keeps the strict default (network denied). A user-set
  // VANTA_SANDBOX_NET is always honored — set it to 0 for full containment in auto mode.
  if (explicitSandbox(env) || env.VANTA_SANDBOX_NET !== undefined) return { ...env, VANTA_SANDBOX: "1" };
  return { ...env, VANTA_SANDBOX: "1", VANTA_SANDBOX_NET: "1" };
}

/** Run the command on an SSH host — a configured `settings.sshConfigs` profile
 *  name or an explicit `user@host`. The kernel still assessed the command via
 *  describeForSafety; the local sandbox is not applied because execution happens
 *  on the remote host, not this machine. */
async function runRemote(target: string, command: string, root: string, pfx: string): Promise<ToolResult> {
  const settings = await loadSettings(root, process.env);
  const profile = resolveSshTarget(target, settings.sshConfigs);
  if (!profile) {
    return { ok: false, output: `unknown ssh profile "${target}" — configure it in settings.sshConfigs, or pass an explicit user@host` };
  }
  try {
    const { stdout, stderr } = await run("ssh", buildSshArgs(profile, command), { timeout: TIMEOUT_MS, maxBuffer: MAX_OUTPUT });
    const out = combineOutput(stdout, stderr);
    return { ok: true, output: pfx + (out || "(command produced no output)") };
  } catch (err) {
    return formatRunFailure(command, err as RunError, pfx);
  }
}

function warnPrefix(command: string): string {
  const warn = destructiveWarning(command);
  return warn ? `⚠ ${warn}\n` : "";
}

/** Refusals that apply to EVERY path (destructive pattern, sandbox agent-launch
 *  dead-end). Returns the first refusal, or null to proceed. Kept out of execute()
 *  to hold its branching under the complexity gate. */
function globalRefusal(command: string): ToolResult | null {
  if (DESTRUCTIVE.test(command)) {
    return { ok: false, output: "refused: command matches a destructive pattern" };
  }
  return sandboxAgentRefusal(command);
}

/** VANTA-SANDBOX-AGENT-REDIRECT: refuse a tmux-agent launch under the sandbox (it
 *  dead-ends), naming the supported call_agent/agent_session path. Null otherwise. */
export function sandboxAgentRefusal(command: string): ToolResult | null {
  if (!isTmuxAgentLaunch(command)) return null;
  if (shellSandboxEnv(process.env).VANTA_SANDBOX !== "1") return null;
  return { ok: false, output: `refused: launching an agent via tmux under the sandbox dead-ends (tmux is denied).${agentLaunchRedirect(command) ?? ""}` };
}

/** SANDBOX-SERVE-FASTFAIL: a listening web server has NO working path under an active
 *  shell sandbox — background:true isn't sandboxed (refused) and a foreground bind gets
 *  EPERM on the deny-default network. Without this, the agent discovers the dead-end only
 *  by burning both refusals (background↔foreground ping-pong) until the repair loop opens.
 *  Detect the serve/listen intent under sandbox and fail FAST with the one actionable fix.
 *  Null when there's no serve intent or the sandbox is off. */
export function sandboxServeRefusal(command: string, root = process.cwd()): ToolResult | null {
  if (!looksLikeServeIntent(command)) return null;
  if (shellSandboxEnv(process.env).VANTA_SANDBOX !== "1") return null;
  return {
    ok: false,
    output:
      `refused: serving a listening web server has no working path under the shell sandbox — ` +
      `background tasks aren't sandboxed and a foreground bind is denied by the deny-default network. ` +
      `To serve it, re-run this session non-sandboxed.\n${sandboxServeRecovery(root)}`,
  };
}

/** The cwd a child spawn runs in: the session dir if `/cd` changed it this
 *  session, else the tool's root. Until a `/cd` happens this is exactly `root`,
 *  so the spawn is byte-identical to today's. (VANTA-CD-CMD) */
export function shellCommandCwd(root: string): string {
  return isCwdChanged() ? sessionCwd() : root;
}

const DIRECT_MKDIR = /^\s*mkdir(?:\s+(?:-[A-Za-z]+|--))*\s+([^\s;&|`$<>(){}\[\]*?]+)(?=\s*(?:&&|;|$))/;

/** Resolve the one direct mkdir shape eligible for a one-run sandbox grant. */
export function directMkdirTarget(command: string, cwd: string): string | null {
  const raw = DIRECT_MKDIR.exec(command)?.[1];
  if (!raw || raw.startsWith("~")) return null;
  const target = canonicalPath(resolve(cwd, raw));
  return isDangerousPath(target).dangerous ? null : target;
}

/** Show the kernel and operator where a relative mkdir will actually land. */
export function shellCommandSafetyAction(command: string, cwd: string): string {
  const target = directMkdirTarget(command, cwd);
  const resolved = target ? ` (resolved mkdir target: ${target})` : "";
  return `run shell command: ${command}${resolved}`;
}

/** Return the resolved target only when it leaves the canonical project root. */
export function externalDirectMkdirTarget(command: string, cwd: string, root: string): string | null {
  const target = directMkdirTarget(command, cwd);
  if (!target) return null;
  const fromRoot = relative(canonicalPath(resolve(root)), target);
  return fromRoot.startsWith("..") || isAbsolute(fromRoot) ? target : null;
}

/**
 * Return the existing parent that a directly invoked mkdir needs writable. This
 * intentionally recognizes only a single plain mkdir target at command start;
 * arbitrary shell syntax never widens a sandbox binding. The caller supplies
 * this only after the kernel has asked and the operator has approved.
 */
export function approvedMkdirWritableDirs(command: string, cwd: string): string[] {
  const target = directMkdirTarget(command, cwd);
  if (!target) return [];
  let parent = dirname(target);
  while (!existsSync(parent)) {
    const next = dirname(parent);
    if (next === parent) return [];
    parent = next;
  }
  return [canonicalPath(parent)];
}

/** Spawn options for the child. Session env (VANTA-SESSION-ENV) is merged over
 *  process.env; with NO session vars the merge returns process.env unchanged, so
 *  the `env` field is omitted and the spawn is byte-identical to today's. */
function childRunOpts(root: string): { cwd: string; timeout: number; maxBuffer: number; env?: NodeJS.ProcessEnv } {
  const childEnv = applySessionEnv(process.env, sessionEnvStore.snapshot());
  const base = { cwd: shellCommandCwd(root), timeout: TIMEOUT_MS, maxBuffer: MAX_OUTPUT };
  return childEnv === process.env ? base : { ...base, env: childEnv };
}

/** Background path: refuse under an active sandbox (detached tasks aren't wrapped —
 *  no exit-time profile cleanup for an unref'd child, and the sandbox only ever
 *  TIGHTENS, so we refuse the unsandboxed bypass rather than silently weaken it),
 *  else spawn a detached task and return its id. */
async function runBackground(command: string, root: string): Promise<ToolResult> {
  if (shellSandboxEnv(process.env).VANTA_SANDBOX === "1") {
    return { ok: false, output: `refused: background tasks are not sandboxed under sandbox mode.${agentLaunchRedirect(command) ?? ""}\n${sandboxBackgroundRecovery(root)}` };
  }
  const task = await spawnBackground(command, join(root, ".vanta"), root);
  return { ok: true, output: `background task started: ${task.id}\ncheck with: bg_status(${task.id})` };
}

/** Run the command on the active execution backend (local / OS sandbox / docker). */
async function runLocal(command: string, root: string, pfx: string, sandboxWritableDirs: readonly string[] = []): Promise<ToolResult> {
  const local = resolveExecBackend(process.env) === "docker"
    ? { cmd: "sh", args: ["-c", command] }
    : resolveShellInvocation(command);
  const workdir = shellCommandCwd(root);
  const sb = await wrapExec({ env: shellSandboxEnv(process.env), root, workdir, baseCmd: local.cmd, baseArgs: local.args, additionalWritableDirs: sandboxWritableDirs });
  if (isSandboxError(sb)) return { ok: false, output: pfx + sb.error };
  const startedAt = Date.now();
  try {
    const { stdout, stderr } = await run(sb.cmd, sb.args, childRunOpts(root));
    const out = combineOutput(stdout, stderr);
    return withTimingNote({ ok: true, output: pfx + (out || "(command produced no output)") }, Date.now() - startedAt);
  } catch (err) {
    return withTimingNote(formatRunFailure(command, err as RunError, pfx), Date.now() - startedAt);
  } finally {
    await sb.cleanup?.();
  }
}

export const shellCmdTool: Tool = {
  schema: {
    name: "shell_cmd",
    description:
      "Run a shell command from the active working directory. Relative paths resolve there; use the exact absolute path when the user names a destination outside it. Returns combined stdout/stderr. Destructive commands are blocked. Set background=true for long-running commands — returns a task id immediately. Set ssh to a settings.sshConfigs profile name or user@host to run the command on that host. In an SSH session (`vanta ssh user@host`) commands default to the remote host.",
    parameters: {
      type: "object",
      properties: {
        command: { type: "string", description: "The shell command to run" },
        background: { type: "boolean", description: "Run in background (returns task id immediately; check with bg_status)" },
        ssh: { type: "string", description: "A configured SSH profile name or user@host — run the command on that host instead of locally" },
      },
      required: ["command"],
    },
  },
  describeForSafety: (a) => {
    const target = a.ssh ?? process.env.VANTA_SSH_SESSION;
    return target ? `run shell command on ssh "${String(target)}": ${String(a.command ?? "")}` : `run shell command: ${String(a.command ?? "")}`;
  },
  async execute(raw, ctx) {
    const parsed = Args.safeParse(raw);
    if (!parsed.success) {
      return { ok: false, output: 'shell_cmd needs a "command" string' };
    }
    const { command, background, ssh } = parsed.data;
    const refusal = globalRefusal(command);
    if (refusal) return refusal;
    const pfx = warnPrefix(command);
    // An explicit ssh arg wins; otherwise an active SSH session (`vanta ssh
    // user@host` sets VANTA_SSH_SESSION) routes every command to the remote host.
    const sshTarget = ssh ?? process.env.VANTA_SSH_SESSION;
    if (sshTarget) {
      if (background) return { ok: false, output: "refused: background tasks are not supported over ssh" };
      return runRemote(sshTarget, command, ctx.root, pfx);
    }
    // SANDBOX-SERVE-FASTFAIL: pre-empt the background↔foreground refusal ping-pong for a
    // server whose only viable path is a non-sandboxed run. Fires for both branches.
    const serveRefusal = sandboxServeRefusal(command, ctx.root);
    if (serveRefusal) return serveRefusal;
    if (background) return runBackground(command, ctx.root);
    // RELIABILITY-SHELL-BG-WEDGE: a foreground command that backgrounds a child ('&')
    // or starts a never-exiting server holds the inherited stdio pipe open, so the
    // execFile-based foreground path blocks the whole turn (then orphans the daemon at
    // the 30s timeout). Steer it to the detached, unref'd background path instead.
    if (needsBackground(command)) {
      return {
        ok: false,
        output: `refused: "${command}" is long-running or backgrounded — run foreground it would block the session and can orphan the process. Re-run with background:true (returns a task id immediately; tail it with bg_status).`,
      };
    }
    // Sandbox: opt-in OS isolation (VANTA_SANDBOX=1 or shell-only VANTA_SHELL_SANDBOX=1). Off → base unchanged.
    return runLocal(command, ctx.root, pfx, ctx.sandboxWritableDirs);
  },
};
