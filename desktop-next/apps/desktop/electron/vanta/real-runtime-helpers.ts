import { execFileSync } from 'node:child_process'
import { realpathSync } from 'node:fs'

/**
 * The Vanta runtime starts its safety kernel as a separate process that outlives the server. After a real-runtime
 * test, stop the kernels that were started in the test's own project folder (and only those).
 */
export function stopKernelsStartedIn(project: string): void {
  try {
    const where = realpathSync(project)
    const listing = execFileSync('ps', ['-axo', 'pid=,command='], { encoding: 'utf8' })

    for (const line of listing.split('\n')) {
      const match = /^\s*(\d+)\s+\S*vanta-kernel serve\b/.exec(line)

      if (match && kernelCwd(Number(match[1])) === where) {
        process.kill(Number(match[1]), 'SIGTERM')
      }
    }
  } catch {
    // Best effort: a kernel that is already gone, or a platform without ps or lsof, is not a test failure.
  }
}

function kernelCwd(pid: number): string {
  try {
    const out = execFileSync('lsof', ['-a', '-p', String(pid), '-d', 'cwd', '-Fn'], { encoding: 'utf8' })

    return /^n(.+)$/m.exec(out)?.[1] ?? ''
  } catch {
    return ''
  }
}
