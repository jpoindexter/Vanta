import { useEffect, useReducer, useRef, useState, type Dispatch, type ReactElement } from "react";
import { Box, Static, Text, useApp, useInput } from "inkr";
import { Banner } from "./banner.js";
import { EntryView } from "./transcript.js";
import { Composer } from "./composer.js";
import { TodoPanel } from "./todo-panel.js";
import { reduce, type Action } from "./reducer.js";
import { initialState, type Entry, type PendingTool } from "./types.js";
import { useAgent, type Pending } from "./use-agent.js";
import { useSlash } from "./use-slash.js";
import { useSubmit } from "./use-submit.js";
import { useOverlay, type OverlayView } from "./use-overlay.js";
import { OverlayList } from "./overlay-list.js";
import { CockpitPanel } from "./cockpit-panel.js";
import { HelpPanel } from "./help-panel.js";
import { StatusBar } from "./status-bar.js";
import { useBusyTick } from "./use-busy-tick.js";
import { busyLabel, contextPct } from "./busy.js";
import { listRepoFiles } from "./at.js";
import { newSessionId } from "../sessions/store.js";
import { estimateTokens } from "../tui/status-bar.js";
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
  const { send } = useAgent({ setup: props.setup, repoRoot: props.repoRoot, dispatch, setPending, interruptRef, convoRef, replStateRef });
  const { runSlash } = useSlash({ convoRef, replStateRef, setup: props.setup, repoRoot: props.repoRoot, dispatch, send, exit: app.exit });
  const { overlay, openOverlay, closeOverlay, selectRow } = useOverlay({ setup: props.setup, repoRoot: props.repoRoot, runSlash });
  const route = useSubmit({ runSlash, send, openOverlay, busy: state.busy, safety: props.setup.safety, repoRoot: props.repoRoot, dispatch });
  const onSubmit = (text: string): void => { setHistory((h) => [...h, text]); route(text); };
  const tick = useBusyTick(state.busy);

  useEffect(() => { void listRepoFiles(props.repoRoot).then(setFiles).catch(() => {}); }, [props.repoRoot]);
  useQueueDrain(state.busy, state.queued, dispatch, send);

  const provider = props.setup.provider; // mutated in place on a /model swap, so this stays current
  const est = estimateTokens(convoRef.current?.messages ?? [], state.streaming);

  useInput((input, key) => {
    if (key.ctrl && input === "c") {
      if (state.busy) interruptRef.current?.abort();
      else app.exit();
      return;
    }
    if (pending) {
      if (input === "a") pending.resolve(true), setPending(null);
      else if (input === "d" || key.escape) pending.resolve(false), setPending(null);
    }
  });

  const staticItems = buildStaticItems(provider.modelId(), props.repoRoot, state.entries);

  return (
    <Box flexDirection="column">
      <Static items={staticItems}>{(item) => <Box key={item.key}>{item.node}</Box>}</Static>
      <LiveRegion streaming={state.streaming} activeTools={state.activeTools} busy={state.busy} pending={pending} tick={tick} />
      {overlay ? null : <TodoPanel todos={state.todos} />}
      <BottomRegion overlay={overlay} pending={pending} files={files} history={history} onSubmit={onSubmit} onPaste={() => runSlash("/paste")} onSelect={selectRow} onClose={closeOverlay} />
      {pending ? null : <StatusBar model={provider.modelId()} ctxPct={contextPct(est, provider.contextWindow())} turns={replStateRef.current.turnIndex} busy={state.busy} queued={state.queued.length} />}
    </Box>
  );
}

/** Drain one queued message per turn once the agent is idle again. */
function useQueueDrain(busy: boolean, queued: string[], dispatch: Dispatch<Action>, send: (t: string) => void): void {
  useEffect(() => {
    if (!busy && queued.length > 0) { const next = queued[0]!; dispatch({ t: "dequeue" }); void send(next); }
  }, [busy, queued.length]); // eslint-disable-line react-hooks/exhaustive-deps
}

/** Banner + committed entries as <Static> items (banner scrolls into history too). */
function buildStaticItems(model: string, repoRoot: string, entries: Entry[]): Array<{ key: string; node: ReactElement }> {
  return [
    { key: "banner", node: <Banner model={model} cwd={repoRoot} kernel="127.0.0.1:7788" /> },
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
  if (pending) {
    return (
      <Box flexDirection="column" marginTop={1}>
        <Text color="yellow">⚠ approval — {pending.action}</Text>
        <Text dimColor>{pending.reason}</Text>
        <Text><Text color="green">[a]</Text>llow · <Text color="red">[d]</Text>eny</Text>
      </Box>
    );
  }
  if (!busy && !streaming) return null;
  const active = activeTools[activeTools.length - 1];
  const { frame, verb } = busyLabel(tick);
  const label = active ? `${active.verb}${active.detail ? ` ${active.detail}` : ""}` : verb;
  return (
    <Box flexDirection="column">
      {streaming ? <Box><Text color="cyan">⏺ </Text><Text>{streaming}</Text></Box> : null}
      {busy ? <Text color="cyan">{frame} <Text dimColor>{label}…</Text></Text> : null}
    </Box>
  );
}
