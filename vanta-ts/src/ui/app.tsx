import { useEffect, useReducer, useRef, useState, type ReactElement } from "react";
import { Box, Static, Text, useApp, useInput } from "inkr";
import { Banner } from "./banner.js";
import { EntryView } from "./transcript.js";
import { Composer } from "./composer.js";
import { reduce } from "./reducer.js";
import { initialState, type Entry } from "./types.js";
import { useAgent, type Pending } from "./use-agent.js";
import { useSlash } from "./use-slash.js";
import { useSubmit } from "./use-submit.js";
import { listRepoFiles } from "./at.js";
import { newSessionId } from "../sessions/store.js";
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
  const { send } = useAgent({ setup: props.setup, repoRoot: props.repoRoot, dispatch, setPending, interruptRef, convoRef, replStateRef });
  const { runSlash } = useSlash({ convoRef, replStateRef, setup: props.setup, repoRoot: props.repoRoot, dispatch, send, exit: app.exit });
  const onSubmit = useSubmit({ runSlash, send, busy: state.busy, safety: props.setup.safety, repoRoot: props.repoRoot, dispatch });

  useEffect(() => { void listRepoFiles(props.repoRoot).then(setFiles).catch(() => {}); }, [props.repoRoot]);

  useInput((input, key) => {
    if (key.ctrl && input === "c") {
      if (state.busy) interruptRef.current?.abort();
      else app.exit();
      return;
    }
    if (key.ctrl && input === "d") app.exit();
    if (pending) {
      if (input === "a") pending.resolve(true), setPending(null);
      else if (input === "d" || key.escape) pending.resolve(false), setPending(null);
    }
  });

  // Banner is the first Static item, so it scrolls into history like everything else.
  const staticItems: Array<{ key: string; node: ReactElement }> = [
    { key: "banner", node: <Banner model={props.setup.provider.modelId()} cwd={props.repoRoot} kernel="127.0.0.1:7788" /> },
    ...state.entries.map((e: Entry, i: number) => ({ key: `e${i}`, node: <EntryView entry={e} /> })),
  ];

  return (
    <Box flexDirection="column">
      <Static items={staticItems}>{(item) => <Box key={item.key}>{item.node}</Box>}</Static>
      <LiveRegion streaming={state.streaming} activeTool={state.activeTool} busy={state.busy} pending={pending} />
      {pending ? null : <Composer onSubmit={onSubmit} placeholder="Ask Vanta anything — /help for commands" files={files} />}
    </Box>
  );
}

/** The small dynamic tail: streaming text, active-tool spinner line, approval. */
function LiveRegion(props: { streaming: string; activeTool: string | null; busy: boolean; pending: Pending | null }): ReactElement | null {
  const { streaming, activeTool, busy, pending } = props;
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
  return (
    <Box flexDirection="column">
      {streaming ? <Box><Text color="cyan">⏺ </Text><Text>{streaming}</Text></Box> : null}
      {busy ? <Text dimColor> ○ {activeTool ?? "thinking"}…</Text> : null}
    </Box>
  );
}
