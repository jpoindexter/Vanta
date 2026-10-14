import { notify, notifyError } from '@/store/notifications'
import { applyConfiguredDefaultProjectDir } from '@/store/session'

const SUCCESS_TOAST_MS = 3000

interface ProjectCopy {
  projectPathCopied: string
  switchProjectFailed: string
}

/** Pick a folder in the native dialog, then move the Vanta runtime there. Main confirms nothing further: the picked folder is the consent. */
export async function switchProjectFolder(currentPath: string, copy: ProjectCopy): Promise<boolean> {
  const desktop = window.vantaDesktop as { pickProjectFolder?: (path?: string) => Promise<null | string> } | undefined
  const settings = window.hermesDesktop?.settings

  if (!desktop?.pickProjectFolder || !settings) {
    return false
  }

  try {
    const dir = await desktop.pickProjectFolder(currentPath)

    if (!dir) {
      return false
    }

    const result = await settings.setDefaultProjectDir(dir)

    applyConfiguredDefaultProjectDir(result.dir)

    return true
  } catch (error) {
    notifyError(error, copy.switchProjectFailed)

    return false
  }
}

export async function revealProjectFolder(path: string): Promise<void> {
  await window.hermesDesktop?.revealPath?.(path)
}

export async function copyProjectPath(path: string, copy: ProjectCopy): Promise<void> {
  await window.hermesDesktop?.writeClipboard?.(path)
  notify({ durationMs: SUCCESS_TOAST_MS, kind: 'success', message: copy.projectPathCopied })
}
