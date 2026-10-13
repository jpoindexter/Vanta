import { realpath } from 'node:fs/promises'

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
  /** Ask the user, in a native dialog the renderer cannot script, whether the runtime may move to `dir`. */
  confirmSwitch: (dir: string) => Promise<boolean>
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

/** Folders the user chose in a native picker this session. Moving the agent there needs no further question. */
class FolderGrants {
  private readonly granted = new Set<string>()

  async add(dir: string): Promise<void> {
    this.granted.add(await realpath(dir).catch(() => dir))
  }

  async has(dir: string): Promise<boolean> {
    return this.granted.has(await realpath(dir).catch(() => dir))
  }
}

async function pickFolder(deps: ProjectDeps, grants: FolderGrants, sender: unknown, currentPath: unknown) {
  const dir = await showProjectFolderPicker({
    currentPath,
    dialog: deps.dialog,
    fallbackPath: deps.projectRoot(),
    parentWindow: deps.getWindow(sender)
  })

  if (dir) {
    await grants.add(dir)
  }

  return dir
}

/**
 * The agent works in the project root, so retargeting it is a privileged act. A folder the user just picked in
 * the native dialog is fine; any other folder the renderer names has to be confirmed in a native dialog first.
 */
async function mayMoveTo(deps: ProjectDeps, grants: FolderGrants, dir: string): Promise<boolean> {
  return dir === deps.projectRoot() || (await grants.has(dir)) || (await deps.confirmSwitch(dir))
}

/** The folder the runtime is started in, as `settings.*Default ProjectDir` and the Vanta picker. */
function registerFolderHandlers(deps: ProjectDeps, grants: FolderGrants): void {
  const { ipc } = deps

  ipc.handle(CH.projectGetDefault, () => ({
    defaultLabel: 'Project folder',
    dir: deps.projectRoot(),
    resolvedCwd: deps.projectRoot()
  }))

  ipc.handle(CH.projectPickDefault, async event => {
    const dir = await pickFolder(deps, grants, event.sender, deps.projectRoot())

    return { canceled: dir === null, dir }
  })

  ipc.handle(CH.projectSetDefault, async (_event, dir: unknown) => {
    if (typeof dir !== 'string' || !(await usableDirectory(dir))) {
      throw new Error('Choose an existing project folder.')
    }

    if (!(await mayMoveTo(deps, grants, dir))) {
      throw new Error('Project change cancelled.')
    }

    await deps.switchTo(dir)

    return { dir }
  })

  ipc.handle(CH.pickProjectFolder, (event, currentPath: unknown) => pickFolder(deps, grants, event.sender, currentPath))
}

/** Starting a task in another project: switch the runtime, then let the renderer pick the draft back up. */
function registerNewTaskHandlers(deps: ProjectDeps, grants: FolderGrants): void {
  const { ipc } = deps
  const pending = createPendingProjectTaskStore()

  ipc.handle(CH.switchProjectForNewTask, async (_event, draft: unknown) => {
    const prepared = await prepareProjectSwitch(draft)

    if (!(await mayMoveTo(deps, grants, prepared.targetRoot))) {
      throw new Error('Project change cancelled.')
    }

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
  const grants = new FolderGrants()

  registerFolderHandlers(deps, grants)
  registerNewTaskHandlers(deps, grants)
  registerAttachmentHandlers(deps)
}
