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
import { StatusBar } from "./status-bar.js";
import { useBusyTick } from "./use-busy-tick.js";
import { busyLabel, contextPct, formatElapsed } from "./busy.js";
import { ThemeProvider, useTheme, resolveThemeByName, type Theme } from "./theme.js";
import { StreamPreview } from "./stream-view.js";
import { listRepoFiles } from "./at.js";
import { newSessionId } from "../sessions/store.js";
import { SLASH_COMMANDS } from "../repl/catalog.js";
import { estimateTokens } from "../term/tokens.js";
import { resolveTheme } from "../term/theme.js";
import type { OverlayRow } from "./overlays.js";
import type { Conversation } from "../agent.js";
import type { ReplState } from "../repl/types.js";
import type { RunSetup } from "../session.js";

// The Claude-method App. <Static> commits finished history to native scrollback
// (selection/scroll/copy free, zero ghosting); only the live region below redraws.
// No AlternateScreen, no ScrollBox, no mouse capture, no virtual-history math.

export function App(props: { setup: RunSetup; repoRoot: string }): ReactElement {
  const app = useApp();
  const [state, dispatch] = useReducer(reduce, initialState);
  const [pending, setPending] = useState<Pending | null>(null);
  const interruptRef = useRef<AbortController | null>(null);
  const convoRef = useRef<Conversation | null>(null);
  const replStateRef = useRef<ReplState>({ sessionId: newSessionId(), started: new Date().toISOString(), turnIndex: 0 });
  const [files, setFiles] = useState<string[]>([]);
  const [history, setHistory] = useState<string[]>([]);
  const [theme, setThemeState] = useState<Theme>(() => resolveTheme(process.env));
  const setTheme = (name: string): void => setThemeState(resolveThemeByName(name));
  const { send } = useAgent({ setup: props.setup, repoRoot: props.repoRoot, dispatch, setPending, interruptRef, convoRef, replStateRef });
  const { runSlash } = useSlash({ convoRef, replStateRef, setup: props.setup, repoRoot: props.repoRoot, dispatch, send, exit: app.exit, setTheme });
  const { overlay, openOverlay, closeOverlay, selectRow } = useOverlay({ setup: props.setup, repoRoot: props.repoRoot, runSlash });
  const route = useSubmit({ runSlash, send, openOverlay, busy: state.busy, safety: props.setup.safety, repoRoot: props.repoRoot, dispatch });
  const onSubmit = (text: string): void => { setHistory((h) => [...h, text]); route(text); };
  const tick = useBusyTick(state.busy);

  useEffect(() => { void listRepoFiles(props.repoRoot).then(setFiles).catch(() => {}); }, [props.repoRoot]);
  const { goal, mcp, elapsed } = useSessionStatus(props.setup.safety, state.busy, replStateRef.current.started);
  const { mode, cycle } = useModeState(pending, setPending, runSlash);
  useQueueDrain(state.busy, state.queued, dispatch, send);

  const provider = props.setup.provider; // mutated in place on a /model swap, so this stays current
  const est = estimateTokens(convoRef.current?.messages ?? [], state.streaming);

  useInput((input, key) =>
    handleGlobalKey(input, key, {
      busy: state.busy, pending, overlayOpen: overlay !== null,
      abort: () => interruptRef.current?.abort(), exit: app.exit, cycle,
    }),
  );

  const staticItems = buildStaticItems(provider.modelId(), props.repoRoot, state.entries, { tools: props.setup.registry.schemas().length, cmds: SLASH_COMMANDS.length });

  return (
    <ThemeProvider theme={theme}>
      <Box flexDirection="column">
        <Static items={staticItems}>{(item) => <Box key={item.key}>{item.node}</Box>}</Static>
        {pending && mode !== "auto"
          ? <ApprovalPrompt pending={pending} onDone={() => setPending(null)} />
          : <LiveRegion streaming={state.streaming} activeTools={state.activeTools} busy={state.busy} tick={tick} />}
        {overlay ? null : <TodoPanel todos={state.todos} />}
        <BottomRegion overlay={overlay} pending={pending} mode={mode} files={files} history={history} onSubmit={onSubmit} onPaste={() => runSlash("/paste")} onSelect={selectRow} onClose={closeOverlay} />
        {!pending && !overlay ? <Footer model={provider.modelId()} ctxPct={contextPct(est, provider.contextWindow())} tokens={est} contextWindow={provider.contextWindow()} turns={replStateRef.current.turnIndex} busy={state.busy} queued={state.queued.length} goal={goal} mcp={mcp} elapsed={elapsed} /> : null}
      </Box>
    </ThemeProvider>
  );
}

// Shift+Tab mode cycle (Claude-parity): normal → auto-accept → plan → normal.
type Mode = "normal" | "auto" | "plan";
const NEXT_MODE: Record<Mode, Mode> = { normal: "auto", auto: "plan", plan: "normal" };

/** Advance the cycle. Entering/leaving plan reuses the real /planmode enforcement
 * (write + shell tools blocked until /planmode approve); auto is TUI-local. */
export function cycleMode(mode: Mode, setMode: (m: Mode) => void, runSlash: (s: string) => void): void {
  const next = NEXT_MODE[mode];
  if (next === "plan") runSlash("/planmode on");
  else if (mode === "plan") runSlash("/planmode off");
  setMode(next);
}

/** Auto-approve kernel Asks while in auto mode. Safe by construction: the kernel
 * refuses the Block tier upstream, so only Ask-tier actions ever reach a prompt. */
function useAutoApprove(pending: Pending | null, mode: Mode, setPending: (p: Pending | null) => void): void {
  useEffect(() => {
    if (pending && mode === "auto") { pending.resolve(true); setPending(null); }
  }, [pending, mode]); // eslint-disable-line react-hooks/exhaustive-deps
}

/** Mode state + the Shift+Tab cycle action, with auto-approve wired in. */
function useModeState(pending: Pending | null, setPending: (p: Pending | null) => void, runSlash: (s: string) => void): { mode: Mode; cycle: () => void } {
  const [mode, setMode] = useState<Mode>("normal");
  useAutoApprove(pending, mode, setPending);
  return { mode, cycle: () => cycleMode(mode, setMode, runSlash) };
}

/** The Shift+Tab mode indicator above the composer (hidden in normal mode). */
export function ModeLine(props: { mode: Mode }): ReactElement | null {
  const t = useTheme();
  if (props.mode === "auto") return <Text color={t.warning} bold>▶▶ auto-accept on <Text dimColor={t.dimText}>(shift+tab to cycle)</Text></Text>;
  if (props.mode === "plan") return <Text color={t.accent} bold>⏸ plan mode on <Text dimColor={t.dimText}>(shift+tab to cycle)</Text></Text>;
  return null;
}

/** Clip the active goal to one line so the footer never wraps (which would ghost). */
function goalClip(s: string): string {
  const l = s.split("\n")[0] ?? "";
  return l.length > 88 ? `${l.slice(0, 87)}…` : l;
}

/** Active-goal line (when set) + status line + the dim prefix-affordance line. */
function Footer(props: { model: string; ctxPct: number; tokens: number; contextWindow: number; turns: number; busy: boolean; queued: number; goal: string | null; mcp: boolean; elapsed: string }): ReactElement {
  const t = useTheme();
  return (
    <Box flexDirection="column">
      {props.goal ? <Text dimColor={t.dimText}><Text color={t.accent}>◇</Text> {goalClip(props.goal)}</Text> : null}
      <StatusBar model={props.model} ctxPct={props.ctxPct} tokens={props.tokens} contextWindow={props.contextWindow} turns={props.turns} busy={props.busy} queued={props.queued} elapsed={props.elapsed} mcp={props.mcp} />
      <Text dimColor={t.dimText}>  <Text color={t.accent}>/</Text> commands  ·  <Text color={t.accent}>@</Text> files  ·  <Text color={t.accent}>!</Text> shell  ·  <Text color={t.accent}>#</Text> memory</Text>
    </Box>
  );
}

type GlobalKey = { ctrl?: boolean; escape?: boolean; tab?: boolean; shift?: boolean };
type GlobalKeyDeps = {
  busy: boolean; pending: Pending | null; overlayOpen: boolean;
  abort: () => void; exit: () => void; cycle: () => void;
};

const escInterrupts = (key: GlobalKey, d: GlobalKeyDeps): boolean =>
  Boolean(key.escape) && d.busy && !d.pending && !d.overlayOpen;

/** App-level keys: ^C interrupt/exit, Shift+Tab cycles the autonomy mode, Esc
 * interrupts a running turn. An open approval/overlay owns its own keys. */
function handleGlobalKey(input: string, key: GlobalKey, d: GlobalKeyDeps): void {
  if (key.ctrl && input === "c") return void (d.busy ? d.abort() : d.exit());
  if (key.tab && key.shift && !d.pending && !d.overlayOpen) return void d.cycle();
  if (escInterrupts(key, d)) return void d.abort();
}

/** Read the kernel's active goal on mount + when a turn settles (cheap goals.tsv
 * read), so the footer shows what Vanta is working toward. */
function useActiveGoal(safety: RunSetup["safety"], busy: boolean): string | null {
  const [goal, setGoal] = useState<string | null>(null);
  useEffect(() => {
    void safety.getGoals().then((gs) => setGoal(gs.find((g) => g.status === "active")?.text ?? null)).catch(() => {});
  }, [busy]); // eslint-disable-line react-hooks/exhaustive-deps
  return goal;
}

/** Re-render once per second so the live session timer stays current even when
 * idle (Ink only repaints on change; without this the clock would freeze). */
function useClock(): void {
  const [, setN] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setN((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);
}

/** Are any MCP servers configured? One-shot read at mount → the MCP ✓ chip. */
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

/** The footer's live status: active goal + MCP presence + a 1 Hz session timer. */
function useSessionStatus(safety: RunSetup["safety"], busy: boolean, startedIso: string): { goal: string | null; mcp: boolean; elapsed: string } {
  const goal = useActiveGoal(safety, busy);
  const mcp = useMcpPresent();
  useClock();
  return { goal, mcp, elapsed: formatElapsed(Date.now() - Date.parse(startedIso)) };
}

/** Drain one queued message per turn once the agent is idle again. */
function useQueueDrain(busy: boolean, queued: string[], dispatch: Dispatch<Action>, send: (t: string) => void): void {
  useEffect(() => {
    if (!busy && queued.length > 0) { const next = queued[0]!; dispatch({ t: "dequeue" }); void send(next); }
  }, [busy, queued.length]); // eslint-disable-line react-hooks/exhaustive-deps
}

/** Banner + committed entries as <Static> items (banner scrolls into history too). */
function buildStaticItems(model: string, repoRoot: string, entries: Entry[], caps: { tools: number; cmds: number }): Array<{ key: string; node: ReactElement }> {
  return [
    { key: "banner", node: <Banner model={model} cwd={repoRoot} kernel="127.0.0.1:7788" tools={caps.tools} cmds={caps.cmds} /> },
    ...entries.map((e, i) => ({ key: `e${i}`, node: <EntryView entry={e} /> })),
  ];
}

/** Below the live region: an open overlay owns the keys, else the composer.
 * An active approval (pending) suppresses both — its keys live in App. */
function BottomRegion(props: {
  overlay: OverlayView | null;
  pending: Pending | null;
  mode: Mode;
  files: string[];
  history: string[];
  onSubmit: (text: string) => void;
  onPaste: () => void;
  onSelect: (row: OverlayRow) => void;
  onClose: () => void;
}): ReactElement | null {
  const { overlay } = props;
  if (props.pending) return null;
  if (overlay?.kind === "list") return <OverlayList title={overlay.title} rows={overlay.rows} onSelect={props.onSelect} onClose={props.onClose} />;
  if (overlay?.kind === "cockpit") return <CockpitPanel data={overlay.data} onClose={props.onClose} />;
  if (overlay?.kind === "loops") return <LoopsPanel loops={overlay.loops} onClose={props.onClose} />;
  if (overlay?.kind === "review") return <ReviewPanel files={overlay.files} cwd={overlay.cwd} onClose={props.onClose} />;
  if (overlay?.kind === "help") return <HelpPanel onClose={props.onClose} />;
  return (
    <Box flexDirection="column">
      <ModeLine mode={props.mode} />
      <Composer onSubmit={props.onSubmit} placeholder="Ask Vanta anything — /help for commands" files={props.files} history={props.history} onPaste={props.onPaste} />
    </Box>
  );
}

/** The small dynamic tail: streaming text, in-flight tool line(s). */
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
