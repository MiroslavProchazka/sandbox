# Continuous listening and automatic replies (experimental)

Implemented on `feat/beast-g2`, entirely in cloud. Manual tap-to-record remains the default. This feature produces **text replies on G2**, not spoken/TTS playback. There is no claim of feature parity with Aside or of continuous operation while the phone is locked.

## Controls

Select **Continuous G2**, select the reply filter, then **Resume listening**. The real mode requests only the SDK's glasses microphone. **Pause listening**, Cancel or double tap stop capture and abort current work; queued/partial audio is discarded. Single tap pauses/resumes continuous mode. A failed microphone shutdown is shown as **UNKNOWN**, and restart is blocked until a subsequent Pause succeeds.

The HUD and phone show microphone on/off/unknown and processing state separately: the microphone stays on while transcribing/answering. First completed reply appears automatically. Later completed replies occupy one replaceable latest-result slot; **Show latest answer**, or swipe next from the last page on G2, reveals the newest reply and resets pagination. Pending/dropped/skipped counts are visible on the phone. Incoming inference and deltas never replace an answer being read.

On page hide, visibility loss, SDK interruption or missing PCM for eight seconds, capture is interrupted and must be resumed explicitly. Received silence PCM counts as a healthy connection; lack of frames does not. No automatic background restart or audio replay occurs.

## Audio and inference limits

- Mono 16 kHz PCM16 is reconstructed into 20 ms frames across arbitrary/odd SDK packet boundaries.
- RMS threshold 600/32768, 300 ms pre-roll, 60 ms speech onset, minimum 300 ms voiced audio, 600 ms ending silence; configurable through Segmenter options. These values are defaults needing G2 calibration, not measurements of real hardware.
- Hard segment cap 12 seconds, canonical bounded WAV. A long utterance splits with a short retained pre-roll overlap. No real-time Whisper protocol is assumed; each segment is a separate multipart transcription using the configured gateway STT model (default `whisper-live`).
- One STT/chat pipeline at a time, at most two pending WAV segments. On overflow the oldest pending segment is dropped in favor of fresh speech. Pending segments older than 30 seconds are dropped. Active inference is allowed to finish when new speech arrives; it is aborted by Pause/Cancel/interruption, not by new speech.
- Client request budget remains 95 seconds per STT/chat call. Processing waits for a cancelled adapter to settle before starting another pipeline; remote inference cancellation is provider-dependent. New capture can resume, but a broken/noncooperative custom adapter may delay queued work.
- Six history turns, maximum 12,000 answer characters, one visible answer and one newest pending answer. Audio is not persisted. Queue limits bound memory, not API billing or accuracy.

## Question selection

Whisper receives **all VAD-selected speech segments** in continuous mode, including speech which may later be ignored. Only accepted question text is sent to chat.

The default deterministic Czech/English heuristic accepts likely question starts and Beast-addressed requests, rejecting a small list of obvious conversational/rhetorical phrases. **Only speech starting with Beast** is an optional stricter filter. This is not semantic intent detection, wake-word acoustics, diarization or speaker identification. It will miss some real questions and accept some ordinary/rhetorical speech. Simultaneous speakers arrive as one mono mix and cannot be separated by this VAD.

Duplicate accepted questions are normalized for case, punctuation and diacritics and suppressed for 90 seconds in a bounded 64-entry cache. Substantial overlap variants (at least six unique words, Jaccard >= 0.85) are also suppressed. Failed/cancelled answers can be retried; no automatic network retry occurs. Clear conversation context also clears the duplicate cache. Repeating deliberately within the TTL requires clearing it or waiting.

## Demo without devices, keys or network

```sh
npm run demo:continuous
```

Runs the same PCM segmenter/controller with synthetic silence/speech and scripted transcripts: ordinary statement → question → duplicate → rhetorical phrase → new question. It verifies skip/dedup/first-answer/latest-answer behavior and ends paused.

In the phone/browser UI select **Continuous demo**, Resume, then **Simulate speech segment** five times. It uses the same synthetic PCM path and no microphone or provider calls; labels explicitly say SIMULATED/DEMO. Inject before the missing-PCM watchdog fires or Resume again. The selected reply filter also applies to the demo.

Tests additionally exercise the actual loopback HTTP demo gateway with synthetic continuous PCM, its WAV transcription endpoint and streamed chat. This establishes protocol/controller integration, not rendered browser UI or real speech recognition quality.

## Evidence and pending gates

Deterministic tests cover silence/noise, fixed/odd packet boundaries, bounded long speech, question filters, repeat/overlap suppression, slow API, pending overflow/staleness, speech during chat, pause/resume, stale inference/start completion, lost PCM, shutdown failure and failed-answer retry. Run `npm test`, `npm run demo:continuous`, `npm run pack`.

Actual Beast endpoints/models, microphone quality/thresholds, BLE, Czech font, latency, battery, Android lock-screen/background behavior and rendered mobile interaction remain unverified. The existing cloud browser cannot reach the development container's loopback network. See CLOUD-VERIFICATION.md. The manifest still uses an explicitly nonproduction example origin. Nothing was merged or deployed and no paid resource was created.
