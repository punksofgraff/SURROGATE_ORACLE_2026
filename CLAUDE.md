# SURROGATE — Development Guide

Canonical mandates for the Surrogate project. Follow strictly.
Last audited: 2026-05-29. Phase 4 Enterprise Overhaul complete. AudioWorklet + Landmark Skinning live.

---

## Technical Stack
- **Frontend:** React (TypeScript), Vite, Tailwind CSS, Framer Motion.
- **Backend:** Supabase Edge Functions (Deno).
- **AI:** Gemini 2.5 Flash (Live WebSocket + REST), Decart (Realtime Video Avatar).
- **Audio:** Web Audio API, `oracle-audio.worklet.ts` (PCM streaming, Viseme detection), `PCMPlayer` (HRTF).
- **Vision:** MediaPipe Face Landmarker (calibration during pre-warm).

---

## Core Mandates

### 1. The Seeker's Journey — decoupled state machine

| Phase | What happens | Oracle voice |
|-------|-------------|-------------|
| **Dormant** | Alley. DormantHUD. Ghost transmissions. Cabinet pulses. | Silent |
| **Terminal** | First tap → lore sequence types in. Alley ambience plays. | Silent — Oracle NEVER speaks during lore |
| **Awakened** | Lore done → Oracle greets → announces territories → knife cards | Greets at +300ms. Territory announcement at +1200ms. |
| **Oracle** | Knife selected → full conversation. WebGL landmark mesh sync (freemium) or Decart. | Full conversation |

**Critical hooks:**
- `useOracleJourney`: Manages the state machine (dormant → oracle).
- `useOracleConnection`: Handles WS, ICE negotiation, and PCM lifecycle.
- `usePortraitPipeline`: Coordinates neural image synthesis.
- `startSession()` fires in `awakeFromTerminal()` — the ONLY place the greeting is triggered.

### 2. Audio & Volume (Enterprise Pipeline)

**Path:** Gemini WS → `PCMPlayer.feed()` → `OracleAudioProcessor` (AudioWorklet) → `MasterGain` → `Speakers`.

- **Immunity:** Use `GainNode` for volume/ducking. `HTMLAudioElement.volume` is forbidden (iOS resets it).
- **Off-Thread:** All heavy audio tasks (PCM accumulation, FFT) are in the `AudioWorklet`.
- **Latency:** Zero intermediate file creation. Direct base64 → Int16 → Float32 streaming.

Music ducking levels: Dormant=`0.06`, Terminal/Awakened=`0.03`, Oracle=`0.001` (constant).

### 3. Step Logging — Canonical Step Names

The pressure test asserts on these exact strings. **Never rename without updating tests.**

```
OracleConversation MOUNTED          ok      — on component mount
ENV OK (Supabase vars)              ok      — validateEnvironment() passes
DECART INIT                         ok      — initializeOracle() starts
GEMINI WS CONNECTING                pending — connectToGemini() fires
GEMINI WS OPENED                    ok      — ws.onopen
GEMINI SESSION CREATED              ok      — session.created message
TAP → TERMINAL                      ok      — enterTerminal() user tap
LORE SKIPPED (DEV HOOK)             ok      — __oracle_skipLore used
LORE DONE → AWAKENED                ok      — awakeFromTerminal() fires
startSession() CALLED               ok      — greeting or phase entry
ORACLE ANNOUNCES TERRITORIES        ok      — territory sendTextMessage fires (+1200ms)
__ORACLE_BOOT__ path triggered      ok      — inside startSession()
KNIFE[N] SELECTED                   ok      — handleKnifeClick() fires
ORACLE PHASE ENTERED                ok      — setScenePhase('oracle') settled
ORACLE AUDIO START                  ok      — first PCM chunk of a turn
ENTERPRISE AUDIO WORKLET ACTIVE     ok      — Worklet viseme callback registered
MIC STARTED                         ok      — getUserMedia success
ORACLE TURN COMPLETE                ok      — turnComplete signal from Gemini
ORACLE SCORE: <phase> / <align> / +<n>c   ok   — score parsed from turn
ORACLE INTERRUPTED (barge-in)       warn    — serverContent.interrupted received
GEMINI WS ERROR                     err     — ws.onerror
DECART READY ✓                      ok      — onStreamReady fired
FREEMIUM PATH READY                 warn    — Decart failed or timed out, freemium active
INVOKING PORTRAIT EFA               pending
NEURAL PORTRAIT SYNTHESIZED ✓       ok
```

### 4. VAD Realtime Spine (Input)

Input format: `audio/pcm;rate=16000` — raw Int16 PCM, mono, 16kHz.
Sent via `client.realtimeInput` mediaChunks. **VAD gate is mandatory.**

### 5. WebGL Landmark Lip-Sync (Output)

- **Renderer:** `OracleFaceRenderer.ts` uses WebGL mesh-warp.
- **Accuracy:** 468 MediaPipe landmarks drive specific mesh vertices. Skinning weights computed during pre-warm.
- **Synthesis:** If the analyser is silent but PCM is arriving, the Worklet synthesizes visemes from direct amplitude.
- **Materialization:** Minted portraits appear inside the arcade cabinet with a "NEURAL SYNTHESIS" transition.

---

## Known Bugs (open)

| Bug | Severity | File | Notes |
|-----|----------|------|-------|
| Oracle breaks after ~10 turns | High | `OracleConversation.tsx` | WS timeout or context limit; silent fail. |
| Oracle crashes on web tool use | High | `OracleConversation.tsx` | Tool-use config mismatch. Avoid tool prompts. |
| No contemplative fillers | Medium | `OracleConversation.tsx` | Silence while Oracle processes response. |
| CI Audio Limitations | Low | `scripts/` | Headless CI cannot use mic or play audio, causing some test failures. |

---

## Deployment
- **Web:** `npm run build`
- **Functions:** `npx supabase functions deploy gemini-live-proxy --no-verify-jwt`
