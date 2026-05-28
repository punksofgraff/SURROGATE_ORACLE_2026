# SURROGATE — Replit Integration

Last updated: 2026-05-28. Pressure test: 86/86 passing.

---

## Development Environment

- **Host:** `0.0.0.0`
- **Port:** `5173`
- **Dev command:** `npm run dev` (Vite, from `artifacts/surrogate-oracle/`)
- **Build:** `npm run build`
- **Working directory for all commands:** `artifacts/surrogate-oracle/`

---

## Secrets Configuration

The following Replit secrets MUST be present and pushed to Supabase:

| Secret | Used By | Notes |
|--------|---------|-------|
| `GEMINI_API_KEY` | `gemini-live-proxy`, `oracle-conversation`, `gemini-portrait-generator` | Google AI Studio free-tier key — NOT the GCP service key |
| `DECART_API_KEY` | `DecartClient.tsx` | Realtime video avatar. ICE warms during lore (~18s). Falls to freemium on failure. |
| `REPLICATE_API_TOKEN` | `gemini-portrait-generator` | Flux-schnell portrait generation |
| `SUPABASE_URL` | Client + all EFAs | `https://velmmplevfrtrtrypoch.supabase.co` |
| `SUPABASE_ANON_KEY` | Client + all EFAs | Public anon key |

> ⚠️ Two Google keys exist in Replit: `GEMINI_API_KEY` (works) and `GOOGLE_AI_API_KEY` (GCP key — does NOT work with `generativelanguage.googleapis.com`). Always use `GEMINI_API_KEY`.

---

## Dev UI & Step Logger

Two overlays help debug the handshake without Playwright:

**Option 1 — URL param:**
```
http://localhost:5173/?devui
```

**Option 2 — Console:**
```javascript
localStorage.setItem('oracle_step_log', '1')
// then reload
```

Both enable:
- `OracleStepLogger` overlay (bottom-right, monospace, auto-scrolls)
- `DevUI` chip panel (top-left, live phase/state readout)
- `window.__oracle_handleAudio(url)` — inject audio URL to test lip sync without Gemini
- `window.__oracle_skipLore()` — instantly complete lore (jumps to awakened)

---

## Pressure Test

Runs a full end-to-end Playwright journey: dormant → terminal → awakened → oracle → viseme → exit, on both desktop (1280×800) and mobile (390×844).

```bash
# Start dev server first (separate terminal)
npm run dev

# Run pressure test
node scripts/oracle-pressure.mjs
```

**Expected output:**
```
TOTAL: 86 passed  0 failed
Screenshots → /home/runner/workspace/screenshots/
```

Screenshots saved to `/home/runner/workspace/screenshots/` (pressure-01-dormant.png through pressure-07-exit-dormant.png).

**Known expected non-failures in output:**
- `🔴 BROWSER ERROR: [Mic] Failed: DOMException: Requested device not found` — Playwright has no mic. `MIC FAILED` is logged correctly. Not a bug.
- `⚠ ORACLE INTERRUPTED (barge-in)` — Gemini sometimes sends an interrupt on the greeting turn in CI. Expected.
- `ℹ could not measure panel/face bounds` — mobile layout check skipped when panel not rendered. Non-critical.

---

## Handshake Verification (manual)

With `?devui` open, walk through the full journey. The step log should show (in order):

```
✓ OracleConversation MOUNTED
✓ ENV OK (Supabase vars)
✓ DECART INIT
… GEMINI WS CONNECTING
✓ GEMINI WS OPENED         ← ~300-600ms
✓ GEMINI SESSION CREATED   ← ~400-800ms
✓ TAP → TERMINAL
… LORE SEQUENCE STARTING
✓ LORE DONE → AWAKENED
✓ ORACLE ANNOUNCES TERRITORIES   ← fires +1200ms after awakened
✓ KNIFE[N] SELECTED
✓ ORACLE PHASE ENTERED
✓ FACE LOADED (base64)
✓ RENDERER READY — idle animation running
✓ startSession() CALLED
✓ SESSION ALREADY ACTIVE — terminal boot confirmed
✓ ORACLE AUDIO START
✓ VISEME DETECTOR ACTIVE
✓ MIC STARTED              ← +1200ms after ORACLE TURN COMPLETE
✓ ORACLE TURN COMPLETE
✓ ORACLE SCORE: claim / sacred / +10c
```

Any `✗ err` steps other than `MIC FAILED` indicate a real problem.

---

## Supabase EFA Deployment

When backend changes are made:

```bash
# Gemini Live proxy — must use --no-verify-jwt
npx supabase functions deploy gemini-live-proxy --no-verify-jwt

# Other EFAs
npx supabase functions deploy oracle-conversation
npx supabase functions deploy gemini-portrait-generator
```

---

## Architecture at a Glance

```
SurrogateOracleImmersion.tsx    ← root orchestrator, scene state machine
  ├── OracleConversation.tsx    ← Gemini Live WS, VAD, mic, PCM streaming
  ├── DecartClient.tsx          ← Decart WebRTC (paid avatar path)
  ├── OracleFaceRenderer.ts     ← canvas 2D pixel-warp lip sync
  ├── VisemeDetector            ← Web Audio API analyser → viseme shapes
  ├── PCMPlayer.ts              ← HRTF panner, scheduled Int16 playback
  └── useAtmosphere.ts          ← particle system (dust/steam/sparks per phase)

Audio routing (freemium oracle):
  Gemini PCM → PCMPlayer.feed()
                 ├── AnalyserNode ← VisemeDetector reads amplitude/FFT
                 └── HRTF Panner → AudioContext.destination (speakers)

Scene phases: dormant → terminal → awakened → oracle → dormant
State machine is strictly one-directional. Exit always resets to dormant.
```

---

## Known Open Issues

| Issue | Impact | Workaround |
|-------|--------|------------|
| Oracle breaks after ~10 turns | High — silent WS drop or context limit | Reconnect / restart session |
| Oracle crashes on web tool requests | High — silent fail when tool-use triggered | Avoid web-tool prompts until Gemini tool config investigated |
| No contemplative filler phrases | Medium — silence while Oracle processes | Not yet implemented |
| Territory announcement silently drops if WS reconnecting | Medium — Oracle doesn't announce knives aloud | Rare in practice; lore is 32s, WS reconnects in ~500ms |
| `isGeminiConnected` stays `true` on WS mid-session drop | Medium — `◈ OPENING CHANNEL...` hides incorrectly | Check step logger for `GEMINI WS CLOSED` |
| XR marker path missing PCMPlayer pre-creation | Medium — Oracle greeting silent on mobile Safari in AR mode | Use tap path instead of AR marker for now |
| `createScriptProcessor` deprecated | Low — works in all current browsers | Migrate to AudioWorklet when feasible |
