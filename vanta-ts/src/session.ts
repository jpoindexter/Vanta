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
import { resolveVantaHome } from "./store/home.js";
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
import {
  nextInhibitState,
  shouldAlertInhibit,
  buildInhibitText,
  DEFAULT_INHIBIT_THRESHOLD,
  type InhibitState,
} from "./repl/inhibit.js";
export type { InhibitState } from "./repl/inhibit.js";
import {
  nextSetShiftState,
  shouldAlertSetShift,
  buildSetShiftText,
  DEFAULT_SETSHIFT_THRESHOLD,
  type SetShiftState,
} from "./repl/set-shift.js";
export type { SetShiftState } from "./repl/set-shift.js";
import {
  nextStallState,
  shouldAlertStall,
  buildStallText,
  DEFAULT_STALL_THRESHOLD,
  type StallState,
} from "./repl/stall.js";
import { readNextItems } from "./repl/next.js";
import { topNextItems } from "./repl/choice-reduce.js";
export type { StallState } from "./repl/stall.js";
import {
  countTopicsInLastTurn,
  shouldAnnotateScopeDelta,
  nextScopeDeltaState,
  buildScopeDeltaText,
  DEFAULT_SCOPE_DELTA_THRESHOLD,
  type ScopeDeltaState,
} from "./repl/scope-delta.js";
export type { ScopeDeltaState } from "./repl/scope-delta.js";
import {
  detectWmMode,
  nextWmManipState,
  shouldAlertWmManip,
  buildWmManipText,
  DEFAULT_MANIP_THRESHOLD,
  type WmManipState,
} from "./repl/wm-manip.js";
export type { WmManipState } from "./repl/wm-manip.js";
import { mountMcpServers } from "./mcp/mount.js";
import type { LLMProvider } from "./providers/interface.js";
import type { Summarizer } from "./context.js";
import type { AgentDeps } from "./agent.js";
import type { Message, Goal } from "./types.js";

// Shared run setup used by both the one-shot CLI (`vanta run`) and the
// interactive session (`vanta` / `vanta chat`). Kept here so neither imports the
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
  const baseUrl = process.env.VANTA_KERNEL_URL ?? "http://127.0.0.1:7788";
  const kernelBin = join(repoRoot, "target", "debug", "vanta-kernel");
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
  // Ensure the bundled skill library is installed (idempotent: new slugs are
  // added, the user's existing/edited skills are kept). This is what makes
  // shipped skills — including the nd-* executive-function set — appear without
  // a manual `vanta skills install`. Best-effort: never block startup.
  const { installSkillLibrary } = await import("./skills/library.js");
  await installSkillLibrary({ env: process.env }).catch(() => {});
  // Inject the learned-skill INDEX (names+descriptions) so the agent knows what
  // it can recall; bodies are loaded on demand via the `recall` tool.
  const skills = (await listSkills(process.env).catch(() => [])).map((s) => ({
    name: s.meta.name,
    description: s.meta.description,
  }));
  // Vanta reads its own brain (durable self) each session.
  const brain = await brainDigest(process.env).catch(() => "");
  // SCAFFOLD: load the versioned identity/values/honesty layer from ~/.vanta/self/.
  const { selfDigest } = await import("./self/store.js");
  const selfContent = await selfDigest(process.env).catch(() => "");
  // CC-SETTINGS: load layered settings.json and apply env overrides.
  const { loadSettings, applySettingsEnv } = await import("./settings/store.js");
  const settings = await loadSettings(repoRoot, process.env).catch(() => ({}));
  applySettingsEnv(settings, process.env);
  const { readMoim } = await import("./moim/store.js");
  const moimNote = await readMoim(process.env).catch(() => undefined);
  const errorsLog = await readFile(join(repoRoot, "ERRORS.md"), "utf8").catch(() => undefined);
  const { canonicalProjectId } = await import("./projects/identity.js");
  const projectId = await canonicalProjectId(repoRoot).catch(() => undefined);
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
    errorsLog,
    projectId,
    selfContent,
  });
  if (skillBody) systemPrompt += `\n\nApply this skill:\n${skillBody}`;
  // AUTO-HANDOFF: on an interactive launch, inject + consume a recent auto-saved
  // resume block so a restart/fresh session continues without a manual handoff.
  if (instruction === "interactive session") {
    const { readAutoHandoff, clearAutoHandoff } = await import("./repl/auto-handoff.js");
    const dataDir = join(repoRoot, ".vanta");
    const resume = await readAutoHandoff(dataDir).catch(() => null);
    if (resume) {
      systemPrompt += `\n\nResume from your last session (auto-saved when context filled up — continue from here; don't re-ask the user for state):\n${resume}`;
      await clearAutoHandoff(dataDir);
    }
  }
  return { safety, registry, provider, goals, systemPrompt };
}

const SUMMARIZE_SYS =
  "Summarize the following conversation messages into a compact paragraph capturing decisions, findings, and open threads. Be terse.";

/**
 * Build the summary system prompt, optionally focused. CC-COMPACT-INSTRUCTIONS:
 * `/compress <instructions>` threads its arg here so the operator can steer what
 * the summary preserves. No instructions → the unchanged base prompt.
 */
function summarizeSys(instructions?: string): string {
  const focus = instructions?.trim();
  return focus ? `${SUMMARIZE_SYS}\nFocus especially on: ${focus}` : SUMMARIZE_SYS;
}

/**
 * Best-effort history compressor passed to the agent loop (see context.ts).
 * Optional `instructions` steer the summary (CC-COMPACT-INSTRUCTIONS); omitted =
 * prior behavior, so existing callers are unaffected.
 */
export function buildSummarizer(provider: LLMProvider, instructions?: string): Summarizer {
  const sys = summarizeSys(instructions);
  return async (msgs) =>
    (
      await provider.complete(
        [
          { role: "system", content: sys },
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
  o: { provider: LLMProvider; goals: Goal[]; instruction: string; finalText: string; now?: string; sessionId?: string; turnIndex?: number },
): Promise<void> {
  const goal = o.goals.find((g) => g.status === "active");
  if (!goal) return;
  try {
    const sys =
      "In 2-3 sentences, summarize what was accomplished toward the goal. Be specific and terse.";
    const user = `Goal: ${goal.text}\n\nInstruction: ${o.instruction}\n\nResult: ${o.finalText}`;
    const { text } = await o.provider.complete(
      [
        { role: "system", content: sys },
        { role: "user", content: user },
      ],
      [],
    );
    // MEM-STRUCT: include session + turn context in the memory block so the
    // 3-tier hierarchy (goal > session > turn) is implicit in each entry.
    const structHeader = o.sessionId
      ? `session:${o.sessionId} turn:${o.turnIndex ?? 0}\n`
      : "";
    await appendMemory(goal.id, `${structHeader}${text}`, { now: o.now });
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
    onToolResult: (n, ok, out) => {
      console.log(`  ${ok ? "✓" : "✗"} ${n}: ${firstLine(out)}`);
      // CC-TODO: print the live checklist every time the agent updates it.
      if (n === "todo" && ok && out.includes("done)")) {
        console.log(out.split("\n").map((l) => `  ${l}`).join("\n"));
      }
    },
  };
}

const CURATOR_INTERVAL_MS = 7 * 86_400_000; // 7 days

/**
 * Run the skill curator at most once per interval, at session start. Best-effort
 * and non-destructive (see curator.ts): a failure here never affects the session.
 * State (last-run time) lives in ~/.vanta/.curator_state.json.
 */
export async function maybeCurate(env: NodeJS.ProcessEnv = process.env): Promise<void> {
  try {
    const statePath = join(resolveVantaHome(env), ".curator_state.json");
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
 * VANTA_NUDGE_EVERY (default 5), reads active goals and calls onNote with a
 * short reminder. No-op when disabled (every=0) or no active goals. Best-effort.
 */
export async function nudgeAfterTurn(
  turnIndex: number,
  safety: SafetyClient,
  onNote: (text: string) => void,
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  try {
    const raw = parseInt(env.VANTA_NUDGE_EVERY ?? "", 10);
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
 * VANTA_RESEARCH_GATE_TURNS (default 8), fires a gentle note asking whether to
 * switch from exploration to execution. Returns the updated state for the caller
 * to persist. Best-effort — never throws.
 */
export async function researchGateAfterTurn(
  state: ResearchGateState,
  messages: Message[],
  deps: { safety: SafetyClient; onNote: (text: string) => void; env?: NodeJS.ProcessEnv },
): Promise<ResearchGateState> {
  const { safety, onNote, env = process.env } = deps;
  try {
    const raw = parseInt(env.VANTA_RESEARCH_GATE_TURNS ?? "", 10);
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

export async function inhibitAfterTurn(
  state: InhibitState,
  messages: Message[],
  deps: { safety: SafetyClient; onNote: (text: string) => void; env?: NodeJS.ProcessEnv },
): Promise<InhibitState> {
  const { safety, onNote, env = process.env } = deps;
  try {
    const raw = parseInt(env.VANTA_INHIBIT_THRESHOLD ?? "", 10);
    const threshold = isNaN(raw) || raw < 0 ? DEFAULT_INHIBIT_THRESHOLD : raw;
    if (threshold === 0) return state;
    const toolNames = extractLastTurnToolNames(messages);
    const newState = nextInhibitState(state, toolNames);
    if (shouldAlertInhibit(newState, threshold)) {
      const goals = await safety.getGoals().catch(() => []);
      const activeGoal = goals.find((g) => g.status === "active") ?? null;
      onNote(buildInhibitText(newState.consecutiveCalls, activeGoal));
    }
    return newState;
  } catch {
    return state;
  }
}

export async function setShiftAfterTurn(
  state: SetShiftState,
  messages: Message[],
  onNote: (text: string) => void,
  env: NodeJS.ProcessEnv = process.env,
): Promise<SetShiftState> {
  try {
    const raw = parseInt(env.VANTA_SETSHIFT_THRESHOLD ?? "", 10);
    const threshold = isNaN(raw) || raw < 0 ? DEFAULT_SETSHIFT_THRESHOLD : raw;
    if (threshold === 0) return state;
    const toolNames = extractLastTurnToolNames(messages);
    const newState = nextSetShiftState(state, toolNames);
    if (shouldAlertSetShift(newState, threshold)) {
      onNote(buildSetShiftText(newState.repeatingTool!, newState.consecutiveRuns));
    }
    return newState;
  } catch {
    return state;
  }
}

export async function stallAfterTurn(
  state: StallState,
  messages: Message[],
  deps: { safety: SafetyClient; dataDir: string; onNote: (text: string) => void; env?: NodeJS.ProcessEnv },
): Promise<StallState> {
  const { safety, dataDir, onNote, env = process.env } = deps;
  try {
    const raw = parseInt(env.VANTA_STALL_THRESHOLD ?? "", 10);
    const threshold = isNaN(raw) || raw < 0 ? DEFAULT_STALL_THRESHOLD : raw;
    if (threshold === 0) return state;
    const newState = nextStallState(state, extractLastTurnToolNames(messages));
    if (shouldAlertStall(newState, threshold)) {
      const goals = await safety.getGoals().catch(() => []);
      const activeGoal = goals.find((g) => g.status === "active") ?? null;
      if (!activeGoal) return newState; // stall only nags when a goal is actually open
      const top = topNextItems(await readNextItems(dataDir))[0];
      onNote(buildStallText(activeGoal, newState.stalledTurns, top));
    }
    return newState;
  } catch {
    return state;
  }
}

/**
 * After-turn scope delta annotation. Counts distinct topics/files/tools touched
 * in the last turn; when the count exceeds VANTA_SCOPE_DELTA_THRESHOLD (default 3)
 * emits a dim ambient note and increments the session accumulator.
 * Non-alarming — just visible. Best-effort.
 */
export async function scopeDeltaAfterTurn(
  state: ScopeDeltaState,
  messages: Message[],
  onNote: (text: string) => void,
  env: NodeJS.ProcessEnv = process.env,
): Promise<ScopeDeltaState> {
  try {
    const raw = parseInt(env.VANTA_SCOPE_DELTA_THRESHOLD ?? "", 10);
    const threshold = isNaN(raw) || raw < 0 ? DEFAULT_SCOPE_DELTA_THRESHOLD : raw;
    if (threshold === 0) return state;
    const count = countTopicsInLastTurn(messages);
    const newState = nextScopeDeltaState(state, count, threshold);
    if (shouldAnnotateScopeDelta(count, threshold)) {
      onNote(buildScopeDeltaText(count, newState.totalAnnotations));
    }
    return newState;
  } catch {
    return state;
  }
}

/** EF-WORKINGMEM-MANIP: post-turn working-memory manipulation mode detector.
 * Tracks consecutive turns involving active memory transformation. Alerts when
 * the agent has been manipulating working memory for N turns without concrete output. */
export async function wmManipAfterTurn(
  state: WmManipState,
  messages: Message[],
  onNote: (text: string) => void,
  env: NodeJS.ProcessEnv = process.env,
): Promise<WmManipState> {
  try {
    const raw = parseInt(env.VANTA_WM_MANIP_THRESHOLD ?? "", 10);
    const threshold = isNaN(raw) || raw < 0 ? DEFAULT_MANIP_THRESHOLD : raw;
    if (threshold === 0) return state;
    const mode = detectWmMode(messages);
    const newState = nextWmManipState(state, mode);
    if (shouldAlertWmManip(newState, threshold)) {
      onNote(buildWmManipText(newState.manipTurns));
    }
    return newState;
  } catch {
    return state;
  }
}

/**
 * ANTI-SLOP: after a turn, check the final response text for AI-ish drift.
 * Best-effort — opt-out via VANTA_ANTI_SLOP=0. Emits a note when slop is found.
 */
export async function antiSlopAfterText(
  text: string,
  onNote: (note: string) => void,
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  if (env.VANTA_ANTI_SLOP === "0" || !text.trim()) return;
  try {
    const { detectSlop, formatSlopNote } = await import("./repl/anti-slop.js");
    const note = formatSlopNote(detectSlop(text));
    if (note) onNote(note);
  } catch { /* best-effort */ }
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
