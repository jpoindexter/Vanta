export interface SseMessage {
  data: string
  event?: string
}

export interface SseParser {
  /** Flush a trailing message the server never terminated with a blank line. */
  end: () => void
  push: (chunk: string) => void
}

/**
 * Incremental Server-Sent Events parser. Handles CRLF/LF/CR line ends, comment lines, multi-line
 * `data:` fields and chunk boundaries that fall mid-line. `id:` and `retry:` are ignored: the
 * Vanta stream sends neither with meaning, and reconnection is the gateway's decision.
 */
export function createSseParser(onMessage: (message: SseMessage) => void): SseParser {
  let buffer = ''
  let data: string[] = []
  let event: string | undefined

  const dispatch = () => {
    if (data.length > 0) {
      onMessage({ data: data.join('\n'), ...(event ? { event } : {}) })
    }

    data = []
    event = undefined
  }

  const handleLine = (line: string) => {
    if (line === '') {
      dispatch()

      return
    }

    if (line.startsWith(':')) {
      return
    }

    const colon = line.indexOf(':')
    const field = colon === -1 ? line : line.slice(0, colon)
    const raw = colon === -1 ? '' : line.slice(colon + 1)
    const value = raw.startsWith(' ') ? raw.slice(1) : raw

    if (field === 'data') {
      data.push(value)
    } else if (field === 'event') {
      event = value
    }
  }

  return {
    end: () => {
      if (buffer) {
        handleLine(buffer.replace(/\r$/, ''))
        buffer = ''
      }

      dispatch()
    },
    push: chunk => {
      buffer += chunk
      // A trailing CR may be the first half of a CRLF that the next chunk completes.
      const heldCr = buffer.endsWith('\r') ? '\r' : ''
      const lines = (heldCr ? buffer.slice(0, -1) : buffer).split(/\r\n|\n|\r/)
      buffer = (lines.pop() ?? '') + heldCr

      for (const line of lines) {
        handleLine(line)
      }
    }
  }
}
