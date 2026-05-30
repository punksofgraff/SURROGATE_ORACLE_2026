# SURROGATE — Replit Integration

Last updated: 2026-05-30. Decart Residue Removal + Brand Kit Overhaul complete.

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
  ├── OracleConversation.tsx    ← Gemini Live WS, VAD
  ├── OracleAvatar3D.tsx        ← Three.js GLB renderer (Primary)
  └── oracle-audio.worklet.ts   ← off-thread PCM playback + detection
```

**Audio Routing:**
Gemini PCM → `PCMPlayer` → `AudioWorklet` (FFT/visemes) → `GainNode` → `Speakers`.
Static portraits minted via the pipeline materialize directly in the arcade cabinet screen.

---

## Session Overhaul: 2026-05-30
- Removed `DECART_API_KEY` requirement (residue deleted).
- Standardized on `OracleAvatar3D` (Three.js) as the only rendering engine.
- Implemented "Cheshire Cat" branding persistence.
- Added "Glitch-Phase" downward float materialization.
- Restored canonical static avatar (`orackle-only-static.png`).
- Applied brand kit (`aAnotherTag` / `PhillySans`) to all overlays.
