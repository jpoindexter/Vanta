import { describe, expect, it, vi } from 'vitest'
import { CH } from './channels'
import type { MutationDeps } from './git-mutation-handlers'
import { registerGitMutations } from './git-mutation-handlers'
import { planMutation } from './git-mutations'
import type { Plan } from './git-plan-core'
import type { NativeActionTarget } from './native-action-target'

vi.mock('./git-mutations', async original => ({ ...await original<typeof import('./git-mutations')>(), planMutation: vi.fn() }))
const target = (profile: string): NativeActionTarget => Object.freeze({ clientId: 'same-client', profile, connectionId: 'local', generation: 1, lease: 1 })
function fixture(run: MutationDeps['run']) {
  let handler!: (event: { sender: unknown }, raw: unknown) => Promise<unknown>
  let active = target('writer')
  const deps = { ipc: { handle: (channel: string, callback: typeof handler) => { if (channel === CH.gitMutate) handler = callback } },
    clientFor: vi.fn(() => active), run } as unknown as MutationDeps
  registerGitMutations(deps)
  return { invoke: () => handler({ sender: {} }, { op: 'stage', repo: '/fixture', file: 'one.txt' }),
    rehome: () => { active = target('sticky') }, deps }
}

describe('immutable native Git owner', () => {
  it('captures before asynchronous planning rather than rehoming the original click', async () => {
    let finish!: (plan: Plan) => void
    vi.mocked(planMutation).mockReturnValueOnce(new Promise(resolve => { finish = resolve }))
    const run = vi.fn(async () => ({ ok: true, output: '' })), f = fixture(run)
    const pending = f.invoke()
    f.rehome(); finish({ ok: true, commands: ['git add one.txt'] })
    expect(await pending).toEqual({ ok: true })
    expect(run).toHaveBeenCalledWith('git add one.txt', target('writer'))
    expect(f.deps.clientFor).toHaveBeenCalledTimes(1)
  })

  it('retains one original target for every command in a multi-step plan', async () => {
    vi.mocked(planMutation).mockResolvedValueOnce({ ok: true, commands: ['first', 'second'] })
    const run = vi.fn(async (_command: string, _target: NativeActionTarget) => { f.rehome(); return { ok: true, output: '' } }), f = fixture(run)
    expect(await f.invoke()).toEqual({ ok: true })
    expect(run.mock.calls.map(call => call[1])).toEqual([target('writer'), target('writer')])
  })
});
