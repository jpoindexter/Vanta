import { useEffect, useState, type KeyboardEvent, type RefObject } from "react";
import { RotateCcw, X } from "lucide-react";
import type { Session } from "./types.js";

export type SessionDeleteAction = "trash" | "restore" | "permanent";
type Notice = { message: string; tone: "success" | "error"; action?: { label: string; run: () => Promise<unknown> } };
type Callbacks = {
  rename: (id: string, title: string) => void | Promise<void>;
  archive: (id: string, archived: boolean) => void | Promise<void>;
  remove: (id: string, action: SessionDeleteAction) => void | Promise<void>;
  pin: (id: string, pinned: boolean) => void | Promise<void>;
  reorderPins: (orderedIds: string[]) => void | Promise<void>;
};

export function useSessionSafeOps(callbacks: Callbacks) {
  const [pendingIds, setPendingIds] = useState<Set<string>>(() => new Set());
  const [notice, setNotice] = useState<Notice | null>(null);

  async function run(options: { targets: Session[]; perform: (session: Session) => void | Promise<void>; message: string; undo?: () => Promise<unknown> }): Promise<boolean> {
    const ids = new Set(options.targets.map((session) => session.id));
    setPendingIds((current) => new Set([...current, ...ids]));
    try {
      await Promise.all(options.targets.map(options.perform));
      setNotice({ message: options.message, tone: "success", ...(options.undo ? { action: { label: "Undo", run: options.undo } } : {}) });
      return true;
    } catch (reason) {
      setNotice({ message: reason instanceof Error ? reason.message : String(reason), tone: "error" });
      return false;
    } finally {
      setPendingIds((current) => new Set([...current].filter((id) => !ids.has(id))));
    }
  }

  async function rename(session: Session, title: string) {
    return run({ targets: [session], perform: () => callbacks.rename(session.id, title), message: `Renamed to “${title}”.` });
  }

  async function archive(targets: Session[], archived: boolean): Promise<boolean> {
    const count = targets.length;
    return run({ targets, perform: (session) => callbacks.archive(session.id, archived), message: `${archived ? "Archived" : "Restored"} ${count} session${count === 1 ? "" : "s"}.`, undo: () => archive(targets, !archived) });
  }

  async function remove(targets: Session[], action: SessionDeleteAction): Promise<boolean> {
    const count = targets.length;
    const label = action === "trash" ? "Moved to Trash" : action === "restore" ? "Restored" : "Deleted permanently";
    const undo: (() => Promise<boolean>) | undefined = action === "trash" ? () => remove(targets, "restore") : action === "restore" ? () => remove(targets, "trash") : undefined;
    return run({ targets, perform: (session) => callbacks.remove(session.id, action), message: `${label} ${count} session${count === 1 ? "" : "s"}.`, ...(undo ? { undo } : {}) });
  }

  async function pin(session: Session, pinned: boolean): Promise<boolean> {
    return run({
      targets: [session],
      perform: () => callbacks.pin(session.id, pinned),
      message: `${pinned ? "Pinned" : "Unpinned"} “${session.title}”.`,
      undo: () => pin(session, !pinned),
    });
  }

  async function reorder(session: Session, orderedIds: string[], message: string): Promise<boolean> {
    return run({ targets: [session], perform: () => callbacks.reorderPins(orderedIds), message });
  }

  return { pending: (id: string) => pendingIds.has(id), notice, dismissNotice: () => setNotice(null), rename, archive, remove, pin, reorder };
}

export function SessionNoticeToast(props: { notice: Notice | null; onDismiss: () => void }) {
  if (!props.notice) return null;
  return <div className={`session-notice tone-${props.notice.tone}`} role={props.notice.tone === "error" ? "alert" : "status"} aria-live="polite">
    <span>{props.notice.message}</span>
    {props.notice.action ? <button type="button" onClick={() => { const action = props.notice?.action; props.onDismiss(); void action?.run(); }}><RotateCcw size={13} />{props.notice.action.label}</button> : null}
    <button type="button" aria-label="Dismiss session notice" onClick={props.onDismiss}><X size={14} /></button>
  </div>;
}

export function useSessionMenuDismiss(options: {
  open: boolean;
  setOpen: (open: boolean) => void;
  root: RefObject<HTMLElement | null>;
  trigger: RefObject<HTMLButtonElement | null>;
  menu: RefObject<HTMLDivElement | null>;
}) {
  const { open, setOpen, root, trigger, menu } = options;
  useEffect(() => {
    if (!open) return;
    menu.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const pointer = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: globalThis.KeyboardEvent) => { if (event.key === "Escape") { setOpen(false); trigger.current?.focus(); } };
    document.addEventListener("pointerdown", pointer);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", pointer); document.removeEventListener("keydown", escape); };
  }, [menu, open, root, setOpen, trigger]);
}

export function moveSessionMenuFocus(event: KeyboardEvent<HTMLDivElement>) {
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
  const items = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")];
  if (!items.length) return;
  event.preventDefault();
  const current = items.indexOf(document.activeElement as HTMLButtonElement);
  const index = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : event.key === "ArrowDown" ? (current + 1) % items.length : (current - 1 + items.length) % items.length;
  items[index]?.focus();
}
