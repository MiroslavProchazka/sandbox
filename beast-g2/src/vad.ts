import { PcmBuffer } from './audio'
export type VadOptions = { threshold: number; preRollMs: number; startMs: number; minSpeechMs: number; silenceMs: number; maxSegmentMs: number }
const defaults: VadOptions = { threshold: 600, preRollMs: 300, startMs: 60, minSpeechMs: 300, silenceMs: 600, maxSegmentMs: 12000 }
const FRAME_BYTES = 640 // 20 ms, PCM16 mono 16 kHz
/** Fixed-size frames make boundaries independent of BLE chunk sizes, including odd bytes. */
export class Segmenter {
  private tail = new Uint8Array(0)
  private pre: Uint8Array[] = []
  private frames: Uint8Array[] = []
  private consecutive = 0
  private voiced = 0
  private silence = 0
  readonly options: VadOptions
  constructor(private segment: (wav: Uint8Array<ArrayBuffer>) => void, options: Partial<VadOptions> = {}) {
    this.options = { ...defaults, ...options }
    const o = this.options
    if (Object.values(o).some(x => !Number.isFinite(x) || x <= 0) || o.threshold > 32767 || o.preRollMs > 1000 || o.preRollMs < o.startMs || o.maxSegmentMs > 30000 || o.minSpeechMs < o.startMs || o.maxSegmentMs < o.minSpeechMs + o.silenceMs + o.preRollMs) throw new Error('Invalid VAD limits.')
  }
  reset() { this.tail = new Uint8Array(0); this.pre = []; this.frames = []; this.consecutive = this.voiced = this.silence = 0 }
  push(chunk: Uint8Array) {
    // Copy at most one frame at a time; never retain an unbounded SDK packet.
    let offset = 0
    while (offset < chunk.length) {
      const take = Math.min(FRAME_BYTES - this.tail.length, chunk.length - offset)
      const next = new Uint8Array(this.tail.length + take); next.set(this.tail); next.set(chunk.subarray(offset, offset + take), this.tail.length)
      this.tail = next; offset += take
      if (next.length === FRAME_BYTES) { this.tail = new Uint8Array(0); this.frame(next) }
    }
  }
  private frame(bytes: Uint8Array) {
    let energy = 0; const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    for (let i = 0; i < bytes.length; i += 2) energy += view.getInt16(i, true) ** 2
    const speech = Math.sqrt(energy / 320) >= this.options.threshold
    this.pre.push(bytes); if (this.pre.length > Math.ceil(this.options.preRollMs / 20)) this.pre.shift()
    if (!this.frames.length) {
      this.consecutive = speech ? this.consecutive + 20 : 0
      if (this.consecutive < this.options.startMs) return
      this.frames = [...this.pre]; this.voiced = this.consecutive; this.silence = 0
    } else {
      this.frames.push(bytes); if (speech) { this.voiced += 20; this.silence = 0 } else this.silence += 20
    }
    if (this.silence >= this.options.silenceMs || this.frames.length * 20 >= this.options.maxSegmentMs) {
      const frames = this.frames, valid = this.voiced >= this.options.minSpeechMs
      this.frames = []; this.voiced = this.silence = this.consecutive = 0
      if (valid) { const pcm = new PcmBuffer(); for (const frame of frames) pcm.add(frame); this.segment(pcm.wav()) }
    }
  }
}
