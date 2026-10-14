import { describe, expect, it } from 'vitest'

import { PACKAGED_RUNTIME_DIR, resolveRuntimeRoot, withBundledLoader } from './runtime-root'

const resourcesPath = '/Apps/Vanta Next.app/Contents/Resources'
const base = { appPath: '/repo/desktop-next/apps/desktop', env: {}, isPackaged: false, resourcesPath }
const paths = {
  bundle: '/x/dist-runtime/cli.mjs',
  cli: '/x/src/cli.ts',
  dist: '/x/desktop-app/dist',
  icon: '',
  kernel: '/x/kernel',
  loader: '/x/app.asar.unpacked/node_modules/tsx/dist/loader.mjs'
}

describe('resolveRuntimeRoot', () => {
  it('reads vanta-ts from the checkout when running unpackaged', () => {
    expect(resolveRuntimeRoot(base)).toBe('/repo/vanta-ts')
  })

  it('reads Resources/vanta-runtime in the packaged layout', () => {
    expect(resolveRuntimeRoot({ ...base, isPackaged: true })).toBe(`${resourcesPath}/${PACKAGED_RUNTIME_DIR}`)
  })

  it('lets VANTA_RUNTIME_ROOT override both layouts', () => {
    const env = { VANTA_RUNTIME_ROOT: '/custom/runtime' }

    expect(resolveRuntimeRoot({ ...base, env })).toBe('/custom/runtime')
    expect(resolveRuntimeRoot({ ...base, env, isPackaged: true })).toBe('/custom/runtime')
  })
})

describe('withBundledLoader', () => {
  it('moves the tsx loader beside the bundled runtime when packaged', () => {
    const next = withBundledLoader(paths, { packaged: true, runtimeRoot: `${resourcesPath}/vanta-runtime` })

    expect(next.loader).toBe(`${resourcesPath}/vanta-runtime/node_modules/tsx/dist/loader.mjs`)
    expect(next.bundle).toBe(paths.bundle)
    expect(next.kernel).toBe(paths.kernel)
  })

  it('leaves a checkout untouched', () => {
    expect(withBundledLoader(paths, { packaged: false, runtimeRoot: '/repo/vanta-ts' })).toBe(paths)
  })
})
