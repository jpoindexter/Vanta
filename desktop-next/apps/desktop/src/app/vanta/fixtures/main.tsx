import '@/styles.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { RootTooltipProvider } from '@/components/ui/tooltip'
import { ThemeProvider } from '@/themes/context'

import { SETTINGS_SECTIONS, type SettingsSection, WORKBENCH_TABS, type WorkbenchTab } from '../types'

import { type FixtureState } from './data'
import { Harness, type HarnessQuery, type Screen, SCREENS } from './harness'

function pick<T extends string>(value: null | string, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback
}

function readQuery(search: string): HarnessQuery {
  const params = new URLSearchParams(search)
  const width = Number(params.get('w'))

  return {
    bare: params.get('bare') === '1',
    filter: params.get('filter') ?? '',
    screen: pick<Screen>(params.get('screen'), SCREENS, 'home'),
    section: pick<SettingsSection>(params.get('section'), SETTINGS_SECTIONS, 'general'),
    state: pick<FixtureState>(params.get('state'), ['empty', 'error', 'loading', 'ready'], 'ready'),
    tab: pick<WorkbenchTab>(params.get('tab'), WORKBENCH_TABS, 'changes'),
    width: width === 800 || width === 1100 ? width : 1440
  }
}

const params = new URLSearchParams(window.location.search)
const theme = params.get('theme') === 'dark' ? 'dark' : 'light'

// The ThemeProvider reads the persisted mode; seed it before first render.
try {
  localStorage.setItem('hermes-desktop-mode-v1', theme)
} catch {
  // Storage can be unavailable in locked-down contexts; the system mode applies.
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <RootTooltipProvider>
        <Harness query={readQuery(window.location.search)} />
      </RootTooltipProvider>
    </ThemeProvider>
  </StrictMode>
)
