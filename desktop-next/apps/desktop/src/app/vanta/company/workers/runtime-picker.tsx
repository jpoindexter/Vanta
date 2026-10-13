import type { RuntimeOption } from '@/api/vanta-company-schemas'

import { NATIVE_RUNTIME } from '../format'

import { availabilityOf } from './runtime-availability'

interface RuntimePickerProps {
  busy: boolean
  onChange: (runtimeId: string) => void
  /** Null while the runtimes load or when they could not be checked: only the Vanta loop is offered then. */
  runtimes: RuntimeOption[] | null
  selected: string
}

function Choice({
  busy,
  option,
  onChange,
  selected
}: Omit<RuntimePickerProps, 'runtimes'> & { option: RuntimeOption }) {
  const { blocked, caution } = availabilityOf(option)
  const id = `runtime-${option.runtimeId}`
  const noteId = `${id}-note`

  return (
    <div className="vc-radio">
      <input
        aria-describedby={blocked || caution ? noteId : undefined}
        checked={selected === option.runtimeId}
        disabled={busy || blocked !== null}
        id={id}
        name="runtime"
        onChange={() => onChange(option.runtimeId)}
        type="radio"
      />
      <label htmlFor={id}>
        {option.runtimeId === NATIVE_RUNTIME ? 'Vanta native loop (default)' : option.displayName}
        {option.version && <span className="vp-muted"> {option.version}</span>}
      </label>
      {(blocked || caution) && (
        <p
          className="vp-note vp-note--flush vc-radio__note"
          data-testid={blocked ? 'runtime-blocked' : 'runtime-caution'}
          id={noteId}
        >
          {blocked ?? caution}
        </p>
      )}
    </div>
  )
}

/** Where the worker runs: the native Vanta loop, or an external CLI that is installed and signed in. */
export function RuntimePicker({ busy, onChange, runtimes, selected }: RuntimePickerProps) {
  const options = runtimes ?? []
  const hasNative = options.some(option => option.runtimeId === NATIVE_RUNTIME)
  const shown = hasNative
    ? options
    : [
        {
          adapter: null,
          auth: 'not-applicable',
          command: null,
          displayName: 'Vanta',
          installed: true,
          runtimeId: NATIVE_RUNTIME,
          selfApproving: false,
          version: null
        } as RuntimeOption,
        ...options
      ]

  return (
    <fieldset className="vc-fieldset">
      <legend className="vc-field__label">Runtime</legend>
      {shown.map(option => (
        <Choice busy={busy} key={option.runtimeId} onChange={onChange} option={option} selected={selected} />
      ))}
      {runtimes === null && <p className="vp-note vp-note--flush">Other runtimes could not be checked.</p>}
    </fieldset>
  )
}
