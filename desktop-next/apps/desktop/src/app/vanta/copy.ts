/** Every user-visible string for the Vanta pages. Strings marked (wireframe) are
 *  verbatim from the approved wireframe; the rest cover states the wireframe's
 *  screen inventory names but does not draw (loading, error, empty). */

export const HOME_COPY = {
  composerLabel: 'Start a task', // (wireframe)
  composerPlaceholder: 'What should Vanta do?', // (wireframe)
  sendLabel: 'Send', // (wireframe)
  attachLabel: 'Attach',
  projectLabel: 'Project',
  projectSuffix: ' project', // (wireframe: "Vanta project")
  needsYou: 'Needs you', // (wireframe)
  needsYouEmpty: 'Nothing needs you.', // (wireframe)
  running: 'Running now', // (wireframe)
  nextUp: 'Next up', // (wireframe)
  recent: 'Recent outputs', // (wireframe)
  allowOnce: 'Allow once', // (wireframe)
  open: 'Open', // (wireframe)
  stop: 'Stop', // (wireframe)
  runNow: 'Run now', // (wireframe)
  edit: 'Edit', // (wireframe)
  reveal: 'Reveal', // (wireframe)
  retry: 'Retry',
  runningEmpty: 'Nothing is running.',
  nextUpEmpty: 'No schedules or monitors yet.',
  recentEmpty: 'Outputs appear here.' // (wireframe, Outputs empty state)
} as const

export const BLOCK_ERROR = {
  nextUp: "Couldn't load Next up.",
  needsYou: "Couldn't load Needs you.",
  recent: "Couldn't load Recent outputs.",
  running: "Couldn't load Running now."
} as const

export interface ListPageCopy {
  title: string
  subtitle: string
  cta: string
  empty: string
  error: string
}

export const LIST_COPY = {
  schedules: {
    title: 'Schedules', // (wireframe)
    subtitle: 'Monitors and recurring work. Nothing sends or posts without your approval.', // (wireframe)
    cta: 'New schedule', // (wireframe)
    empty: 'No schedules.', // (wireframe screen inventory)
    error: "Couldn't load schedules."
  },
  connections: {
    title: 'Connections', // (wireframe)
    subtitle: 'Accounts and tools Vanta can use.', // (wireframe)
    cta: 'Connect', // (wireframe)
    empty: 'Nothing connected.', // (wireframe screen inventory)
    error: "Couldn't load connections."
  },
  skills: {
    title: 'Skills & tools', // (wireframe)
    subtitle: 'What the agent can do. Turn things off you do not want.', // (wireframe)
    cta: 'Browse skills', // (wireframe)
    empty: 'Start with the starter set.',
    error: "Couldn't load skills."
  },
  outputs: {
    title: 'Outputs', // (wireframe)
    subtitle: 'Documents and files Vanta made.', // (wireframe)
    cta: 'Open folder', // (wireframe)
    empty: 'Outputs appear here.', // (wireframe screen inventory)
    error: "Couldn't load outputs."
  }
} as const satisfies Record<string, ListPageCopy>

export type ListPageId = keyof typeof LIST_COPY

export const WORKBENCH_COPY = {
  label: 'Workbench', // (wireframe aria-label)
  close: 'Close workbench', // (wireframe)
  tabs: { changes: 'Changes', files: 'Files', browser: 'Browser', terminal: 'Terminal', outputs: 'Outputs' }, // (wireframe)
  restore: 'Restore to before this run', // (wireframe)
  filePreview: 'file preview', // (wireframe)
  pagePreview: 'page preview', // (wireframe)
  liveOutput: 'live output', // (wireframe)
  noChanges: 'No changes yet.', // (wireframe screen inventory)
  noOutputs: 'Outputs appear here.',
  open: 'Open', // (wireframe)
  address: 'Address',
  loading: 'Loading',
  retry: 'Retry'
} as const

export const PALETTE_COPY = {
  label: 'Command palette', // (wireframe)
  placeholder: 'Search chats, go anywhere, run an action', // (wireframe)
  noMatches: 'No matches.' // (wireframe)
} as const

export const SETTINGS_COPY = {
  title: 'Settings', // (wireframe)
  close: 'Close settings', // (wireframe)
  sections: {
    general: 'General',
    models: 'Models',
    permissions: 'Permissions',
    voice: 'Voice',
    appearance: 'Appearance'
  }, // (wireframe)
  change: 'Change', // (wireframe)
  manage: 'Manage', // (wireframe)
  revoke: 'Revoke',
  saveFailed: "Couldn't save. Reverted to the previous value.",
  revokeFailed: "Couldn't revoke. The approval is still active.",
  noApprovals: 'No remembered approvals.'
} as const

/** The terminal pane has no shell: every line is one command that waits for an approval card. */
export const TERMINAL_COPY = {
  gateNote: 'Every command asks for approval first, in the chat you are looking at.',
  gateNoteLabel: 'About this terminal'
} as const
