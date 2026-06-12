import { useEffect, useReducer, useRef, useState, type ReactElement } from "react";
import { Box, Text, useApp, type ScrollBoxHandle } from "ink";
import { FullscreenLayout } from "./layout.js";
import { spinnerFrames } from "./spinners.js";
import { notify } from "./notify.js";
import { createConversation, type Conversation } from "../agent.js";
import { newSessionId } from "../sessions/store.js";
import { SLASH_COMMANDS, type ReplState } from "../repl-commands.js";
import { gatherBannerData, type BannerData } from "./banner.js";
import { estimateTokens } from "./status-bar.js";
import { EntryRow, buildRenderGroups, type Entry, type ToolEntry } from "./transcript.js";
import { ActiveLine } from "./active-line.js";
import { makeInvokeSkill } from "./skills-picker.js";
import { INLINE_MAX } from "./tool-result.js";
import { useOverlays } from "./use-overlays.js";
import { useApproval } from "./use-approval.js";
import { type ApprovalMode } from "./approval-mode.js";
import { activeAtRef, listRepoFiles } from "./at-context.js";
import { resolveThemeByName, currentThemeName } from "./theme.js";
import { getRiskTier, formatRiskLabel } from "./command-risk.js";
import { fuzzyFilter } from "./fuzzy.js";
import type { VimMode } from "./composer.js";
import { useAgentSend } from "./use-agent-send.js";
import { reduce, type State, type Action } from "./app-reducer.js";
import { useTermSize } from "./use-term-size.js";
import type { LLMProvider } from "../providers/interface.js";
import type { RunSetup } from "../session.js";
import { useSubmit } from "./use-submit.js";
import { useKeybindings } from "./use-keybindings.js";
import { useScrollKeys } from "./use-scroll-keys.js";
import { useNewMessages } from "./new-messages.js";
import { buildConvoConfig } from "./conversation-config.js";
import { BottomChrome, type ChromeProps } from "./bottom-chrome.js";
// Re-export for test compat — app.test.tsx imports these from "./app".
export { reduce, type State, type Action };

const SPINNER = spinnerFrames();
// VANTA_NO_MOUSE turns off terminal mouse reporting so native click-drag text
// selection works again (you lose wheel/trackpad scroll — keyboard scroll via
// ⇧↑/↓, pgup/pgdn still works).
const MOUSE_TRACKING = process.env.VANTA_NO_MOUSE ? "off" : "wheel";

// ─── display-value computation (pure, no hooks) ───────────────────────────

type DisplayOpts = {
  input: string; pending: unknown; overlay: string | null; busy: boolean;
  atFiles: string[]; showHelp: boolean; expanded: boolean;
  entries: Entry[];
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
  const scrollHint = o.entries.length > 1 ? "scroll/pgup  " : "";
  return `${scrollHint}${foldHint}/help  ?  /exit`;
}

function computeDisplayValues(o: DisplayOpts): DisplayValues {
  const { slashHead, matchesWithRisk, showPalette } = computePalette(o);
  const { atHead, atMatches, showAtPalette } = computeAtPalette(o, showPalette);
  const hint = computeHint(o, showPalette, showAtPalette);
  return { slashHead, atHead, matchesWithRisk, atMatches, showPalette, showAtPalette, hint };
}

// ─── streaming tail display ────────────────────────────────────────────────

// Full text — the ScrollBox owns overflow and stickyScroll follows the tail.
function StreamingTail({ streaming }: { streaming: string }): ReactElement | null {
  if (!streaming.trim()) return null;
  return <Text>{streaming}</Text>;
}

/** Transcript entries to render: focus-mode filter + optional leading banner. */
function buildEntries(state: State, banner: BannerData | null, repoRoot: string): Entry[] {
  const visible = state.focusMode
    ? state.entries.filter((e) => e.kind === "user" || e.kind === "assistant")
    : state.entries;
  return banner ? [{ kind: "banner", data: banner, root: repoRoot }, ...visible] : visible;
}

// ─── app state hook ───────────────────────────────────────────────────────

function useAppState({ setup, repoRoot }: { setup: RunSetup; repoRoot: string }) {
  const [state, dispatch] = useReducer(reduce, { entries: [] as Entry[], streaming: "", busy: false, status: "idle", queued: [], expanded: false, focusMode: false });
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
  const [themeName, setThemeName] = useState(() => currentThemeName(process.env));
  // /theme writes env (modal pickers re-resolve on open) + state (composer/status restyle now).
  const setTheme = (name: string): void => { process.env.VANTA_THEME = name; setThemeName(name); };
  const [showHelp, setShowHelp] = useState(false);
  const [vimMode, setVimMode] = useState<VimMode>("insert");
  const [editMode, setEditMode] = useState({ active: false, messageIndex: -1 });
  const { pending, requestApproval, chooseApproval } = useApproval(dispatch, modeRef);
  const { overlay, setOverlay, sessionList, skillList, cockpitData, buildCtx, openSessions, resumeSession, newSession, removeSession, openModel, selectModel, openSkills, openCockpit } =
    useOverlays({ convoRef, replStateRef, setup, repoRoot, activeProvider, setActiveProvider, dispatch });
  const openTheme = (): void => setOverlay("theme");
  useEffect(() => { void gatherBannerData(setup, replStateRef.current.sessionId, process.env).then(setBanner); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { void listRepoFiles(repoRoot).then(setAtFiles); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!state.busy) return; const id = setInterval(() => setFrame((f) => (f + 1) % SPINNER.length), 120); return () => clearInterval(id); }, [state.busy]);
  useEffect(() => { if (pending) notify({ title: "Vanta", message: "needs your approval" }); }, [pending]);
  return { state, dispatch, input, setInput, inputHistory, setInputHistory, atFiles, frame, sel, setSel, atSel, setAtSel, banner, activeProvider, setActiveProvider, convoRef, replStateRef, mode, setMode, modeRef, theme: resolveThemeByName(themeName), themeName, setTheme, openTheme, showHelp, setShowHelp, vimMode, setVimMode, editMode, setEditMode, pending, requestApproval, chooseApproval, overlay, setOverlay, sessionList, skillList, cockpitData, buildCtx, openSessions, resumeSession, newSession, removeSession, openModel, selectModel, openSkills, openCockpit };
}

// ─── app ──────────────────────────────────────────────────────────────────

// Renders inside the vendored ink fork's AlternateScreen: the renderer
// constrains itself to the viewport, the ScrollBox owns line-based scrolling
// (wheel via mouseTracking="wheel" → wheelUp/wheelDown keys → useScrollKeys),
// and stickyScroll follows new output until the user scrolls away.
export function App(props: { setup: RunSetup; repoRoot: string }): ReactElement {
  const { setup, repoRoot } = props;
  const app = useApp();
  const { cols } = useTermSize();
  const s = useAppState({ setup, repoRoot });
  const scrollRef = useRef<ScrollBoxHandle | null>(null);

  if (s.convoRef.current === null) {
    s.convoRef.current = createConversation(
      setup.systemPrompt,
      buildConvoConfig({ setup, repoRoot, dispatch: s.dispatch, convoRef: s.convoRef, replStateRef: s.replStateRef, requestApproval: s.requestApproval }),
    );
  }

  const { sendToAgent } = useAgentSend({ dispatch: s.dispatch, convoRef: s.convoRef, replStateRef: s.replStateRef, busy: s.state.busy, queued: s.state.queued, safety: setup.safety, goals: setup.goals, repoRoot, contextWindow: s.activeProvider.contextWindow(), provider: s.activeProvider });
  const invokeSkill = makeInvokeSkill({ setOverlay: s.setOverlay, dispatch: s.dispatch, sendToAgent });
  const dv = computeDisplayValues({ input: s.input, pending: s.pending, overlay: s.overlay, busy: s.state.busy, atFiles: s.atFiles, showHelp: s.showHelp, expanded: s.state.expanded, entries: s.state.entries });

  useKeybindings({ slashHead: dv.slashHead, showPalette: dv.showPalette, matchesWithRisk: dv.matchesWithRisk, sel: s.sel, setSel: s.setSel, atHead: dv.atHead, showAtPalette: dv.showAtPalette, atMatches: dv.atMatches, atSel: s.atSel, setAtSel: s.setAtSel, input: s.input, setInput: s.setInput, dispatch: s.dispatch, setMode: s.setMode, modeRef: s.modeRef, exit: app.exit, overlayActive: s.overlay !== null });
  useScrollKeys(scrollRef);
  // A new turn re-pins the viewport to the bottom so the response is followed.
  useEffect(() => { if (s.state.busy) scrollRef.current?.scrollToBottom(); }, [s.state.busy]);
  const submit = useSubmit({ convoRef: s.convoRef, replStateRef: s.replStateRef, setup, repoRoot, pending: s.pending, editMode: s.editMode, busy: s.state.busy, sel: s.sel, dispatch: s.dispatch, sendToAgent, buildCtx: s.buildCtx, openSessions: s.openSessions, openModel: s.openModel, openSkills: s.openSkills, openTheme: s.openTheme, openCockpit: s.openCockpit, exit: app.exit, setInput: s.setInput, setEditMode: s.setEditMode, setInputHistory: s.setInputHistory, setShowHelp: s.setShowHelp, setActiveProvider: s.setActiveProvider, setTheme: s.setTheme });

  const w = Math.max(24, cols - 2);
  const estTokens = estimateTokens(s.convoRef.current?.messages ?? [], s.state.streaming);
  // Full banner card is safe: every inventory row is clipped to ONE line
  // (hermes-banner pattern) — wrapped continuations are what bled over borders.
  const allEntries = buildEntries(s.state, s.banner, repoRoot);
  const renderEntries = buildRenderGroups(allEntries);
  const newMessages = useNewMessages(scrollRef, allEntries.length);
  let activeToolVerb: string | undefined;
  for (let i = s.state.entries.length - 1; i >= 0; i--) {
    const e = s.state.entries[i];
    if (e?.kind === "tool" && (e as ToolEntry).ok === undefined) { activeToolVerb = (e as ToolEntry).verb; break; }
  }
  const chromeProps: ChromeProps = { pending: s.pending, overlay: s.overlay, state: s.state, editMode: s.editMode, showHelp: s.showHelp, showPalette: dv.showPalette, showAtPalette: dv.showAtPalette, matchesWithRisk: dv.matchesWithRisk, atMatches: dv.atMatches, sel: s.sel, atSel: s.atSel, input: s.input, inputHistory: s.inputHistory, vimMode: s.vimMode, hint: dv.hint, frame: s.frame, w, activeProvider: s.activeProvider, estTokens, mode: s.mode, theme: s.theme, themeName: s.themeName, setTheme: s.setTheme, sessionList: s.sessionList, skillList: s.skillList, cockpitData: s.cockpitData, newMessages, invokeSkill, replStateRef: s.replStateRef, chooseApproval: s.chooseApproval, resumeSession: s.resumeSession, newSession: s.newSession, removeSession: s.removeSession, selectModel: s.selectModel, setOverlay: s.setOverlay, setInput: s.setInput, submit };

  return (
    <FullscreenLayout
      scrollRef={scrollRef}
      mouseTracking={MOUSE_TRACKING}
      scrollable={
        <Box flexDirection="column" paddingX={1}>
          {renderEntries.map((item, i) => <EntryRow key={`e${i}`} entry={item} expanded={s.state.expanded} />)}
          <StreamingTail streaming={s.state.streaming} />
          <ActiveLine busy={s.state.busy} activeTool={activeToolVerb} estTokens={estTokens} />
        </Box>
      }
      bottom={<BottomChrome {...chromeProps} />}
    />
  );
}
