import { type FC, useRef, useState } from 'react'

import { ActionStatus } from '@/components/ui/action-status'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { AlertTriangle } from '@/lib/icons'

interface FullAccessDialogProps {
  open: boolean
  /** The project this choice applies to. */
  root: string
  onCancel: () => void
  /** Sets the mode. Throw to keep the dialog open with the reason. */
  onConfirm: () => Promise<void>
}

/** Runs the confirm action once at a time and keeps its failure as text for the dialog. */
function useConfirmAction(action: () => Promise<void>) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<null | string>(null)

  const run = async () => {
    setBusy(true)
    setError(null)

    try {
      await action()
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Vanta could not turn on Full access.')
    } finally {
      setBusy(false)
    }
  }

  return { busy, error, run }
}

const WARNING =
  'Vanta may run commands, use the internet, and create, modify, upload, or delete files inside this project ' +
  'without asking each time. This can cause data loss or expose data through prompt injection. ' +
  'Kernel-blocked actions remain blocked.'

/**
 * The warning before Full access (V-019). Focus starts on Cancel, so a stray Enter keeps the safe mode.
 * Cancel leaves the mode untouched; Confirm asks the server to enforce Full access for this project.
 */
export const FullAccessDialog: FC<FullAccessDialogProps> = ({ onCancel, onConfirm, open, root }) => {
  const cancelRef = useRef<HTMLButtonElement>(null)
  const { busy, error, run } = useConfirmAction(onConfirm)

  return (
    <Dialog onOpenChange={next => !next && !busy && onCancel()} open={open}>
      <DialogContent
        className="max-w-md"
        data-vp="full-access-dialog"
        onOpenAutoFocus={event => {
          event.preventDefault()
          cancelRef.current?.focus()
        }}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle aria-hidden className="size-4 shrink-0 text-destructive" />
            Turn on Full access?
          </DialogTitle>
          <DialogDescription>{WARNING}</DialogDescription>
        </DialogHeader>
        {root ? <p className="break-all text-xs text-(--ui-text-tertiary)">Project: {root}</p> : null}
        {error ? (
          <p className="text-xs text-destructive" role="alert">
            {error}
          </p>
        ) : null}
        <DialogFooter>
          <Button disabled={busy} onClick={onCancel} ref={cancelRef} type="button" variant="ghost">
            Cancel
          </Button>
          <Button disabled={busy} onClick={() => void run()} type="button" variant="destructive">
            <ActionStatus busy="Turning on…" done="On" idle="Turn on Full access" state={busy ? 'saving' : 'idle'} />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
