import { AssistantRuntimeProvider, type ThreadMessage, useExternalStoreRuntime } from '@assistant-ui/react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { en } from '@/i18n/en'

import { stubThreadEnvironment } from '../test-utils'

import { Thread } from '.'

const KEY = 'sk-fixture-new-key-that-must-not-leak-9876'

const getEnvVars = vi.hoisted(() => vi.fn())
const setEnvVar = vi.hoisted(() => vi.fn())

vi.mock('@/hermes', async importOriginal => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getEnvVars: (...args: unknown[]) => getEnvVars(...args),
  setEnvVar: (...args: unknown[]) => setEnvVar(...args)
}))

stubThreadEnvironment()

const createdAt = new Date('2026-05-01T00:00:00.000Z')
const reconnect = en.vantaShell.reconnect

const providerVars = {
  OPENAI_API_KEY: { category: 'provider', is_set: true, provider: 'openai', provider_label: 'OpenAI' },
  OTHER_TOKEN: { category: 'tool', is_set: false }
}

function userMessage(): ThreadMessage {
  return {
    id: 'user-1',
    role: 'user',
    content: [{ type: 'text', text: 'summarize the brief' }],
    attachments: [],
    createdAt,
    metadata: { custom: {} }
  } as unknown as ThreadMessage
}

function failure(surface: Record<string, unknown>): ThreadMessage {
  return {
    id: 'assistant-error-1',
    role: 'assistant',
    content: [],
    status: { type: 'incomplete', reason: 'error', error: 'The model provider rejected the saved key.' },
    createdAt,
    metadata: { unstable_state: null, unstable_annotations: [], unstable_data: [], steps: [], custom: { errorSurface: surface } }
  } as unknown as ThreadMessage
}

const providerAuth = (extra: Record<string, unknown> = {}) =>
  failure({ authKind: 'api_key', code: 'provider_auth', layer: 'auth', model: 'gpt-x', provider: 'openai', retryable: true, ...extra })

function Harness({ assistant, onReload }: { assistant: ThreadMessage; onReload: () => Promise<void> }) {
  const runtime = useExternalStoreRuntime<ThreadMessage>({
    isRunning: false,
    messages: [userMessage(), assistant],
    onNew: async () => {},
    onReload
  })

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <MemoryRouter>
        <Thread />
      </MemoryRouter>
    </AssistantRuntimeProvider>
  )
}

const consoleSpies = () => (['log', 'info', 'warn', 'error', 'debug'] as const).map(name => vi.spyOn(console, name).mockImplementation(() => undefined))

beforeEach(() => {
  getEnvVars.mockResolvedValue(providerVars)
  setEnvVar.mockResolvedValue({ ok: true })
  window.localStorage.clear()
  window.sessionStorage.clear()
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  getEnvVars.mockReset()
  setEnvVar.mockReset()
})

const openDialog = async () => {
  fireEvent.click(await screen.findByRole('button', { name: reconnect.action }))

  return screen.findByTestId('provider-reconnect')
}

describe('provider auth failure card', () => {
  it('shows the reconnect card, not the generic stop sentence', async () => {
    render(<Harness assistant={providerAuth()} onReload={async () => undefined} />)

    expect(await screen.findByRole('button', { name: reconnect.action })).toBeTruthy()
    expect(screen.getByText('The model provider rejected the saved key.', { exact: false })).toBeTruthy()
    expect(screen.queryByText('Task stopped before completion.')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Update API key' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy()
  })

  it('is not offered for other failures', async () => {
    render(<Harness assistant={failure({ code: 'rate_limit', layer: 'provider', retryable: true })} onReload={async () => undefined} />)

    await screen.findByRole('button', { name: 'Retry' })
    expect(screen.queryByRole('button', { name: reconnect.action })).toBeNull()
  })
})

describe('reconnect and resume', () => {
  it('saves the new key as a provider setup, then resumes the saved request', async () => {
    const onReload = vi.fn(async () => undefined)
    render(<Harness assistant={providerAuth()} onReload={onReload} />)

    const dialog = await openDialog()
    await waitFor(() => expect(getEnvVars).toHaveBeenCalled())
    await waitFor(() => expect(dialog.textContent).toContain('OPENAI_API_KEY'))

    fireEvent.change(dialog.querySelector('input[type="password"]')!, { target: { value: KEY } })
    fireEvent.click(screen.getByRole('button', { name: reconnect.confirm }))

    await waitFor(() => expect(onReload).toHaveBeenCalledTimes(1))
    expect(setEnvVar).toHaveBeenCalledWith('OPENAI_API_KEY', KEY, undefined, { providerSetup: true })
    expect(setEnvVar.mock.invocationCallOrder[0]).toBeLessThan(onReload.mock.invocationCallOrder[0]!)
    await waitFor(() => expect(screen.queryByTestId('provider-reconnect')).toBeNull())
  })

  it('never logs, echoes or stores the key', async () => {
    const spies = consoleSpies()
    render(<Harness assistant={providerAuth()} onReload={async () => undefined} />)

    const dialog = await openDialog()
    await waitFor(() => expect(dialog.textContent).toContain('OPENAI_API_KEY'))
    const input = dialog.querySelector<HTMLInputElement>('input[type="password"]')!
    expect(input.getAttribute('autocomplete')).toBe('off')

    fireEvent.change(input, { target: { value: KEY } })
    expect(dialog.textContent).not.toContain(KEY)
    fireEvent.click(screen.getByRole('button', { name: reconnect.confirm }))
    await waitFor(() => expect(screen.queryByTestId('provider-reconnect')).toBeNull())

    expect(JSON.stringify([...Object.entries(window.localStorage), ...Object.entries(window.sessionStorage)])).not.toContain(KEY)
    expect(JSON.stringify(spies.flatMap(spy => spy.mock.calls))).not.toContain(KEY)
    expect(document.body.textContent).not.toContain(KEY)
  })

  it('shows the server reason and does not resume when the key is refused', async () => {
    const onReload = vi.fn(async () => undefined)
    const reason = 'OpenAI credential looks like a placeholder. Add a real credential and test again.'
    setEnvVar.mockRejectedValue(new Error(reason))
    render(<Harness assistant={providerAuth()} onReload={onReload} />)

    const dialog = await openDialog()
    await waitFor(() => expect(dialog.textContent).toContain('OPENAI_API_KEY'))
    fireEvent.change(dialog.querySelector('input[type="password"]')!, { target: { value: 'sk-secret' } })
    fireEvent.click(screen.getByRole('button', { name: reconnect.confirm }))

    expect((await screen.findByRole('alert')).textContent).toBe(reason)
    expect(onReload).not.toHaveBeenCalled()
    expect(screen.getByTestId('provider-reconnect')).toBeTruthy()
  })

  it('asks for a key instead of saving an empty one', async () => {
    const onReload = vi.fn(async () => undefined)
    render(<Harness assistant={providerAuth()} onReload={onReload} />)

    const dialog = await openDialog()
    await waitFor(() => expect(dialog.textContent).toContain('OPENAI_API_KEY'))
    fireEvent.click(screen.getByRole('button', { name: reconnect.confirm }))

    expect((await screen.findByRole('alert')).textContent).toBe(reconnect.missingKey)
    expect(setEnvVar).not.toHaveBeenCalled()
    expect(onReload).not.toHaveBeenCalled()
  })

  it('resumes a keyless provider without saving anything', async () => {
    getEnvVars.mockResolvedValue({ OPENAI_API_KEY: providerVars.OPENAI_API_KEY })
    const onReload = vi.fn(async () => undefined)
    render(<Harness assistant={providerAuth({ provider: 'ollama', providerLabel: 'Ollama' })} onReload={onReload} />)

    const dialog = await openDialog()
    await waitFor(() => expect(dialog.textContent).toContain(reconnect.keylessBody('Ollama')))
    expect(dialog.querySelector('input[type="password"]')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: reconnect.resume }))
    await waitFor(() => expect(onReload).toHaveBeenCalledTimes(1))
    expect(setEnvVar).not.toHaveBeenCalled()
  })
})
