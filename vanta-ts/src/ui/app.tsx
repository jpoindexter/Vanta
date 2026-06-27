import { useEffect, useReducer, useRef, useState, type ReactElement } from "react";
import { Box, Static, useApp } from "ink";
import { reduce } from "./reducer.js";
import { initialState } from "./types.js";
import { useAgent, type Pending } from "./use-agent.js";
import { freshGateState, type GateState } from "../repl/post-turn-gates.js";
import { ApprovalPrompt } from "./approval-prompt.js";
import { useSlash } from "./use-slash.js";
import { useSubmit } from "./use-submit.js";
import { useOverlay } from "./use-overlay.js";
import { useBusyTick } from "./use-busy-tick.js";
import { contextPct } from "./busy.js";
import { type FocusTarget } from "./focus.js";
import { PinnedRegion, resolveComposerAnchor, type ComposerAnchor } from "./pinned-region.js";
import { resolveVim } from "../repl/vim-cmd.js";
import { useViewportRows } from "./use-viewport-rows.js";
import { estimateCommittedRows } from "./layout-rows.js";
import { listRepoFiles } from "./at.js";
import { newSessionId } from "../sessions/store.js";
import { SLASH_COMMANDS } from "../repl/catalog.js";
import { estimateTokens } from "../term/tokens.js";
import { useSessionStatus } from "./use-session-status.js";
import { useFooterRich } from "./use-rich-status.js";
import { useSubagentProgress } from "./use-subagent-progress.js";
import { Footer, LiveRegion, buildStaticItems } from "./app-regions.js";
import { useModeState } from "./mode-line.js";
import { LiveBody } from "./app-body.js";
import {
  ctxSnapshot, useSkillMatches, useQueueDrain, useTeammateFocus,
  useFocusFallback, buildFocusTargets, useGlobalKeys, useHookLifecycle,
} from "./app-keys.js";
import { useSlackChannels } from "./use-slack-channels.js";
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
  const [vimEnabled, setVim] = useState<boolean>(() => resolveVim(process.env));
  const [quickOpen, setQuickOpen] = useState(false);
  const { send } = useAgent({ setup: props.setup, repoRoot: props.repoRoot, dispatch, setPending, interruptRef, convoRef, replStateRef, gatesRef });
  const { runSlash } = useSlash({ convoRef, replStateRef, setup: props.setup, repoRoot: props.repoRoot, dispatch, send, exit: app.exit, setComposerAnchor, setVim });
  const { overlay, openOverlay, closeOverlay, selectRow } = useOverlay({ setup: props.setup, repoRoot: props.repoRoot, runSlash, getContext: () => ctxSnapshot(props.setup, convoRef.current) });
  const route = useSubmit({ runSlash, send, openOverlay, busy: state.busy, safety: props.setup.safety, repoRoot: props.repoRoot, dispatch });
  const onSubmit = (text: string): void => { setHistory((h) => [...h, text]); route(text); };
  const tick = useBusyTick(state.busy);
  const skillMatches = useSkillMatches(); const channels = useSlackChannels();
  useEffect(() => { void listRepoFiles(props.repoRoot).then(setFiles).catch(() => {}); }, [props.repoRoot]);
  useHookLifecycle(props.repoRoot, replStateRef.current.sessionId, props.setup);
  const { mcp, elapsed } = useSessionStatus(props.setup, replStateRef, dispatch);
  const agents = useSubagentProgress();
  const { mode, cycle } = useModeState(pending, setPending, runSlash);
  useQueueDrain(state.busy, state.queued, dispatch, send);
  const provider = props.setup.provider;
  const est = estimateTokens(convoRef.current?.messages ?? [], state.streaming);
  const focusTargets = buildFocusTargets(pending, overlay);
  useFocusFallback(focus, focusTargets, pending ? "approval" : overlay?.kind ?? "composer", setFocus);
  const teammate = useTeammateFocus(agents.length, { busy: state.busy, pending, overlay, quickOpen });
  useGlobalKeys({ busy: state.busy, pending, overlayOpen: overlay !== null, abort: () => interruptRef.current?.abort(), exit: app.exit, cycle, focus, focusTargets, setFocus, quickOpenOpen: quickOpen, openQuickOpen: () => setQuickOpen(true), cycleAgent: teammate.cycleAgent });
  const staticItems = buildStaticItems(provider.modelId(), props.repoRoot, state.entries, { tools: props.setup.registry.schemas().length, cmds: SLASH_COMMANDS.length });
  const vp = useViewportRows();
  const rich = useFooterRich({ repoRoot: props.repoRoot, sessionId: replStateRef.current.sessionId, sessionName: replStateRef.current.title, vimEnabled });

  return (
    <Box flexDirection="column">
        <Static items={staticItems}>{(item) => <Box key={item.key}>{item.node}</Box>}</Static>
        <PinnedRegion enabled={composerAnchor === "bottom"} viewportRows={vp.rows} committedRows={estimateCommittedRows(state.entries, vp.cols)}>
          {pending && mode !== "auto"
            ? <ApprovalPrompt pending={pending} focusedTarget={focus} onFocusTargetChange={setFocus} onDone={() => setPending(null)} />
            : <LiveRegion streaming={state.streaming} activeTools={state.activeTools} busy={state.busy} tick={tick} liveThinking={state.liveThinking} agents={agents} selectedAgent={teammate.selectedAgent} leaderTokens={est} />}
          <LiveBody quickOpen={quickOpen} overlay={overlay} pending={pending} mode={mode} focus={focus} todos={state.todos} files={files} history={history} skills={skillMatches} channels={channels} vim={vimEnabled} onQuickActivate={(c) => { setQuickOpen(false); runSlash(c); }} onQuickClose={() => setQuickOpen(false)} onSubmit={onSubmit} onPaste={() => runSlash("/paste")} onSelect={selectRow} onClose={closeOverlay} />
          {!pending && !overlay ? <Footer model={provider.modelId()} effortLevel={replStateRef.current.effortLevel ?? props.setup.effortLevel} ctxPct={contextPct(est, provider.contextWindow())} tokens={est} contextWindow={provider.contextWindow()} turns={replStateRef.current.turnIndex} busy={state.busy} queued={state.queued.length} goal={replStateRef.current.activeGoal} mcp={mcp} elapsed={elapsed} agents={agents} rich={rich} /> : null}
        </PinnedRegion>
    </Box>
  );
}

export { Footer } from "./app-regions.js";
export { ModeLine, cycleMode } from "./mode-line.js";
