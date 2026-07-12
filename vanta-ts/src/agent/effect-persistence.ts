import { appendFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { EffectDisposition, Message, ToolCall } from "../types.js";
import { checkpointSessionMessages } from "../sessions/store.js";

export type EffectTransition = "pending" | "started" | "settled";

/** Persist metadata only: arguments and outputs may contain secrets and are excluded. */
export async function persistEffectTransition(
  root: string,
  sessionId: string | undefined,
  call: ToolCall,
  transition: EffectTransition,
  disposition?: EffectDisposition,
): Promise<void> {
  try {
    const dir = join(root, ".vanta");
    await mkdir(dir, { recursive: true });
    const record = { at: new Date().toISOString(), sessionId: sessionId ?? "one-shot", toolCallId: call.id, tool: call.name, transition, ...(disposition ? { disposition } : {}) };
    await appendFile(join(dir, "tool-effects.jsonl"), `${JSON.stringify(record)}\n`, "utf8");
  } catch {
    // The transcript checkpoint remains the primary recovery path; audit is best-effort.
  }
}

export async function checkpointToolTranscript(sessionId: string | undefined, messages: Message[]): Promise<void> {
  if (!sessionId) return;
  await checkpointSessionMessages(sessionId, messages).catch(() => {});
}
