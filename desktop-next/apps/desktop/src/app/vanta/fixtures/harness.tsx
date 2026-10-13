import './harness.css'

import { type ReactNode, useState } from 'react'

import { HomePage } from '../home/home-page'
import { ConnectionsPage, OutputsPage, SchedulesPage, SkillsPage } from '../lists/pages'
import { CommandPalette } from '../palette/command-palette'
import { SettingsSheet } from '../settings/settings-sheet'
import { type ListPageProps, type SettingsSection, WORKBENCH_TABS, type WorkbenchTab } from '../types'
import { workbenchModeFor } from '../workbench/mode'
import { Workbench } from '../workbench/workbench'

import {
  APPROVALS,
  blockFor,
  BROWSER,
  CHANGES,
  FILES,
  type FixtureState,
  homeProps,
  LIST_ROWS,
  OUTPUTS,
  PALETTE,
  record,
  SETTINGS_ROWS,
  tabFor,
  TERMINAL
} from './data'

export const SCREENS = [
  'home',
  'schedules',
  'connections',
  'skills',
  'outputs',
  'workbench',
  'palette',
  'settings'
] as const
export type Screen = (typeof SCREENS)[number]

export interface HarnessQuery {
  filter: string
  screen: Screen
  section: SettingsSection
  state: FixtureState
  tab: WorkbenchTab
  width: 800 | 1100 | 1440
}

const wait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))

function listProps(page: keyof typeof LIST_ROWS, state: FixtureState): ListPageProps {
  return { onPrimary: record('primary'), onRetry: record('retry'), onRowAction: record('rowAction'), rows: blockFor(state, LIST_ROWS[page]) }
}

function Page({ query }: { query: HarnessQuery }): ReactNode {
  switch (query.screen) {
    case 'home':
      return <HomePage {...homeProps(query.state)} />

    case 'schedules':
      return <SchedulesPage {...listProps('schedules', query.state)} />

    case 'connections':
      return <ConnectionsPage {...listProps('connections', query.state)} />

    case 'skills':
      return <SkillsPage {...listProps('skills', query.state)} />

    case 'outputs':
      return <OutputsPage {...listProps('outputs', query.state)} />

    default:
      return null
  }
}

function WorkbenchHost({ query }: { query: HarnessQuery }) {
  const [tab, setTab] = useState<WorkbenchTab>(query.tab)
  const s = query.state

  return (
    <Workbench
      browser={tabFor(s, BROWSER, BROWSER)}
      changes={tabFor(s, CHANGES, { files: [] })}
      files={tabFor(s, FILES, FILES)}
      mode={workbenchModeFor(query.width)}
      onClose={record('workbenchClose')}
      onOpenOutput={record('openOutput')}
      onRestore={record('restore')}
      onRetry={record('retry')}
      onSelectFile={record('selectFile')}
      onTabChange={setTab}
      outputs={tabFor(s, OUTPUTS, { items: [] })}
      tab={tab}
      terminal={tabFor(s, TERMINAL, TERMINAL)}
    />
  )
}

function SettingsHost({ query }: { query: HarnessQuery }) {
  const [section, setSection] = useState<SettingsSection>(query.section)

  return (
    <SettingsSheet
      approvals={APPROVALS}
      onClose={record('settingsClose')}
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

export function Harness({ query }: { query: HarnessQuery }) {
  const showsWorkbench = query.screen === 'workbench'

  return (
    <div className="vp">
      <div className={`vpx-frame vpx-w${query.width}`} id="frame" style={{ width: query.width }}>
        <header className="vpx-titlebar" data-owner="shell-chrome" />
        <div className="vpx-body">
          <aside className="vpx-sidebar" data-owner="shell-chrome" />
          <main className="vpx-main">
            <div />
            <div className="vp-scroll">
              <Page query={query} />
            </div>
            <div />
          </main>
          {showsWorkbench && <WorkbenchHost query={query} />}
        </div>
        {query.screen === 'palette' && <CommandPalette commands={PALETTE} onClose={record('paletteClose')} onRun={record('paletteRun')} />}
        {query.screen === 'settings' && <SettingsHost query={query} />}
      </div>
    </div>
  )
}

export { WORKBENCH_TABS }
