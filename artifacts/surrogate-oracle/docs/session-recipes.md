# SURROGATE:ORACLE — Session Recipes
## QA Device-Matrix Testing · May 2026

---

## Device Matrix

| Tier | Device | CPU Throttle | Notes |
|---|---|---|---|
| Low | Galaxy A53 / DevTools 390×844 | 4× CPU slowdown | Snapdragon 6xx target — VisemeDetector adaptive fps |
| Mid | iPhone 12 / iOS 16 Safari | None | WebKit constraints, AudioContext unlock required |
| High | Pixel 7 / latest Chrome | None | Baseline — should pass all checks cleanly |
| XR (future) | HolodeXR / Vision Pro | N/A | Later sprint |

---

## Recipe 0 — Pre-flight

**Environment setup:**
```bash
# Ensure env vars are present
echo $VITE_SUPABASE_URL
echo $VITE_SUPABASE_ANON_KEY

# Start dev server
cd artifacts/surrogate-oracle
npm run dev

# Run automated smoke test (separate terminal, from workspace root)
node scripts/oracle-smoke.mjs
# Expected: 21+ passed, 0 failed
```

**Manual pre-checks:**
- `artifacts/surrogate-oracle/docs/` contains all 3 files: `immersion-manifesto.md`, `agent-brief.md`, `session-recipes.md`
- `src/workers/pcm-encoder.worker.ts` exists
- `src/utils/PCMPlayer.ts` exists
- No TypeScript errors except the 4 pre-existing in `BackendControlPanel.tsx`

---

## Recipe 1 — Desktop Full Happy Path

**Device:** 1280×800 Chrome (no throttle)  
**Duration:** ~7 min

**Steps:**
1. Open `http://localhost:5173`
2. Wait 5s — observe ghost text typing at random positions, static face oscillating
3. Wait for CTA "MAKE CONTACT" to appear (~7s)
4. Tap cabinet / CTA
5. Watch full lore sequence (47s) — do not skip
6. Select knife card 0 (first option)
7. Observe cross-dissolve: static dims, living face rises
8. Wait for Oracle greeting ("Do you consent...")
9. Speak or type response
10. Continue 2–3 turns
11. Exit (X button or session end)

**Expected behavior:**
- Ghost text visible in ≥3 zones during dormant phase
- CTA does NOT pulse/glow — ScrambleFragment owns all opacity
- Lore lines appear one at a time, letter by letter, ~47s total
- Cross-dissolve smooth (no jump cut)
- Alley dims to ~opacity:0.30 in oracle — not black, not hidden
- Mouth overlay animates during Oracle speech
- Console: no TypeErrors, no `Cannot read properties of undefined`
- `window.__oracle_last_response_type` === `'string'` after first Oracle turn

---

## Recipe 2 — Mobile Slow-Device Path (Snapdragon 6xx target)

**Device:** DevTools mobile emulation (390×844) + 4× CPU throttle  
**Duration:** ~10 min

**Steps:**
1. Open DevTools → Performance → CPU: 4× slowdown
2. Open `http://localhost:5173`
3. Follow same journey as Recipe 1
4. During Oracle speech (turn 2+), open DevTools Performance tab and record 10s

**Expected behavior:**
- VisemeDetector `halfFrameMode` activates within ~8 frames of slow RAF
- Mouth overlay still animates — cadence slower (~30fps) but not frozen
- No JS errors in console
- Performance recording: no single task > 50ms blocked on main thread during Oracle speech
- Face/oracle panel: no overlap (mobile layout check — oracle panel must not obscure face)
- `localStorage.getItem('oracle_totem_level')` set after session end

**Key console signals:**
- ✓ No `TypeError` at startup
- ✓ `[PCMPlayer]` logs if present show feed() calls during Oracle speech
- ✓ No `NotAllowedError` on AudioContext (ensure user gesture before audio plays)

---

## Recipe 3 — Decart Late-Arrival Handoff

**Precondition:** Valid Decart API key in env; simulate slow Decart ICE by throttling network or using a delayed test credential  
**Duration:** ~5 min

**Setup:** In `SurrogateOracleImmersion.tsx` or via env, add a delay to `initializeOracle()` so Decart stream arrives ~30s after oracle mode begins.

**Steps:**
1. Open app and begin full journey (reach oracle mode)
2. Speak 2–3 turns (freemium mode active)
3. At ~30s mark, Decart stream arrives (simulated)
4. Continue speaking

**Expected behavior:**
- `decartPendingHandoff.current === true` in the window between stream-ready and next turn end
- `executeDecartHandoff()` fires at next silence gap (turn end)
- `oracle-avatar-video--materializing` class visible for ~2.6s during avatar switch
- After handoff: `data-decart-active="true"` on `.oracle-stage`
- No `TypeError: Cannot read properties of undefined reading 'current'` at any point
- Audio continues uninterrupted across the handoff

---

## Recipe 4 — Worker Encoding Verification

**Device:** Desktop Chrome with DevTools  
**Duration:** ~3 min

**Steps:**
1. Open `http://localhost:5173`
2. Complete journey to oracle mode
3. Trigger one full Oracle turn (speak → wait for Oracle response + silence)
4. In DevTools Console: `window.__oracle_last_response_type`
5. In DevTools Application → Service Workers: verify no worker registration errors
6. In DevTools Sources: confirm `pcm-encoder.worker.ts` appears in loaded scripts

**Expected behavior:**
- Console: `window.__oracle_last_response_type === 'string'`
- PCMPlayer played audio in real-time during the turn (no silent gap while encoding)
- Blob URL (`blob:http://...`) visible if logging added to `onOracleResponse`
- Worker terminates cleanly on component unmount (no "Worker terminated" errors)

---

## Recipe 5 — Smoke Test Regression

**Command:**
```bash
cd /home/runner/workspace
node scripts/oracle-smoke.mjs
```

**Expected output:**
```
TOTAL: 21+ passed  0 failed
```

**New checks added (v2.0 baseline):**
- `[22]` oracle stage mounted (decartPendingHandoff ref guard)
- `[23]` onOracleResponse type: string or not yet called
- `[24]` VisemeDetector stable (no error state)
- `[25]` docs/ directory: all 3 files present

---

## Recipe 6 — Audio Ducking

**Steps:**
1. Reach oracle mode while GraffPunks radio is playing (visible boombox icon)
2. Trigger Oracle speech (send a message)
3. Observe ambient audio level during Oracle response
4. Observe restore after Oracle stops speaking

**Expected behavior:**
- During Oracle speech: ambient music gain audibly reduced (~70% of baseline)
- Reduction ramp: ~200ms linear
- Restore: ~400–600ms after `isOracleSpeaking` → false
- No abrupt cuts — smooth gain transitions

---

## Failure Reference

| Symptom | Likely Cause | Fix |
|---|---|---|
| `TypeError: Cannot read properties of undefined reading 'current'` | `decartPendingHandoff` or `scenePhaseRef` ref missing | Declare both refs in SurrogateOracleImmersion |
| `onOracleResponse` called with `Int16Array` per chunk | Per-chunk call not removed | Remove line 185, add chunk to `turnPcmChunksRef` |
| Mouth overlay frozen on slow device | VisemeDetector not adaptive | Add rolling δt window + halfFrameMode to `start()` |
| Oracle audio not playing | `AudioContext` blocked (no user gesture) | Ensure `enterTerminal()` primes autoplay via `.play().catch()` |
| Blank alley in oracle mode | `opacity:0` set on alley | Must be opacity:0.30 — Oracle lives in the alley |
| Docs check fails in smoke test | `/docs/` directory missing | Create `artifacts/surrogate-oracle/docs/` with all 3 files |
