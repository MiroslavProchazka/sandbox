import { deadline } from './deadline'
import type { State } from './controller'
const labels: Record<State['phase'], string> = { idle: 'READY', starting: 'OPENING MIC', recording: 'LISTENING', transcribing: 'TRANSCRIBING', answering: 'BEAST', done: 'ANSWER', error: 'ERROR', interrupted: 'INTERRUPTED' }
export function pages(text: string): string[] {
  const lines: string[] = []
  for (const paragraph of text.replace(/\r/g, '').split('\n')) {
    let line = ''
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      if ([...line, ...word].length + 1 > 40 && line) { lines.push(line); line = '' }
      let rest = [...word]
      while (rest.length > 40) { if (line) { lines.push(line); line = '' } lines.push(rest.slice(0, 40).join('')); rest = rest.slice(40) }
      if (rest.length) line += (line ? ' ' : '') + rest.join('')
    }
    lines.push(line)
  }
  const result: string[] = []; for (let i = 0; i < lines.length; i += 5) result.push(lines.slice(i, i + 5).join('\n'))
  return result.length ? result : ['']
}
export function hud(state: State, page: number) {
  const content = state.phase === 'error' ? state.error : state.answer || state.transcript || (state.phase === 'recording' ? 'Speak, then tap to send.' : 'Tap to ask Beast.\nDouble tap: cancel.\nSwipe: read answer.')
  const all = pages(content), index = Math.min(Math.max(0, page), all.length - 1)
  return { text: `BEAST / ${labels[state.phase]}${state.phase === 'recording' ? ` ${state.seconds}s` : ''}\n\n${all[index]}\n\n${index + 1}/${all.length}`, count: all.length }
}
// A single in-flight bridge write and one latest pending value; no queue of stale tokens.
export class LatestDisplay {
  private latest?: string
  private last?: string
  private running = false
  private disposed = false
  constructor(private write: (text: string) => Promise<void>, private failed: (error: unknown) => void, private interval = 300, private timeoutMs = 8000) {}
  update(text: string) { if (this.disposed || text === (this.latest ?? this.last)) return; this.latest = text; if (!this.running) void this.flush() }
  dispose() { this.disposed = true; this.latest = undefined }
  private async flush() {
    this.running = true
    while (!this.disposed && this.latest !== undefined) {
      const next = this.latest; this.latest = undefined
      try { await deadline(this.write(next), this.timeoutMs); this.last = next } catch (error) { if (error instanceof DOMException && error.name === 'TimeoutError') this.dispose(); this.failed(error) }
      await new Promise(resolve => setTimeout(resolve, this.interval))
    }
    this.running = false
  }
}
