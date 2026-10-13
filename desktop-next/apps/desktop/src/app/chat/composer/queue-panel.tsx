import { type FC } from "react";

import { Tip } from "@/components/ui/tooltip";
import {
  isSteerableEntry,
  type QueuedPromptEntry,
} from "@/store/composer-queue";

interface QueuePanelProps {
  busy: boolean;
  editingId: null | string;
  entries: QueuedPromptEntry[];
  onDelete: (id: string) => void;
  onEdit: (entry: QueuedPromptEntry) => void;
  /** Lift a park (explicit Stop/Esc halt) and let the queue flow again. */
  onResume: () => void;
  onSendNow: (id: string) => void;
  /** Deliver an entry as a mid-turn redirect (no interrupt). Absent when the
   *  host has no steer path — the affordance hides rather than dead-clicks. */
  onSteerNow?: (id: string) => void;
  /** True after an explicit halt: entries wait until resumed / sent / edited. */
  parked: boolean;
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
  "busy" | "onDelete" | "onEdit" | "onSendNow" | "onSteerNow" | "parked"
> {
  entry: QueuedPromptEntry;
  /** Another entry is open in the composer, so this one cannot be edited yet. */
  isEditLocked: boolean;
  isEditing: boolean;
}

const attachmentMeta = (count: number): string =>
  count === 1 ? "1 attachment" : `${count} attachments`;

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

const QueueActions: FC<QueueRowProps> = ({ entry, isEditing, ...rest }) => {
  const {
    busy,
    isEditLocked,
    onDelete,
    onEdit,
    onSendNow,
    onSteerNow,
    parked,
  } = rest;

  return (
    <span className="vp-queue-actions">
      <button
        className="vp-btn"
        disabled={isEditLocked}
        onClick={() => onEdit(entry)}
        type="button"
      >
        Edit
      </button>
      {busy && Boolean(onSteerNow) && isSteerableEntry(entry) && (
        <SteerButton
          isDisabled={isEditing}
          onClick={() => onSteerNow?.(entry.id)}
        />
      )}
      {(!busy || parked) && (
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
  onResume,
  parked,
  ...rowProps
}) => {
  if (entries.length === 0) {
    return null;
  }

  return (
    <ul
      aria-label="Queued messages"
      className="vp-queue-list"
      data-vp="queue-list"
    >
      {entries.map((entry) => (
        <QueueRow
          {...rowProps}
          entry={entry}
          isEditLocked={Boolean(editingId) && editingId !== entry.id}
          isEditing={editingId === entry.id}
          key={entry.id}
          parked={parked}
        />
      ))}
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
