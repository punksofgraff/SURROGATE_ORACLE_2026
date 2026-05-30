# SURROGATE — Development Guide

Canonical mandates for the Surrogate project. Follow strictly.
Last updated: 2026-05-30. Decart Residue Removal + Brand Kit Overhaul complete.

---

## Technical Stack
- **Frontend:** React (TypeScript), Vite, Tailwind CSS, Framer Motion.
- **Backend:** Supabase Edge Functions (Deno).
- **AI Engine:** Gemini 2.5 Flash (Live WebSocket + REST).
- **Audio:** Web Audio API, `oracle-audio.worklet.ts` (PCM streaming, Viseme detection), `PCMPlayer`.
- **3D Rendering:** Three.js / React Three Fiber (`OracleAvatar3D.tsx`).

---

## Core Mandates

### 1. The Seeker's Journey — decoupled state machine

| Phase | What happens | Oracle voice |
|-------|-------------|-------------|
| **Dormant** | Alley. DormantHUD. Ghost transmissions. Cabinet pulses. | Silent |
| **Terminal** | First tap → lore sequence types in. Alley ambience plays. | Silent — Oracle NEVER speaks during lore |
| **Awakened** | Lore done → Oracle greets → announces territories → knife cards | Greets at +300ms. Territory announcement at +1200ms. |
| **Oracle** | Knife selected → full conversation. `OracleAvatar3D` live morph targets. | Full conversation |

**Critical hooks:**
- `useOracleJourney`: Manages the state machine (dormant → oracle).
- `useOracleConnection`: Handles WS handshake and PCM lifecycle.
- `usePortraitPipeline`: Coordinates Gemini-exclusive neural image synthesis.
- **Return Journey:** `awakeFromTerminal()` bypasses lore if `hasCompletedLore` is detected.

### 2. Audio & Volume (Enterprise Pipeline)

**Path:** Gemini WS → `PCMPlayer.feed()` → `OracleAudioProcessor` (AudioWorklet) → `MasterGain` → `Speakers`.

- **Immunity:** Use `GainNode` for volume/ducking. `HTMLAudioElement.volume` is forbidden (iOS resets it).
- **Off-Thread:** All heavy audio tasks (PCM accumulation, FFT) are in the `AudioWorklet`.
- **Latency:** Zero intermediate file creation. Direct base64 → Int16 → Float32 streaming.

Music ducking levels: Dormant=`0.06`, Terminal=`0.06`, Awakened=`0.03`, Oracle=`0.08` (active=`0.015`).

### 3. Step Logging — Canonical Step Names

The pressure test asserts on these exact strings. **Never rename without updating tests.**

```
OracleConversation MOUNTED          ok      — on component mount
ENV OK (Supabase vars)              ok      — validateEnvironment() passes
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
INVOKING PORTRAIT EFA               pending
NEURAL PORTRAIT SYNTHESIZED ✓       ok
```

### 4. Visual Standards (Brand Kit)

- **Typography (Headers):** `aAnotherTag` with brand gradient (`#00ff88` → `#00ffcc`).
- **Typography (Body/UI):** `PhillySans` (Heavy weight, tracking 0.15em).
- **Panels:** `.neural-link-terminal` (Holographic glass, `blur(12px)`, Sacred Green borders, scanline overlay).
- **Entrance:** "Glitch-Phase" downward float with high-frequency chromatic aberration frames.

---

## Known Bugs (open)

| Bug | Severity | File | Notes |
|-----|----------|------|-------|
| Oracle breaks after ~10 turns | High | `OracleConversation.tsx` | WS timeout or context limit. |
| Oracle crashes on web tool use | High | `OracleConversation.tsx` | Tool-use config mismatch. |
| No contemplative fillers | Medium | `OracleConversation.tsx` | Silence while Oracle processes response. |
| CI Audio Limitations | Low | `scripts/` | Headless CI cannot use mic. |

---

## Deployment
- **Web:** `npm run build`
- **Functions:** `npx supabase functions deploy gemini-live-proxy --no-verify-jwt`
