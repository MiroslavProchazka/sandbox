import './style.css'
import { GatewayClient, type Settings } from './api'
import { AssistantController, type AudioPort } from './controller'
import { hud, LatestDisplay } from './display'
import { connectEven } from './even'

const root = document.querySelector<HTMLDivElement>('#app')!
root.innerHTML = `<header><span>BEAST / G2</span><span class="tag">DEVELOPMENT · 0.1</span></header>
<main><section><p class="eyebrow">YOUR VOICE. YOUR BEAST.</p><h1>A question away.</h1><p>Ask from your glasses. Read the answer in your eyeline.</p>
<div class="lens"><pre id="hud" aria-live="polite"></pre></div><p id="bridge" role="status">Connecting to Even G2…</p>
<div class="actions"><button id="record">Start question</button><button id="cancel" class="secondary">Cancel</button><button id="previous" class="secondary">↑</button><button id="next" class="secondary">↓</button></div>
<p class="hint">G2: tap to record, tap again to send · double tap to cancel · swipe to read</p>
<form id="ask"><label for="question">Text question · also works without glasses</label><div class="row"><input id="question" maxlength="4000" placeholder="Co umí Beast G2?" required><button>Ask Beast</button></div></form>
<div class="detail"><h2>Transcript</h2><p id="transcript">Your spoken question will appear here.</p><h2>Answer</h2><p id="answer">Waiting for your first question.</p><p id="error" role="alert"></p></div></section>
<aside><h2>Connection</h2><p>This build uses your own gateway. Provider keys stay on its server.</p><form id="settings"><label for="gateway">Gateway origin</label><input id="gateway" type="url" required placeholder="https://your-gateway.example.com"><label for="token">Gateway token</label><input id="token" type="password" autocomplete="off" required placeholder="Kept in memory for this session"><label for="language">Speech language</label><select id="language"><option value="cs">Čeština</option><option value="en">English</option><option value="auto">Automatic</option></select><button>Apply connection</button></form><div class="actions"><button id="health" class="secondary">Test gateway</button><button id="demo" class="secondary">Use local demo</button></div><p id="connection" role="status">Not tested</p><button id="clear" class="secondary">Clear conversation context</button><button id="exit" class="secondary">Exit on glasses</button><p class="hint">Demo uses a loopback gateway and simulated answers. It makes no Beast requests. Real G2 audio and Beast compatibility still require device testing.</p></aside></main>`
const element = <T extends HTMLElement>(id: string) => document.getElementById(id) as T
const gateway = element<HTMLInputElement>('gateway'), token = element<HTMLInputElement>('token'), language = element<HTMLSelectElement>('language')
let preferences: Partial<Settings> = {}
try { preferences = JSON.parse(localStorage.getItem('beast-g2-settings') || '{}') } catch { /* First run or unavailable storage. */ }
gateway.value = typeof preferences.gateway === 'string' ? preferences.gateway : 'http://127.0.0.1:8787'
language.value = ['cs', 'en', 'auto'].includes(preferences.language || '') ? preferences.language! : 'cs'
let settings: Settings = { gateway: gateway.value, token: '', language: language.value as Settings['language'] }
const api = new GatewayClient(() => settings)
let port: AudioPort = { async start() { throw new Error('G2 microphone not connected. Use a text question to test the gateway.') }, async stop() {} }
let display: LatestDisplay | undefined, page = 0
let even: Awaited<ReturnType<typeof connectEven>> | undefined
const controller = new AssistantController({ start: () => port.start(), stop: () => port.stop() }, api, paint)
function paint() {
  const state = controller.state, view = hud(state, page); page = Math.min(page, view.count - 1)
  element('hud').textContent = view.text; display?.update(view.text)
  element('transcript').textContent = state.transcript || 'Your spoken question will appear here.'
  element('answer').textContent = state.answer || 'Waiting for your first question.'
  element('error').textContent = state.error
  const busy = ['starting', 'recording', 'transcribing', 'answering'].includes(state.phase)
  element<HTMLButtonElement>('record').textContent = state.phase === 'recording' ? `Send question · ${state.seconds}s` : 'Start question'
  element<HTMLButtonElement>('record').disabled = ['starting', 'transcribing', 'answering'].includes(state.phase)
  for (const control of element<HTMLFormElement>('settings').querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLButtonElement>('input, select, button')) control.disabled = busy
  element<HTMLButtonElement>('demo').disabled = busy
  element<HTMLInputElement>('question').disabled = busy
}
function apply() {
  settings = { gateway: gateway.value.trim(), token: token.value.trim(), language: language.value as Settings['language'] }
  try { localStorage.setItem('beast-g2-settings', JSON.stringify({ gateway: settings.gateway, language: settings.language })) } catch { /* Optional preferences only. */ }
  element('connection').textContent = 'Connection applied. Test it before recording.'
}
element('settings').addEventListener('submit', event => { event.preventDefault(); apply() })
element('demo').addEventListener('click', () => { gateway.value = 'http://127.0.0.1:8787'; token.value = 'local-demo-token-only'; apply(); element('connection').textContent = 'Run npm run gateway:demo on this computer, then test. Demo answers are simulated.' })
element('health').addEventListener('click', async () => {
  apply(); element('connection').textContent = 'Testing gateway…'
  try { const result = await api.health(); element('connection').textContent = `${result.mode.toUpperCase()} · chat: ${result.models.chat} · speech: ${result.models.stt}. ${result.mode === 'live' ? 'Gateway reachable; provider inference still needs a real question.' : 'Simulated answers only.'}` }
  catch (error) { element('connection').textContent = String(error) }
})
element('record').addEventListener('click', () => { page = 0; void controller.tap() })
element('cancel').addEventListener('click', () => { void controller.cancel() })
element('previous').addEventListener('click', () => { page = Math.max(0, page - 1); paint() })
element('next').addEventListener('click', () => { page++; paint() })
element('clear').addEventListener('click', () => { controller.clearHistory(); element('connection').textContent = 'Conversation context cleared.' })
element('exit').addEventListener('click', () => { if (even) void controller.cancel().then(() => even!.exit()) })
element('ask').addEventListener('submit', event => { event.preventDefault(); page = 0; void controller.ask(element<HTMLInputElement>('question').value) })
window.addEventListener('pagehide', () => { void controller.cancel(true); display?.dispose(); even?.dispose() })
paint()
void connectEven(hud(controller.state, 0).text, action => {
  if (action === 'tap') { page = 0; void controller.tap() }
  if (action === 'cancel') void controller.cancel()
  if (action === 'interrupt') { void controller.cancel(true); element('bridge').textContent = 'G2 session interrupted. Start a fresh recording after reconnecting.' }
  if (action === 'resume') { element('bridge').textContent = 'G2 resumed · tap to start a fresh question'; paint() }
  if (action === 'previous') { page = Math.max(0, page - 1); paint() }
  if (action === 'next') { page++; paint() }
}, pcm => controller.onPcm(pcm)).then(connected => {
  even = connected; port = connected.audio
  display = new LatestDisplay(connected.write, error => { element('bridge').textContent = `Display error: ${String(error)}` })
  element('bridge').textContent = 'Even bridge connected · microphone starts only on request'; paint()
}).catch(error => { element('bridge').textContent = `Browser preview · G2 unavailable: ${String(error)}` })
