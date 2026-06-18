import type { LLMProvider } from "../providers/interface.js";
import type { Message } from "../types.js";

export type PlainAssertionCase = {
  input: string;
  output: string;
  assertions: string[];
  context?: string;
};

export type PlainAssertionResult = {
  assertion: string;
  pass: boolean;
  reason: string;
};

export type PlainAssertionReport = {
  pass: boolean;
  results: PlainAssertionResult[];
};

const MAX_FIELD_CHARS = 6_000;

const JUDGE_SYS = `You are an independent test judge.
You receive a captured input, captured output, and plain-English assertions.
Evaluate ONLY whether the captured output satisfies each assertion for that input.
Reply ONLY as minified JSON: {"results":[{"assertion":"exact assertion","pass":true,"reason":"brief evidence"}]}
Use pass=false when evidence is missing, ambiguous, or contradicted.`;

function cap(text: string): string {
  return text.length > MAX_FIELD_CHARS ? `${text.slice(0, MAX_FIELD_CHARS)}\n[truncated]` : text;
}

export function buildAssertionJudgeMessages(testCase: PlainAssertionCase): Message[] {
  const body = [
    testCase.context ? `Context:\n${cap(testCase.context)}` : "",
    `Captured input:\n${cap(testCase.input)}`,
    `Captured output:\n${cap(testCase.output)}`,
    "Assertions:",
    ...testCase.assertions.map((assertion, i) => `${i + 1}. ${assertion}`),
  ].filter(Boolean).join("\n\n");
  return [{ role: "system", content: JUDGE_SYS }, { role: "user", content: body }];
}

export function parseAssertionJudgeResponse(text: string): PlainAssertionReport | null {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]) as Record<string, unknown>;
    const rawResults = parsed.results;
    if (!Array.isArray(rawResults)) return null;
    if (rawResults.length === 0) return null;
    const results = rawResults.map((raw) => {
      const item = raw as Record<string, unknown>;
      if (typeof item.assertion !== "string" || typeof item.pass !== "boolean") return null;
      return {
        assertion: item.assertion,
        pass: item.pass,
        reason: typeof item.reason === "string" ? item.reason : "",
      };
    });
    if (results.some((result) => result === null)) return null;
    const typed = results as PlainAssertionResult[];
    return { pass: typed.every((result) => result.pass), results: typed };
  } catch {
    return null;
  }
}

export async function judgePlainAssertions(
  testCase: PlainAssertionCase,
  provider: LLMProvider,
): Promise<PlainAssertionReport> {
  const response = await provider.complete(buildAssertionJudgeMessages(testCase), [], {
    temperature: 0,
    maxTokens: 1_000,
  });
  const parsed = parseAssertionJudgeResponse(response.text);
  if (parsed) return parsed;
  return {
    pass: false,
    results: testCase.assertions.map((assertion) => ({
      assertion,
      pass: false,
      reason: "judge returned malformed output",
    })),
  };
}

export function formatAssertionReport(report: PlainAssertionReport): string {
  const head = report.pass ? "All plain-English assertion(s) passed." : "Plain-English assertion(s) failed.";
  const lines = report.results.map((result) => {
    const mark = result.pass ? "PASS" : "FAIL";
    const reason = result.reason ? ` - ${result.reason}` : "";
    return `  ${mark} ${result.assertion}${reason}`;
  });
  return [head, ...lines].join("\n");
}
