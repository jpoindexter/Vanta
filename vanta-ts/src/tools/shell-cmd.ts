import { gitShellRefusal } from "../git/shell.js";
import { backgroundEffectSeed, runLocal, runRemote } from "./shell-run.js";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import type { Tool, ToolContext, ToolResult } from "./types.js";
import { spawnBackground } from "./bg-tasks.js";
import { destructiveWarning } from "./destructive-warn.js";
import { isSandboxError } from "../sandbox/run.js";
import { agentLaunchRedirect, isTmuxAgentLaunch } from "./agent-launch-hint.js";
import { needsBackground, looksLikeServeIntent } from "./shell-background-detect.js";
import { resolveExecBackend, wrapExec } from "../exec/backend.js";
import { applySessionEnv, sessionEnvStore } from "../repl/session-env.js";
import { sessionCwd, isCwdChanged } from "../repl/session-cwd.js";
import {
  formatRunFailure,
  type RunError,
} from "./shell-output.js";
import { sandboxServeRecovery } from "./sandbox-recovery.js";
import { resolveShellInvocation } from "../platform/shell.js";
import { addSessionDir } from "./writable-zones.js";
import {
  externalDirectMkdirTargets,
  resolvedMkdirSafetySuffix,
} from "./shell-mkdir-scope.js";
import { buildSafeChildEnv } from "../exec/child-env.js";
import {
  executeEffect,
  stableEffectId,
} from "../effects/execute-effect.js";
import { effectGateFromToolContext } from "../effects/gate-context.js";

export { lastCommandWord, classifyExitCode } from "./shell-output.js";

const Args = z.object({
  command: z.string().min(1),
  background: z.boolean().optional(),
  timeout_ms: z.number().int().min(100).max(120_000).optional(),
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

export function shellSandboxEnv(
  env: NodeJS.ProcessEnv,
  platform: NodeJS.Platform = process.platform,
  hasBwrap = bwrapOnPath(),
): NodeJS.ProcessEnv {
  if (!shouldSandboxShell(env, platform, hasBwrap)) return env;
  // AUTO-enabled (no explicit flag) keeps network ON so npm/git/curl still work — the
  // high-value containment is the deny-default FS (secrets unreadable, writes bounded).
  // Explicitly-requested sandboxing keeps the strict default (network denied). A user-set
  // VANTA_SANDBOX_NET is always honored — set it to 0 for full containment in auto mode.
  if (explicitSandbox(env) || env.VANTA_SANDBOX_NET !== undefined) return { ...env, VANTA_SANDBOX: "1" };
  return { ...env, VANTA_SANDBOX: "1", VANTA_SANDBOX_NET: "1" };
}


function warnPrefix(command: string): string {
  const warn = destructiveWarning(command);
  return warn ? `⚠ ${warn}\n` : "";
}

/** Refusals that apply to EVERY path (destructive pattern, sandbox agent-launch
 *  dead-end). Returns the first refusal, or null to proceed. Kept out of execute()
 *  to hold its branching under the complexity gate. */
function globalRefusal(command: string, options: { background?: boolean; ssh?: string }): ToolResult | null {
  const git = gitShellRefusal(command, options);
  if (git) return { ok: false, output: git };
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

/** SANDBOX-SERVE-FASTFAIL: serving is supported inside the OS sandbox when its
 * network capability is enabled. Refuse only strict network-disabled sessions,
 * with a recovery that keeps filesystem containment on. */
export function sandboxServeRefusal(
  command: string,
  root = process.cwd(),
  env: NodeJS.ProcessEnv = process.env,
  options: { platform?: NodeJS.Platform; hasBwrap?: boolean } = {},
): ToolResult | null {
  if (!looksLikeServeIntent(command)) return null;
  const sandboxEnv = shellSandboxEnv(env, options.platform, options.hasBwrap);
  if (sandboxEnv.VANTA_SANDBOX !== "1" || sandboxEnv.VANTA_SANDBOX_NET === "1") return null;
  return {
    ok: false,
    output:
      `refused: sandbox network is disabled, so this listening web server cannot bind. ` +
      `Keep filesystem containment enabled and allow network for server work.\n${sandboxServeRecovery(root)}`,
  };
}

/** The cwd a child spawn runs in: the session dir if `/cd` changed it this
 *  session, else the tool's root. Until a `/cd` happens this is exactly `root`,
 *  so the spawn is byte-identical to today's. (VANTA-CD-CMD) */
export function shellCommandCwd(root: string): string {
  return isCwdChanged() ? sessionCwd() : root;
}

export { approvedMkdirWritableDirs, directMkdirTarget, externalDirectMkdirTarget, externalDirectMkdirTargets } from "./shell-mkdir-scope.js";

/** Show the kernel and operator where a relative mkdir will actually land. */
export function shellCommandSafetyAction(command: string, cwd: string): string {
  return `run shell command: ${command}${resolvedMkdirSafetySuffix(command, cwd)}`;
}

/** Spawn options for the child. Session env (VANTA-SESSION-ENV) is merged over
 *  process.env; with NO session vars the merge returns process.env unchanged, so
 *  the `env` field is omitted and the spawn is byte-identical to today's. */
function childRunOpts(root: string, timeoutMs: number): { cwd: string; timeout: number; maxBuffer: number; env?: NodeJS.ProcessEnv } {
  const childEnv = applySessionEnv(process.env, sessionEnvStore.snapshot());
  const base = { cwd: shellCommandCwd(root), timeout: timeoutMs, maxBuffer: MAX_OUTPUT };
  return { ...base, env: buildSafeChildEnv(childEnv) };
}

function localInvocation(command: string): { cmd: string; args: string[] } {
  return resolveExecBackend(process.env) === "docker"
    ? { cmd: "sh", args: ["-c", command] }
    : resolveShellInvocation(command);
}

/** Background path: use the same execution backend and OS sandbox as foreground
 * commands. The background task owns the sandbox profile cleanup and releases it
 * only after the detached child exits. */
async function runBackground(
  command: string,
  ctx: ToolContext,
  sandboxWritableDirs: readonly string[] = [],
): Promise<ToolResult> {
  const root = ctx.root;
  const workdir = shellCommandCwd(root);
  const childEnv = applySessionEnv(process.env, sessionEnvStore.snapshot());
  const local = localInvocation(command);
  const sb = await wrapExec({
    env: shellSandboxEnv(childEnv),
    root,
    workdir,
    baseCmd: local.cmd,
    baseArgs: local.args,
    additionalWritableDirs: sandboxWritableDirs,
  });
  if (isSandboxError(sb)) return { ok: false, output: sb.error };
  let cleanupTransferred = false;
  try {
    const seed = backgroundEffectSeed(command, ctx);
    const hash = seed.payloadSha256;
    const result = await executeEffect({
      id: stableEffectId(seed),
      actor: "shell_cmd",
      action: `launch sandboxed background command with sha256:${hash}`,
      ...seed,
    }, effectGateFromToolContext(ctx), async () => {
      const task = await spawnBackground(command, join(root, ".vanta"), workdir, {
        cmd: sb.cmd,
        args: sb.args,
        env: buildSafeChildEnv(childEnv),
        cleanup: sb.cleanup,
      });
      cleanupTransferred = true;
      return { value: task, acknowledgementId: task.pid ? String(task.pid) : task.id };
    });
    if ((result.outcome !== "confirmed" && result.outcome !== "verified") || !result.value) {
      return { ok: false, output: `background launch ${result.outcome}` };
    }
    const task = result.value;
    return { ok: true, output: `background task started: ${task.id}\ncheck with: bg_status(${task.id})` };
  } catch (error) {
    return formatRunFailure(command, error as RunError, "");
  } finally {
    if (!cleanupTransferred) await sb.cleanup?.();
  }
}


export const shellCmdTool: Tool = {
  schema: {
    name: "shell_cmd",
    description:
      "Run a shell command from the active working directory. Relative paths resolve there; use the exact absolute path when the user names a destination outside it. Returns combined stdout/stderr. Destructive commands are blocked. Commands time out after 30 seconds by default; use timeout_ms for a bounded longer local scan (max 120000). Set background=true for long-running commands — returns a task id immediately. Set ssh to a settings.sshConfigs profile name or user@host to run the command on that host. In an SSH session (`vanta ssh user@host`) commands default to the remote host.",
    parameters: {
      type: "object",
      properties: {
        command: { type: "string", description: "The shell command to run" },
        background: { type: "boolean", description: "Run in background (returns task id immediately; check with bg_status)" },
        timeout_ms: { type: "integer", minimum: 100, maximum: 120000, description: "Foreground timeout in milliseconds (default 30000; max 120000)" },
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
    const { command, background, timeout_ms = TIMEOUT_MS, ssh } = parsed.data;
    const sshTarget = ssh ?? process.env.VANTA_SSH_SESSION;
    const refusal = globalRefusal(command, { background, ssh: sshTarget });
    if (refusal) return refusal;
    const pfx = warnPrefix(command);
    // An explicit ssh arg wins; otherwise an active SSH session (`vanta ssh
    // user@host` sets VANTA_SSH_SESSION) routes every command to the remote host.
    if (sshTarget) {
      if (background) return { ok: false, output: "refused: background tasks are not supported over ssh" };
      return runRemote({ target: sshTarget, command, root: ctx.root, pfx, timeoutMs: timeout_ms });
    }
    // SANDBOX-SERVE-FASTFAIL: strict network-disabled sessions cannot bind a
    // listener. The default sandbox permits network and continues below.
    const serveRefusal = sandboxServeRefusal(command, ctx.root);
    if (serveRefusal) return serveRefusal;
    if (background) return runBackground(command, ctx, ctx.sandboxWritableDirs);
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
    const result = await runLocal({ command, root: ctx.root, workdir: shellCommandCwd(ctx.root), pfx,
      sandboxWritableDirs: ctx.sandboxWritableDirs, sandboxEnv: shellSandboxEnv(process.env), childOptions: childRunOpts(ctx.root, timeout_ms) });
    // A human-approved direct mkdir is a project handoff, not a one-command dead end.
    // Keep only the exact newly-created directory writable for the rest of this
    // session; the dangerous-path floor and kernel gate still apply on every call.
    trackCreatedDirectories(result, command, ctx);
    return result;
  },
};

function trackCreatedDirectories(result: ToolResult, command: string, ctx: ToolContext): void {
  if (!result.ok || !ctx.sandboxWritableDirs?.length) return;
  const targets = externalDirectMkdirTargets(command, shellCommandCwd(ctx.root), ctx.root);
  for (const target of targets) if (existsSync(target)) addSessionDir(target, process.env);
}
