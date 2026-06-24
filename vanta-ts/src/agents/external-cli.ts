import { existsSync, readFileSync } from "node:fs";
import { join, delimiter } from "node:path";
import { resolveVantaHome } from "../store/home.js";

// VANTA-CALL-AGENT — drive ANY AI coding-agent CLI as a subprocess, like a human
// opening a second terminal. Vanta calls the REAL agent (its own harness, tools,
// model) non-interactively and reads back its answer. Works with whatever the user
// has installed: a few verified built-ins out of the box, auto-detection of what's
// on PATH, and ~/.vanta/agents.json to declare ANY other CLI/harness.

/** A resolved agent: command + a builder turning (prompt, model) into argv. */
type AgentSpec = { cmd: string; build: (prompt: string, model?: string) => string[] };

// Verified non-interactive invocations (2026-06; flags change — re-verify with `<cli> --help`).
const BUILTINS: Record<string, AgentSpec> = {
  "claude":       { cmd: "claude",       build: (p, m) => ["-p", ...(m ? ["--model", m] : []), p] },
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

/** Resolve an agent's argv for a prompt. Null when the agent isn't known/configured. */
export function buildAgentInvocation(
  agent: string,
  prompt: string,
  model?: string,
  env: NodeJS.ProcessEnv = process.env,
): Invocation | null {
  const spec = registry(env)[agent];
  return spec ? { cmd: spec.cmd, args: spec.build(prompt, model) } : null;
}

export type RunResult = { ok: boolean; stdout: string; stderr: string; code: number | null; notInstalled?: boolean };

/** Injectable exec seam (matches node:child_process execFile's callback form). */
export type ExecFn = (
  cmd: string,
  args: string[],
  opts: { cwd: string; timeout: number; maxBuffer: number },
  cb: (err: (Error & { code?: string | number; killed?: boolean }) | null, stdout: string, stderr: string) => void,
) => void;

const MAX_OUTPUT = 60_000;

function timeoutMs(env: NodeJS.ProcessEnv): number {
  const v = Number(env.VANTA_CALL_AGENT_TIMEOUT_MS);
  return Number.isFinite(v) && v > 0 ? v : 300_000;
}

/** Spawn the agent CLI, capture output, classify not-installed vs timeout vs failure. */
export async function runExternalAgent(
  inv: Invocation,
  opts: { cwd: string; env?: NodeJS.ProcessEnv; exec?: ExecFn },
): Promise<RunResult> {
  const env = opts.env ?? process.env;
  const exec = opts.exec ?? ((await import("node:child_process")).execFile as unknown as ExecFn);
  return new Promise((resolve) => {
    exec(inv.cmd, inv.args, { cwd: opts.cwd, timeout: timeoutMs(env), maxBuffer: 16 * 1024 * 1024 }, (err, stdout, stderr) => {
      const out = String(stdout ?? "").slice(0, MAX_OUTPUT);
      const errOut = String(stderr ?? "").slice(0, MAX_OUTPUT);
      if (err?.code === "ENOENT") return resolve({ ok: false, stdout: out, stderr: errOut, code: null, notInstalled: true });
      if (err?.killed) return resolve({ ok: false, stdout: out, stderr: "timed out", code: null });
      const code = typeof err?.code === "number" ? err.code : err ? 1 : 0;
      resolve({ ok: !err, stdout: out, stderr: errOut, code });
    });
  });
}
