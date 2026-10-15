import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

export interface VcSelectOption {
  label: string
  value: string
}

interface VcSelectProps {
  'aria-describedby'?: string
  disabled?: boolean
  /** Text of the "nothing chosen" row, whose value is ''. Leave out when '' is not a valid choice. */
  emptyLabel?: string
  /** Set by Field so the visible label names the control. */
  id?: string
  onChange: (value: string) => void
  options: readonly VcSelectOption[]
  value: string
}

// Radix reserves '' for "show the placeholder", so the empty choice travels under a stand-in value.
const EMPTY = '__empty__'

/** The design-system dropdown for Company forms: a solid, readable list instead of the system popup. */
export function VcSelect({ emptyLabel, onChange, options, value, ...control }: VcSelectProps) {
  const rows = emptyLabel === undefined ? options : [{ label: emptyLabel, value: '' }, ...options]

  return (
    <Select
      disabled={control.disabled}
      onValueChange={next => onChange(next === EMPTY ? '' : next)}
      value={value === '' ? EMPTY : value}
    >
      <SelectTrigger aria-describedby={control['aria-describedby']} className="vc-input vc-select" id={control.id}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {rows.map(row => (
          <SelectItem data-value={row.value} key={row.value || EMPTY} value={row.value === '' ? EMPTY : row.value}>
            {row.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
