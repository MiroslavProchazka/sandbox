import type { AssistantPort, AudioPort, State } from './controller'
import type { Turn } from './api'
import { Segmenter, type VadOptions } from './vad'
export type ListeningPhase = 'paused' | 'starting' | 'listening' | 'transcribing' | 'answering' | 'interrupted' | 'error'
export type Reply = { transcript: string; answer: string }
export type ContinuousState = { phase: ListeningPhase; microphone: 'off' | 'on' | 'unknown'; queued: number; dropped: number; ignored: number; notice: string; error: string; reply?: Reply; latest?: Reply }
export function normalizeQuestion(text: string) { return text.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim() }
/** Conservative Czech/English heuristic, not semantic intent or speaker recognition. */
export function isQuestion(text: string, addressedOnly = false) {
  const normalized = normalizeQuestion(text)
  if (normalized.length < 4 || normalized.length > 4000) return false
  if (/^(who knows|kdo vi)\b|\b(you know|isn t it|right|ze jo|neni li|neni to tak)\s*$/.test(normalized)) return false
  const addressed = /^(hey |ok )?beast\b/.test(normalized)
  if (addressedOnly) return addressed && normalized.split(' ').length >= 3
  if (addressed) return normalized.split(' ').length >= 3
  return /^(co|jak|proc|kdy|kde|kam|kdo|kolik|jaky|jaka|jake|ktery|ktera|ktere|muzes|muzete|je|jsou|ma|mam|what|how|why|when|where|who|which|can|could|should|is|are|do|does)\b/.test(normalized) && (normalized.split(' ').length >= 3 || text.includes('?'))
}
export function sameQuestion(a: string, b: string) {
  if (a === b) return true
  const left = new Set(a.split(' ')), right = new Set(b.split(' '))
  if (Math.min(left.size, right.size) < 6) return false
  const shared = [...left].filter(word => right.has(word)).length
  return shared / new Set([...left, ...right]).size >= 0.85
}
export class ContinuousController {
  state: ContinuousState = { phase: 'paused', microphone: 'off', queued: 0, dropped: 0, ignored: 0, notice: '', error: '' }
  private vad: Segmenter
  private generation = 0
  private starting = false
  private stopping = 0
  private running = false
  private queue: { wav: Uint8Array<ArrayBuffer>; at: number }[] = []
  private request?: AbortController
  private history: Turn[] = []
  private seen = new Map<string, number>()
  private enabled = false
  private lastAudio = 0
  private watchdog?: ReturnType<typeof setInterval>
  constructor(private audio: AudioPort, private api: AssistantPort, private changed: () => void, private options: { now?: () => number; vad?: Partial<VadOptions>; addressedOnly?: boolean; watchdogMs?: number } = {}) {
    this.vad = new Segmenter(wav => this.enqueue(wav), options.vad)
  }
  checkAudioHealth() {
    if (this.enabled && !this.starting && this.now() - this.lastAudio > (this.options.watchdogMs ?? 8000)) return this.pause(true, 'No G2 audio received. Check connection, then resume explicitly.')
    return Promise.resolve()
  }
  private now() { return (this.options.now ?? Date.now)() }
  private set(patch: Partial<ContinuousState>) { this.state = { ...this.state, ...patch }; this.changed() }
  async start() {
    if (this.enabled || this.starting || this.stopping || this.state.microphone !== 'off') return
    const id = ++this.generation; this.starting = true; this.vad.reset(); this.queue = []; this.enabled = true
    this.set({ phase: 'starting', microphone: 'unknown', queued: 0, notice: 'Opening G2 microphone', error: '' })
    try {
      await this.audio.start()
      if (id !== this.generation) { await this.audio.stop(); return }
      this.lastAudio = this.now()
      this.set({ microphone: 'on', phase: 'listening', notice: 'Listening · segmented Whisper, automatic question filter' })
      this.watchdog = setInterval(() => { void this.checkAudioHealth() }, 1000)
    } catch (error) {
      let microphone: ContinuousState['microphone'] = 'off'
      try { await this.audio.stop() } catch { microphone = 'unknown' }
      if (id === this.generation) { this.enabled = false; this.queue = []; this.vad.reset(); this.set({ phase: 'error', microphone, queued: 0, error: String(error) }) }
    } finally { this.starting = false; if (this.enabled) void this.drain() }
  }
  onPcm(chunk: Uint8Array) { if (!this.enabled || !['starting', 'listening', 'transcribing', 'answering'].includes(this.state.phase)) return; this.lastAudio = this.now(); this.vad.push(chunk) }
  private enqueue(wav: Uint8Array<ArrayBuffer>) {
    if (!this.enabled) return
    if (this.queue.length >= 2) { this.queue.shift(); this.state.dropped++ }
    this.queue.push({ wav, at: this.now() }); this.set({ queued: this.queue.length })
    void this.drain()
  }
  private async drain() {
    if (this.running || this.starting || !this.enabled) return
    this.running = true
    try {
      while (this.enabled && this.queue.length) {
        const item = this.queue.shift()!, id = this.generation
        this.set({ queued: this.queue.length })
        if (this.now() - item.at > 30000) { this.set({ dropped: this.state.dropped + 1, notice: 'Skipped stale audio segment.' }); continue }
        const request = new AbortController(); this.request = request
        let questionKey: string | undefined, succeeded = false
        try {
          this.set({ phase: 'transcribing', error: '' })
          const text = (await this.api.transcribe(item.wav, request.signal)).trim()
          if (id !== this.generation || !this.enabled) continue
          const key = normalizeQuestion(text), now = this.now()
          for (const [key, at] of this.seen) if (now - at >= 90000) this.seen.delete(key)
          const duplicate = [...this.seen.keys()].some(previous => sameQuestion(previous, key))
          if (!isQuestion(text, this.options.addressedOnly) || duplicate) {
            this.set({ ignored: this.state.ignored + 1, notice: duplicate ? 'Duplicate question skipped.' : 'Ordinary or rhetorical speech skipped (heuristic).' }); continue
          }
          questionKey = key; this.seen.set(key, now); if (this.seen.size > 64) this.seen.delete(this.seen.keys().next().value!)
          let answer = ''
          this.set({ phase: 'answering', notice: 'Answering · microphone stays on; at most two queued segments.' })
          await this.api.chat(text, [...this.history], request.signal, delta => {
            if (id !== this.generation) return
            if (answer.length + delta.length > 12000) { request.abort(); throw new Error('Answer exceeds limit.') }
            answer += delta
          })
          if (id !== this.generation || !this.enabled) continue
          if (!answer.trim()) throw new Error('Empty answer.')
          this.history.push({ role: 'user', content: text }, { role: 'assistant', content: answer.slice(0, 4000) }); this.history = this.history.slice(-6)
          // First reply appears automatically. Later replies wait for explicit reveal, preserving reading/page position.
          const reply = { transcript: text, answer }; succeeded = true
          this.set(this.state.reply ? { latest: reply, notice: 'New answer ready · show latest when finished reading.' } : { reply, notice: 'Answer ready · listening continues.' })
        } catch (error) {
          if (id === this.generation && this.enabled) {
            // Failed answers may be retried; successful questions stay deduplicated.
            this.set({ error: String(error), notice: 'Segment failed; listening continues. No automatic audio retry.' })
          }
        } finally {
          if (questionKey && !succeeded) this.seen.delete(questionKey)
          if (this.request === request) this.request = undefined
          if (id === this.generation && this.enabled) this.set({ phase: 'listening' })
        }
      }
    } finally { this.running = false; if (this.enabled && this.queue.length) void this.drain() }
  }
  async pause(interrupted = false, notice = 'Paused · microphone off; resume explicitly.') {
    const id = ++this.generation; this.enabled = false; this.stopping++
    clearInterval(this.watchdog); this.request?.abort(); this.queue = []; this.vad.reset()
    this.set({ phase: interrupted ? 'interrupted' : 'paused', microphone: this.state.microphone === 'off' ? 'off' : 'unknown', queued: 0, notice, error: '' })
    try { await this.audio.stop(); if (id === this.generation) this.set({ microphone: 'off' }) }
    catch (error) { if (id === this.generation) this.set({ phase: 'error', error: `Microphone stop failed; retry pause: ${String(error)}` }) }
    finally { this.stopping-- }
  }
  showLatest() { if (this.state.latest) this.set({ reply: this.state.latest, latest: undefined }) }
  setAddressedOnly(value: boolean) { if (this.enabled || this.starting || this.stopping) return false; this.options.addressedOnly = value; return true }
  clearHistory() { this.history = []; this.seen.clear() }
  viewState(): State { return { phase: this.state.reply ? 'done' : this.state.phase === 'starting' ? 'starting' : this.state.phase === 'error' ? 'error' : this.state.phase === 'interrupted' ? 'interrupted' : 'idle', transcript: this.state.reply?.transcript ?? '', answer: this.state.reply?.answer ?? '', error: this.state.error, seconds: 0 } }
}
