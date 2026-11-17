import { Archive,ArchiveRestore,Check,MoreHorizontal,Pencil,Trash2,X } from "lucide-react";
import { useEffect,useRef,useState } from "react";
import { SessionPinMenuItems } from "./session-pinning-controls.js";
import { moveSessionMenuFocus,useSessionMenuDismiss,type SessionDeleteAction } from "./session-safe-ops.js";
import type { Session } from "./types.js";

type Props = {
  session: Session;
  active: boolean;
  selecting?: boolean;
  selected?: boolean;
  pending?: boolean;
  onSelect?: (id: string, range?: boolean) => void;
  onOpen: (id: string) => void;
  onRename: (title: string) => Promise<boolean>;
  onArchive: (archived: boolean) => Promise<boolean>;
  onDelete: (action: SessionDeleteAction) => Promise<boolean>;
  onPin: (pinned: boolean) => Promise<boolean>;
  onMove?: (delta: -1 | 1) => Promise<boolean>;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
};

export function SessionButton(props: Props) {
  const state = useSessionButton(props);
  const className = `${props.active ? "session-row active" : "session-row"}${props.session.pinned ? " pinned" : ""}${props.selecting ? " selecting" : ""}${props.selected ? " selected" : ""}${props.pending ? " pending" : ""}`;
  return <div ref={state.rootRef} className={className} aria-busy={props.pending || undefined}>
    {state.editing ? <SessionRename props={props} state={state} /> : <SessionControls props={props} state={state} />}
  </div>;
}

function useSessionButton(props: Props) {

  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(props.session.title);
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setTitle(props.session.title); }, [props.session.title]);
  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);
  useSessionMenuDismiss({ open: menuOpen, setOpen: setMenuOpen, root: rootRef, trigger: triggerRef, menu: menuRef });

  function startRename() {
    setMenuOpen(false);
    setTitle(props.session.title);
    setEditing(true);
  }
  async function saveRename() {
    const next = title.trim().replace(/\s+/g, " ");
    if (!next || next === props.session.title) { setEditing(false); return; }
    if (await props.onRename(next)) setEditing(false);
  }
  function remove(action: SessionDeleteAction) {
    setMenuOpen(false);
    if (action !== "permanent" || window.confirm(`Delete \"${props.session.title}\" forever? This cannot be undone.`)) void props.onDelete(action);
  }

  return { menuOpen, setMenuOpen, editing, setEditing, title, setTitle, inputRef, rootRef, triggerRef, menuRef, startRename, saveRename, remove };
}

type ViewProps = { props: Props; state: ReturnType<typeof useSessionButton> };

function SessionRename({ props, state }: ViewProps) {
  const { inputRef, title, setTitle, setEditing, saveRename } = state;
  return (
        <form className="session-rename" onSubmit={(event) => { event.preventDefault(); void saveRename(); }}>
          <label className="sr-only" htmlFor={`session-title-${props.session.id}`}>Session title</label>
          <input id={`session-title-${props.session.id}`} ref={inputRef} value={title} maxLength={120} onChange={(event) => setTitle(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); setEditing(false); } }} />
          <button type="submit" disabled={props.pending} aria-label="Save session name" title="Save session name"><Check size={14} /></button>
          <button type="button" disabled={props.pending} aria-label="Cancel rename" title="Cancel rename" onClick={() => setEditing(false)}><X size={14} /></button>
        </form>
  );
}

function SessionControls({ props, state }: ViewProps) {
  const { triggerRef, menuOpen, setMenuOpen } = state;
  return (
        <>
          {props.selecting ? <label className="session-select" title={`Select ${props.session.title}`}><input type="checkbox" checked={!!props.selected} onChange={() => undefined} onClick={(event) => props.onSelect?.(props.session.id, event.shiftKey)} /><span className="sr-only">Select {props.session.title}</span></label> : null}
          <button className="session" type="button" disabled={props.pending} onClick={(event) => props.selecting ? props.onSelect?.(props.session.id, event.shiftKey) : props.onOpen(props.session.id)}>
            <strong>{props.session.title}</strong>
            <span>{props.session.turns} turns</span>
          </button>
          {props.selecting ? null : <button ref={triggerRef} className="session-menu-button" type="button" disabled={props.pending} aria-label={`Manage ${props.session.title}`} aria-haspopup="menu" aria-expanded={menuOpen} title="Manage session" onClick={() => setMenuOpen((open) => !open)}><MoreHorizontal size={16} /></button>}
          {menuOpen ? (
            <SessionActions props={props} state={state} />
          ) : null}
        </>
  );
}

function SessionActions({ props, state }: ViewProps) {
  const { menuRef, remove, startRename, setMenuOpen } = state;
  return (
            <div ref={menuRef} className="session-actions" role="menu" aria-label={`Actions for ${props.session.title}`} onKeyDown={moveSessionMenuFocus}>
              {props.session.trashed ? (
                <>
                  <button role="menuitem" type="button" onClick={() => remove("restore")}><ArchiveRestore size={14} />Restore from Trash</button>
                  <button role="menuitem" className="danger" type="button" onClick={() => remove("permanent")}><Trash2 size={14} />Delete forever</button>
                </>
              ) : (
                <>
                  <button role="menuitem" type="button" onClick={startRename}><Pencil size={14} />Rename</button>
                  <SessionPinMenuItems session={props.session} onPin={props.onPin} onMove={props.onMove} canMoveUp={props.canMoveUp} canMoveDown={props.canMoveDown} close={() => setMenuOpen(false)} />
                  <button role="menuitem" type="button" onClick={() => { setMenuOpen(false); void props.onArchive(!props.session.archived); }}>
                    {props.session.archived ? <ArchiveRestore size={14} /> : <Archive size={14} />}{props.session.archived ? "Restore" : "Archive"}
                  </button>
                  <button role="menuitem" className="danger" type="button" onClick={() => remove("trash")}><Trash2 size={14} />Move to Trash</button>
                </>
              )}
            </div>
  );
}
