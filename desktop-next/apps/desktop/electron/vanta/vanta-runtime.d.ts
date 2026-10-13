// Types for the existing Vanta launcher helpers (plain .mjs under vanta-ts/desktop-app/electron).
// They are reused, not copied, so the Vanta shell and this one cannot disagree on how the server starts.

declare module '*/vanta-ts/desktop-app/electron/runtime-paths.mjs' {
  export interface VantaRuntimePaths {
    cli: string
    dist: string
    icon: string
    kernel: string
    loader: string
  }

  export function resolveRuntimePaths(input: {
    appPath: string
    packaged: boolean
    platform: string
    resourcesPath: string
  }): VantaRuntimePaths
}

declare module '*/vanta-ts/desktop-app/electron/runtime-env.mjs' {
  export function desktopRuntimeEnv(parent?: NodeJS.ProcessEnv): NodeJS.ProcessEnv
}

declare module '*/vanta-ts/desktop-app/electron/project-root.mjs' {
  export function findAvailablePort(preferred: number, host?: string): Promise<number>
  export function resolveProjectRoot(input: {
    args: string[]
    cwd?: string
    env: NodeJS.ProcessEnv
    home?: string
    userData: string
  }): Promise<string>
  export function saveProjectSetting(userData: string, projectRoot: string): Promise<void>
  export function usableDirectory(path: string | undefined): Promise<boolean>
}

declare module '*/vanta-ts/desktop-app/electron/project-folder-picker.mjs' {
  export function showProjectFolderPicker(options: {
    currentPath?: unknown
    dialog: unknown
    fallbackPath?: string
    parentWindow?: unknown
  }): Promise<string | null>
}

declare module '*/vanta-ts/desktop-app/electron/dropped-paths.mjs' {
  export function resolveDroppedPaths(paths: string[], projectRoot: string, maximum?: number): Promise<unknown>
}

declare module '*/vanta-ts/desktop-app/electron/project-switch.mjs' {
  export interface PreparedProjectSwitch {
    draft: unknown
    id: string
    targetRoot: string
  }

  export function prepareProjectSwitch(value: unknown): Promise<PreparedProjectSwitch>
  export function createPendingProjectTaskStore(): {
    acknowledge: (id: string, currentRoot: string) => boolean
    read: (currentRoot: string) => null | PreparedProjectSwitch
    set: (value: PreparedProjectSwitch) => void
  }
}
