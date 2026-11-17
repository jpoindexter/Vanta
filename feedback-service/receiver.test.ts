import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { receiveFeedback, type ReceiverEnv } from './receiver.ts'

function fixture(failEmail = false) {
  const db = new DatabaseSync(':memory:')
  db.exec(readFileSync(new URL('./schema.sql', import.meta.url), 'utf8'))
  const messages: unknown[] = []
  const env: ReceiverEnv = {
    DB: { prepare: sql => {
      let values: unknown[] = []
      const statement = {
        bind: (...args: unknown[]) => { values = args; return statement },
        first: async <T>() => db.prepare(sql).get(...values as never[]) as T ?? null,
        run: async () => ({ meta: { changes: Number(db.prepare(sql).run(...values as never[]).changes) } })
      }
      return statement
    } },
    REPORT_LIMITER: { limit: async () => ({ success: true }) },
    EMAIL: { send: async message => {
      messages.push(message)
      if (failEmail) throw new Error('Uncertain notification')
      return { messageId: 'synthetic-id' }
    } },
    FEEDBACK_FROM: 'feedback@example.test'
  }
  const body = { id: randomUUID(), kind: 'bug', title: 'Synthetic test', details: 'Synthetic details', steps: '', facts: null }
  const send = (report: unknown = body, origin = 'null') => receiveFeedback(new Request('https://receiver.test/reports', {
    method: 'POST', headers: { 'content-type': 'application/json', origin }, body: JSON.stringify(report)
  }), env)
  return { db, messages, env, body, send }
}

test('stores once, binds the receipt to the exact report and notifies once across concurrent retries', async () => {
  const f = fixture()
  try {
    const responses = await Promise.all([f.send(), f.send()])
    for (const response of responses) assert.equal((await response.json()).id, f.body.id)
    assert.equal(f.messages.length, 1)
    assert.equal((await f.send({ ...f.body, details: 'changed' })).status, 409)
    assert.equal(f.messages.length, 1)
  } finally { f.db.close() }
})

test('an uncertain email remains stored and is never automatically sent a second time', async () => {
  const f = fixture(true)
  try {
    assert.equal((await (await f.send()).json()).notification, 'uncertain')
    await f.send()
    assert.equal(f.messages.length, 1)
    assert.equal(f.db.prepare('SELECT payload FROM reports').get()?.payload, JSON.stringify(f.body))
  } finally { f.db.close() }
})

test('rejects injected recipients, raw diagnostic data, oversized bodies and disallowed origins', async () => {
  const f = fixture()
  try {
    assert.equal((await f.send({ ...f.body, to: 'other@example.test' })).status, 400)
    assert.equal((await f.send({ ...f.body, facts: { log: 'PRIVATE' } })).status, 400)
    assert.equal((await f.send({ ...f.body, details: 'x'.repeat(65537) })).status, 413)
    assert.equal((await f.send(f.body, 'https://unrelated.example')).status, 403)
    f.env.REPORT_LIMITER.limit = async () => ({ success: false })
    assert.equal((await f.send()).status, 429)
    assert.equal(f.messages.length, 0)
  } finally { f.db.close() }
})
