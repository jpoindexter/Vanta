import { expect, it } from 'vitest'
import { nativeUpdateKeepsContext } from './update-launch-context'
it('allows ordinary launches and refuses contexts that native relaunch cannot carry', () => {
  const context = { args: [], env: {}, home: '/Users/owner' }
  expect(nativeUpdateKeepsContext(context)).toBe(true)
  expect(nativeUpdateKeepsContext({ ...context, env: { HOME: '/Users/owner', VANTA_HOME: '/Users/owner/.vanta' } })).toBe(true)
  for (const args of [['--user-data-dir=/private/profile'], ['--user-data-dir', '/private/profile']]) expect(nativeUpdateKeepsContext({ ...context, args })).toBe(false)
  for (const env of [{ HOME: '/private/home' }, { VANTA_HOME: '/private/home' }, { VANTA_PROJECT_ROOT: '/private/project' }, { VANTA_RUNTIME_ROOT: '/private/runtime' }, { VANTA_KERNEL_URL: 'http://127.0.0.1:7788' }]) expect(nativeUpdateKeepsContext({ ...context, env })).toBe(false)
})
