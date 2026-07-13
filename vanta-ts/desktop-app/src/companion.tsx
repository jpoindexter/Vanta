import { useEffect, useRef, useState } from "react";
import type { Dispatch, FormEvent, SetStateAction } from "react";
import { App } from "@capacitor/app";
import type { Approval, ApprovalDecision, EventRow, Message, Session, Status } from "./types.js";
import { companionClient, HOST_KEY, isLocalCompanion, isNativeCompanion, mobileSmokeConfig, normalizeHost, parsePairLink, postJson, streamCompanionEvents, TOKEN_KEY } from "./companion-client.js";

export function CompanionApp() {
  const native = isNativeCompanion();
  const smoke = mobileSmokeConfig();
  const local = isLocalCompanion(window.location.hostname, native, window.location.search);
  const [token, setToken] = useState(() => window.localStorage.getItem(TOKEN_KEY) ?? smoke.token);
  const [host, setHost] = useState(() => window.localStorage.getItem(HOST_KEY) ?? (smoke.host || (native ? "" : window.location.origin)));
  const [status, setStatus] = useState<Status | null>(null);
  const [approval, setApproval] = useState<Approval | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [streamText, setStreamText] = useState("");
  const [error, setError] = useState("");
  const paired = local || !!token;
  const api = companionClient(token, host);
  const smokeSent = useRef(false);
  useCompanionPoll({ paired, token, host, setStatus, setApproval, setSessions, setError });
  useCompanionEventStream({ paired, local, token, host, setStreamText, setEvents, setError });
  const sendMessage = companionSender({ api, setMessages, setEvents, setStreamText, setError });
  useEffect(() => {
    if (!paired || !smoke.message || smokeSent.current) return;
    smokeSent.current = true; void sendMessage(smoke.message);
  }, [paired, smoke.message]);

  if (!paired) return <PairCompanion native={native} initialHost={host} onPaired={(next, nextHost) => {
    window.localStorage.setItem(TOKEN_KEY, next); window.localStorage.setItem(HOST_KEY, nextHost); setHost(nextHost); setToken(next);
  }} />;
  return (
    <div className="companion-shell">
      <header className="companion-header">
        <div><p className="eyebrow">Vanta Companion</p><h1>{status?.kernel === "online" ? "Online" : "Connecting"}</h1></div>
        <span className={status?.kernel === "online" ? "presence-dot online" : "presence-dot"} aria-label={status?.kernel ?? "connecting"} />
        <p>{status?.model ?? "Waiting for host"}</p>
      </header>
      <CompanionSessions sessions={sessions} current={status?.sessionId} onNew={async () => {
        const next = await api<{ id: string }>("/sessions/new", postJson({})); setStatus((current) => current ? { ...current, sessionId: next.id } : current); setMessages([]); setEvents([]);
      }} onOpen={async (id) => {
        const opened = await api<{ id: string; messages: Message[] }>("/sessions/open", postJson({ id })); setStatus((current) => current ? { ...current, sessionId: opened.id } : current); setMessages(opened.messages); setEvents([]);
      }} />
      {approval ? <CompanionApproval approval={approval} answer={async (decision) => { await api("/approval", postJson({ id: approval.id, decision })); setApproval(null); }} /> : null}
      <CompanionThread messages={messages} events={events} streamText={streamText} />
      <CompanionComposer onSend={sendMessage} />
      {error ? <p className="companion-error" role="alert">{error}</p> : null}
    </div>
  );
}

function companionSender(deps: { api: ReturnType<typeof companionClient>; setMessages: Dispatch<SetStateAction<Message[]>>; setEvents: Dispatch<SetStateAction<EventRow[]>>; setStreamText: Dispatch<SetStateAction<string>>; setError: Dispatch<SetStateAction<string>> }) {
  return async (message: string) => {
    deps.setMessages((current) => [...current, { role: "user", content: message }]); deps.setError(""); deps.setStreamText("");
    try {
      const result = await deps.api<{ finalText: string; events?: EventRow[] }>("/chat", postJson({ message }));
      deps.setMessages((current) => [...current, { role: "assistant", content: result.finalText }]); deps.setStreamText(""); deps.setEvents(result.events ?? []);
    } catch (cause) { deps.setError((cause as Error).message); }
  };
}

type PollState = {
  paired: boolean; token: string; host: string;
  setStatus: Dispatch<SetStateAction<Status | null>>; setApproval: Dispatch<SetStateAction<Approval | null>>;
  setSessions: Dispatch<SetStateAction<Session[]>>; setError: Dispatch<SetStateAction<string>>;
};

function useCompanionPoll(state: PollState): void {
  useEffect(() => {
    if (!state.paired) return;
    let active = true;
    const api = companionClient(state.token, state.host);
    async function poll() {
      const [status, approval, sessions] = await Promise.all([api<Status>("/status"), api<Approval | null>("/approval"), api<Session[]>("/sessions")]);
      if (active) { state.setStatus(status); state.setApproval(approval); state.setSessions(sessions); state.setError(""); }
    }
    void poll().catch((cause) => state.setError((cause as Error).message));
    const id = window.setInterval(() => void poll().catch(() => undefined), 1_500);
    return () => { active = false; window.clearInterval(id); };
  }, [state.paired, state.token, state.host]);
}

type StreamState = Pick<PollState, "paired" | "token" | "host" | "setError"> & { local: boolean; setStreamText: Dispatch<SetStateAction<string>>; setEvents: Dispatch<SetStateAction<EventRow[]>> };

function useCompanionEventStream(state: StreamState): void {
  useEffect(() => {
    if (!state.paired || state.local) return;
    const controller = new AbortController();
    void streamCompanionEvents({ token: state.token, host: state.host, signal: controller.signal, onEvent: (event) => {
      if (event.delta) state.setStreamText((current) => current + event.delta);
      else if (event.label) state.setEvents((current) => [...current.slice(-9), event]);
    }}).catch((cause) => { if (!controller.signal.aborted) state.setError((cause as Error).message); });
    return () => controller.abort();
  }, [state.paired, state.token, state.host, state.local]);
}

function PairCompanion(props: { native: boolean; initialHost: string; onPaired: (token: string, host: string) => void }) {
  const [code, setCode] = useState("");
  const [host, setHost] = useState(props.initialHost);
  const [name, setName] = useState(() => navigator.userAgent.includes("iPhone") ? "iPhone" : "Mobile companion");
  const [error, setError] = useState("");
  const handledPairUrls = useRef(new Set<string>());
  useEffect(() => {
    if (!props.native) return;
    async function pairUrl(value?: string) {
      if (!value || handledPairUrls.current.has(value)) return;
      const pair = value ? parsePairLink(value) : null;
      if (!pair) return;
      handledPairUrls.current.add(value);
      setHost(pair.host); setCode(pair.code); setError("");
      try {
        const result = await companionClient("", pair.host)<{ token: string }>("/pair", postJson({ code: pair.code, name }));
        props.onPaired(result.token, pair.host);
      } catch (cause) { setError((cause as Error).message); }
    }
    void App.getLaunchUrl().then((launch) => pairUrl(launch?.url));
    const listener = App.addListener("appUrlOpen", (event) => void pairUrl(event.url));
    return () => { void listener.then((handle) => handle.remove()); };
  }, [props.native, name]);
  async function submit(event: FormEvent) {
    event.preventDefault(); setError("");
    try {
      const target = normalizeHost(host);
      const result = await companionClient("", target)<{ token: string }>("/pair", postJson({ code: code.toUpperCase(), name }));
      props.onPaired(result.token, target);
    } catch (cause) { setError((cause as Error).message); }
  }
  return (
    <main className="pair-shell">
      <form className="pair-form" onSubmit={submit}>
        <p className="eyebrow">Vanta Companion</p><h1>Pair this device</h1>
        {props.native ? <label>Vanta host<input value={host} onChange={(event) => setHost(event.target.value)} inputMode="url" placeholder="http://192.168.1.10:7790" autoCapitalize="none" autoCorrect="off" /></label> : null}
        <label>Device name<input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" /></label>
        <label>Pairing code<input value={code} onChange={(event) => setCode(event.target.value.replace(/[^a-zA-Z0-9]/g, "").slice(0, 6))} autoCapitalize="characters" autoComplete="one-time-code" inputMode="text" /></label>
        <button type="submit" disabled={code.length !== 6 || (props.native && !normalizeHost(host))}>Pair</button>
        {error ? <p className="companion-error" role="alert">{error}</p> : null}
      </form>
    </main>
  );
}

function CompanionApproval(props: { approval: Approval; answer: (decision: ApprovalDecision) => Promise<void> }) {
  const request = props.approval.request;
  return (
    <section className="companion-approval" aria-labelledby="approval-title">
      <p className="eyebrow">Approval needed</p><h2 id="approval-title">{request?.title ?? props.approval.action}</h2>
      <p>{request?.subject ?? props.approval.reason}</p>
      <div><button type="button" onClick={() => void props.answer("deny")}>Deny</button><button className="primary" type="button" onClick={() => void props.answer("allow")}>Allow once</button></div>
    </section>
  );
}

function CompanionSessions(props: { sessions: Session[]; current?: string; onNew: () => Promise<void>; onOpen: (id: string) => Promise<void> }) {
  return <nav className="companion-sessions" aria-label="Sessions"><select aria-label="Current session" value={props.current ?? ""} onChange={(event) => void props.onOpen(event.target.value)}><option value="">Current session</option>{props.sessions.map((session) => <option key={session.id} value={session.id}>{session.title}</option>)}</select><button type="button" onClick={() => void props.onNew()} aria-label="New session">+</button></nav>;
}

function CompanionThread(props: { messages: Message[]; events: EventRow[]; streamText: string }) {
  return (
    <main className="companion-thread" aria-live="polite">
      {!props.messages.length ? <p className="companion-idle">Ready.</p> : props.messages.map((message, index) => <article key={index} className={`companion-message ${message.role}`}><span>{message.role}</span><p>{message.content}</p></article>)}
      {props.streamText ? <article className="companion-message assistant streaming"><span>assistant</span><p>{props.streamText}</p></article> : null}
      {props.events.length ? <p className="companion-events">{props.events.at(-1)?.label}</p> : null}
    </main>
  );
}

function CompanionComposer(props: { onSend: (message: string) => Promise<void> }) {
  const [draft, setDraft] = useState(""); const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) { event.preventDefault(); const message = draft.trim(); if (!message || busy) return; setDraft(""); setBusy(true); try { await props.onSend(message); } finally { setBusy(false); } }
  return <form className="companion-composer" onSubmit={submit}><label htmlFor="companion-message">Ask Vanta</label><textarea id="companion-message" value={draft} onChange={(event) => setDraft(event.target.value)} rows={3} disabled={busy} /><button type="submit" disabled={busy || !draft.trim()}>{busy ? "Working" : "Send"}</button></form>;
}
