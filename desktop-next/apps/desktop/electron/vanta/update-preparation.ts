interface LeaseOwner { prepareUpdate(): Promise<string>; cancelUpdate(lease: string): Promise<void> }
interface WindowOwner { prepare(): Promise<string>; cancel(lease: string): Promise<void>; assertPrepared(): void }
interface PreparationDeps { windows: WindowOwner; custody: LeaseOwner; runtimes: LeaseOwner; freezeInputs: () => () => void }

/** Drain custody before freezing runtime admission: custody identity checks still use the runtime transport. */
export async function prepareDesktopUpdate(deps: PreparationDeps): Promise<() => Promise<void>> {
  const unfreeze = deps.freezeInputs()
  let windows: string | undefined, custody: string | undefined, runtimes: string | undefined
  const cancel = async () => {
    if (runtimes) { await deps.runtimes.cancelUpdate(runtimes); runtimes = undefined }
    if (custody) { await deps.custody.cancelUpdate(custody); custody = undefined }
    if (windows) { await deps.windows.cancel(windows); windows = undefined }
    unfreeze()
  }
  try {
    windows = await deps.windows.prepare()
    custody = await deps.custody.prepareUpdate()
    runtimes = await deps.runtimes.prepareUpdate()
    deps.windows.assertPrepared()
    return cancel
  } catch (error) {
    if (error && typeof error === 'object' && 'keepPrepared' in error) throw error
    try { await cancel() }
    catch { throw Object.assign(new Error('Update preparation could not be released. Keep Vanta open; new work remains paused.'), { keepPrepared: true }) }
    throw error
  }
}
