import { existsSync, readFileSync } from "node:fs";
import { join, delimiter } from "node:path";
import { spawn as nodeSpawn } from "node:child_process";
import { resolveVantaHome } from "../store/home.js";

// VANTA-CALL-AGENT — drive ANY AI coding-agent CLI as a subprocess, like a human
// opening a second terminal. Vanta calls the REAL agent (its own harness, tools,
// model) non-interactively and reads back its answer. Works with whatever the user
// has installed: a few verified built-ins out of the box, auto-detection of what's
// on PATH, and ~/.vanta/agents.json to declare ANY other CLI/harness.

/** A resolved agent: command + a builder turning (prompt, model, coding) into argv.
 * `coding` = run the agent BUILD-READY (auto-accepts file edits) so a headless A2A call
 * can actually write/change code, not just answer — verified per-agent against the CLI. */
type AgentSpec = { cmd: string; build: (prompt: string, model?: string, coding?: boolean, autonomous?: boolean) => string[] };

/** claude non-interactive argv. A BUILD (coding) defaults to fast Sonnet — not claude's slow
 * Opus default that timed out — auto-accepts edits, and streams events (stream-json) so the
 * caller can show live progress (call_agent parses that stream). Plain calls stay text.
 * `autonomous` = FULL autonomy (`--dangerously-skip-permissions`): safe ONLY because the caller
 * runs this inside a mount-scoped Docker box (the container is the boundary, not the flag). */
function claudeArgs(prompt: string, model?: string, coding?: boolean, autonomous?: boolean): string[] {
  const build = coding || autonomous;
  const m = model ?? (build ? "sonnet" : undefined);
  const mode = autonomous
    ? ["--dangerously-skip-permissions", "--output-format", "stream-json", "--verbose"]
    : coding
      ? ["--permission-mode", "acceptEdits", "--output-format", "stream-json", "--verbose"]
      : [];
  return ["-p", ...(m ? ["--model", m] : []), ...mode, prompt];
}

// Verified non-interactive invocations (2026-06; flags change — re-verify with `<cli> --help`).
const BUILTINS: Record<string, AgentSpec> = {
  "claude":       { cmd: "claude",       build: claudeArgs },
  "codex":        { cmd: "codex",        build: (p, m) => ["exec", ...(m ? ["-m", m] : []), p] },
  "gemini":       { cmd: "gemini",       build: (p, m) => [...(m ? ["-m", m] : []), "-p", p] },
  "cursor-agent": { cmd: "cursor-agent", build: (p, m) => ["-p", ...(m ? ["--model", m] : []), p] },
  "opencode":     { cmd: "opencode",     build: (p, m) => ["run", ...(m ? ["-m", m] : []), p] },
};

// User-declared custom agents — works for ANY harness:
//   ~/.vanta/agents.json → { "agents": {
//     "aider": { "cmd": "aider", "args": ["--message", "{prompt}"], "modelFlag": "--model" }
//   } }
// "{prompt}"/"{model}" tokens are substituted as separate argv items (never shell-interpolated).
type ConfigAgent = { cmd: string; args: string[]; modelFlag?: string };

function loadConfig(env: NodeJS.ProcessEnv): Record<string, ConfigAgent> {
  try {
    const raw: unknown = JSON.parse(readFileSync(join(resolveVantaHome(env), "agents.json"), "utf8"));
    const agents = (raw as { agents?: unknown } | null)?.agents;
    if (!agents || typeof agents !== "object") return {};
    const out: Record<string, ConfigAgent> = {};
    for (const [name, v] of Object.entries(agents as Record<string, unknown>)) {
      const a = v as Partial<ConfigAgent>;
      if (typeof a?.cmd === "string" && Array.isArray(a.args) && a.args.every((x) => typeof x === "string")) {
        out[name] = { cmd: a.cmd, args: a.args, modelFlag: typeof a.modelFlag === "string" ? a.modelFlag : undefined };
      }
    }
    return out;
  } catch {
    return {};
  }
}

function configSpec(c: ConfigAgent): AgentSpec {
  return {
    cmd: c.cmd,
    build: (p, m) => [
      ...(m && c.modelFlag ? [c.modelFlag, m] : []),
      ...c.args.map((a) => a.replace("{prompt}", p).replace("{model}", m ?? "")),
    ],
  };
}

/** Built-ins overlaid by user config (config wins on a name clash). */
function registry(env: NodeJS.ProcessEnv): Record<string, AgentSpec> {
  const merged: Record<string, AgentSpec> = { ...BUILTINS };
  for (const [name, c] of Object.entries(loadConfig(env))) merged[name] = configSpec(c);
  return merged;
}

/** Every agent Vanta knows how to call (built-in + configured), installed or not. */
export function knownAgents(env: NodeJS.ProcessEnv = process.env): string[] {
  return Object.keys(registry(env)).sort();
}

function isOnPath(cmd: string, env: NodeJS.ProcessEnv): boolean {
  if (cmd.includes("/")) return existsSync(cmd);
  return (env.PATH ?? "").split(delimiter).some((d) => d !== "" && existsSync(join(d, cmd)));
}

/** The known agents whose CLI is actually installed on THIS machine. */
export function detectInstalledAgents(env: NodeJS.ProcessEnv = process.env): string[] {
  const reg = registry(env);
  return Object.keys(reg).filter((n) => isOnPath(reg[n]!.cmd, env)).sort();
}

export type Invocation = { cmd: string; args: string[] };

/** Resolve an agent's argv for a prompt. Null when the agent isn't known/configured.
 * `opts.coding` builds a build-ready invocation (auto-accepts edits) for headless A2A. */
export function buildAgentInvocation(
  agent: string,
  prompt: string,
  opts: { model?: string; env?: NodeJS.ProcessEnv; coding?: boolean; autonomous?: boolean } = {},
): Invocation | null {
  const env = opts.env ?? process.env;
  const spec = registry(env)[agent];
  return spec ? { cmd: spec.cmd, args: spec.build(prompt, opts.model, opts.coding, opts.autonomous) } : null;
}

export type RunResult = { ok: boolean; stdout: string; stderr: string; code: number | null; notInstalled?: boolean };

/** The minimal child-process surface runExternalAgent depends on (real or fake). */
export type ChildLike = {
  stdout: { on(ev: "data", cb: (d: unknown) => void): void } | null;
  stderr: { on(ev: "data", cb: (d: unknown) => void): void } | null;
  on(ev: "error", cb: (e: NodeJS.ErrnoException) => void): void;
  on(ev: "close", cb: (code: number | null, signal: NodeJS.Signals | null) => void): void;
  kill(signal?: NodeJS.Signals): void;
};

/** Injectable spawn seam (real child_process.spawn in production, a fake in tests). */
export type SpawnFn = (cmd: string, args: string[], opts: { cwd: string; env: NodeJS.ProcessEnv }) => ChildLike;

// stdin is IGNORED so the agent CLI doesn't block ~3s waiting on stdin it never gets
// ("no stdin data received in 3s" warning) — A2A calls are prompt-in-argv, output-out.
const defaultSpawn: SpawnFn = (cmd, args, opts) =>
  nodeSpawn(cmd, args, { cwd: opts.cwd, env: opts.env, stdio: ["ignore", "pipe", "pipe"] }) as unknown as ChildLike;

const MAX_OUTPUT = 60_000;
const DEFAULT_HEARTBEAT_MS = 8000;

function timeoutMs(env: NodeJS.ProcessEnv): number {
  const v = Number(env.VANTA_CALL_AGENT_TIMEOUT_MS);
  return Number.isFinite(v) && v > 0 ? v : 300_000;
}

/**
 * Run the agent CLI, STREAMING its output via `onChunk` (line-buffered) + a periodic
 * heartbeat as it runs — instead of the old execFile wait-then-dump. The returned
 * RunResult is byte-equivalent to before: full stdout/stderr (capped), exit code,
 * not-installed (ENOENT) and timeout classification unchanged. CALL-AGENT-STREAM.
 */
export async function runExternalAgent(
  inv: Invocation,
  opts: { cwd: string; env?: NodeJS.ProcessEnv; spawn?: SpawnFn; onChunk?: (text: string) => void; heartbeatMs?: number; timeoutMs?: number },
): Promise<RunResult> {
  const env = opts.env ?? process.env;
  const spawn = opts.spawn ?? defaultSpawn;
  const onChunk = opts.onChunk;
  const startMs = Date.now();
  return new Promise<RunResult>((resolve) => {
    let stdout = "";
    let stderr = "";
    let lineBuf = "";
    let settled = false;
    let timedOut = false;
    const cap = (s: string) => s.slice(0, MAX_OUTPUT);
    const emitLines = (t: string) => {
      if (!onChunk) return;
      lineBuf += t;
      const parts = lineBuf.split("\n");
      lineBuf = parts.pop() ?? "";
      for (const line of parts) if (line.trim()) onChunk(line);
    };
    const finish = (r: RunResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(killTimer);
      clearInterval(hb);
      if (lineBuf.trim()) onChunk?.(lineBuf);
      resolve(r);
    };
    const child = spawn(inv.cmd, inv.args, { cwd: opts.cwd, env });
    const killTimer = setTimeout(() => { timedOut = true; child.kill("SIGTERM"); }, opts.timeoutMs ?? timeoutMs(env));
    const hb = setInterval(() => onChunk?.(`… ${inv.cmd} working (${Math.round((Date.now() - startMs) / 1000)}s)`), opts.heartbeatMs ?? DEFAULT_HEARTBEAT_MS);
    child.stdout?.on("data", (d) => { const t = String(d); stdout += t; emitLines(t); });
    child.stderr?.on("data", (d) => { const t = String(d); stderr += t; emitLines(t); });
    child.on("error", (e) => {
      if (e.code === "ENOENT") return finish({ ok: false, stdout: cap(stdout), stderr: cap(stderr), code: null, notInstalled: true });
      finish({ ok: false, stdout: cap(stdout), stderr: e.message, code: null });
    });
    child.on("close", (code, signal) => {
      if (timedOut) return finish({ ok: false, stdout: cap(stdout), stderr: "timed out", code: null });
      finish({ ok: code === 0, stdout: cap(stdout), stderr: cap(stderr), code: code ?? (signal ? 1 : 0) });
    });
  });
}
