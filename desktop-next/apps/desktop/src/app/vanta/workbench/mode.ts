import type { WorkbenchMode } from '../types'

/** Shell breakpoints (flow-app-shell): docked at 1280+, overlay 1024-1279, sheet below. */
export const WORKBENCH_DOCK_MIN_WIDTH = 1280
export const WORKBENCH_OVERLAY_MIN_WIDTH = 1024

export function workbenchModeFor(windowWidth: number): WorkbenchMode {
  if (windowWidth >= WORKBENCH_DOCK_MIN_WIDTH) {
    return 'docked'
  }

  return windowWidth >= WORKBENCH_OVERLAY_MIN_WIDTH ? 'overlay' : 'sheet'
}
