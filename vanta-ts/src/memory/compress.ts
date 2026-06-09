import type { LLMProvider } from "../providers/interface.js";
import type { Message } from "../types.js";

export type CompressedObservation = {
  type: "decision" | "discovery" | "error" | "action" | "preference";
  title: string;
  facts: string[];
  importance: "high" | "medium" | "low";
};

const EXTRACT_SYS =
  "Extract key observations from the last assistant turn. Return JSON: " +
  '{"observations":[{"type":"decision|discovery|error|action|preference","title":"...","facts":["..."],"importance":"high|medium|low"}]}. ' +
  "Be terse. Return {} if nothing worth capturing. Never invent — only report what actually happened.";

/** One excerpt line for a message in the last turn (assistant text / tool result). Pure. */
function turnLine(m: Message): string {
  if (m.role === "assistant") return `[assistant] ${m.content}`;
  if (m.role === "tool") return `[tool:${m.name}] ${m.content?.slice(0, 200)}`;
  return "";
}

/** The last assistant turn + its tool results, capped to 3k chars. Pure. */
function lastTurnExcerpt(messages: Message[]): string {
  const relevant: string[] = [];
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (!m) continue;
    if (m.role === "user") break;
    const text = turnLine(m);
    if (text) relevant.unshift(text);
  }
  return relevant.join("\n").slice(0, 3000);
}

/** Parse the extractor's JSON into observations; [] on any malformed shape. Pure. */
function parseObservations(text: string): CompressedObservation[] {
  const parsed: unknown = JSON.parse(text);
  if (!parsed || typeof parsed !== "object") return [];
  const obs = (parsed as { observations?: unknown }).observations;
  return Array.isArray(obs) ? (obs as CompressedObservation[]) : [];
}

/**
 * MEM-COMPRESS: Extract structured observations from the last turn's messages.
 * Runs a lightweight LLM call to compress the turn into typed facts.
 * Best-effort — returns [] on any failure.
 */
export async function extractObservations(
  messages: Message[],
  provider: LLMProvider,
): Promise<CompressedObservation[]> {
  try {
    const excerpt = lastTurnExcerpt(messages);
    if (!excerpt) return [];
    const { text } = await provider.complete(
      [
        { role: "system", content: EXTRACT_SYS },
        { role: "user", content: excerpt },
      ],
      [],
      { maxTokens: 512 },
    );
    return parseObservations(text);
  } catch {
    return [];
  }
}

/** Format observations for appending to memory. */
export function formatObservations(observations: CompressedObservation[]): string {
  if (!observations.length) return "";
  return observations
    .map(
      (o) =>
        `**${o.type.toUpperCase()}** [${o.importance}]: ${o.title}\n${o.facts.map((f) => `  - ${f}`).join("\n")}`,
    )
    .join("\n\n");
}
