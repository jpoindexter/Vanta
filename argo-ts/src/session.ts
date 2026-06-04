import { join } from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import type { Interface as Readline } from "node:readline/promises";
import { SafetyClient } from "./safety-client.js";
import { ensureKernel } from "./kernel-launcher.js";
import { buildRegistry } from "./tools/index.js";
import { buildSystemPrompt } from "./prompt.js";
import { recentMemory, appendMemory } from "./memory/store.js";
import { resolveRoutedProvider } from "./routing/model-router.js";
import { curate } from "./skills/curator.js";
import { listSkills } from "./skills/store.js";
import { brainDigest } from "./brain/store.js";
import { resolveArgoHome } from "./store/home.js";
import { reviewTurn, shouldReview } from "./review/background-review.js";
import { shouldNudge, buildNudgeText, DEFAULT_NUDGE_EVERY } from "./repl/nudge.js";
import {
  nextGateState,
  shouldFireGate,
  buildGateText,
  extractLastTurnToolNames,
  DEFAULT_RESEARCH_GATE_TURNS,
  type ResearchGateState,
} from "./repl/research-gate.js";
export type { ResearchGateState } from "./repl/research-gate.js";
import { mountMcpServers } from "./mcp/mount.js";
import type { LLMProvider } from "./providers/interface.js";
import type { Summarizer } from "./context.js";
import type { AgentDeps } from "./agent.js";
import type { Message, Goal } from "./types.js";

// Shared run setup used by both the one-shot CLI (`argo run`) and the
// interactive session (`argo` / `argo chat`). Kept here so neither imports the
// other's module (cli.ts self-executes main()).

export type RunSetup = {
  safety: SafetyClient;
  registry: ReturnType<typeof buildRegistry>;
  provider: LLMProvider;
  goals: Goal[];
  systemPrompt: string;
};

/**
 * Ensure the kernel is up and assemble a run. `instruction` drives multi-model
 * routing (a no-op when no cheap/expensive model is set).
 */
export async function prepareRun(
  repoRoot: string,
  instruction: string,
  skillBody?: string,
): Promise<RunSetup> {
  const baseUrl = process.env.ARGO_KERNEL_URL ?? "http://127.0.0.1:7788";
  const kernelBin = join(repoRoot, "target", "debug", "argo-kernel");
  await ensureKernel({ baseUrl, kernelBin, root: repoRoot });

  const safety = new SafetyClient(baseUrl);
  const registry = buildRegistry();
  // Mount any configured MCP servers (no-op without config). Their tools join the
  // registry and pass through the same kernel assess() as built-in tools.
  await mountMcpServers(registry, process.env, (m) => console.log(m));
  const provider = resolveRoutedProvider(process.env, instruction);
  const goals = await safety.getGoals().catch(() => []);
  const activeIds = goals.filter((g) => g.status === "active").map((g) => g.id);
  const memory = await recentMemory(activeIds);
  // Inject the learned-skill INDEX (names+descriptions) so the agent knows what
  // it can recall; bodies are loaded on demand via the `recall` tool.
  const skills = (await listSkills(process.env).catch(() => [])).map((s) => ({
    name: s.meta.name,
    description: s.meta.description,
  }));
  // Argo reads its own brain (durable self) each session.
  const brain = await brainDigest(process.env).catch(() => "");
  const { readMoim } = await import("./moim/store.js");
  const moimNote = await readMoim(process.env).catch(() => undefined);
  let systemPrompt = await buildSystemPrompt({
    root: repoRoot,
    soulPath: join(repoRoot, "SOUL.md"),
    goals,
    tools: registry.schemas(),
    now: new Date().toISOString(),
    memory,
    moimNote,
    skills,
    brain,
  });
  if (skillBody) systemPrompt += `\n\nApply this skill:\n${skillBody}`;
  return { safety, registry, provider, goals, systemPrompt };
}

const SUMMARIZE_SYS =
  "Summarize the following conversation messages into a compact paragraph capturing decisions, findings, and open threads. Be terse.";

/** Best-effort history compressor passed to the agent loop (see context.ts). */
export function buildSummarizer(provider: LLMProvider): Summarizer {
  return async (msgs) =>
    (
      await provider.complete(
        [
          { role: "system", content: SUMMARIZE_SYS },
          { role: "user", content: JSON.stringify(msgs).slice(0, 12000) },
        ],
        [],
      )
    ).text;
}

/**
 * Record what a turn accomplished toward the first active goal. Best-effort: a
 * failure here must never fail the command.
 */
export async function writeRunMemory(
  provider: LLMProvider,
  goals: Goal[],
  instruction: string,
  finalText: string,
): Promise<void> {
  const goal = goals.find((g) => g.status === "active");
  if (!goal) return;
  try {
    const sys =
      "In 2-3 sentences, summarize what was accomplished toward the goal. Be specific and terse.";
    const user = `Goal: ${goal.text}\n\nInstruction: ${instruction}\n\nResult: ${finalText}`;
    const { text } = await provider.complete(
      [
        { role: "system", content: sys },
        { role: "user", content: user },
      ],
      [],
    );
    await appendMemory(goal.id, text);
  } catch (err: unknown) {
    console.warn(
      `warn: could not write memory: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

function shortArgs(args: Record<string, unknown>): string {
  const s = JSON.stringify(args);
  return s.length > 80 ? `${s.slice(0, 77)}...` : s;
}

function firstLine(text: string): string {
  const line = text.split("\n")[0] ?? "";
  return line.length > 100 ? `${line.slice(0, 97)}...` : line;
}

/** Live tool-activity printers shared by run + chat. */
export function consoleCallbacks(): Pick<
  AgentDeps,
  "onText" | "onToolCall" | "onToolResult"
> {
  return {
    onText: (t) => console.log(t),
    onToolCall: (n, a) => console.log(`  → ${n}(${shortArgs(a)})`),
    onToolResult: (n, ok, out) =>
      console.log(`  ${ok ? "✓" : "✗"} ${n}: ${firstLine(out)}`),
  };
}

const CURATOR_INTERVAL_MS = 7 * 86_400_000; // 7 days, matching Hermes

/**
 * Run the skill curator at most once per interval, at session start. Best-effort
 * and non-destructive (see curator.ts): a failure here never affects the session.
 * State (last-run time) lives in ~/.argo/.curator_state.json.
 */
export async function maybeCurate(env: NodeJS.ProcessEnv = process.env): Promise<void> {
  try {
    const statePath = join(resolveArgoHome(env), ".curator_state.json");
    const now = Date.now();
    let lastRunMs = 0;
    try {
      const parsed: unknown = JSON.parse(await readFile(statePath, "utf8"));
      if (parsed && typeof parsed === "object" && "lastRunMs" in parsed) {
        lastRunMs = Number((parsed as { lastRunMs: unknown }).lastRunMs) || 0;
      }
    } catch {
      // no state yet — first run
    }
    if (now - lastRunMs < CURATOR_INTERVAL_MS) return;

    const r = await curate({ env });
    await writeFile(statePath, JSON.stringify({ lastRunMs: now }), "utf8");
    const flagged = r.staleUnowned.length + r.prunable.length + r.overlaps.length;
    if (r.archived.length || flagged) {
      console.log(
        `  · curator: archived ${r.archived.length}, ${flagged} flagged for review`,
      );
    }
  } catch {
    // best-effort maintenance — never break a session on it
  }
}

/**
 * Post-turn self-improvement nudge. When the turn warrants review (busy turn or
 * the periodic interval — see {@link shouldReview}), spawn the background-review
 * fork to capture a skill. Best-effort and quiet unless something was learned.
 */
export async function reviewAfterTurn(opts: {
  provider: LLMProvider;
  safety: SafetyClient;
  root: string;
  transcript: Message[];
  toolIterations: number;
  turnIndex: number;
  env?: NodeJS.ProcessEnv;
}): Promise<void> {
  if (!shouldReview(opts.toolIterations, opts.turnIndex, opts.env ?? process.env)) return;
  const { wrote } = await reviewTurn({
    provider: opts.provider,
    safety: opts.safety,
    root: opts.root,
    transcript: opts.transcript,
  });
  if (wrote.length) console.log(`  💾 self-improvement: learned ${wrote.join(", ")}`);
}

/**
 * After-turn gentle nudge. When the turn index hits a multiple of
 * ARGO_NUDGE_EVERY (default 5), reads active goals and calls onNote with a
 * short reminder. No-op when disabled (every=0) or no active goals. Best-effort.
 */
export async function nudgeAfterTurn(
  turnIndex: number,
  safety: SafetyClient,
  onNote: (text: string) => void,
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  try {
    const raw = parseInt(env.ARGO_NUDGE_EVERY ?? "", 10);
    const every = isNaN(raw) || raw < 0 ? DEFAULT_NUDGE_EVERY : raw;
    if (!shouldNudge(turnIndex, every)) return;
    const goals = await safety.getGoals().catch(() => []);
    const note = buildNudgeText(goals);
    if (note) onNote(note);
  } catch {
    // best-effort — never break the session
  }
}

/**
 * After-turn research-spiral gate. Tracks consecutive non-output turns; at
 * ARGO_RESEARCH_GATE_TURNS (default 8), fires a gentle note asking whether to
 * switch from exploration to execution. Returns the updated state for the caller
 * to persist. Best-effort — never throws.
 */
export async function researchGateAfterTurn(
  state: ResearchGateState,
  messages: Message[],
  safety: SafetyClient,
  onNote: (text: string) => void,
  env: NodeJS.ProcessEnv = process.env,
): Promise<ResearchGateState> {
  try {
    const raw = parseInt(env.ARGO_RESEARCH_GATE_TURNS ?? "", 10);
    const threshold = isNaN(raw) || raw < 0 ? DEFAULT_RESEARCH_GATE_TURNS : raw;
    if (threshold === 0) return state;
    const toolNames = extractLastTurnToolNames(messages);
    const newState = nextGateState(state, toolNames);
    if (shouldFireGate(newState, threshold)) {
      const goals = await safety.getGoals().catch(() => []);
      const activeGoal = goals.find((g) => g.status === "active") ?? null;
      onNote(buildGateText(newState.consecutiveTurns, activeGoal));
    }
    return newState;
  } catch {
    return state;
  }
}

/** Interactive y/n approval bound to a readline interface. */
export function approver(
  rl: Readline,
): (action: string, reason: string) => Promise<boolean> {
  return async (action, reason) => {
    const answer = await rl.question(
      `\n[APPROVAL NEEDED] ${action}\nReason: ${reason}\nApprove? (y/n) `,
    );
    return answer.trim().toLowerCase().startsWith("y");
  };
}
