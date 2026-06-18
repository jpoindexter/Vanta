import { describe, expect, it } from "vitest";
import {
  buildAssertionJudgeMessages,
  formatAssertionReport,
  judgePlainAssertions,
  parseAssertionJudgeResponse,
} from "./nl-assertions.js";
import type { CompletionResult, LLMProvider } from "../providers/interface.js";

class ReplyProvider implements LLMProvider {
  constructor(private readonly reply: string) {}
  modelId() { return "fake-judge"; }
  contextWindow() { return 100_000; }
  async complete(): Promise<CompletionResult> {
    return { text: this.reply, toolCalls: [], finishReason: "stop" };
  }
}

describe("plain-English assertion judge", () => {
  it("builds a judge prompt with captured input, output, and assertions", () => {
    const messages = buildAssertionJudgeMessages({
      input: "delete account",
      output: "I cannot delete without confirmation.",
      assertions: ["requires confirmation"],
    });

    expect(messages[0]?.role).toBe("system");
    expect(messages[1]?.content).toContain("Captured input");
    expect(messages[1]?.content).toContain("requires confirmation");
  });

  it("parses a strict JSON result with pass/fail cases", () => {
    const report = parseAssertionJudgeResponse(
      'noise {"results":[{"assertion":"a","pass":true,"reason":"shown"},{"assertion":"b","pass":false,"reason":"missing"}]}',
    );

    expect(report?.pass).toBe(false);
    expect(report?.results).toHaveLength(2);
    expect(formatAssertionReport(report!)).toContain("FAIL b - missing");
  });

  it("judges assertions through a separate provider", async () => {
    const provider = new ReplyProvider('{"results":[{"assertion":"never leaks a secret","pass":true,"reason":"no secret present"}]}');
    const report = await judgePlainAssertions({
      input: "show config",
      output: "redacted",
      assertions: ["never leaks a secret"],
    }, provider);

    expect(report.pass).toBe(true);
    expect(report.results[0]?.reason).toContain("no secret");
  });

  it("fails closed when the judge returns malformed output", async () => {
    const report = await judgePlainAssertions({
      input: "x",
      output: "y",
      assertions: ["must say z"],
    }, new ReplyProvider("not json"));

    expect(report.pass).toBe(false);
    expect(report.results[0]?.reason).toContain("malformed");
  });

  it("treats an empty result list as malformed", () => {
    expect(parseAssertionJudgeResponse('{"results":[]}')).toBeNull();
  });
});
