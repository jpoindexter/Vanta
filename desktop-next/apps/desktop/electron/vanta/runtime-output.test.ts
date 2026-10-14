import { EventEmitter } from 'node:events'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PassThrough } from 'node:stream'

import { describe, expect, it } from 'vitest'

import { boundedTail, captureRuntimeOutput, formatExcerpt } from './runtime-output'

function fakeChild() {
  const child = new EventEmitter() as EventEmitter & { pid: number; stderr: PassThrough; stdout: PassThrough }
  child.pid = 4242
  child.stdout = new PassThrough()
  child.stderr = new PassThrough()

  return child
}

const tick = () => new Promise(resolve => setImmediate(resolve))

describe('boundedTail', () => {
  it('keeps only the last characters', () => {
    const tail = boundedTail(10)
    tail.push('0123456789')
    tail.push('abc')

    expect(tail.text()).toBe('3456789abc')
  })
})

describe('formatExcerpt', () => {
  it('is empty when nothing was printed', () => {
    expect(formatExcerpt('  \n ')).toBe('')
  })

  it('keeps the final lines under a Last output heading', () => {
    const text = Array.from({ length: 30 }, (_, i) => `line ${i}`).join('\n')
    const excerpt = formatExcerpt(text, 3)

    expect(excerpt).toBe(' Last output:\nline 27\nline 28\nline 29')
  })
})

describe('captureRuntimeOutput', () => {
  it('reports what both streams printed', async () => {
    const child = fakeChild()
    const output = captureRuntimeOutput(child as never)
    child.stdout.write('listening soon\n')
    child.stderr.write('boom\n')
    await tick()

    expect(output.excerpt()).toContain('listening soon')
    expect(output.excerpt()).toContain('boom')
  })

  it('writes a log with stream markers, start and exit lines', async () => {
    const file = join(mkdtempSync(join(tmpdir(), 'vanta-output-')), 'logs', 'runtime.log')
    const child = fakeChild()
    captureRuntimeOutput(child as never, file)
    child.stderr.write('bad thing\n')
    await tick()
    child.emit('exit', 2, null)

    const log = readFileSync(file, 'utf8')

    expect(log).toMatch(/runtime started .*pid 4242/)
    expect(log).toMatch(/\[\d\d:\d\d:\d\d\.\d{3}\] \[err\] bad thing/)
    expect(log).toMatch(/runtime exited .*code 2/)
  })

  it('appends across launches and truncates a log over the limit', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'vanta-output-')), 'runtime.log')
    writeFileSync(file, 'x'.repeat(1_200_000))
    captureRuntimeOutput(fakeChild() as never, file)

    expect(readFileSync(file, 'utf8')).toMatch(/^\n--- runtime started/)

    captureRuntimeOutput(fakeChild() as never, file)

    expect(readFileSync(file, 'utf8').match(/runtime started/g)).toHaveLength(2)
  })

  it('never throws when the log file cannot be written', async () => {
    const child = fakeChild()
    const output = captureRuntimeOutput(child as never, '/dev/null/not-a-dir/runtime.log')
    child.stdout.write('still captured\n')
    await tick()

    expect(output.excerpt()).toContain('still captured')
  })
})
