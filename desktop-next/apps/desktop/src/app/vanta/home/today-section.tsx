import { type FormEvent, type ReactElement, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

import { CAPACITY_DIMENSIONS, type OffScope, stateLabel, type TodayItem, type TodaySnapshot } from './today-model'
import { useToday } from './use-today'

export const TODAY_COPY = {
  capturePlaceholder: 'Drop the messy version here. No category or priority needed.',
  captureSubmit: 'Capture',
  empty: 'Nothing is asking for attention.',
  footer: 'No guilt, no reconstruction. Skip or turn support off whenever it is not useful.',
  offGlobal: 'Off everywhere',
  offNote: (scope: string) => `Today support is off (${scope}). Nothing is hidden and nothing is collected while it is off.`,
  on: 'Turn back on',
  offPattern: 'Off for this kind',
  offSession: 'Off for this session',
  title: 'Today'
} as const

const OFF_CHOICES: ReadonlyArray<readonly [OffScope, string]> = [
  ['session', TODAY_COPY.offSession],
  ['pattern', TODAY_COPY.offPattern],
  ['global', TODAY_COPY.offGlobal]
]

function CaptureLine({ busy, onCapture }: { busy: boolean; onCapture: (text: string) => Promise<void> }): ReactElement {
  const [text, setText] = useState('')

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault()

    if (text.trim()) {
      await onCapture(text.trim())
      setText('')
    }
  }

  return (
    <form className="flex gap-2" onSubmit={event => void submit(event)}>
      <Input aria-label="What do you want off your mind?" onChange={event => setText(event.target.value)} placeholder={TODAY_COPY.capturePlaceholder} value={text} />
      <Button disabled={busy || !text.trim()} size="sm" type="submit" variant="outline">
        {TODAY_COPY.captureSubmit}
      </Button>
    </form>
  )
}

function Capacity({ capacity }: { capacity: Record<string, string> }): ReactElement {
  return (
    <details className="text-xs text-muted-foreground">
      <summary className="cursor-pointer">Capacity</summary>
      <dl className="mt-1 grid grid-cols-2 gap-x-4 gap-y-0.5 sm:grid-cols-4">
        {CAPACITY_DIMENSIONS.map(key => (
          <div className="flex justify-between gap-2" key={key}>
            <dt className="capitalize">{key}</dt>
            <dd>{capacity[key] ?? 'unknown'}</dd>
          </div>
        ))}
      </dl>
    </details>
  )
}

function Recommendation({ busy, item, onAct }: { busy: boolean; item: TodayItem; onAct: (action: 'do_it' | 'show_me' | 'skip' | 'snooze') => void }): ReactElement {
  return (
    <article aria-live="polite" className="grid gap-2 rounded-xl border bg-background p-3" data-testid="today-card">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{stateLabel(item.state)}</p>
          <h3 className="text-sm font-semibold">{item.outcome}</h3>
          <p className="text-sm text-muted-foreground">{item.recommendation}</p>
        </div>
        <span className="shrink-0 text-xs text-muted-foreground">{item.timeCapacityFit.minutes} min</span>
      </div>
      <p className="rounded-md bg-muted/40 px-2 py-1.5 text-xs">{item.preparedAction.preview}</p>
      <div className="flex flex-wrap gap-2">
        <Button disabled={busy} onClick={() => onAct('do_it')} size="sm">
          Do it
        </Button>
        <Button disabled={busy} onClick={() => onAct('show_me')} size="sm" variant="outline">
          Show me
        </Button>
        <Button disabled={busy} onClick={() => onAct('snooze')} size="sm" variant="outline">
          Snooze 1 hour
        </Button>
        <Button disabled={busy} onClick={() => onAct('skip')} size="sm" variant="ghost">
          Skip
        </Button>
      </div>
    </article>
  )
}

function Footer({ busy, onOff }: { busy: boolean; onOff: (scope: OffScope) => void }): ReactElement {
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      <span>{TODAY_COPY.footer}</span>
      {OFF_CHOICES.map(([scope, label]) => (
        <Button disabled={busy} key={scope} onClick={() => onOff(scope)} size="xs" variant="text">
          {label}
        </Button>
      ))}
    </div>
  )
}

function Body({ snapshot, state }: { snapshot: TodaySnapshot; state: ReturnType<typeof useToday> }): ReactElement {
  const item = snapshot.today[0]
  const refused = snapshot.support.refusal.active

  if (refused) {
    return (
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span>{TODAY_COPY.offNote(snapshot.support.refusal.scope ?? 'for now')}</span>
        <Button disabled={state.busy} onClick={() => void state.turnOn()} size="xs" variant="outline">
          {TODAY_COPY.on}
        </Button>
      </div>
    )
  }

  return (
    <>
      {snapshot.reentry && <p className="text-xs text-muted-foreground">Pick up here: {snapshot.reentry.action}</p>}
      {item ? <Recommendation busy={state.busy} item={item} onAct={action => void state.act(item.id, action)} /> : <p className="text-sm text-muted-foreground">{TODAY_COPY.empty}</p>}
      <CaptureLine busy={state.busy} onCapture={state.capture} />
      <Capacity capacity={snapshot.support.capacity} />
      <Footer busy={state.busy} onOff={scope => void state.turnOff(scope)} />
    </>
  )
}

/** Home's "Today": one bounded next step, a place to drop a thought, and an always-available way to turn it off. */
export function TodaySection(): null | ReactElement {
  const state = useToday()

  if (!state.snapshot) {
    return null
  }

  return (
    <section aria-labelledby="vp-home-today" className="vp-sec" data-testid="today-section">
      <h3 id="vp-home-today">{TODAY_COPY.title}</h3>
      <Body snapshot={state.snapshot} state={state} />
      {state.error && (
        <p className="text-xs text-destructive" role="alert">
          {state.error}
        </p>
      )}
    </section>
  )
}
