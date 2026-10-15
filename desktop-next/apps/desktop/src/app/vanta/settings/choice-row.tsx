import { useState } from 'react'

import { SETTINGS_COPY } from '../copy'
import type { SettingChoice } from '../types'
import { VpButton, VpChip } from '../ui/button'
import { VpRow } from '../ui/row'

interface ChoiceRowProps {
  onSave: (id: string, value: string) => Promise<void>
  row: SettingChoice
}

/** Instant-save row: picking an option applies it at once; a failed save rolls back visibly. */
export function ChoiceRow({ onSave, row }: ChoiceRowProps) {
  const [value, setValue] = useState(row.value)
  const [open, setOpen] = useState(false)
  const [failed, setFailed] = useState(false)
  const current = row.options.find(option => option.value === value)

  const pick = async (next: string) => {
    if (next === value) {
      return
    }

    const previous = value

    setFailed(false)
    setValue(next)

    try {
      await onSave(row.id, next)
    } catch {
      setValue(previous)
      setFailed(true)
    }
  }

  return (
    <>
      <VpRow
        actions={
          <VpButton
            aria-expanded={open}
            aria-label={`${SETTINGS_COPY.change}: ${row.label}`}
            onClick={() => setOpen(prev => !prev)}
          >
            {SETTINGS_COPY.change}
          </VpButton>
        }
        detail={current?.label ?? value}
        title={row.label}
      />
      {open && (
        <div aria-label={row.label} className="vp-choice" role="radiogroup">
          {row.options.map(option => (
            <VpChip
              aria-checked={option.value === value}
              key={option.value}
              onClick={() => void pick(option.value)}
              role="radio"
            >
              {option.label}
            </VpChip>
          ))}
        </div>
      )}
      {failed && (
        <p className="vp-error" role="alert">
          {SETTINGS_COPY.saveFailed}
        </p>
      )}
    </>
  )
}
