import { useEffect, useRef, type Dispatch } from "react";
import { join } from "node:path";
import { useInput } from "ink";
import { createConversation } from "../agent.js";
import { pruneVolatileSkills } from "../skills/volatile.js";
import { saveSession } from "../sessions/store.js";
import { notify, shouldNotify } from "./notify.js";
import { nudgeAfterTurn, researchGateAfterTurn, inhibitAfterTurn, setShiftAfterTurn, stallAfterTurn, scopeDeltaAfterTurn, type ResearchGateState, type InhibitState, type SetShiftState, type StallState, type ScopeDeltaState } from "../session.js";
import { estimateCostUsd, addTurnCost, formatTurnCost } from "../pricing.js";
import { scoreComplexity, shouldSuggestPlanMode, buildComplexityNote } from "../repl/complexity-gate.js";
import { isTopicShift, buildTopicShiftNote } from "../repl/task-boundary.js";
import { getInProgressItems, buildClosureGateText } from "../repl/closure-gate.js";
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
  repoRoot = process.cwd(),
): { sendToAgent: (text: string) => void; abortRef: MutableRef<AbortController | null> } {
  const turnStartRef = useRef<number>(0);
  const abortRef = useRef<AbortController | null>(null);
  const researchGateRef = useRef<ResearchGateState>({ consecutiveTurns: 0 });
  const inhibitRef = useRef<InhibitState>({ consecutiveCalls: 0 });
  const setShiftRef = useRef<SetShiftState>({ repeatingTool: null, consecutiveRuns: 0 });
  const stallRef = useRef<StallState>({ stalledTurns: 0 });
  const scopeDeltaRef = useRef<ScopeDeltaState>({ totalAnnotations: 0 });

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
      try {
        const convo = convoRef.current;
        if (convo) {
          const inProgress = getInProgressItems(convo.messages);
          if (inProgress.length) dispatch({ t: "note", text: buildClosureGateText(inProgress) });
        }
      } catch { /* best-effort */ }
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
          // COST-VISIBLE: tokens + latency + cost; accumulate the session split on ReplState.
          const cost = estimateCostUsd(process.env.VANTA_MODEL ?? "", outcome.usage.inputTokens, outcome.usage.outputTokens);
          dispatch({ t: "note", text: formatTurnCost(outcome.usage.inputTokens, outcome.usage.outputTokens, Date.now() - turnStartRef.current, cost) });
          replStateRef.current.sessionCost = addTurnCost(replStateRef.current.sessionCost, process.env.VANTA_PROVIDER, cost);
        }
        if (shouldNotify(Date.now() - turnStartRef.current)) notify({ title: "Vanta", message: "turn complete" });
        void saveSession(replStateRef.current.sessionId, convo.messages, { started: replStateRef.current.started, title: replStateRef.current.title }).catch(() => {});
        void nudgeAfterTurn(replStateRef.current.turnIndex, safety, (note) => dispatch({ t: "note", text: note }));
        void researchGateAfterTurn(
          researchGateRef.current,
          convo.messages,
          safety,
          (note) => dispatch({ t: "note", text: note }),
        ).then((s) => { researchGateRef.current = s; });
        void inhibitAfterTurn(
          inhibitRef.current,
          convo.messages,
          safety,
          (note) => dispatch({ t: "note", text: note }),
        ).then((s) => { inhibitRef.current = s; });
        void setShiftAfterTurn(
          setShiftRef.current,
          convo.messages,
          (note) => dispatch({ t: "note", text: note }),
        ).then((s) => { setShiftRef.current = s; });
        void stallAfterTurn(
          stallRef.current,
          convo.messages,
          safety,
          join(repoRoot, ".vanta"),
          (note) => dispatch({ t: "note", text: note }),
        ).then((s) => { stallRef.current = s; });
        void scopeDeltaAfterTurn(
          scopeDeltaRef.current,
          convo.messages,
          (note) => dispatch({ t: "note", text: note }),
        ).then((s) => { scopeDeltaRef.current = s; });
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
