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
import { failBackgroundResponse, finishBackgroundResponse, isBackgroundResponseRunning } from "../repl/bg-response-cmd.js";
import { generatePromptSuggestions, promptSuggestionsEnabled } from "./prompt-suggestions.js";
import { maybeNotifyTurnComplete } from "../term/turn-complete-notify.js";
import { notify as osNotify } from "../term/notify.js";
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

type TurnScope = {
  /** Foreground turns started while another response is detached still render live. */
  forceLive?: boolean;
};

function liveDispatch(deps: AgentDeps, action: Action, scope?: TurnScope): void {
  if (scope?.forceLive || !isBackgroundResponseRunning(deps.replStateRef.current)) deps.dispatch(action);
}

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
  notifyTurnComplete?: typeof osNotify;
  windowFocused?: () => boolean | Promise<boolean>;
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
function convoConfig(deps: AgentDeps, scope?: TurnScope): Parameters<typeof createConversation>[1] {
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
    onThinking: (text) => liveDispatch(deps, { t: "thinking", text }, scope),
    onTextDelta: (d) => liveDispatch(deps, { t: "delta", d }, scope),
    onThinkingDelta: (d) => liveDispatch(deps, { t: "thinkingDelta", d }, scope),
    onCompacting: (active) => liveDispatch(deps, { t: "compacting", active }, scope),
    onToolCall: (name, args) => {
      const disp = toolDisplay(name, args);
      liveDispatch(deps, { t: "toolCall", name, verb: disp.verb, detail: disp.detail }, scope);
    },
    onToolResult: (name, ok, output, diff) => {
      const tokens = Math.round((output?.length ?? 0) / 4);
      liveDispatch(deps, { t: "toolResult", name, ok, errorLine: ok ? undefined : firstLine(output), summary: summarizeResult(output, name), diff, tokens }, scope);
      if (name === "todo") void refreshTodos(deps.dispatch); // reflect plan edits live
    },
    requestApproval: (action, reason, toolName) =>
      new Promise<boolean>((resolve) => deps.setPending({ action, reason, toolName, resolve })),
  };
}

async function runForegroundAfterTurn(deps: AgentDeps, userText: string, finalText: string, suggestionTurn: number): Promise<void> {
  if (finalText && promptSuggestionsEnabled(process.env)) {
    void generatePromptSuggestions({ userText, finalText, provider: deps.setup.provider }).then((suggestions) => {
      if (deps.replStateRef.current.turnIndex === suggestionTurn) deps.dispatch({ t: "promptSuggestions", suggestions });
    }).catch(() => {});
  }
  await maybeNotifyTurnComplete(
    { prompt: userText, finalText, env: process.env, dataDir: join(deps.repoRoot, ".vanta"), cwd: deps.repoRoot },
    { notify: deps.notifyTurnComplete, windowFocused: deps.windowFocused },
  );
}

function buildSend(deps: AgentDeps): (text: string, display?: string) => Promise<void> {
  return async (text: string, display?: string): Promise<void> => {
    const foregroundDuringBackground = isBackgroundResponseRunning(deps.replStateRef.current);
    if (foregroundDuringBackground) {
      deps.convoRef.current = createConversation(deps.setup.systemPrompt, convoConfig(deps, { forceLive: true }), { history: deps.convoRef.current?.messages ?? [] });
    }
    const conv = deps.convoRef.current;
    if (!conv) return;
    const ctrl = new AbortController();
    deps.interruptRef.current = ctrl;
    deps.replStateRef.current.turnIndex += 1;
    const turnBackgroundId = `bg-${deps.replStateRef.current.turnIndex}`;
    const isThisTurnDetached = (): boolean => !foregroundDuringBackground && deps.replStateRef.current.backgroundResponse?.id === turnBackgroundId;
    // Resolve a pasted/typed image-or-video PATH into an attachment AND consume
    // any pending images (/paste, /image, drag-drop) — the same shared step the
    // readline host runs. Without it, a pasted image path went out as blind text.
    const resolved = await resolveDroppedMedia(text, deps.replStateRef.current);
    text = resolved.text;
    const images = resolved.images;
    const userText = text;
    let finalText = "";
    const suggestionTurn = deps.replStateRef.current.turnIndex;
    deps.dispatch({ t: "submit", text: display ?? text });
    deps.dispatch({ t: "turnStart" });
    try {
      await fireHooks(join(deps.repoRoot, ".vanta"), "UserPromptSubmit", { prompt: text }, { cwd: deps.repoRoot, promptProvider: deps.setup.provider });
      const outcome = await conv.send(text, images, ctrl.signal);
      finalText = outcome.finalText;
      if (isThisTurnDetached()) finishBackgroundResponse(deps.replStateRef.current, outcome.finalText, new Date());
      else {
        await fireStopHook(join(deps.repoRoot, ".vanta"), { finalResponse: outcome.finalText, turnIndex: deps.replStateRef.current.turnIndex }, { cwd: deps.repoRoot, promptProvider: deps.setup.provider });
        await runTurnGates(deps);
      }
    } catch (err) {
      if (isThisTurnDetached()) failBackgroundResponse(deps.replStateRef.current, err instanceof Error ? err.message : String(err), new Date());
      else {
        await fireStopFailure(deps.repoRoot, { error: stopFailureType(err), errorDetails: errorDetails(err) }, { promptProvider: deps.setup.provider });
        deps.dispatch({ t: "note", text: `  ✗ ${(err as Error).message}` });
      }
    } finally {
      if (!isThisTurnDetached()) {
        deps.dispatch({ t: "turnEnd" });
        await runForegroundAfterTurn(deps, userText, finalText, suggestionTurn);
      }
      deps.interruptRef.current = null;
    }
  };
}

/**
 * Owns the Conversation and exposes `send`. All agent callbacks dispatch into the
 * reducer; requestApproval surfaces a Pending the App resolves from a keypress.
 * The conversation is the SAME engine the old TUI used — only the render changed.
 */
export function useAgent(deps: AgentDeps): { send: (text: string, display?: string) => Promise<void> } {
  if (deps.convoRef.current === null) {
    deps.convoRef.current = createConversation(deps.setup.systemPrompt, convoConfig(deps));
  }
  return { send: buildSend(deps) };
}
