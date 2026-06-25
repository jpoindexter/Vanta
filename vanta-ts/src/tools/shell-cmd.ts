import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { promisify } from "node:util";
import { join } from "node:path";
import { z } from "zod";
import type { Tool, ToolResult } from "./types.js";
import { spawnBackground } from "./bg-tasks.js";
import { destructiveWarning } from "./destructive-warn.js";
import { isSandboxError } from "../sandbox/run.js";
import { agentLaunchRedirect, isTmuxAgentLaunch } from "./agent-launch-hint.js";
import { wrapExec } from "../exec/backend.js";
import { loadSettings } from "../settings/store.js";
import { resolveSshTarget, buildSshArgs } from "../ssh/config.js";
import { parseVantaHints, formatHintSuggestion } from "../hints/vanta-hints.js";
import { limitOutput, resolveMaxOutput } from "./bash-output-limit.js";
import { shouldShowTiming, buildTimingNote } from "./shell-timing.js";
import { formatJsonInOutput } from "../term/json-format.js";
import { applySessionEnv, sessionEnvStore } from "../repl/session-env.js";
import { sessionCwd, isCwdChanged } from "../repl/session-cwd.js";

type RunError = { code?: number | string; stdout?: string; stderr?: string; message: string };

/** Combine captured stdout/stderr into the tool output, stripping any subprocess
 *  plugin-hint tags from stderr and appending an install suggestion so the model
 *  never sees the raw tag, then bounding the size (head+tail with a truncation
 *  marker) so a multi-megabyte dump can't flood the context. No hint tag and
 *  output under the limit → byte-identical to the plain join. */
function combineOutput(stdout: string | undefined, stderr: string | undefined): string {
  const { hints, stripped } = parseVantaHints(stderr ?? "");
  const joined = [stdout, stripped].filter(Boolean).join("\n").trim();
  const out = hints.length === 0 ? joined : appendSuggestion(joined, hints);
  // VANTA-SHELL-JSON-FORMAT: opt-in pretty-print of JSON lines (bounded, never throws,
  // non-JSON unchanged). Default off = byte-identical join.
  const shaped = process.env.VANTA_JSON_FORMAT === "1" ? formatJsonInOutput(out) : out;
  return limitOutput(shaped, resolveMaxOutput(process.env));
}

/** Append a plugin-install suggestion line (kept separate so combineOutput stays small). */
function appendSuggestion(out: string, hints: ReturnType<typeof parseVantaHints>["hints"]): string {
  const suggestion = formatHintSuggestion(hints);
  return suggestion ? [out, suggestion].filter(Boolean).join("\n") : out;
}

/** Build the result for a non-zero/failed run: reclassify benign exits, else error. */
function formatRunFailure(command: string, e: RunError, pfx: string): ToolResult {
  const out = combineOutput(e.stdout, e.stderr);
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
// Writes to a real device node (> /dev/sda, dd of=/dev/disk0) are destructive,
// but the safe pseudo-devices (/dev/null, /dev/stderr, etc.) are not — the old
// `>\s*/dev/` flagged the ubiquitous `2>/dev/null` as destructive (false positive).
const SAFE_DEV = "null|zero|stdout|stderr|stdin|tty|fd|random|urandom|console|full|ptmx";
const DESTRUCTIVE = new RegExp(
  `\\brm\\s+-rf?\\b|\\bsudo\\b|\\bchmod\\s+777\\b|\\bmkfs\\b|(?:>\\s*|of=)\\/dev\\/(?!(?:${SAFE_DEV})\\b)|:\\(\\)\\s*\\{`,
);

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

/** VANTA-SANDBOX-AGENT-REDIRECT: refuse a tmux-agent launch under the sandbox (it
 *  dead-ends), naming the supported call_agent/agent_session path. Null otherwise. */
export function sandboxAgentRefusal(command: string): ToolResult | null {
  if (!isTmuxAgentLaunch(command)) return null;
  if (shellSandboxEnv(process.env).VANTA_SANDBOX !== "1") return null;
  return { ok: false, output: `refused: launching an agent via tmux under the sandbox dead-ends (tmux is denied).${agentLaunchRedirect(command) ?? ""}` };
}

/** The cwd a child spawn runs in: the session dir if `/cd` changed it this
 *  session, else the tool's root. Until a `/cd` happens this is exactly `root`,
 *  so the spawn is byte-identical to today's. (VANTA-CD-CMD) */
function spawnCwd(root: string): string {
  return isCwdChanged() ? sessionCwd() : root;
}

/** Spawn options for the child. Session env (VANTA-SESSION-ENV) is merged over
 *  process.env; with NO session vars the merge returns process.env unchanged, so
 *  the `env` field is omitted and the spawn is byte-identical to today's. */
function childRunOpts(root: string): { cwd: string; timeout: number; maxBuffer: number; env?: NodeJS.ProcessEnv } {
  const childEnv = applySessionEnv(process.env, sessionEnvStore.snapshot());
  const base = { cwd: spawnCwd(root), timeout: TIMEOUT_MS, maxBuffer: MAX_OUTPUT };
  return childEnv === process.env ? base : { ...base, env: childEnv };
}

/** Append a "(took <elapsed>)" line when the run was slow enough to surface.
 *  Observational only — the ok/exit/result is untouched; a fast run (under the
 *  threshold) returns the result byte-identical. */
function withTimingNote(result: ToolResult, elapsedMs: number): ToolResult {
  if (!shouldShowTiming(elapsedMs)) return result;
  const note = buildTimingNote(elapsedMs);
  const output = result.output ? `${result.output}\n${note}` : note;
  return { ...result, output };
}

/** Run the command on the active execution backend (local / OS sandbox / docker). */
async function runLocal(command: string, root: string, pfx: string): Promise<ToolResult> {
  const sb = await wrapExec({ env: shellSandboxEnv(process.env), root, baseCmd: "sh", baseArgs: ["-c", command] });
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
      "Run a shell command inside the project scope. Returns combined stdout/stderr. Destructive commands are blocked. Set background=true for long-running commands — returns a task id immediately. Set ssh to a settings.sshConfigs profile name or user@host to run the command on that host. In an SSH session (`vanta ssh user@host`) commands default to the remote host.",
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
    if (DESTRUCTIVE.test(command)) {
      return { ok: false, output: "refused: command matches a destructive pattern" };
    }
    const agentRefusal = sandboxAgentRefusal(command);
    if (agentRefusal) return agentRefusal;
    const pfx = warnPrefix(command);
    // An explicit ssh arg wins; otherwise an active SSH session (`vanta ssh
    // user@host` sets VANTA_SSH_SESSION) routes every command to the remote host.
    const sshTarget = ssh ?? process.env.VANTA_SSH_SESSION;
    if (sshTarget) {
      if (background) return { ok: false, output: "refused: background tasks are not supported over ssh" };
      return runRemote(sshTarget, command, ctx.root, pfx);
    }
    if (background) {
      // Sandbox: detached background tasks aren't wrapped (no exit-time profile
      // cleanup for an unref'd child). The sandbox only ever TIGHTENS, so when it's
      // requested we REFUSE the unsandboxed bypass rather than silently weaken it.
      if (shellSandboxEnv(process.env).VANTA_SANDBOX === "1") {
        return { ok: false, output: `refused: background tasks are not sandboxed; run without background=true under sandbox mode, or unset VANTA_SANDBOX/VANTA_SHELL_SANDBOX${agentLaunchRedirect(command) ?? ""}` };
      }
      const task = await spawnBackground(command, join(ctx.root, ".vanta"), ctx.root);
      return { ok: true, output: `background task started: ${task.id}\ncheck with: bg_status(${task.id})` };
    }
    // Sandbox: opt-in OS isolation (VANTA_SANDBOX=1 or shell-only VANTA_SHELL_SANDBOX=1). Off → base unchanged.
    return runLocal(command, ctx.root, pfx);
  },
};
