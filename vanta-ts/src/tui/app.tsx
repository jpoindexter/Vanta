import { useEffect, useReducer, useRef, useState, type ReactElement } from "react";
import { Box, Static, Text, useApp, useInput } from "ink";
import { Composer } from "./composer.js";
import { spinnerFrames } from "./spinners.js";
import { notify } from "./notify.js";
import { createConversation, type Conversation } from "../agent.js";
import { buildSummarizer } from "../session.js";
import { newSessionId } from "../sessions/store.js";
import { executeSlash, maybeDroppedImage, maybeDroppedVideo, SLASH_COMMANDS, type ReplState } from "../repl-commands.js";
import { RESTART_EXIT_CODE } from "../repl/restart-cmd.js";
import { PROVIDER_CATALOG, type ProviderEntry } from "../providers/catalog.js";
import { gatherBannerData, type BannerData } from "./banner.js";
import { StatusBar, estimateTokens } from "./status-bar.js";
import { SessionsPicker } from "./sessions-picker.js";
import { ModelPicker } from "./model-picker.js";
import { ApprovalPrompt } from "./approval.js";
import { EntryRow, Palette, firstLine, type Entry } from "./transcript.js";
import { toolDisplay } from "./tool-display.js";
import { summarizeResult, buildResultPreview, INLINE_MAX } from "./tool-result.js";
import { useOverlays } from "./use-overlays.js";
import { useApproval } from "./use-approval.js";
import { nextMode, type ApprovalMode } from "./approval-mode.js";
import { parseAtRefs, activeAtRef, buildContextBlock, listRepoFiles } from "./at-context.js";
import { parseShortcut, runBashShortcut, runMemoryShortcut } from "../repl/shortcuts.js";
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
import { PLAN_MARKER } from "../repl/plan-mode.js";

// Re-export for test compat — app.test.tsx imports these from "./app".
export { reduce, type State, type Action };

/** Picker availability: keyless backends + any provider whose API key is set. */
const hasKey = (entry: ProviderEntry): boolean => entry.envVar === null || !!process.env[entry.envVar];

const SPINNER = spinnerFrames();
const THEME = resolveTheme(process.env);
const VIM_ENABLED = !!process.env.VANTA_VIM;
// Reserve rows for: composer(3) + status(1) + padding(2) + streaming(2) + safety margin(2).
const CHROME_ROWS = 10;

// CC-VIRTUAL-LIST: alt-screen mode (virtual viewport replaces <Static>) is passed
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
    convoRef.current = createConversation(setup.systemPrompt, {
      provider: setup.provider, safety: setup.safety, registry: setup.registry, root: repoRoot,
      maxIterations: Number(process.env.VANTA_MAX_ITER) || undefined,
      summarize: buildSummarizer(setup.provider),
      onThinking: (text) => dispatch({ t: "thinking", text }),
      onTextDelta: (d) => dispatch({ t: "delta", d }),
      onToolCall: (name, args) => dispatch({ t: "toolCall", name, ...toolDisplay(name, args) }),
      onToolResult: (name, ok, output, diff) => {
        const preview = ok ? buildResultPreview(output) : undefined;
        dispatch({ t: "toolResult", name, ok, errorLine: ok ? undefined : firstLine(output), summary: summarizeResult(output), diff, resultOutput: preview?.preview, lineCount: preview?.lineCount });
        // CC-TODO: live checklist — surface the todo list as a note every time the agent writes it.
        if (name === "todo" && ok && output.includes("done)")) {
          dispatch({ t: "note", text: `  ☑ plan updated:\n${output.split("\n").map((l) => `  ${l}`).join("\n")}` });
        }
      },
      onAutoCompact: (dropped, summary) => {
        dispatch({ t: "note", text: `⟳ auto-compacted ${dropped} messages — ${summary.length > 80 ? summary.slice(0, 77) + "…" : summary}` });
      },
      requestApproval,
      // CC-PLAN-MODE-REAL: block write tools while plan mode is active and unapproved.
      planGate: () => {
        const sys = convoRef.current?.messages[0];
        return !!(sys?.content.includes(PLAN_MARKER) && !replStateRef.current.planApproved);
      },
    });
  }

  useEffect(() => { void gatherBannerData(setup, replStateRef.current.sessionId, process.env).then(setBanner); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { void listRepoFiles(repoRoot).then(setAtFiles); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!state.busy) return;
    const id = setInterval(() => setFrame((f) => (f + 1) % SPINNER.length), 120);
    return () => clearInterval(id);
  }, [state.busy]);
  useEffect(() => { if (pending) notify({ title: "Vanta", message: "needs your approval" }); }, [pending]);

  const { sendToAgent } = useAgentSend(dispatch, convoRef, replStateRef, state.busy, state.queued, setup.safety, setup.goals, repoRoot, activeProvider.contextWindow());

  // Slash palette — fuzzy-search matching commands while typing a bare `/word`.
  // Results include risk tier labels.
  const slashHead = !pending && !overlay && !state.busy && input.startsWith("/") && !input.slice(1).includes(" ") ? input.slice(1) : null;
  const fuzzyMatches = slashHead !== null ? fuzzyFilter(SLASH_COMMANDS, slashHead, (c) => c.name) : [];
  const matchesWithRisk = fuzzyMatches.slice(0, 8).map((m) => ({
    ...m.item,
    risk: formatRiskLabel(getRiskTier(m.item.name)),
  }));
  const showPalette = matchesWithRisk.length > 0;
  useEffect(() => setSel(0), [slashHead]);
  useInput((_in, key) => {
    if (key.upArrow) setSel((s) => (s - 1 + matchesWithRisk.length) % matchesWithRisk.length);
    else if (key.downArrow) setSel((s) => (s + 1) % matchesWithRisk.length);
    else if (key.tab) setInput(`/${(matchesWithRisk[sel] ?? matchesWithRisk[0])!.name} `);
  }, { isActive: showPalette });

  // @-context palette — suggest files while typing @<partial-path>.
  const atHead = !pending && !overlay && !state.busy && !showPalette ? activeAtRef(input) : null;
  const atMatches = atHead !== null ? atFiles.filter((f) => f.includes(atHead)).slice(0, 8) : [];
  const showAtPalette = atMatches.length > 0;
  const [atSel, setAtSel] = useState(0);
  useEffect(() => setAtSel(0), [atHead]);
  useInput((_in, key) => {
    if (key.upArrow) setAtSel((s) => (s - 1 + atMatches.length) % atMatches.length);
    else if (key.downArrow) setAtSel((s) => (s + 1) % atMatches.length);
    else if (key.tab) {
      const chosen = atMatches[atSel] ?? atMatches[0];
      if (chosen) setInput(input.replace(/@[\w./\-]*$/, `@${chosen} `));
    }
  }, { isActive: showAtPalette });

  // Ctrl+O folds/unfolds tool detail (full diffs) across the whole transcript —
  // collapsed by default so the feed never floods (CC-TRANSCRIPT).
  useInput((input, key) => {
    if (key.ctrl && input === "o") dispatch({ t: "toggleExpand" });
  });

  // CC-VIRTUAL-LIST: pgup/pgdn scroll the virtual viewport in alt-screen mode.
  const maxVisible = Math.max(5, termRows - CHROME_ROWS);
  useInput((_in, key) => {
    const half = Math.max(1, Math.floor(maxVisible / 2));
    if (key.pageUp) dispatch({ t: "scrollBy", delta: half });
    else if (key.pageDown) dispatch({ t: "scrollBy", delta: -half });
  }, { isActive: ALT_SCREEN && !showPalette && !showAtPalette });

  // Shift+tab cycles the approval mode. Keep modeRef in sync so requestApproval
  // always reads the latest value without closing over stale state.
  useInput((_in, key) => {
    if (key.tab && key.shift) {
      setMode((prev) => {
        const next = nextMode(prev);
        modeRef.current = next;
        const noteText =
          next === "accept-edits"
            ? "✎ accept-edits mode — file writes auto-approved · ⇧⇥ for auto"
            : next === "auto"
              ? "⚡ auto-approve mode — ⇧⇥ to return to review"
              : "● review mode — approvals restored";
        dispatch({ t: "note", text: noteText });
        return next;
      });
    }
  });

  const handleSlash = (line: string): void => {
    const convo = convoRef.current;
    if (!convo) return;
    const head = line.slice(1).split(/\s+/)[0] ?? "";
    const ms = SLASH_COMMANDS.filter((c) => c.name.startsWith(head));
    const effective = !line.slice(1).includes(" ") && ms.length > 0 && !ms.some((c) => c.name === head)
      ? `/${(ms[Math.min(sel, ms.length - 1)] ?? ms[0])!.name}`
      : line;
    const parts = effective.slice(1).split(/\s+/);
    const resolvedCmd = parts[0] ?? "";
    const resolvedArg = parts.slice(1).join(" ").trim();
    if (resolvedCmd === "sessions" && !resolvedArg) return void openSessions();
    if (resolvedCmd === "model" && !resolvedArg) return void openModel();
    void executeSlash(effective, buildCtx()).then((r) => {
      if (r.exit) return void app.exit();
      if (r.restart) { process.exitCode = RESTART_EXIT_CODE; return void app.exit(); } // run.sh re-execs on 75
      if (r.cleared) dispatch({ t: "clear" });
      if (r.provider) setActiveProvider(r.provider); // /model <arg> hot-swap → refresh banner
      if (r.output) dispatch({ t: "note", text: r.output });
      if (r.resend) sendToAgent(r.resend);
      if (r.loadIntoComposer !== undefined) {
        setInput(r.loadIntoComposer);
        setEditMode({ active: true, messageIndex: r.editMessageIndex ?? -1 });
      }
    });
  };

  const submit = (raw: string): void => {
    const line = raw.trim();
    setInput("");
    if (pending) return;
    // Edit mode: replace the target message in place, then return to normal.
    if (editMode.active) {
      setEditMode({ active: false, messageIndex: -1 });
      const convo = convoRef.current;
      const msg = convo?.messages[editMode.messageIndex];
      if (!line) { dispatch({ t: "note", text: "  · edit cancelled" }); return; }
      if (msg && msg.role === "assistant") {
        convo!.messages[editMode.messageIndex] = { ...msg, content: line };
        dispatch({ t: "note", text: "  ✎ response updated" });
      }
      return;
    }
    if (line) setInputHistory((h) => [...h, line]);
    if (!line) return;
    const firstToken = line.slice(1).split(/\s/)[0] ?? "";
    if (line.startsWith("/") && !firstToken.includes("/")) { handleSlash(line); return; }
    if (line === "?") { setShowHelp((h) => !h); return; }
    const shortcut = parseShortcut(line);
    if (shortcut) {
      if (shortcut.type === "bash") {
        void runBashShortcut(shortcut.cmd, setup.safety, repoRoot)
          .then((out) => dispatch({ t: "note", text: out }))
          .catch((e: unknown) => dispatch({ t: "note", text: `error: ${e instanceof Error ? e.message : String(e)}` }));
      } else {
        void runMemoryShortcut(shortcut.text, process.env)
          .then((out) => dispatch({ t: "note", text: out }))
          .catch((e: unknown) => dispatch({ t: "note", text: `error: ${e instanceof Error ? e.message : String(e)}` }));
      }
      return;
    }
    if (state.busy) { dispatch({ t: "enqueue", text: line }); return; }
    void (async () => {
      const dropped = await maybeDroppedImage(line);
      if (dropped) { (replStateRef.current.pendingImages ??= []).push(dropped); sendToAgent("Take a look at this image."); return; }
      const videoPath = await maybeDroppedVideo(line);
      if (videoPath) { sendToAgent(`Watch this video and describe what you see: ${videoPath}`); return; }
      const refs = parseAtRefs(line);
      const ctxBlock = refs.length > 0 ? await buildContextBlock(refs, repoRoot) : "";
      sendToAgent(ctxBlock ? `${ctxBlock}\n\n${line}` : line);
    })();
  };

  const w = Math.max(24, cols - 2); // fill terminal width, leave 2-char gutter
  const estTokens = estimateTokens(convoRef.current?.messages ?? [], state.streaming);
  const elapsedMs = state.busy && Date.now();
  const hasFoldable = state.entries.some(
    (e) => e.kind === "tool" && (!!e.diff?.length || (!!e.resultOutput && (e.lineCount ?? 0) > INLINE_MAX))
  );
  const foldHint = hasFoldable ? `^O ${state.expanded ? "collapse" : "details"}  ` : "";
  // CC-ALT-BANNER: the banner leads the transcript as its first entry — into
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
