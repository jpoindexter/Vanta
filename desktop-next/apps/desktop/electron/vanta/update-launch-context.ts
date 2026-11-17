import path from 'node:path'
interface UpdateLaunchContext { args: string[]; env: NodeJS.ProcessEnv; home: string }

/** Squirrel relaunches through LaunchServices without CLI/environment overrides; never silently re-home a profile. */
export function nativeUpdateKeepsContext({ args, env, home }: UpdateLaunchContext): boolean {
  if (args.some(arg => arg === '--user-data-dir' || arg.startsWith('--user-data-dir='))) return false
  if (env.HOME && path.resolve(env.HOME) !== path.resolve(home)) return false
  if (env.VANTA_HOME && path.resolve(env.VANTA_HOME) !== path.join(home, '.vanta')) return false
  return ![env.VANTA_RUNTIME_ROOT, env.VANTA_PROJECT_ROOT, env.VANTA_KERNEL_URL].some(Boolean)
}
