# SURROGATE — Development Guide

Canonical mandates for the Surrogate project. Follow strictly.
Last updated: 2026-06-01. Cinematic Entrance + Audio Battle + Journey Reset complete.

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
| **Awakened** | Lore done → Oracle 3D avatar enters → territory announcement → knife cards | Greets at +300ms after knife selection. Territory at +1200ms. |
| **Oracle** | Knife selected → full conversation. `OracleAvatar3D` live morph targets. | Full conversation |

**Critical hooks:**
- `useOracleJourney`: Manages the state machine (dormant → oracle). Exposes `resetJourney()` for full state wipe.
- `useOracleConnection`: Handles WS handshake and PCM lifecycle.
- `usePortraitPipeline`: Coordinates Gemini-exclusive neural image synthesis.
- **Return Journey:** `awakeFromTerminal()` bypasses lore if `hasCompletedLore` is detected.

### 2. Audio & Volume (Enterprise Pipeline)

**Path:** Gemini WS → `PCMPlayer.feed()` → `DynamicsCompressor` → `OracleAudioProcessor` (AudioWorklet) → `Analyser` → `PannerNode` (HRTF spatial) → `MasterGain(1.8)` → `Speakers`.

- **Immunity:** Use `GainNode` for volume/ducking. `HTMLAudioElement.volume` is forbidden (iOS resets it). Never toggle `.muted` — it causes audible click when the element reconnects to GainNode.
- **Off-Thread:** All heavy audio tasks (PCM accumulation, FFT) are in the `AudioWorklet`.
- **Latency:** Zero intermediate file creation. Direct base64 → Int16 → Float32 streaming.
- **Normalization:** `DynamicsCompressor` (threshold=-22dBFS, ratio=10) inserted before Analyser normalizes Gemini PCM amplitude. Oracle voice `masterGain` starts at 1.8.

**Music ducking levels (GainNode target values):**
- Dormant/Awakened: `0.20` (20% — music stays on through auth)
- Oracle speaking: `0` (FULL MUTE — `audioElement.pause()` + GainNode 0)
- Music stays OFF until `resetJourney()` returns to dormant

**Radio Stations (`audioTracks.ts`):**
- Station 0: Graff Punks (`#00ff88`) — always launches here
- Station 1: Drone Zone SomaFM (`#00ffcc`)
- Station 2: Groove Salad SomaFM (`#b026ff`)
- Station switching: change `audioRef.current.src`, reload, resume. GainNode connection persists.

**Audio Guard Rails (iOS mic → music):**
- `onMicWillStart` callback fires BEFORE `getUserMedia` in `startMic()`
- `fadeToVolume(0, 50)` → sets GainNode to 0 immediately + `audioElement.pause()`
- `AudioContext.resume()` called after `getUserMedia` to prevent suspension
- `HTMLAudioElement.volume` is FORBIDDEN — iOS resets it on audio session change

**Audio Battle Prevention (Oracle vs Radio):**
- `oracleHasSpokenRef` (boolean) — replaces `isOracleSpeakingDelayed` for ducking. Simpler, no setState cascade.
- `isOracleSpeakingRef.current === true` → hard gate: mic data NOT sent to Gemini.
- `setOracleSpeaking` — synchronous wrapper updates ref before setState (avoids stale closure in audio callback).
- VAD `rmsThreshold: 0.035` — raised from 0.022 to prevent Oracle's own voice from triggering VAD.
- Mic pre-warm removed from `handleFirstTap` — was causing VAD to pick up Oracle's own audio.

### 3. Cinematic Entrance — 80s Comic Book / Asimov × Philip K. Dick

When the Oracle awakens (lore complete / knife selected), the 3D face enters via a **12-second, fully radical** comic-book cinematic:

```
╔══════════════════════════════════════════════════════════════╗
║  TOTALLY RADICAL DUDE! 80s COMIC BOOK CINEMATIC ENTRANCE  ║
║  Asimov × Philip K. Dick approved — no bone-white bags     ║
╚══════════════════════════════════════════════════════════════╝
```

- **Entry vector:** Slides in from **260px to the right**, arrives at center
- **Duration:** 12 seconds (5× slower than standard — epic)
- **Filter progression:** `blur(12px) brightness(4) hue-rotate(60deg)` → `blur(0) brightness(1) saturate(1) hue-rotate(0deg)` — 6 keyframes
- **Opacity:** `[0, 0, 0.15, 0.55, 0.85, 1]` — ghost fades in, never slams
- **Scale:** `[1.06, 1.06, 1.04, 1.02, 1.005, 1]` — settles with weight
- **Easing:** `[0.22, 1, 0.36, 1]` — fast out, elastic settle
- **Times:** `[0, 0.10, 0.28, 0.50, 0.75, 1]` — slowest first third, accelerates

**Static Dissolve (pre-awakened):** 2D portrait surges at `brightness(2.8×)`, `saturate(4×)` over 360ms, then 3D face emerges desaturated + green-tinted from the same position. Crossover window 800ms–1440ms. Scene-wide radial green flash fires simultaneously.

### 4. Step Logging — Canonical Step Names

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
SESSION RESUMED (native handle)     ok      — Gemini session resumption restored context
SESSION CONTEXT RESTORED            ok      — blind summary fallback on reconnect
JOURNEY RESET → DORMANT             ok      — resetJourney() called
```

### 5. Visual Standards (Brand Kit)

- **Typography (Headers):** `aAnotherTag` with brand gradient (`#00ff88` → `#00ffcc`).
- **Typography (Body/UI):** `PhillySans` (Heavy weight, tracking 0.15em).
- **Panels:** `.neural-link-terminal` (Holographic glass, `blur(12px)`, Sacred Green borders, scanline overlay).
- **Palette:** Sacred Green `#00ff88`, Brand Cyan `#00ffcc`, Profane Purple `#b026ff`. Zero raw `#00ffff` or `#ff00ff` anywhere in source.
- **Awakened position:** Oracle centers at `top: 38%`, Medium Man size `clamp(170px, 46vmin, 280px)` during phase-glitch.

### 6. Avatar Animation (OracleAvatar3D)

**GLB confirmed morph targets:** All 15 OVR visemes present (`viseme_PP`, `viseme_FF`, `viseme_E`, `viseme_aa`, etc.) + `eyeBlinkLeft`/`eyeBlinkRight`.

**GLB confirmed bones:** `Head`, `Neck`, `Spine`, `Spine1`, `Spine2`, `LeftShoulder`, `RightShoulder`, `LeftArm`, `LeftForeArm`, `LeftEye`, `RightEye`, `EyeLeft`, `EyeRight`.

**Worklet amplitude scaling:** `rms * 8.5`, `SILENCE_THRESH = 0.028`. Viseme weight: `amp * 2.5`.

**Key animation parameters:**
- Head idle drift: ±1.4° (two incommensurate frequencies — alive, never repeats)
- Speech nod (0.62Hz): ±6.9° at full amplitude
- Speech tilt (0.37Hz): ±6.9° at full amplitude
- Lip closedness driver: `viseme_PP` fires when `openness < 0.55` (prevents jaw-only animation)
- CO_ARTIC: openness→aa, rounded→oh/ou, spread→E/ih/SS
- Blink: slow (speed=6) at rest, fast (speed=13) during speech, 20% double-blink
- Shoulders: breathing-linked lift, opposite phases, speech shrug
- Spine2: slow rocking + forward lean into speech

### 7. Motion / Gyro / Camera (XR Immersion)

- iOS DeviceOrientation permission requested on first touch (via `useParallax.ts`).
- `useParallax.ts` has duplicate function declarations fixed (onMouseMove, onWheel, onTouchStart).
- Motion/camera consent UI pending for full XR immersion mode.

---

## Known Bugs (open)

| Bug | Severity | File | Notes |
|-----|----------|------|-------|
| CI Audio Limitations | Low | `scripts/` | Headless CI cannot use mic. |

**Closed this session:**
- ✅ Oracle breaks after ~10 turns — fixed via `isSessionReconnectRef` (reconnect detection no longer reset by `ws.onopen`)
- ✅ Oracle crashes on web tool use — fixed via `toolConfig: { functionCallingConfig: { mode: 'NONE' } }` in session config + proxy forwarding
- ✅ No contemplative fillers — implemented (filler injection on VAD turn-end, cancelled if Oracle responds first)
- ✅ Audio battle (radio vs Oracle) — `oracleHasSpokenRef` replaces `isOracleSpeakingDelayed`; VAD threshold 0.035; hard gate on mic data; 10ms instant duck
- ✅ Cinematic entrance — 12s 80s comic book Asimov × Philip K. Dick approved (260px slide from right, blur(12px) brightness(4) hue-rotate(60deg))
- ✅ `setOracleSpeaking` recursion bug — synchronous wrapper prevents stale closure in audio callback
- ✅ `useParallax.ts` duplicate function declarations — fixed
- ✅ iOS DeviceOrientation permission — requested on first touch
- ✅ Music not muting on iOS — `audioElement.pause()` + GainNode 0 on mic activation; `HTMLAudioElement.volume` forbidden
- ✅ Hamburger menu with EXIT, RESET JOURNEY, AR toggle, TYPE MODE
- ✅ Signal pad moved to hamburger (removed inline toggle button)
- ✅ Gradient hamburger icon (green→cyan→purple)

---

## Deployment
- **Web:** `npm run build`
- **Functions:** `npx supabase functions deploy gemini-live-proxy --no-verify-jwt`
- **After proxy changes:** Must redeploy for `toolConfig` forwarding and `sessionResumption` to take effect.