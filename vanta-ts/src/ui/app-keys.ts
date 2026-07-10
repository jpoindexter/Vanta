import { useEffect, useState, type Dispatch } from "react";
import { join } from "node:path";
import { useInput } from "ink";
import { type Pending } from "./use-agent.js";
import { type Action } from "./reducer.js";
import { type OverlayView } from "./use-overlay.js";
import { handleFocusKey, isFocusable, type FocusTarget, type FocusTargetSpec } from "./focus.js";
import { nextAgentIndex, prevAgentIndex, clampAgentIndex, LEADER_INDEX } from "./teammate-tree.js";
import { listSkills } from "../skills/store.js";
import { slugifySkillName } from "../store/home.js";
import type { SlashMatch } from "./slash.js";
import { fireHooks } from "../hooks/shell-hooks.js";
import { startHookFileWatcher } from "../hooks/file-watch.js";
import type { Conversation } from "../agent.js";
import type { RunSetup } from "../session.js";
import type { ReplState } from "../repl/types.js";
import type { Message } from "../types.js";
import { DEFAULT_BINDINGS, GLOBAL_ACTIONS, eventToChord, watchKeybindings } from "./keybindings.js";
import type { KeyBinding } from "./keybinding-warnings.js";
import { resolveChordInput, type ChordResolveResult } from "./chord-bindings.js";
import { actionForChordInContexts } from "./keybinding-contexts.js";

// The App component's behavior hooks + pure key/focus helpers. Split from app.tsx
// so both stay under the size gate; app.tsx imports these and stays the wiring.

export function ctxSnapshot(setup: RunSetup, convo: Conversation | null, state?: ReplState): { messages: Message[]; contextWindow: number; sessionId?: string; title?: string } {
  return {
    messages: (convo?.messages ?? []) as Message[],
    contextWindow: setup.provider.contextWindow(),
    sessionId: state?.sessionId,
    title: state?.title,
  };
}

type GlobalKey = { ctrl?: boolean; escape?: boolean; tab?: boolean; shift?: boolean; leftArrow?: boolean; rightArrow?: boolean; upArrow?: boolean; downArrow?: boolean };
type GlobalKeyDeps = {
  busy: boolean; pending: Pending | null; overlayOpen: boolean;
  abort: () => void; exit: () => void; cycle: () => void;
  focus: FocusTarget; focusTargets: FocusTargetSpec[]; setFocus: (target: FocusTarget) => void;
  quickOpenOpen: boolean; openQuickOpen: () => void;
  globalSearchOpen: boolean; openGlobalSearch: () => void;
  messageActionsOpen: boolean; openMessageActions: () => void;
  backgroundResponseAvailable: boolean; toggleBackgroundResponse: () => void;
  /** Set only while a teammate tree is live; cycles focus between agents. */
  cycleAgent?: (dir: 1 | -1) => void;
  /** Transcript text selection owns Shift+arrows / Ctrl+C only while useful. */
  transcriptSelectionKey?: (input: string, key: GlobalKey) => boolean;
  /** KEYBINDING-CUSTOMIZATION: resolved bindings (defaults + user overrides).
   * Absent → DEFAULT_BINDINGS, so behavior is identical without a config file. */
  bindings?: KeyBinding[];
  chordPending?: string | null;
  setChordPending?: (pending: string | null) => void;
  onChordState?: (text: string) => void;
  keyContexts?: readonly string[];
};

export function useGlobalKeys(deps: GlobalKeyDeps): void {
  const [chordPending, setChordPending] = useState<string | null>(null);
  useInput((input, key) => handleGlobalKey(input, key, { ...deps, chordPending, setChordPending }));
}

/** KEYBINDING-CUSTOMIZATION — load the resolved bindings once (defaults until
 * ~/.vanta/keybindings.json is read); re-mount picks up an edited file. */
export function useKeybindings(): KeyBinding[] {
  const [bindings, setBindings] = useState<KeyBinding[]>(DEFAULT_BINDINGS);
  useEffect(() => {
    void import("./keybindings.js").then((m) => m.loadKeybindings()).then(setBindings).catch(() => {});
    return watchKeybindings(setBindings);
  }, []);
  return bindings;
}

// KEYBINDING-CUSTOMIZATION — dispatch is now config-driven: an event → its
// canonical chord → the bound action → the handler (with the same guards as
// before). Custom chords in ~/.vanta/keybindings.json therefore take effect on
// the live TUI. Focus keys (tab/shift-tab) stay in handleFocusKey.
export function handleGlobalKey(input: string, key: GlobalKey, d: GlobalKeyDeps): void {
  if (d.transcriptSelectionKey?.(input, key)) return;
  const chord = eventToChord(input, key as GlobalKey & { alt?: boolean; meta?: boolean; upArrow?: boolean; downArrow?: boolean });
  const resolved = resolveGlobalAction(chord, d);
  if (resolved.handled) return;
  const action = resolved.action;
  if (dispatchGlobalAction(action, d)) return;
  if (handleFocusKey(key, { current: d.focus, targets: d.focusTargets, setFocus: d.setFocus, cycleMode: d.cycle })) return;
}

function resolveGlobalAction(chord: string | null, d: GlobalKeyDeps): { handled: boolean; action: string | null } {
  if (!chord) return { handled: false, action: null };
  const bindings = d.bindings ?? DEFAULT_BINDINGS;
  const result = resolveChordInput(bindings, chord, d.chordPending, d.keyContexts ?? ["global"]);
  return applyChordResult(result, chord, bindings, d);
}

function applyChordResult(
  result: ChordResolveResult,
  chord: string,
  bindings: KeyBinding[],
  d: GlobalKeyDeps,
): { handled: boolean; action: string | null } {
  if (result.kind === "chord_started") return noteChordState(result.pending, result.message, d);
  if (result.kind === "chord_cancelled") return noteChordState(null, result.message, d);
  if (result.kind === "match") {
    d.setChordPending?.(null);
    return { handled: false, action: result.action };
  }
  return { handled: false, action: actionForChordInContexts(bindings, chord, d.keyContexts ?? ["global"]) };
}

function noteChordState(pending: string | null, message: string, d: GlobalKeyDeps): { handled: true; action: null } {
  d.setChordPending?.(pending);
  d.onChordState?.(message);
  return { handled: true, action: null };
}

// action → {guard, run}. `notBlocked` = no pending/overlay owns input. Keeping
// this a table holds dispatchGlobalAction flat (one lookup, not a guard chain).
const notBlocked = (d: GlobalKeyDeps): boolean => !d.quickOpenOpen && !d.globalSearchOpen && !d.messageActionsOpen && !d.pending && !d.overlayOpen;
const GLOBAL_HANDLERS: Record<string, { guard: (d: GlobalKeyDeps) => boolean; run: (d: GlobalKeyDeps) => void }> = {
  [GLOBAL_ACTIONS.exitOrAbort]: { guard: () => true, run: (d) => void (d.busy ? d.abort() : d.exit()) },
  [GLOBAL_ACTIONS.quickOpen]: { guard: notBlocked, run: (d) => d.openQuickOpen() },
  [GLOBAL_ACTIONS.globalSearch]: { guard: notBlocked, run: (d) => d.openGlobalSearch() },
  [GLOBAL_ACTIONS.messageActions]: { guard: notBlocked, run: (d) => d.openMessageActions() },
  [GLOBAL_ACTIONS.backgroundResponse]: { guard: (d) => notBlocked(d) && (d.busy || d.backgroundResponseAvailable), run: (d) => d.toggleBackgroundResponse() },
  [GLOBAL_ACTIONS.cycleAgentNext]: { guard: (d) => Boolean(d.cycleAgent), run: (d) => d.cycleAgent?.(1) },
  [GLOBAL_ACTIONS.cycleAgentPrev]: { guard: (d) => Boolean(d.cycleAgent), run: (d) => d.cycleAgent?.(-1) },
  [GLOBAL_ACTIONS.interrupt]: { guard: (d) => d.busy && !d.pending && !d.overlayOpen, run: (d) => d.abort() },
};

/** Run the bound global action if its guard permits; true when handled. */
function dispatchGlobalAction(action: string | null, d: GlobalKeyDeps): boolean {
  const h = action ? GLOBAL_HANDLERS[action] : undefined;
  if (!h || !h.guard(d)) return false;
  h.run(d);
  return true;
}

export function useFocusFallback(focus: FocusTarget, targets: FocusTargetSpec[], scope: string, setFocus: (t: FocusTarget) => void): void {
  useEffect(() => {
    if (!isFocusable(focus, targets)) setFocus(targets[0]?.id ?? "composer");
  }, [scope]); // eslint-disable-line react-hooks/exhaustive-deps
}

export function buildFocusTargets(pending: Pending | null, overlay: OverlayView | null, promptSuggestions = false): FocusTargetSpec[] {
  if (pending) return ["approval-allow", "approval-always", "approval-deny", "approval-never"].map((id) => ({ id: id as FocusTarget }));
  if (overlay) return [{ id: overlay.kind === "list" ? "overlay-list" : "overlay-close" }];
  return promptSuggestions ? [{ id: "composer" }, { id: "prompt-suggestions" }] : [{ id: "composer" }];
}

export function useSkillMatches(): SlashMatch[] {
  const [matches, setMatches] = useState<SlashMatch[]>([]);
  useEffect(() => {
    void listSkills(process.env).then((skills) =>
      setMatches(skills.map((s) => ({ name: slugifySkillName(s.meta.name), desc: s.meta.description ?? "" })))
    ).catch(() => {});
  }, []);
  return matches;
}

export function useQueueDrain(busy: boolean, queued: string[], dispatch: Dispatch<Action>, send: (t: string) => void): void {
  useEffect(() => {
    if (!busy && queued.length > 0) { const next = queued[0]!; dispatch({ t: "dequeue" }); void send(next); }
  }, [busy, queued.length]); // eslint-disable-line react-hooks/exhaustive-deps
}

/** Owns teammate-tree focus: the selected agent index, a clamp when the running
 * count shrinks, and a Shift+←/→ cycle that is live only while a tree is shown
 * (≥2 agents, busy, no dialog owning input). Returns undefined cycleAgent
 * otherwise so the global-key handler ignores the arrows. */
export function useTeammateFocus(
  count: number,
  ctx: { busy: boolean; pending: Pending | null; overlay: OverlayView | null; quickOpen: boolean; globalSearch?: boolean },
): { selectedAgent: number; cycleAgent?: (dir: 1 | -1) => void } {
  const [selectedAgent, setSelectedAgent] = useState<number>(LEADER_INDEX);
  useEffect(() => { setSelectedAgent((i) => clampAgentIndex(i, count)); }, [count]);
  const live = ctx.busy && count >= 2 && !ctx.pending && ctx.overlay === null && !ctx.quickOpen && !ctx.globalSearch;
  const cycleAgent = live
    ? (dir: 1 | -1): void => setSelectedAgent((i) => (dir > 0 ? nextAgentIndex(i, count) : prevAgentIndex(i, count)))
    : undefined;
  return { selectedAgent, cycleAgent };
}

export function useHookLifecycle(repoRoot: string, sessionId: string, setup: RunSetup): void {
  useEffect(() => {
    const dataDir = join(repoRoot, ".vanta");
    void fireHooks(dataDir, "SessionStart", { sessionId, source: "startup" }, { cwd: repoRoot, matcherValue: "startup", promptProvider: setup.provider });
    let closeWatcher: (() => void) | undefined;
    void startHookFileWatcher(repoRoot, { dataDir, promptProvider: setup.provider }).then((close) => { closeWatcher = close; });
    return () => {
      closeWatcher?.();
      void fireHooks(dataDir, "Stop", { sessionId }, { cwd: repoRoot, promptProvider: setup.provider });
      void fireHooks(dataDir, "SessionEnd", { sessionId, reason: "prompt_input_exit" }, { cwd: repoRoot, matcherValue: "prompt_input_exit", promptProvider: setup.provider });
    };
  }, [repoRoot, sessionId, setup.provider]);
}
