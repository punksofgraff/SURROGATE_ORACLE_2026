# SURROGATE — Replit Integration

Last updated: 2026-05-29. Phase 4 Enterprise Overhaul complete.

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
| `DECART_API_KEY` | Decart WebRTC | Realtime video avatar |
| `REPLICATE_API_TOKEN` | Portrait EFA | Flux-schnell generation |
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
npm run dev

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
  ├── useOracleConnection       ← WS, ICE, PCM lifecycle
  ├── usePortraitPipeline       ← neural synthesis cascade
  ├── OracleConversation.tsx    ← Gemini Live WS, VAD
  ├── OracleFaceRenderer.ts     ← WebGL mesh-warp (landmark skinned)
  └── oracle-audio.worklet.ts   ← off-thread PCM playback + detection
```

**Audio Routing:**
Gemini PCM → `PCMPlayer` → `AudioWorklet` (FFT/visemes) → `GainNode` → `Speakers`.
Static portraits minted via the pipeline materialize directly in the arcade cabinet.

---

## Known Open Issues

| Issue | Impact | Workaround |
|-------|--------|------------|
| 10-turn dropout | High — WS drop | Reconnect |
| Web tool crash | High — silent fail | Avoid tool prompts |
| CI Audio gaps | Low — test noise | Ignore MIC FAILED in CI |
