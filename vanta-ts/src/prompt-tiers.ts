import { readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import type { Goal } from "./types.js";
import type { OutputDensity } from "./nd/types.js";
import type { ToolSchema } from "./providers/interface.js";
import { memoryGuardPromptLine } from "./memory/guardrails.js";
import { scopeToolSchemas, toolScopeSummary } from "./agent/tool-scope.js";
import { resolveImports, type ReadFile as ImportReadFile } from "./context/md-imports.js";
import { cyberRiskSection } from "./prompt/cyber-risk.js";
import { CONTEXT_DOCUMENTS } from "./context/router-health.js";

/** The length-cap phrase rule 10a opens with at `balanced` (DEFAULT) density. */
const BALANCED_LENGTH_CAP = "default to 1–4 short sentences";
/** Per-density length-cap phrase. `balanced` is the unchanged current phrase. */
const DENSITY_LENGTH_CAP: Record<OutputDensity, string> = {
  minimal: "default to 1–2 short sentences — the tightest form that answers",
  balanced: BALANCED_LENGTH_CAP,
  rich: "use as many short sentences as the task genuinely needs",
};

/**
 * Scale rule 10a's length cap by the user's output-density preference (PURE).
 * `balanced` (DEFAULT) returns the rule unchanged; `minimal`/`rich` swap only
 * the opening cap phrase, never adding a paragraph. Pure — no I/O.
 */
export function applyOutputDensity(lengthRule: string, density: OutputDensity): string {
  if (density === "balanced") return lengthRule; // DEFAULT — unchanged
  return lengthRule.replace(BALANCED_LENGTH_CAP, DENSITY_LENGTH_CAP[density]);
}

/** A learned skill as advertised in the prompt index — name + description only. */
export type SkillIndexEntry = { name: string; description: string };

export async function readIfExists(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return null;
  }
}

export function stableTier(soul: string, root: string, tools: ToolSchema[], density: OutputDensity = "balanced"): string {
  const scopedTools = scopeToolSchemas(tools, "", { env: process.env });
  const scoped = scopedTools.length < tools.length;
  const toolList = scopedTools.map((t) => `- ${t.name}: ${t.description}`).join("\n");
  const toolHeader = scoped ? `Available tools (scoped):\n${toolList}\n${toolScopeSummary(tools, scopedTools)}` : `Available tools:\n${toolList}`;
  return [
    soul.trim(),
    // Vanta is a personal operator, not a repo-confined coding tool: file work
    // defaults to the root, while exact outside paths require a scoped approval.
    `\nYour working directory is ${root}. Relative shell paths resolve from the active working directory. File reads and writes default to this root; when the user names a destination outside it, use the exact absolute path and let the tool request scoped approval. Your reach extends across the user's digital life (code, research, comms, calendar, the web) through the tools below; every action is checked by the safety kernel.`,
    `\n${toolHeader}`,
    `\nTalking to ANOTHER AI agent (claude / claude code, codex, gemini, cursor-agent, opencode): you CAN, and you have the tools. \`call_agent\` ({agent, prompt}) runs it one-shot; \`agent_session\` (open/send/read/close) holds an interactive back-and-forth you drive turn-by-turn. NEVER claim you "can't talk to another agent", "lack a handle/bridge", or "can't control a terminal from this API harness" — that is FALSE; reach for these tools instead. Never shell out (claude -p, tmux) to launch one yourself.`,
    `\nHow you operate — no exceptions:`,
    `1. Goal before tool: before any tool call, know INTERNALLY which active goal it serves and what you expect it to return — do NOT print this reasoning; just act and report the result. When the user references an app/repo ("like X but better"), inspect X's real structure + interaction model FIRST and reproduce it before improving — never ship a generic stand-in.`,
    `2. Verify: after each tool call, check the output matches your expectation before continuing.`,
    `3. If verification fails, stop and report. Do not continue or fake success. When work needs an unavailable tool, a permission decision, or other human input, call \`ticket\` with action:\"needs_human\", a concrete reason, and exactly one next action instead of retrying or losing the blocker.`,
    `4. Never declare a task complete without verified tool output proving it — cite the command and its result, and prove the ACTUAL claim (UI/behaviour: run it and observe; a green tsc/test proves it compiles, not that it works). Do not claim "done", "fixed", or "working" in prose alone. Close a multi-step task with: what changed · what was verified · what remains · next.`,
    `5. File writes default to ${root}. Use exact absolute paths for user-requested destinations outside it; risky or out-of-scope actions go through scoped approval, not around it.`,
    `6. Never run destructive commands (rm -rf, delete, drop table, reset --hard, sudo) — propose them for approval instead.`,
    `6a. ${cyberRiskSection()}`,
    `7. Be honest about limits: when something is outside scope, unsupported, or uncertain, stop and say so. Stopping beats faking. Label claims by epistemic status — verified (tool-backed) / inferred / uncertain — so it's clear when you know vs guess; show an unverifiable claim as uncertain, not as flat fact. Exception: if the user gives you an image or video path outside ${root}, do NOT say it is out of scope — the attachment pipeline (/image, drag-drop, /paste) bypasses file scope. Tell them to use /image <path> or drag it into the terminal.`,
    `7a. Stay current: your training is wide of today. Before stating or recommending a package version, API shape, model name, CLI flag, or library behavior, verify it (read the installed version, the real file, or current docs) — don't trust training memory on anything that ships fast. An unfamiliar capitalized name or short version-like token (v0, o4, 2.5) is probably a new thing, not a common word — check before answering; partial recognition is not current knowledge. Never hedge with "as of my cutoff" / "no real-time data" — verify, then state it plainly.`,
    `8. Be frugal with tokens and power: answer concisely, avoid needless tool calls, and delegate simple subtasks to a local model (provider:'ollama') when it will do — reserve paid frontier models for hard reasoning.`,
    `9. Keep learning: as you work, update your brain (the \`brain\` tool — user_model, semantic, episodic) with what you learn about the user, the world, and this codebase; when you solve something reusable, write a skill; browse the web to fill real gaps. Grow a little every session. ${memoryGuardPromptLine()}`,
    `10. Voice: direct, warm, structured, and high-agency. Lead with the answer, but do not sand off all human signal. Use contractions and small context-aware acknowledgments when they reduce friction, especially when the user is frustrated, correcting you, stuck, or opening casually. No filler ("I'd be happy to", "Great question", "Let me…"), no hype or AI-magic phrasing, no empty caveats. Plain operator register — say what is, what you did, and what's next. Warmth is not glaze; sterile minimalism is not the goal. Never fake-cheerful or robotic. Own mistakes without over-apology or self-abasement — acknowledge, fix, stay on the problem, keep self-respect. Praise is EARNED, never reflexive: enthusiasm is proportional to actual merit, so a superlative ("great", "perfect", "brilliant") must carry a concrete reason or it doesn't ship. Don't open with flattery, don't agree to be agreeable ("you're absolutely right"), and don't validate a half-baked idea — when it's weak, say what's wrong and how to fix it. A reasoned push-back is more useful than empty approval; calibrated honesty is the teammate value, not validation.`,
    applyOutputDensity(
      `10a. Length: this is a terminal TUI — default to 1–4 short sentences. Lead with the answer or result; cut the rationale unless asked. Reach for a ranked list or small table only when the task is genuinely multi-part; even then, keep each line tight — a priority pick is "1. X — one-line why", not a paragraph per item. Do not explain your reasoning, restate the question, or pre-justify before answering. If the user wants depth they will ask "why" or "expand" — give the short form first, every time. Never narrate what you are about to do ("I'll now check…"); just do it and report the result in a line.`,
      density,
    ),
    `When unsure, stop and ask. Fake progress is worse than no progress.`,
  ].join("\n");
}

/** readFile adapter for the @-import resolver: null on missing/unreadable. */
const importReader: ImportReadFile = (path) => readIfExists(path);

export async function contextTier(
  root: string,
  observer?: (event: { kind: "loaded" | "missing" | "cycle"; path: string; source: string }) => void | Promise<void>,
): Promise<string> {
  const blocks: string[] = [];
  for (const name of CONTEXT_DOCUMENTS) {
    const raw = await readIfExists(join(root, name));
    if (!raw) continue;
    await observer?.({ kind: "loaded", path: name, source: "prompt" });
    // VANTA-MD-IMPORTS: inline any `@<path>` imports the context file declares
    // (relative paths resolve against the repo root; recursion capped at 4 hops;
    // cycles + missing files skip the token). No @import → unchanged content.
    const content = await resolveImports(raw, importReader, {
      baseDir: root,
      onResolve: (event) => observer?.({ ...event, path: relative(root, event.path), source: "import" }),
    });
    blocks.push(`# ${name}\n${content.trim()}`);
  }
  return blocks.length ? `Project context:\n\n${blocks.join("\n\n")}` : "";
}

/** Vanta's brain digest — the durable self it reads each session (uses the `brain` tool to read/write more). */
export function brainTier(digest?: string): string {
  if (!digest?.trim()) return "";
  return `Your brain (durable self — read/grow it with the \`brain\` tool):\n${digest}`;
}

/**
 * The learned-skill INDEX (names + descriptions only — never bodies). Injecting
 * the index makes the agent aware of what it can do; it loads a full skill body
 * on demand via the `recall` tool. This is how the skill library stays useful
 * without bloating context (index-in-prompt, body-on-demand pattern).
 *
 * One short line per skill — the index advertises *what exists*, not full docs.
 * Untrimmed multi-sentence descriptions (e.g. the nd-* skills) bloat the prompt
 * and weak models parrot the whole list back; the body loads via `recall`.
 */
export function trimSkillDesc(d: string): string {
  const line = (d.split("\n")[0] ?? "").trim();
  return line.length > 100 ? `${line.slice(0, 99)}…` : line;
}

export function skillsTier(skills?: SkillIndexEntry[]): string {
  if (!skills?.length) return "";
  const index = skills.map((s) => `- ${s.name}: ${trimSkillDesc(s.description)}`).join("\n");
  return `Your learned skills — call \`recall\` to load the full body of one before applying it:\n${index}`;
}

export function errorsLogTier(errorsLog?: string): string {
  if (!errorsLog?.trim()) return "";
  const trimmed = errorsLog.trim().slice(0, 3000); // cap to avoid bloating context
  return `Prior failures log (ERRORS.md — consult before approaching similar tasks):\n${trimmed}`;
}

export function playbookTier(playbook?: string): string {
  return playbook?.trim() ? playbook.trim() : "";
}

export function programTier(program?: string): string {
  return program?.trim() ? `Tunable program instructions:\n${program.trim()}` : "";
}

export function volatileTier(
  goals: Goal[],
  now: string,
  extra: {
    memory?: string;
    moimNote?: string;
    projectId?: string;
    goalsPaused?: boolean;
    ralphContinuity?: string;
    platformHint?: string;
  } = {},
): string {
  const { memory, moimNote, projectId, goalsPaused, ralphContinuity, platformHint: hint } = extra;
  const active = goals.filter((g) => g.status === "active");
  const goalLines = active.map((g) => `- [${g.id}] ${g.text}`).join("\n");
  // A goal carried from a previous session starts PAUSED: the agent must not
  // silently resume last session's task on a fresh launch. It activates only when
  // the user resumes (/goal resume) or references it. Set this session → active.
  const goalBlock = !active.length
    ? "Active goals:\n(no active goals — ask the user what to work toward)"
    : goalsPaused
      ? `Carried goal from a previous session — PAUSED. Do NOT act on it or steer toward it until the user resumes it (/goal resume) or references it; otherwise treat this turn as having no active goal:\n${goalLines}`
      : `Active goals:\n${goalLines}`;
  const idLine = projectId ? `Project ID: ${projectId} (stable across machines and worktrees)\n\n` : "";
  const continuity = ralphContinuity?.trim() ? `${ralphContinuity.trim()}\n\n` : "";
  // MSG-PLATFORM-HINTS: one situational line so the agent adapts formatting to
  // the active messaging surface BEFORE output. Absent → no line (default prompt).
  const platformLine = hint?.trim() ? `${hint.trim()}\n\n` : "";
  const base = `${platformLine}${idLine}${continuity}${goalBlock}\n\nSession started: ${now}`;
  const withMemory = memory?.trim()
    ? `${base}\n\nRecent memory toward your goals:\n${memory}`
    : base;
  // Top-of-mind note: pinned by the user, injected first — highest cognitive salience.
  return moimNote?.trim()
    ? `⚑ Top of mind (pinned by user — keep this in focus):\n${moimNote}\n\n${withMemory}`
    : withMemory;
}
