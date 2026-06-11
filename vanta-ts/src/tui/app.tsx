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
import { SkillsPicker, makeInvokeSkill } from "./skills-picker.js";
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
import { useMouseWheel } from "./use-mouse-wheel.js";
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

// ─── display-value computation (pure, no hooks) ───────────────────────────

type DisplayOpts = {
  input: string; pending: unknown; overlay: string | null; busy: boolean;
  atFiles: string[]; showHelp: boolean; expanded: boolean;
  entries: Entry[]; maxVisible: number; altScreen: boolean;
};
type DisplayValues = {
  slashHead: string | null; atHead: string | null;
  matchesWithRisk: Array<{ name: string; desc: string; risk: string }>;
  atMatches: string[]; showPalette: boolean; showAtPalette: boolean; hint: string;
};

function isPaletteBlocked(o: DisplayOpts): boolean {
  return !!(o.pending || o.overlay || o.busy);
}

function computePalette(o: DisplayOpts): Pick<DisplayValues, "slashHead" | "matchesWithRisk" | "showPalette"> {
  const blocked = isPaletteBlocked(o);
  const slashHead = !blocked && o.input.startsWith("/") && !o.input.slice(1).includes(" ") ? o.input.slice(1) : null;
  const fuzzyMatches = slashHead !== null ? fuzzyFilter(SLASH_COMMANDS, slashHead, (c) => c.name) : [];
  const matchesWithRisk = fuzzyMatches.slice(0, 8).map((m) => ({ ...m.item, risk: formatRiskLabel(getRiskTier(m.item.name)) }));
  return { slashHead, matchesWithRisk, showPalette: matchesWithRisk.length > 0 };
}

function computeAtPalette(o: DisplayOpts, showPalette: boolean): Pick<DisplayValues, "atHead" | "atMatches" | "showAtPalette"> {
  const blocked = isPaletteBlocked(o);
  const atHead = !blocked && !showPalette ? activeAtRef(o.input) : null;
  const atMatches = atHead !== null ? o.atFiles.filter((f) => f.includes(atHead)).slice(0, 8) : [];
  return { atHead, atMatches, showAtPalette: atMatches.length > 0 };
}

function computeHint(o: DisplayOpts, showPalette: boolean, showAtPalette: boolean): string {
  if (showPalette || showAtPalette) return "↑↓ select · tab complete · ⏎ run";
  if (o.showHelp) return "? ⏎ — close help";
  const hasFoldable = o.entries.some((e) => e.kind === "tool" && (!!e.diff?.length || (!!e.resultOutput && (e.lineCount ?? 0) > INLINE_MAX)));
  const foldHint = hasFoldable ? `^O ${o.expanded ? "collapse" : "details"}  ` : "";
  const scrollHint = o.altScreen && o.entries.length > 1 ? "scroll/pgup  " : "";
  return `${scrollHint}${foldHint}/help  ?  /exit`;
}

function computeDisplayValues(o: DisplayOpts): DisplayValues {
  const { slashHead, matchesWithRisk, showPalette } = computePalette(o);
  const { atHead, atMatches, showAtPalette } = computeAtPalette(o, showPalette);
  const hint = computeHint(o, showPalette, showAtPalette);
  return { slashHead, atHead, matchesWithRisk, atMatches, showPalette, showAtPalette, hint };
}

// ─── streaming tail display ────────────────────────────────────────────────

function StreamingTail({ streaming, maxLines }: { streaming: string; maxLines: number }): ReactElement | null {
  if (!streaming.trim()) return null;
  const lines = streaming.split("\n");
  const visible = lines.length > maxLines ? `…\n${lines.slice(-maxLines).join("\n")}` : streaming;
  return <Text>{visible}</Text>;
}

// ─── bottom chrome sub-renderers ──────────────────────────────────────────

type ChromeProps = {
  pending: ReturnType<typeof useApproval>["pending"];
  overlay: string | null;
  state: State;
  editMode: { active: boolean; messageIndex: number };
  showHelp: boolean;
  showPalette: boolean;
  showAtPalette: boolean;
  matchesWithRisk: Array<{ name: string; desc: string; risk: string }>;
  atMatches: string[];
  sel: number;
  atSel: number;
  input: string;
  inputHistory: string[];
  vimMode: VimMode;
  hint: string;
  frame: number;
  w: number;
  activeProvider: LLMProvider;
  estTokens: number;
  mode: ApprovalMode;
  sessionList: ReturnType<typeof useOverlays>["sessionList"];
  replStateRef: React.MutableRefObject<ReplState>;
  chooseApproval: ReturnType<typeof useApproval>["chooseApproval"];
  resumeSession: ReturnType<typeof useOverlays>["resumeSession"];
  newSession: ReturnType<typeof useOverlays>["newSession"];
  removeSession: ReturnType<typeof useOverlays>["removeSession"];
  selectModel: ReturnType<typeof useOverlays>["selectModel"];
  skillList: ReturnType<typeof useOverlays>["skillList"];
  invokeSkill: (name: string) => void;
  setOverlay: ReturnType<typeof useOverlays>["setOverlay"];
  setInput: (v: string) => void;
  submit: (v: string) => void;
};

function ChromeApproval(p: Pick<ChromeProps, "pending" | "chooseApproval" | "w">): ReactElement {
  return (
    <Box flexDirection="column" marginTop={1}>
      <ApprovalPrompt action={p.pending!.action} reason={p.pending!.reason} toolName={p.pending!.toolName} width={p.w} onChoose={p.chooseApproval} />
      <Box borderStyle="round" borderColor="gray" paddingX={1} width={p.w}><Text dimColor>{"› "}awaiting approval…</Text></Box>
    </Box>
  );
}

function ChromeSessions(p: Pick<ChromeProps, "sessionList" | "replStateRef" | "resumeSession" | "newSession" | "removeSession" | "setOverlay" | "w">): ReactElement {
  return (
    <Box flexDirection="column" marginTop={1}>
      <SessionsPicker sessions={p.sessionList} currentId={p.replStateRef.current.sessionId} currentTurns={p.replStateRef.current.turnIndex} nowMs={Date.now()} width={p.w} onResume={p.resumeSession} onNew={p.newSession} onDelete={p.removeSession} onCancel={() => p.setOverlay(null)} />
      <Box borderStyle="round" borderColor="gray" paddingX={1} width={p.w}><Text dimColor>{"› "}choosing session…</Text></Box>
    </Box>
  );
}

function ChromeSkills(p: Pick<ChromeProps, "skillList" | "invokeSkill" | "setOverlay" | "w">): ReactElement {
  return (
    <Box flexDirection="column" marginTop={1}>
      <SkillsPicker skills={p.skillList} onInvoke={p.invokeSkill} onCancel={() => p.setOverlay(null)} width={p.w} />
      <Box borderStyle="round" borderColor="gray" paddingX={1} width={p.w}><Text dimColor>{"› "}browsing skills…</Text></Box>
    </Box>
  );
}

function ChromeModel(p: Pick<ChromeProps, "activeProvider" | "selectModel" | "setOverlay" | "w">): ReactElement {
  return (
    <Box flexDirection="column" marginTop={1}>
      <ModelPicker providers={PROVIDER_CATALOG} currentProviderId={process.env.VANTA_PROVIDER ?? "openai"} currentModel={p.activeProvider.modelId()} hasKey={hasKey} width={p.w} onSelect={p.selectModel} onCancel={() => p.setOverlay(null)} />
      <Box borderStyle="round" borderColor="gray" paddingX={1} width={p.w}><Text dimColor>{"› "}picking model…</Text></Box>
    </Box>
  );
}

type ComposerColors = { borderColor: string; promptColor: string; placeholder: string; isHistoryActive: boolean };
function composerColors(editActive: boolean, busy: boolean, showPalette: boolean, showAtPalette: boolean): ComposerColors {
  if (editActive) return { borderColor: "yellow", promptColor: "yellow", placeholder: "editing response — ⏎ confirm, clear + ⏎ cancel", isHistoryActive: false };
  if (busy) return { borderColor: "gray", promptColor: "gray", placeholder: "working…", isHistoryActive: false };
  return { borderColor: THEME.border, promptColor: THEME.primary, placeholder: "Ask Vanta anything — /help for commands", isHistoryActive: !showPalette && !showAtPalette };
}

function ChromeComposer(p: ChromeProps): ReactElement {
  const { borderColor, promptColor, placeholder, isHistoryActive } = composerColors(p.editMode.active, p.state.busy, p.showPalette, p.showAtPalette);
  // While scrolled back, ↑/↓ scroll the transcript (use-keybindings) — keep
  // them out of input history until the view returns to the bottom.
  const historyActive = isHistoryActive && p.state.viewOffset === 0;
  const elapsedMs = p.state.busy ? Date.now() : 0;
  const vimMode = VIM_ENABLED ? p.vimMode : undefined;
  return (
    <Box flexDirection="column" marginTop={1}>
      {p.showHelp && <HelpOverlay width={p.w} vimEnabled={VIM_ENABLED} />}
      <Box borderStyle="round" borderColor={borderColor} paddingX={1} width={p.w}>
        <Text color={promptColor}>{"› "}</Text>
        <Composer value={p.input} onChange={p.setInput} onSubmit={p.submit} placeholder={placeholder} history={p.inputHistory} isHistoryActive={historyActive} vimEnabled={VIM_ENABLED} onVimModeChange={() => {}} />
      </Box>
      {p.showPalette ? <Palette matches={p.matchesWithRisk} sel={Math.min(p.sel, p.matchesWithRisk.length - 1)} width={p.w} /> : null}
      {p.showAtPalette ? <Palette matches={p.atMatches.map((f) => ({ name: f, desc: "" }))} sel={Math.min(p.atSel, p.atMatches.length - 1)} width={p.w} /> : null}
      <StatusBar status={p.state.status} busy={p.state.busy} spinner={SPINNER[p.frame] ?? "⠋"} model={p.activeProvider.modelId()} estTokens={p.estTokens} contextWindow={p.activeProvider.contextWindow()} elapsedMs={elapsedMs} width={p.w} hint={p.hint} mode={p.mode} primaryColor={THEME.primary} vimMode={vimMode} />
    </Box>
  );
}

function BottomChrome(p: ChromeProps): ReactElement {
  if (p.pending) return <ChromeApproval pending={p.pending} chooseApproval={p.chooseApproval} w={p.w} />;
  if (p.overlay === "sessions") return <ChromeSessions sessionList={p.sessionList} replStateRef={p.replStateRef} resumeSession={p.resumeSession} newSession={p.newSession} removeSession={p.removeSession} setOverlay={p.setOverlay} w={p.w} />;
  if (p.overlay === "model") return <ChromeModel activeProvider={p.activeProvider} selectModel={p.selectModel} setOverlay={p.setOverlay} w={p.w} />;
  if (p.overlay === "skills") return <ChromeSkills skillList={p.skillList} invokeSkill={p.invokeSkill} setOverlay={p.setOverlay} w={p.w} />;
  return <ChromeComposer {...p} />;
}

// ─── app state hook ───────────────────────────────────────────────────────

function useAppState({ setup, repoRoot }: { setup: RunSetup; repoRoot: string }) {
  const [state, dispatch] = useReducer(reduce, { entries: [] as Entry[], streaming: "", busy: false, status: "idle", queued: [], expanded: false, viewOffset: 0, focusMode: false });
  const [input, setInput] = useState("");
  const [inputHistory, setInputHistory] = useState<string[]>([]);
  const [atFiles, setAtFiles] = useState<string[]>([]);
  const [frame, setFrame] = useState(0);
  const [sel, setSel] = useState(0);
  const [atSel, setAtSel] = useState(0);
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
  const { overlay, setOverlay, sessionList, skillList, buildCtx, openSessions, resumeSession, newSession, removeSession, openModel, selectModel, openSkills } =
    useOverlays({ convoRef, replStateRef, setup, repoRoot, activeProvider, setActiveProvider, dispatch });
  useEffect(() => { void gatherBannerData(setup, replStateRef.current.sessionId, process.env).then(setBanner); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { void listRepoFiles(repoRoot).then(setAtFiles); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!state.busy) return; const id = setInterval(() => setFrame((f) => (f + 1) % SPINNER.length), 120); return () => clearInterval(id); }, [state.busy]);
  useEffect(() => { if (pending) notify({ title: "Vanta", message: "needs your approval" }); }, [pending]);
  return { state, dispatch, input, setInput, inputHistory, setInputHistory, atFiles, frame, sel, setSel, atSel, setAtSel, banner, activeProvider, setActiveProvider, convoRef, replStateRef, mode, setMode, modeRef, showHelp, setShowHelp, vimMode, setVimMode, editMode, setEditMode, pending, requestApproval, chooseApproval, overlay, setOverlay, sessionList, skillList, buildCtx, openSessions, resumeSession, newSession, removeSession, openModel, selectModel, openSkills };
}

// ─── app ──────────────────────────────────────────────────────────────────

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
  const s = useAppState({ setup, repoRoot });

  if (s.convoRef.current === null) {
    s.convoRef.current = createConversation(
      setup.systemPrompt,
      buildConvoConfig({ setup, repoRoot, dispatch: s.dispatch, convoRef: s.convoRef, replStateRef: s.replStateRef, requestApproval: s.requestApproval }),
    );
  }

  const { sendToAgent } = useAgentSend({ dispatch: s.dispatch, convoRef: s.convoRef, replStateRef: s.replStateRef, busy: s.state.busy, queued: s.state.queued, safety: setup.safety, goals: setup.goals, repoRoot, contextWindow: s.activeProvider.contextWindow(), provider: s.activeProvider });
  const invokeSkill = makeInvokeSkill({ setOverlay: s.setOverlay, dispatch: s.dispatch, sendToAgent });
  const maxVisible = Math.max(5, termRows - CHROME_ROWS);
  const dv = computeDisplayValues({ input: s.input, pending: s.pending, overlay: s.overlay, busy: s.state.busy, atFiles: s.atFiles, showHelp: s.showHelp, expanded: s.state.expanded, entries: s.state.entries, maxVisible, altScreen: ALT_SCREEN });

  useKeybindings({ slashHead: dv.slashHead, showPalette: dv.showPalette, matchesWithRisk: dv.matchesWithRisk, sel: s.sel, setSel: s.setSel, atHead: dv.atHead, showAtPalette: dv.showAtPalette, atMatches: dv.atMatches, atSel: s.atSel, setAtSel: s.setAtSel, input: s.input, setInput: s.setInput, altScreen: ALT_SCREEN, maxVisible, viewOffset: s.state.viewOffset, dispatch: s.dispatch, setMode: s.setMode, modeRef: s.modeRef });
  useMouseWheel(ALT_SCREEN, s.dispatch);
  const submit = useSubmit({ convoRef: s.convoRef, replStateRef: s.replStateRef, setup, repoRoot, pending: s.pending, editMode: s.editMode, busy: s.state.busy, sel: s.sel, dispatch: s.dispatch, sendToAgent, buildCtx: s.buildCtx, openSessions: s.openSessions, openModel: s.openModel, openSkills: s.openSkills, exit: app.exit, setInput: s.setInput, setEditMode: s.setEditMode, setInputHistory: s.setInputHistory, setShowHelp: s.setShowHelp, setActiveProvider: s.setActiveProvider });

  const w = Math.max(24, cols - 2);
  const estTokens = estimateTokens(s.convoRef.current?.messages ?? [], s.state.streaming);
  const visibleEntries = s.state.focusMode
    ? s.state.entries.filter((e) => e.kind === "user" || e.kind === "assistant")
    : s.state.entries;
  const allEntries: Entry[] = s.banner ? [{ kind: "banner", data: s.banner, root: repoRoot }, ...visibleEntries] : visibleEntries;
  const chromeProps: ChromeProps = { pending: s.pending, overlay: s.overlay, state: s.state, editMode: s.editMode, showHelp: s.showHelp, showPalette: dv.showPalette, showAtPalette: dv.showAtPalette, matchesWithRisk: dv.matchesWithRisk, atMatches: dv.atMatches, sel: s.sel, atSel: s.atSel, input: s.input, inputHistory: s.inputHistory, vimMode: s.vimMode, hint: dv.hint, frame: s.frame, w, activeProvider: s.activeProvider, estTokens, mode: s.mode, sessionList: s.sessionList, skillList: s.skillList, invokeSkill, replStateRef: s.replStateRef, chooseApproval: s.chooseApproval, resumeSession: s.resumeSession, newSession: s.newSession, removeSession: s.removeSession, selectModel: s.selectModel, setOverlay: s.setOverlay, setInput: s.setInput, submit };

  if (ALT_SCREEN) {
    return (
      <AltFrame rows={termRows} nonce={redrawNonce}
        viewport={<><VirtualTranscript entries={allEntries} expanded={s.state.expanded} viewOffset={s.state.viewOffset} maxVisible={maxVisible} /><StreamingTail streaming={s.state.streaming} maxLines={termRows} /></>}
        chrome={<BottomChrome {...chromeProps} />}
      />
    );
  }

  return (
    <Box flexDirection="column" paddingX={1}>
      <Static items={allEntries}>{(item, i) => <EntryRow key={`e${i}`} entry={item} expanded={s.state.expanded} />}</Static>
      <StreamingTail streaming={s.state.streaming} maxLines={8} />
      <BottomChrome {...chromeProps} />
    </Box>
  );
}
