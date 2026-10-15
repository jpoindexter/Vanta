import { IconAlertTriangle, IconDots } from "@tabler/icons-react";
import { type FC, useId, useRef, useState } from "react";

import { summarizeApproval } from "./approval-summary";
import type {
  ApprovalDecision,
  ApprovalPayload,
  PermissionKind,
} from "./approval-types";
import { Button } from "@/components/ui/button";

export interface ApprovalCardProps {
  /** False hides "More permission options" for hosts that cannot remember a "never" rule. */
  allowNever?: boolean;
  approval: ApprovalPayload;
  onAnswer: (decision: ApprovalDecision) => Promise<void> | void;
  /** "2 / 3" when several approvals wait in a stack. */
  position?: string;
  /** Names the scope Always covers ("the Vanta project"); defaults to "this project". */
  projectName?: string;
}

const ONE_WAY_NOTE =
  "This is a one-way action that can't be undone, so Vanta asks every time, even after Always allow.";
const ANSWER_FAILED =
  "Could not confirm the decision. Check activity before trying again.";

const PENDING_LABEL: Record<ApprovalDecision, string> = {
  allow: "Allowing…",
  always: "Saving…",
  deny: "Rejecting…",
  never: "Saving…",
};

const canRemember = (approval: ApprovalPayload): boolean =>
  Boolean(
    approval.toolName &&
    approval.request?.canRemember &&
    !approval.request?.fresh,
  );

const scopeOf = (projectName?: string): string =>
  projectName ? `the ${projectName} project` : "this project";

const SCOPE_NOUN: Partial<Record<PermissionKind, string>> = {
  file_edit: "file edit",
  file_write: "file write",
};

const toolOf = (approval: ApprovalPayload): string =>
  approval.request?.toolName || approval.toolName || "this tool";

/** One honest sentence about what Always covers, chosen by the tool the rule is saved for. */
export function alwaysNote(
  approval: ApprovalPayload,
  projectName?: string,
): string {
  if (approval.request?.fresh) {
    return ONE_WAY_NOTE;
  }

  if (!canRemember(approval)) {
    return "";
  }

  const scope = scopeOf(projectName);
  const kind = approval.request?.kind ?? "generic";

  if (kind === "bash") {
    return `Always covers every shell command Vanta runs in ${scope}, not just this one. Irreversible commands (delete, deploy, publish) always ask and do not offer Always.`;
  }

  const noun = SCOPE_NOUN[kind];
  const covers = noun
    ? `every ${noun} (${toolOf(approval)}, any file)`
    : `every use of ${toolOf(approval)}`;

  return `Always covers ${covers} in ${scope}, not just this one. Irreversible actions always ask and do not offer Always.`;
}

/** The button names exactly the rule that gets saved: the tool, in this project. */
export function alwaysLabel(approval: ApprovalPayload): string {
  return approval.request?.kind === "bash"
    ? "Always allow shell commands"
    : `Always allow ${toolOf(approval)} in this project`;
}

/** The confirmation shown once an Always answer is saved: what is allowed and where. */
export function alwaysSavedText(
  approval: ApprovalPayload,
  projectName?: string,
): string {
  const what =
    approval.request?.kind === "bash" ? "shell commands" : toolOf(approval);
  const where = projectName ? `the ${projectName} project` : "this project";

  return `Saved: always allow ${what} in ${where}. Manage in Settings.`;
}

/** Flat inline card that names the exact action; Reject carries the same weight as Allow. */
export const ApprovalCard: FC<ApprovalCardProps> = ({
  allowNever = true,
  approval,
  onAnswer,
  position,
  projectName,
}) => {
  const titleId = useId();
  const inFlight = useRef(false);
  const [pending, setPending] = useState<ApprovalDecision | null>(null);
  const [error, setError] = useState("");
  const [moreOpen, setMoreOpen] = useState(false);
  const summary = summarizeApproval(approval);
  const remember = canRemember(approval);
  const note = alwaysNote(approval, projectName);

  const answer = async (decision: ApprovalDecision) => {
    if (inFlight.current) {
      return;
    }

    inFlight.current = true;
    setPending(decision);
    setError("");
    setMoreOpen(false);

    try {
      await onAnswer(decision);
    } catch (cause) {
      setError(
        cause instanceof Error && cause.message ? cause.message : ANSWER_FAILED,
      );
    } finally {
      inFlight.current = false;
      setPending(null);
    }
  };

  const label = (decision: ApprovalDecision, idle: string) =>
    pending === decision ? PENDING_LABEL[decision] : idle;

  return (
    <section
      aria-labelledby={titleId}
      className="vp-card vp-approval"
      data-vp="approval-card"
      data-vp-kind={approval.request?.kind ?? "generic"}
      role="alert"
    >
      <h4 data-vp="approval-title" id={titleId}>
        <IconAlertTriangle aria-hidden className="vp-card-icon" size={15} />
        {summary.headline}
        {position && <span className="vp-position">{position}</span>}
      </h4>
      {summary.lede && (
        <div className="vp-sub" data-vp="approval-sub">
          {summary.lede}
        </div>
      )}
      {summary.preview && (
        <pre
          aria-label={summary.preview.label}
          className="vp-code"
          data-vp="approval-code"
        >
          <code>{summary.preview.text}</code>
        </pre>
      )}
      {summary.details.length > 0 && (
        <details className="vp-details">
          <summary>Details</summary>
          {summary.details.map((section) => (
            <div className="vp-note" key={section.label}>
              <strong>{section.label}</strong> <code>{section.value}</code>
            </div>
          ))}
        </details>
      )}
      <div
        aria-busy={pending !== null}
        className="vp-acts"
        data-vp="approval-actions"
      >
        <Button
          size="sm"
          data-approval-run=""
          disabled={pending !== null}
          onClick={() => void answer("allow")}
          type="button"
        >
          {label("allow", "Allow once")}
        </Button>
        {remember && (
          <Button
            size="sm"
            variant="outline"
            disabled={pending !== null}
            onClick={() => void answer("always")}
            type="button"
          >
            {label("always", alwaysLabel(approval))}
          </Button>
        )}
        <Button
          size="sm"
          variant="outline"
          data-approval-deny=""
          disabled={pending !== null}
          onClick={() => void answer("deny")}
          type="button"
        >
          {label("deny", "Reject")}
        </Button>
        {remember && allowNever && (
          <span className="vp-more">
            <Button
              size="sm"
              variant="outline"
              className="vp-more-toggle"
              aria-expanded={moreOpen}
              aria-label="More permission options"
              disabled={pending !== null}
              onClick={() => setMoreOpen((open) => !open)}
              type="button"
            >
              <IconDots aria-hidden size={15} />
            </Button>
            {moreOpen && (
              <span className="vp-more-menu">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void answer("never")}
                  type="button"
                >
                  {label("never", "Never allow this tool")}
                </Button>
              </span>
            )}
          </span>
        )}
      </div>
      {error && (
        <p className="vp-error" role="status">
          {error}
        </p>
      )}
      {note && (
        <div className="vp-note" data-vp="approval-note">
          {note}
        </div>
      )}
    </section>
  );
};
