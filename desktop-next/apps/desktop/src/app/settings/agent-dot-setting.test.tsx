import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AGENT_DOT_COPY, AgentDotSetting } from './agent-dot-setting'

let set: ReturnType<typeof vi.fn>

beforeEach(() => {
  set = vi.fn(async (on: boolean) => ({ enabled: on }))
  Object.assign(window, {
    hermesDesktop: { agentDot: { feed: vi.fn(), get: vi.fn(async () => ({ enabled: false })), onChanged: vi.fn(() => () => undefined), set } }
  })
})

afterEach(() => {
  cleanup()
  Reflect.deleteProperty(window, 'hermesDesktop')
})

describe('AgentDotSetting', () => {
  it('shows nothing outside the Vanta shell', () => {
    Reflect.deleteProperty(window, 'hermesDesktop')
    const { container } = render(<AgentDotSetting />)

    expect(container.textContent).toBe('')
  })

  it('reads the saved choice and turns the dot on', async () => {
    render(<AgentDotSetting />)
    const toggle = await screen.findByRole('switch', { name: AGENT_DOT_COPY.label })
    await waitFor(() => expect((toggle as HTMLButtonElement).disabled).toBe(false))

    fireEvent.click(toggle)

    await waitFor(() => expect(set).toHaveBeenCalledWith(true))
  })
})
