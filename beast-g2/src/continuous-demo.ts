import { ContinuousController } from './continuous'
import type { AssistantPort } from './controller'
/** Explicit synthetic audio, never phone/computer capture. Also used by deterministic smoke tests. */
export function pcmFrame(speech: boolean) {
  const bytes = new Uint8Array(640), view = new DataView(bytes.buffer)
  for (let i = 0; i < 320; i++) view.setInt16(i * 2, speech ? (i % 2 ? 2200 : -2200) : 0, true)
  return bytes
}
export function simulateUtterance(controller: ContinuousController) {
  for (let i = 0; i < 15; i++) controller.onPcm(pcmFrame(false))
  for (let i = 0; i < 30; i++) controller.onPcm(pcmFrame(true))
  for (let i = 0; i < 35; i++) controller.onPcm(pcmFrame(false))
}
export function createContinuousDemo(changed: () => void) {
  let index = 0
  const transcripts = ['Dneska je pěkné počasí.', 'Jak funguje Beast G2?', 'Jak funguje Beast G2?', 'Kdo ví, že jo?', 'Co znamená průběžný poslech?']
  const api: AssistantPort = {
    async transcribe(_wav, signal) { signal.throwIfAborted(); return transcripts[index++ % transcripts.length] },
    async chat(text, _history, signal, delta) {
      signal.throwIfAborted(); delta(`[SIMULATED] ${text} `)
      await Promise.resolve(); signal.throwIfAborted(); delta('Toto je demo průběžného poslechu bez mikrofonu a bez Beast volání.')
    }
  }
  return new ContinuousController({ async start() {}, async stop() {} }, api, changed)
}
