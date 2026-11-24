import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { useWorkbenchMode } from './use-workbench-mode'

afterEach(cleanup)

function resizeTo(width: number) {
   
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width })
  window.dispatchEvent(new Event('resize'))
}

describe('useWorkbenchMode', () => {
  it('follows the window width across the dock and overlay breakpoints', () => {
    resizeTo(1440)

    const { result } = renderHook(() => useWorkbenchMode())

    expect(result.current).toBe('docked')
    act(() => resizeTo(1100))
    expect(result.current).toBe('overlay')
    act(() => resizeTo(800))
    expect(result.current).toBe('sheet')
  })
})
