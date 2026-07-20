import { describe, expect, it } from "vitest";
import { buildStatefulAgentInstruction, parseStatefulAgentOutcome } from "./agent-outcome.js";

const node = { id: "research", type: "agent" as const, instruction: "Find evidence", state: { read: ["query"], write: ["findings"] } };
const review = {
  id: "review", type: "review" as const, instruction: "Review", maker: "build", artifactInput: "artifact", reviewOutput: "packet",
  io: { inputs: { artifact: "artifact-ref" as const }, outputs: { packet: "json" as const } },
};
const adaptive = { id: "plan", type: "agent" as const, instruction: "Plan", proposeAdaptation: true };

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

  it("uses one structured review packet instead of duplicate output fields", () => {
    const instruction = buildStatefulAgentInstruction(review, { runId: "run-2", attempt: 1, state: {}, values: { artifact: { artifactRef: "a", revision: "r1" } } });
    expect(instruction).toContain('"review":{"accepted":false');
    expect(instruction).not.toContain('"outputs":{"packet"');
    const packet = { accepted: true, artifact: { artifactRef: "a", revision: "r1" }, findings: [] };
    expect(parseStatefulAgentOutcome(review, JSON.stringify({ output: "accepted", review: packet }))).toMatchObject({ review: packet });
  });

  it("parses only the declared adaptive proposal contract", () => {
    const instruction = buildStatefulAgentInstruction(adaptive, { runId: "run-3", attempt: 1, state: {} });
    expect(instruction).toContain('"adaptation":{"confidence"');
    const proposal = { confidence: 0.3, complexity: 0.5, remainingCostUsd: 1, risk: 0.1, evidence: "low confidence" };
    expect(parseStatefulAgentOutcome(adaptive, JSON.stringify({ output: "plan", adaptation: proposal }))).toMatchObject({ adaptation: proposal });
    expect(() => parseStatefulAgentOutcome(adaptive, JSON.stringify({ output: "plan", adaptation: { ...proposal, tools: ["shell"] } }))).toThrow();
  });
});
