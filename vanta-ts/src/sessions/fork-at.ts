import { randomUUID } from "node:crypto";
import type { Message } from "../types.js";
import { loadSession, newSessionId, saveSession, type Session } from "./store.js";

/** Keeps the first `count` non-system messages, then drops a trailing tool exchange so no call is left unanswered. */
export function messagesUpTo(messages: Message[], count?: number): Message[] {
  if (count === undefined) return messages;
  const kept: Message[] = [];
  let shown = 0;
  for (const message of messages) {
    if (message.role !== "system") {
      if (shown >= count) break;
      shown += 1;
    }
    kept.push(message);
  }
  while (kept.length && (kept[kept.length - 1]?.role === "tool" || (kept[kept.length - 1] as { toolCalls?: unknown[] }).toolCalls?.length)) kept.pop();
  return kept;
}

/**
 * Branches a saved session into a new one holding the first `count` messages (all when omitted).
 * The branch gets a fresh title and keeps the provider and model of its parent.
 */
export async function forkSessionAt(sourceId: string, opts: { count?: number; env?: NodeJS.ProcessEnv; now?: Date } = {}): Promise<Session | null> {
  const source = await loadSession(sourceId, opts.env);
  if (!source) return null;
  const now = opts.now ?? new Date();
  const id = `${newSessionId(now)}-${randomUUID()}`;
  const stamp = now.toISOString();
  await saveSession(id, messagesUpTo(source.messages, opts.count), {
    env: opts.env, now: stamp, started: stamp, title: `${source.title} (branch)`, providerId: source.providerId, modelId: source.modelId,
  });
  return loadSession(id, opts.env);
}
