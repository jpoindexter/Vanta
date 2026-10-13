import type { Translations } from './types'

// Shell chrome strings, spread into en.ts. Copy matches the approved wireframe.
export const enVantaShell = {
  sidebar: {
    label: 'Sidebar',
    newChat: 'New chat',
    search: 'Search',
    nav: {
      home: 'Home',
      schedules: 'Schedules',
      connections: 'Connections',
      skills: 'Skills & tools',
      outputs: 'Outputs',
      company: 'Company'
    },
    groups: { needsYou: 'Needs you', pinned: 'Pinned', recent: 'Recent' },
    newChatIn: project => `New chat in ${project}`,
    needsYouCount: count => (count === 1 ? '1 chat needs you' : `${count} chats need you`),
    loading: 'Loading chats',
    loadError: 'Chats did not load.',
    retry: 'Retry',
    empty: 'No chats yet.',
    footer: {
      account: 'Account and status',
      settings: 'Settings',
      localBackend: 'Local',
      remoteBackend: 'Remote',
      versionLabel: 'Version',
      profileDefault: 'Default',
      connected: 'Connected',
      connecting: 'Connecting',
      backend: 'Backend',
      model: 'Model',
      noModel: 'No model selected',
      statusbar: 'Show status bar'
    }
  },
  status: {
    running: 'Running',
    waiting: 'Waiting for you',
    needsInput: 'Needs your input',
    offline: 'Offline',
    done: 'Done',
    failed: 'Failed',
    statusLabel: 'Status'
  },
  titlebar: {
    openSidebar: 'Open sidebar',
    closeSidebar: 'Close sidebar',
    newChat: 'New chat',
    sessionMenu: 'Chat options',
    changes: 'Changes',
    terminal: 'Terminal',
    browser: 'Browser',
    files: 'Files',
    more: 'More',
    project: 'Project',
    noProject: 'No project',
    projectMenu: (project: string) => `Project: ${project}`,
    switchProject: 'Switch project…',
    revealProject: 'Reveal in Finder',
    copyProjectPath: 'Copy path',
    projectPathCopied: 'Project path copied.',
    switchProjectFailed: 'Could not switch project.',
    newChatTitle: 'New chat',
    resetLayout: 'Reset layout',
    hideStatusbar: 'Hide status bar',
    showStatusbar: 'Show status bar',
    simpleMode: 'Simple mode',
    advancedMode: 'Advanced mode'
  },
  offline: {
    banner: 'Offline. Messages queue until Vanta reconnects.',
    retry: 'Retry now'
  }
} satisfies Translations['vantaShell']
