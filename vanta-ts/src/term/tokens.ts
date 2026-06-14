// Pure token estimate for the status footer — ~4 chars/token over the transcript
// plus any in-flight streamed text. Deliberately an estimate (marked with ~ in
// the UI): providers don't all surface exact usage, so this keeps the context
// fill honest without inventing precision.

const CHARS_PER_TOKEN = 4;

export function estimateTokens(messages: ReadonlyArray<{ content?: string }>, streaming = ""): number {
  let chars = streaming.length;
  for (const m of messages) chars += (m.content ?? "").length;
  return Math.round(chars / CHARS_PER_TOKEN);
}
