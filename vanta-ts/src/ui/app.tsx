import { useEffect, useReducer, useRef, useState, type Dispatch, type ReactElement } from "react";
import { Box, Static, Text, useApp, useInput } from "ink";
import { Banner } from "./banner.js";
import { EntryView } from "./transcript.js";
import { Composer } from "./composer.js";
import { TodoPanel } from "./todo-panel.js";
import { reduce, type Action } from "./reducer.js";
import { initialState, type Entry, type PendingTool } from "./types.js";
import { useAgent, type Pending } from "./use-agent.js";
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
import { StatusBar } from "./status-bar.js";
import { useBusyTick } from "./use-busy-tick.js";
import { busyLabel, contextPct, formatElapsed } from "./busy.js";
import { ThemeProvider, useTheme, resolveThemeByName, type Theme } from "./theme.js";
import { handleFocusKey, isFocusable, type FocusTarget, type FocusTargetSpec } from "./focus.js";
import { StreamPreview } from "./stream-view.js";
import { listRepoFiles } from "./at.js";
import { newSessionId } from "../sessions/store.js";
import { SLASH_COMMANDS } from "../repl/catalog.js";
import { estimateTokens } from "../term/tokens.js";
import { resolveTheme } from "../term/theme.js";
import { envForPermissionMode, resolvePermissionMode, type PermissionMode } from "../modes/permission-mode.js";
import { listSkills } from "../skills/store.js";
import { slugifySkillName } from "../store/home.js";
import type { SlashMatch } from "./slash.js";
import type { OverlayRow } from "./overlays.js";
import type { Conversation } from "../agent.js";
import type { ReplState } from "../repl/types.js";
import type { RunSetup } from "../session.js";
import type { EffortLevel } from "../types.js";

export function App(props: { setup: RunSetup; repoRoot: string }): ReactElement {
  const app = useApp();
  const [state, dispatch] = useReducer(reduce, initialState);
  const [pending, setPending] = useState<Pending | null>(null);
  const interruptRef = useRef<AbortController | null>(null);
  const convoRef = useRef<Conversation | null>(null);
  const replStateRef = useRef<ReplState>({ sessionId: newSessionId(), started: new Date().toISOString(), turnIndex: 0, effortLevel: props.setup.effortLevel });
  const [files, setFiles] = useState<string[]>([]);
  const [history, setHistory] = useState<string[]>([]);
  const [theme, setThemeState] = useState<Theme>(() => resolveTheme(process.env));
  const [focus, setFocus] = useState<FocusTarget>("composer");
  const setTheme = (name: string): void => setThemeState(resolveThemeByName(name));
  const { send } = useAgent({ setup: props.setup, repoRoot: props.repoRoot, dispatch, setPending, interruptRef, convoRef, replStateRef });
  const { runSlash } = useSlash({ convoRef, replStateRef, setup: props.setup, repoRoot: props.repoRoot, dispatch, send, exit: app.exit, setTheme });
  const { overlay, openOverlay, closeOverlay, selectRow } = useOverlay({ setup: props.setup, repoRoot: props.repoRoot, runSlash, getContext: () => ctxSnapshot(props.setup, convoRef.current) });
  const route = useSubmit({ runSlash, send, openOverlay, busy: state.busy, safety: props.setup.safety, repoRoot: props.repoRoot, dispatch });
  const onSubmit = (text: string): void => { setHistory((h) => [...h, text]); route(text); };
  const tick = useBusyTick(state.busy);
  const skillMatches = useSkillMatches();
  useEffect(() => { void listRepoFiles(props.repoRoot).then(setFiles).catch(() => {}); }, [props.repoRoot]);
  const { goal, mcp, elapsed } = useSessionStatus(props.setup, state.busy, replStateRef.current.started, dispatch);
  const { mode, cycle } = useModeState(pending, setPending, runSlash);
  useQueueDrain(state.busy, state.queued, dispatch, send);

  const provider = props.setup.provider; // mutated in place on a /model swap, so this stays current
  const est = estimateTokens(convoRef.current?.messages ?? [], state.streaming);
  const focusTargets = buildFocusTargets(pending, overlay);
  const focusScope = pending ? "approval" : overlay?.kind ?? "composer";
  useEffect(() => {
    if (!isFocusable(focus, focusTargets)) setFocus(focusTargets[0]?.id ?? "composer");
  }, [focusScope]); // eslint-disable-line react-hooks/exhaustive-deps

  useGlobalKeys({ busy: state.busy, pending, overlayOpen: overlay !== null, abort: () => interruptRef.current?.abort(), exit: app.exit, cycle, focus, focusTargets, setFocus });

  const staticItems = buildStaticItems(provider.modelId(), props.repoRoot, state.entries, { tools: props.setup.registry.schemas().length, cmds: SLASH_COMMANDS.length });

  return (
    <ThemeProvider theme={theme}>
      <Box flexDirection="column">
        <Static items={staticItems}>{(item) => <Box key={item.key}>{item.node}</Box>}</Static>
        {pending && mode !== "auto"
          ? <ApprovalPrompt pending={pending} focusedTarget={focus} onFocusTargetChange={setFocus} onDone={() => setPending(null)} />
          : <LiveRegion streaming={state.streaming} activeTools={state.activeTools} busy={state.busy} tick={tick} />}
        {overlay ? null : <TodoPanel todos={state.todos} />}
        <BottomRegion focused={focus} overlay={overlay} pending={pending} mode={mode} files={files} history={history} skills={skillMatches} onSubmit={onSubmit} onPaste={() => runSlash("/paste")} onSelect={selectRow} onClose={closeOverlay} />
        {!pending && !overlay ? <Footer model={provider.modelId()} effortLevel={replStateRef.current.effortLevel ?? props.setup.effortLevel} ctxPct={contextPct(est, provider.contextWindow())} tokens={est} contextWindow={provider.contextWindow()} turns={replStateRef.current.turnIndex} busy={state.busy} queued={state.queued.length} goal={goal} mcp={mcp} elapsed={elapsed} /> : null}
      </Box>
    </ThemeProvider>
  );
}

type Mode = PermissionMode;
const NEXT_MODE: Record<Mode, Mode> = { default: "acceptEdits", acceptEdits: "auto", auto: "default" };

export function cycleMode(mode: Mode, setMode: (m: Mode) => void, runSlash: (s: string) => void): void {
  const next = NEXT_MODE[mode];
  void runSlash;
  setMode(next);
}

function useAutoApprove(pending: Pending | null, mode: Mode, setPending: (p: Pending | null) => void): void {
  useEffect(() => {
    if (pending && mode === "auto") { pending.resolve(true); setPending(null); }
  }, [pending, mode]); // eslint-disable-line react-hooks/exhaustive-deps
}

function useModeState(pending: Pending | null, setPending: (p: Pending | null) => void, runSlash: (s: string) => void): { mode: Mode; cycle: () => void } {
  const [mode, setMode] = useState<Mode>(() => resolvePermissionMode(process.env));
  useAutoApprove(pending, mode, setPending);
  useEffect(() => { Object.assign(process.env, envForPermissionMode(mode)); }, [mode]);
  return { mode, cycle: () => cycleMode(mode, setMode, runSlash) };
}

export function ModeLine(props: { mode: Mode }): ReactElement | null {
  const t = useTheme();
  if (props.mode === "acceptEdits") return <Text color={t.warning} bold>EDITS <Text dimColor={t.dimText}>(shift+tab to cycle)</Text></Text>;
  if (props.mode === "auto") return <Text color={t.warning} bold>AUTO <Text dimColor={t.dimText}>(shift+tab to cycle)</Text></Text>;
  return null;
}

function ctxSnapshot(setup: RunSetup, convo: Conversation | null): { messages: { role: string; content?: string }[]; contextWindow: number } {
  return { messages: (convo?.messages ?? []) as { role: string; content?: string }[], contextWindow: setup.provider.contextWindow() };
}

function goalClip(s: string): string {
  const l = s.split("\n")[0] ?? "";
  return l.length > 88 ? `${l.slice(0, 87)}…` : l;
}

function Footer(props: { model: string; effortLevel: EffortLevel; ctxPct: number; tokens: number; contextWindow: number; turns: number; busy: boolean; queued: number; goal: string | null; mcp: boolean; elapsed: string }): ReactElement {
  const t = useTheme();
  return (
    <Box flexDirection="column">
      {props.goal ? <Text dimColor={t.dimText}><Text color={t.accent}>◇</Text> {goalClip(props.goal)}</Text> : null}
      <StatusBar model={props.model} effortLevel={props.effortLevel} ctxPct={props.ctxPct} tokens={props.tokens} contextWindow={props.contextWindow} turns={props.turns} busy={props.busy} queued={props.queued} elapsed={props.elapsed} mcp={props.mcp} />
      <Text dimColor={t.dimText}>  <Text color={t.accent}>/</Text> commands  ·  <Text color={t.accent}>@</Text> files  ·  <Text color={t.accent}>!</Text> shell  ·  <Text color={t.accent}>#</Text> memory</Text>
    </Box>
  );
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

function buildFocusTargets(pending: Pending | null, overlay: OverlayView | null): FocusTargetSpec[] {
  if (pending) return ["approval-allow", "approval-always", "approval-deny", "approval-never"].map((id) => ({ id: id as FocusTarget }));
  if (overlay) return [{ id: overlay.kind === "list" ? "overlay-list" : "overlay-close" }];
  return [{ id: "composer" }];
}

function useActiveGoal(safety: RunSetup["safety"], busy: boolean): string | null {
  const [goal, setGoal] = useState<string | null>(null);
  useEffect(() => {
    void safety.getGoals().then((gs) => setGoal(gs.find((g) => g.status === "active")?.text ?? null)).catch(() => {});
  }, [busy]); // eslint-disable-line react-hooks/exhaustive-deps
  return goal;
}

function useClock(): void {
  const [, setN] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setN((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);
}

function useMcpPresent(): boolean {
  const [present, setPresent] = useState(false);
  useEffect(() => {
    void import("../mcp/mount.js")
      .then(({ readMcpConfig }) => readMcpConfig(process.env))
      .then((cfg) => setPresent(Object.keys(cfg.servers ?? {}).length > 0))
      .catch(() => {});
  }, []);
  return present;
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

function useSessionStatus(setup: RunSetup, busy: boolean, startedIso: string, dispatch: Dispatch<Action>): { goal: string | null; mcp: boolean; elapsed: string } {
  const goal = useActiveGoal(setup.safety, busy);
  const mcp = useMcpPresent();
  useClock();
  useEffect(() => {
    if (process.env.VANTA_GOAL_RESUME === "auto") return;
    if (setup.ralphContinuity) dispatch({ t: "note", text: firstRalphNotice(setup.ralphContinuity) });
    void setup.safety.getGoals().then((gs) => {
      const g = gs.find((x) => x.status === "active");
      if (g) dispatch({ t: "note", text: `↻ Carried goal (paused): ${g.text.slice(0, 78)} — /goal resume to pick up · /goal clear to drop` });
    }).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return { goal, mcp, elapsed: formatElapsed(Date.now() - Date.parse(startedIso)) };
}

function firstRalphNotice(block: string): string {
  const goal = block.match(/^Goal: (.+)$/m)?.[1] ?? "carried work";
  const next = block.match(/^Next incomplete: (.+)$/m)?.[1] ?? "next item";
  return `↻ Ralph loop progress found: ${goal.slice(0, 60)} — ${next.slice(0, 60)} · /goal resume to continue · /goal drop to discard`;
}

function useQueueDrain(busy: boolean, queued: string[], dispatch: Dispatch<Action>, send: (t: string) => void): void {
  useEffect(() => {
    if (!busy && queued.length > 0) { const next = queued[0]!; dispatch({ t: "dequeue" }); void send(next); }
  }, [busy, queued.length]); // eslint-disable-line react-hooks/exhaustive-deps
}

function buildStaticItems(model: string, repoRoot: string, entries: Entry[], caps: { tools: number; cmds: number }): Array<{ key: string; node: ReactElement }> {
  return [
    { key: "banner", node: <Banner model={model} cwd={repoRoot} kernel="127.0.0.1:7788" tools={caps.tools} cmds={caps.cmds} /> },
    ...entries.map((e, i) => ({ key: `e${i}`, node: <EntryView entry={e} /> })),
  ];
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

function LiveRegion(props: { streaming: string; activeTools: PendingTool[]; busy: boolean; tick: number }): ReactElement | null {
  const { streaming, activeTools, busy, tick } = props;
  const theme = useTheme();
  if (!busy && !streaming) return null;
  const active = activeTools[activeTools.length - 1];
  const { frame, verb } = busyLabel(tick);
  const label = active ? `${active.verb}${active.detail ? ` ${active.detail}` : ""}` : verb;
  const secs = Math.round(tick * 0.15); // tick advances ~every 150ms
  return (
    <Box flexDirection="column">
      {streaming ? <StreamPreview text={streaming} /> : null}
      {busy && !streaming ? <Text color={theme.accent}>{frame} <Text dimColor={theme.dimText}>{label}… ({secs}s · esc to interrupt)</Text></Text> : null}
    </Box>
  );
}
