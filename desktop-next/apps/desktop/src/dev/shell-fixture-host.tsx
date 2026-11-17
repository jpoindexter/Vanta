/**
 * Fixture layers for the parity run: the wireframe's pages, workbench, palette and
 * settings sheet, drawn inside the real shell (real titlebar, sidebar and window
 * geometry) with the harness data of `app/vanta/fixtures`.
 *
 * Mounted by `ChatRoutesSurface` only in builds made with VITE_SHELL_FIXTURES; a
 * normal build contains none of it. These surfaces are not yet reachable from the
 * live window, so this is how the checker measures them in context.
 */

import { useStore } from '@nanostores/react'
import { atom } from 'nanostores'
import { type ReactNode, useState } from 'react'
import { createPortal } from 'react-dom'

import { HomePage } from '@/app/vanta/home/home-page'
import { ConnectionsPage, OutputsPage, SchedulesPage, SkillsPage } from '@/app/vanta/lists/pages'
import { CommandPalette } from '@/app/vanta/palette/command-palette'
import { SettingsSheet } from '@/app/vanta/settings/settings-sheet'
import { type ListPageProps, type SettingsSection, type WorkbenchTab } from '@/app/vanta/types'
import { workbenchModeFor } from '@/app/vanta/workbench/mode'
import { Workbench } from '@/app/vanta/workbench/workbench'
import {
  APPROVALS,
  BROWSER,
  CHANGES,
  FILES,
  homeProps,
  LIST_ROWS,
  OUTPUTS,
  PALETTE,
  record,
  SETTINGS_ROWS,
  TERMINAL
} from '@/app/vanta/fixtures/data'

export type FixturePage = 'connections' | 'home' | 'outputs' | 'schedules' | 'skills'

export interface FixtureLayers {
  overlay: 'palette' | 'settings' | null
  page: FixturePage | null
  workbench: WorkbenchTab | null
}

export const NO_LAYERS: FixtureLayers = { overlay: null, page: null, workbench: null }

export const $fixtureLayers = atom<FixtureLayers>(NO_LAYERS)

const wait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))

function listProps(page: Exclude<FixturePage, 'home'>): ListPageProps {
  return {
    onPrimary: record('primary'),
    onRetry: record('retry'),
    onRowAction: record('rowAction'),
    rows: { items: LIST_ROWS[page], status: 'ready' }
  }
}

function Page({ page }: { page: FixturePage }): ReactNode {
  switch (page) {
    case 'home':
      return <HomePage {...homeProps('ready')} />

    case 'schedules':
      return <SchedulesPage {...listProps('schedules')} />

    case 'connections':
      return <ConnectionsPage {...listProps('connections')} />

    case 'skills':
      return <SkillsPage {...listProps('skills')} />

    default:
      return <OutputsPage {...listProps('outputs')} />
  }
}

function WorkbenchHost({ initial }: { initial: WorkbenchTab }) {
  const [tab, setTab] = useState<WorkbenchTab>(initial)

  return (
    <Workbench
      browser={{ data: BROWSER, status: 'ready' }}
      changes={{ data: CHANGES, status: 'ready' }}
      files={{ data: FILES, status: 'ready' }}
      mode={workbenchModeFor(window.innerWidth)}
      onClose={() => $fixtureLayers.set({ ...$fixtureLayers.get(), workbench: null })}
      onOpenOutput={record('openOutput')}
      onRestore={record('restore')}
      onRetry={record('retry')}
      onSelectFile={record('selectFile')}
      onTabChange={setTab}
      outputs={{ data: OUTPUTS, status: 'ready' }}
      tab={tab}
      terminal={{ data: TERMINAL, status: 'ready' }}
    />
  )
}

function SettingsHost() {
  const [section, setSection] = useState<SettingsSection>('general')

  return (
    <SettingsSheet
      approvals={APPROVALS}
      onClose={() => $fixtureLayers.set({ ...$fixtureLayers.get(), overlay: null })}
      onRevoke={id => {
        record('revoke')(id)

        return wait(150)
      }}
      onSave={(id, value) => {
        record('save')(id, value)

        return wait(150)
      }}
      onSectionChange={setSection}
      rows={SETTINGS_ROWS}
      section={section}
    />
  )
}

/** A fixed frame under the 44px titlebar, so the scrim and the overlay-mode workbench cover the whole window like the wireframe's. */
function Overlays({ layers }: { layers: FixtureLayers }) {
  return createPortal(
    <div className="vp" data-fixture-overlays="" style={{ inset: 0, pointerEvents: 'none', position: 'fixed', zIndex: 60 }}>
      <div style={{ inset: 0, pointerEvents: 'auto', position: 'absolute' }}>
        {layers.overlay === 'palette' && (
          <CommandPalette commands={PALETTE} onClose={record('paletteClose')} onRun={record('paletteRun')} />
        )}
        {layers.overlay === 'settings' && <SettingsHost />}
        {layers.workbench && workbenchModeFor(window.innerWidth) !== 'docked' && (
          <WorkbenchHost initial={layers.workbench} key={layers.workbench} />
        )}
      </div>
    </div>,
    document.getElementById('root') ?? document.body
  )
}

/** Wraps the real route table: a fixture page replaces it, a docked workbench sits beside it. */
export default function FixtureHost({ children }: { children: ReactNode }) {
  const layers = useStore($fixtureLayers)
  const docked = layers.workbench !== null && workbenchModeFor(window.innerWidth) === 'docked'

  return (
    <>
      {/* A page route (Schedules is /cron) also opens its Vanta overlay; the fixture page is what is measured, so the overlay must not cover it. */}
      {layers.page && <style>{'[data-overlay-surface]{display:none!important}'}</style>}
      <div className="flex h-full min-h-0 w-full min-w-0">
        <div className="relative h-full min-h-0 min-w-0 flex-1" data-docked-main={docked ? '' : undefined} data-fixture-main="">
          {layers.page ? (
            <div className="vp-scroll vp h-full overflow-auto">
              <Page page={layers.page} />
            </div>
          ) : (
            children
          )}
        </div>
        {docked && layers.workbench && <WorkbenchHost initial={layers.workbench} key={layers.workbench} />}
      </div>
      {(layers.overlay || (layers.workbench && !docked)) && <Overlays layers={layers} />}
    </>
  )
}
