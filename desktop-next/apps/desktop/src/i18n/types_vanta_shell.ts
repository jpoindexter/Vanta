// Shell chrome strings (sidebar, titlebar, status words, offline banner);
// `Translations` carries this as `vantaShell`.
export interface VantaShellTranslations {
  sidebar: {
    label: string
    newChat: string
    search: string
    nav: { home: string; schedules: string; connections: string; skills: string; outputs: string; company: string }
    groups: { needsYou: string; pinned: string; recent: string }
    newChatIn: (project: string) => string
    needsYouCount: (count: number) => string
    loading: string
    loadError: string
    retry: string
    empty: string
    footer: {
      account: string
      settings: string
      localBackend: string
      remoteBackend: string
      versionLabel: string
      profileDefault: string
      connected: string
      connecting: string
      backend: string
      model: string
      noModel: string
      statusbar: string
    }
  }
  status: {
    running: string
    waiting: string
    needsInput: string
    offline: string
    done: string
    failed: string
    statusLabel: string
  }
  titlebar: {
    openSidebar: string
    closeSidebar: string
    newChat: string
    sessionMenu: string
    changes: string
    terminal: string
    browser: string
    files: string
    more: string
    project: string
    noProject: string
    projectMenu: (project: string) => string
    switchProject: string
    revealProject: string
    copyProjectPath: string
    projectPathCopied: string
    switchProjectFailed: string
    newChatTitle: string
    resetLayout: string
    hideStatusbar: string
    showStatusbar: string
    simpleMode: string
    advancedMode: string
  }
  offline: {
    banner: string
    retry: string
  }
  reconnect: {
    action: string
    title: (provider: string) => string
    body: string
    keyLabel: string
    keyEnvHint: (env: string) => string
    keylessBody: (provider: string) => string
    confirm: string
    resume: string
    busy: string
    cancel: string
    missingKey: string
    noKeyRoute: string
    failed: string
  }
  runRecovery: {
    retryStep: string
    editRequest: string
    startFromCheckpoint: string
    checkpointReady: string
    actionsLabel: string
  }
}
