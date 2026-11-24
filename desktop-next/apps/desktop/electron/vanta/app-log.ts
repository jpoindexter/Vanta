import { appendFileSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const MAX_LOG_BYTES = 1_000_000
const RECENT_LINES = 200

export interface AppLog {
  file: string
  line: (text: string) => void
  recent: () => string[]
}

/** One append-only desktop log in the user-data folder. Truncated when it passes 1 MB so it cannot grow without bound. */
export function createAppLog(directory: string, now: () => Date = () => new Date()): AppLog {
  const file = path.join(directory, 'desktop.log')

  const rotateIfLarge = () => {
    try {
      if (statSync(file).size > MAX_LOG_BYTES) {
        writeFileSync(file, '')
      }
    } catch {
      // No file yet.
    }
  }

  return {
    file,
    line: text => {
      try {
        mkdirSync(directory, { recursive: true })
        rotateIfLarge()
        appendFileSync(file, `${now().toISOString()} ${text}\n`)
      } catch {
        // Logging must never take the app down.
      }
    },
    recent: () => {
      try {
        return readFileSync(file, 'utf8').split('\n').filter(Boolean).slice(-RECENT_LINES)
      } catch {
        return []
      }
    }
  }
}
