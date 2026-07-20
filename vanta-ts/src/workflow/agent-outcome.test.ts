import { describe, expect, it } from "vitest";
import { buildStatefulAgentInstruction, parseStatefulAgentOutcome } from "./agent-outcome.js";

const node = { id: "research", type: "agent" as const, instruction: "Find evidence", state: { read: ["query"], write: ["findings"] } };

describe("stateful workflow agent envelope", () => {
  it("injects only the declared state view and write contract", () => {
    const instruction = buildStatefulAgentInstruction(node, { runId: "run-1", attempt: 2, state: { query: "Vanta" } });
    expect(instruction).toContain('"query":"Vanta"');
    expect(instruction).toContain('"findings":<typed value>');
    expect(instruction).not.toContain("hidden");
  });

  it("parses fenced structured output for state-writing nodes", () => {
    const result = parseStatefulAgentOutcome(node, '```json\n{"output":"done","writes":{"findings":["a"]},"artifacts":[]}\n```');
    expect(result).toEqual({ output: "done", writes: { findings: ["a"] }, artifacts: [] });
    expect(() => parseStatefulAgentOutcome(node, "ordinary prose")).toThrow(/JSON envelope/);
  });
});
