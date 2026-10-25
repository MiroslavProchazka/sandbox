import { test } from 'node:test'
import assert from 'node:assert/strict'
import { GatewayClient } from '../src/api'
import { AssistantController } from '../src/controller'
import { createGateway, loadConfig } from '../server/gateway.mjs'
async function server(t: any, upstream?: typeof fetch) {
  const gateway = createGateway({ ...loadConfig({ DEMO_MODE: '1' }), ...(upstream ? { demo: false, key: 'fake', chatUrl: 'https://fake.invalid/chat' } : {}) }, upstream)
  await new Promise<void>(resolve => gateway.listen(0, '127.0.0.1', resolve))
  t.after(() => { gateway.closeAllConnections(); gateway.close() })
  return `http://127.0.0.1:${(gateway.address() as any).port}`
}
test('controller → HTTP demo gateway → streaming client → UI state completes voice and text paths', async t => {
  const gateway = await server(t)
  const client = new GatewayClient(() => ({ gateway, token: 'local-demo-token-only', language: 'cs' }))
  const phases: string[] = []
  const c = new AssistantController({ async start() {}, async stop() {} }, client, s => phases.push(s.phase))
  await c.tap(); c.onPcm(new Uint8Array(6400)); await c.finish()
  assert.equal(c.state.phase, 'done'); assert.match(c.state.answer, /lokální demo/); assert.ok(phases.includes('transcribing'))
  await c.ask('Další otázka'); assert.equal(c.state.phase, 'done')
})
test('fragmented UTF-8 stream ends on done without waiting for provider socket close', async t => {
  let cancelled = false
  const upstream = (async () => new Response(new ReadableStream({ start(c) {
    const data = 'data: {"choices":[{"delta":{"content":"Příliš"}}]}\r\n\r\ndata: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n'
    for (const byte of new TextEncoder().encode(data)) c.enqueue(new Uint8Array([byte]))
  }, cancel() { cancelled = true } }))) as typeof fetch
  const gateway = await server(t, upstream), client = new GatewayClient(() => ({ gateway, token: 'local-demo-token-only', language: 'cs' }))
  let answer = ''
  await client.chat('Hi', [], AbortSignal.timeout(1000), delta => { answer += delta })
  assert.equal(answer, 'Příliš'); assert.equal(cancelled, true)
})
test('gateway auth and truncated upstream errors reach controller and allow retry', async t => {
  const gateway = await server(t, (async () => new Response('data: {"choices":[{"delta":{"content":"partial"}}]}\n\n')) as typeof fetch)
  let token = 'wrong'
  const client = new GatewayClient(() => ({ gateway, token, language: 'cs' }))
  const c = new AssistantController({ async start() {}, async stop() {} }, client, () => {})
  await c.ask('Hi'); assert.match(c.state.error, /Invalid gateway token/)
  token = 'local-demo-token-only'; await c.ask('Retry'); assert.equal(c.state.phase, 'error'); assert.match(c.state.error, /before completion/)
})
test('client stops at terminal NDJSON event and cancels an otherwise open response', async t => {
  const original = globalThis.fetch; let cancelled = false
  t.after(() => { globalThis.fetch = original })
  globalThis.fetch = async () => new Response(new ReadableStream({ start(c) {
    c.enqueue(new TextEncoder().encode('{"type":"delta","text":"ok"}\n{"type":"done"}\n{"type":"delta","text":"stale"}\n'))
  }, cancel() { cancelled = true } }))
  const client = new GatewayClient(() => ({ gateway: 'http://127.0.0.1:8787', token: 'fake', language: 'cs' }))
  let answer = ''; await client.chat('hi', [], AbortSignal.timeout(1000), x => { answer += x })
  assert.equal(answer, 'ok'); assert.equal(cancelled, true)
})
