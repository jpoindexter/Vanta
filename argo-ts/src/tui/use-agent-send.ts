import { useEffect, useRef, type Dispatch } from "react";
import { useInput } from "ink";
import { createConversation } from "../agent.js";
import { pruneVolatileSkills } from "../skills/volatile.js";
import { saveSession } from "../sessions/store.js";
import { notify, shouldNotify } from "./notify.js";
import { nudgeAfterTurn, researchGateAfterTurn, type ResearchGateState } from "../session.js";
import { scoreComplexity, shouldSuggestPlanMode, buildComplexityNote } from "../repl/complexity-gate.js";
import { isTopicShift, buildTopicShiftNote } from "../repl/task-boundary.js";
import type { SafetyClient } from "../safety-client.js";
import type { Action } from "./app-reducer.js";
import type { ReplState } from "../repl-commands.js";
import type { Goal } from "../types.js";

type ConvoRef = ReturnType<typeof createConversation>;
type MutableRef<T> = React.MutableRefObject<T>;

export function useAgentSend(
  dispatch: Dispatch<Action>,
  convoRef: MutableRef<ConvoRef | null>,
  replStateRef: MutableRef<ReplState>,
  busy: boolean,
  queued: string[],
  safety: SafetyClient,
  goals: Goal[] = [],
): { sendToAgent: (text: string) => void; abortRef: MutableRef<AbortController | null> } {
  const turnStartRef = useRef<number>(0);
  const abortRef = useRef<AbortController | null>(null);
  const researchGateRef = useRef<ResearchGateState>({ consecutiveTurns: 0 });

  const sendToAgent = (text: string): void => {
    dispatch({ t: "user", text });
    const convo = convoRef.current;
    if (!convo) return;
    const complexityScore = scoreComplexity(text);
    if (shouldSuggestPlanMode(complexityScore, convo.messages, process.env)) {
      dispatch({ t: "note", text: buildComplexityNote(complexityScore) });
    }
    const activeGoal = goals.find((g) => g.status === "active") ?? null;
    if (isTopicShift(text, activeGoal, 0.15)) {
      dispatch({ t: "note", text: buildTopicShiftNote() });
    }
    replStateRef.current.turnIndex++;
    turnStartRef.current = Date.now();
    const images = replStateRef.current.pendingImages;
    replStateRef.current.pendingImages = undefined;
    const ac = new AbortController();
    abortRef.current = ac;
    void convo
      .send(text, images, ac.signal)
      .then((outcome) => {
        abortRef.current = null;
        dispatch({ t: "commit", finalText: outcome.finalText });
        pruneVolatileSkills(convo.messages);
        if (outcome.usage) {
          dispatch({ t: "note", text: `· ${outcome.usage.inputTokens.toLocaleString()} in / ${outcome.usage.outputTokens.toLocaleString()} out tokens` });
        }
        if (shouldNotify(Date.now() - turnStartRef.current)) notify({ title: "Argo", message: "turn complete" });
        void saveSession(replStateRef.current.sessionId, convo.messages, { started: replStateRef.current.started, title: replStateRef.current.title }).catch(() => {});
        void nudgeAfterTurn(replStateRef.current.turnIndex, safety, (note) => dispatch({ t: "note", text: note }));
        void researchGateAfterTurn(
          researchGateRef.current,
          convo.messages,
          safety,
          (note) => dispatch({ t: "note", text: note }),
        ).then((s) => { researchGateRef.current = s; });
      })
      .catch((err: unknown) => {
        abortRef.current = null;
        dispatch({ t: "note", text: `error: ${err instanceof Error ? err.message : String(err)}` });
        dispatch({ t: "commit", finalText: "" });
      });
  };

  const sendRef = useRef(sendToAgent);
  sendRef.current = sendToAgent;
  useEffect(() => {
    if (!busy && queued.length > 0) {
      const next = queued[0]!;
      dispatch({ t: "dequeue" });
      sendRef.current(next);
    }
  }, [busy, queued, dispatch]);

  useInput(
    (_in, key) => {
      if (key.escape && busy && abortRef.current) {
        abortRef.current.abort();
        dispatch({ t: "note", text: "· interrupted" });
      }
    },
    { isActive: busy },
  );

  return { sendToAgent, abortRef };
}
