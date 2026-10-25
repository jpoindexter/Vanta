import { $projects, $projectTree, projectRootCwd } from '@/store/projects'

/** The two calls a handoff needs; both exist only in the Vanta shell. */
export interface ProjectTaskBridge {
  currentDir?: () => Promise<{ dir: null | string }>
  switchForNewTask?: (draft: Record<string, unknown>) => Promise<unknown>
}

/** Where the real calls live: the default folder under `desktopBridge.settings`, the handoff on `vantaDesktop`. */
export function projectTaskBridge(): ProjectTaskBridge | undefined {
  const vanta = window.vantaDesktop as { switchProjectForNewTask?: ProjectTaskBridge['switchForNewTask'] } | undefined
  const settings = (window.desktopBridge as unknown as { settings?: { getDefaultProjectDir?: ProjectTaskBridge['currentDir'] } } | undefined)?.settings

  return vanta?.switchProjectForNewTask || settings?.getDefaultProjectDir
    ? { currentDir: settings?.getDefaultProjectDir?.bind(settings), switchForNewTask: vanta?.switchProjectForNewTask }
    : undefined
}

const trimEnd = (path: string): string => path.replace(/\/+$/, '')

export const sameFolder = (a: string, b: string): boolean => trimEnd(a) === trimEnd(b)

export type TaskStart = 'started' | 'switching'

/**
 * Starts a task where the person chose to. The same project (or no choice) starts in place. Another project asks the
 * shell to move the runtime there and hands it the words; the window reloads, and `usePendingProjectTask` starts the
 * chat in the new project. Resolves "switching" when the move began.
 */
export async function startTaskInProject(input: {
  bridge: ProjectTaskBridge | undefined
  folderOf?: (projectId: string) => string
  projectId: null | string
  startHere: (text: string) => Promise<unknown>
  text: string
}): Promise<TaskStart> {
  const { bridge, projectId, startHere, text } = input
  const folderOf = input.folderOf ?? ((id: string) =>
    projectRootCwd($projectTree.get().find(node => node.id === id)) || $projects.get().find(project => project.id === id)?.primary_path?.trim() || '')
  const folder = projectId ? folderOf(projectId) : ''
  const current = folder && bridge?.currentDir ? ((await bridge.currentDir())?.dir ?? '') : ''

  if (!folder || !current || sameFolder(folder, current) || !bridge?.switchForNewTask) {
    await startHere(text)

    return 'started'
  }

  await bridge.switchForNewTask({ agent: 'vanta', approvals: true, branch: '', folder, host: 'local', model: '', prompt: text, worktree: false })

  return 'switching'
}
