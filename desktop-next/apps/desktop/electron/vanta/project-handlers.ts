import { resolveDroppedPaths } from '../../../../../vanta-ts/desktop-app/electron/dropped-paths.mjs'
import {
  createPendingProjectTaskStore,
  prepareProjectSwitch
} from '../../../../../vanta-ts/desktop-app/electron/project-switch.mjs'
import { showProjectFolderPicker } from '../../../../../vanta-ts/desktop-app/electron/project-folder-picker.mjs'
import { usableDirectory } from '../../../../../vanta-ts/desktop-app/electron/project-root.mjs'

import { CH } from './channels'
import type { IpcLike } from './native-handlers'

export interface ProjectDeps {
  dialog: {
    showOpenDialog: (
      window: unknown,
      options: Record<string, unknown>
    ) => Promise<{ canceled: boolean; filePaths: string[] }>
  }
  getWindow: (sender: unknown) => unknown
  ipc: IpcLike
  projectRoot: () => string
  /** Persist the root, restart the Vanta runtime for it and reload the renderer. */
  switchTo: (root: string) => Promise<void>
}

const MAX_TASK_ID = 128

function pickFolder(deps: ProjectDeps, sender: unknown, currentPath: unknown) {
  return showProjectFolderPicker({
    currentPath,
    dialog: deps.dialog,
    fallbackPath: deps.projectRoot(),
    parentWindow: deps.getWindow(sender)
  })
}

/** The folder the runtime is started in, as `settings.*Default ProjectDir` and the Vanta picker. */
function registerFolderHandlers(deps: ProjectDeps): void {
  const { ipc } = deps

  ipc.handle(CH.projectGetDefault, () => ({
    defaultLabel: 'Project folder',
    dir: deps.projectRoot(),
    resolvedCwd: deps.projectRoot()
  }))

  ipc.handle(CH.projectPickDefault, async event => {
    const dir = await pickFolder(deps, event.sender, deps.projectRoot())

    return { canceled: dir === null, dir }
  })

  ipc.handle(CH.projectSetDefault, async (_event, dir: unknown) => {
    if (typeof dir !== 'string' || !(await usableDirectory(dir))) {
      throw new Error('Choose an existing project folder.')
    }

    await deps.switchTo(dir)

    return { dir }
  })

  ipc.handle(CH.pickProjectFolder, (event, currentPath: unknown) => pickFolder(deps, event.sender, currentPath))
}

/** Starting a task in another project: switch the runtime, then let the renderer pick the draft back up. */
function registerNewTaskHandlers(deps: ProjectDeps): void {
  const { ipc } = deps
  const pending = createPendingProjectTaskStore()

  ipc.handle(CH.switchProjectForNewTask, async (_event, draft: unknown) => {
    const prepared = await prepareProjectSwitch(draft)
    pending.set(prepared)
    setImmediate(() => void deps.switchTo(prepared.targetRoot))

    return { projectRoot: prepared.targetRoot, switching: true }
  })

  ipc.handle(CH.readPendingProjectTask, () => pending.read(deps.projectRoot()))

  ipc.handle(CH.acknowledgePendingProjectTask, (_event, id: unknown) =>
    typeof id === 'string' && id.length <= MAX_TASK_ID ? pending.acknowledge(id, deps.projectRoot()) : false
  )
}

/** Dropped and picked attachments are resolved against the project root, skipping secrets (.env, keys, .ssh). */
function registerAttachmentHandlers(deps: ProjectDeps): void {
  const { dialog, ipc } = deps

  ipc.handle(CH.resolveDroppedPaths, (_event, paths: unknown) =>
    resolveDroppedPaths(
      Array.isArray(paths) ? paths.filter((entry): entry is string => typeof entry === 'string') : [],
      deps.projectRoot()
    )
  )

  ipc.handle(CH.pickAttachments, async event => {
    const result = await dialog.showOpenDialog(deps.getWindow(event.sender), {
      properties: ['openFile', 'openDirectory', 'multiSelections'],
      title: 'Attach files or folders to Vanta'
    })

    return result.canceled
      ? { errors: [], files: [], items: [] }
      : resolveDroppedPaths(result.filePaths, deps.projectRoot())
  })
}

/** Choosing and switching the project folder. A project is the root the Vanta runtime is started in. */
export function registerProjectHandlers(deps: ProjectDeps): void {
  registerFolderHandlers(deps)
  registerNewTaskHandlers(deps)
  registerAttachmentHandlers(deps)
}
