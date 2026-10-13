/**
 * The bot skills hub is search-only: Vanta embeds no hub page, so the section offers no browse
 * control, mounts no iframe and listens for no hub messages. (It once embedded a hosted hub page
 * and installed from its posted picks; that surface and its tests are gone with the hosted site.)
 */

import type * as HermesSdk from '@hermes/plugin-sdk'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { translateBots } from './i18n-test-helper'

const mocks = vi.hoisted(() => ({
  notify: vi.fn(),
  notifyError: vi.fn(),
  request: vi.fn(async (_method: string, _params: Record<string, unknown>) => ({})),
  requestProfile: vi.fn(async (_route: unknown, _method: string, _params: Record<string, unknown>) => ({}))
}))

vi.mock('@hermes/plugin-sdk', async importOriginal => {
  const original = await importOriginal<typeof HermesSdk>()

  return {
    ...original,
    usePluginI18n: () => translateBots,
    host: {
      ...original.host,
      notify: mocks.notify,
      notifyError: mocks.notifyError,
      request: mocks.request,
      requestProfile: mocks.requestProfile
    }
  }
})

const { HubSkillsSection } = await import('./skills-hub')

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('bot skills hub section', () => {
  it('offers no embedded hub browser and no hub frame', () => {
    const { container } = render(<HubSkillsSection />)

    expect(screen.queryByRole('button', { name: /browse the full hub/i })).toBeNull()
    expect(container.querySelector('iframe')).toBeNull()
  })

  it('searches skills.manage and installs the picked result', async () => {
    mocks.request.mockImplementation(async (_method: string, params: Record<string, unknown>) =>
      params.action === 'search' ? { results: [{ name: 'pdf-tools', description: 'Work with PDFs' }] } : {}
    )
    const onInstalled = vi.fn()

    render(<HubSkillsSection onInstalled={onInstalled} />)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'pdf' } })
    fireEvent.click(screen.getByRole('button', { name: /^search$/i }))

    expect(await screen.findByText('pdf-tools')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /pdf-tools/i }))

    await waitFor(() => expect(onInstalled).toHaveBeenCalledWith('pdf-tools'))
    expect(mocks.request).toHaveBeenCalledWith('skills.manage', { action: 'install', query: 'pdf-tools' })
  })

  it('ignores hub pick messages: nothing installs from a posted message', () => {
    render(<HubSkillsSection />)

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: { identifier: 'evil/skill', name: 'evil', type: 'hermes-skill-pick' },
          origin: 'https://hub.example.test'
        })
      )
    })

    expect(mocks.request).not.toHaveBeenCalledWith('skills.manage', expect.objectContaining({ action: 'install' }))
  })
})
