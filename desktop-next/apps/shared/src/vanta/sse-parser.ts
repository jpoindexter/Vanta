export interface SseMessage {
  data: string
  event?: string
}

export interface SseParser {
  /** Flush a trailing message the server never terminated with a blank line. */
  end: () => void
  push: (chunk: string) => void
}

/** `field: value` per the SSE grammar, or null for a comment. A single leading space of the value is dropped. */
function splitField(line: string): null | { field: string; value: string } {
  if (line.startsWith(':')) {
    return null
  }

  const colon = line.indexOf(':')
  const field = colon === -1 ? line : line.slice(0, colon)
  const raw = colon === -1 ? '' : line.slice(colon + 1)

  return { field, value: raw.startsWith(' ') ? raw.slice(1) : raw }
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

    const parsed = splitField(line)

    if (parsed?.field === 'data') {
      data.push(parsed.value)
    } else if (parsed?.field === 'event') {
      event = parsed.value
    }
  }

  const push = (chunk: string) => {
    buffer += chunk
    // A trailing CR may be the first half of a CRLF that the next chunk completes.
    const heldCr = buffer.endsWith('\r') ? '\r' : ''
    const lines = (heldCr ? buffer.slice(0, -1) : buffer).split(/\r\n|\n|\r/)
    buffer = (lines.pop() ?? '') + heldCr
    lines.forEach(handleLine)
  }

  const end = () => {
    if (buffer) {
      handleLine(buffer.replace(/\r$/, ''))
      buffer = ''
    }

    dispatch()
  }

  return { end, push }
}
