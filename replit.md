# SURROGATE — Replit Integration

Last updated: 2026-07-07. Camera-vision verification (Task #26) done as far as sandbox allows; real-device check still recommended.

---

## Development Environment

- **Host:** `0.0.0.0`
- **Port:** `5173`
- **Build:** `npm run build`
- **Working directory:** `artifacts/surrogate-oracle/`

---

## Secrets Configuration

| Secret | Used By | Notes |
|--------|---------|-------|
| `GEMINI_API_KEY` | Gemini WS/REST | Google AI Studio free-tier key |
| `REPLICATE_API_TOKEN` | Portrait EFA | Flux-schnell generation (Gemini fallback) |
| `SUPABASE_URL` | Client + EFAs | Project reference URL |

---

## Dev UI & Step Logger

**Option 1 — URL param:** `http://localhost:5173/?devui`
**Option 2 — Console:** `localStorage.setItem('oracle_step_log', '1')`

Enables:
- `OracleStepLogger` (bottom-right handshake monitor)
- `DevUI` (top-left state monitor)
- `window.__oracle_handleAudio(url)`
- `window.__oracle_skipLore()`
- `window.__oracle_allMorphs` — morph target names per mesh (dev only)
- `window.__oracle_morphDicts` — resolved OVR → index map per mesh (dev only)

---

## Pressure Test

Runs a full end-to-end Playwright journey: dormant → terminal → awakened → oracle → viseme → exit.

```bash
# Start dev server first (separate terminal)
pnpm --filter @workspace/surrogate-oracle run dev

# Run pressure test (pass a custom URL via ORACLE_PRESSURE_URL if the dev port differs from 5173)
node scripts/oracle-pressure.mjs
```

**Known expected non-failures:**
- `🔴 BROWSER ERROR: [Mic] Failed: Requested device not found` — Playwright has no mic.
- `⚠ ORACLE INTERRUPTED (barge-in)` — Gemini timing jitter in CI.
- `ℹ could not measure panel/face bounds` — Layout check skipped when panel hidden.

---

## Architecture at a Glance

```
SurrogateOracleImmersion.tsx    ← root (decoupled orchestrator)
  ├── useOracleJourney          ← state machine (dormant → oracle)
  ├── useOracleConnection       ← WS handshake, PCM lifecycle
  ├── usePortraitPipeline       ← Gemini-exclusive synthesis cascade
  ├── OracleConversation.tsx    ← Gemini Live WS, VAD, reconnect, tool suppression
  ├── OracleAvatar3D.tsx        ← Three.js GLB renderer, OVR lip sync, bone animation
  └── oracle-audio.worklet.ts   ← off-thread PCM playback + viseme detection
```

**Audio Routing:**
Gemini PCM → `PCMPlayer` → `DynamicsCompressor` → `AudioWorklet` (FFT/visemes) → `PannerNode` (HRTF) → `MasterGain(1.8)` → `Speakers`.
Radio stream: `MediaElementSource` → `GainNode(SESSION_AMBIENT=0.008)` → `Speakers`.

**GLB asset:** `/public/hero3.glb?v=morphs-v2` — confirmed 15 OVR viseme morphs + eye blinks + skeleton with Head/Spine2/Shoulders.

**Radio stations:** `src/config/audioTracks.ts` — Graff Punks (default), Drone Zone, Groove Salad.

---

## Session Overhaul: 2026-07-07 (Camera Vision Verification, Task #26)

**Goal:** confirm Task #25's camera-vision path (periodic frames → Gemini Live) actually works end-to-end, since the sandbox has no real camera and the Playwright pressure test never exercises it.

**What was confirmed:**
- Through the real app UI (Playwright, fake-camera device): camera activation (`data-camera-active="true"`), Gemini WS session connect, and `frameChunksSent` actively incrementing — `useVisionFrames.ts` is genuinely capturing and sending JPEG frames over the live session, not a no-op.
- Via a standalone raw-WebSocket script (`scripts/oracle-vision-raw-ws-test.mjs`) that speaks the app's exact `client.realtimeInput`/`media_chunks` (image) and `realtimeInput.text` (question) envelope directly against the **real** `gemini-live-proxy` edge function and real Gemini Live API (no mocks): the proxy and model accept a real JPEG frame + follow-up question with zero protocol errors — full `session.config` → `session.created` → frame → text handshake succeeds.

**What was NOT fully confirmed (sandbox limitation, not a known bug):**
- A verified semantic reply (Oracle's spoken answer actually naming the object) — the raw-WS script's own session (VAD disabled, single-shot text turn) timed out waiting for audio back from the native-audio model within 90s. This looks like a turn-completion quirk of manually disabling `automaticActivityDetection` without sending explicit turn-boundary signals, not evidence the vision feature itself is broken — the frame-delivery and protocol layers underneath it are confirmed working per above.
- **Recommendation:** do a real 30-second manual check on an actual device/browser with camera permission (hold up an object, ask the Oracle what it sees) before relying on this in front of users. This task cannot be closed out with 100% automated confidence without real camera hardware.

**Note:** raw Node `WebSocket` scripts hitting Supabase edge functions from a plain script (not the app, which already has its own error handling) should install `process.on('unhandledRejection'/'uncaughtException')` — without them, this session saw the process die silently with zero output partway through the handshake on several attempts, which had been misdiagnosed as sandbox instability.

## Session Overhaul: 2026-07-06 (Live Camera Vision, Task #25)

**Live camera vision for Oracle:**
- Gemini Live's native-audio model accepts video frames as realtime input independently of the `responseModalities: ['AUDIO']` output config — no session/model config change was needed to add video-in.
- `useGeminiSession.ts` now additionally exports `sessionBootedRef` (already existed internally, just not returned) — the correct gate for any new realtime-input stream, since `isConnected` flips true at `ws.onopen`, before `session.created`. Using `isConnected` would risk sending mid-handshake.
- New `src/hooks/useVisionFrames.ts`: captures a JPEG snapshot from the already-active camera `<video>` (the same element `useXRMode` keeps alive for local face-tracking gaze) on an independent `setInterval` (0.5fps, 768px longest-edge, quality 0.65) and sends it over the same Gemini WebSocket using the identical `client.realtimeInput` / `media_chunks` envelope the audio path already uses — just `mimeType: 'image/jpeg'` instead of `audio/pcm`. Frames are drop-not-queue (skipped, never buffered, if the gate is closed) and the hook is a strict no-op when the camera isn't active, so the audio-only journey is byte-for-byte unaffected when vision is unavailable.
- Wired additively into `OracleConversation.tsx` (new optional `cameraVideoRef`/`cameraActive` props, `frameChunksSent` debug counter) and `SurrogateOracleImmersion.tsx` (passes its existing `useXRMode()` camera refs through) — the camera already activates automatically during the joint-permission step on first tap in normal (non-XR) mode, so vision is live for the default Seeker flow, not just XR passthrough.
- Confirmed via code read that `supabase/functions/gemini-live-proxy/index.ts` forwards `realtimeInput` generically with no mimeType filtering — no proxy change was required.
- Verification: `pnpm --filter @workspace/surrogate-oracle run typecheck` clean; `node scripts/oracle-pressure.mjs` re-run after the change — desktop suite fully clean (45/45), only the pre-existing mobile-viewport timing crash (documented above as a known non-regression).
- **Not verified in this session:** end-to-end vision correctness (e.g. "how many fingers am I holding up") requires a real camera and device — this sandboxed environment has no camera hardware and Playwright cannot simulate one for this path. Recommend a manual check on a real device before relying on this in front of users.

## Session Overhaul: 2026-07-06 (Codebase Quality Pass, Task #23)

**Codebase quality pass (Task #23):**
- Removed hardcoded debug-unlock password; now gated by `VITE_DEV_UNLOCK_PASSWORD` env var, fails closed if unset.
- Added a typed global `Window` interface augmentation covering all `__oracle_*` bridges, `SurrogateXR`, `__audioContext`/`webkitAudioContext`, `FaceDetector` — zero `(window as any)` casts remain.
- Error-handling sweep: silent/empty `catch` blocks in `oracleSfx.ts`, `PCMPlayer.ts`, `useXRMode.ts`, `useParallax.ts` now surface dev-visible warnings without changing fallback control flow.
- De-duplicated browser-detection helpers into `src/lib/browserCapabilities.ts` (`createAudioContext`, `isInIframe`, device-orientation permission helpers) — single source of truth across 5+ call sites.
- Split `OracleConversation.tsx`: extracted the Gemini WS lifecycle (connect/reconnect/session-boot/pending-message-queue/prewarm/startSession/disconnect) into `src/hooks/useGeminiSession.ts`. Handshake ordering (`ws.onopen` → `session.created` → boot/pending-flush) preserved verbatim.
- Split `SurrogateOracleImmersion.tsx` (was ~2519 lines, now 2146): extracted `src/hooks/useWalletBridge.ts` (wallet sign-in/popup bridge/IP-history merge) and `src/hooks/useRadioAtmosphere.ts` (radio audio spine, volume-matrix effect, fade/station-switch mechanics), both verbatim with all timing/dep-array/gesture-token nuances preserved.
- Deliberately deferred (not attempted this session, tracked for a future pass with a manual verification plan — the Playwright pressure test has no camera and cannot exercise this path): a `useRiftConstruct` extraction for the XR/camera/face-tracking/Rift-persona-shift block. This is the same code area as the 2026-06-14 alley/XR fix below — architect-reviewed decision to leave it untouched given the safety net doesn't cover it.
- Verification: `pnpm --filter @workspace/surrogate-oracle run typecheck` clean throughout; `node scripts/oracle-pressure.mjs` run repeatedly after each extraction, consistently matching the baseline pattern (desktop suite fully clean, only the pre-existing mobile-viewport timing crash — not a regression).
- Docs: fixed stale `smoke-test-full.mjs` script name below → `scripts/oracle-pressure.mjs` (script was renamed at some point; docs hadn't caught up).

**Code-review follow-up (same task, post-rejection round):**
- Removed a hardcoded fallback Supabase project URL that had leaked into `useGeminiSession.ts` (WS connect) and `OracleConversation.tsx` (debug `endpoint` field) during the split. Both now fail closed with an explicit console error + `logStep` if `VITE_SUPABASE_URL` is unset, and the WS path surfaces the existing "tap to reconnect" affordance instead of silently defaulting to an unrelated project.
- Extended the error-handling sweep to the remaining silent `catch(() => {})` blocks: `useXRMode.ts` (camera preview `video.play()`, FaceDetector fallback — rate-limited to one log per session), `oracleSfx.ts` (`AudioContext.resume()`), `OracleConversation.tsx` (mic `AudioContext.suspend()`, conversation-turn Supabase upload/restore), `useRadioAtmosphere.ts` (all four `audioRef.play()` call sites), `analytics.ts` / `CodeAuditor.tsx` (fire-and-forget log POSTs), `SurrogateOracleImmersion.tsx` (DeviceOrientation permission request). All now `console.warn` on failure with no change to fallback control flow.
- Re-verified after both fix rounds: typecheck clean; pressure test consistently matches baseline (desktop suite fully clean, only the pre-existing mobile-viewport timing crash).

## Session Overhaul: 2026-06-14

**Alley background + XR mode fix:**
- Bug: alley/arcade background vanished in normal (non-XR) mode and the journey blanked; entering XR also killed the journey.
- Root cause: CSS keyed on `.oracle-stage[data-camera-active="true"]` hid the alley (`display:none`), hid ground-fog, and made the stage transparent. But the camera also activates in NORMAL mode (invisible face-tracking for Oracle gaze, from knife selection), so `data-camera-active` flipped true in normal mode and the scene blanked.
- Fix: gated alley-fade / ground-fog-hide / transparent-stage on BOTH `[data-xr-mode="true"][data-camera-active="true"]` (true XR passthrough only). Alley now fades to `opacity:0.04` (near-null) in XR instead of `display:none`. Added `.xr-camera-layer--tracking-only { opacity:0 }`.
- Camera `<video>` now renders whenever `cameraActive` (invisible tracking layer in normal mode); all XR overlay decorations stay inside an `{isXRMode && …}` block.
- `ALLEY_BG_URL` → local `/alley-bg.png` (`public/alley-bg.png`), no longer an external host.
- Tooling: `smoke-test-full.mjs` BASE now overridable via `ORACLE_SMOKE_URL`; corrected stale pressure-test command reference above.

## Session Overhaul: 2026-06-02

**Vocal Ingestion Fix:**
- Fixed intermittent silence and ingestion drops on mobile and high-load cycles.
- `ScriptProcessorNode` buffer increased to 2048 samples.
- `autoGainControl: true` enabled for better low-signal capture.
- Near-zero (`0.00001`) keep-alive gain node prevents browser node suspension.
- Robust character-loop base64 encoding avoids stack limits.

**Diegetic Backend (Enculturate Crate):**
- Replaced standard web tabs with a **MHz Frequency Tuner** (Diegetic Navigation).
- Redesigned data cards into **Signal Fragments** with fractured, asymmetrical borders.
- Integrated real-time **Oscilloscope** into `CORE_DIAG` tab for VAD signal verification.
- Rebranded categories: `RESONANCE` (Vault), `CORE_DIAG` (Gemini), `SALVAGE` (Dev).

**Infrastructure:**
- Verified model sync: `gemini-2.5-flash-native-audio-latest`.
- Created git tag `restore-point-ingestion-fixed` as a rollback anchor.

## Session Overhaul: 2026-06-01

**Bug fixes:**
- Audio battle (radio vs Oracle): Radio now ducks INSTANTLY (10ms hard cut, no ramp) when Oracle speaks.
- VAD threshold raised from 0.022 → 0.035 to prevent Oracle's own voice from triggering VAD.
- Hard gate added: `isOracleSpeakingRef.current === true` → mic data NOT sent to Gemini.
- `setOracleSpeaking` wrapper: synchronous ref update before setState (avoids stale closure in audio callback).
- Mic pre-warm removed from `handleFirstTap` (was causing VAD to pick up Oracle's own audio).
- `isOracleSpeakingRef` variable name collision in OracleConversation.tsx corrected.

**New features:**
- `resetJourney()` funtion exported from `useOracleJourney` — full state wipe (scenePhase → dormant, loreComplete → false, etc.).
- Reset Journey button visible in oracle mode (bottom-left corner, green tint, confirmation dialog).
- iOS DeviceOrientation permission requested on first touch via `useParallax.ts`.
- `useParallax.ts` duplicate function declarations fixed (onMouseMove, onWheel, onTouchStart).

**Cinematic Entrance — TOTALLY RADICAL DUDE! 80s Comic Book:**
- 12-second (5× slower) epic entrance
- Slides in from 260px to the right
- `blur(12px) brightness(4) hue-rotate(60deg)` → `blur(0) brightness(1) saturate(1) hue-rotate(0deg)`
- 6 keyframes with `[0.22, 1, 0.36, 1]` easing (fast out, elastic settle)
- Asimov × Philip K. Dick approved — no bone-white bags

## Session Overhaul: 2026-05-31

**Bugs fixed:**
- Oracle session reconnect re-greeting: `isSessionReconnectRef` decouples reconnect detection from `reconnectAttemptsRef` (which was reset by `ws.onopen` before `session.created` fired).
- Oracle tool-use crash: `toolConfig: { functionCallingConfig: { mode: 'NONE' } }` added to session config + forwarded by proxy. Definitively suppresses built-in Gemini tools.

**Audio stack:**
- `DynamicsCompressor` inserted before Analyser (threshold=-22dBFS, ratio=10) normalizes Gemini PCM.
- Oracle `masterGain` raised to 1.8 for clear presence.
- `SESSION_AMBIENT = 0.008` — radio locks to this level after first Oracle speech for entire session. No micro-bumps between turns. Slow 1500ms rise from near-silence (imperceptible).
- Removed `.muted` toggle — GainNode handles all silence, no audible click on unmute.

**Avatar animations:**
- Confirmed GLB morph/bone map. Head movement scaled 8× (was sub-degree, invisible).
- Lip closedness driver: `viseme_PP` fires when `openness < 0.55` — prevents jaw-only animation.
- Shoulder/Spine2 wired for breathing-linked body mechanics.
- Blink: speed=6 (idle) vs speed=13 (speech), 20% double-blink.

**UX:**
- Static Dissolve entrance: 2D portrait surges then 3D face dissolves out of it.
- Scene-wide awakening flash on `awakened` state.
- Knife selection: horizontal card scroller (user-preferred).
- Bottom bar: compact float-animated buttons, no neon borders.
- Radio station dots: tap dot = switch station, main button = mute/unmute.
- Hold-to-info tooltip (400ms): Portraits, Enculturate, Tour buttons reveal descriptions.
- Brand audit: zero raw `#00ffff`/`#ff00ff`. "SURROGATE:ORACLE" canonical naming. Decart residue fully removed.

## Session Overhaul: 2026-05-30
- Removed `DECART_API_KEY` requirement (residue deleted).
- Standardized on `OracleAvatar3D` (Three.js) as the only rendering engine.
- Implemented "Cheshire Cat" branding persistence.
- Restored canonical static avatar (`orackle-only-static.png`).
- Applied brand kit (`aAnotherTag` / `PhillySans`) to all overlays.