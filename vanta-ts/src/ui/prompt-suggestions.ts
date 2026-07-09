import type { LLMProvider } from "../providers/interface.js";
import type { Message } from "../types.js";

export type PromptSuggestionInput = {
  userText: string;
  finalText: string;
  provider?: Pick<LLMProvider, "complete">;
};

const MAX_SUGGESTIONS = 3;
const MAX_PROMPT_CHARS = 120;

export function promptSuggestionsEnabled(env: NodeJS.ProcessEnv): boolean {
  const raw = env.VANTA_PROMPT_SUGGESTIONS?.trim().toLowerCase();
  if (!raw) return true;
  return !["0", "false", "off", "no"].includes(raw);
}

export async function generatePromptSuggestions(input: PromptSuggestionInput): Promise<string[]> {
  if (typeof input.provider?.complete === "function") {
    try {
      const response = await input.provider.complete(buildMessages(input), [], {
        temperature: 0.2,
        maxTokens: 180,
        effortLevel: "low",
      });
      const parsed = normalizeSuggestions(parseSuggestions(response.text));
      if (parsed.length === MAX_SUGGESTIONS) return parsed;
    } catch {
      // Side-query suggestions are opportunistic; fallback keeps the UI useful.
    }
  }
  return fallbackSuggestions(input);
}

function buildMessages(input: PromptSuggestionInput): Message[] {
  return [
    {
      role: "system",
      content: [
        "Predict exactly 3 useful next prompts for this Vanta operator.",
        "Return only a JSON string array.",
        "Each prompt must be a direct user command, under 120 characters.",
        "Prefer verification, next-step execution, or inspection.",
        "Do not mention internal systems or explain the list.",
      ].join(" "),
    },
    {
      role: "user",
      content: JSON.stringify({
        lastUserPrompt: clip(input.userText, 1200),
        assistantReply: clip(input.finalText, 4000),
      }),
    },
  ];
}

function parseSuggestions(raw: string): string[] {
  const text = raw.trim();
  const json = text.match(/\[[\s\S]*\]/)?.[0] ?? text;
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return text.split(/\r?\n/)
      .map((line) => line.replace(/^\s*(?:[-*]|\d+[.)])\s*/, ""))
      .filter(Boolean);
  }
}

export function fallbackSuggestions(input: Pick<PromptSuggestionInput, "userText" | "finalText">): string[] {
  const text = `${input.userText}\n${input.finalText}`.toLowerCase();
  const candidates = [
    /fail|error|blocked|cannot|can't|exception/.test(text) ? "Diagnose the failing path and patch the smallest fix" : "",
    /test|passed|verified|ship|commit|push/.test(text) ? "Commit and push this verified slice" : "",
    /roadmap|card|next|launch pad/.test(text) ? "Move the next roadmap card into build and execute it" : "",
    /file|changed|diff|edit/.test(text) ? "Show the changed files and why each one changed" : "",
    "Run the relevant verification and report the exact result",
    "Pick the next smallest useful step and execute it",
    "Open the roadmap and show what is next",
  ].filter(Boolean);
  return normalizeSuggestions(candidates);
}

export function normalizeSuggestions(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const oneLine = value.replace(/\s+/g, " ").trim();
    if (!oneLine) continue;
    const clipped = clip(oneLine, MAX_PROMPT_CHARS);
    const key = clipped.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(clipped);
    if (out.length === MAX_SUGGESTIONS) break;
  }
  return out.length === MAX_SUGGESTIONS ? out : normalizeSuggestions([...out, ...fallbackSuggestions({ userText: "", finalText: "" })]);
}

function clip(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1).trimEnd()}…`;
}
