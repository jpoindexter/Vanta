import { useEffect, useReducer, useRef, useState, type Dispatch, type ReactElement } from "react";
import { Box, Static, Text, useApp, useInput } from "ink";
import { Banner } from "./banner.js";
import { EntryView } from "./transcript.js";
import { Composer } from "./composer.js";
import { TodoPanel } from "./todo-panel.js";
import { reduce, type Action } from "./reducer.js";
import { initialState, type Entry, type PendingTool } from "./types.js";
import { useAgent, type Pending } from "./use-agent.js";
import { grantAlways } from "./grant.js";
import { useSlash } from "./use-slash.js";
import { useSubmit } from "./use-submit.js";
import { useOverlay, type OverlayView } from "./use-overlay.js";
import { OverlayList } from "./overlay-list.js";
import { CockpitPanel } from "./cockpit-panel.js";
import { HelpPanel } from "./help-panel.js";
import { StatusBar } from "./status-bar.js";
import { useBusyTick } from "./use-busy-tick.js";
import { busyLabel, contextPct } from "./busy.js";
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
  useQueueDrain(state.busy, state.queued, dispatch, send);

  const provider = props.setup.provider; // mutated in place on a /model swap, so this stays current
  const est = estimateTokens(convoRef.current?.messages ?? [], state.streaming);

  useInput((input, key) =>
    handleGlobalKey(input, key, {
      busy: state.busy, pending, overlayOpen: overlay !== null,
      abort: () => interruptRef.current?.abort(), exit: app.exit, setPending,
    }),
  );

  const staticItems = buildStaticItems(provider.modelId(), props.repoRoot, state.entries, { tools: props.setup.registry.schemas().length, cmds: SLASH_COMMANDS.length });

  return (
    <ThemeProvider theme={theme}>
      <Box flexDirection="column">
        <Static items={staticItems}>{(item) => <Box key={item.key}>{item.node}</Box>}</Static>
        <LiveRegion streaming={state.streaming} activeTools={state.activeTools} busy={state.busy} pending={pending} tick={tick} />
        {overlay ? null : <TodoPanel todos={state.todos} />}
        <BottomRegion overlay={overlay} pending={pending} files={files} history={history} onSubmit={onSubmit} onPaste={() => runSlash("/paste")} onSelect={selectRow} onClose={closeOverlay} />
        {!pending && !overlay ? <Footer model={provider.modelId()} ctxPct={contextPct(est, provider.contextWindow())} tokens={est} contextWindow={provider.contextWindow()} turns={replStateRef.current.turnIndex} busy={state.busy} queued={state.queued.length} /> : null}
      </Box>
    </ThemeProvider>
  );
}

/** Status line + the dim prefix-affordance line beneath it. */
function Footer(props: { model: string; ctxPct: number; tokens: number; contextWindow: number; turns: number; busy: boolean; queued: number }): ReactElement {
  const t = useTheme();
  return (
    <Box flexDirection="column">
      <StatusBar model={props.model} ctxPct={props.ctxPct} tokens={props.tokens} contextWindow={props.contextWindow} turns={props.turns} busy={props.busy} queued={props.queued} />
      <Text dimColor={t.dimText}>  <Text color={t.accent}>/</Text> commands  ·  <Text color={t.accent}>@</Text> files  ·  <Text color={t.accent}>!</Text> shell  ·  <Text color={t.accent}>#</Text> memory</Text>
    </Box>
  );
}

type GlobalKey = { ctrl?: boolean; escape?: boolean };
type GlobalKeyDeps = {
  busy: boolean; pending: Pending | null; overlayOpen: boolean;
  abort: () => void; exit: () => void; setPending: (p: Pending | null) => void;
};

const escInterrupts = (key: GlobalKey, d: GlobalKeyDeps): boolean =>
  Boolean(key.escape) && d.busy && !d.pending && !d.overlayOpen;

function resolveApproval(input: string, key: GlobalKey, p: Pending, setPending: (p: Pending | null) => void): void {
  if (input === "a") { p.resolve(true); setPending(null); }
  else if (input === "A") { void grantAlways(p.toolName).catch(() => {}); p.resolve(true); setPending(null); }
  else if (input === "d" || key.escape) { p.resolve(false); setPending(null); }
}

/** App-level keys: ^C interrupt/exit, Esc interrupt a running turn, a/d resolve an
 * approval. Overlays/approvals own Esc when open, so Esc-interrupt is suppressed then. */
function handleGlobalKey(input: string, key: GlobalKey, d: GlobalKeyDeps): void {
  if (key.ctrl && input === "c") return void (d.busy ? d.abort() : d.exit());
  if (escInterrupts(key, d)) return void d.abort();
  if (d.pending) resolveApproval(input, key, d.pending, d.setPending);
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
  if (overlay?.kind === "help") return <HelpPanel onClose={props.onClose} />;
  return <Composer onSubmit={props.onSubmit} placeholder="Ask Vanta anything — /help for commands" files={props.files} history={props.history} onPaste={props.onPaste} />;
}

/** The small dynamic tail: streaming text, in-flight tool line(s), approval. */
function LiveRegion(props: { streaming: string; activeTools: PendingTool[]; busy: boolean; pending: Pending | null; tick: number }): ReactElement | null {
  const { streaming, activeTools, busy, pending, tick } = props;
  const theme = useTheme();
  if (pending) {
    return (
      <Box borderStyle="round" borderColor={theme.warning} flexDirection="column" paddingX={1} marginTop={1}>
        <Text color={theme.warning} bold>⚠ Approval needed</Text>
        <Text color={theme.primary}>{pending.action}</Text>
        {pending.reason ? <Text dimColor={theme.dimText}>{pending.reason}</Text> : null}
        <Text>
          <Text color={theme.success}>[a]</Text> allow once  ·  <Text color={theme.success}>[A]</Text> always allow  ·  <Text color={theme.error}>[d]</Text> deny <Text dimColor={theme.dimText}>(esc)</Text>
        </Text>
      </Box>
    );
  }
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
