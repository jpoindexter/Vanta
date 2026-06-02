import { useEffect, useReducer, useRef, useState, type ReactElement } from "react";
import { Box, Text, useApp } from "ink";
import TextInput from "ink-text-input";
import { createConversation, type Conversation } from "../agent.js";
import { buildSummarizer } from "../session.js";
import { saveSession, newSessionId } from "../sessions/store.js";
import type { RunSetup } from "../session.js";

// The Ink TUI — a Claude-CLI-style terminal app: streaming transcript, live
// status line, input composer, inline approval prompts. Renders the streaming
// engine's events (onTextDelta / onToolCall / onToolResult) live. Slash commands
// here are a minimal set; the readline REPL keeps the full set.

type Entry =
  | { kind: "user"; text: string }
  | { kind: "assistant"; text: string }
  | { kind: "tool"; name: string; args: string; ok?: boolean; output?: string }
  | { kind: "note"; text: string };

export type State = { entries: Entry[]; streaming: string; busy: boolean; status: string };

export type Action =
  | { t: "user"; text: string }
  | { t: "delta"; d: string }
  | { t: "toolCall"; name: string; args: string }
  | { t: "toolResult"; name: string; ok: boolean; output: string }
  | { t: "commit"; finalText: string }
  | { t: "note"; text: string }
  | { t: "clear" };

const SPINNER = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

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
        entries: [...commitStreaming(s.entries, s.streaming), { kind: "tool", name: a.name, args: a.args }],
        streaming: "",
        status: a.name,
      };
    case "toolResult": {
      const entries = [...s.entries];
      for (let i = entries.length - 1; i >= 0; i--) {
        const e = entries[i];
        if (e && e.kind === "tool" && e.name === a.name && e.ok === undefined) {
          entries[i] = { ...e, ok: a.ok, output: a.output };
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
    case "clear":
      return { entries: [], streaming: "", busy: false, status: "idle" };
  }
}

const shortArgs = (a: Record<string, unknown>): string => {
  const s = JSON.stringify(a);
  return s.length > 60 ? `${s.slice(0, 57)}...` : s;
};
const firstLine = (t: string): string => {
  const l = (t.split("\n")[0] ?? "").trim();
  return l.length > 80 ? `${l.slice(0, 77)}...` : l;
};

const SLASH_HELP_TUI =
  "/help /clear /model /exit — anything else is sent to the agent. (Full slash set: run `argo` without the TUI.)";

export function App(props: { setup: RunSetup; repoRoot: string }): ReactElement {
  const { setup, repoRoot } = props;
  const app = useApp();
  const [state, dispatch] = useReducer(reduce, { entries: [], streaming: "", busy: false, status: "idle" });
  const [input, setInput] = useState("");
  const [frame, setFrame] = useState(0);
  const [pending, setPending] = useState<{ action: string; reason: string } | null>(null);
  const approvalResolve = useRef<((ok: boolean) => void) | null>(null);
  const convoRef = useRef<Conversation | null>(null);
  const sessionRef = useRef({ id: newSessionId(), started: new Date().toISOString() });

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
      onToolCall: (name, args) => dispatch({ t: "toolCall", name, args: shortArgs(args) }),
      onToolResult: (name, ok, output) => dispatch({ t: "toolResult", name, ok, output: firstLine(output) }),
      requestApproval: (action, reason) =>
        new Promise<boolean>((resolve) => {
          approvalResolve.current = resolve;
          setPending({ action, reason });
        }),
    });
  }

  // Spinner tick while busy.
  useEffect(() => {
    if (!state.busy) return;
    const id = setInterval(() => setFrame((f) => (f + 1) % SPINNER.length), 120);
    return () => clearInterval(id);
  }, [state.busy]);

  const submit = (raw: string): void => {
    const line = raw.trim();
    setInput("");
    if (!line) return;

    if (pending) {
      const ok = /^y/i.test(line);
      approvalResolve.current?.(ok);
      approvalResolve.current = null;
      setPending(null);
      dispatch({ t: "note", text: ok ? "✓ approved" : "✗ denied" });
      return;
    }

    if (line.startsWith("/")) {
      const cmd = line.slice(1).split(/\s+/)[0];
      if (cmd === "exit" || cmd === "quit") return void app.exit();
      if (cmd === "clear" || cmd === "new") {
        convoRef.current?.messages.splice(1);
        sessionRef.current = { id: newSessionId(), started: new Date().toISOString() };
        return void dispatch({ t: "clear" });
      }
      if (cmd === "help") return void dispatch({ t: "note", text: SLASH_HELP_TUI });
      if (cmd === "model")
        return void dispatch({ t: "note", text: `${setup.provider.modelId()} · ${setup.provider.contextWindow().toLocaleString()} ctx` });
      return void dispatch({ t: "note", text: `unknown command /${cmd ?? ""} — /help` });
    }

    dispatch({ t: "user", text: line });
    const convo = convoRef.current;
    if (!convo) return;
    void convo
      .send(line)
      .then((outcome) => {
        dispatch({ t: "commit", finalText: outcome.finalText });
        void saveSession(sessionRef.current.id, convo.messages, { started: sessionRef.current.started }).catch(() => {});
      })
      .catch((err: unknown) => {
        dispatch({ t: "note", text: `error: ${err instanceof Error ? err.message : String(err)}` });
        dispatch({ t: "commit", finalText: "" });
      });
  };

  const cols = process.stdout.columns ?? 80;
  const w = Math.max(24, Math.min(cols - 2, 100));
  const statusText = state.busy ? `${SPINNER[frame] ?? "⠋"} ${state.status}` : "● ready";

  return (
    <Box flexDirection="column" paddingX={1}>
      <Box marginBottom={1}>
        <Text color="cyan" bold>
          ⚓ Argo
        </Text>
        <Text dimColor>  trusted operator · {setup.provider.modelId()}</Text>
      </Box>

      <Transcript entries={state.entries} streaming={state.streaming} />

      {pending ? (
        <Box flexDirection="column" marginTop={1}>
          <Text color="yellow">⚠ approve: {pending.action}</Text>
          <Text dimColor>{pending.reason}</Text>
          <Box borderStyle="round" borderColor="yellow" paddingX={1} width={w}>
            <Text color="yellow">approve (y/n) › </Text>
            <TextInput value={input} onChange={setInput} onSubmit={submit} />
          </Box>
        </Box>
      ) : (
        <Box flexDirection="column" marginTop={1}>
          <Box borderStyle="round" borderColor={state.busy ? "gray" : "cyan"} paddingX={1} width={w}>
            <Text color={state.busy ? "gray" : "cyan"}>{"› "}</Text>
            <TextInput
              value={input}
              onChange={setInput}
              onSubmit={submit}
              placeholder={state.busy ? "working…" : "Ask Argo anything — /help for commands"}
            />
          </Box>
          <Box width={w} justifyContent="space-between">
            <Text dimColor>
              {statusText} · {setup.provider.modelId()}
            </Text>
            <Text dimColor>/help  /clear  /exit</Text>
          </Box>
        </Box>
      )}
    </Box>
  );
}

function Transcript(props: { entries: Entry[]; streaming: string }): ReactElement {
  return (
    <Box flexDirection="column">
      {props.entries.map((e, i) => (
        <EntryLine key={i} entry={e} />
      ))}
      {props.streaming.trim() ? <Text>{props.streaming}</Text> : null}
    </Box>
  );
}

function EntryLine(props: { entry: Entry }): ReactElement {
  const e = props.entry;
  if (e.kind === "user") return <Text color="cyan">› {e.text}</Text>;
  if (e.kind === "assistant") return <Text>{e.text}</Text>;
  if (e.kind === "note") return <Text dimColor>  {e.text}</Text>;
  const mark = e.ok === undefined ? "→" : e.ok ? "✓" : "✗";
  const tail = e.output !== undefined ? `: ${e.output}` : `(${e.args})`;
  return (
    <Text dimColor>
      {"  "}
      {mark} {e.name}
      {tail}
    </Text>
  );
}

