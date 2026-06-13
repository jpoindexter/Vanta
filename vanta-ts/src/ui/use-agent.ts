import { useRef, type Dispatch, type MutableRefObject } from "react";
import { createConversation, type Conversation } from "../agent.js";
import { buildSummarizer } from "../session.js";
import { toolDisplay } from "../tui/tool-display.js";
import { summarizeResult } from "../tui/tool-result.js";
import type { Action } from "./reducer.js";
import type { RunSetup } from "../session.js";

/** A pending kernel approval the live region renders; resolved by an a/d keypress. */
export type Pending = { action: string; reason: string; resolve: (ok: boolean) => void };

/** First non-empty line of a failed result, trimmed — used for the error tail. */
function firstLine(t: string): string {
  const l = (t.split("\n")[0] ?? "").trim();
  return l.length > 80 ? `${l.slice(0, 77)}...` : l;
}

/**
 * Owns the Conversation and exposes `send`. All agent callbacks dispatch into the
 * reducer; requestApproval surfaces a Pending the App resolves from a keypress.
 * The conversation is the SAME engine the old TUI used — only the render changed.
 */
export function useAgent(deps: {
  setup: RunSetup;
  repoRoot: string;
  dispatch: Dispatch<Action>;
  setPending: (p: Pending | null) => void;
  interruptRef: MutableRefObject<AbortController | null>;
}): { send: (text: string) => Promise<void> } {
  const convoRef = useRef<Conversation | null>(null);

  if (convoRef.current === null) {
    convoRef.current = createConversation(deps.setup.systemPrompt, {
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
      onToolResult: (name, ok, output, diff) =>
        deps.dispatch({ t: "toolResult", name, ok, errorLine: ok ? undefined : firstLine(output), summary: summarizeResult(output), diff }),
      requestApproval: (action, reason) =>
        new Promise<boolean>((resolve) => deps.setPending({ action, reason, resolve })),
    });
  }

  const send = async (text: string): Promise<void> => {
    const conv = convoRef.current;
    if (!conv) return;
    const ctrl = new AbortController();
    deps.interruptRef.current = ctrl;
    deps.dispatch({ t: "submit", text });
    deps.dispatch({ t: "turnStart" });
    try {
      await conv.send(text, undefined, ctrl.signal);
    } catch (err) {
      deps.dispatch({ t: "note", text: `  ✗ ${(err as Error).message}` });
    } finally {
      deps.dispatch({ t: "turnEnd" });
      deps.interruptRef.current = null;
    }
  };

  return { send };
}
