import { type KeyboardEvent, useRef } from 'react'

import { COMPANY_TABS, type CompanyTab, TAB_LABEL } from '../copy'

interface CompanyTabsProps {
  onChange: (tab: CompanyTab) => void
  tab: CompanyTab
}

export const tabId = (tab: CompanyTab) => `vc-tab-${tab}`
export const panelId = 'vc-panel'

const STEP: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1 }

export function nextTab(current: CompanyTab, key: string): CompanyTab | undefined {
  const count = COMPANY_TABS.length

  if (key === 'Home') {
    return COMPANY_TABS[0]
  }

  if (key === 'End') {
    return COMPANY_TABS[count - 1]
  }

  const step = STEP[key]

  return step === undefined ? undefined : COMPANY_TABS[(COMPANY_TABS.indexOf(current) + step + count) % count]
}

/** Four tabs with roving tabindex: Arrow keys move, Home and End jump, selection follows focus. */
export function CompanyTabs({ onChange, tab }: CompanyTabsProps) {
  const refs = useRef<Partial<Record<CompanyTab, HTMLButtonElement | null>>>({})

  const handleKeyDown = (event: KeyboardEvent) => {
    const target = nextTab(tab, event.key)

    if (target) {
      event.preventDefault()
      onChange(target)
      refs.current[target]?.focus()
    }
  }

  return (
    <div aria-label="Company sections" className="vc-tabs" onKeyDown={handleKeyDown} role="tablist">
      {COMPANY_TABS.map(id => (
        <button
          aria-controls={panelId}
          aria-selected={tab === id}
          className="vc-tab"
          id={tabId(id)}
          key={id}
          onClick={() => onChange(id)}
          ref={node => {
            refs.current[id] = node
          }}
          role="tab"
          tabIndex={tab === id ? 0 : -1}
          type="button"
        >
          {TAB_LABEL[id]}
        </button>
      ))}
    </div>
  )
}
