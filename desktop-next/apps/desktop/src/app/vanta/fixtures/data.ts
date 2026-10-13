import type { ListPageId } from '../copy'
import type {
  BlockState,
  BrowserData,
  ChangesData,
  FilesData,
  HomeProps,
  ListRowItem,
  NeedsYouItem,
  NextUpItem,
  OutputsData,
  PaletteCommand,
  ProjectApprovals,
  ProjectChip,
  RecentOutputItem,
  RunningItem,
  SettingChoice,
  SettingsSection,
  TabState,
  TerminalData
} from '../types'

/** Mock data lifted from the approved wireframe so screenshots compare 1:1. */

export type FixtureState = 'empty' | 'error' | 'loading' | 'ready'

export function blockFor<T>(state: FixtureState, items: T[], message = 'The server did not answer.'): BlockState<T> {
  switch (state) {
    case 'loading':
      return { status: 'loading' }

    case 'error':
      return { status: 'error', message }

    case 'empty':
      return { status: 'ready', items: [] }

    default:
      return { status: 'ready', items }
  }
}

export function tabFor<T>(state: FixtureState, data: T, empty: T, message = 'The server did not answer.'): TabState<T> {
  switch (state) {
    case 'loading':
      return { status: 'loading' }

    case 'error':
      return { status: 'error', message }

    case 'empty':
      return { status: 'ready', data: empty }

    default:
      return { status: 'ready', data }
  }
}

export const PROJECTS: ProjectChip[] = [
  { id: 'vanta', name: 'Vanta' },
  { id: 'research', name: 'Research' },
  { id: 'portfolio', name: 'Portfolio' }
]

export const NEEDS_YOU: NeedsYouItem[] = [
  { id: 's1', title: 'Refactor billing webhooks', detail: 'Run a command: npm test -- billing', canAllowOnce: true },
  { id: 's2', title: 'Weekly competitor brief', detail: 'Needs a source for Acme', canAllowOnce: false }
]

export const RUNNING: RunningItem[] = [
  { id: 's4', title: 'Fix flaky skills test', detail: 'Running tests: skills library (12 of 41) · 0:42' }
]

export const NEXT_UP: NextUpItem[] = [
  { id: 'm1', title: 'Competitor pricing monitor', detail: 'Last checked 06:40 · no change · next 12:40', action: 'run' },
  { id: 'm2', title: 'Weekly brief', detail: 'Fri 09:00 · drafts to Outputs, never sends', action: 'edit' }
]

export const RECENT: RecentOutputItem[] = [
  { id: 'o1', name: 'q4-launch-plan.md' },
  { id: 'o2', name: 'competitor-brief-w41.pdf' },
  { id: 'o3', name: 'billing-retry.diff' }
]

const noop = () => undefined

export function homeProps(state: FixtureState): HomeProps {
  return {
    actions: {
      onAllowOnce: noop,
      onEditSchedule: noop,
      onOpenOutput: noop,
      onOpenSession: noop,
      onRetry: noop,
      onRevealOutput: noop,
      onRunSchedule: noop,
      onStopRun: noop,
      onSubmitTask: noop
    },
    needsYou: blockFor(state, NEEDS_YOU),
    nextUp: blockFor(state, NEXT_UP),
    projects: PROJECTS,
    recent: blockFor(state, RECENT),
    running: blockFor(state, RUNNING),
    starterPrompt: 'Compare three CRM tools and save a brief'
  }
}

export const LIST_ROWS: Record<ListPageId, ListRowItem[]> = {
  schedules: [
    { id: 'a', icon: 'schedule', title: 'Competitor pricing monitor', detail: 'Every day 06:40 · last checked 06:40 · no change', actionLabel: 'Edit' },
    { id: 'b', icon: 'schedule', title: 'Weekly brief', detail: 'Fri 09:00 · drafts only', actionLabel: 'Edit' },
    { id: 'c', icon: 'attention', title: 'Inbox digest', detail: 'Missed run: laptop was asleep at 07:00', actionLabel: 'Run now' }
  ],
  connections: [
    { id: 'a', icon: 'connection', title: 'Google (Gmail, Calendar, Drive)', detail: 'Read only · connected', actionLabel: 'Manage' },
    { id: 'b', icon: 'connection', title: 'LinkedIn', detail: 'Posting needs approval each time', actionLabel: 'Manage' },
    { id: 'c', icon: 'attention', title: 'GitHub', detail: 'Needs reconnect', actionLabel: 'Reconnect' },
    { id: 'd', icon: 'connection', title: 'MCP: filesystem', detail: '3 tools', actionLabel: 'Manage' }
  ],
  skills: [
    { id: 'a', icon: 'skill', title: 'Research and cite', detail: 'On', actionLabel: 'Disable' },
    { id: 'b', icon: 'skill', title: 'Documents (read, write, convert)', detail: 'On', actionLabel: 'Disable' },
    { id: 'c', icon: 'skill', title: 'Browser (isolated profile)', detail: 'On', actionLabel: 'Disable' },
    { id: 'd', icon: 'skill', title: 'Shell commands', detail: 'Ask each time', actionLabel: 'Change' }
  ],
  outputs: [
    { id: 'a', icon: 'file', title: 'q4-launch-plan.md', detail: 'Today 09:12 · from Q4 launch plan', actionLabel: 'Open' },
    { id: 'b', icon: 'file', title: 'competitor-brief-w41.pdf', detail: 'Yesterday · from Weekly competitor brief', actionLabel: 'Open' },
    { id: 'c', icon: 'attention', title: 'old-report.docx', detail: 'File missing from disk', actionLabel: 'Locate' }
  ]
}

export const CHANGES: ChangesData = {
  files: [
    {
      path: 'billing/webhooks.ts',
      added: 24,
      removed: 6,
      diff: '− await send(payload)\n+ await withBackoff(() => send(payload), {max:5})'
    },
    { path: 'billing/retry.ts', added: 18, removed: 0 }
  ]
}

export const FILES: FilesData = {
  roots: [
    { name: 'billing', children: [{ name: 'webhooks.ts' }, { name: 'retry.ts' }, { name: 'webhooks.test.ts' }] },
    { name: 'docs', children: [] }
  ]
}

export const BROWSER: BrowserData = { url: 'https://stripe.com/docs/webhooks' }
export const TERMINAL: TerminalData = { output: '$ npm test -- billing\nPASS  38 tests\nFAIL  3 tests' }
export const OUTPUTS: OutputsData = {
  items: [
    { id: 'p1', name: 'billing-retry.diff' },
    { id: 'p2', name: 'test-report.html' }
  ]
}

export const PALETTE: PaletteCommand[] = [
  { id: 'new', label: 'New chat', group: 'action', hint: '⌘N' },
  { id: 'home', label: 'Go to Home', group: 'go' },
  { id: 'schedules', label: 'Go to Schedules', group: 'go' },
  { id: 'connections', label: 'Go to Connections', group: 'go' },
  { id: 's1', label: 'Open: Refactor billing webhooks', group: 'chat' },
  { id: 's2', label: 'Open: Weekly competitor brief', group: 'chat' },
  { id: 'wb', label: 'Toggle workbench', group: 'action', hint: '⌘B' },
  { id: 'theme', label: 'Switch theme', group: 'action' },
  { id: 'stop', label: 'Stop current run', group: 'action', hint: '⌘.' }
]

const choice = (id: string, label: string, value: string, options: string[]): SettingChoice => ({
  id,
  label,
  value,
  options: options.map(o => ({ value: o, label: o }))
})

const PERMISSION_MODE = choice('permission-mode', 'Default permission mode', 'Ask each time', [
  'Ask each time',
  'Allow edits',
  'Allow all'
])

export const SETTINGS_ROWS: Record<SettingsSection, SettingChoice[]> = {
  general: [PERMISSION_MODE, choice('launch', 'Launch', 'Reopen last chat', ['Reopen last chat', 'Home'])],
  models: [
    choice('model', 'Default model', 'Sonnet 5.5', ['Sonnet 5.5', 'Haiku 5']),
    choice('effort', 'Effort', 'Medium', ['Low', 'Medium', 'High'])
  ],
  permissions: [PERMISSION_MODE],
  voice: [choice('dictation', 'Dictation', 'On', ['On', 'Off']), choice('speak', 'Read replies aloud', 'Off', ['On', 'Off'])],
  appearance: [choice('theme', 'Theme', 'System', ['System', 'Light', 'Dark'])]
}

export const APPROVALS: ProjectApprovals[] = [
  {
    projectId: 'vanta',
    projectName: 'Vanta',
    approvals: [
      { id: 'ap1', scope: 'Shell commands' },
      { id: 'ap2', scope: 'Edit files in the project' }
    ]
  },
  { projectId: 'research', projectName: 'Research', approvals: [{ id: 'ap3', scope: 'Browser (isolated profile)' }] }
]
