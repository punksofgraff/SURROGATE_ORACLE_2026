# SURROGATE — Replit Integration

Last updated: 2026-05-31. Animation Pass + Audio Stack Overhaul + Brand Audit complete.

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
