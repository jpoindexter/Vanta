import { z } from "zod";
import { ToolRegistry } from "../tools/registry.js";
import { recallTool } from "../tools/recall.js";
import { writeSkillTool } from "../tools/write-skill.js";
import { writeSkill, LEARNED_TAG } from "../skills/store.js";
import { runAgent } from "../agent.js";
import type { Tool } from "../tools/types.js";
import type { LLMProvider } from "../providers/interface.js";
import type { SafetyClient } from "../safety-client.js";
import type { Message } from "../types.js";

// Track B — the post-turn self-improvement review. After a turn that did real
// work, a SECOND agent (whitelisted to recall + write_skill only) replays the
// transcript and captures a reusable skill. Mirrors Hermes background_review:
// forked, tool-restricted, biased to act, never blocks or fails the main turn.

const DEFAULT_REVIEW_EVERY = 8; // every Nth turn in a session
const DEFAULT_REVIEW_MIN_TOOLS = 6; // or any turn that used >= this many tools
const REVIEW_MAX_ITER = 6;
const MAX_TRANSCRIPT_CHARS = 8000;

const REVIEW_SYSTEM = `You are Argo's self-improvement reviewer. You are shown the transcript of a just-completed work session. Your ONE job: decide whether it taught a reusable, class-level skill, and if so capture it with write_skill (recall first to avoid duplicating an existing skill — patch by re-writing under the same name).

Capture a skill when the session worked out HOW to do a class of task (a procedure, a gotcha-and-fix, a checklist). A good skill is reusable next week on a similar-but-different task.

Do NOT capture: one-off task narratives ("fixed bug #1234"), environment-specific failures, transient errors that were resolved, or negative claims ("tool X is broken" — these harden into self-imposed refusals). When in doubt and nothing is genuinely reusable, do nothing and reply "no skill".

Name skills by their class (e.g. "debug-failing-vitest", not "fix-the-login-test"). Keep the body a concise markdown how-to.`;

function isDisabled(env: NodeJS.ProcessEnv): boolean {
  const v = (env.VANTA_SELF_IMPROVE ?? "").trim().toLowerCase();
  return v === "0" || v === "false" || v === "off" || v === "no";
}

function numEnv(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/**
 * Should the post-turn review run for this turn? Pure. Fires on a busy turn
 * (>= VANTA_REVIEW_MIN_TOOLS tool calls) or periodically (every VANTA_REVIEW_EVERY
 * turns). Off entirely when VANTA_SELF_IMPROVE is 0/false/off/no.
 */
export function shouldReview(
  toolIterations: number,
  turnIndex: number,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (isDisabled(env)) return false;
  if (toolIterations >= numEnv(env.VANTA_REVIEW_MIN_TOOLS, DEFAULT_REVIEW_MIN_TOOLS)) {
    return true;
  }
  const every = numEnv(env.VANTA_REVIEW_EVERY, DEFAULT_REVIEW_EVERY);
  return turnIndex > 0 && turnIndex % every === 0;
}

const LearnedArgs = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  body: z.string().min(1),
  tags: z.array(z.string()).optional(),
});

/** A write_skill that stamps the learned-provenance tag and records what it wrote. */
function learnedSkillTool(written: string[]): Tool {
  return {
    schema: writeSkillTool.schema,
    describeForSafety: () => "record a learned skill in argo's memory",
    async execute(raw) {
      const parsed = LearnedArgs.safeParse(raw);
      if (!parsed.success) {
        return { ok: false, output: "write_skill needs name, description, and body strings" };
      }
      const tags = Array.from(new Set([...(parsed.data.tags ?? []), LEARNED_TAG]));
      try {
        const { skill } = await writeSkill({ ...parsed.data, tags });
        written.push(skill.meta.name);
        return { ok: true, output: `saved skill "${skill.meta.name}"` };
      } catch (err) {
        return { ok: false, output: (err as Error).message };
      }
    },
  };
}

/** Render the turn's messages into a compact transcript for the reviewer. */
function serializeTranscript(messages: Message[]): string {
  const lines: string[] = [];
  for (const m of messages) {
    if (m.role === "system") continue;
    if (m.role === "assistant") {
      const calls = m.toolCalls?.length
        ? ` [called: ${m.toolCalls.map((c) => c.name).join(", ")}]`
        : "";
      if (m.content || calls) lines.push(`ASSISTANT: ${m.content ?? ""}${calls}`);
    } else if (m.role === "tool") {
      lines.push(`TOOL(${m.name ?? "?"}): ${m.content.slice(0, 400)}`);
    } else {
      lines.push(`USER: ${m.content}`);
    }
  }
  const text = lines.join("\n");
  return text.length > MAX_TRANSCRIPT_CHARS
    ? `...\n${text.slice(-MAX_TRANSCRIPT_CHARS)}`
    : text;
}

/**
 * Run the self-improvement review over a completed turn's transcript. Spawns a
 * tool-restricted agent (recall + write_skill only). Best-effort: any failure is
 * swallowed so the review can never affect the main session. Returns the names
 * of skills written/updated.
 */
export async function reviewTurn(opts: {
  provider: LLMProvider;
  safety: SafetyClient;
  root: string;
  transcript: Message[];
}): Promise<{ wrote: string[] }> {
  const written: string[] = [];
  const registry = new ToolRegistry();
  registry.register(recallTool);
  registry.register(learnedSkillTool(written));

  try {
    await runAgent(REVIEW_SYSTEM, serializeTranscript(opts.transcript), {
      provider: opts.provider,
      safety: opts.safety,
      registry,
      root: opts.root,
      requestApproval: async () => false,
      maxIterations: REVIEW_MAX_ITER,
    });
  } catch {
    // Best-effort: a review failure must never surface to the main turn.
  }
  return { wrote: written };
}
