import { ArrowDown, ArrowUp, Pin, PinOff } from "lucide-react";
import type { Session } from "./types.js";

export function SessionPinMenuItems(props: {
  session: Session;
  onPin: (pinned: boolean) => Promise<boolean>;
  onMove?: (delta: -1 | 1) => Promise<boolean>;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
  close: () => void;
}) {
  const act = (run: () => Promise<boolean>) => { props.close(); void run(); };
  return <>
    <button role="menuitem" type="button" onClick={() => act(() => props.onPin(!props.session.pinned))}>
      {props.session.pinned ? <PinOff size={14} /> : <Pin size={14} />}{props.session.pinned ? "Unpin" : "Pin"}
    </button>
    {props.session.pinned ? <>
      <button role="menuitem" type="button" disabled={!props.canMoveUp} onClick={() => act(() => props.onMove?.(-1) ?? Promise.resolve(false))}><ArrowUp size={14} />Move up</button>
      <button role="menuitem" type="button" disabled={!props.canMoveDown} onClick={() => act(() => props.onMove?.(1) ?? Promise.resolve(false))}><ArrowDown size={14} />Move down</button>
    </> : null}
  </>;
}
