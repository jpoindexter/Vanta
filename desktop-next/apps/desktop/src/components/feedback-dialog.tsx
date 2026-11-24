import { useStore } from "@nanostores/react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Textarea } from "@/components/ui/textarea";
import { useI18n } from "@/i18n";
import { feedbackDiagnosticContext, feedbackFacts } from "@/lib/feedback";
import { downloadTextFile } from "@/lib/download-text";
import { clearSupportFailures } from "@/lib/support-diagnostics";
import { notifyError } from "@/store/notifications";
import {
  $feedback,
  changeFeedback,
  confirmFeedback,
  dismissFeedback,
  requestFeedback,
} from "@/store/feedback";
import { $desktopVersion } from "@/store/updates";

export function FeedbackHost() {
  const { t } = useI18n();
  const copy = t.feedback;
  const state = useStore($feedback);
  useEffect(
    () => window.desktopBridge?.onFeedbackRequested?.(requestFeedback),
    [],
  );
  if (!state.open) return null;
  const { receipt } = state;
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) dismissFeedback();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>{copy.notice}</DialogDescription>
        </DialogHeader>
        {receipt ? (
          <p role="status" className="text-ui break-words">
            {copy.received} {receipt.id}
            <br />
            {receipt.notification === "sent"
              ? copy.notificationSent
              : copy.notificationUncertain}
          </p>
        ) : (
          <FeedbackForm />
        )}
      </DialogContent>
    </Dialog>
  );
}

function FeedbackForm() {
  const { t } = useI18n();
  const copy = t.feedback;
  const { draft, pending, busy, error } = useStore($feedback);
  const version = useStore($desktopVersion);
  const locked = busy || !!pending;
  const kind = pending?.kind ?? draft.kind;
  const value = pending ?? {
    kind,
    title: draft.title,
    details: draft.details,
    steps: draft.steps,
    facts: draft.includeFacts ? feedbackFacts(version) : null,
  };
  const reportText = JSON.stringify(value, null, 2);
  return (
    <form
      className="grid min-h-0 gap-4 overflow-y-auto"
      onSubmit={(event) => {
        event.preventDefault();
        void confirmFeedback(version);
      }}
    >
      <SegmentedControl
        disabled={locked}
        options={[
          { id: "bug", label: copy.bug },
          { id: "idea", label: copy.idea },
        ]}
        value={kind}
        onChange={(kind) => changeFeedback({ kind })}
      />
      <FeedbackTextFields />
      <FeedbackDiagnostics />
      <FeedbackPreview reportText={reportText} />
      {error && (
        <p role="alert" className="text-ui text-destructive">
          {copy[`${error}Error`]}
        </p>
      )}
      <FeedbackFooter reportText={reportText} busy={busy} pending={!!pending} />
    </form>
  );
}

function FeedbackFooter({ reportText, busy, pending }: { reportText: string; busy: boolean; pending: boolean }) {
  const { t } = useI18n();
  const copy = t.feedback;
  return (
    <DialogFooter>
      <CopyButton text={reportText} label={copy.copy} />
      <Button type="button" variant="secondary" onClick={() => {
        try { downloadTextFile("Vanta-feedback.json", reportText, "application/json"); }
        catch (error) { notifyError(error, copy.saveFailed); }
      }}>{copy.save}</Button>
      <Button type="submit" disabled={busy} aria-busy={busy}>
        {busy ? copy.sending : pending ? copy.retry : copy.send}
      </Button>
    </DialogFooter>
  );
}

function FeedbackDiagnostics() {
  const { t } = useI18n();
  const copy = t.feedback;
  const { draft, pending, busy } = useStore($feedback);
  const version = useStore($desktopVersion);
  const [, refresh] = useState(0);
  const context = [draft.steps, feedbackDiagnosticContext(version)]
    .filter(Boolean)
    .join("\n\n");
  const full = context.length > 3000;
  return (
    <div className="grid gap-1.5">
      <p className="text-meta text-muted-foreground">
        {copy.diagnosticsNotice}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="ghost"
          disabled={busy || !!pending || full}
          onClick={() => changeFeedback({ steps: context })}
        >
          {copy.addDiagnostics}
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={busy || !!pending}
          onClick={() => {
            try {
              clearSupportFailures();
              refresh((value) => value + 1);
            } catch (error) {
                notifyError(error, copy.clearDiagnostics);
            }
          }}
        >
          {copy.clearDiagnostics}
        </Button>
      </div>
      {full && (
        <p className="text-meta text-muted-foreground">
          {copy.diagnosticsFull}
        </p>
      )}
    </div>
  );
}

function FeedbackTextFields() {
  const { t } = useI18n();
  const copy = t.feedback;
  const { draft, pending, busy } = useStore($feedback);
  const kind = pending?.kind ?? draft.kind;
  const fields = [
    { key: "title" as const, label: copy.summary, rows: 1 },
    {
      key: "details" as const,
      label: kind === "bug" ? copy.detailsBug : copy.detailsIdea,
      rows: 4,
    },
    { key: "steps" as const, label: copy.steps, rows: 2 },
  ];
  return fields.map(({ key, label, rows }) => {
    const props = {
      id: `feedback-${key}`,
      maxLength: key === "title" ? 120 : 3000,
      required: key !== "steps",
      value: pending?.[key] ?? draft[key],
      disabled: busy || !!pending,
      onChange: (
        event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
      ) => changeFeedback({ [key]: event.target.value }),
    };
    return (
      <label key={key} className="grid gap-1.5 text-ui" htmlFor={props.id}>
        {label}
        {key === "title" ? (
          <Input {...props} />
        ) : (
          <Textarea {...props} rows={rows} />
        )}
      </label>
    );
  });
}

function FeedbackPreview({ reportText }: { reportText: string }) {
  const { t } = useI18n();
  const copy = t.feedback;
  const { draft, pending, busy } = useStore($feedback);
  const version = useStore($desktopVersion);
  const locked = busy || !!pending;
  return (
    <>
      <label className="flex items-center gap-2 text-ui">
        <input
          type="checkbox"
          checked={pending ? !!pending.facts : draft.includeFacts}
          disabled={locked || !version}
          onChange={(event) =>
            changeFeedback({ includeFacts: event.target.checked })
          }
        />
        {copy.facts}
      </label>
      {!version && (
        <p className="text-meta text-muted-foreground">
          {copy.factsUnavailable}
        </p>
      )}
      <details>
        <summary className="cursor-pointer text-ui">{copy.preview}</summary>
        <pre
          className="max-h-40 overflow-auto whitespace-pre-wrap break-words text-meta"
          tabIndex={0}
        >
          {reportText}
        </pre>
      </details>
    </>
  );
}
