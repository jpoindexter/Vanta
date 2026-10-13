import '../../styles.css'

import { QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router'

import { RootTooltipProvider } from '@/components/ui/tooltip'
import { I18nProvider } from '@/i18n'
import { queryClient } from '@/lib/query-client'
import { ThemeProvider } from '@/themes'

import { parseFixtureParams } from './params'
import { FixtureScene } from './scene'

// Track T's skin sheet and this track's chat sheet; globbed so a missing sheet is not a build error.
import.meta.glob(['../../styles/vanta.css', '../../styles/vanta-chat.css'], { eager: true })

const params = parseFixtureParams(window.location.search)

// Appearance is read from per-profile storage at mount, so seed it first.
try {
  window.localStorage.setItem('hermes-desktop-mode-v1', params.theme)
  window.localStorage.setItem('hermes-desktop-theme-v2', 'vanta')
} catch {
  // Storage may be blocked; the harness then follows the OS scheme.
}

Object.defineProperty(window, 'hermesDesktop', { configurable: true, value: { api: async () => ({}) } })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <I18nProvider configClient={null} initialLocale="en">
        <ThemeProvider>
          <RootTooltipProvider>
            <MemoryRouter>
              <FixtureScene params={params} />
            </MemoryRouter>
          </RootTooltipProvider>
        </ThemeProvider>
      </I18nProvider>
    </QueryClientProvider>
  </StrictMode>
)
