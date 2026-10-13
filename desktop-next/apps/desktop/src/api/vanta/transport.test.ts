// @vitest-environment node
import http from 'node:http'
import type { AddressInfo } from 'node:net'

import { createHttpTransport, createSseParser, isValidClientId, remapMethod, safeApiPath } from '@hermes/shared/vanta'
import { afterEach, describe, expect, it } from 'vitest'

describe('remapMethod', () => {
  it('sends GET as GET and PUT, PATCH and DELETE as POST (the boundary answers 405 to anything else)', () => {
    expect(remapMethod('GET')).toBe('GET')
    expect(remapMethod(undefined)).toBe('GET')
    expect(remapMethod('post')).toBe('POST')
    expect(['PUT', 'PATCH', 'DELETE', 'patch'].map(remapMethod)).toEqual(['POST', 'POST', 'POST', 'POST'])
  })
})

describe('safeApiPath', () => {
  it('keeps /api/ paths and their query', () => {
    expect(safeApiPath('/api/sessions')).toBe('/api/sessions')
    expect(safeApiPath('/api/models/open%20ai?x=1')).toBe('/api/models/open%20ai?x=1')
  })

  it.each([
    '/etc/passwd',
    'api/sessions',
    '//evil.test/api/x',
    '/api/../secret',
    '/api/%2e%2e/secret',
    '/api/a\\b',
    'http://evil.test/api/x',
    '/api/\u0000',
    '/apix/foo',
    '/api/%zz'
  ])('refuses %j', path => {
    expect(safeApiPath(path)).toBeNull()
  })
})

describe('isValidClientId', () => {
  it('accepts opaque ids and refuses header-injection characters', () => {
    expect(isValidClientId('vanta-1f2e')).toBe(true)
    expect(isValidClientId('a\r\nx-evil: 1')).toBe(false)
    expect(isValidClientId('')).toBe(false)
  })
})

describe('createSseParser', () => {
  const collect = (chunks: string[]) => {
    const messages: Array<{ data: string; event?: string }> = []
    const parser = createSseParser(message => messages.push(message))
    chunks.forEach(chunk => parser.push(chunk))
    parser.end()

    return messages
  }

  it('parses messages split across arbitrary chunk boundaries', () => {
    expect(collect(['da', 'ta: {"a"', ':1}\n', '\n', 'data: two\n\n'])).toEqual([{ data: '{"a":1}' }, { data: 'two' }])
  })

  it('handles CRLF, comments, retry hints, named events and multi-line data', () => {
    expect(collect(['retry: 1000\r\n\r\n: keepalive\r\nevent: x\r\ndata: a\r\ndata: b\r\n\r\n'])).toEqual([
      { data: 'a\nb', event: 'x' }
    ])
  })

  it('does not split a CRLF that straddles two chunks into an extra blank line', () => {
    expect(collect(['data: one\r', '\n\r', '\ndata: two\n\n'])).toEqual([{ data: 'one' }, { data: 'two' }])
  })

  it('flushes an unterminated final message on end', () => {
    expect(collect(['data: tail'])).toEqual([{ data: 'tail' }])
  })
})

describe('createHttpTransport against a real HTTP server', () => {
  let server: http.Server | undefined

  afterEach(async () => {
    server?.closeAllConnections()
    await new Promise<void>(resolve => (server ? server.close(() => resolve()) : resolve()))
    server = undefined
  })

  async function serve(handler: http.RequestListener) {
    server = http.createServer(handler)
    await new Promise<void>(resolve => server!.listen(0, '127.0.0.1', resolve))

    return `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  }

  it('sends the boundary token and client id as headers, never in the URL, and remaps PUT to POST', async () => {
    const seen: Array<{ body: string; headers: http.IncomingHttpHeaders; method?: string; url?: string }> = []

    const baseUrl = await serve((req, res) => {
      const chunks: Buffer[] = []
      req.on('data', chunk => chunks.push(chunk))
      req.on('end', () => {
        seen.push({ body: Buffer.concat(chunks).toString(), headers: req.headers, method: req.method, url: req.url })
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end('{"ok":true}')
      })
    })

    const transport = createHttpTransport({ baseUrl, token: 'secret-token' })
    const result = await transport.request({ body: { a: 1 }, clientId: 'chat-1', method: 'PUT', path: '/api/model' })

    expect(result).toEqual({ data: { ok: true }, ok: true, status: 200 })
    expect(seen[0]).toMatchObject({ body: '{"a":1}', method: 'POST', url: '/api/model' })
    expect(seen[0]?.headers['x-vanta-desktop-boundary']).toBe('secret-token')
    expect(seen[0]?.headers['x-session-id']).toBe('chat-1')
    expect(seen[0]?.url).not.toContain('secret-token')
  })

  it('returns the status and body of an error response instead of throwing', async () => {
    const baseUrl = await serve((_req, res) => {
      res.writeHead(409, { 'content-type': 'application/json' })
      res.end('{"error":"a turn is already running"}')
    })

    const result = await createHttpTransport({ baseUrl, token: 't' }).request({ method: 'POST', path: '/api/chat' })

    expect(result).toEqual({ data: { error: 'a turn is already running' }, ok: false, status: 409 })
  })

  it('refuses paths outside /api/ and bad client ids without touching the network', async () => {
    let hits = 0

    const baseUrl = await serve((_req, res) => {
      hits += 1
      res.end('{}')
    })

    const transport = createHttpTransport({ baseUrl, token: 't' })

    expect((await transport.request({ method: 'GET', path: '/etc/passwd' })).status).toBe(400)
    expect((await transport.request({ clientId: 'a\nb', method: 'GET', path: '/api/status' })).status).toBe(400)
    expect(hits).toBe(0)
  })

  it('reports status 0 when the server cannot be reached', async () => {
    const transport = createHttpTransport({ baseUrl: 'http://127.0.0.1:1', token: 't' })
    const result = await transport.request({ method: 'GET', path: '/api/status' })

    expect(result).toMatchObject({ ok: false, status: 0 })
  })

  it('times out a request that never answers', async () => {
    const baseUrl = await serve(() => undefined)
    const result = await createHttpTransport({ baseUrl, token: 't' }).request({
      method: 'GET',
      path: '/api/status',
      timeoutMs: 50
    })

    expect(result).toMatchObject({ ok: false, status: 0 })
  })

  it('streams SSE frames for a client id, skipping non-JSON data, and reports the close', async () => {
    const headers: http.IncomingHttpHeaders[] = []

    const baseUrl = await serve((req, res) => {
      headers.push(req.headers)
      res.writeHead(200, { 'content-type': 'text/event-stream' })
      res.write('retry: 1000\n\n')
      res.write('data: {"delta":"hi"}\n\n')
      res.write('data: not json\n\n')
      res.write('data: {"label":"x"}\n\n')
      res.end()
    })

    const frames: unknown[] = []
    let opened = false

    const closed = await new Promise<string>(resolve => {
      createHttpTransport({ baseUrl, token: 'tok' }).openEvents('chat-7', {
        onClose: resolve,
        onFrame: frame => frames.push(frame),
        onOpen: () => {
          opened = true
        }
      })
    })

    expect(opened).toBe(true)
    expect(frames).toEqual([{ delta: 'hi' }, { label: 'x' }])
    expect(closed).toBe('stream ended')
    expect(headers[0]?.['x-session-id']).toBe('chat-7')
    expect(headers[0]?.['x-vanta-desktop-boundary']).toBe('tok')
  })

  it('reports an HTTP failure on the stream and stays silent when the caller closes it', async () => {
    const denied = await serve((_req, res) => {
      res.writeHead(403)
      res.end()
    })

    const reason = await new Promise<string>(resolve => {
      createHttpTransport({ baseUrl: denied, token: 'bad' }).openEvents('chat', {
        onClose: resolve,
        onFrame: () => undefined
      })
    })

    expect(reason).toBe('HTTP 403')
  })

  it('does not call onClose after the caller unsubscribes', async () => {
    const baseUrl = await serve((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/event-stream' })
      res.write('data: {"label":"first"}\n\n')
    })

    let closes = 0
    const frames: unknown[] = []

    const stop = createHttpTransport({ baseUrl, token: 't' }).openEvents('chat', {
      onClose: () => {
        closes += 1
      },
      onFrame: frame => frames.push(frame)
    })

    await new Promise(resolve => setTimeout(resolve, 80))
    stop()
    await new Promise(resolve => setTimeout(resolve, 80))

    expect(frames).toEqual([{ label: 'first' }])
    expect(closes).toBe(0)
  })
})
