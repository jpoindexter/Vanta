import { IconChevronDown } from "@tabler/icons-react";
import { useState } from "react";

import { SessionActionsMenu } from "@/app/chat/sidebar/session-actions-menu";
import { useI18n } from "@/i18n";
import { pinSession, unpinSession } from "@/store/layout";
import { $pinnedSessionIds } from "@/store/layout";
import { sessionPinId } from "@/store/session";
import type { SessionInfo } from "@/types/desktop";
import { useStore } from "@nanostores/react";

interface TitleMenuProps {
  onArchive: (sessionId: string) => void;
  onBranch: (sessionId: string) => void;
  onDelete: (sessionId: string) => void;
  session: SessionInfo;
  title: string;
}

/** The chat title and its dropdown: rename, pin, archive and the rest of the
 *  session actions. The title text and the chevron chip open the same menu. */
export function TitleMenu({
  onArchive,
  onBranch,
  onDelete,
  session,
  title,
}: TitleMenuProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const pinnedIds = useStore($pinnedSessionIds);
  const pinId = sessionPinId(session);
  const pinned = pinnedIds.includes(pinId);

  return (
    <>
      <button
        className="vs-tb-name"
        onClick={() => setOpen(true)}
        type="button"
      >
        {title}
      </button>
      <SessionActionsMenu
        align="start"
        onArchive={() => onArchive(session.id)}
        onBranch={() => onBranch(session.id)}
        onDelete={() => onDelete(session.id)}
        onOpenChange={setOpen}
        onPin={() => (pinned ? unpinSession(pinId) : pinSession(pinId))}
        open={open}
        pinned={pinned}
        profile={session.profile}
        sessionId={session.id}
        title={title}
        unread={session.unread === true}
      >
        <button
          aria-label={t.vantaShell.titlebar.sessionMenu}
          className="vs-chip"
          type="button"
        >
          <IconChevronDown aria-hidden size={12} />
        </button>
      </SessionActionsMenu>
    </>
  );
}
