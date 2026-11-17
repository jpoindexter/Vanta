import { describe, expect, it } from 'vitest'

import { versionInfo } from './shell-handlers'

describe('versionInfo', () => {
  it('gives the About page the app version and the runtime it runs on', () => {
    const info = versionInfo('0.9.1', { electron: '40.10.2', node: '24.15.0' } as NodeJS.ProcessVersions, 'darwin')

    expect(info).toMatchObject({ appVersion: '0.9.1', electronVersion: '40.10.2', nodeVersion: '24.15.0', platform: 'darwin' })
    expect(info.channel).toBeNull()
  })

  it('keeps the version even when Electron is absent (tests, plain Node)', () => {
    expect(versionInfo('1.0.0', { node: '22.0.0' } as NodeJS.ProcessVersions, 'linux').electronVersion).toBe('')
  })
})
