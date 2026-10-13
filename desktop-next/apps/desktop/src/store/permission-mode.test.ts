import { beforeEach, describe, expect, it } from 'vitest'

import { $permissionMode, permissionModeLabel, setPermissionMode } from './permission-mode'

beforeEach(() => {
  setPermissionMode('manual')
  window.localStorage.clear()
})

describe('permission mode', () => {
  it('starts as ask each time', () => {
    expect($permissionMode.get()).toBe('manual')
    expect(permissionModeLabel($permissionMode.get())).toBe('Ask each time')
  })

  it('stores the selection', () => {
    setPermissionMode('plan')

    expect($permissionMode.get()).toBe('plan')
    expect(window.localStorage.getItem('vanta.desktop.permission-mode.v1')).toBe('plan')
  })
})
