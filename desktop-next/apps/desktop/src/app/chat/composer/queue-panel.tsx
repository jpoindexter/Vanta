import { type FC } from "react";

import type { QueuedPromptEntry } from "@/store/composer-queue";

import {
  QueueActions,
  type QueueRowHandlers,
  type QueueRowState,
  savedStatus,
} from "./queue-row-actions";
import { Button } from "@/components/ui/button";

interface QueuePanelProps extends Omit<QueueRowHandlers, "onSendNow"> {
  editingId: null | string;
  entries: QueuedPromptEntry[];
  /** Why the last change to a saved message was not applied. The list is already up to date. */
  error?: string;
  onClearError?: () => void;
  /** Run the saved queue now. Shown only while nothing is running and saved messages wait. */
  onRunQueue?: () => void;
  /** Lift a park (explicit Stop/Esc halt) and let the queue flow again. */
  onResume: () => void;
  onSendNow: (id: string) => void;
  /** The paused messages were saved before this window opened, so the note says so. */
  restored?: boolean;
  /** Saved messages are waiting and nothing is running (for example after an app restart). */
  waiting?: boolean;
}

const HIDDEN_LABEL = "a hidden note";
const ATTACHMENT_ONLY = "attachments only";
const EMPTY_TURN = "an empty message";

const previewOf = (entry: QueuedPromptEntry): string => {
  if (entry.displayKind === "hidden") {
    return HIDDEN_LABEL;
  }

  return (
    (entry.displayText ?? entry.text).trim() ||
    (entry.attachments.length > 0 ? ATTACHMENT_ONLY : EMPTY_TURN)
  );
};

const attachmentMeta = (count: number): string =>
  count === 1 ? "1 attachment" : `${count} attachments`;

const QueueRow: FC<QueueRowHandlers & QueueRowState> = (props) => {
  const { entry, isEditing } = props;
  const attachments = entry.attachments.length;
  const status = savedStatus(entry);

  return (
    <li
      className="vp-queue"
      data-editing={isEditing || undefined}
      data-vp="queue-row"
    >
      <span className="vp-queue-text">
        Queued: {previewOf(entry)}
        {attachments > 0 && (
          <span className="vp-queue-meta">
            {" "}
            · {attachmentMeta(attachments)}
          </span>
        )}
        {status && (
          <span className="vp-queue-meta"> · {status}</span>
        )}
        {isEditing && (
          <span className="vp-queue-meta"> · editing in the composer</span>
        )}
      </span>
      <QueueActions {...props} />
    </li>
  );
};

/** One note row above the list or below it, with a single button. */
const NoteRow: FC<{
  action?: { label: string; onClick: () => void };
  alert?: boolean;
  name: string;
  text: string;
}> = ({ action, alert, name, text }) => (
  <li className="vp-queue" data-vp={name} role={alert ? "alert" : undefined}>
    <span className="vp-queue-text">{text}</span>
    {action && (
      <span className="vp-queue-actions">
        <Button
          size="sm"
          variant="outline"
          onClick={action.onClick}
          type="button"
        >
          {action.label}
        </Button>
      </span>
    )}
  </li>
);

const QueueRows: FC<
  QueueRowHandlers & { editingId: null | string; entries: QueuedPromptEntry[] }
> = ({ editingId, entries, ...handlers }) => {
  const saved = entries.filter((entry) => entry.remote);

  return (
    <>
      {entries.map((entry) => (
        <QueueRow
          {...handlers}
          entry={entry}
          isEditLocked={Boolean(editingId) && editingId !== entry.id}
          isEditing={editingId === entry.id}
          isFirst={saved[0]?.id === entry.id}
          isLast={saved.at(-1)?.id === entry.id}
          key={entry.id}
        />
      ))}
    </>
  );
};

/**
 * Messages waiting for the current run, one row each above the composer:
 * "Queued: text" with Edit, Steer and Remove. Steer shows only where it can
 * deliver (a live turn and an entry a redirect can carry). Messages saved by the server also move earlier
 * or later, retry when they did not send, and say what they are waiting to do.
 */
export const QueuePanel: FC<QueuePanelProps> = ({
  error,
  onClearError,
  onResume,
  onRunQueue,
  restored,
  waiting,
  ...rows
}) => {
  if (rows.entries.length === 0 && !error) {
    return null;
  }

  return (
    <ul
      aria-label="Queued messages"
      className="vp-queue-list"
      data-vp="queue-list"
    >
      {error ? (
        <NoteRow
          action={onClearError && { label: "Dismiss", onClick: onClearError }}
          alert
          name="queue-error"
          text={error}
        />
      ) : null}
      <QueueRows {...rows} />
      {waiting && onRunQueue && (
        <NoteRow
          action={{ label: "Run queue", onClick: onRunQueue }}
          name="queue-waiting"
          text="Not running. Saved messages start when you run the queue."
        />
      )}
      {rows.parked && (
        <NoteRow
          action={{ label: "Resume", onClick: onResume }}
          name="queue-paused"
          text={
            restored
              ? "Saved before Vanta closed. Resume to send these, or remove any you no longer want."
              : "Paused by Stop. Queued messages wait until you resume."
          }
        />
      )}
    </ul>
  );
};
