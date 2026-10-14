import type { ChildProcess } from 'node:child_process'
import { appendFileSync, mkdirSync, statSync, truncateSync } from 'node:fs'
import path from 'node:path'

const TAIL_BYTES = 8_000
const EXCERPT_LINES = 14
const LOG_LIMIT_BYTES = 1_000_000

export interface RuntimeOutput {
  /** The last lines the runtime printed, ready to append to an error message. Empty when it printed nothing. */
  excerpt: () => string
}

/** Keeps the last TAIL_BYTES of a stream of text. */
export function boundedTail(limit: number = TAIL_BYTES) {
  let text = ''

  return {
    push(chunk: string) {
      text = (text + chunk).slice(-limit)
    },
    text: () => text
  }
}

/** "Last output:" plus the final lines, or '' when there was none. */
export function formatExcerpt(text: string, lines: number = EXCERPT_LINES): string {
  const tail = text.trim().split('\n').slice(-lines).join('\n').trim()

  return tail ? ` Last output:\n${tail}` : ''
}

function openLog(file: string): (line: string) => void {
  try {
    mkdirSync(path.dirname(file), { recursive: true })

    if ((statSync(file, { throwIfNoEntry: false })?.size ?? 0) > LOG_LIMIT_BYTES) {
      truncateSync(file, 0)
    }
  } catch {
    return () => undefined
  }

  return line => {
    try {
      appendFileSync(file, line)
    } catch {
      // A full disk or a removed folder must never take the runtime down with it.
    }
  }
}

/**
 * Records everything the runtime prints, in memory (bounded) and, when a file is given, on disk, so a
 * runtime that dies leaves the reason behind instead of a bare exit code.
 */
export function captureRuntimeOutput(child: ChildProcess, logFile?: string): RuntimeOutput {
  const tail = boundedTail()
  const write = logFile ? openLog(logFile) : () => undefined
  write(`\n--- runtime started ${new Date().toISOString()} (pid ${child.pid ?? '?'}) ---\n`)

  for (const [name, stream] of [['out', child.stdout], ['err', child.stderr]] as const) {
    stream?.on('data', (chunk: Buffer) => {
      const text = chunk.toString()
      tail.push(text)
      const stamp = `[${new Date().toISOString().slice(11, 23)}] `
      write(text.replace(/^(?=.)/gm, name === 'err' ? `${stamp}[err] ` : stamp))
    })
  }

  child.once('exit', (code, signal) => write(`\n--- runtime exited ${new Date().toISOString()} (code ${code}, signal ${signal}) ---\n`))

  return { excerpt: () => formatExcerpt(tail.text()) }
}
