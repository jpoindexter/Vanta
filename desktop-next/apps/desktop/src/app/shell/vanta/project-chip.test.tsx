import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ProjectChip } from './project-chip'

const notify = vi.hoisted(() => vi.fn())
const notifyError = vi.hoisted(() => vi.fn())
const applyDir = vi.hoisted(() => vi.fn())

vi.mock('@/i18n', () => ({
  useI18n: () => ({
    t: {
      vantaShell: {
        titlebar: {
          copyProjectPath: 'Copy path',
          projectMenu: (project: string) => `Project: ${project}`,
          projectPathCopied: 'Project path copied.',
          revealProject: 'Reveal in Finder',
          switchProject: 'Switch project…',
          switchProjectFailed: 'Could not switch project.'
        }
      }
    }
  })
}))

vi.mock('@/store/notifications', () => ({ notify, notifyError }))
vi.mock('@/store/session', () => ({ applyConfiguredDefaultProjectDir: applyDir }))

const bridge = {
  pick: vi.fn(),
  reveal: vi.fn(),
  setDir: vi.fn(),
  write: vi.fn()
}

function openMenu() {
  render(<ProjectChip path="/work/acme-site" project="acme-site" />)
  fireEvent.keyDown(screen.getByRole('button', { name: 'Project: acme-site' }), { key: 'Enter' })
}

describe('titlebar project chip', () => {
  beforeEach(() => {
    vi.stubGlobal('vantaDesktop', { pickProjectFolder: bridge.pick })
    window.hermesDesktop = {
      revealPath: bridge.reveal,
      settings: { setDefaultProjectDir: bridge.setDir },
      writeClipboard: bridge.write
    } as unknown as typeof window.hermesDesktop
    Object.values(bridge).forEach(fn => fn.mockReset())
    notify.mockReset()
    notifyError.mockReset()
    applyDir.mockReset()
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('names the project in the chip and offers the three verbs', async () => {
    openMenu()

    expect(await screen.findByRole('menuitem', { name: 'Switch project…' })).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: 'Reveal in Finder' })).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: 'Copy path' })).toBeTruthy()
  })

  it('reveals the folder the chat runs in', async () => {
    openMenu()
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Reveal in Finder' }))

    await waitFor(() => expect(bridge.reveal).toHaveBeenCalledWith('/work/acme-site'))
  })

  it('copies the path and says so', async () => {
    openMenu()
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Copy path' }))

    await waitFor(() => expect(bridge.write).toHaveBeenCalledWith('/work/acme-site'))
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ kind: 'success', message: 'Project path copied.' }))
  })

  it('switches the runtime to the folder picked in the native dialog', async () => {
    bridge.pick.mockResolvedValue('/work/other')
    bridge.setDir.mockResolvedValue({ dir: '/work/other' })
    openMenu()
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Switch project…' }))

    await waitFor(() => expect(bridge.setDir).toHaveBeenCalledWith('/work/other'))
    expect(bridge.pick).toHaveBeenCalledWith('/work/acme-site')
    expect(applyDir).toHaveBeenCalledWith('/work/other')
  })

  it('does nothing when the picker is cancelled', async () => {
    bridge.pick.mockResolvedValue(null)
    openMenu()
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Switch project…' }))

    await waitFor(() => expect(bridge.pick).toHaveBeenCalled())
    expect(bridge.setDir).not.toHaveBeenCalled()
  })

  it('reports a switch that main refuses', async () => {
    bridge.pick.mockResolvedValue('/work/other')
    bridge.setDir.mockRejectedValue(new Error('Project change cancelled.'))
    openMenu()
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Switch project…' }))

    await waitFor(() => expect(notifyError).toHaveBeenCalled())
    expect(applyDir).not.toHaveBeenCalled()
  })
})
