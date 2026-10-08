import { useId, useRef, useState } from "react";
import { Archive, ArchiveRestore, Check, Ellipsis, Pencil, Pin, X } from "lucide-react";
import { chatTitle } from "./chat-first-navigation.js";
import { ChatPreviewDetails, useChatPreview } from "./chat-first-preview.js";
import type { Session } from "./types.js";

type Props = {
  session: Session; active: boolean; locked: boolean; currentSession?: boolean;
  onOpen: (id: string) => void;
  onPin: (id: string, pinned: boolean) => void;
  onArchive: (id: string, archived: boolean) => void;
  onRename: (id: string, title: string) => Promise<boolean>;
};

export function ChatRow(props: Props) {
  const [open, setOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [title, setTitle] = useState(props.session.title);
  const trigger = useRef<HTMLButtonElement>(null);
  const preview = useId();
  const hint = useChatPreview(open);
  const label = chatTitle(props.session);
  function close() { setOpen(false); setRenaming(false); trigger.current?.focus(); }
  async function rename() {
    if (title.trim() && await props.onRename(props.session.id, title.trim())) close();
  }
  return <li ref={hint.row} className="chat-nav-row" data-active={props.active}
    onPointerEnter={hint.onPointerEnter} onPointerLeave={hint.onPointerLeave} onFocus={hint.onFocus} onKeyDown={(event) => {
    if (event.key === "Escape") { event.stopPropagation(); close(); }
  }} onBlur={(event) => {
    hint.onBlur(event);
    if (!event.currentTarget.contains(event.relatedTarget)) { setOpen(false); setRenaming(false); }
  }}>
    <button className="chat-nav-open" type="button" aria-current={props.active ? "page" : undefined}
      aria-describedby={preview} disabled={props.locked && !props.currentSession} onClick={() => { hint.dismiss(); props.onOpen(props.session.id); }}
      title={props.locked && !props.currentSession ? "Stop the current response before switching chats." : undefined}>
      <span>{label}</span>{props.session.pinned ? <Pin size={13} aria-label="Pinned" /> : null}
    </button>
    <button ref={trigger} className="chat-row-action" type="button" aria-label={`Actions for ${label}`}
      aria-expanded={open} disabled={props.locked} onClick={() => setOpen(!open)}><Ellipsis size={17} /></button>
    {!open ? <div ref={hint.card} id={preview} className="chat-hover-preview" role="tooltip" hidden={!hint.visible}>
      <ChatPreviewDetails session={props.session} /></div> : null}
    {open ? <div className="chat-row-menu" role="group" aria-label={`Manage ${label}`}>
      <ChatPreviewDetails session={props.session} />
      {renaming ? <form onSubmit={(event) => { event.preventDefault(); void rename(); }}>
        <label>Chat name<input autoFocus maxLength={160} value={title} onChange={(event) => setTitle(event.target.value)} /></label>
        <button type="submit" disabled={!title.trim()}><Check size={15} />Save name</button>
        <button type="button" onClick={close}><X size={15} />Cancel</button>
      </form> : <RowActions {...props} onRenameStart={() => setRenaming(true)} onClose={close} />}
    </div> : null}
  </li>;
}

function RowActions(props: Props & { onRenameStart: () => void; onClose: () => void }) {
  const session = props.session;
  return <>
    <button type="button" onClick={() => { props.onPin(session.id, !session.pinned); props.onClose(); }}><Pin size={15} />{session.pinned ? "Unpin" : "Pin chat"}</button>
    <button type="button" onClick={props.onRenameStart}><Pencil size={15} />Rename</button>
    <button type="button" onClick={() => { props.onArchive(session.id, !session.archived); props.onClose(); }}>
      {session.archived ? <ArchiveRestore size={15} /> : <Archive size={15} />}{session.archived ? "Restore chat" : "Archive chat"}
    </button>
  </>;
}
