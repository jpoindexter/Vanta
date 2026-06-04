import { useEffect, useReducer, useRef, useState, type ReactElement } from "react";
import { Box, Static, Text, useApp, useInput } from "ink";
import { Composer } from "./composer.js";
import { spinnerFrames } from "./spinners.js";
import { notify } from "./notify.js";
import { createConversation, type Conversation } from "../agent.js";
import { buildSummarizer } from "../session.js";
import { newSessionId } from "../sessions/store.js";
import { executeSlash, maybeDroppedImage, maybeDroppedVideo, SLASH_COMMANDS, type ReplState } from "../repl-commands.js";
import { PROVIDER_CATALOG, type ProviderEntry } from "../providers/catalog.js";
import { Banner, gatherBannerData, type BannerData } from "./banner.js";
import { StatusBar, estimateTokens } from "./status-bar.js";
import { SessionsPicker } from "./sessions-picker.js";
import { ModelPicker } from "./model-picker.js";
import { ApprovalPrompt } from "./approval.js";
import { Transcript, Palette, firstLine, type Entry } from "./transcript.js";
import { toolDisplay } from "./tool-display.js";
import { useOverlays } from "./use-overlays.js";
import { useApproval } from "./use-approval.js";
import { nextMode, type ApprovalMode } from "./approval-mode.js";
import { parseAtRefs, activeAtRef, buildContextBlock, listRepoFiles } from "./at-context.js";
import { parseShortcut, runBashShortcut, runMemoryShortcut } from "../repl/shortcuts.js";
import { HelpOverlay } from "./help-overlay.js";
import { resolveTheme } from "./theme.js";
import type { VimMode } from "./composer.js";
import { useAgentSend } from "./use-agent-send.js";
import { reduce, type State, type Action } from "./app-reducer.js";
import type { LLMProvider } from "../providers/interface.js";
import type { RunSetup } from "../session.js";

// Re-export for test compat — app.test.tsx imports these from "./app".
export { reduce, type State, type Action };

/** Picker availability: keyless backends + any provider whose API key is set. */
const hasKey = (entry: ProviderEntry): boolean => entry.envVar === null || !!process.env[entry.envVar];

const SPINNER = spinnerFrames();
const THEME = resolveTheme(process.env);
const VIM_ENABLED = !!process.env.ARGO_VIM;

export function App(props: { setup: RunSetup; repoRoot: string }): ReactElement {
  const { setup, repoRoot } = props;
  const app = useApp();
  const [state, dispatch] = useReducer(reduce, { entries: [] as Entry[], streaming: "", busy: false, status: "idle", queued: [] });
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
  const { pending, requestApproval, chooseApproval } = useApproval(dispatch, modeRef);
  const { overlay, setOverlay, sessionList, buildCtx, openSessions, resumeSession, newSession, removeSession, openModel, selectModel } =
    useOverlays({ convoRef, replStateRef, setup, repoRoot, activeProvider, setActiveProvider, dispatch });

  if (convoRef.current === null) {
    convoRef.current = createConversation(setup.systemPrompt, {
      provider: setup.provider, safety: setup.safety, registry: setup.registry, root: repoRoot,
      maxIterations: Number(process.env.ARGO_MAX_ITER) || undefined,
      summarize: buildSummarizer(setup.provider),
      onThinking: (text) => dispatch({ t: "thinking", text }),
      onTextDelta: (d) => dispatch({ t: "delta", d }),
      onToolCall: (name, args) => dispatch({ t: "toolCall", name, ...toolDisplay(name, args) }),
      onToolResult: (name, ok, output, diff) => dispatch({ t: "toolResult", name, ok, errorLine: ok ? undefined : firstLine(output), diff }),
      requestApproval,
    });
  }

  useEffect(() => { void gatherBannerData(setup, replStateRef.current.sessionId, process.env).then(setBanner); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { void listRepoFiles(repoRoot).then(setAtFiles); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!state.busy) return;
    const id = setInterval(() => setFrame((f) => (f + 1) % SPINNER.length), 120);
    return () => clearInterval(id);
  }, [state.busy]);
  useEffect(() => { if (pending) notify({ title: "Argo", message: "needs your approval" }); }, [pending]);

  const { sendToAgent } = useAgentSend(dispatch, convoRef, replStateRef, state.busy, state.queued, setup.safety, setup.goals);

  // Slash palette — suggest matching commands while typing a bare `/word`.
  const slashHead = !pending && !overlay && !state.busy && input.startsWith("/") && !input.slice(1).includes(" ") ? input.slice(1) : null;
  const matches = slashHead !== null ? SLASH_COMMANDS.filter((c) => c.name.startsWith(slashHead)) : [];
  const showPalette = matches.length > 0;
  useEffect(() => setSel(0), [slashHead]);
  useInput((_in, key) => {
    if (key.upArrow) setSel((s) => (s - 1 + matches.length) % matches.length);
    else if (key.downArrow) setSel((s) => (s + 1) % matches.length);
    else if (key.tab) setInput(`/${(matches[sel] ?? matches[0])!.name} `);
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

  // Shift+tab cycles the approval mode. Keep modeRef in sync so requestApproval
  // always reads the latest value without closing over stale state.
  useInput((_in, key) => {
    if (key.tab && key.shift) {
      setMode((prev) => {
        const next = nextMode(prev);
        modeRef.current = next;
        dispatch({ t: "note", text: next === "auto" ? "⚡ auto-approve mode — ⇧⇥ to return to review" : "● review mode — approvals restored" });
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
      if (r.cleared) dispatch({ t: "clear" });
      if (r.output) dispatch({ t: "note", text: r.output });
      if (r.resend) sendToAgent(r.resend);
    });
  };

  const submit = (raw: string): void => {
    const line = raw.trim();
    setInput("");
    if (line) setInputHistory((h) => [...h, line]);
    if (!line || pending) return;
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

  const cols = process.stdout.columns ?? 80;
  const w = Math.max(24, Math.min(cols - 2, 100));
  const estTokens = estimateTokens(convoRef.current?.messages ?? [], state.streaming);
  const elapsedMs = state.busy && Date.now();
  const hint = showPalette || showAtPalette ? "↑↓ select · tab complete · ⏎ run" : showHelp ? "? ⏎ — close help" : "/help  /clear  ?  /exit";

  return (
    <Box flexDirection="column" paddingX={1}>
      <Static items={banner ? [banner] : []}>{(d) => <Banner key="banner" data={d} />}</Static>
      <Transcript entries={state.entries} streaming={state.streaming} />
      {pending ? (
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
          <ModelPicker providers={PROVIDER_CATALOG} currentProviderId={process.env.ARGO_PROVIDER ?? "openai"} currentModel={activeProvider.modelId()} hasKey={hasKey} width={w} onSelect={selectModel} onCancel={() => setOverlay(null)} />
          <Box borderStyle="round" borderColor="gray" paddingX={1} width={w}><Text dimColor>{"› "}picking model…</Text></Box>
        </Box>
      ) : (
        <Box flexDirection="column" marginTop={1}>
          {showHelp && <HelpOverlay width={w} vimEnabled={VIM_ENABLED} />}
          <Box borderStyle="round" borderColor={state.busy ? "gray" : THEME.border} paddingX={1} width={w}>
            <Text color={state.busy ? "gray" : THEME.primary}>{"› "}</Text>
            <Composer value={input} onChange={setInput} onSubmit={submit} placeholder={state.busy ? "working…" : "Ask Argo anything — /help for commands"} history={inputHistory} isHistoryActive={!showPalette && !showAtPalette && !state.busy} vimEnabled={VIM_ENABLED} onVimModeChange={setVimMode} />
          </Box>
          {showPalette ? <Palette matches={matches} sel={Math.min(sel, matches.length - 1)} width={w} /> : null}
          {showAtPalette ? <Palette matches={atMatches.map((f) => ({ name: f, desc: "" }))} sel={Math.min(atSel, atMatches.length - 1)} width={w} /> : null}
          <StatusBar status={state.status} busy={state.busy} spinner={SPINNER[frame] ?? "⠋"} model={activeProvider.modelId()} estTokens={estTokens} contextWindow={activeProvider.contextWindow()} elapsedMs={typeof elapsedMs === "number" ? elapsedMs : 0} width={w} hint={hint} mode={mode} primaryColor={THEME.primary} vimMode={VIM_ENABLED ? vimMode : undefined} />
        </Box>
      )}
    </Box>
  );
}
