import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Segmenter } from '../src/vad'
import { ContinuousController, isQuestion } from '../src/continuous'
import { createContinuousDemo, pcmFrame, simulateUtterance } from '../src/continuous-demo'
import type { AssistantPort } from '../src/controller'
const tick = () => new Promise<void>(r => setImmediate(r))
const deferred = <T>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r }); return { promise, resolve } }
const frames = (s: Segmenter, speech: boolean, count: number) => { for (let i = 0; i < count; i++) s.push(pcmFrame(speech)) }
const normalApi: AssistantPort = { async transcribe() { return 'Jak funguje G2?' }, async chat(_t, _h, _s, delta) { delta('Odpověď.') } }
function setup(t: any, api = normalApi, options: ConstructorParameters<typeof ContinuousController>[3] = {}) {
  const audio = { starts: 0, stops: 0, async start() { this.starts++ }, async stop() { this.stops++ } }
  const c = new ContinuousController(audio, api, () => {}, options)
  t.after(() => c.pause()); return { c, audio }
}
test('VAD ignores silence and short noises, preserves preroll and matches odd packet boundaries', () => {
  const whole: Uint8Array[] = [], split: Uint8Array[] = []
  const a = new Segmenter(w => whole.push(w)), b = new Segmenter(w => split.push(w))
  frames(a, false, 200); frames(a, true, 4); frames(a, false, 40); assert.equal(whole.length, 0)
  a.reset()
  const input = new Uint8Array(640 * 80)
  for (let i = 15; i < 45; i++) input.set(pcmFrame(true), i * 640)
  a.push(input)
  for (let i = 0; i < input.length; i += 137) b.push(input.subarray(i, i + 137))
  assert.equal(whole.length, 1); assert.deepEqual(split, whole)
  const samples = new Int16Array(whole[0].buffer, 44)
  assert.equal(samples[0], 0); assert.ok(samples.some(x => x !== 0)); assert.ok(whole[0].length < 960044)
})
test('VAD caps continuous speech and reset discards an incomplete segment', () => {
  const output: Uint8Array[] = []; const s = new Segmenter(w => output.push(w))
  frames(s, true, 1300); assert.ok(output.length >= 2)
  assert.ok(output.every(w => w.length <= 12000 * 32 + 44))
  s.reset(); frames(s, false, 100); assert.equal(output.length, 2)
  assert.throws(() => new Segmenter(() => {}, { maxSegmentMs: Infinity }))
})
test('Czech/English question heuristic rejects ordinary/rhetorical speech and supports addressed-only policy', () => {
  for (const text of ['Jak funguje G2?', 'What does this mean?', 'Beast vysvětli bitcoin']) assert.equal(isQuestion(text), true, text)
  for (const text of ['Dneska je hezky.', 'Kdo ví, že jo?', 'Who knows?', 'Is it nice, right?', 'Díky.', '']) assert.equal(isQuestion(text), false, text)
  assert.equal(isQuestion('Jak funguje G2?', true), false); assert.equal(isQuestion('Beast vysvětli bitcoin', true), true)
})
test('continuous mode deduplicates punctuation/diacritics, expires TTL, and preserves reading until reveal', async t => {
  let clock = 1000, i = 0, chats = 0
  const texts = ['Jak funguje G2?', 'JAK FUNGUJE G2!', 'Jak funguje G2?', 'Co znamená VAD?']
  const { c } = setup(t, { async transcribe() { return texts[i++] }, async chat(text, _h, _s, delta) { chats++; delta(text) } }, { now: () => clock })
  await c.start(); simulateUtterance(c); await tick(); assert.equal(chats, 1)
  simulateUtterance(c); await tick(); assert.equal(chats, 1); assert.equal(c.state.ignored, 1)
  clock += 90001; simulateUtterance(c); await tick(); assert.equal(chats, 2)
  simulateUtterance(c); await tick(); assert.equal(c.state.reply?.transcript, texts[0]); assert.equal(c.state.latest?.transcript, texts[3])
  c.showLatest(); assert.equal(c.state.reply?.transcript, texts[3]); assert.equal(c.state.latest, undefined)
})
test('slow API never overlaps and pending queue keeps newest two, dropping stale segments', async t => {
  const blocked = deferred<string>(); let calls = 0, active = 0, maxActive = 0, clock = 1000
  const { c } = setup(t, { async transcribe() { calls++; active++; maxActive = Math.max(active, maxActive); const result = calls === 1 ? await blocked.promise : 'Dneska je hezky.'; active--; return result }, ...{ chat: normalApi.chat } }, { now: () => clock })
  await c.start(); for (let i = 0; i < 6; i++) simulateUtterance(c)
  assert.equal(c.state.queued, 2); assert.equal(c.state.dropped, 3); assert.equal(calls, 1)
  clock += 30001; blocked.resolve('Jak funguje G2?'); await tick()
  assert.equal(calls, 1); assert.equal(c.state.dropped, 5); assert.equal(maxActive, 1)
})
test('new speech during chat queues instead of cancelling current answer', async t => {
  const chat = deferred<void>(); let calls = 0
  const { c } = setup(t, { async transcribe() { return ++calls === 1 ? 'Jak funguje G2?' : 'Co znamená VAD?' }, async chat(text, _h, signal, delta) { if (text.startsWith('Jak')) { await chat.promise; assert.equal(signal.aborted, false) } delta(text) } })
  await c.start(); simulateUtterance(c); await tick(); simulateUtterance(c)
  assert.equal(c.state.phase, 'answering'); assert.equal(c.state.queued, 1)
  chat.resolve(); await tick(); assert.equal(calls, 2); assert.match(c.state.reply!.answer, /Jak/); assert.match(c.state.latest!.answer, /Co/)
})
test('pause aborts work and clears queue/pre-roll; late inference cannot reply after explicit resume', async t => {
  const blocked = deferred<string>(); let calls = 0, oldSignal: AbortSignal | undefined
  const { c, audio } = setup(t, { async transcribe(_w, signal) { oldSignal = signal; return ++calls === 1 ? blocked.promise : 'Co znamená VAD?' }, chat: normalApi.chat })
  await c.start(); simulateUtterance(c); simulateUtterance(c); await c.pause(true)
  assert.equal(oldSignal?.aborted, true); assert.equal(c.state.queued, 0); assert.equal(c.state.microphone, 'off'); assert.equal(c.state.phase, 'interrupted')
  c.onPcm(pcmFrame(true)); await c.start(); blocked.resolve('Jak funguje G2?'); await tick()
  assert.equal(c.state.reply, undefined); assert.equal(audio.starts, 2)
  simulateUtterance(c); await tick(); assert.equal(c.state.reply?.transcript, 'Co znamená VAD?')
})
test('cancel during native start cannot restart until late open has been stopped', async t => {
  const opened = deferred<void>(); const commands: string[] = []
  const c = new ContinuousController({ start() { commands.push('start'); return opened.promise }, async stop() { commands.push('stop') } }, normalApi, () => {})
  t.after(() => c.pause())
  const pending = c.start(); await c.pause(); await c.start(); assert.deepEqual(commands, ['start', 'stop'])
  opened.resolve(); await pending; assert.deepEqual(commands, ['start', 'stop', 'stop']); assert.equal(c.state.microphone, 'off')
})
test('simulation runs same VAD/filter/queue path without any device or network', async t => {
  const c = createContinuousDemo(() => {}); t.after(() => c.pause())
  await c.start()
  for (let i = 0; i < 5; i++) { simulateUtterance(c); await tick() }
  assert.equal(c.state.ignored, 3); assert.match(c.state.reply!.answer, /SIMULATED/); assert.ok(c.state.latest); assert.equal(c.state.microphone, 'on')
})
test('PCM silence is healthy but a missing audio stream interrupts until explicit resume', async t => {
  let clock = 1000
  const { c } = setup(t, normalApi, { now: () => clock })
  await c.start(); clock += 9000; c.onPcm(pcmFrame(false)); await c.checkAudioHealth()
  assert.equal(c.state.phase, 'listening')
  clock += 8001; await c.checkAudioHealth()
  assert.equal(c.state.phase, 'interrupted'); assert.equal(c.state.microphone, 'off'); assert.match(c.state.notice, /No G2 audio/)
  c.onPcm(pcmFrame(true)); assert.equal(c.state.phase, 'interrupted')
  await c.start(); assert.equal(c.state.phase, 'listening')
})
test('failed chat does not poison deduplication and partial output stays hidden', async t => {
  let calls = 0
  const { c } = setup(t, { transcribe: normalApi.transcribe, async chat(_t, _h, _s, delta) { delta('partial'); if (++calls === 1) throw new Error('offline') } })
  await c.start(); simulateUtterance(c); await tick()
  assert.equal(c.state.reply, undefined); assert.match(c.state.error, /offline/)
  simulateUtterance(c); await tick(); assert.equal(calls, 2); assert.equal(c.state.reply?.answer, 'partial')
})
test('native stop rejection leaves microphone unknown and blocks unsafe restart', async t => {
  let reject = true, starts = 0
  const c = new ContinuousController({ async start() { starts++ }, async stop() { if (reject) throw new Error('BLE lost') } }, normalApi, () => {})
  t.after(() => { reject = false; return c.pause() })
  await c.start(); await c.pause(); assert.equal(c.state.microphone, 'unknown')
  await c.start(); assert.equal(starts, 1)
  reject = false; await c.pause(); await c.start(); assert.equal(starts, 2)
})
test('overlap variants deduplicate only with substantial matching content', async () => {
  const { sameQuestion, normalizeQuestion } = await import('../src/continuous')
  assert.equal(sameQuestion(normalizeQuestion('Jak přesně funguje toto nové rozhraní mezi brýlemi a telefonem?'), normalizeQuestion('Jak přesně funguje toto nové rozhraní mezi brýlemi a telefonem prosím?')), true)
  assert.equal(sameQuestion('co je bitcoin', 'co je ethereum'), false)
})
test('real directional questions containing right survive the rhetorical tag filter', () => {
  assert.equal(isQuestion('How do I turn right at this junction?'), true)
  assert.equal(isQuestion('How does right alignment work?'), true)
})
