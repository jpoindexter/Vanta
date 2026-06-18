import { useEffect, useReducer, useRef, useState, type Dispatch, type ReactElement } from "react";
import { join } from "node:path";
import { Box, Static, useApp, useInput } from "ink";
import { Composer } from "./composer.js";
import { TodoPanel } from "./todo-panel.js";
import { reduce, type Action } from "./reducer.js";
import { initialState } from "./types.js";
import { useAgent, type Pending } from "./use-agent.js";
import { freshGateState, type GateState } from "../repl/post-turn-gates.js";
import { ApprovalPrompt } from "./approval-prompt.js";
import { useSlash } from "./use-slash.js";
import { useSubmit } from "./use-submit.js";
import { useOverlay, type OverlayView } from "./use-overlay.js";
import { OverlayList } from "./overlay-list.js";
import { CockpitPanel } from "./cockpit-panel.js";
import { HelpPanel } from "./help-panel.js";
import { LoopsPanel } from "./loops-panel.js";
import { ReviewPanel } from "./review-panel.js";
import { ContextPanel } from "./context-panel.js";
import { useBusyTick } from "./use-busy-tick.js";
import { contextPct } from "./busy.js";
import { handleFocusKey, isFocusable, type FocusTarget, type FocusTargetSpec } from "./focus.js";
import { PinnedRegion, resolveComposerAnchor, type ComposerAnchor } from "./pinned-region.js";
import { useViewportRows } from "./use-viewport-rows.js";
import { estimateCommittedRows } from "./layout-rows.js";
import { listRepoFiles } from "./at.js";
import { newSessionId } from "../sessions/store.js";
import { SLASH_COMMANDS } from "../repl/catalog.js";
import { estimateTokens } from "../term/tokens.js";
import { listSkills } from "../skills/store.js";
import { slugifySkillName } from "../store/home.js";
import { useSessionStatus } from "./use-session-status.js";
import { fireHooks } from "../hooks/shell-hooks.js";
import { startHookFileWatcher } from "../hooks/file-watch.js";
import { Footer, LiveRegion, buildStaticItems } from "./app-regions.js";
import { type Mode, cycleMode, useModeState, ModeLine } from "./mode-line.js";
import type { SlashMatch } from "./slash.js";
import type { OverlayRow } from "./overlays.js";
import type { Conversation } from "../agent.js";
import type { ReplState } from "../repl/types.js";
import type { RunSetup } from "../session.js";

export function App(props: { setup: RunSetup; repoRoot: string }): ReactElement {
  const app = useApp();
  const [state, dispatch] = useReducer(reduce, initialState);
  const [pending, setPending] = useState<Pending | null>(null);
  const interruptRef = useRef<AbortController | null>(null);
  const convoRef = useRef<Conversation | null>(null);
  const replStateRef = useRef<ReplState>({ sessionId: newSessionId(), started: new Date().toISOString(), turnIndex: 0, effortLevel: props.setup.effortLevel, activeGoal: null });
  const gatesRef = useRef<GateState>(freshGateState());
  const [files, setFiles] = useState<string[]>([]);
  const [history, setHistory] = useState<string[]>([]);
  const [focus, setFocus] = useState<FocusTarget>("composer");
  const [composerAnchor, setComposerAnchor] = useState<ComposerAnchor>(() => resolveComposerAnchor(process.env));
  const { send } = useAgent({ setup: props.setup, repoRoot: props.repoRoot, dispatch, setPending, interruptRef, convoRef, replStateRef, gatesRef });
  const { runSlash } = useSlash({ convoRef, replStateRef, setup: props.setup, repoRoot: props.repoRoot, dispatch, send, exit: app.exit, setComposerAnchor });
  const { overlay, openOverlay, closeOverlay, selectRow } = useOverlay({ setup: props.setup, repoRoot: props.repoRoot, runSlash, getContext: () => ctxSnapshot(props.setup, convoRef.current) });
  const route = useSubmit({ runSlash, send, openOverlay, busy: state.busy, safety: props.setup.safety, repoRoot: props.repoRoot, dispatch });
  const onSubmit = (text: string): void => { setHistory((h) => [...h, text]); route(text); };
  const tick = useBusyTick(state.busy);
  const skillMatches = useSkillMatches();
  useEffect(() => { void listRepoFiles(props.repoRoot).then(setFiles).catch(() => {}); }, [props.repoRoot]);
  useHookLifecycle(props.repoRoot, replStateRef.current.sessionId, props.setup);
  const { mcp, elapsed } = useSessionStatus(props.setup, replStateRef, dispatch);
  const { mode, cycle } = useModeState(pending, setPending, runSlash);
  useQueueDrain(state.busy, state.queued, dispatch, send);

  const provider = props.setup.provider;
  const est = estimateTokens(convoRef.current?.messages ?? [], state.streaming);
  const focusTargets = buildFocusTargets(pending, overlay);
  useFocusFallback(focus, focusTargets, pending ? "approval" : overlay?.kind ?? "composer", setFocus);
  useGlobalKeys({ busy: state.busy, pending, overlayOpen: overlay !== null, abort: () => interruptRef.current?.abort(), exit: app.exit, cycle, focus, focusTargets, setFocus });
  const staticItems = buildStaticItems(provider.modelId(), props.repoRoot, state.entries, { tools: props.setup.registry.schemas().length, cmds: SLASH_COMMANDS.length });
  const vp = useViewportRows();

  return (
    <Box flexDirection="column">
        <Static items={staticItems}>{(item) => <Box key={item.key}>{item.node}</Box>}</Static>
        <PinnedRegion enabled={composerAnchor === "bottom"} viewportRows={vp.rows} committedRows={estimateCommittedRows(state.entries, vp.cols)}>
          {pending && mode !== "auto"
            ? <ApprovalPrompt pending={pending} focusedTarget={focus} onFocusTargetChange={setFocus} onDone={() => setPending(null)} />
            : <LiveRegion streaming={state.streaming} activeTools={state.activeTools} busy={state.busy} tick={tick} />}
          {overlay ? null : <TodoPanel todos={state.todos} />}
          <BottomRegion focused={focus} overlay={overlay} pending={pending} mode={mode} files={files} history={history} skills={skillMatches} onSubmit={onSubmit} onPaste={() => runSlash("/paste")} onSelect={selectRow} onClose={closeOverlay} />
          {!pending && !overlay ? <Footer model={provider.modelId()} effortLevel={replStateRef.current.effortLevel ?? props.setup.effortLevel} ctxPct={contextPct(est, provider.contextWindow())} tokens={est} contextWindow={provider.contextWindow()} turns={replStateRef.current.turnIndex} busy={state.busy} queued={state.queued.length} goal={replStateRef.current.activeGoal} mcp={mcp} elapsed={elapsed} /> : null}
        </PinnedRegion>
    </Box>
  );
}

function ctxSnapshot(setup: RunSetup, convo: Conversation | null): { messages: { role: string; content?: string }[]; contextWindow: number } {
  return { messages: (convo?.messages ?? []) as { role: string; content?: string }[], contextWindow: setup.provider.contextWindow() };
}

type GlobalKey = { ctrl?: boolean; escape?: boolean; tab?: boolean; shift?: boolean };
type GlobalKeyDeps = {
  busy: boolean; pending: Pending | null; overlayOpen: boolean;
  abort: () => void; exit: () => void; cycle: () => void;
  focus: FocusTarget; focusTargets: FocusTargetSpec[]; setFocus: (target: FocusTarget) => void;
};

const escInterrupts = (key: GlobalKey, d: GlobalKeyDeps): boolean =>
  Boolean(key.escape) && d.busy && !d.pending && !d.overlayOpen;

function useGlobalKeys(deps: GlobalKeyDeps): void {
  useInput((input, key) => handleGlobalKey(input, key, deps));
}

function handleGlobalKey(input: string, key: GlobalKey, d: GlobalKeyDeps): void {
  if (key.ctrl && input === "c") return void (d.busy ? d.abort() : d.exit());
  if (handleFocusKey(key, { current: d.focus, targets: d.focusTargets, setFocus: d.setFocus, cycleMode: d.cycle })) return;
  if (escInterrupts(key, d)) return void d.abort();
}

function useFocusFallback(focus: FocusTarget, targets: FocusTargetSpec[], scope: string, setFocus: (t: FocusTarget) => void): void {
  useEffect(() => {
    if (!isFocusable(focus, targets)) setFocus(targets[0]?.id ?? "composer");
  }, [scope]); // eslint-disable-line react-hooks/exhaustive-deps
}

function buildFocusTargets(pending: Pending | null, overlay: OverlayView | null): FocusTargetSpec[] {
  if (pending) return ["approval-allow", "approval-always", "approval-deny", "approval-never"].map((id) => ({ id: id as FocusTarget }));
  if (overlay) return [{ id: overlay.kind === "list" ? "overlay-list" : "overlay-close" }];
  return [{ id: "composer" }];
}

function useSkillMatches(): SlashMatch[] {
  const [matches, setMatches] = useState<SlashMatch[]>([]);
  useEffect(() => {
    void listSkills(process.env).then((skills) =>
      setMatches(skills.map((s) => ({ name: slugifySkillName(s.meta.name), desc: s.meta.description ?? "" })))
    ).catch(() => {});
  }, []);
  return matches;
}

function useQueueDrain(busy: boolean, queued: string[], dispatch: Dispatch<Action>, send: (t: string) => void): void {
  useEffect(() => {
    if (!busy && queued.length > 0) { const next = queued[0]!; dispatch({ t: "dequeue" }); void send(next); }
  }, [busy, queued.length]); // eslint-disable-line react-hooks/exhaustive-deps
}

function BottomRegion(props: {
  focused: FocusTarget;
  overlay: OverlayView | null;
  pending: Pending | null;
  mode: Mode;
  files: string[];
  history: string[];
  skills: SlashMatch[];
  onSubmit: (text: string) => void;
  onPaste: () => void;
  onSelect: (row: OverlayRow) => void;
  onClose: () => void;
}): ReactElement | null {
  const { overlay } = props;
  if (props.pending) return null;
  if (overlay?.kind === "list") return <OverlayList focused={props.focused === "overlay-list"} title={overlay.title} rows={overlay.rows} onSelect={props.onSelect} onClose={props.onClose} />;
  if (overlay?.kind === "cockpit") return <CockpitPanel data={overlay.data} onClose={props.onClose} />;
  if (overlay?.kind === "loops") return <LoopsPanel loops={overlay.loops} onClose={props.onClose} />;
  if (overlay?.kind === "review") return <ReviewPanel files={overlay.files} cwd={overlay.cwd} onClose={props.onClose} />;
  if (overlay?.kind === "context") return <ContextPanel categories={overlay.categories} total={overlay.total} contextWindow={overlay.contextWindow} onClose={props.onClose} />;
  if (overlay?.kind === "help") return <HelpPanel onClose={props.onClose} />;
  return (
    <Box flexDirection="column">
      <ModeLine mode={props.mode} />
      <Composer focused={props.focused === "composer"} onSubmit={props.onSubmit} placeholder="Ask Vanta anything — /help for commands" files={props.files} history={props.history} skills={props.skills} onPaste={props.onPaste} />
    </Box>
  );
}

export { Footer } from "./app-regions.js";
export { ModeLine, cycleMode } from "./mode-line.js";

function useHookLifecycle(repoRoot: string, sessionId: string, setup: RunSetup): void {
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
