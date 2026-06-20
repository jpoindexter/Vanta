// GATEWAY-SESSION-MANAGER — pure decision core for concurrent inbound messages.
// When a run is already in flight, an inbound message is routed to one of
// three actions by a leading command; the default (no command) is to QUEUE.
// `interrupt`/`steer` are advisory decisions the caller acts on; this module
// owns only the classification + the running/queue state machine, no I/O.

import type { InboundMessage } from "./platforms/base.js";

/** What to do with an inbound message relative to an in-flight run. */
export type InboundClass = "interrupt" | "steer" | "queue";

/** The action a router resolves for a single inbound message. */
export type RouteAction = InboundClass | "run-now";

/** Minimal session state: is a run in flight, and what is waiting behind it. */
export type SessionState = {
  running: boolean;
  queue: InboundMessage[];
};

/** A leading-command rule: a literal prefix → the class it forces. */
type CommandRule = { prefix: string; cls: Exclude<InboundClass, "queue"> };

// Table-driven so the precedence is data, not branches. Longest/most-specific
// prefixes first; matched case-insensitively on the trimmed leading token.
const COMMAND_RULES: readonly CommandRule[] = [
  { prefix: "/interrupt", cls: "interrupt" },
  { prefix: "/stop", cls: "interrupt" },
  { prefix: "!", cls: "interrupt" },
  { prefix: "/steer", cls: "steer" },
  { prefix: ">>", cls: "steer" },
] as const;

function matchesCommand(text: string, prefix: string): boolean {
  const t = text.trimStart().toLowerCase();
  if (!t.startsWith(prefix)) return false;
  // Symbol prefixes (!, >>) need no boundary; word prefixes (/stop) must be a
  // whole token so "/stopwatch" is not read as "/stop".
  const isWord = /[a-z]$/.test(prefix);
  if (!isWord) return true;
  const next = t.charAt(prefix.length);
  return next === "" || next === " " || next === "\n";
}

/** Classify an inbound message by its leading command. Default → "queue". Pure. */
export function classifyInbound(text: string): InboundClass {
  for (const rule of COMMAND_RULES) {
    if (matchesCommand(text, rule.prefix)) return rule.cls;
  }
  return "queue";
}

/** Initial empty session state. */
export function initialState(): SessionState {
  return { running: false, queue: [] };
}

/**
 * Route one inbound message against the current state. Pure reducer — returns
 * the next state and the action the caller should take. Idle → run-now (and the
 * state flips to running). Busy → the leading command decides: interrupt/steer
 * are surfaced to the caller; everything else is queued FIFO (the default).
 */
export function routeInbound(
  state: SessionState,
  msg: InboundMessage,
): { state: SessionState; action: RouteAction } {
  if (!state.running) {
    return { state: { ...state, running: true }, action: "run-now" };
  }
  const cls = classifyInbound(msg.text);
  if (cls === "queue") {
    return { state: { ...state, queue: [...state.queue, msg] }, action: "queue" };
  }
  // interrupt/steer: the caller acts on the live run; nothing is queued here.
  return { state, action: cls };
}

/** Mark the in-flight run as finished without dequeuing. Pure. */
export function markFinished(state: SessionState): SessionState {
  return { ...state, running: false };
}

/**
 * Pop the next queued message FIFO when idle, marking the session running again.
 * Returns the message to run (or undefined if the queue is empty / a run is
 * already in flight) and the next state. Pure — the caller performs the run.
 */
export function takeNext(state: SessionState): { state: SessionState; msg?: InboundMessage } {
  if (state.running || state.queue.length === 0) return { state };
  const [next, ...rest] = state.queue;
  // next is defined here: length > 0 guaranteed above (strict-null guard).
  return { state: { running: true, queue: rest }, msg: next! };
}
