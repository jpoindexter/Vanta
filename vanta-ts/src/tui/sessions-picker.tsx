import { useState, type ReactElement } from "react";
import { useInput } from "ink";
import { Overlay, OverlayRow } from "./overlay.js";
import type { SessionMeta } from "../sessions/store.js";

// The /sessions overlay: the live session, a
// "new session" row, then saved sessions newest-first. ↑↓ move, ⏎ resumes a
// saved session (or starts fresh on the new row), d deletes, Esc/q closes.
// Drives sessions/store.ts directly — no gateway.

const ONE_DAY_MS = 86_400_000;

export type SessionRow =
  | { kind: "live"; turns: number }
  | { kind: "new" }
  | { kind: "session"; meta: SessionMeta };

/** [live, new, ...saved] with the active session filtered out of the saved list. */
export function buildSessionRows(
  sessions: ReadonlyArray<SessionMeta>,
  currentId: string,
  currentTurns: number,
): SessionRow[] {
  const saved = sessions
    .filter((s) => s.id !== currentId)
    .map((meta): SessionRow => ({ kind: "session", meta }));
  return [{ kind: "live", turns: currentTurns }, { kind: "new" }, ...saved];
}

/** Coarse relative time for the row meta. `nowMs` injected so it's testable. */
export function formatWhen(iso: string, nowMs: number): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "—";
  const days = Math.floor((nowMs - t) / ONE_DAY_MS);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return `${days}d ago`;
}

function renderSessionRow(row: SessionRow, i: number, cur: number, nowMs: number): ReactElement {
  const selected = i === cur;
  if (row.kind === "live")
    return <OverlayRow key="live" selected={selected} mark="●" markColor="green" label="live" meta={`${row.turns} turn(s) · now`} />;
  if (row.kind === "new")
    return <OverlayRow key="new" selected={selected} mark="+" markColor="cyan" label="New session" meta="type a prompt to start…" />;
  const m = row.meta;
  return (
    <OverlayRow
      key={m.id}
      selected={selected}
      mark="·"
      markColor="gray"
      label={m.id}
      meta={`${m.title} · ${m.turns}t · ${formatWhen(m.updated, nowMs)}`}
    />
  );
}

type SessionsKeyArgs = {
  rows: SessionRow[];
  cur: number;
  setSel: (fn: (s: number) => number) => void;
  onCancel: () => void;
  onResume: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
};

function activateRow(row: SessionRow, args: Pick<SessionsKeyArgs, "onResume" | "onNew" | "onCancel">): void {
  if (row.kind === "session") { args.onResume(row.meta.id); return; }
  if (row.kind === "new") { args.onNew(); return; }
  args.onCancel();
}

function handleSessionsKey(
  input: string,
  key: { escape?: boolean; upArrow?: boolean; downArrow?: boolean; return?: boolean },
  args: SessionsKeyArgs,
): void {
  const { rows, cur, setSel, onCancel, onResume, onNew, onDelete } = args;
  if (key.escape) { onCancel(); return; }
  if (input === "q") { onCancel(); return; }
  if (key.upArrow) { setSel((s) => (s - 1 + rows.length) % rows.length); return; }
  if (key.downArrow) { setSel((s) => (s + 1) % rows.length); return; }
  const row = rows[cur];
  if (!row) return;
  if (key.return) { activateRow(row, { onResume, onNew, onCancel }); return; }
  if (input === "d" && row.kind === "session") {
    onDelete(row.meta.id);
    setSel((s) => Math.max(0, Math.min(s, rows.length - 2)));
  }
}

export function SessionsPicker(props: {
  sessions: ReadonlyArray<SessionMeta>;
  currentId: string;
  currentTurns: number;
  nowMs: number;
  width: number;
  isActive?: boolean;
  onResume: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onCancel: () => void;
}): ReactElement {
  const rows = buildSessionRows(props.sessions, props.currentId, props.currentTurns);
  const [sel, setSel] = useState(0);
  const cur = Math.min(sel, rows.length - 1);

  useInput(
    (input, key) => {
      handleSessionsKey(input, key, {
        rows, cur, setSel: (fn) => setSel((s) => fn(s)),
        onCancel: props.onCancel, onResume: props.onResume,
        onNew: props.onNew, onDelete: props.onDelete,
      });
    },
    { isActive: props.isActive ?? true },
  );

  return (
    <Overlay
      title="Sessions"
      hint="↑↓ move · ⏎ activate / resume · d delete · Esc close"
      keys="⏎ resume · d delete  |  new row starts a fresh conversation"
      width={props.width}
    >
      {rows.map((row, i) => renderSessionRow(row, i, cur, props.nowMs))}
    </Overlay>
  );
}
