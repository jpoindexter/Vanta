import { useEffect, useReducer, useRef, useState, type ReactElement } from "react";
import { Box, Static, Text, useApp } from "ink";
import { Composer } from "./composer.js";
import { spinnerFrames } from "./spinners.js";
import { notify } from "./notify.js";
import { createConversation, type Conversation } from "../agent.js";
import { newSessionId } from "../sessions/store.js";
import { SLASH_COMMANDS, type ReplState } from "../repl-commands.js";
import { PROVIDER_CATALOG, type ProviderEntry } from "../providers/catalog.js";
import { gatherBannerData, type BannerData } from "./banner.js";
import { StatusBar, estimateTokens } from "./status-bar.js";
import { SessionsPicker } from "./sessions-picker.js";
import { ModelPicker } from "./model-picker.js";
import { ApprovalPrompt } from "./approval.js";
import { EntryRow, Palette, type Entry } from "./transcript.js";
import { INLINE_MAX } from "./tool-result.js";
import { useOverlays } from "./use-overlays.js";
import { useApproval } from "./use-approval.js";
import { type ApprovalMode } from "./approval-mode.js";
import { activeAtRef, listRepoFiles } from "./at-context.js";
import { HelpOverlay } from "./help-overlay.js";
import { resolveTheme } from "./theme.js";
import { getRiskTier, formatRiskLabel } from "./command-risk.js";
import { fuzzyFilter } from "./fuzzy.js";
import type { VimMode } from "./composer.js";
import { useAgentSend } from "./use-agent-send.js";
import { reduce, type State, type Action } from "./app-reducer.js";
import { VirtualTranscript } from "./virtual-transcript.js";
import { AltFrame } from "./alt-frame.js";
import { useResizeRedraw, useTermSize } from "./use-term-size.js";
import type { LLMProvider } from "../providers/interface.js";
import type { RunSetup } from "../session.js";
import { useSubmit } from "./use-submit.js";
import { useKeybindings } from "./use-keybindings.js";
import { buildConvoConfig } from "./conversation-config.js";

// Re-export for test compat — app.test.tsx imports these from "./app".
export { reduce, type State, type Action };

/** Picker availability: keyless backends + any provider whose API key is set. */
const hasKey = (entry: ProviderEntry): boolean => entry.envVar === null || !!process.env[entry.envVar];

const SPINNER = spinnerFrames();
const THEME = resolveTheme(process.env);
const VIM_ENABLED = !!process.env.VANTA_VIM;
// Reserve rows for: composer(3) + status(1) + padding(2) + streaming(2) + safety margin(2).
const CHROME_ROWS = 10;

// Virtual list: alt-screen mode (virtual viewport replaces <Static>) is passed
// as a prop, NOT read from process.env at module load — the .env is loaded at
// runtime (cli.ts main → loadEnv), well after this module's top-level evaluates,
// so a module-const read would always be false. launch.tsx reads it correctly.
export function App(props: { setup: RunSetup; repoRoot: string; altScreen?: boolean }): ReactElement {
  const { setup, repoRoot } = props;
  const ALT_SCREEN = props.altScreen ?? false;
  const app = useApp();
  const { rows: termRows, cols } = useTermSize();
  const redrawNonce = useResizeRedraw(ALT_SCREEN);
  const [state, dispatch] = useReducer(reduce, { entries: [] as Entry[], streaming: "", busy: false, status: "idle", queued: [], expanded: false, viewOffset: 0 });
  const [input, setInput] = useState("");
  const [inputHistory, setInputHistory] = useState<string[]>([]);
  const [atFiles, setAtFiles] = useState<string[]>([]);
  const [frame, setFrame] = useState(0);
  const [sel, setSel] = useState(0);
  const [banner, setBanner] = useState<BannerData | null>(null);
  const [activeProvider, setActiveProvider] = useState<LLMProvider>(setup.provider);
  const convoRef = useRef<Conversation | null>(null);
  const replStateRef = useRef<ReplState>({ sessionId: newSessionId(), started: new Date().toISOString(), turnIndex: 0 });
  const [mode, setMode] = useState<ApprovalMode>("review");
  const modeRef = useRef<ApprovalMode>("review");
  const [showHelp, setShowHelp] = useState(false);
  const [vimMode, setVimMode] = useState<VimMode>("insert");
  const [editMode, setEditMode] = useState({ active: false, messageIndex: -1 });
  const { pending, requestApproval, chooseApproval } = useApproval(dispatch, modeRef);
  const { overlay, setOverlay, sessionList, buildCtx, openSessions, resumeSession, newSession, removeSession, openModel, selectModel } =
    useOverlays({ convoRef, replStateRef, setup, repoRoot, activeProvider, setActiveProvider, dispatch });

  if (convoRef.current === null) {
    convoRef.current = createConversation(
      setup.systemPrompt,
      buildConvoConfig({ setup, repoRoot, dispatch, convoRef, replStateRef, requestApproval }),
    );
  }

  useEffect(() => { void gatherBannerData(setup, replStateRef.current.sessionId, process.env).then(setBanner); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { void listRepoFiles(repoRoot).then(setAtFiles); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!state.busy) return;
    const id = setInterval(() => setFrame((f) => (f + 1) % SPINNER.length), 120);
    return () => clearInterval(id);
  }, [state.busy]);
  useEffect(() => { if (pending) notify({ title: "Vanta", message: "needs your approval" }); }, [pending]);

  const { sendToAgent } = useAgentSend({
    dispatch,
    convoRef,
    replStateRef,
    busy: state.busy,
    queued: state.queued,
    safety: setup.safety,
    goals: setup.goals,
    repoRoot,
    contextWindow: activeProvider.contextWindow(),
    provider: activeProvider,
  });

  // Slash palette — fuzzy-search matching commands while typing a bare `/word`.
  // Results include risk tier labels.
  const slashHead = !pending && !overlay && !state.busy && input.startsWith("/") && !input.slice(1).includes(" ") ? input.slice(1) : null;
  const fuzzyMatches = slashHead !== null ? fuzzyFilter(SLASH_COMMANDS, slashHead, (c) => c.name) : [];
  const matchesWithRisk = fuzzyMatches.slice(0, 8).map((m) => ({
    ...m.item,
    risk: formatRiskLabel(getRiskTier(m.item.name)),
  }));
  const showPalette = matchesWithRisk.length > 0;
  // @-context palette — suggest files while typing @<partial-path>.
  const atHead = !pending && !overlay && !state.busy && !showPalette ? activeAtRef(input) : null;
  const atMatches = atHead !== null ? atFiles.filter((f) => f.includes(atHead)).slice(0, 8) : [];
  const showAtPalette = atMatches.length > 0;
  const [atSel, setAtSel] = useState(0);
  const maxVisible = Math.max(5, termRows - CHROME_ROWS);

  useKeybindings({
    slashHead, showPalette, matchesWithRisk, sel, setSel,
    atHead, showAtPalette, atMatches, atSel, setAtSel, input, setInput,
    altScreen: ALT_SCREEN, maxVisible, dispatch, setMode, modeRef,
  });

  const submit = useSubmit({
    convoRef, replStateRef, setup, repoRoot,
    pending, editMode, busy: state.busy, sel,
    dispatch, sendToAgent, buildCtx, openSessions, openModel, exit: app.exit,
    setInput, setEditMode, setInputHistory, setShowHelp, setActiveProvider,
  });

  const w = Math.max(24, cols - 2); // fill terminal width, leave 2-char gutter
  const estTokens = estimateTokens(convoRef.current?.messages ?? [], state.streaming);
  const elapsedMs = state.busy && Date.now();
  const hasFoldable = state.entries.some(
    (e) => e.kind === "tool" && (!!e.diff?.length || (!!e.resultOutput && (e.lineCount ?? 0) > INLINE_MAX))
  );
  const foldHint = hasFoldable ? `^O ${state.expanded ? "collapse" : "details"}  ` : "";
  // Alt-screen banner: the banner leads the transcript as its first entry — into
  // <Static> scrollback in normal mode, into the virtual viewport (scrolls
  // away via pgup) in alt-screen mode. Same designed card in both.
  const allEntries: Entry[] = banner ? [{ kind: "banner", data: banner, root: repoRoot }, ...state.entries] : state.entries;
  const scrollHint = ALT_SCREEN && allEntries.length > maxVisible ? "pgup/pgdn  " : "";
  const hint = showPalette || showAtPalette ? "↑↓ select · tab complete · ⏎ run" : showHelp ? "? ⏎ — close help" : `${scrollHint}${foldHint}/help  ?  /exit`;

  // Bottom chrome (approval / pickers / composer + status) — shared by both layouts.
  const chrome = pending ? (
        <Box flexDirection="column" marginTop={1}>
          <ApprovalPrompt action={pending.action} reason={pending.reason} toolName={pending.toolName} width={w} onChoose={chooseApproval} />
          <Box borderStyle="round" borderColor="gray" paddingX={1} width={w}><Text dimColor>{"› "}awaiting approval…</Text></Box>
        </Box>
      ) : overlay === "sessions" ? (
        <Box flexDirection="column" marginTop={1}>
          <SessionsPicker sessions={sessionList} currentId={replStateRef.current.sessionId} currentTurns={replStateRef.current.turnIndex} nowMs={Date.now()} width={w} onResume={resumeSession} onNew={newSession} onDelete={removeSession} onCancel={() => setOverlay(null)} />
          <Box borderStyle="round" borderColor="gray" paddingX={1} width={w}><Text dimColor>{"› "}choosing session…</Text></Box>
        </Box>
      ) : overlay === "model" ? (
        <Box flexDirection="column" marginTop={1}>
          <ModelPicker providers={PROVIDER_CATALOG} currentProviderId={process.env.VANTA_PROVIDER ?? "openai"} currentModel={activeProvider.modelId()} hasKey={hasKey} width={w} onSelect={selectModel} onCancel={() => setOverlay(null)} />
          <Box borderStyle="round" borderColor="gray" paddingX={1} width={w}><Text dimColor>{"› "}picking model…</Text></Box>
        </Box>
      ) : (
        <Box flexDirection="column" marginTop={1}>
          {showHelp && <HelpOverlay width={w} vimEnabled={VIM_ENABLED} />}
          <Box borderStyle="round" borderColor={editMode.active ? "yellow" : state.busy ? "gray" : THEME.border} paddingX={1} width={w}>
            <Text color={editMode.active ? "yellow" : state.busy ? "gray" : THEME.primary}>{"› "}</Text>
            <Composer value={input} onChange={setInput} onSubmit={submit} placeholder={editMode.active ? "editing response — ⏎ confirm, clear + ⏎ cancel" : state.busy ? "working…" : "Ask Vanta anything — /help for commands"} history={inputHistory} isHistoryActive={!editMode.active && !showPalette && !showAtPalette && !state.busy} vimEnabled={VIM_ENABLED} onVimModeChange={setVimMode} />
          </Box>
          {showPalette ? <Palette matches={matchesWithRisk} sel={Math.min(sel, matchesWithRisk.length - 1)} width={w} /> : null}
          {showAtPalette ? <Palette matches={atMatches.map((f) => ({ name: f, desc: "" }))} sel={Math.min(atSel, atMatches.length - 1)} width={w} /> : null}
          <StatusBar status={state.status} busy={state.busy} spinner={SPINNER[frame] ?? "⠋"} model={activeProvider.modelId()} estTokens={estTokens} contextWindow={activeProvider.contextWindow()} elapsedMs={typeof elapsedMs === "number" ? elapsedMs : 0} width={w} hint={hint} mode={mode} primaryColor={THEME.primary} vimMode={VIM_ENABLED ? vimMode : undefined} />
        </Box>
      );

  // Alt-screen (VANTA_NO_FLICKER=1): fullscreen-fill frame — see alt-frame.tsx
  // for why the frame overflows the viewport by one sacrificial line.
  if (ALT_SCREEN) {
    return (
      <AltFrame
        rows={termRows}
        nonce={redrawNonce}
        viewport={
          <>
            <VirtualTranscript entries={allEntries} expanded={state.expanded} viewOffset={state.viewOffset} maxVisible={maxVisible} />
            {/* Tail-cap streaming to one screen — bounds per-frame bytes. */}
            {state.streaming.trim() ? <Text>{state.streaming.split("\n").slice(-termRows).join("\n")}</Text> : null}
          </>
        }
        chrome={chrome}
      />
    );
  }

  return (
    <Box flexDirection="column" paddingX={1}>
      <Static items={allEntries}>
        {(item, i) => <EntryRow key={`e${i}`} entry={item} expanded={state.expanded} />}
      </Static>
      {state.streaming.trim() ? (
        // Cap streaming display to last 8 lines so the dynamic region doesn't
        // outgrow the terminal and scroll content off screen.
        (() => {
          const lines = state.streaming.split("\n");
          const visible = lines.length > 8 ? `…\n${lines.slice(-8).join("\n")}` : state.streaming;
          return <Text>{visible}</Text>;
        })()
      ) : null}
      {chrome}
    </Box>
  );
}
