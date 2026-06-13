import { type Dispatch, type MutableRefObject } from "react";
import { createConversation, type Conversation } from "../agent.js";
import { buildSummarizer } from "../session.js";
import { toolDisplay } from "../tui/tool-display.js";
import { summarizeResult } from "../tui/tool-result.js";
import { readTodos } from "../todo/store.js";
import { formatTally } from "./turn-metrics.js";
import type { Action } from "./reducer.js";
import type { RunSetup } from "../session.js";
import type { ReplState } from "../repl/types.js";

/** Reload the agent's plan into the live todo panel (best-effort). */
async function refreshTodos(dispatch: Dispatch<Action>): Promise<void> {
  try { dispatch({ t: "todos", items: await readTodos(process.env) }); } catch { /* ignore */ }
}

/** A pending kernel approval the live region renders; resolved by an a/d keypress. */
export type Pending = { action: string; reason: string; resolve: (ok: boolean) => void };

/** First non-empty line of a failed result, trimmed — used for the error tail. */
function firstLine(t: string): string {
  const l = (t.split("\n")[0] ?? "").trim();
  return l.length > 80 ? `${l.slice(0, 77)}...` : l;
}

type AgentDeps = {
  setup: RunSetup;
  repoRoot: string;
  dispatch: Dispatch<Action>;
  setPending: (p: Pending | null) => void;
  interruptRef: MutableRefObject<AbortController | null>;
  convoRef: MutableRefObject<Conversation | null>;
  replStateRef: MutableRefObject<ReplState>;
};

/** The Conversation config: every agent callback fans out into the v2 reducer. */
function convoConfig(deps: AgentDeps): Parameters<typeof createConversation>[1] {
  return {
    provider: deps.setup.provider,
    safety: deps.setup.safety,
    registry: deps.setup.registry,
    root: deps.repoRoot,
    maxIterations: Number(process.env.VANTA_MAX_ITER) || undefined,
    summarize: buildSummarizer(deps.setup.provider),
    onThinking: (text) => deps.dispatch({ t: "thinking", text }),
    onTextDelta: (d) => deps.dispatch({ t: "delta", d }),
    onToolCall: (name, args) => {
      const disp = toolDisplay(name, args);
      deps.dispatch({ t: "toolCall", name, verb: disp.verb, detail: disp.detail });
    },
    onToolResult: (name, ok, output, diff) => {
      deps.dispatch({ t: "toolResult", name, ok, errorLine: ok ? undefined : firstLine(output), summary: summarizeResult(output), diff });
      if (name === "todo") void refreshTodos(deps.dispatch); // reflect plan edits live
    },
    requestApproval: (action, reason) =>
      new Promise<boolean>((resolve) => deps.setPending({ action, reason, resolve })),
  };
}

/**
 * Owns the Conversation and exposes `send`. All agent callbacks dispatch into the
 * reducer; requestApproval surfaces a Pending the App resolves from a keypress.
 * The conversation is the SAME engine the old TUI used — only the render changed.
 */
export function useAgent(deps: AgentDeps): { send: (text: string) => Promise<void> } {
  const convoRef = deps.convoRef;
  if (convoRef.current === null) {
    convoRef.current = createConversation(deps.setup.systemPrompt, convoConfig(deps));
  }

  const send = async (text: string): Promise<void> => {
    const conv = convoRef.current;
    if (!conv) return;
    const ctrl = new AbortController();
    deps.interruptRef.current = ctrl;
    deps.replStateRef.current.turnIndex += 1;
    deps.dispatch({ t: "submit", text });
    deps.dispatch({ t: "turnStart" });
    let tally: string | null = null;
    try {
      const outcome = await conv.send(text, undefined, ctrl.signal);
      tally = formatTally(outcome.usage, outcome.tokensSaved);
    } catch (err) {
      deps.dispatch({ t: "note", text: `  ✗ ${(err as Error).message}` });
    } finally {
      deps.dispatch({ t: "turnEnd" }); // commit assistant text first…
      if (tally) deps.dispatch({ t: "note", text: tally }); // …then the tally below it
      void refreshTodos(deps.dispatch);
      deps.interruptRef.current = null;
    }
  };

  return { send };
}
