# Beast G2

An early Even Realities G2 voice client for a self-hosted Beast service: glasses microphone → Whisper → chat model → glasses display. TypeScript/Vite frontend, a small dependency-free Node gateway, and a clearly marked local demo.

**Status:** cloud-reviewed development build; see [verification and pending browser checks](docs/CLOUD-VERIFICATION.md). Live Beast API compatibility, real glasses capture, lock-screen survival and deployment are not yet verified. See [design](docs/ANALYSIS.md) and [cloud handoff](docs/HANDOFF.md).

## Run locally

Node 20.18+ (or a current supported Node LTS), npm:

```sh
npm ci
npm test
npm run build
npm run gateway:demo
# In another terminal:
npm run dev
```

Open http://localhost:5173, select **Use local demo**, **Test gateway**, then ask a text question. The demo token is `local-demo-token-only`; demo mode binds to loopback and makes no provider calls. No microphone from the computer or phone is used. Without G2, the text path remains usable.

## Live gateway

Copy `.env.example` to `.env` and fill in the exact provider endpoints, provider key and a random gateway token of at least 16 characters. Set `ALLOWED_ORIGINS` to the actual client origins. Run `npm run gateway`. Defaults assume OpenAI-compatible multipart transcriptions and streaming chat completions; these assumptions must be confirmed against your Beast deployment. Model defaults are `whisper-live` and `beast/big`.

Do not put credentials in source files, frontend `VITE_*` variables, the manifest or the `.ehpk`. The phone receives only a gateway token entered at runtime; the frontend keeps it in memory and saves only gateway origin and language as preferences. The gateway does not persist recordings or conversations. Use HTTPS for deployment; no deployment has been created.

For a phone dev test, explicitly bind the live gateway with `HOST=0.0.0.0`, allow the Vite LAN origin, and use the Mac's LAN address in the phone settings. Loopback on the phone points to the phone, not your Mac. The Mac must remain on for this local setup. A deployed gateway removes that dependency.

## G2

SDK 0.0.16 requires Even App 2.2.10+. Start the local server, run `npm run qr -- http://<Mac-LAN-IP>:5173`, and scan through Even developer preview. **Nonproduction manifest:** the whitelist is an example, not a working gateway. For a packaged build replace the placeholder `https://gateway.example.com` network whitelist entry in `app.json` with your real gateway origin before `npm run pack`.

Tap starts recording; tap again sends, with a 30-second recording limit. Double tap cancels. Swipes page the answer. The phone offers full transcript/answer, text input, connection test, context reset and system-confirmed exit. Only the G2 microphone is requested. Long-press remains deferred. Experimental continuous G2 listening is available as an opt-in mode; see [continuous mode, controls, policies and demo](docs/CONTINUOUS.md).

`npm run simulate` starts the installed official simulator with automation port 9899. Simulator results cannot establish real audio/BLE/permissions/background behavior. Private builds can be installed from the phone; use a beta build with active tester membership for launch from the glasses menu and lock-screen testing.

## Layout

- `src/audio.ts`: bounded PCM capture and canonical WAV encoding
- `src/vad.ts`: bounded frame-based VAD, pre-roll and WAV segmentation
- `src/continuous.ts`: opt-in automatic question pipeline, bounded queue and stable reading
- `src/continuous-demo.ts`: explicit synthetic audio demo without devices or network
- `src/controller.ts`: recording/inference state and cancellation
- `src/even.ts`: SDK bridge, G2 mic and gestures
- `src/api.ts`: gateway client and NDJSON stream handling
- `src/display.ts`: pagination and coalesced serial display writes
- `server/gateway.mjs`: authenticated CORS gateway, WAV validation, Whisper multipart and chat SSE normalization
- `tests/`: audio, cancellation, display and gateway contract tests

The gateway buffers one utterance and uses REST for speech. It does not infer realtime support from the name `whisper-live`. Answer streaming is required by the initial chat adapter. Remote inference cancellation depends on provider behavior.

Personal hosting instructions: [deployment](docs/DEPLOYMENT.md). No production services have been created.
