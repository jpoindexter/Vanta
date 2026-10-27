import type { ChildProcess } from 'node:child_process'
import { appendFileSync, mkdirSync, statSync, truncateSync } from 'node:fs'
import path from 'node:path'

const TAIL_BYTES = 8_000
const EXCERPT_LINES = 14
const LOG_LIMIT_BYTES = 1_000_000

export interface RuntimeOutput {
  /** The last lines the runtime printed, ready to append to an error message. Empty when it printed nothing. */
  excerpt: () => string
  /** True when the recent output (not just the excerpt) matches. */
  includes: (pattern: RegExp) => boolean
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

/** Only the token minted for this launch; an incomplete token fragment stays buffered until safe. */
function launchTokenRedactor(token?: string) {
  let pending = ''
  return {
    push(chunk: string): string {
      if (!token) return chunk
      const text = (pending + chunk).split(token).join('[redacted]')
      let keep = Math.min(token.length - 1, text.length)
      while (keep > 0 && !text.endsWith(token.slice(0, keep))) keep -= 1
      pending = keep ? text.slice(-keep) : ''
      return keep ? text.slice(0, -keep) : text
    },
    flush(): string { const text = pending ? '[redacted]' : ''; pending = ''; return text }
  }
}

/**
 * Records everything the runtime prints, in memory (bounded) and, when a file is given, on disk, so a
 * runtime that dies leaves the reason behind instead of a bare exit code.
 */
export function captureRuntimeOutput(child: ChildProcess, logFile?: string,
  options: { boundaryToken?: string; stderr?: (text: string) => void } = {}): RuntimeOutput {
  const tail = boundedTail()
  const write = logFile ? openLog(logFile) : () => undefined
  write(`\n--- runtime started ${new Date().toISOString()} (pid ${child.pid ?? '?'}) ---\n`)

  const flushes: (() => void)[] = []
  for (const [name, stream] of [['out', child.stdout], ['err', child.stderr]] as const) {
    const redactor = launchTokenRedactor(options.boundaryToken)
    const emit = (text: string) => {
      if (!text) return
      tail.push(text)
      const stamp = `[${new Date().toISOString().slice(11, 23)}] `
      write(text.replace(/^(?=.)/gm, name === 'err' ? `${stamp}[err] ` : stamp))
      if (name === 'err') options.stderr?.(text)
    }
    const flush = () => emit(redactor.flush())
    stream?.on('data', (chunk: Buffer) => emit(redactor.push(chunk.toString())))
    stream?.once('end', flush)
    flushes.push(flush)
  }

  child.once('exit', (code, signal) => {
    write(`\n--- runtime exited ${new Date().toISOString()} (code ${code}, signal ${signal}) ---\n`)
  })
  child.once('close', () => flushes.forEach(flush => flush()))

  return { excerpt: () => formatExcerpt(tail.text()), includes: pattern => pattern.test(tail.text()) }
}
