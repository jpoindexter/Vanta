import { IconX } from '@tabler/icons-react'
import { type KeyboardEvent, useRef } from 'react'

import { SETTINGS_COPY } from '../copy'
import { SETTINGS_SECTIONS, type SettingsProps, type SettingsSection } from '../types'
import { VpButton } from '../ui/button'
import { VpRow } from '../ui/row'
import { useFocusTrap } from '../ui/use-focus-trap'
import { ChoiceRow } from './choice-row'
import { PermissionsPanel } from './permissions-panel'

function SectionBody({ approvals, onRevoke, onSave, onSectionChange, rows, section }: SettingsProps) {
  if (section === 'permissions') {
    return (
      <div>
        <div className="vp-box" role="list">
          {rows.permissions.map(row => (
            <ChoiceRow key={row.id} onSave={onSave} row={row} />
          ))}
        </div>
        <PermissionsPanel approvals={approvals} onRevoke={onRevoke} />
      </div>
    )
  }

  return (
    <div className="vp-box" role="list">
      {section === 'general' && (
        <VpRow
          actions={
            <VpButton aria-label={`${SETTINGS_COPY.manage}: Remembered approvals`} onClick={() => onSectionChange('permissions')}>
              {SETTINGS_COPY.manage}
            </VpButton>
          }
          detail="Review and revoke what Always allow covers"
          title="Remembered approvals"
        />
      )}
      {rows[section].map(row => (
        <ChoiceRow key={row.id} onSave={onSave} row={row} />
      ))}
    </div>
  )
}

/** Settings sheet: sections left, rows right, every change saves the moment it is made. */
export function SettingsSheet(props: SettingsProps) {
  const { onClose, onSectionChange, section } = props
  const sheetRef = useRef<HTMLDivElement>(null)

  useFocusTrap(sheetRef)

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
    }
  }

  return (
    <div className="vp vp-overlay" onMouseDown={event => event.target === event.currentTarget && onClose()}>
      <div
        aria-label={SETTINGS_COPY.title}
        aria-modal="true"
        className="vp-sheet vp-sheet--settings"
        onKeyDown={handleKeyDown}
        ref={sheetRef}
        role="dialog"
      >
        <div className="vp-sheet__head">
          <h2 className="vp-sheet__title">{SETTINGS_COPY.title}</h2>
          <VpButton aria-label={SETTINGS_COPY.close} onClick={onClose}>
            <IconX aria-hidden size={14} stroke={2} />
          </VpButton>
        </div>
        <div className="vp-settings">
          <nav aria-label={SETTINGS_COPY.title}>
            {SETTINGS_SECTIONS.map((id: SettingsSection) => (
              <button
                aria-current={id === section}
                className="vp-nav"
                key={id}
                onClick={() => onSectionChange(id)}
                type="button"
              >
                {SETTINGS_COPY.sections[id]}
              </button>
            ))}
          </nav>
          <SectionBody {...props} />
        </div>
      </div>
    </div>
  )
}
