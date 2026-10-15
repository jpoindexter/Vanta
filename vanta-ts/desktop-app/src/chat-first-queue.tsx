import { useState } from "react";
import { ArrowDown, ArrowUp, Check, CornerUpLeft, Pencil, RotateCcw, X } from "lucide-react";
import { api } from "./api.js";
import { post } from "./chat-first-actions.js";
import type { QueuedTurn } from "./types.js";

type Props = { items: QueuedTurn[]; error: string; onRefresh: () => Promise<unknown> };
type QueueChange = { action: "edit"; message: string } | { action: "move"; direction: "up" | "down" } | { action: "cancel" | "steer" | "retry" };

export async function updateQueuedMessage(item: Pick<QueuedTurn, "id" | "revision">, change: QueueChange) {
  return api("/api/chat/queue", post({ ...change, id: item.id, revision: item.revision }));
}

export function ChatFirstQueue(props: Props) {
  if (!props.items.length && !props.error) return null;
  return <section className="chat-inline-queue" aria-label="Queued messages" tabIndex={0}>
    <h2>Queued <span>{props.items.length}</span></h2>
    {props.error ? <p role="alert">Queue unavailable: {props.error}</p> : null}
    <ol>{props.items.map((item, index) => <QueueItem key={item.id} item={item} first={index === 0} last={index === props.items.length - 1} onRefresh={props.onRefresh} />)}</ol>
  </section>;
}

function QueueItem({ item, first, last, onRefresh }: { item: QueuedTurn; first: boolean; last: boolean; onRefresh: Props["onRefresh"] }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.instruction);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const locked = busy || item.status === "starting";
  async function mutate(change: QueueChange) {
    setBusy(true); setError("");
    try {
      await updateQueuedMessage(item, change);
      setEditing(false); await onRefresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); await onRefresh(); }
    finally { setBusy(false); }
  }
  return <li data-status={item.status}>
    {editing ? <form onSubmit={(event) => { event.preventDefault(); void mutate({ action: "edit", message: draft.trim() }); }}>
      <label className="sr-only" htmlFor={`queued-${item.id}`}>Edit queued message</label>
      <textarea autoFocus id={`queued-${item.id}`} value={draft} disabled={locked} onChange={(event) => setDraft(event.target.value)} />
      <button type="submit" disabled={locked || !draft.trim()}><Check size={14} />Save</button>
      <button type="button" onClick={() => setEditing(false)}>Cancel edit</button>
    </form> : <><span className="chat-queued-text">{item.instruction}</span><QueueActions item={item} first={first} last={last} locked={locked}
      onChange={mutate} onEdit={() => { setDraft(item.instruction); setEditing(true); }} /></>}
    <small className="chat-queue-target">{item.intent === "steer" ? "Steer now" : "Runs next"} · {item.target.controllerId} · {item.target.model} · {accessLabels[item.target.accessMode]}</small>
    {item.status !== "queued" ? <small>{item.status === "starting" ? "Starting now" : `Not sent: ${item.failure?.reason ?? "Run failed"}`}</small> : null}
    {error ? <p role="alert">{error}</p> : null}
  </li>;
}

const accessLabels = { ask: "Manual", approve: "Accept edits", plan: "Plan", auto: "Auto", full: "Full access" };

function QueueActions(props: { item: QueuedTurn; first: boolean; last: boolean; locked: boolean; onChange: (change: QueueChange) => Promise<void>; onEdit: () => void }) {
  const { item, locked, onChange } = props;
  const failed = item.status === "failed";
  return <div className="chat-queue-actions">
    <button type="button" aria-label="Move earlier" title="Move earlier" disabled={locked || props.first} onClick={() => void onChange({ action: "move", direction: "up" })}><ArrowUp size={14} /></button>
    <button type="button" aria-label="Move later" title="Move later" disabled={locked || props.last} onClick={() => void onChange({ action: "move", direction: "down" })}><ArrowDown size={14} /></button>
    <button type="button" aria-label="Edit queued message" title="Edit queued message" disabled={locked} onClick={props.onEdit}><Pencil size={14} /></button>
    <button type="button" aria-label={failed ? "Retry message" : "Steer now"} title={failed ? "Retry message" : "Steer now"} disabled={locked || (!failed && item.intent === "steer")}
      onClick={() => void onChange({ action: failed ? "retry" : "steer" })}>{failed ? <RotateCcw size={14} /> : <CornerUpLeft size={14} />}</button>
    <button type="button" aria-label="Remove queued message" title="Remove queued message" disabled={locked} onClick={() => void onChange({ action: "cancel" })}><X size={14} /></button>
  </div>;
}
