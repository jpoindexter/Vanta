import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { captureDraftCustodyOwner } from '@/store/draft-custody-owner'
import { reloadPersistedDrafts } from '@/store/session-draft-state'
import { readHomeDraft, saveHomeDraft } from '@/app/vanta/home/home-draft'
import { resumePendingHomeTask } from './pending-home-task'
vi.mock('@/store/draft-custody-owner', () => ({ captureDraftCustodyOwner: vi.fn() }))
const owner = { connectionId: 'local', profile: 'writer' }
beforeEach(() => { localStorage.clear(); reloadPersistedDrafts(); vi.mocked(captureDraftCustodyOwner).mockReturnValue(owner) })
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); localStorage.clear(); reloadPersistedDrafts() })
const pending = () => ({ id: crypto.randomUUID(), draft: { intent: 'submit-home', owner, prompt: 'Exact Home text',
  source: saveHomeDraft(owner, { text: 'Exact Home text', projectId: 'bravo' }) } })

it('acknowledges the native submit once before starting, keeps durable text until acceptance and never silently retries', async () => {
  const request = pending()
  let finish!: () => void
  const acknowledge = vi.fn(async () => true)
  const startTask = vi.fn(() => new Promise<void>(resolve => { finish = resolve }))
  const actions = { startTask, acknowledge, isCurrent: () => true }
  const running = resumePendingHomeTask(request, actions)
  await vi.waitFor(() => expect(startTask).toHaveBeenCalledWith('Exact Home text'))
  expect(acknowledge).toHaveBeenCalledWith(request.id)
  expect(readHomeDraft(owner).text).toBe('Exact Home text')
  finish(); await running
  expect(readHomeDraft(owner)).toEqual({ text: '', projectId: 'bravo' })
  acknowledge.mockResolvedValue(false)
  await expect(resumePendingHomeTask(request, actions)).rejects.toThrow('already consumed')
  expect(startTask).toHaveBeenCalledOnce()
})

it('retains later Home edits and does not submit after the window closes during acknowledgement', async () => {
  const request = pending()
  let finish!: (value: boolean) => void, live = true
  const startTask = vi.fn(async () => undefined)
  const acknowledge = vi.fn(() => new Promise<boolean>(resolve => { finish = resolve }))
  const running = resumePendingHomeTask(request, { startTask, acknowledge, isCurrent: () => live })
  await vi.waitFor(() => expect(acknowledge).toHaveBeenCalledOnce())
  saveHomeDraft(owner, { text: 'Later Home text', projectId: 'alpha' })
  live = false; finish(true); await running
  expect(startTask).not.toHaveBeenCalled()
  expect(readHomeDraft(owner)).toEqual({ text: 'Later Home text', projectId: 'alpha' })
})

it('rejects another window before acknowledgement or submit', async () => {
  const request = pending()
  request.draft.source.window = 'window:' + crypto.randomUUID()
  const actions = { startTask: vi.fn(async () => undefined), acknowledge: vi.fn(async () => true), isCurrent: () => true }
  await expect(resumePendingHomeTask(request, actions)).rejects.toThrow('window changed')
  expect(actions.startTask).not.toHaveBeenCalled()
  expect(actions.acknowledge).not.toHaveBeenCalled()
  expect(readHomeDraft(owner).text).toBe('Exact Home text')
})

it('does not let boot owner readiness resume a cancelled renderer', async () => {
  const request = pending()
  vi.useFakeTimers()
  vi.mocked(captureDraftCustodyOwner).mockReturnValue(undefined)
  const actions = { startTask: vi.fn(async () => undefined), acknowledge: vi.fn(async () => true), isCurrent: () => false }
  const running = resumePendingHomeTask(request, actions)
  vi.mocked(captureDraftCustodyOwner).mockReturnValue(owner)
  await vi.advanceTimersByTimeAsync(100); await running
  expect(actions.startTask).not.toHaveBeenCalled()
  expect(actions.acknowledge).not.toHaveBeenCalled()
})
