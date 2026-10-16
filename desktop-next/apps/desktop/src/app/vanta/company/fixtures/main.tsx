import '@/styles.css'
import './harness.css'

import { StrictMode, useMemo } from 'react'
import { createRoot } from 'react-dom/client'

import { RootTooltipProvider } from '@/components/ui/tooltip'
import { ThemeProvider } from '@/themes/context'

import { COMPANY_TABS } from '../copy'

import { FakeCompanyServer } from './fake-company-server'
import type { Scenario } from './fake-company-state'
import { ScreenHost } from './screen-host'

const SCENARIOS: readonly Scenario[] = ['empty', 'error', 'loading', 'offline', 'ready']

function pick<T extends string>(value: null | string, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback
}

const params = new URLSearchParams(window.location.search)
const theme = params.get('theme') === 'dark' ? 'dark' : 'light'
const width = params.get('w') === '1100' ? 1100 : 1440

// The ThemeProvider reads the persisted mode; seed it before first render.
try {
  localStorage.setItem('vanta-desktop-mode-v1', theme)
} catch {
  // Storage can be unavailable in locked-down contexts; the system mode applies.
}

function Harness() {
  const server = useMemo(() => new FakeCompanyServer(pick(params.get('state'), SCENARIOS, 'ready')), [])
  const initial = { tab: pick(params.get('tab'), COMPANY_TABS, 'workers'), ticketId: params.get('ticket') }

  return (
    <div className="vp">
      <div className={`vcx-frame vcx-w${width}`} id="frame" style={{ width }}>
        <header className="vcx-titlebar" />
        <div className="vcx-body">
          <aside className="vcx-sidebar" />
          <main className="vcx-main">
            <ScreenHost initial={initial} server={server} />
          </main>
        </div>
      </div>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <RootTooltipProvider>
        <Harness />
      </RootTooltipProvider>
    </ThemeProvider>
  </StrictMode>
)
