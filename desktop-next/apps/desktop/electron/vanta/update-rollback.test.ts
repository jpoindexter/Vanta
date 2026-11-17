import { execFile } from 'node:child_process'
import { describe, expect, it, vi } from 'vitest'
import { verifyVantaPublisher } from './update-rollback'

vi.mock('node:child_process', () => ({
  execFile: vi.fn((_file, _args, callback) => callback(null))
}))

describe('native publisher requirement', () => {
  it('passes a requirement expression, not a filename, to codesign', async () => {
    await verifyVantaPublisher('/Applications/Vanta.app')
    expect(execFile).toHaveBeenCalledWith('/usr/bin/codesign', [
      '--verify', '--deep', '--strict', '-R',
      '=identifier "studio.theft.vanta-next" and anchor apple generic and certificate leaf[subject.OU] = "5352PXMNV5"',
      '/Applications/Vanta.app'
    ], expect.any(Function))
  })
})
