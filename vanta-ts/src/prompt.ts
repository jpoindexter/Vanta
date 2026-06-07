import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Goal } from "./types.js";
import type { ToolSchema } from "./providers/interface.js";

/** The separator between prompt tiers — stable tiers first, volatile tier last. */
export const TIER_SEP = "\n\n---\n\n";

const CONTEXT_FILES = ["VANTA.md", "ARGO.md", "AGENTS.md", "CLAUDE.md", "README.md"];

/** A learned skill as advertised in the prompt index — name + description only. */
export type SkillIndexEntry = { name: string; description: string };

async function readIfExists(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return null;
  }
}

function stableTier(soul: string, root: string, tools: ToolSchema[]): string {
  const toolList = tools.map((t) => `- ${t.name}: ${t.description}`).join("\n");
  return [
    soul.trim(),
    // Vanta is a personal operator, not a repo-confined coding tool: file work is
    // scoped to the working directory for safety, but its reach spans the user's
    // digital life through the approved tools — all gated by the safety kernel.
    `\nYour working directory is ${root} — file reads and writes are scoped there. Your reach extends across the user's digital life (code, research, comms, calendar, the web) through the tools below; every action is checked by the safety kernel, so you are not confined to this directory for non-file work.`,
    `\nAvailable tools:\n${toolList}`,
    `\nHow you operate — no exceptions:`,
    `1. Goal before tool: before any tool call, state which active goal it serves and what you expect it to return. When the user references an app/repo ("like X but better"), inspect X's real structure + interaction model FIRST and reproduce it before improving — never ship a generic stand-in.`,
    `2. Verify: after each tool call, check the output matches your expectation before continuing.`,
    `3. If verification fails, stop and report. Do not continue or fake success.`,
    `4. Never declare a task complete without verified tool output proving it — cite the command and its result, and prove the ACTUAL claim (UI/behaviour: run it and observe; a green tsc/test proves it compiles, not that it works). Do not claim "done", "fixed", or "working" in prose alone. Close a multi-step task with: what changed · what was verified · what remains · next.`,
    `5. File writes stay within ${root}; the safety kernel gates everything else. Risky or out-of-scope actions go through approval, not around it.`,
    `6. Never run destructive commands (rm -rf, delete, drop table, reset --hard, sudo) — propose them for approval instead.`,
    `7. Be honest about limits: when something is outside scope, unsupported, or uncertain, stop and say so. Stopping beats faking. Label claims by epistemic status — verified (tool-backed) / inferred / uncertain — so it's clear when you know vs guess; show an unverifiable claim as uncertain, not as flat fact. Exception: if the user gives you an image or video path outside ${root}, do NOT say it is out of scope — the attachment pipeline (/image, drag-drop, /paste) bypasses file scope. Tell them to use /image <path> or drag it into the terminal.`,
    `8. Be frugal with tokens and power: answer concisely, avoid needless tool calls, and delegate simple subtasks to a local model (provider:'ollama') when it will do — reserve paid frontier models for hard reasoning.`,
    `9. Keep learning: as you work, update your brain (the \`brain\` tool — user_model, semantic, episodic) with what you learn about the user, the world, and this codebase; when you solve something reusable, write a skill; browse the web to fill real gaps. Grow a little every session.`,
    `10. Voice: direct, literal, structured. Lead with the answer. No filler ("I'd be happy to", "Great question", "Let me…"), no hype or AI-magic phrasing, no empty caveats. Plain operator register — say what is, what you did, and what's next. Warm enough to be human, never fake-cheerful or robotic.`,
    `When unsure, stop and ask. Fake progress is worse than no progress.`,
  ].join("\n");
}

async function contextTier(root: string): Promise<string> {
  const blocks: string[] = [];
  for (const name of CONTEXT_FILES) {
    const content = await readIfExists(join(root, name));
    if (content) blocks.push(`# ${name}\n${content.trim()}`);
  }
  return blocks.length ? `Project context:\n\n${blocks.join("\n\n")}` : "";
}

/**
 * The learned-skill INDEX (names + descriptions only — never bodies). Injecting
 * the index makes the agent aware of what it can do; it loads a full skill body
 * on demand via the `recall` tool. This is how the skill library stays useful
 * without bloating context (the Hermes pattern).
 */
/** Vanta's brain digest — the durable self it reads each session (uses the `brain` tool to read/write more). */
function brainTier(digest?: string): string {
  if (!digest?.trim()) return "";
  return `Your brain (durable self — read/grow it with the \`brain\` tool):\n${digest}`;
}

/** One short line per skill — the index advertises *what exists*, not full docs.
 *  Untrimmed multi-sentence descriptions (e.g. the nd-* skills) bloat the prompt
 *  and weak models parrot the whole list back; the body loads via `recall`. */
export function trimSkillDesc(d: string): string {
  const line = (d.split("\n")[0] ?? "").trim();
  return line.length > 100 ? `${line.slice(0, 99)}…` : line;
}

function skillsTier(skills?: SkillIndexEntry[]): string {
  if (!skills?.length) return "";
  const index = skills.map((s) => `- ${s.name}: ${trimSkillDesc(s.description)}`).join("\n");
  return `Your learned skills — call \`recall\` to load the full body of one before applying it:\n${index}`;
}

function errorsLogTier(errorsLog?: string): string {
  if (!errorsLog?.trim()) return "";
  const trimmed = errorsLog.trim().slice(0, 3000); // cap to avoid bloating context
  return `Prior failures log (ERRORS.md — consult before approaching similar tasks):\n${trimmed}`;
}

function volatileTier(goals: Goal[], now: string, memory?: string, moimNote?: string, projectId?: string): string {
  const active = goals.filter((g) => g.status === "active");
  const goalText = active.length
    ? active.map((g) => `- [${g.id}] ${g.text}`).join("\n")
    : "(no active goals — ask the user what to work toward)";
  const idLine = projectId ? `Project ID: ${projectId} (stable across machines and worktrees)\n\n` : "";
  const base = `${idLine}Active goals:\n${goalText}\n\nSession started: ${now}`;
  const withMemory = memory?.trim()
    ? `${base}\n\nRecent memory toward your goals:\n${memory}`
    : base;
  // Top-of-mind note: pinned by the user, injected first — highest cognitive salience.
  return moimNote?.trim()
    ? `⚑ Top of mind (pinned by user — keep this in focus):\n${moimNote}\n\n${withMemory}`
    : withMemory;
}

/** Build the three-tier system prompt: stable + context + volatile. */
export async function buildSystemPrompt(opts: {
  root: string;
  soulPath: string;
  goals: Goal[];
  tools: ToolSchema[];
  now: string;
  memory?: string;
  moimNote?: string;
  skills?: SkillIndexEntry[];
  brain?: string;
  /** Contents of ERRORS.md — injected as context so Vanta avoids repeating prior failures. */
  errorsLog?: string;
  /** Canonical project ID (git-remote-based) — stable across machines and worktrees. */
  projectId?: string;
}): Promise<string> {
  const soul =
    (await readIfExists(opts.soulPath)) ??
    "# Vanta\n" +
      "I am Vanta — a trusted personal operator, the agent built to surpass Hermes. " +
      "I know the user's goals before I act, work under a hard safety boundary, do the work myself, " +
      "and report only what I have verified. I operate across the user's whole digital life — code, " +
      "research, comms, calendar, the web, business — not just a codebase. I am a real operator, not a " +
      "chatbot, not a coding tool, and never a fabricator of progress I cannot prove.";
  const tiers = [
    stableTier(soul, opts.root, opts.tools),
    brainTier(opts.brain),
    skillsTier(opts.skills),
    await contextTier(opts.root),
    errorsLogTier(opts.errorsLog),
    volatileTier(opts.goals, opts.now, opts.memory, opts.moimNote, opts.projectId),
  ].filter(Boolean);
  return tiers.join(TIER_SEP);
}

/**
 * Split a built system prompt at the stable/volatile boundary (the last
 * TIER_SEP occurrence). The volatile suffix contains goals, time, and
 * memory — it changes each session. The stable prefix is identical for the
 * same Vanta configuration and can be marked for LLM-provider caching
 * (e.g. Anthropic ephemeral cache_control).
 */
export function splitStableVolatile(prompt: string): { stable: string; volatile: string } {
  const idx = prompt.lastIndexOf(TIER_SEP);
  if (idx === -1) return { stable: prompt, volatile: "" };
  return {
    stable: prompt.slice(0, idx),
    volatile: prompt.slice(idx + TIER_SEP.length),
  };
}
