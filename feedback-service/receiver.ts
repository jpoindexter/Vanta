import { FeedbackReportSchema, type FeedbackReport } from '../desktop-next/apps/shared/src/feedback'

interface Statement {
  bind: (...values: unknown[]) => Statement
  first: <T>() => Promise<T | null>
  run: () => Promise<{ meta: { changes: number } }>
}
export interface ReceiverEnv {
  DB: { prepare: (sql: string) => Statement }
  REPORT_LIMITER: { limit: (input: { key: string }) => Promise<{ success: boolean }> }
  EMAIL: { send: (message: { to: string; from: string; subject: string; text: string }) => Promise<{ messageId: string }> }
  FEEDBACK_FROM: string
}
interface StoredReport { id: string; digest: string; stored_at: string; notification: 'sent' | 'pending' | 'uncertain' }
const ORIGINS = new Set(['null', 'http://127.0.0.1:5174', 'http://localhost:5174'])
const lookup = (env: ReceiverEnv, id: string) => env.DB.prepare('SELECT id, digest, stored_at, notification FROM reports WHERE id = ?').bind(id).first<StoredReport>()
const receipt = (row: StoredReport) => ({ id: row.id, storedAt: row.stored_at, notification: row.notification })

async function readBody(request: Request): Promise<string | null> {
  const reader = request.body?.getReader()
  if (!reader) return ''
  const decoder = new TextDecoder('utf-8', { fatal: true })
  let text = ''
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > 65536) { await reader.cancel(); return null }
    text += decoder.decode(value, { stream: true })
  }
  return text + decoder.decode()
}

async function notify(env: ReceiverEnv, report: FeedbackReport): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const sent = await Promise.race([
      env.EMAIL.send({ to: 'jason@theft.studio', from: env.FEEDBACK_FROM, subject: `[Vanta ${report.kind}] ${report.title}`, text: `${report.details}\n\n${report.steps}\n\nReference: ${report.id}\n\n${report.facts ? JSON.stringify(report.facts, null, 2) : 'Build facts not included.'}` }),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Notification deadline')), 8000) })
    ])
    await env.DB.prepare("UPDATE reports SET notification = 'sent', message_id = ? WHERE id = ?").bind(sent.messageId, report.id).run()
  } catch {
    // An ambiguous email is never sent a second time; the private report is already durable.
    await env.DB.prepare("UPDATE reports SET notification = 'uncertain' WHERE id = ?").bind(report.id).run()
  } finally { clearTimeout(timer) }
}

async function storeReport(env: ReceiverEnv, report: FeedbackReport): Promise<Response> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(report)))
  const hash = Array.from(new Uint8Array(bytes), n => n.toString(16).padStart(2, '0')).join('')
  const previous = await lookup(env, report.id)
  if (previous) return previous.digest === hash ? Response.json(receipt(previous)) : Response.json({ error: 'Report ID already used' }, { status: 409 })
  const storedAt = new Date().toISOString(), day = `${storedAt.slice(0, 10)}T00:00:00.000Z`
  const claimed = await env.DB.prepare('INSERT INTO reports(id, digest, payload, stored_at) SELECT ?, ?, ?, ? WHERE (SELECT COUNT(*) FROM reports WHERE stored_at >= ?) < 100 ON CONFLICT(id) DO NOTHING').bind(report.id, hash, JSON.stringify(report), storedAt, day).run()
  if (!claimed.meta.changes) {
    const row = await lookup(env, report.id)
    return row ? row.digest === hash ? Response.json(receipt(row)) : Response.json({ error: 'Report ID already used' }, { status: 409 }) : Response.json({ error: 'Daily limit reached' }, { status: 429 })
  }
  await notify(env, report)
  const row = await lookup(env, report.id)
  return row ? Response.json(receipt(row), { status: 201 }) : Response.json({ error: 'Receipt unavailable' }, { status: 503 })
}

async function route(request: Request, env: ReceiverEnv): Promise<Response> {
  const path = new URL(request.url).pathname
  if (path === '/health' && request.method === 'GET') return Response.json({ status: 'ok', service: 'vanta-feedback' })
  if (path !== '/reports') return Response.json({ error: 'Not found' }, { status: 404 })
  if (request.method === 'OPTIONS') return new Response(null, { status: 204 })
  if (request.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405 })
  if (!(await env.REPORT_LIMITER.limit({ key: request.headers.get('cf-connecting-ip') ?? 'unknown' })).success) return Response.json({ error: 'Try later' }, { status: 429 })
  const body = await readBody(request)
  if (body === null) return Response.json({ error: 'Report too large' }, { status: 413 })
  const parsed = FeedbackReportSchema.safeParse(JSON.parse(body))
  if (!parsed.success) return Response.json({ error: 'Invalid report' }, { status: 400 })
  return storeReport(env, parsed.data)
}

export async function receiveFeedback(request: Request, env: ReceiverEnv): Promise<Response> {
  const origin = request.headers.get('origin')
  if (origin && !ORIGINS.has(origin)) return Response.json({ error: 'Origin not allowed' }, { status: 403 })
  let response: Response
  try { response = await route(request, env) }
  catch (error) { response = Response.json({ error: error instanceof SyntaxError || error instanceof TypeError ? 'Invalid report' : 'Delivery not confirmed' }, { status: error instanceof SyntaxError || error instanceof TypeError ? 400 : 503 }) }
  if (origin) response.headers.set('access-control-allow-origin', origin)
  response.headers.set('access-control-allow-methods', 'POST, GET, OPTIONS')
  response.headers.set('access-control-allow-headers', 'content-type')
  response.headers.set('vary', 'Origin')
  response.headers.set('cache-control', 'no-store')
  return response
}

export default { fetch: receiveFeedback }
