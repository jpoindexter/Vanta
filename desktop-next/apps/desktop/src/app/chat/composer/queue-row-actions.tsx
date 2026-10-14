import { type FC } from "react";

import { Tip } from "@/components/ui/tooltip";
import { ChevronDown, ChevronUp } from "@/lib/icons";
import {
  isSteerableEntry,
  type QueuedPromptEntry,
} from "@/store/composer-queue";

export interface QueueRowHandlers {
  busy: boolean;
  onDelete: (id: string) => void;
  onEdit: (entry: QueuedPromptEntry) => void;
  onMove?: (id: string, direction: "down" | "up") => void;
  onRetry?: (id: string) => void;
  onSendNow: (id: string) => void;
  onSteerNow?: (id: string) => void;
  parked: boolean;
}

export interface QueueRowState {
  entry: QueuedPromptEntry;
  /** First and last among the saved messages, so a move that cannot happen is not offered. */
  isFirst: boolean;
  isLast: boolean;
  /** Another entry is open in the composer, so this one cannot be edited yet. */
  isEditLocked: boolean;
  isEditing: boolean;
}

type PrimaryAction = "retry" | "send" | "steer";

/** What a saved message is waiting to do, in the words the previous queue used. */
export const savedStatus = (entry: QueuedPromptEntry): string => {
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

/**
 * The "do it now" buttons a row shows. A message that did not send is retried; a running turn takes a
 * steer (a saved message runs next, a window-local one redirects the live turn); an idle or paused queue
 * sends now.
 */
export function primaryActions(
  entry: QueuedPromptEntry,
  { busy, onRetry, onSteerNow, parked }: Pick<QueueRowHandlers, "busy" | "onRetry" | "onSteerNow" | "parked">,
): PrimaryAction[] {
  const saved = entry.remote;

  if (saved?.status === "starting") {
    return [];
  }

  if (saved?.status === "failed") {
    return onRetry ? ["retry"] : [];
  }

  const canSteer = busy && Boolean(onSteerNow) && isSteerableEntry(entry) && saved?.intent !== "steer";

  return [...(canSteer ? ["steer" as const] : []), ...(!busy || parked ? ["send" as const] : [])];
}

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

const PrimaryButtons: FC<QueueRowHandlers & QueueRowState> = (props) => {
  const { entry, isEditing, onRetry, onSendNow, onSteerNow } = props;

  return (
    <>
      {primaryActions(entry, props).map((kind) =>
        kind === "steer" ? (
          <SteerButton
            isDisabled={isEditing}
            key={kind}
            onClick={() => onSteerNow?.(entry.id)}
          />
        ) : (
          <button
            className="vp-btn"
            data-vp={kind === "retry" ? "queue-retry" : undefined}
            disabled={isEditing}
            key={kind}
            onClick={() =>
              kind === "retry" ? onRetry?.(entry.id) : onSendNow(entry.id)
            }
            type="button"
          >
            {kind === "retry" ? "Retry" : "Send now"}
          </button>
        ),
      )}
    </>
  );
};

export const QueueActions: FC<QueueRowHandlers & QueueRowState> = (props) => {
  const { entry, isEditLocked, isEditing, onDelete, onEdit, onMove } = props;
  const started = entry.remote?.status === "starting";

  return (
    <span className="vp-queue-actions">
      {entry.remote && onMove && (
        <MoveButtons
          disabled={started || isEditing}
          entry={entry}
          isFirst={props.isFirst}
          isLast={props.isLast}
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
      <PrimaryButtons {...props} />
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
