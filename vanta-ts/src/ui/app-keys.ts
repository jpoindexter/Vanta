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

// The App component's behavior hooks + pure key/focus helpers. Split from app.tsx
// so both stay under the size gate; app.tsx imports these and stays the wiring.

export function ctxSnapshot(setup: RunSetup, convo: Conversation | null): { messages: { role: string; content?: string }[]; contextWindow: number } {
  return { messages: (convo?.messages ?? []) as { role: string; content?: string }[], contextWindow: setup.provider.contextWindow() };
}

type GlobalKey = { ctrl?: boolean; escape?: boolean; tab?: boolean; shift?: boolean; leftArrow?: boolean; rightArrow?: boolean };
type GlobalKeyDeps = {
  busy: boolean; pending: Pending | null; overlayOpen: boolean;
  abort: () => void; exit: () => void; cycle: () => void;
  focus: FocusTarget; focusTargets: FocusTargetSpec[]; setFocus: (target: FocusTarget) => void;
  quickOpenOpen: boolean; openQuickOpen: () => void;
  /** Set only while a teammate tree is live; cycles focus between agents. */
  cycleAgent?: (dir: 1 | -1) => void;
};

const escInterrupts = (key: GlobalKey, d: GlobalKeyDeps): boolean =>
  Boolean(key.escape) && d.busy && !d.pending && !d.overlayOpen;

/** Ctrl+P opens the unified quick-open picker when nothing else owns input. */
const opensQuickOpen = (input: string, key: GlobalKey, d: GlobalKeyDeps): boolean =>
  Boolean(key.ctrl) && input === "p" && !d.quickOpenOpen && !d.pending && !d.overlayOpen;

/** Shift+←/→ cycles teammate-tree focus (only when cycleAgent is set). */
function cyclesAgent(key: GlobalKey, d: GlobalKeyDeps): boolean {
  if (!d.cycleAgent || !key.shift) return false;
  const dir = key.rightArrow ? 1 : key.leftArrow ? -1 : 0;
  if (dir === 0) return false;
  d.cycleAgent(dir);
  return true;
}

export function useGlobalKeys(deps: GlobalKeyDeps): void {
  useInput((input, key) => handleGlobalKey(input, key, deps));
}

function handleGlobalKey(input: string, key: GlobalKey, d: GlobalKeyDeps): void {
  if (key.ctrl && input === "c") return void (d.busy ? d.abort() : d.exit());
  if (opensQuickOpen(input, key, d)) return void d.openQuickOpen();
  if (cyclesAgent(key, d)) return;
  if (handleFocusKey(key, { current: d.focus, targets: d.focusTargets, setFocus: d.setFocus, cycleMode: d.cycle })) return;
  if (escInterrupts(key, d)) return void d.abort();
}

export function useFocusFallback(focus: FocusTarget, targets: FocusTargetSpec[], scope: string, setFocus: (t: FocusTarget) => void): void {
  useEffect(() => {
    if (!isFocusable(focus, targets)) setFocus(targets[0]?.id ?? "composer");
  }, [scope]); // eslint-disable-line react-hooks/exhaustive-deps
}

export function buildFocusTargets(pending: Pending | null, overlay: OverlayView | null): FocusTargetSpec[] {
  if (pending) return ["approval-allow", "approval-always", "approval-deny", "approval-never"].map((id) => ({ id: id as FocusTarget }));
  if (overlay) return [{ id: overlay.kind === "list" ? "overlay-list" : "overlay-close" }];
  return [{ id: "composer" }];
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
  ctx: { busy: boolean; pending: Pending | null; overlay: OverlayView | null; quickOpen: boolean },
): { selectedAgent: number; cycleAgent?: (dir: 1 | -1) => void } {
  const [selectedAgent, setSelectedAgent] = useState<number>(LEADER_INDEX);
  useEffect(() => { setSelectedAgent((i) => clampAgentIndex(i, count)); }, [count]);
  const live = ctx.busy && count >= 2 && !ctx.pending && ctx.overlay === null && !ctx.quickOpen;
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
