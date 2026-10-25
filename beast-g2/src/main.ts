import { diagnostics, errorCode } from './diagnostics'
import './style.css'
import { BeastClient, beastUrl } from './beast'
import { gatewayUrl, GatewayClient, type Settings } from './api'
import { AssistantController, type AudioPort } from './controller'
import { hud, continuousHud, LatestDisplay } from './display'
import { ContinuousController } from './continuous'
import { createContinuousDemo, simulateUtterance } from './continuous-demo'
import { connectEven } from './even'

const root = document.querySelector<HTMLDivElement>('#app')!
root.innerHTML = `<header><span>BEAST / G2</span><span class="tag">DEVICE TEST · 0.3</span></header>
<main><section><p class="eyebrow">YOUR VOICE. YOUR BEAST.</p><h1>A question away.</h1><p>Ask from your glasses. Read the answer in your eyeline.</p>
<div class="lens"><pre id="hud" aria-live="polite"></pre></div><p id="bridge" role="status">Connecting to Even G2…</p>
<div class="actions"><button id="record">Start question</button><button id="cancel" class="secondary">Cancel</button><button id="previous" aria-label="Previous answer page" class="secondary">↑</button><button id="next" aria-label="Next answer page" class="secondary">↓</button></div>
<p class="hint">G2: tap to record, tap again to send · double tap to cancel · swipe to read</p>
<section aria-label="Listening mode"><label for="mode">Listening mode</label><select id="mode"><option value="manual">Manual · tap to ask</option><option value="continuous">Continuous G2 · live transcript + hints</option><option value="simulation">Continuous demo · synthetic PCM, no microphone</option></select><div class="actions"><button id="listen">Resume listening</button><button id="pause" class="secondary">Pause listening</button><button id="inject" class="secondary">Simulate speech segment</button></div><p id="listening" role="status"></p><p class="hint">Live transcript appears while speaking. After 2 seconds of silence, the final transcript goes to Beast. Hints appear automatically for 10 seconds each, then disappear. Keep each utterance under 30 seconds. Tap pauses/resumes; double tap cancels.</p></section><form id="ask"><label for="question">Text question · also works without glasses</label><div class="row"><input id="question" maxlength="4000" placeholder="Co umí Beast G2?" required><button>Ask Beast</button></div></form>
<div class="detail"><h2>Transcript</h2><p id="transcript">Your spoken question will appear here.</p><h2>Answer</h2><p id="answer">Waiting for your first question.</p><p id="error" role="alert"></p></div></section>
<aside><h2>Connection</h2><p>Choose direct Beast API or your own gateway. Credentials stay in memory for this session.</p><form id="settings"><label for="transport">API connection</label><select id="transport"><option value="direct">Direct Beast API</option><option value="gateway">Custom gateway</option></select><label for="gateway">API base URL / gateway origin</label><input id="gateway" type="url" required placeholder="https://your-gateway.example.com"><label for="token">API key / gateway token</label><input id="token" type="password" autocomplete="off" required placeholder="Kept in memory for this session"><label for="chat-model">Chat model</label><input id="chat-model" value="beast/big" required><label for="stt-model">Speech model</label><input id="stt-model" value="whisper-live" required><label for="language">Speech language</label><select id="language"><option value="cs">Čeština</option><option value="en">English</option><option value="auto">Automatic</option></select><button>Apply connection</button></form><div class="actions"><button id="health" class="secondary">Test connection</button><button id="demo" class="secondary">Use local demo</button></div><p id="connection" role="status">Not tested</p><button id="clear" class="secondary">Clear conversation context</button><button id="exit" class="secondary">Exit on glasses</button><p class="hint">Demo uses a loopback gateway and simulated answers. It makes no Beast requests. Real G2 audio and Beast compatibility still require device testing.</p></aside></main>`
const element = <T extends HTMLElement>(id: string) => document.getElementById(id) as T
const transport = element<HTMLSelectElement>('transport'), chatModel = element<HTMLInputElement>('chat-model'), sttModel = element<HTMLInputElement>('stt-model')
const gateway = element<HTMLInputElement>('gateway'), token = element<HTMLInputElement>('token'), language = element<HTMLSelectElement>('language')
let preferences: Partial<Settings> = {}
try { preferences = JSON.parse(localStorage.getItem('beast-g2-settings') || '{}') } catch { /* First run or unavailable storage. */ }
gateway.value = typeof preferences.gateway === 'string' ? preferences.gateway : (import.meta.env.VITE_BEAST_URL || 'https://beast.example.com/v1')
transport.value = preferences.transport === 'gateway' ? 'gateway' : 'direct'
chatModel.value = preferences.chatModel || 'beast/big'; sttModel.value = preferences.sttModel || 'whisper-live'
language.value = ['cs', 'en', 'auto'].includes(preferences.language || '') ? preferences.language! : 'cs'
let settings: Settings = { gateway: gateway.value, token: '', language: language.value as Settings['language'], transport: transport.value as Settings['transport'], chatModel: chatModel.value.trim(), sttModel: sttModel.value.trim() }
const gatewayApi = new GatewayClient(() => settings), beastApi = new BeastClient(() => settings)
const currentApi = () => settings.transport === 'direct' ? beastApi : gatewayApi
const api = { health: () => currentApi().health(), transcribe: (...args: Parameters<GatewayClient['transcribe']>) => currentApi().transcribe(...args), chat: (...args: Parameters<GatewayClient['chat']>) => currentApi().chat(...args) }
let port: AudioPort = { async start() { throw new Error('G2 microphone not connected. Use a text question to test the gateway.') }, async stop() {} }
const measuredAudio: AudioPort = {
  async start() { const trace = diagnostics.span('mic'); try { await port.start(); trace.end('info', { phase: 'on' }) } catch (error) { trace.end('error', { code: errorCode(error) }); throw error } },
  async stop() { const trace = diagnostics.span('mic'); try { await port.stop(); trace.end('info', { phase: 'off' }) } catch (error) { trace.end('error', { phase: 'unknown' }); throw error } }
}
let display: LatestDisplay | undefined, page = 0
let pageClosed = false
let even: Awaited<ReturnType<typeof connectEven>> | undefined
let mode: 'manual' | 'continuous' | 'simulation' = 'manual'
let switchingMode = false
const continuous = new ContinuousController(measuredAudio, api, paint)
const simulation = createContinuousDemo(paint)
const activeContinuous = () => mode === 'simulation' ? simulation : continuous
const controller = new AssistantController(measuredAudio, api, paint)
let lastDiagnosticState = ''
function paint() {
  const state = mode === 'manual' ? controller.state : activeContinuous().viewState(), view = hud(state, page); page = Math.min(page, view.count - 1)
  const listening = activeContinuous().state
  const status = mode === 'manual' ? 'Manual mode · microphone starts on tap.' : `${mode === 'simulation' ? 'SIMULATED MIC' : 'G2 MIC'}: ${listening.microphone.toUpperCase()} · ${listening.phase} · queue ${listening.queued}/2 · dropped ${listening.dropped} · skipped ${listening.ignored} · unread ${listening.unread}/3 · replies dropped ${listening.repliesDropped}. ${listening.notice}`
  const diagnosticState = `${mode}:${state.phase}:${listening.phase}:${listening.microphone}:${listening.queued}:${listening.dropped}:${listening.ignored}:${Boolean(state.error)}`
  if (diagnosticState !== lastDiagnosticState) { lastDiagnosticState = diagnosticState; diagnostics.record(mode === 'manual' ? 'app' : 'continuous', 'state.changed', { phase: mode === 'manual' ? state.phase : listening.phase, queued: listening.queued, dropped: listening.dropped, ignored: listening.ignored }, state.error ? 'error' : 'info') }
  element('listening').textContent = status
  const displayText = mode === 'manual' ? view.text : continuousHud(listening)
  element('previous').hidden = element('next').hidden = mode !== 'manual'
  element('hud').textContent = displayText; display?.update(displayText)
  element('transcript').textContent = state.transcript || 'Your spoken question will appear here.'
  element('answer').textContent = state.answer || 'Waiting for your first question.'
  element('error').textContent = state.error
  const busy = switchingMode || (mode === 'manual' ? ['starting', 'recording', 'transcribing', 'answering'].includes(state.phase) : !['paused', 'interrupted', 'error'].includes(listening.phase) || listening.microphone !== 'off')
  element<HTMLButtonElement>('listen').disabled = mode === 'manual' || busy
  element<HTMLButtonElement>('pause').disabled = mode === 'manual' || switchingMode
  element<HTMLButtonElement>('inject').disabled = mode !== 'simulation' || listening.microphone !== 'on'
  element<HTMLButtonElement>('record').textContent = state.phase === 'recording' ? `Send question · ${state.seconds}s` : 'Start question'
  element<HTMLButtonElement>('record').disabled = mode !== 'manual' || switchingMode || ['starting', 'transcribing', 'answering'].includes(state.phase)
  element<HTMLButtonElement>('health').disabled = busy
  for (const control of element<HTMLFormElement>('settings').querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLButtonElement>('input, select, button')) control.disabled = busy
  element<HTMLButtonElement>('demo').disabled = busy
  element<HTMLInputElement>('question').disabled = busy || mode !== 'manual'
  element<HTMLSelectElement>('mode').disabled = switchingMode
}
function apply() {
  if (transport.value === 'direct') beastUrl(gateway.value.trim(), 'models'); else gatewayUrl(gateway.value.trim(), '/api/health')
  settings = { gateway: gateway.value.trim(), token: token.value.trim(), language: language.value as Settings['language'], transport: transport.value as Settings['transport'], chatModel: chatModel.value.trim(), sttModel: sttModel.value.trim() }
  try { localStorage.setItem('beast-g2-settings', JSON.stringify({ gateway: settings.gateway, language: settings.language, transport: settings.transport, chatModel: settings.chatModel, sttModel: settings.sttModel })) } catch { /* Optional preferences only. */ }
  element('connection').textContent = 'Connection applied. Test it before recording.'
}
element('settings').addEventListener('submit', event => { event.preventDefault(); try { apply() } catch (error) { element('connection').textContent = String(error) } })
element('demo').addEventListener('click', () => { transport.value = 'gateway'; gateway.value = 'http://127.0.0.1:8787'; token.value = 'local-demo-token-only'; apply(); element('connection').textContent = 'Run npm run gateway:demo on this computer, then test. Demo answers are simulated.' })
element('health').addEventListener('click', async () => {
  if (['starting', 'recording', 'transcribing', 'answering'].includes(controller.state.phase)) return
  element('connection').textContent = 'Testing gateway…'
  try { apply(); const result = await api.health(); element('connection').textContent = `${result.mode.toUpperCase()} · chat: ${result.models.chat} · speech: ${result.models.stt}. ${result.mode !== 'demo' ? 'Gateway reachable; provider inference still needs a real question.' : 'Simulated answers only.'}` }
  catch (error) { element('connection').textContent = String(error) }
})
element('record').addEventListener('click', () => { page = 0; void controller.tap() })
const pauseAll = async (interrupted = false) => { await Promise.all([controller.cancel(interrupted), continuous.pause(interrupted), simulation.pause(interrupted)]) }
element('cancel').addEventListener('click', () => { void pauseAll() })
element('mode').addEventListener('change', async () => {
  switchingMode = true; paint()
  await pauseAll()
  if (continuous.state.microphone !== 'off') { element<HTMLSelectElement>('mode').value = mode; switchingMode = false; paint(); return }
  mode = element<HTMLSelectElement>('mode').value as typeof mode; page = 0; switchingMode = false; paint()
})
element('listen').addEventListener('click', () => { if (!switchingMode && mode !== 'manual') void activeContinuous().start() })
element('pause').addEventListener('click', () => { void activeContinuous().pause() })
element('inject').addEventListener('click', () => { if (mode === 'simulation') simulateUtterance(simulation) })
element('previous').addEventListener('click', () => { page = Math.max(0, page - 1); paint() })
element('next').addEventListener('click', () => { page++; paint() })
element('clear').addEventListener('click', () => { controller.clearHistory(); continuous.clearHistory(); simulation.clearHistory(); element('connection').textContent = 'Conversation context cleared.' })
element('exit').addEventListener('click', () => { if (even) void pauseAll().then(() => even!.exit()) })
element('ask').addEventListener('submit', event => { event.preventDefault(); page = 0; if (mode === 'manual') void controller.ask(element<HTMLInputElement>('question').value) })
// A persisted page keeps its SDK subscription and display for bfcache restoration.
window.addEventListener('pagehide', event => { void pauseAll(true); if (!event.persisted) { pageClosed = true; display?.dispose(); even?.dispose() } })
document.addEventListener('visibilitychange', () => { if (document.hidden) void pauseAll(true) })
let audioFrames = 0, audioBytes = 0, lastAudioLog = 0, audioEnergy = 0, audioSamples = 0, audioPeak = 0
diagnostics.record('sdk', 'bridge.waiting')
paint()
void connectEven(hud(controller.state, 0).text, action => {
  if (action === 'tap') { if (mode === 'manual') { page = 0; void controller.tap() } else if (activeContinuous().state.microphone === 'on') void activeContinuous().pause(); else void activeContinuous().start() }
  if (action === 'cancel') void pauseAll()
  if (action === 'interrupt') { void pauseAll(true); element('bridge').textContent = 'G2 session interrupted. Start a fresh recording after reconnecting.' }
  if (action === 'resume') { element('bridge').textContent = 'G2 resumed · tap to start a fresh question'; paint() }
  if (action === 'previous' && mode === 'manual') { page = Math.max(0, page - 1); paint() }
  if (action === 'next' && mode === 'manual') { page++; paint() }
}, pcm => { const samples = new DataView(pcm.buffer, pcm.byteOffset, pcm.byteLength); for (let i = 0; i + 1 < pcm.byteLength; i += 2) { const value = samples.getInt16(i, true); audioEnergy += value * value; audioSamples++; audioPeak = Math.max(audioPeak, Math.abs(value)) } audioFrames++; audioBytes += pcm.byteLength; if (Date.now() - lastAudioLog >= 1000) { diagnostics.record('audio', 'pcm.received', { frames: audioFrames, bytes: audioBytes, rms: audioSamples ? Math.sqrt(audioEnergy / audioSamples) : 0, peak: audioPeak }); lastAudioLog = Date.now(); audioFrames = audioBytes = audioEnergy = audioSamples = audioPeak = 0 } if (mode === 'manual') controller.onPcm(pcm); else if (mode === 'continuous') continuous.onPcm(pcm) }).then(connected => {
  if (pageClosed) { connected.dispose(); return }
  even = connected; port = connected.audio; diagnostics.record('sdk', 'bridge.connected')
  display = new LatestDisplay(async text => { const trace = diagnostics.span('display', { chars: text.length }); try { await connected.write(text); trace.end() } catch (error) { trace.end('error'); throw error } }, error => { element('bridge').textContent = `Display error: ${String(error)} Reopen the plugin to reconnect the display.` })
  element('bridge').textContent = 'Even bridge connected · microphone starts only on request'; paint()
}).catch(error => { diagnostics.record('sdk', 'bridge.failed', { code: errorCode(error) }, 'error'); element('bridge').textContent = `Browser preview · G2 unavailable: ${String(error)}` })

const panel = document.createElement('section')
panel.className = 'debug-panel'
panel.innerHTML = `<details><summary>Diagnostics · local metadata only</summary><p>No audio, transcript, answer, API key, URL or request headers are recorded. Network errors from a WebView may combine DNS, TLS and CORS failures; an export alone cannot separate them.</p><div class="actions"><button id="debug-export" class="secondary">Export diagnostic JSON</button><button id="debug-clear" class="secondary">Clear logs</button></div><p id="debug-count" role="status"></p><pre id="debug-events"></pre><textarea id="debug-json" hidden readonly aria-label="Diagnostic JSON fallback"></textarea></details>`
root.append(panel)
let debugTimer: ReturnType<typeof setTimeout> | undefined
function renderDiagnostics() {
  debugTimer = undefined
  const events = diagnostics.snapshot()
  element('debug-count').textContent = `${events.length}/400 events · in memory only`
  element('debug-events').textContent = events.slice(-30).map(e => `${e.at.slice(11,23)} ${e.level.toUpperCase()} ${e.stage} ${e.event} ${e.traceId || ''} ${JSON.stringify(e.details)}`).join('\n')
}
diagnostics.subscribe(() => { if (!debugTimer) debugTimer = setTimeout(renderDiagnostics, 500) })
element('debug-clear').addEventListener('click', () => diagnostics.clear())
element('debug-export').addEventListener('click', () => {
  const text = diagnostics.export(), fallback = element<HTMLTextAreaElement>('debug-json')
  fallback.hidden = false; fallback.value = text
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' })), link = document.createElement('a')
  link.href = url; link.download = `beast-g2-diagnostics-${Date.now()}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 10000)
})
window.addEventListener('error', () => diagnostics.record('app', 'runtime.error', { code: 'uncaught_error' }, 'error'))
window.addEventListener('unhandledrejection', () => diagnostics.record('app', 'runtime.rejection', { code: 'unhandled_rejection' }, 'error'))
document.addEventListener('visibilitychange', () => diagnostics.record('app', 'visibility.changed', { phase: document.hidden ? 'hidden' : 'visible' }))
diagnostics.record('app', 'session.started'); renderDiagnostics()
