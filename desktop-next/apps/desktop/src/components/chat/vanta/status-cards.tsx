import { IconAlertTriangle, IconCircleX } from "@tabler/icons-react";
import { type FC, type ReactNode, useId } from "react";
import { Button } from "@/components/ui/button";

export interface CardAction {
  /** Disables the button while a request is in flight. */
  disabled?: boolean;
  id: string;
  label: string;
  primary?: boolean;
}

interface StatusCardProps {
  actions: readonly CardAction[];
  body: ReactNode;
  onAction: (id: string) => void;
  title: string;
  vp: "blocked" | "failure";
}

const Icon = { blocked: IconAlertTriangle, failure: IconCircleX } as const;

/** A flat card for the two states that stop a run: it needs the person, or it failed. */
const StatusCard: FC<StatusCardProps> = ({
  actions,
  body,
  onAction,
  title,
  vp,
}) => {
  const titleId = useId();
  const Glyph = Icon[vp];

  return (
    <section
      aria-labelledby={titleId}
      className="vp-card"
      data-vp={`${vp}-card`}
      role="alert"
    >
      <h4 id={titleId}>
        <Glyph aria-hidden className="vp-card-icon" size={15} />
        {title}
      </h4>
      <div className="vp-sub">{body}</div>
      <div className="vp-acts" data-vp={`${vp}-actions`}>
        {actions.map((action) => (
          <Button
            size="sm"
            variant={action.primary ? "default" : "outline"}

            disabled={action.disabled}
            key={action.id}
            onClick={() => onAction(action.id)}
            type="button"
          >
            {action.label}
          </Button>
        ))}
      </div>
    </section>
  );
};

export interface BlockedCardProps {
  actions: readonly CardAction[];
  /** What Vanta could not do, in one or two sentences. */
  body: ReactNode;
  onAction: (id: string) => void;
  title: string;
}

/** The agent cannot continue without a choice from the person ("I need a source"). */
export const BlockedCard: FC<BlockedCardProps> = (props) => (
  <StatusCard {...props} vp="blocked" />
);

export interface FailureCardProps {
  actions: readonly CardAction[];
  /** What failed and what was kept; partial output and uncommitted work are named here. */
  body: ReactNode;
  onAction: (id: string) => void;
  title: string;
}

/** A failed step or run, with its own recovery actions. Partial output stays in the thread. */
export const FailureCard: FC<FailureCardProps> = (props) => (
  <StatusCard {...props} vp="failure" />
);
