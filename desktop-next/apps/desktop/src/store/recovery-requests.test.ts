import { beforeEach, describe, expect, it } from 'vitest'

import { $backendStopped, setBackendStopped } from './recovery-requests'

describe('backend stopped flag', () => {
  beforeEach(() => setBackendStopped(false))

  it('starts false, so a healthy app never reads as offline', () => {
    expect($backendStopped.get()).toBe(false)
  })

  it('is set when the server exits and cleared once it is restarted', () => {
    setBackendStopped(true)
    expect($backendStopped.get()).toBe(true)

    setBackendStopped(false)
    expect($backendStopped.get()).toBe(false)
  })
})
