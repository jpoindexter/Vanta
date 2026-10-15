import { type ReactElement, useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Input } from '@/components/ui/input'
import type { DesktopResetPlan } from '@/global'
import { AlertTriangle, RefreshCw, Trash2 } from '@/lib/icons'

import { ListRow, SectionHeading, SettingsContent } from './primitives'
import { formatBytes, RESET_COPY } from './reset-copy'

type Scope = 'app' | 'everything'
type Plans = Partial<Record<Scope, DesktopResetPlan>>

const ERASE_WORD = 'erase'

function planLines(plan: DesktopResetPlan | undefined): string[] {
  if (!plan) return []
  if (!plan.ok) return [plan.error]

  return plan.targets.map(target => `${target.label}: ${target.estimated ? 'over ' : ''}${formatBytes(target.bytes)} (${target.path})`)
}

function PlanList({ lines }: { lines: string[] }): ReactElement | null {
  if (!lines.length) return null

  return (
    <ul className="mt-2 grid gap-1 text-xs text-muted-foreground" data-testid="reset-plan">
      {lines.map(line => (
        <li className="break-all" key={line}>
          {line}
        </li>
      ))}
    </ul>
  )
}

function useResetPlans(): Plans {
  const [plans, setPlans] = useState<Plans>({})

  useEffect(() => {
    let alive = true

    for (const scope of ['app', 'everything'] as const) {
      void window.hermesDesktop?.resetPlan?.(scope).then(plan => alive && setPlans(current => ({ ...current, [scope]: plan })))
    }

    return () => {
      alive = false
    }
  }, [])

  return plans
}

function ResetRows({ onAsk, plans }: { onAsk: (scope: Scope) => void; plans: Plans }): ReactElement {
  return (
    <>
      <ListRow
        action={
          <Button onClick={() => onAsk('app')} variant="outline">
            {RESET_COPY.appButton}
          </Button>
        }
        below={<PlanList lines={planLines(plans.app)} />}
        description={RESET_COPY.appBody}
        title={RESET_COPY.appTitle}
        wide
      />
      <ListRow
        action={
          <Button onClick={() => onAsk('everything')} variant="destructive">
            <Trash2 className="size-4" />
            {RESET_COPY.everythingButton}
          </Button>
        }
        below={<PlanList lines={planLines(plans.everything)} />}
        description={RESET_COPY.everythingBody}
        title={RESET_COPY.everythingTitle}
        wide
      />
    </>
  )
}

interface ResetDialogProps {
  onClose: () => void
  plans: Plans
  scope: null | Scope
}

function ResetDialog({ onClose, plans, scope }: ResetDialogProps): ReactElement {
  const [typed, setTyped] = useState('')
  const everything = scope === 'everything'

  const run = async (): Promise<void> => {
    if (!scope) return
    if (everything && typed !== ERASE_WORD) throw new Error(`Type "${ERASE_WORD}" to confirm.`)

    const result = await window.hermesDesktop?.resetRun?.(scope, everything ? typed : undefined)

    if (result && !result.ok) throw new Error(result.error)
  }

  const close = (): void => {
    setTyped('')
    onClose()
  }

  return (
    <ConfirmDialog
      cancelLabel={RESET_COPY.cancel}
      confirmLabel={everything ? RESET_COPY.everythingButton : RESET_COPY.appButton}
      description={everything ? RESET_COPY.everythingBody : RESET_COPY.appBody}
      destructive
      dismissOnConfirm
      onClose={close}
      onConfirm={run}
      open={scope !== null}
      title={
        <span className="flex items-center gap-2">
          <AlertTriangle className="size-4" />
          {everything ? RESET_COPY.everythingTitle : RESET_COPY.appTitle}
        </span>
      }
    >
      <PlanList lines={planLines(scope ? plans[scope] : undefined)} />
      {everything && (
        <label className="mt-3 grid gap-1.5 text-sm">
          <span>{RESET_COPY.typeLabel}</span>
          <Input autoComplete="off" onChange={event => setTyped(event.target.value)} spellCheck={false} value={typed} />
        </label>
      )}
    </ConfirmDialog>
  )
}

export function ResetSettings(): ReactElement {
  const plans = useResetPlans()
  const [asking, setAsking] = useState<null | Scope>(null)

  if (!window.hermesDesktop?.resetRun) {
    return (
      <SettingsContent>
        <p className="mx-auto mt-6 w-full max-w-2xl text-sm text-muted-foreground">{RESET_COPY.unavailable}</p>
      </SettingsContent>
    )
  }

  return (
    <SettingsContent>
      <div className="mx-auto w-full max-w-2xl" data-testid="reset-settings">
        <SectionHeading icon={RefreshCw} page title={RESET_COPY.nav} />
        <p className="mb-4 text-sm text-muted-foreground">{RESET_COPY.intro}</p>
        <ResetRows onAsk={setAsking} plans={plans} />
      </div>
      <ResetDialog onClose={() => setAsking(null)} plans={plans} scope={asking} />
    </SettingsContent>
  )
}
