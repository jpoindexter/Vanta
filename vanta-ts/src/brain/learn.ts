import { z } from "zod";
import { remember } from "./brain.js";
import { classifyIngest, toLivePointer } from "./ingest-gate.js";
import { isBrainRegion } from "./regions.js";
import { serializeForNotes } from "../memory/session-memory.js";
import type { LLMProvider } from "../providers/interface.js";
import type { Message } from "../types.js";

// Auto-learning — how the brain grows with the user. After a busy turn, a single
// background model call distils the conversation into 0–3 DURABLE memories and
// remembers them: the user's behaviors and working patterns into user_model,
// facts into semantic, notable events into episodic — and observations about
// Vanta's OWN forming personality into identity/reflections, so she develops a
// self from how the user works with her. Re-learning something already known
// strengthens it (upsert), association links it, consolidation keeps it small.
// Best-effort everywhere: a failure never touches the turn.

const DEFAULT_EVERY = 4; // learn every Nth turn
const DEFAULT_MIN_TOOLS = 5; // ...or any turn busier than this
const MAX_LEARNED = 3;
const MAX_TRANSCRIPT_CHARS = 6000;

const LEARN_SYS = `You are Vanta's memory-formation pass. From the conversation, extract the durable memories worth keeping — at most ${MAX_LEARNED}, usually fewer, often none.

Worth keeping:
- user_model — the user's behaviors, preferences, and working patterns. Especially executive-function patterns that help guide a neurodivergent user (where they stall, what unblocks them, how they like steps sized, sensory/communication preferences) — designing for that helps everyone.
- semantic — durable facts about the world, the user's life, or the codebase.
- episodic — a notable event worth remembering ("we shipped X", "Y failed badly because Z").
- identity / reflections — observations about Vanta's own forming personality: what tone or behavior worked or didn't with this user, lessons from mistakes.

NOT worth keeping: one-off task details, transient state, anything already obvious, speculation about feelings.

Reply with ONLY a JSON array (no prose, no code fence). Each item:
{"region": "user_model|semantic|episodic|identity|reflections", "content": "<one tight sentence>", "entry_type": "fact|preference|pattern|insight|plan|emotion", "confidence": 0.0-1.0}
Reply [] when nothing durable was revealed.`;

const LearnedSchema = z.array(
  z.object({
    region: z.string(),
    content: z.string().min(8),
    entry_type: z.enum(["fact", "skill", "preference", "pattern", "insight", "plan", "emotion"]).optional(),
    confidence: z.number().min(0).max(1).optional(),
  }),
);

function isDisabled(env: NodeJS.ProcessEnv): boolean {
  const v = (env.VANTA_BRAIN_LEARN ?? "").trim().toLowerCase();
  return v === "0" || v === "false" || v === "off" || v === "no";
}

function numEnv(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/**
 * Should the learning pass run this turn? Pure. Fires on a busy turn
 * (>= VANTA_BRAIN_LEARN_MIN_TOOLS tool calls) or periodically (every
 * VANTA_BRAIN_LEARN_EVERY turns). Off when VANTA_BRAIN_LEARN is 0/false/off/no.
 */
export function shouldLearn(
  turnIndex: number,
  toolIterations: number,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (isDisabled(env)) return false;
  if (toolIterations >= numEnv(env.VANTA_BRAIN_LEARN_MIN_TOOLS, DEFAULT_MIN_TOOLS)) return true;
  const every = numEnv(env.VANTA_BRAIN_LEARN_EVERY, DEFAULT_EVERY);
  return turnIndex > 0 && turnIndex % every === 0;
}

function stripFence(text: string): string {
  const t = text.trim();
  if (!t.startsWith("```")) return t;
  return t.replace(/^```[a-zA-Z]*\n?/, "").replace(/\n?```$/, "").trim();
}

/** Parse the model's reply into validated memories (invalid regions/items dropped). Pure. */
export function parseLearned(text: string): Array<z.infer<typeof LearnedSchema>[number]> {
  try {
    const raw: unknown = JSON.parse(stripFence(text));
    const parsed = LearnedSchema.safeParse(raw);
    if (!parsed.success) return [];
    return parsed.data.filter((m) => isBrainRegion(m.region)).slice(0, MAX_LEARNED);
  } catch {
    return [];
  }
}

type Learned = z.infer<typeof LearnedSchema>[number];

/** Remember one learned memory through the ingest gate: volatile facts become
 * live-access pointers (value dropped, source:external), evergreen facts store
 * verbatim (source:inference). Returns the text actually stored. */
async function rememberLearned(m: Learned, env?: NodeJS.ProcessEnv): Promise<string> {
  const volatile = classifyIngest(m.content) === "volatile";
  const content = volatile ? toLivePointer(m.content).text : m.content;
  await remember({
    region: m.region,
    content,
    entryType: m.entry_type,
    confidence: m.confidence ?? 0.6,
    sourceType: volatile ? "external" : "inference",
    env,
  });
  return content;
}

/**
 * Distil the transcript into durable memories and remember each (through the
 * ingest gate). Returns what was learned. Best-effort: any failure returns [].
 */
export async function learnFromTranscript(opts: {
  provider: LLMProvider;
  transcript: Message[];
  env?: NodeJS.ProcessEnv;
}): Promise<string[]> {
  try {
    const convo = serializeForNotes(opts.transcript, MAX_TRANSCRIPT_CHARS);
    if (!convo.trim()) return [];
    const { text } = await opts.provider.complete(
      [
        { role: "system", content: LEARN_SYS },
        { role: "user", content: convo },
      ],
      [],
    );
    const learned = parseLearned(text);
    const kept: string[] = [];
    for (const m of learned) kept.push(await rememberLearned(m, opts.env));
    return kept;
  } catch {
    return [];
  }
}
