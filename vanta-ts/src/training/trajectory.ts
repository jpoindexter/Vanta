import { createHash } from "node:crypto";
import { compressText, dedupeBlocks } from "../compress/router.js";
import { redactForLog } from "../store/redact-structural.js";
import type { Session } from "../sessions/store.js";
import type { Message, ToolCall } from "../types.js";

export type TrainingToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

export type TrainingMessage =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string; tool_calls?: TrainingToolCall[] }
  | { role: "tool"; tool_call_id: string; name: string; content: string };

export type TrajectoryExample = {
  schema: "vanta.trajectory.v1";
  id: string;
  sessionId: string;
  projectId?: string;
  turn: number;
  messages: TrainingMessage[];
  compression: { toolResults: number; compressedResults: number; tokensBefore: number; tokensAfter: number };
};

export type TrajectorySftRow = {
  prompt: string;
  chosen: string;
  rejected: "";
  source: { schema: "vanta.trajectory.v1"; trajectoryId: string; sessionId: string; turn: number; step: number };
};

export type TrajectoryBatch = {
  examples: TrajectoryExample[];
  sft: TrajectorySftRow[];
  stats: { sessions: number; examples: number; toolCalls: number; toolResults: number; compressedResults: number; tokensBefore: number; tokensAfter: number };
};

function redactValue(value: unknown): unknown {
  if (typeof value === "string") return redactForLog(value);
  if (Array.isArray(value)) return value.map(redactValue);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, redactValue(item)]));
  return value;
}

function trainingToolCall(call: ToolCall): TrainingToolCall {
  return {
    id: redactForLog(call.id),
    type: "function",
    function: { name: redactForLog(call.name), arguments: JSON.stringify(redactValue(call.arguments)) },
  };
}

function compressToolResult(content: string): { content: string; before: number; after: number; compressed: boolean } {
  const safe = redactForLog(content);
  const routed = compressText(safe, { minTokens: 64, headItems: 2, tailItems: 1, maxStringLength: 320 });
  const deduped = dedupeBlocks(routed.text);
  let text = deduped.deduped > 0 ? deduped.text : routed.text;
  if (text.length > 8_000) {
    const hash = createHash("sha256").update(safe).digest("hex");
    text = `${text.slice(0, 6_000)}\n\n[vanta trajectory output elided; original_chars=${safe.length}; sha256=${hash}]\n\n${text.slice(-1_500)}`;
  }
  const after = Math.ceil(text.length / 4);
  return { content: text, before: routed.tokensBefore, after, compressed: after < routed.tokensBefore };
}

function turnRanges(messages: readonly Message[]): Array<{ turn: number; messages: readonly Message[] }> {
  const starts = messages.flatMap((message, index) => message.role === "user" ? [index] : []);
  return starts.map((start, turn) => ({ turn: turn + 1, messages: messages.slice(start, starts[turn + 1] ?? messages.length) }));
}

function trajectoryId(sessionId: string, turn: number, messages: readonly TrainingMessage[]): string {
  return createHash("sha256").update(`${sessionId}:${turn}:${JSON.stringify(messages)}`).digest("hex").slice(0, 20);
}

function buildExample(session: Session, turn: number, messages: readonly Message[]): TrajectoryExample | null {
  const user = messages[0];
  if (!user || user.role !== "user") return null;
  const prompt = redactForLog(user.content).trim();
  if (!prompt) return null;
  const training: TrainingMessage[] = [{ role: "user", content: prompt }];
  let toolResults = 0;
  let compressedResults = 0;
  let tokensBefore = 0;
  let tokensAfter = 0;
  for (const message of messages.slice(1)) {
    if (message.role === "assistant") {
      const content = redactForLog(message.content);
      const calls = message.toolCalls?.map(trainingToolCall);
      if (content || calls?.length) training.push({ role: "assistant", content, ...(calls?.length ? { tool_calls: calls } : {}) });
      continue;
    }
    if (message.role === "tool") {
      const result = compressToolResult(message.content);
      toolResults += 1;
      compressedResults += Number(result.compressed);
      tokensBefore += result.before;
      tokensAfter += result.after;
      training.push({ role: "tool", tool_call_id: redactForLog(message.toolCallId), name: redactForLog(message.name), content: result.content });
    }
  }
  if (!training.some((message) => message.role === "assistant")) return null;
  return {
    schema: "vanta.trajectory.v1",
    id: trajectoryId(session.id, turn, training),
    sessionId: session.id,
    ...(session.projectId ? { projectId: session.projectId } : {}),
    turn,
    messages: training,
    compression: { toolResults, compressedResults, tokensBefore, tokensAfter },
  };
}

function serializeMessage(message: TrainingMessage): string {
  if (message.role === "user") return `<user>${message.content}</user>`;
  if (message.role === "tool") return `<tool_result name=${JSON.stringify(message.name)}>${message.content}</tool_result>`;
  const calls = message.tool_calls?.map((call) => `<tool_call>${JSON.stringify(call.function)}</tool_call>`).join("\n") ?? "";
  return [calls, message.content ? `<assistant>${message.content}</assistant>` : ""].filter(Boolean).join("\n");
}

export function trajectoryToSftRows(example: TrajectoryExample): TrajectorySftRow[] {
  return example.messages.flatMap((message, index) => {
    if (message.role !== "assistant") return [];
    const chosen = serializeMessage(message);
    if (!chosen) return [];
    return [{
      prompt: example.messages.slice(0, index).map(serializeMessage).filter(Boolean).join("\n"),
      chosen,
      rejected: "" as const,
      source: { schema: "vanta.trajectory.v1" as const, trajectoryId: example.id, sessionId: example.sessionId, turn: example.turn, step: index },
    }];
  });
}

export function buildTrajectoryBatch(sessions: readonly Session[], limit = 100, toolsOnly = false): TrajectoryBatch {
  const examples: TrajectoryExample[] = [];
  for (const session of sessions) {
    for (const range of turnRanges(session.messages).reverse()) {
      const example = buildExample(session, range.turn, range.messages);
      const hasTools = example?.messages.some((message) => message.role === "assistant" && Boolean(message.tool_calls?.length));
      if (example && (!toolsOnly || hasTools)) examples.push(example);
      if (examples.length >= limit) break;
    }
    if (examples.length >= limit) break;
  }
  const stats = examples.reduce((acc, example) => {
    acc.toolCalls += example.messages.reduce((sum, message) => sum + (message.role === "assistant" ? message.tool_calls?.length ?? 0 : 0), 0);
    acc.toolResults += example.compression.toolResults;
    acc.compressedResults += example.compression.compressedResults;
    acc.tokensBefore += example.compression.tokensBefore;
    acc.tokensAfter += example.compression.tokensAfter;
    return acc;
  }, { sessions: new Set(examples.map((example) => example.sessionId)).size, examples: examples.length, toolCalls: 0, toolResults: 0, compressedResults: 0, tokensBefore: 0, tokensAfter: 0 });
  return { examples, sft: examples.flatMap(trajectoryToSftRows), stats };
}
