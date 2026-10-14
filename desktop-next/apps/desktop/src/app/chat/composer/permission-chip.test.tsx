import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  FULL_ACCESS_WARNING_STORAGE_KEY,
  FULL_ACCESS_WARNING_VERSION,
  isFullAccessAcknowledged
} from '@/store/full-access-warning'
import { $permissionMode, $permissionRoot, $permissionStatus } from '@/store/permission-mode'
import { stubMenuDomApis, stubResizeObserver } from '@/test/jsdom'

import { PermissionChipView } from './permission-chip'

const ALPHA = '/work/alpha'

beforeAll(() => {
  stubResizeObserver()
  stubMenuDomApis()
})

beforeEach(() => {
  $permissionMode.set('manual')
  $permissionStatus.set('unknown')
  $permissionRoot.set('')
  window.localStorage.clear()
})

afterEach(cleanup)

/** A stand-in for the gateway: it keeps the project's mode like the server does and mirrors its Full-access rule. */
function fakeServer(initial = 'ask', root = ALPHA) {
  let mode = initial
  const refuseWrites = { current: false }

  const request = vi.fn(async (method: string, params?: Record<string, unknown>) => {
    if (method === 'config.get') {
      return { root, value: mode }
    }

    if (refuseWrites.current) {
      throw new Error('Vanta could not save the access mode.')
    }

    if (params?.value === 'full' && params.acknowledged !== true) {
      throw new Error('Full access needs the user to confirm the warning first.')
    }

    mode = String(params?.value)

    return { key: 'access_mode', root, value: mode }
  })

  const writes = () => request.mock.calls.filter(([method]) => method === 'config.set')

  return { refuseWrites, request, writes }
}

async function openMenuAndPick(label: RegExp) {
  fireEvent.pointerDown(screen.getByRole('button', { name: /permission mode/i }), { button: 0 })
  fireEvent.click(await screen.findByRole('menuitemradio', { name: label }))
}

// hidden: true: while a dialog is open Radix marks everything behind it aria-hidden, the chip included.
const chipLabel = () => screen.getByRole('button', { hidden: true, name: /permission mode/i }).textContent

async function mount(server: ReturnType<typeof fakeServer>, sessionId: null | string = 'chat-1') {
  render(<PermissionChipView request={server.request} sessionId={sessionId} />)
  await waitFor(() => expect($permissionStatus.get()).toBe('ready'))
}

describe('permission chip: real mode from the server', () => {
  it('shows the mode the server reports, not a stored guess', async () => {
    window.localStorage.setItem('vanta.desktop.permission-mode.v1', 'full')
    await mount(fakeServer('plan'))

    expect(chipLabel()).toBe('Plan')
  })

  it('does not name a mode while the server has not answered', () => {
    const server = fakeServer()
    server.request.mockImplementation(() => new Promise(() => undefined))
    render(<PermissionChipView request={server.request} sessionId="chat-1" />)

    expect(chipLabel()).toBe('Access mode')
  })

  it('choosing Plan asks the server to enforce Plan for the open chat and then shows it', async () => {
    const server = fakeServer('ask')
    await mount(server)

    await openMenuAndPick(/^plan/i)

    await waitFor(() => expect(chipLabel()).toBe('Plan'))
    expect(server.writes()).toEqual([['config.set', { key: 'access_mode', session_id: 'chat-1', value: 'plan' }]])
  })

  it('choosing Ask each time sends the server id for Manual', async () => {
    const server = fakeServer('plan')
    await mount(server)

    await openMenuAndPick(/ask each time/i)

    await waitFor(() => expect(chipLabel()).toBe('Ask each time'))
    expect(server.writes()[0]?.[1]).toMatchObject({ key: 'access_mode', value: 'ask' })
  })

  it('keeps the previous mode on screen when the server does not accept the change', async () => {
    const server = fakeServer('ask')
    await mount(server)
    server.refuseWrites.current = true

    await openMenuAndPick(/^plan/i)

    await waitFor(() => expect(server.writes()).toHaveLength(1))
    expect(chipLabel()).toBe('Ask each time')
  })
})

describe('permission chip: Full access warning', () => {
  it('shows the warning first and sends nothing until the user decides', async () => {
    const server = fakeServer('ask')
    await mount(server)

    await openMenuAndPick(/full access/i)

    expect(await screen.findByRole('dialog')).toBeTruthy()
    expect(screen.getByText(/delete files inside this project/i)).toBeTruthy()
    expect(server.writes()).toHaveLength(0)
    expect(chipLabel()).toBe('Ask each time')
  })

  it('Cancel leaves the mode unchanged and records no acknowledgement', async () => {
    const server = fakeServer('ask')
    await mount(server)
    await openMenuAndPick(/full access/i)

    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(server.writes()).toHaveLength(0)
    expect(chipLabel()).toBe('Ask each time')
    expect(isFullAccessAcknowledged(ALPHA)).toBe(false)
  })

  it('opens with Cancel focused, so a stray Enter keeps the safe mode', async () => {
    await mount(fakeServer('ask'))
    await openMenuAndPick(/full access/i)

    const cancel = await screen.findByRole('button', { name: 'Cancel' })

    // eslint-disable-next-line no-restricted-globals -- asserting real focus requires the live document
    await waitFor(() => expect(document.activeElement).toBe(cancel))
  })

  it('Confirm sets Full access, tells the server the user acknowledged, and remembers it for this project', async () => {
    const server = fakeServer('ask')
    await mount(server)
    await openMenuAndPick(/full access/i)

    fireEvent.click(await screen.findByRole('button', { name: 'Turn on Full access' }))

    await waitFor(() => expect(chipLabel()).toBe('Full access'))
    expect(server.writes()).toEqual([
      ['config.set', { acknowledged: true, key: 'access_mode', session_id: 'chat-1', value: 'full' }]
    ])
    expect(isFullAccessAcknowledged(ALPHA)).toBe(true)
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('does not ask again for a project already acknowledged at the current version', async () => {
    window.localStorage.setItem(
      FULL_ACCESS_WARNING_STORAGE_KEY,
      JSON.stringify({ [ALPHA]: FULL_ACCESS_WARNING_VERSION })
    )
    const server = fakeServer('ask')
    await mount(server)

    await openMenuAndPick(/full access/i)

    await waitFor(() => expect(chipLabel()).toBe('Full access'))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(server.writes()[0]?.[1]).toMatchObject({ acknowledged: true, value: 'full' })
  })

  it('asks again when the warning version has been bumped', async () => {
    window.localStorage.setItem(
      FULL_ACCESS_WARNING_STORAGE_KEY,
      JSON.stringify({ [ALPHA]: `${FULL_ACCESS_WARNING_VERSION}-previous` })
    )
    const server = fakeServer('ask')
    await mount(server)

    await openMenuAndPick(/full access/i)

    expect(await screen.findByRole('dialog')).toBeTruthy()
    expect(server.writes()).toHaveLength(0)
  })

  it('asks again in a different project even though another one was acknowledged', async () => {
    window.localStorage.setItem(
      FULL_ACCESS_WARNING_STORAGE_KEY,
      JSON.stringify({ [ALPHA]: FULL_ACCESS_WARNING_VERSION })
    )
    const server = fakeServer('ask', '/work/bravo')
    await mount(server)

    await openMenuAndPick(/full access/i)

    expect(await screen.findByRole('dialog')).toBeTruthy()
  })

  it('keeps the dialog open with the reason, and records nothing, when the server rejects Full access', async () => {
    const server = fakeServer('ask')
    await mount(server)
    server.refuseWrites.current = true
    await openMenuAndPick(/full access/i)

    fireEvent.click(await screen.findByRole('button', { name: 'Turn on Full access' }))

    expect((await screen.findByRole('alert')).textContent).toMatch(/could not save the access mode/i)
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(chipLabel()).toBe('Ask each time')
    expect(isFullAccessAcknowledged(ALPHA)).toBe(false)
  })

  it('leaving Full access needs no warning', async () => {
    window.localStorage.setItem(
      FULL_ACCESS_WARNING_STORAGE_KEY,
      JSON.stringify({ [ALPHA]: FULL_ACCESS_WARNING_VERSION })
    )
    const server = fakeServer('full')
    await mount(server)

    await openMenuAndPick(/^plan/i)

    await waitFor(() => expect(chipLabel()).toBe('Plan'))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(server.writes()[0]?.[1]).not.toHaveProperty('acknowledged')
  })
})
