# SURROGATE — Replit Integration

Last updated: 2026-06-01. Cinematic Entrance + Audio Battle + Journey Reset complete.

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

# Run pressure test
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