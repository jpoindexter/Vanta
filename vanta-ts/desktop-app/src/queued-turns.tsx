import { ArrowDown, ArrowUp, CornerUpLeft, ListOrdered, Pencil, RotateCcw, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api.js";
import type { QueuedTurn, TurnQueueSnapshot } from "./types.js";

type QueueAction =
  | { action: "edit"; id: string; revision: number; message: string }
  | { action: "move"; id: string; revision: number; direction: "up" | "down" }
  | { action: "steer" | "cancel" | "retry"; id: string; revision: number };

const EMPTY_QUEUE: TurnQueueSnapshot = { revision: 0, items: [] };

export function useQueuedTurns(sessionId: string | undefined, watch: boolean) {
  const [snapshot, setSnapshot] = useState<TurnQueueSnapshot>(EMPTY_QUEUE);
  const [error, setError] = useState("");
  const refresh = useCallback(async () => {
    try {
      setSnapshot(await api<TurnQueueSnapshot>("/api/chat/queue"));
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  }, []);
  const mutate = useCallback(async (action: QueueAction) => {
    try {
      setSnapshot(await api<TurnQueueSnapshot>("/api/chat/queue", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(action) }));
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
      await refresh();
    }
  }, [refresh]);
  useEffect(() => { void refresh(); }, [refresh, sessionId]);
  useEffect(() => {
    if (!watch) return;
    const timer = window.setInterval(() => void refresh(), 900);
    return () => window.clearInterval(timer);
  }, [refresh, watch]);
  return { snapshot, error, refresh, mutate };
}

export function QueuedTurnDrawer(props: { open: boolean; items: QueuedTurn[]; error?: string; onClose: () => void; onAction: (action: QueueAction) => void | Promise<void> }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  useEffect(() => {
    if (!props.open) return;
    closeRef.current?.focus();
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") props.onClose(); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [props.open, props.onClose]);
  if (!props.open) return null;
  function beginEdit(item: QueuedTurn) { setEditing(item.id); setDraft(item.instruction); }
  async function save(item: QueuedTurn) {
    if (!draft.trim()) return;
    await props.onAction({ action: "edit", id: item.id, revision: item.revision, message: draft.trim() });
    setEditing(null);
  }
  return (
    <div className="queue-drawer-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) props.onClose(); }}>
      <aside className="queue-drawer" role="dialog" aria-modal="true" aria-labelledby="queued-turns-title">
        <header><div><span>Runs after current task</span><h2 id="queued-turns-title"><ListOrdered size={16} />Queue <small>{props.items.length}</small></h2></div><button ref={closeRef} className="icon-button" type="button" aria-label="Close queue" onClick={props.onClose}><X size={17} /></button></header>
        {props.error ? <p className="queue-error" role="alert">{props.error}</p> : null}
        {!props.items.length ? <div className="queue-empty"><strong>Nothing queued</strong><span>While a task runs, use Queue next in the composer to set what happens after it.</span></div> : null}
        <ol className="queued-turn-list">
          {props.items.map((item, index) => {
            const mutable = item.status !== "starting";
            const failed = item.status === "failed";
            return <li key={item.id} data-status={item.status}>
              <span className="queue-position">{String(index + 1).padStart(2, "0")}</span>
              <div className="queue-copy">
                {editing === item.id ? <form onSubmit={(event) => { event.preventDefault(); void save(item); }}><label className="sr-only" htmlFor={`queue-edit-${item.id}`}>Edit message</label><textarea id={`queue-edit-${item.id}`} autoFocus value={draft} onChange={(event) => setDraft(event.target.value)} /><div><button type="submit">Save</button><button type="button" onClick={() => setEditing(null)}>Cancel</button></div></form> : <strong>{item.instruction}</strong>}
                <span>{item.status === "starting" ? "Starting now" : failed ? `Failed · ${item.failure?.reason ?? "Reason unavailable."}` : item.intent === "steer" ? "Steer now" : "Runs next"} · {item.target.controllerId} · {item.target.model} · {accessLabel(item.target.accessMode)}</span>
              </div>
              <div className="queue-actions" aria-label={`Actions for queued turn ${index + 1}`}>
                <button type="button" aria-label="Move earlier" title="Move earlier" disabled={!mutable || index === 0} onClick={() => void props.onAction({ action: "move", id: item.id, revision: item.revision, direction: "up" })}><ArrowUp size={14} /></button>
                <button type="button" aria-label="Move later" title="Move later" disabled={!mutable || index === props.items.length - 1} onClick={() => void props.onAction({ action: "move", id: item.id, revision: item.revision, direction: "down" })}><ArrowDown size={14} /></button>
                <button type="button" aria-label="Edit message" title="Edit message" disabled={!mutable} onClick={() => beginEdit(item)}><Pencil size={14} /></button>
                <button type="button" aria-label={failed ? "Retry message" : "Steer now"} title={failed ? "Retry message" : "Steer now"} disabled={!mutable || (!failed && item.intent === "steer")} onClick={() => void props.onAction({ action: failed ? "retry" : "steer", id: item.id, revision: item.revision })}>{failed ? <RotateCcw size={14} /> : <CornerUpLeft size={14} />}</button>
                <button type="button" aria-label="Remove from queue" title="Remove from queue" disabled={!mutable} onClick={() => void props.onAction({ action: "cancel", id: item.id, revision: item.revision })}><Trash2 size={14} /></button>
              </div>
            </li>;
          })}
        </ol>
      </aside>
    </div>
  );
}

function accessLabel(mode: QueuedTurn["target"]["accessMode"]): string {
  if (mode === "ask") return "Manual";
  if (mode === "approve") return "Accept edits";
  if (mode === "plan") return "Plan";
  if (mode === "auto") return "Auto";
  return "Full access";
}
