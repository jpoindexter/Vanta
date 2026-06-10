import type { Dispatch, MutableRefObject } from "react";
import type { AgentDeps, Conversation } from "../agent.js";
import { buildSummarizer } from "../session.js";
import type { RunSetup } from "../session.js";
import { toolDisplay } from "./tool-display.js";
import { summarizeResult, buildResultPreview } from "./tool-result.js";
import { firstLine } from "./transcript.js";
import { PLAN_MARKER } from "../repl/plan-mode.js";
import type { Action } from "./app-reducer.js";
import type { ReplState } from "../repl-commands.js";

/**
 * The createConversation() callback wiring, lifted out of the App component so
 * the component stays a thin shell (see TUI-V2 prereq / tui-size-debt). All
 * callbacks dispatch into the reducer; behaviour is identical to the inline form.
 */
export function buildConvoConfig(deps: {
  setup: RunSetup;
  repoRoot: string;
  dispatch: Dispatch<Action>;
  convoRef: MutableRefObject<Conversation | null>;
  replStateRef: MutableRefObject<ReplState>;
  requestApproval: AgentDeps["requestApproval"];
}): AgentDeps {
  return {
    provider: deps.setup.provider,
    safety: deps.setup.safety,
    registry: deps.setup.registry,
    root: deps.repoRoot,
    maxIterations: Number(process.env.VANTA_MAX_ITER) || undefined,
    summarize: buildSummarizer(deps.setup.provider),
    onThinking: (text) => deps.dispatch({ t: "thinking", text }),
    onTextDelta: (delta) => deps.dispatch({ t: "delta", d: delta }),
    onToolCall: (name, args) => deps.dispatch({ t: "toolCall", name, ...toolDisplay(name, args) }),
    onToolResult: (name, ok, output, diff) => {
      const preview = ok ? buildResultPreview(output) : undefined;
      deps.dispatch({ t: "toolResult", name, ok, errorLine: ok ? undefined : firstLine(output), summary: summarizeResult(output), diff, resultOutput: preview?.preview, lineCount: preview?.lineCount });
      // Live checklist — surface the todo list as a note every time the agent writes it.
      if (name === "todo" && ok && output.includes("done)")) {
        deps.dispatch({ t: "note", text: `  ☑ plan updated:\n${output.split("\n").map((l) => `  ${l}`).join("\n")}` });
      }
    },
    onAutoCompact: (dropped, summary) => {
      const preview = summary.length > 60 ? summary.slice(0, 57) + "…" : summary;
      deps.dispatch({ t: "compactBoundary", text: `compacted ${dropped} messages · ${preview}` });
    },
    requestApproval: deps.requestApproval,
    // Plan-mode gate: block write tools while plan mode is active and unapproved.
    planGate: () => {
      const sys = deps.convoRef.current?.messages[0];
      return !!(sys?.content.includes(PLAN_MARKER) && !deps.replStateRef.current.planApproved);
    },
  };
}
