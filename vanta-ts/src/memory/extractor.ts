import { loadEntries } from "../brain/entries.js";
import { resolveBrain } from "../brain/index.js";
import type { LLMProvider } from "../providers/interface.js";
import type { Message } from "../types.js";

// Opt-in memory extraction. This is separate from brain/learn: it stores only
// plain durable fact strings, tags them as auto-extracted, and never throws.

const MAX_DIALOGUE_MESSAGES = 10; // last 5 user/assistant turns
const EXTRACT_TIMEOUT_MS = 20_000;
const AUTO_TAG = "auto-extracted";

const EXTRACT_SYS = `Extract durable factual memories from the recent user/assistant conversation.

Keep only stable facts, preferences, or project truths worth recalling later.
Do not include transient task status, speculation, secrets, or generic advice.
Return ONLY a JSON array of strings. No prose, no markdown, no code fence.
Return [] when there is nothing durable.`;

export type MemoryExtractorContext = {
  provider: LLMProvider;
  env?: NodeJS.ProcessEnv;
  now?: Date;
};

function enabled(env: NodeJS.ProcessEnv): boolean {
  return env.VANTA_EXTRACT_MEMORIES === "1";
}

function recentDialogue(turnWindow: Message[]): string {
  return turnWindow
    .filter((m) => m.role === "user" || m.role === "assistant")
    .slice(-MAX_DIALOGUE_MESSAGES)
    .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
    .join("\n");
}

function parseFacts(text: string): string[] | null {
  try {
    const raw: unknown = JSON.parse(text.trim());
    if (!Array.isArray(raw)) return null;
    return raw.filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean);
  } catch {
    return null;
  }
}

function words(text: string): Set<string> {
  return new Set(text.toLowerCase().match(/[a-z0-9']+/g) ?? []);
}

function wordOverlap(candidate: string, stored: string): number {
  const c = words(candidate);
  if (!c.size) return 0;
  const s = words(stored);
  let overlap = 0;
  for (const w of c) if (s.has(w)) overlap++;
  return overlap / c.size;
}

function isDuplicate(candidate: string, storedFacts: string[]): boolean {
  return storedFacts.some((fact) => wordOverlap(candidate, fact) >= 0.8);
}

async function extractWithTimeout(
  provider: LLMProvider,
  dialogue: string,
): Promise<string> {
  const controller = new AbortController();
  let timeout: NodeJS.Timeout | undefined;
  const completion = provider.complete(
    [
      { role: "system", content: EXTRACT_SYS },
      { role: "user", content: dialogue },
    ],
    [],
    { temperature: 0, maxTokens: 400, signal: controller.signal },
  ).then((r) => r.text);
  const deadline = new Promise<string>((_, reject) => {
    timeout = setTimeout(() => {
      controller.abort();
      reject(new Error("memory extraction timed out"));
    }, EXTRACT_TIMEOUT_MS);
  });
  try {
    return await Promise.race([completion, deadline]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export async function runMemoryExtractor(
  turnWindow: Message[],
  ctx: MemoryExtractorContext,
): Promise<{ extracted: string[]; stored: number }> {
  const env = { ...process.env, ...(ctx.env ?? {}) };
  if (!enabled(env)) return { extracted: [], stored: 0 };
  const dialogue = recentDialogue(turnWindow);
  if (!dialogue.trim()) return { extracted: [], stored: 0 };

  try {
    const parsed = parseFacts(await extractWithTimeout(ctx.provider, dialogue));
    if (!parsed) return { extracted: [], stored: 0 };
    const storedFacts = (await loadEntries(env)).map((e) => e.content);
    let stored = 0;
    for (const fact of parsed) {
      if (isDuplicate(fact, storedFacts)) continue;
      await resolveBrain(env).remember({
        region: "semantic",
        content: fact,
        entryType: "fact",
        confidence: 0.65,
        sourceType: "inference",
        sourceRef: AUTO_TAG,
        now: ctx.now,
        env,
      });
      storedFacts.push(fact);
      stored++;
    }
    return { extracted: parsed, stored };
  } catch {
    return { extracted: [], stored: 0 };
  }
}
