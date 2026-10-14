import { type FC } from "react";

import { Tip } from "@/components/ui/tooltip";
import { ChevronDown, ChevronUp } from "@/lib/icons";
import {
  isSteerableEntry,
  type QueuedPromptEntry,
} from "@/store/composer-queue";

interface QueuePanelProps {
  busy: boolean;
  editingId: null | string;
  entries: QueuedPromptEntry[];
  /** Why the last change to a saved message was not applied. The list is already up to date. */
  error?: string;
  onClearError?: () => void;
  onDelete: (id: string) => void;
  onEdit: (entry: QueuedPromptEntry) => void;
  /** Move a saved message one place earlier or later. Absent when the queue is not the server's. */
  onMove?: (id: string, direction: "down" | "up") => void;
  /** Put a saved message that did not send back in line. */
  onRetry?: (id: string) => void;
  /** Run the saved queue now. Shown only while nothing is running and saved messages wait. */
  onRunQueue?: () => void;
  /** Lift a park (explicit Stop/Esc halt) and let the queue flow again. */
  onResume: () => void;
  onSendNow: (id: string) => void;
  /** Deliver an entry as a mid-turn redirect (no interrupt). Absent when the
   *  host has no steer path — the affordance hides rather than dead-clicks. */
  onSteerNow?: (id: string) => void;
  /** True after an explicit halt: entries wait until resumed / sent / edited. */
  parked: boolean;
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

interface QueueRowProps extends Pick<
  QueuePanelProps,
  | "busy"
  | "onDelete"
  | "onEdit"
  | "onMove"
  | "onRetry"
  | "onSendNow"
  | "onSteerNow"
  | "parked"
> {
  entry: QueuedPromptEntry;
  /** First and last among the saved messages, so a move that cannot happen is not offered. */
  isFirst: boolean;
  isLast: boolean;
  /** Another entry is open in the composer, so this one cannot be edited yet. */
  isEditLocked: boolean;
  isEditing: boolean;
}

const attachmentMeta = (count: number): string =>
  count === 1 ? "1 attachment" : `${count} attachments`;

/** What a saved message is waiting to do, in the words the previous queue used. */
const savedStatus = (entry: QueuedPromptEntry): string => {
  const saved = entry.remote;

  if (!saved) {
    return "";
  }

  if (saved.status === "starting") {
    return "Starting now";
  }

  if (saved.status === "failed") {
    return `Not sent: ${saved.failure ?? "the run failed"}`;
  }

  return saved.intent === "steer" ? "Steer now" : "Runs next";
};

const SteerButton: FC<{ isDisabled: boolean; onClick: () => void }> = ({
  isDisabled,
  onClick,
}) => (
  <Tip label="Redirect the live turn with this message now">
    <button
      className="vp-btn"
      disabled={isDisabled}
      onClick={onClick}
      type="button"
    >
      Steer
    </button>
  </Tip>
);

const MoveButtons: FC<{
  disabled: boolean;
  entry: QueuedPromptEntry;
  isFirst: boolean;
  isLast: boolean;
  onMove: (id: string, direction: "down" | "up") => void;
}> = ({ disabled, entry, isFirst, isLast, onMove }) => (
  <>
    <button
      aria-label="Move earlier"
      className="vp-btn"
      disabled={disabled || isFirst}
      onClick={() => onMove(entry.id, "up")}
      title="Move earlier"
      type="button"
    >
      <ChevronUp aria-hidden="true" className="size-3" />
    </button>
    <button
      aria-label="Move later"
      className="vp-btn"
      disabled={disabled || isLast}
      onClick={() => onMove(entry.id, "down")}
      title="Move later"
      type="button"
    >
      <ChevronDown aria-hidden="true" className="size-3" />
    </button>
  </>
);

const QueueActions: FC<QueueRowProps> = ({ entry, isEditing, ...rest }) => {
  const {
    busy,
    isEditLocked,
    isFirst,
    isLast,
    onDelete,
    onEdit,
    onMove,
    onRetry,
    onSendNow,
    onSteerNow,
    parked,
  } = rest;
  const saved = entry.remote;
  const started = saved?.status === "starting";
  const failed = saved?.status === "failed";

  return (
    <span className="vp-queue-actions">
      {saved && onMove && (
        <MoveButtons
          disabled={started || isEditing}
          entry={entry}
          isFirst={isFirst}
          isLast={isLast}
          onMove={onMove}
        />
      )}
      <button
        className="vp-btn"
        disabled={isEditLocked || started}
        onClick={() => onEdit(entry)}
        type="button"
      >
        Edit
      </button>
      {failed && onRetry && (
        <button
          className="vp-btn"
          data-vp="queue-retry"
          disabled={isEditing}
          onClick={() => onRetry(entry.id)}
          type="button"
        >
          Retry
        </button>
      )}
      {!failed && !started && busy && Boolean(onSteerNow) && isSteerableEntry(entry) && saved?.intent !== "steer" && (
        <SteerButton
          isDisabled={isEditing}
          onClick={() => onSteerNow?.(entry.id)}
        />
      )}
      {!failed && !started && (!busy || parked) && (
        <button
          className="vp-btn"
          disabled={isEditing}
          onClick={() => onSendNow(entry.id)}
          type="button"
        >
          Send now
        </button>
      )}
      <button
        className="vp-btn"
        data-vp="queue-remove"
        disabled={started}
        onClick={() => onDelete(entry.id)}
        type="button"
      >
        Remove
      </button>
    </span>
  );
};

const QueueRow: FC<QueueRowProps> = (props) => {
  const { entry, isEditing } = props;
  const attachments = entry.attachments.length;

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
        {entry.remote && (
          <span className="vp-queue-meta"> · {savedStatus(entry)}</span>
        )}
        {isEditing && (
          <span className="vp-queue-meta"> · editing in the composer</span>
        )}
      </span>
      <QueueActions {...props} />
    </li>
  );
};

/**
 * Messages waiting for the current run, one row each above the composer:
 * "Queued: text" with Edit, Steer and Remove. Steer shows only where it can
 * deliver (a live turn and an entry a redirect can carry).
 */
export const QueuePanel: FC<QueuePanelProps> = ({
  editingId,
  entries,
  error,
  onClearError,
  onResume,
  onRunQueue,
  parked,
  waiting,
  ...rowProps
}) => {
  if (entries.length === 0 && !error) {
    return null;
  }

  const saved = entries.filter((entry) => entry.remote);

  return (
    <ul
      aria-label="Queued messages"
      className="vp-queue-list"
      data-vp="queue-list"
    >
      {error ? (
        <li className="vp-queue" data-vp="queue-error" role="alert">
          <span className="vp-queue-text">{error}</span>
          {onClearError && (
            <span className="vp-queue-actions">
              <button className="vp-btn" onClick={onClearError} type="button">
                Dismiss
              </button>
            </span>
          )}
        </li>
      ) : null}
      {entries.map((entry) => (
        <QueueRow
          {...rowProps}
          entry={entry}
          isEditLocked={Boolean(editingId) && editingId !== entry.id}
          isEditing={editingId === entry.id}
          isFirst={saved[0]?.id === entry.id}
          isLast={saved.at(-1)?.id === entry.id}
          key={entry.id}
          parked={parked}
        />
      ))}
      {waiting && onRunQueue && (
        <li className="vp-queue" data-vp="queue-waiting">
          <span className="vp-queue-text">
            Not running. Saved messages start when you run the queue.
          </span>
          <span className="vp-queue-actions">
            <button className="vp-btn" onClick={onRunQueue} type="button">
              Run queue
            </button>
          </span>
        </li>
      )}
      {parked && (
        <li className="vp-queue" data-vp="queue-paused">
          <span className="vp-queue-text">
            Paused by Stop. Queued messages wait until you resume.
          </span>
          <span className="vp-queue-actions">
            <button className="vp-btn" onClick={onResume} type="button">
              Resume
            </button>
          </span>
        </li>
      )}
    </ul>
  );
};
