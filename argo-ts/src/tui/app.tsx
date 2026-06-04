import { useEffect, useReducer, useRef, useState, type ReactElement } from "react";
import { Box, Static, Text, useApp, useInput } from "ink";
import { Composer } from "./composer.js";
import { spinnerFrames } from "./spinners.js";
import { notify, shouldNotify } from "./notify.js";
import { pruneVolatileSkills } from "../skills/volatile.js";
import { createConversation, type Conversation } from "../agent.js";
import { buildSummarizer } from "../session.js";
import { saveSession, newSessionId } from "../sessions/store.js";
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
import type { LLMProvider } from "../providers/interface.js";
import type { RunSetup } from "../session.js";

/** Picker availability: keyless backends + any provider whose API key is set. */
const hasKey = (entry: ProviderEntry): boolean => entry.envVar === null || !!process.env[entry.envVar];

// The Ink TUI — a Claude-CLI-style terminal app: streaming transcript, live
// status line, input composer, inline approval prompts. Renders the streaming
// engine's events (onTextDelta / onToolCall / onToolResult) live. Slash commands
// here are a minimal set; the readline REPL keeps the full set.

export type State = { entries: Entry[]; streaming: string; busy: boolean; status: string; queued: string[] };

export type Action =
  | { t: "user"; text: string }
  | { t: "delta"; d: string }
  | { t: "toolCall"; name: string; icon: string; verb: string; detail: string }
  | { t: "toolResult"; name: string; ok: boolean; errorLine?: string }
  | { t: "commit"; finalText: string }
  | { t: "note"; text: string }
  | { t: "enqueue"; text: string }
  | { t: "dequeue" }
  | { t: "clear" };

const SPINNER = spinnerFrames();

function commitStreaming(entries: Entry[], streaming: string): Entry[] {
  return streaming.trim() ? [...entries, { kind: "assistant", text: streaming }] : entries;
}

export function reduce(s: State, a: Action): State {
  switch (a.t) {
    case "user":
      return { ...s, entries: [...s.entries, { kind: "user", text: a.text }], busy: true, streaming: "", status: "thinking" };
    case "delta":
      return { ...s, streaming: s.streaming + a.d, status: "generating" };
    case "toolCall":
      return {
        ...s,
        entries: [
          ...commitStreaming(s.entries, s.streaming),
          { kind: "tool", name: a.name, icon: a.icon, verb: a.verb, detail: a.detail },
        ],
        streaming: "",
        status: `${a.verb}${a.detail ? ` ${a.detail}` : ""}`,
      };
    case "toolResult": {
      const entries = [...s.entries];
      for (let i = entries.length - 1; i >= 0; i--) {
        const e = entries[i];
        if (e && e.kind === "tool" && e.name === a.name && e.ok === undefined) {
          entries[i] = { ...e, ok: a.ok, errorLine: a.errorLine };
          break;
        }
      }
      return { ...s, entries, status: "thinking" };
    }
    case "commit": {
      const text = s.streaming.trim() || a.finalText;
      const entries = text ? [...s.entries, { kind: "assistant" as const, text }] : s.entries;
      return { ...s, entries, streaming: "", busy: false, status: "idle" };
    }
    case "note":
      return { ...s, entries: [...s.entries, { kind: "note", text: a.text }] };
    case "enqueue":
      // Type-ahead while busy: queue the message + show it now; drained on commit.
      return { ...s, entries: [...s.entries, { kind: "note", text: `⏎ queued: ${a.text}` }], queued: [...s.queued, a.text] };
    case "dequeue":
      return { ...s, queued: s.queued.slice(1) };
    case "clear":
      return { entries: [], streaming: "", busy: false, status: "idle", queued: [] };
  }
}

export function App(props: { setup: RunSetup; repoRoot: string }): ReactElement {
  const { setup, repoRoot } = props;
  const app = useApp();
  const [state, dispatch] = useReducer(reduce, { entries: [], streaming: "", busy: false, status: "idle", queued: [] });
  const [input, setInput] = useState("");
  const [frame, setFrame] = useState(0);
  const [sel, setSel] = useState(0);
  const [banner, setBanner] = useState<BannerData | null>(null);
  // Single source of truth for the live model — the /model picker swaps this and
  // the conversation's provider together, so every read here stays consistent.
  const [activeProvider, setActiveProvider] = useState<LLMProvider>(setup.provider);
  const turnStartRef = useRef<number>(0);
  const abortRef = useRef<AbortController | null>(null);
  const convoRef = useRef<Conversation | null>(null);
  const replStateRef = useRef<ReplState>({ sessionId: newSessionId(), started: new Date().toISOString(), turnIndex: 0 });
  const { pending, requestApproval, chooseApproval } = useApproval(dispatch);
  const { overlay, setOverlay, sessionList, buildCtx, openSessions, resumeSession, newSession, removeSession, openModel, selectModel } =
    useOverlays({ convoRef, replStateRef, setup, repoRoot, activeProvider, setActiveProvider, dispatch });

  // Build the conversation once, wiring streaming events to the reducer.
  if (convoRef.current === null) {
    convoRef.current = createConversation(setup.systemPrompt, {
      provider: setup.provider,
      safety: setup.safety,
      registry: setup.registry,
      root: repoRoot,
      maxIterations: Number(process.env.ARGO_MAX_ITER) || undefined,
      summarize: buildSummarizer(setup.provider),
      onTextDelta: (d) => dispatch({ t: "delta", d }),
      onToolCall: (name, args) => dispatch({ t: "toolCall", name, ...toolDisplay(name, args) }),
      onToolResult: (name, ok, output) =>
        dispatch({ t: "toolResult", name, ok, errorLine: ok ? undefined : firstLine(output) }),
      requestApproval,
    });
  }

  // Gather the startup banner once on mount. Rendered via <Static>.
  useEffect(() => {
    void gatherBannerData(setup, replStateRef.current.sessionId, process.env).then(setBanner);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Spinner tick while busy.
  useEffect(() => {
    if (!state.busy) return;
    const id = setInterval(() => setFrame((f) => (f + 1) % SPINNER.length), 120);
    return () => clearInterval(id);
  }, [state.busy]);

  // Send one user turn to the agent + wire its result. Shared by typed input
  // and by /retry (which re-sends the last message via the slash `resend` signal).
  const sendToAgent = (text: string): void => {
    dispatch({ t: "user", text });
    const convo = convoRef.current;
    if (!convo) return;
    replStateRef.current.turnIndex++;
    turnStartRef.current = Date.now();
    const images = replStateRef.current.pendingImages; // attach + consume /image or /paste
    replStateRef.current.pendingImages = undefined;
    const ac = new AbortController();
    abortRef.current = ac;
    void convo
      .send(text, images, ac.signal)
      .then((outcome) => {
        abortRef.current = null;
        dispatch({ t: "commit", finalText: outcome.finalText });
        pruneVolatileSkills(convo.messages);
        if (outcome.usage) {
          dispatch({ t: "note", text: `· ${outcome.usage.inputTokens.toLocaleString()} in / ${outcome.usage.outputTokens.toLocaleString()} out tokens` });
        }
        // Ping when a long turn finishes — you may have looked away.
        if (shouldNotify(Date.now() - turnStartRef.current)) notify({ title: "Argo", message: "turn complete" });
        void saveSession(replStateRef.current.sessionId, convo.messages, { started: replStateRef.current.started, title: replStateRef.current.title }).catch(() => {});
      })
      .catch((err: unknown) => {
        abortRef.current = null;
        dispatch({ t: "note", text: `error: ${err instanceof Error ? err.message : String(err)}` });
        dispatch({ t: "commit", finalText: "" });
      });
  };

  const submit = (raw: string): void => {
    const line = raw.trim();
    setInput("");
    if (!line || pending) return; // approval is handled by the ApprovalPrompt's own keys

    // Slash commands are /word — Finder-dropped paths (/Users/...) have a nested slash.
    const firstToken = line.slice(1).split(/\s/)[0] ?? "";
    if (line.startsWith("/") && !firstToken.includes("/")) {
      const convo = convoRef.current;
      if (!convo) return;
      // A bare prefix (no arg yet, not an exact name) runs the highlighted
      // palette match — so typing `/sta` + Enter runs `/status`.
      const head = line.slice(1).split(/\s+/)[0] ?? "";
      const ms = SLASH_COMMANDS.filter((c) => c.name.startsWith(head));
      const effective =
        !line.slice(1).includes(" ") && ms.length > 0 && !ms.some((c) => c.name === head)
          ? `/${(ms[Math.min(sel, ms.length - 1)] ?? ms[0])!.name}`
          : line;
      // Commands that open an interactive overlay are handled here, not by the
      // string-returning executeSlash (which is shared with the readline REPL).
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
      return;
    }

    // Type-ahead: if a turn is running, queue this message instead of dropping it.
    if (state.busy) {
      dispatch({ t: "enqueue", text: line });
      return;
    }
    // Drag an image or video into the terminal → path arrives as text; attach + send.
    void (async () => {
      const dropped = await maybeDroppedImage(line);
      if (dropped) {
        (replStateRef.current.pendingImages ??= []).push(dropped);
        sendToAgent("Take a look at this image.");
        return;
      }
      const videoPath = await maybeDroppedVideo(line);
      if (videoPath) {
        sendToAgent(`Watch this video and describe what you see: ${videoPath}`);
        return;
      }
      sendToAgent(line);
    })();
  };

  // Drain the type-ahead queue: when a turn finishes and messages are queued,
  // send the next one. (Effect, so it re-runs when busy flips false.)
  const sendRef = useRef(sendToAgent);
  sendRef.current = sendToAgent;
  useEffect(() => {
    if (!state.busy && state.queued.length > 0) {
      const next = state.queued[0]!;
      dispatch({ t: "dequeue" });
      sendRef.current(next);
    }
  }, [state.busy, state.queued]);

  // Ping when Argo needs a human decision (approval), so you can step away.
  useEffect(() => {
    if (pending) notify({ title: "Argo", message: "needs your approval" });
  }, [pending]);

  // Slash palette — suggest matching commands while typing a bare `/word`.
  const slashHead =
    !pending && !overlay && !state.busy && input.startsWith("/") && !input.slice(1).includes(" ") ? input.slice(1) : null;
  const matches = slashHead !== null ? SLASH_COMMANDS.filter((c) => c.name.startsWith(slashHead)) : [];
  const showPalette = matches.length > 0;
  useEffect(() => setSel(0), [slashHead]);
  useInput(
    (_in, key) => {
      if (key.upArrow) setSel((s) => (s - 1 + matches.length) % matches.length);
      else if (key.downArrow) setSel((s) => (s + 1) % matches.length);
      else if (key.tab) setInput(`/${(matches[sel] ?? matches[0])!.name} `);
    },
    { isActive: showPalette },
  );

  // Esc while busy → abort the current turn between iterations.
  useInput(
    (_in, key) => {
      if (key.escape && state.busy && abortRef.current) {
        abortRef.current.abort();
        dispatch({ t: "note", text: "· interrupted" });
      }
    },
    { isActive: state.busy },
  );

  const cols = process.stdout.columns ?? 80;
  const w = Math.max(24, Math.min(cols - 2, 100));
  const estTokens = estimateTokens(convoRef.current?.messages ?? [], state.streaming);
  const elapsedMs = state.busy && turnStartRef.current ? Date.now() - turnStartRef.current : 0;

  return (
    <Box flexDirection="column" paddingX={1}>
      <Static items={banner ? [banner] : []}>{(d) => <Banner key="banner" data={d} />}</Static>

      <Transcript entries={state.entries} streaming={state.streaming} />

      {pending ? (
        <Box flexDirection="column" marginTop={1}>
          <ApprovalPrompt
            action={pending.action}
            reason={pending.reason}
            toolName={pending.toolName}
            width={w}
            onChoose={chooseApproval}
          />
          <Box borderStyle="round" borderColor="gray" paddingX={1} width={w}>
            <Text dimColor>{"› "}awaiting approval…</Text>
          </Box>
        </Box>
      ) : overlay === "sessions" ? (
        <Box flexDirection="column" marginTop={1}>
          <SessionsPicker
            sessions={sessionList}
            currentId={replStateRef.current.sessionId}
            currentTurns={replStateRef.current.turnIndex}
            nowMs={Date.now()}
            width={w}
            onResume={resumeSession}
            onNew={newSession}
            onDelete={removeSession}
            onCancel={() => setOverlay(null)}
          />
          <Box borderStyle="round" borderColor="gray" paddingX={1} width={w}>
            <Text dimColor>{"› "}choosing session…</Text>
          </Box>
        </Box>
      ) : overlay === "model" ? (
        <Box flexDirection="column" marginTop={1}>
          <ModelPicker
            providers={PROVIDER_CATALOG}
            currentProviderId={process.env.ARGO_PROVIDER ?? "openai"}
            currentModel={activeProvider.modelId()}
            hasKey={hasKey}
            width={w}
            onSelect={selectModel}
            onCancel={() => setOverlay(null)}
          />
          <Box borderStyle="round" borderColor="gray" paddingX={1} width={w}>
            <Text dimColor>{"› "}picking model…</Text>
          </Box>
        </Box>
      ) : (
        <Box flexDirection="column" marginTop={1}>
          <Box borderStyle="round" borderColor={state.busy ? "gray" : "cyan"} paddingX={1} width={w}>
            <Text color={state.busy ? "gray" : "cyan"}>{"› "}</Text>
            <Composer
              value={input}
              onChange={setInput}
              onSubmit={submit}
              placeholder={state.busy ? "working…" : "Ask Argo anything — /help for commands"}
            />
          </Box>
          {showPalette ? <Palette matches={matches} sel={Math.min(sel, matches.length - 1)} width={w} /> : null}
          <StatusBar
            status={state.status}
            busy={state.busy}
            spinner={SPINNER[frame] ?? "⠋"}
            model={activeProvider.modelId()}
            estTokens={estTokens}
            contextWindow={activeProvider.contextWindow()}
            elapsedMs={elapsedMs}
            width={w}
            hint={showPalette ? "↑↓ select · tab complete · ⏎ run" : "/help  /clear  /exit"}
          />
        </Box>
      )}
    </Box>
  );
}
