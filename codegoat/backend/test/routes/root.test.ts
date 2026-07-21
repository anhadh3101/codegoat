import { test } from 'node:test'
import assert from 'node:assert/strict'
import { build } from '../helper'

test('default root route', async (t) => {
  const app = await build(t)

  const res = await app.inject({
    url: '/'
  })
  assert.deepStrictEqual(JSON.parse(res.payload), { root: true })
})

test('health check reports the service is available', async (t) => {
  const app = await build(t)

  const res = await app.inject({ url: '/health' })

  assert.strictEqual(res.statusCode, 200)
  assert.deepStrictEqual(JSON.parse(res.payload), { status: 'ok' })
})

test('allows browser requests from the configured frontend origin', async (t) => {
  const app = await build(t)

  const res = await app.inject({
    method: 'OPTIONS',
    url: '/api/agent/messages',
    headers: { origin: 'http://localhost:5173' }
  })

  assert.strictEqual(res.statusCode, 204)
  assert.strictEqual(res.headers['access-control-allow-origin'], 'http://localhost:5173')
})
