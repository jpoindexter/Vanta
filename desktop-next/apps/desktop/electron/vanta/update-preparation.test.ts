import { expect, it, vi } from 'vitest'
import { prepareDesktopUpdate } from './update-preparation'

function fixture() {
  const steps: string[] = []
  const owner = (name: string) => ({
    prepareUpdate: vi.fn(async () => { steps.push(`${name}:prepare`); return `${name}-lease` }),
    cancelUpdate: vi.fn(async (lease: string) => { steps.push(`${name}:cancel:${lease}`) })
  })
  const windows = {
    prepare: vi.fn(async () => { steps.push('windows:prepare'); return 'windows-lease' }),
    cancel: vi.fn(async (lease: string) => { steps.push(`windows:cancel:${lease}`) }),
    assertPrepared: vi.fn(() => { steps.push('windows:assert') })
  }
  const unfreeze = vi.fn(() => { steps.push('unfreeze') })
  const deps = { windows, custody: owner('custody'), runtimes: owner('runtimes'), freezeInputs: vi.fn(() => { steps.push('freeze'); return unfreeze }) }
  return { steps, deps, unfreeze }
}

it('flushes windows, then drains custody, then prepares runtimes, and cancels in reverse order', async () => {
  const h = fixture(), release = await prepareDesktopUpdate(h.deps)
  expect(h.steps).toEqual(['freeze', 'windows:prepare', 'custody:prepare', 'runtimes:prepare', 'windows:assert'])
  expect(h.unfreeze).not.toHaveBeenCalled()
  await release()
  expect(h.steps.slice(5)).toEqual(['runtimes:cancel:runtimes-lease', 'custody:cancel:custody-lease', 'windows:cancel:windows-lease', 'unfreeze'])
})

it('does not ask custody or runtimes to prepare until the prior owner has acknowledged', async () => {
  const h = fixture()
  let flushed!: (lease: string) => void, drained!: (lease: string) => void
  h.deps.windows.prepare.mockImplementation(() => new Promise(resolve => { flushed = resolve }))
  h.deps.custody.prepareUpdate.mockImplementation(() => new Promise(resolve => { drained = resolve }))
  const pending = prepareDesktopUpdate(h.deps)
  expect(h.deps.custody.prepareUpdate).not.toHaveBeenCalled()
  flushed('windows-lease')
  await Promise.resolve()
  expect(h.deps.custody.prepareUpdate).toHaveBeenCalledTimes(1)
  expect(h.deps.runtimes.prepareUpdate).not.toHaveBeenCalled()
  drained('custody-lease')
  const release = await pending
  expect(h.deps.runtimes.prepareUpdate).toHaveBeenCalledTimes(1)
  await release()
})

it('releases only acquired leases when custody refuses, preserving the original refusal', async () => {
  const h = fixture(), refusal = new Error('attachment outcome unknown')
  h.deps.custody.prepareUpdate.mockRejectedValue(refusal)
  await expect(prepareDesktopUpdate(h.deps)).rejects.toBe(refusal)
  expect(h.steps).toEqual(['freeze', 'windows:prepare', 'windows:cancel:windows-lease', 'unfreeze'])
  expect(h.deps.runtimes.prepareUpdate).not.toHaveBeenCalled()
})

it('releases custody and windows when runtime preparation refuses without retaining a fence', async () => {
  const h = fixture(), refusal = new Error('active workflow')
  h.deps.runtimes.prepareUpdate.mockRejectedValue(refusal)
  await expect(prepareDesktopUpdate(h.deps)).rejects.toBe(refusal)
  expect(h.steps.slice(3)).toEqual(['custody:cancel:custody-lease', 'windows:cancel:windows-lease', 'unfreeze'])
  expect(h.deps.runtimes.cancelUpdate).not.toHaveBeenCalled()
})

it('reverses every acquired lease when a window generation changed during backend preparation', async () => {
  const h = fixture()
  h.deps.windows.assertPrepared.mockImplementation(() => { throw new Error('window reloaded') })
  await expect(prepareDesktopUpdate(h.deps)).rejects.toThrow('window reloaded')
  expect(h.steps.slice(4)).toEqual(['runtimes:cancel:runtimes-lease', 'custody:cancel:custody-lease', 'windows:cancel:windows-lease', 'unfreeze'])
})

it.each(['runtimes', 'custody'] as const)('stops reverse cancellation at an unreleased %s fence', async stuck => {
  const h = fixture(), release = await prepareDesktopUpdate(h.deps)
  h.deps[stuck].cancelUpdate.mockRejectedValue(new Error('cannot cancel'))
  await expect(release()).rejects.toThrow('cannot cancel')
  expect(h.deps.windows.cancel).not.toHaveBeenCalled()
  if (stuck === 'runtimes') expect(h.deps.custody.cancelUpdate).not.toHaveBeenCalled()
  expect(h.unfreeze).not.toHaveBeenCalled()
})

it('marks failed cleanup during preparation as still fenced instead of reopening lower layers', async () => {
  const h = fixture()
  h.deps.runtimes.prepareUpdate.mockRejectedValue(new Error('busy'))
  h.deps.custody.cancelUpdate.mockRejectedValue(new Error('cannot cancel'))
  await expect(prepareDesktopUpdate(h.deps)).rejects.toMatchObject({ keepPrepared: true })
  expect(h.deps.windows.cancel).not.toHaveBeenCalled()
  expect(h.unfreeze).not.toHaveBeenCalled()
})

it('preserves all preceding fences when an owner reports an internally retained preparation', async () => {
  const h = fixture(), refusal = Object.assign(new Error('internal cancellation failed'), { keepPrepared: true })
  h.deps.runtimes.prepareUpdate.mockRejectedValue(refusal)
  await expect(prepareDesktopUpdate(h.deps)).rejects.toBe(refusal)
  expect(h.deps.custody.cancelUpdate).not.toHaveBeenCalled()
  expect(h.deps.windows.cancel).not.toHaveBeenCalled()
  expect(h.unfreeze).not.toHaveBeenCalled()
})
