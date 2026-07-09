import { FormEvent, useEffect, useState } from "react";
import type { Approval, ApprovalDecision, EventRow, Message, Status } from "./types.js";

const TOKEN_KEY = "vanta.companion.token.v1";

export function CompanionApp() {
  const local = isLocalHost(window.location.hostname) && !new URLSearchParams(window.location.search).has("remote");
  const [token, setToken] = useState(() => window.localStorage.getItem(TOKEN_KEY) ?? "");
  const [status, setStatus] = useState<Status | null>(null);
  const [approval, setApproval] = useState<Approval | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [error, setError] = useState("");
  const paired = local || !!token;
  const api = companionClient(token);

  useEffect(() => {
    if (!paired) return;
    let active = true;
    async function poll() {
      const [nextStatus, nextApproval] = await Promise.all([api<Status>("/status"), api<Approval | null>("/approval")]);
      if (active) { setStatus(nextStatus); setApproval(nextApproval); setError(""); }
    }
    void poll().catch((cause) => setError((cause as Error).message));
    const id = window.setInterval(() => void poll().catch(() => undefined), 1_500);
    return () => { active = false; window.clearInterval(id); };
  }, [paired, token]);

  if (!paired) return <PairCompanion onPaired={(next) => { window.localStorage.setItem(TOKEN_KEY, next); setToken(next); }} />;
  return (
    <div className="companion-shell">
      <header className="companion-header">
        <div><p className="eyebrow">Vanta Companion</p><h1>{status?.kernel === "online" ? "Online" : "Connecting"}</h1></div>
        <span className={status?.kernel === "online" ? "presence-dot online" : "presence-dot"} aria-label={status?.kernel ?? "connecting"} />
        <p>{status?.model ?? "Waiting for host"}</p>
      </header>
      {approval ? <CompanionApproval approval={approval} answer={async (decision) => { await api("/approval", postJson({ id: approval.id, decision })); setApproval(null); }} /> : null}
      <CompanionThread messages={messages} events={events} />
      <CompanionComposer onSend={async (message) => {
        setMessages((current) => [...current, { role: "user", content: message }]); setError("");
        try {
          const result = await api<{ finalText: string; events?: EventRow[] }>("/chat", postJson({ message }));
          setMessages((current) => [...current, { role: "assistant", content: result.finalText }]);
          setEvents(result.events ?? []);
        } catch (cause) { setError((cause as Error).message); }
      }} />
      {error ? <p className="companion-error" role="alert">{error}</p> : null}
    </div>
  );
}

function PairCompanion(props: { onPaired: (token: string) => void }) {
  const [code, setCode] = useState("");
  const [name, setName] = useState(() => navigator.userAgent.includes("iPhone") ? "iPhone" : "Mobile companion");
  const [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault(); setError("");
    try {
      const result = await companionClient("")<{ token: string }>("/pair", postJson({ code: code.toUpperCase(), name }));
      props.onPaired(result.token);
    } catch (cause) { setError((cause as Error).message); }
  }
  return (
    <main className="pair-shell">
      <form className="pair-form" onSubmit={submit}>
        <p className="eyebrow">Vanta Companion</p><h1>Pair this device</h1>
        <label>Device name<input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" /></label>
        <label>Pairing code<input value={code} onChange={(event) => setCode(event.target.value.replace(/[^a-zA-Z0-9]/g, "").slice(0, 6))} autoCapitalize="characters" autoComplete="one-time-code" inputMode="text" /></label>
        <button type="submit" disabled={code.length !== 6}>Pair</button>
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

function CompanionThread(props: { messages: Message[]; events: EventRow[] }) {
  return (
    <main className="companion-thread" aria-live="polite">
      {!props.messages.length ? <p className="companion-idle">Ready.</p> : props.messages.map((message, index) => <article key={index} className={`companion-message ${message.role}`}><span>{message.role}</span><p>{message.content}</p></article>)}
      {props.events.length ? <p className="companion-events">{props.events.at(-1)?.label}</p> : null}
    </main>
  );
}

function CompanionComposer(props: { onSend: (message: string) => Promise<void> }) {
  const [draft, setDraft] = useState(""); const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) { event.preventDefault(); const message = draft.trim(); if (!message || busy) return; setDraft(""); setBusy(true); try { await props.onSend(message); } finally { setBusy(false); } }
  return <form className="companion-composer" onSubmit={submit}><label htmlFor="companion-message">Ask Vanta</label><textarea id="companion-message" value={draft} onChange={(event) => setDraft(event.target.value)} rows={3} disabled={busy} /><button type="submit" disabled={busy || !draft.trim()}>{busy ? "Working" : "Send"}</button></form>;
}

function companionClient(token: string) {
  return async function api<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers); if (token) headers.set("authorization", `Bearer ${token}`);
    const response = await fetch(`/api/companion${path}`, { ...init, headers });
    const body = await response.json(); if (!response.ok) throw new Error(body.error ?? "request failed"); return body as T;
  };
}

function postJson(body: unknown): RequestInit { return { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }; }
function isLocalHost(host: string): boolean { return host === "127.0.0.1" || host === "localhost" || host === "::1"; }
