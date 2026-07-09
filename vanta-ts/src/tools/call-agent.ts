import { z } from "zod";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import { promisify } from "node:util";
import {
  buildAgentInvocation,
  runExternalAgent,
  knownAgents,
  detectInstalledAgents,
  type Invocation,
  type RunResult,
} from "../agents/external-cli.js";
import { buildAutonomousDockerInvocation, type Mount } from "../agents/autonomous-docker.js";
import { deriveMountScope, type ScopePlan } from "../agents/mount-scope.js";
import { autonomousPreflight, AUTONOMOUS_IMAGE_DEFAULT } from "../agents/autonomous-preflight.js";
import { resolveBoxCredential, type BoxCredential } from "../agents/autonomous-creds.js";
import { extractEditedPath, parseClaudeStreamLine } from "../agents/claude-stream.js";
import { recordAgentEdit } from "../agents/attribution-store.js";
import type { Tool, ToolContext, ToolResult } from "./types.js";

const execFileAsync = promisify(execFile);

/** Build the boxed autonomous invocation: the agent runs `--dangerously-skip-permissions` inside a
 *  Docker container scoped to the project (rw) + its auth (ro). The mount-set is the boundary —
 *  network stays on because the agent must reach its model API; the FILESYSTEM is what's boxed. */
export function autonomousInvocation(agent: string, prompt: string, model: string | undefined, root: string): { inv: Invocation; mounts: Mount[]; plan: ScopePlan; cred: BoxCredential | null } | { error: string } {
  if (agent !== "claude") return { error: `autonomous (Docker-boxed) mode supports claude only, not "${agent}"` };
  const bare = buildAgentInvocation(agent, prompt, { model, env: process.env, autonomous: true });
  if (!bare) return { error: `unknown agent "${agent}"` };
  // VANTA-A2A-MOUNT-SCOPE: derive the blast radius from the task (project rw/ro + dry-run on destructive).
  const plan = deriveMountScope({ task: prompt, outputDir: root });
  // Auth: a Linux container can't read the macOS keychain, so the credential is forwarded as env
  // (`-e NAME`, value from the parent) rather than mounting host creds. See autonomous-creds.ts.
  const cred = resolveBoxCredential(process.env);
  const image = process.env.VANTA_AGENT_DOCKER_IMAGE ?? AUTONOMOUS_IMAGE_DEFAULT;
  const inv = buildAutonomousDockerInvocation(bare, { image, mounts: plan.mounts, workdir: plan.workdir, network: true, passEnv: cred ? [cred.name] : [] });
  return { inv, mounts: plan.mounts, plan, cred };
}

const CODING_TIMEOUT_MS = 600_000; // a build takes longer than a Q&A — 10 min headroom

async function originRemoteUrl(root: string): Promise<string | undefined> {
  try {
    const { stdout } = await execFileAsync("git", ["config", "--get", "remote.origin.url"], { cwd: root, timeout: 2000 });
    return stdout.trim() || undefined;
  } catch { return undefined; }
}

function pathInRoot(root: string, path: string): { abs: string; rel: string } | null {
  const abs = resolve(root, path);
  const rel = relative(root, abs);
  return rel && !rel.startsWith("..") && !isAbsolute(rel) ? { abs, rel } : null;
}

export async function recordStreamEdits(ctx: ToolContext, agent: string, paths: Iterable<string>): Promise<void> {
  if (!ctx.sessionId) return;
  const remoteUrl = await originRemoteUrl(ctx.root);
  await Promise.allSettled(Array.from(new Set(paths)).map(async (p) => {
    const located = pathInRoot(ctx.root, p);
    if (!located) return;
    const content = await readFile(located.abs, "utf8").catch(() => null);
    if (content === null) return;
    await recordAgentEdit(join(ctx.root, ".vanta"), { sessionId: ctx.sessionId!, agent, path: located.rel, content, remoteUrl });
  }));
}

/** Run a claude BUILD: parse stream-json events → live progress (Write/Bash/…) + the final
 * result, instead of a silent block that buffers everything until done. */
async function runCodingClaude(ctx: ToolContext, inv: Invocation, env?: NodeJS.ProcessEnv, agent = "claude"): Promise<ToolResult> {
  let result = "";
  let isError = false;
  let last = "";
  const edited = new Set<string>();
  const onChunk = (line: string) => {
    const editedPath = extractEditedPath(line);
    if (editedPath) edited.add(editedPath);
    const ev = parseClaudeStreamLine(line);
    if (ev.progress && ev.progress !== last) { last = ev.progress; ctx.onProgress?.(`⋯ claude: ${ev.progress}`); }
    if (ev.result !== undefined) { result = ev.result; isError = ev.isError === true; }
  };
  const res = await runExternalAgent(inv, { cwd: ctx.root, env, onChunk, timeoutMs: CODING_TIMEOUT_MS });
  await recordStreamEdits(ctx, agent, edited);
  if (res.notInstalled) return { ok: false, output: "claude CLI not found on PATH." };
  if (!result) return { ok: false, output: `claude build did not finish: ${(res.stderr || res.stdout).trim().slice(0, 500) || `exit ${res.code ?? "?"}`}` };
  return { ok: !isError, output: `[claude]\n${result}` };
}

/** Dispatch the resolved call: a claude BUILD streams stream-json for live progress;
 * everything else streams text output. Split out to keep execute under the complexity gate. */
async function runResolved(ctx: ToolContext, agent: string, inv: Invocation, coding?: boolean): Promise<ToolResult> {
  if (coding && agent === "claude") return runCodingClaude(ctx, inv);
  return formatResult(agent, await runExternalAgent(inv, { cwd: ctx.root, onChunk: ctx.onProgress }));
}

/** Resolve → approve (showing the exact mount boundary) → run the boxed agent, streaming progress. */
async function runAutonomous(ctx: ToolContext, agent: string, prompt: string | undefined, model?: string): Promise<ToolResult> {
  if (!prompt) return { ok: false, output: "call_agent autonomous needs a prompt" };
  const pf = autonomousPreflight(process.env.VANTA_AGENT_DOCKER_IMAGE ?? AUTONOMOUS_IMAGE_DEFAULT);
  if (!pf.ready) return { ok: false, output: `call_agent autonomous: ${pf.reason}. ${pf.hint}` };
  const boxed = autonomousInvocation(agent, prompt, model, ctx.root);
  if ("error" in boxed) return { ok: false, output: boxed.error };
  if (!boxed.cred) return { ok: false, output: "call_agent autonomous: no credential to authenticate the boxed agent. Set ANTHROPIC_API_KEY, or run `claude setup-token` and export CLAUDE_CODE_OAUTH_TOKEN (a container can't read the macOS keychain)." };
  const where = `${boxed.plan.summary}; auth via ${boxed.cred.name}`;
  const tail = boxed.plan.dryRun ? "DESTRUCTIVE intent — preview the plan before approving" : "it cannot touch anything else on the host";
  const approved = await ctx.requestApproval(
    `run ${agent} AUTONOMOUSLY in a Docker box: ${prompt.slice(0, 80)}`,
    `fully autonomous (--dangerously-skip-permissions) but OS-boxed to exactly [${where}] — ${tail}`,
    "call_agent",
  );
  if (!approved) return { ok: false, output: "call_agent: declined" };
  return runCodingClaude(ctx, boxed.inv, { ...process.env, [boxed.cred.name]: boxed.cred.value });
}

const Args = z.object({
  agent: z.string().optional(),
  prompt: z.string().optional(),
  model: z.string().optional(),
  coding: z.boolean().optional(), // build-ready: the agent auto-accepts file edits so it can actually BUILD headless
  autonomous: z.boolean().optional(), // FULL autonomy, OS-boxed in a mount-scoped Docker container
});

/** List the agent CLIs actually installed on this machine (and how to add more). */
function listAgents(): ToolResult {
  const installed = detectInstalledAgents();
  if (installed.length) {
    return { ok: true, output: `Installed agents you can call: ${installed.join(", ")}. Add any other CLI in ~/.vanta/agents.json.` };
  }
  return { ok: true, output: `No known agent CLIs found on PATH. Known: ${knownAgents().join(", ")}. Add custom CLIs in ~/.vanta/agents.json.` };
}

/** Validate + resolve the agent/prompt into an invocation, or a user-facing error. */
function resolveCall(agent: string, prompt: string | undefined, model?: string, coding?: boolean): { error: string } | { inv: Invocation } {
  if (!prompt) return { error: "call_agent needs a prompt" };
  const inv = buildAgentInvocation(agent, prompt, { model, env: process.env, coding });
  if (!inv) return { error: `unknown agent "${agent}". Known: ${knownAgents().join(", ")}. Declare a custom one in ~/.vanta/agents.json.` };
  if (!detectInstalledAgents().includes(agent)) {
    return { error: `"${agent}" is not installed (not on PATH). Installed: ${detectInstalledAgents().join(", ") || "(none)"}.` };
  }
  return { inv };
}

/** Turn the spawn result into a tool result (installed / failed / answer). */
function formatResult(agent: string, res: RunResult): ToolResult {
  if (res.notInstalled) return { ok: false, output: `${agent} CLI not found on PATH.` };
  if (!res.ok) return { ok: false, output: `${agent} failed (exit ${res.code ?? "?"}): ${(res.stderr || res.stdout).trim().slice(0, 2000)}` };
  return { ok: true, output: `[${agent}]\n${res.stdout.trim() || "(no output)"}` };
}

export const callAgentTool: Tool = {
  schema: {
    name: "call_agent",
    description:
      "Call ANOTHER AI coding-agent CLI non-interactively (agent-to-agent: headless, no terminal) and return its result. Auto-detects whatever is installed (claude, codex, gemini, cursor-agent, opencode out of the box; ANY other CLI/harness declared in ~/.vanta/agents.json). Call with no agent (or agent='list') to list. Pass coding:true to delegate BUILDING — the agent runs build-ready (auto-accepts file edits) and actually writes/changes code, then returns what it did; use coding:true whenever the user wants the other agent to build/implement/fix/create code (without it, the agent can only answer, not edit files). Otherwise pass {agent, prompt, model?}. The called agent runs in its own harness. Use to delegate a build, get a second model's take, or cross-check.",
    parameters: {
      type: "object",
      properties: {
        agent: { type: "string", description: "Which agent CLI to call (e.g. claude, codex, gemini). Omit or 'list' to list detected agents." },
        prompt: { type: "string", description: "The prompt/task to send to the agent" },
        model: { type: "string", description: "Optional model override passed through to that agent's CLI" },
        coding: { type: "boolean", description: "Delegate BUILDING: the agent auto-accepts file edits so it can write/change code headless. Default false (answer-only)." },
        autonomous: { type: "boolean", description: "FULL autonomy, OS-contained: runs the agent with --dangerously-skip-permissions inside a Docker container scoped to exactly this project (rw) + its auth (ro), network on only for the model API. The container is the boundary — it provably cannot touch any other host path. For hands-free builds you want boxed. claude only; needs Docker — run `vanta agent-image build` once to set up the container image (override with VANTA_AGENT_DOCKER_IMAGE)." },
      },
      required: [],
    },
  },
  describeForSafety: (a) =>
    `${a.autonomous ? "run docker-boxed autonomous agent" : "call external agent"} ${String(a.agent ?? "list")}: ${String(a.prompt ?? "")}`.slice(0, 200),
  async execute(raw, ctx: ToolContext): Promise<ToolResult> {
    const parsed = Args.safeParse(raw);
    if (!parsed.success) return { ok: false, output: "call_agent needs {agent, prompt} (or no agent to list installed ones)" };
    const { agent, prompt, model, coding, autonomous } = parsed.data;

    if (!agent || agent === "list") return listAgents();
    if (autonomous) return runAutonomous(ctx, agent, prompt, model);

    const resolved = resolveCall(agent, prompt, model, coding);
    if ("error" in resolved) return { ok: false, output: resolved.error };

    const why = coding ? "spawns the agent build-ready (auto-accepts file edits) — it can write/change files in this project on its own" : "spawns an autonomous external agent CLI";
    const approved = await ctx.requestApproval(`call agent ${agent}${coding ? " in BUILD mode" : ""}: ${(prompt ?? "").slice(0, 100)}`, why, "call_agent");
    if (!approved) return { ok: false, output: "call_agent: declined" };

    return runResolved(ctx, agent, resolved.inv, coding);
  },
};
