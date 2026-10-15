import path from 'node:path'

import type { VantaRuntimePaths } from '../../../../../vanta-ts/desktop-app/electron/runtime-paths.mjs'

/** Folder under `Contents/Resources` that holds the precompiled Vanta runtime in a packaged app. */
export const PACKAGED_RUNTIME_DIR = 'vanta-runtime'

export interface RuntimeRootInput {
  appPath: string
  env: NodeJS.ProcessEnv
  isPackaged: boolean
  resourcesPath: string
}

/**
 * Where the Vanta runtime lives. VANTA_RUNTIME_ROOT wins in every mode; otherwise a packaged app reads
 * `Resources/vanta-runtime` and a checkout reads `<repo>/vanta-ts` (three levels above apps/desktop).
 */
export function resolveRuntimeRoot({ appPath, env, isPackaged, resourcesPath }: RuntimeRootInput): string {
  if (env.VANTA_RUNTIME_ROOT) {
    return env.VANTA_RUNTIME_ROOT
  }

  return isPackaged
    ? path.join(resourcesPath, PACKAGED_RUNTIME_DIR)
    : path.resolve(appPath, '../../../vanta-ts')
}

/**
 * vanta-ts resolves the tsx fallback loader under `app.asar.unpacked`, the old app's layout. The packaged
 * Vanta Next keeps node_modules next to the bundle, so point the loader there. A checkout is unchanged.
 */
export function withBundledLoader(
  paths: VantaRuntimePaths,
  { packaged, runtimeRoot }: { packaged: boolean; runtimeRoot: string }
): VantaRuntimePaths {
  return packaged
    ? { ...paths, loader: path.join(path.resolve(runtimeRoot), 'node_modules', 'tsx', 'dist', 'loader.mjs') }
    : paths
}
