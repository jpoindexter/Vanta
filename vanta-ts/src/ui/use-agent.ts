import { type Dispatch, type MutableRefObject } from "react";
import { join } from "node:path";
import { createConversation, type Conversation } from "../agent.js";
import { buildSummarizer } from "../session.js";
import { runPostTurnGates, type GateState } from "../repl/post-turn-gates.js";
import { toolDisplay } from "../term/tool-display.js";
import { summarizeResult } from "../term/tool-result.js";
import { readTodos } from "../todo/store.js";
import { errorDetails, fireStopFailure, stopFailureType } from "../hooks/runtime-events.js";
import { fireHooks, fireStopHook } from "../hooks/shell-hooks.js";
import { resolveDroppedMedia } from "../interactive-turn.js";
import type { Action } from "./reducer.js";
import type { RunSetup } from "../session.js";
import type { ReplState } from "../repl/types.js";

/** Reload the agent's plan into the live todo panel (best-effort). */
async function refreshTodos(dispatch: Dispatch<Action>): Promise<void> {
  try { dispatch({ t: "todos", items: await readTodos(process.env) }); } catch { /* ignore */ }
}

/** A pending kernel approval the live region renders; resolved by an a/A/d keypress.
 * `toolName` lets "always allow" persist a tool-scoped rule (see ui/grant.ts). */
export type Pending = { action: string; reason: string; toolName?: string; resolve: (ok: boolean) => void };

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
  gatesRef: MutableRefObject<GateState>;
};

/** Run the post-turn EF/operator gate bundle (same set as the readline host) so
 *  the ND executive-function engine fires in the default TUI too. Best-effort —
 *  a gate failure never breaks the turn; nudges surface as transcript notes. */
export async function runTurnGates(deps: AgentDeps): Promise<void> {
  try {
    const st = deps.replStateRef.current;
    deps.gatesRef.current = await runPostTurnGates(deps.gatesRef.current, {
      messages: deps.convoRef.current?.messages ?? [],
      safety: deps.setup.safety,
      dataDir: join(deps.repoRoot, ".vanta"),
      onNote: (text) => deps.dispatch({ t: "note", text: `\n${text}` }),
      turnIndex: st.turnIndex,
      startedMs: Date.parse(st.started) || Date.now(),
      now: Date.now(),
    });
  } catch { /* gates are best-effort — never break the turn */ }
}

/** The Conversation config: every agent callback fans out into the v2 reducer. */
function convoConfig(deps: AgentDeps): Parameters<typeof createConversation>[1] {
  return {
    provider: deps.setup.provider,
    advisorProvider: deps.setup.advisorProvider,
    safety: deps.setup.safety,
    registry: deps.setup.registry,
    root: deps.repoRoot,
    sessionId: deps.replStateRef.current.sessionId,
    maxIterations: Number(process.env.VANTA_MAX_ITER) || undefined,
    summarize: buildSummarizer(deps.setup.provider),
    getEffortLevel: () => deps.replStateRef.current.effortLevel ?? deps.setup.effortLevel,
    onThinking: (text) => deps.dispatch({ t: "thinking", text }),
    onTextDelta: (d) => deps.dispatch({ t: "delta", d }),
    onThinkingDelta: (d) => deps.dispatch({ t: "thinkingDelta", d }),
    onToolCall: (name, args) => {
      const disp = toolDisplay(name, args);
      deps.dispatch({ t: "toolCall", name, verb: disp.verb, detail: disp.detail });
    },
    onToolResult: (name, ok, output, diff) => {
      const tokens = Math.round((output?.length ?? 0) / 4);
      deps.dispatch({ t: "toolResult", name, ok, errorLine: ok ? undefined : firstLine(output), summary: summarizeResult(output, name), diff, tokens });
      if (name === "todo") void refreshTodos(deps.dispatch); // reflect plan edits live
    },
    requestApproval: (action, reason, toolName) =>
      new Promise<boolean>((resolve) => deps.setPending({ action, reason, toolName, resolve })),
  };
}

/**
 * Owns the Conversation and exposes `send`. All agent callbacks dispatch into the
 * reducer; requestApproval surfaces a Pending the App resolves from a keypress.
 * The conversation is the SAME engine the old TUI used — only the render changed.
 */
export function useAgent(deps: AgentDeps): { send: (text: string, display?: string) => Promise<void> } {
  const convoRef = deps.convoRef;
  if (convoRef.current === null) {
    convoRef.current = createConversation(deps.setup.systemPrompt, convoConfig(deps));
  }

  const send = async (text: string, display?: string): Promise<void> => {
    const conv = convoRef.current;
    if (!conv) return;
    const ctrl = new AbortController();
    deps.interruptRef.current = ctrl;
    deps.replStateRef.current.turnIndex += 1;
    // Resolve a pasted/typed image-or-video PATH into an attachment AND consume
    // any pending images (/paste, /image, drag-drop) — the same shared step the
    // readline host runs. Without it, a pasted image path went out as blind text.
    const resolved = await resolveDroppedMedia(text, deps.replStateRef.current);
    text = resolved.text;
    const images = resolved.images;
    deps.dispatch({ t: "submit", text: display ?? text });
    deps.dispatch({ t: "turnStart" });
    try {
      await fireHooks(join(deps.repoRoot, ".vanta"), "UserPromptSubmit", { prompt: text }, { cwd: deps.repoRoot, promptProvider: deps.setup.provider });
      const outcome = await conv.send(text, images, ctrl.signal);
      await fireStopHook(join(deps.repoRoot, ".vanta"), { finalResponse: outcome.finalText, turnIndex: deps.replStateRef.current.turnIndex }, { cwd: deps.repoRoot, promptProvider: deps.setup.provider });
      await runTurnGates(deps);
    } catch (err) {
      await fireStopFailure(deps.repoRoot, { error: stopFailureType(err), errorDetails: errorDetails(err) }, { promptProvider: deps.setup.provider });
      deps.dispatch({ t: "note", text: `  ✗ ${(err as Error).message}` });
    } finally {
      deps.dispatch({ t: "turnEnd" });
      // No per-turn token dump in the transcript (Claude shows none) — context
      // usage lives in the status bar. No blind todo reload either: the panel
      // reflects only what the agent writes via the todo tool this session.
      deps.interruptRef.current = null;
    }
  };

  return { send };
}
