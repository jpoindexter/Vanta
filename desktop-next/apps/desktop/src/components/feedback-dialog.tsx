import { useStore } from '@nanostores/react'
import { useEffect } from 'react'

import { Button } from '@/components/ui/button'
import { CopyButton } from '@/components/ui/copy-button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { Textarea } from '@/components/ui/textarea'
import { useI18n } from '@/i18n'
import { feedbackFacts } from '@/lib/feedback'
import {
  $feedback,
  changeFeedback,
  confirmFeedback,
  dismissFeedback,
  requestFeedback
} from '@/store/feedback'
import { $desktopVersion } from '@/store/updates'

export function FeedbackHost() {
  const { t } = useI18n()
  const copy = t.feedback
  const state = useStore($feedback)
  useEffect(
    () => window.desktopBridge?.onFeedbackRequested?.(requestFeedback),
    []
  )
  if (!state.open) return null
  const { receipt } = state
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) dismissFeedback()
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
            {receipt.notification === 'sent'
              ? copy.notificationSent
              : copy.notificationUncertain}
          </p>
        ) : (
          <FeedbackForm />
        )}
      </DialogContent>
    </Dialog>
  )
}

function FeedbackForm() {
  const { t } = useI18n()
  const copy = t.feedback
  const { draft, pending, busy, error } = useStore($feedback)
  const version = useStore($desktopVersion)
  const locked = busy || !!pending
  const kind = pending?.kind ?? draft.kind
  const value = pending ?? {
    kind,
    title: draft.title,
    details: draft.details,
    steps: draft.steps,
    facts: draft.includeFacts ? feedbackFacts(version) : null
  }
  const reportText = JSON.stringify(value, null, 2)
  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault()
        void confirmFeedback(version)
      }}
    >
      <SegmentedControl
        disabled={locked}
        options={[
          { id: 'bug', label: copy.bug },
          { id: 'idea', label: copy.idea }
        ]}
        value={kind}
        onChange={(kind) => changeFeedback({ kind })}
      />
      <FeedbackTextFields />
      <FeedbackPreview reportText={reportText} />
      {error && (
        <p role="alert" className="text-ui text-destructive">
          {copy[`${error}Error`]}
        </p>
      )}
      <DialogFooter>
        <CopyButton text={reportText} label={copy.copy} />
        <Button type="submit" disabled={busy} aria-busy={busy}>
          {busy ? copy.sending : pending ? copy.retry : copy.send}
        </Button>
      </DialogFooter>
    </form>
  )
}

function FeedbackTextFields() {
  const { t } = useI18n()
  const copy = t.feedback
  const { draft, pending, busy } = useStore($feedback)
  const kind = pending?.kind ?? draft.kind
  const fields = [
    { key: 'title' as const, label: copy.summary, rows: 1 },
    {
      key: 'details' as const,
      label: kind === 'bug' ? copy.detailsBug : copy.detailsIdea,
      rows: 4
    },
    { key: 'steps' as const, label: copy.steps, rows: 2 }
  ]
  return fields.map(({ key, label, rows }) => {
    const props = {
      id: `feedback-${key}`,
      maxLength: key === 'title' ? 120 : 3000,
      required: key !== 'steps',
      value: pending?.[key] ?? draft[key],
      disabled: busy || !!pending,
      onChange: (
        event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
      ) => changeFeedback({ [key]: event.target.value })
    }
    return (
      <label key={key} className="grid gap-1.5 text-ui" htmlFor={props.id}>
        {label}
        {key === 'title' ? (
          <Input {...props} />
        ) : (
          <Textarea {...props} rows={rows} />
        )}
      </label>
    )
  })
}

function FeedbackPreview({ reportText }: { reportText: string }) {
  const { t } = useI18n()
  const copy = t.feedback
  const { draft, pending, busy } = useStore($feedback)
  const version = useStore($desktopVersion)
  const locked = busy || !!pending
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
  )
}
