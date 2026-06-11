import { useEffect, useRef, type Dispatch } from "react";
import { join } from "node:path";
import { useInput } from "ink";
import { createConversation } from "../agent.js";
import { pruneVolatileSkills } from "../skills/volatile.js";
import { saveSession } from "../sessions/store.js";
import { notify, shouldNotify } from "./notify.js";
import { nudgeAfterTurn, researchGateAfterTurn, inhibitAfterTurn, setShiftAfterTurn, stallAfterTurn, scopeDeltaAfterTurn, antiSlopAfterText, sessionMemoryAfterTurn, type ResearchGateState, type InhibitState, type SetShiftState, type StallState, type ScopeDeltaState } from "../session.js";
import { estimateCostUsd, addTurnCost, formatTurnCost } from "../pricing.js";
import { buildModeHint } from "../repl/mode-detect.js";
import { maybeAutoHandoff } from "../repl/auto-handoff.js";
import { scoreComplexity, shouldSuggestPlanMode, buildComplexityNote } from "../repl/complexity-gate.js";
import { isTopicShift, buildTopicShiftNote } from "../repl/task-boundary.js";
import { getInProgressItems, buildClosureGateText } from "../repl/closure-gate.js";
import type { SafetyClient } from "../safety-client.js";
import type { Action } from "./app-reducer.js";
import type { ReplState } from "../repl-commands.js";
import type { Goal } from "../types.js";
import type { LLMProvider } from "../providers/interface.js";

type ConvoRef = ReturnType<typeof createConversation>;
type MutableRef<T> = React.MutableRefObject<T>;

export type UseAgentSendOptions = {
  dispatch: Dispatch<Action>;
  convoRef: MutableRef<ConvoRef | null>;
  replStateRef: MutableRef<ReplState>;
  busy: boolean;
  queued: string[];
  safety: SafetyClient;
  goals?: Goal[];
  repoRoot?: string;
  contextWindow?: number;
  provider?: LLMProvider;
};

type TurnRefs = {
  researchGateRef: MutableRef<ResearchGateState>;
  inhibitRef: MutableRef<InhibitState>;
  setShiftRef: MutableRef<SetShiftState>;
  stallRef: MutableRef<StallState>;
  scopeDeltaRef: MutableRef<ScopeDeltaState>;
  autoHandoffNotedRef: MutableRef<boolean>;
  turnStartRef: MutableRef<number>;
};

type TurnContext = {
  dispatch: Dispatch<Action>;
  convo: ConvoRef;
  replStateRef: MutableRef<ReplState>;
  safety: SafetyClient;
  repoRoot: string;
  contextWindow: number;
  provider?: LLMProvider;
};

type TurnOutcome = Awaited<ReturnType<ConvoRef["send"]>>;

type SendDeps = {
  dispatch: Dispatch<Action>;
  convoRef: MutableRef<ConvoRef | null>;
  replStateRef: MutableRef<ReplState>;
  abortRef: MutableRef<AbortController | null>;
  interruptedRef: MutableRef<boolean>;
  goals: Goal[];
  safety: SafetyClient;
  repoRoot: string;
  contextWindow: number;
  provider?: LLMProvider;
  refs: TurnRefs;
};

/** Dispatch pre-turn notes: complexity gate, topic-shift, closure-gate. */
function dispatchPreTurnNotes(
  text: string,
  convo: ConvoRef,
  goals: Goal[],
  dispatch: Dispatch<Action>,
): void {
  const complexityScore = scoreComplexity(text);
  if (shouldSuggestPlanMode(complexityScore, convo.messages, process.env)) {
    dispatch({ t: "note", text: buildComplexityNote(complexityScore) });
  }
  const activeGoal = goals.find((g) => g.status === "active") ?? null;
  if (isTopicShift(text, activeGoal, 0.15)) {
    dispatch({ t: "note", text: buildTopicShiftNote() });
    try {
      const inProgress = getInProgressItems(convo.messages);
      if (inProgress.length) dispatch({ t: "note", text: buildClosureGateText(inProgress) });
    } catch { /* best-effort */ }
  }
}

/** Cost footer, auto-handoff, notify, session save. */
function handleCostAndPersist(
  outcome: TurnOutcome,
  refs: Pick<TurnRefs, "autoHandoffNotedRef" | "turnStartRef">,
  ctx: TurnContext,
): void {
  const { dispatch, convo, replStateRef, safety, repoRoot, contextWindow } = ctx;
  if (outcome.usage) {
    const cost = estimateCostUsd(process.env.VANTA_MODEL ?? "", outcome.usage.inputTokens, outcome.usage.outputTokens);
    dispatch({ t: "note", text: formatTurnCost({ inputTokens: outcome.usage.inputTokens, outputTokens: outcome.usage.outputTokens, elapsedMs: Date.now() - refs.turnStartRef.current, cost, tokensSaved: outcome.tokensSaved }) });
    replStateRef.current.sessionCost = addTurnCost(replStateRef.current.sessionCost, process.env.VANTA_PROVIDER, cost, outcome.tokensSaved);
  }
  void maybeAutoHandoff({
    estTokens: outcome.usage?.inputTokens ?? Math.round(convo.messages.reduce((n, m) => n + (("content" in m ? m.content : "") ?? "").length, 0) / 4),
    contextWindow,
    messages: convo.messages,
    sessionId: replStateRef.current.sessionId,
    provider: process.env.VANTA_PROVIDER ?? "unknown",
    model: process.env.VANTA_MODEL ?? "",
    repoRoot,
    safety,
    now: new Date(),
  }).then((ah) => {
    if (ah.wrote && !refs.autoHandoffNotedRef.current) {
      dispatch({ t: "note", text: `↻ context filling up — saved a resume block (auto-reloads next launch)` });
      refs.autoHandoffNotedRef.current = true;
    }
  });
  if (shouldNotify(Date.now() - refs.turnStartRef.current)) notify({ title: "Vanta", message: "turn complete" });
  void saveSession(replStateRef.current.sessionId, convo.messages, { started: replStateRef.current.started, title: replStateRef.current.title }).catch(() => {});
}

/** ND post-turn gates + session memory distillation. */
function runNdGates(
  outcome: TurnOutcome,
  refs: Omit<TurnRefs, "autoHandoffNotedRef" | "turnStartRef">,
  ctx: TurnContext,
): void {
  const { dispatch, convo, replStateRef, safety, repoRoot, provider } = ctx;
  const { researchGateRef, inhibitRef, setShiftRef, stallRef, scopeDeltaRef } = refs;
  void antiSlopAfterText(outcome.finalText, (note) => dispatch({ t: "note", text: note }));
  void nudgeAfterTurn(replStateRef.current.turnIndex, safety, (note) => dispatch({ t: "note", text: note }));
  void researchGateAfterTurn(researchGateRef.current, convo.messages, { safety, onNote: (note) => dispatch({ t: "note", text: note }) }).then((s) => { researchGateRef.current = s; });
  void inhibitAfterTurn(inhibitRef.current, convo.messages, { safety, onNote: (note) => dispatch({ t: "note", text: note }) }).then((s) => { inhibitRef.current = s; });
  void setShiftAfterTurn(setShiftRef.current, convo.messages, (note) => dispatch({ t: "note", text: note })).then((s) => { setShiftRef.current = s; });
  void stallAfterTurn(stallRef.current, convo.messages, { safety, dataDir: join(repoRoot, ".vanta"), onNote: (note) => dispatch({ t: "note", text: note }) }).then((s) => { stallRef.current = s; });
  void scopeDeltaAfterTurn(scopeDeltaRef.current, convo.messages, (note) => dispatch({ t: "note", text: note })).then((s) => { scopeDeltaRef.current = s; });
  if (provider) {
    // Distil the running transcript into the session scratchpad and refresh the
    // live compaction injection. Forked, best-effort, silent.
    void sessionMemoryAfterTurn({ provider, dataDir: join(repoRoot, ".vanta"), transcript: convo.messages, toolIterations: outcome.toolIterations, turnIndex: replStateRef.current.turnIndex }).then((scratch) => { if (scratch) convo.setSessionMemory(scratch); });
  }
}

/** Full post-turn pipeline after convo.send() resolves. */
function handleTurnOutcome(outcome: TurnOutcome, refs: TurnRefs, ctx: TurnContext): void {
  ctx.dispatch({ t: "commit", finalText: outcome.finalText });
  pruneVolatileSkills(ctx.convo.messages);
  handleCostAndPersist(outcome, refs, ctx);
  runNdGates(outcome, refs, ctx);
}

/** Build the sendToAgent function from explicit deps (extracted from hook to keep useAgentSend under size gate). */
function buildSendToAgent(d: SendDeps): (text: string) => void {
  return (text: string): void => {
    d.dispatch({ t: "user", text });
    const convo = d.convoRef.current;
    if (!convo) return;
    dispatchPreTurnNotes(text, convo, d.goals, d.dispatch);
    d.replStateRef.current.turnIndex++;
    d.refs.turnStartRef.current = Date.now();
    const images = d.replStateRef.current.pendingImages;
    d.replStateRef.current.pendingImages = undefined;
    const ac = new AbortController();
    d.abortRef.current = ac;
    d.interruptedRef.current = false;
    // MODE-DETECT: prepend a one-line stance hint (display already shows clean text).
    const modeHint = process.env.VANTA_MODE_DETECT !== "0" ? buildModeHint(text) : null;
    const sendText = modeHint ? `${modeHint}\n\n${text}` : text;
    const turnCtx: TurnContext = { dispatch: d.dispatch, convo, replStateRef: d.replStateRef, safety: d.safety, repoRoot: d.repoRoot, contextWindow: d.contextWindow, provider: d.provider };
    void convo.send(sendText, images, ac.signal)
      .then((outcome) => { d.abortRef.current = null; handleTurnOutcome(outcome, d.refs, turnCtx); })
      .catch((err: unknown) => {
        d.abortRef.current = null;
        // A user interrupt already ended the turn — don't surface AbortError as generic "error:".
        if (d.interruptedRef.current) { d.interruptedRef.current = false; return; }
        d.dispatch({ t: "note", text: `error: ${err instanceof Error ? err.message : String(err)}` });
        d.dispatch({ t: "commit", finalText: "" });
      });
  };
}

export function useAgentSend(
  opts: UseAgentSendOptions,
): { sendToAgent: (text: string) => void; abortRef: MutableRef<AbortController | null> } {
  const { dispatch, convoRef, replStateRef, busy, queued, safety, goals = [], repoRoot = process.cwd(), contextWindow = 0, provider } = opts;
  const turnStartRef = useRef<number>(0);
  const autoHandoffNotedRef = useRef<boolean>(false);
  const abortRef = useRef<AbortController | null>(null);
  const interruptedRef = useRef<boolean>(false);
  const researchGateRef = useRef<ResearchGateState>({ consecutiveTurns: 0 });
  const inhibitRef = useRef<InhibitState>({ consecutiveCalls: 0 });
  const setShiftRef = useRef<SetShiftState>({ repeatingTool: null, consecutiveRuns: 0 });
  const stallRef = useRef<StallState>({ stalledTurns: 0 });
  const scopeDeltaRef = useRef<ScopeDeltaState>({ totalAnnotations: 0 });

  const turnRefs: TurnRefs = { researchGateRef, inhibitRef, setShiftRef, stallRef, scopeDeltaRef, autoHandoffNotedRef, turnStartRef };
  const sendToAgent = buildSendToAgent({ dispatch, convoRef, replStateRef, abortRef, interruptedRef, goals, safety, repoRoot, contextWindow, provider, refs: turnRefs });

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
        interruptedRef.current = true;
        abortRef.current.abort();
        dispatch({ t: "interrupted" });
      }
    },
    { isActive: busy },
  );

  return { sendToAgent, abortRef };
}
