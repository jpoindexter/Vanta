export type TurnBoundary = "clarification" | "approval" | "resume" | "reject" | "completion";

export type ScriptedTurn = {
  reply: string;
  boundary: TurnBoundary;
  checks: string[];
  forbiddenPatterns?: string[];
};

export type ScriptedScenario = {
  id: string;
  instruction: string;
  firstTurn: Omit<ScriptedTurn, "reply">;
  operatorReplies: ScriptedTurn[];
  forbiddenPatterns?: string[];
};

export type StoryToolEvent = { name: string; ok: boolean; output?: string };
type SendOutcome = { finalText: string; toolIterations: number; iterations: number; stoppedReason: string };

export type ScriptedTurnReceipt = {
  index: number;
  input: string;
  output: string;
  boundary: TurnBoundary;
  checks: string[];
  missing: string[];
  boundaryPassed: boolean;
  guardPassed: boolean;
  forbiddenHits: string[];
  tools: StoryToolEvent[];
  stoppedReason: string;
  iterations: number;
  toolIterations: number;
  passed: boolean;
};

export type ScriptedStoryReceipt = { id: string; passed: boolean; turns: ScriptedTurnReceipt[] };

type RunnerDeps = {
  send: (text: string) => Promise<SendOutcome>;
  drainToolEvents: () => StoryToolEvent[];
  redact: (text: string) => string;
};

export async function runScriptedTurns(scenario: ScriptedScenario, deps: RunnerDeps): Promise<ScriptedStoryReceipt> {
  const turns = [{ reply: scenario.instruction, ...scenario.firstTurn }, ...scenario.operatorReplies];
  const receipts: ScriptedTurnReceipt[] = [];
  for (let index = 0; index < turns.length; index++) {
    const turn = turns[index]!;
    const outcome = await deps.send(turn.reply);
    receipts.push(toReceipt({ index, turn, outcome, tools: deps.drainToolEvents(), scenarioForbidden: scenario.forbiddenPatterns ?? [], redact: deps.redact }));
  }
  return { id: scenario.id, passed: receipts.every((turn) => turn.passed), turns: receipts };
}

function toReceipt(opts: { index: number; turn: ScriptedTurn; outcome: SendOutcome; tools: StoryToolEvent[]; scenarioForbidden: string[]; redact: (text: string) => string }): ScriptedTurnReceipt {
  const { index, turn, outcome, tools, scenarioForbidden, redact } = opts;
  const output = redact(outcome.finalText);
  const haystack = `${output}\n${tools.map((tool) => `${tool.name} ${tool.output ?? ""}`).join("\n")}`.toLowerCase();
  const missing = turn.checks.filter((check) => !output.toLowerCase().includes(check.toLowerCase()));
  const forbidden = [...scenarioForbidden, ...(turn.forbiddenPatterns ?? [])];
  const forbiddenHits = forbidden.filter((pattern) => haystack.includes(pattern.toLowerCase()));
  const boundaryPassed = missing.length === 0;
  const guardPassed = forbiddenHits.length === 0;
  return {
    index, input: redact(turn.reply), output, boundary: turn.boundary, checks: turn.checks, missing,
    boundaryPassed, guardPassed, forbiddenHits, tools, stoppedReason: outcome.stoppedReason,
    iterations: outcome.iterations, toolIterations: outcome.toolIterations,
    passed: boundaryPassed && guardPassed && outcome.stoppedReason === "done",
  };
}
