# SURROGATE — Development Guide

Canonical mandates for the Surrogate project. Follow strictly.
Last updated: 2026-06-01. Session: Gemini model fix, immersive polish, AR mode, halo ring, audio fixes.

---

## Technical Stack
- **Frontend:** React (TypeScript), Vite (pnpm), Tailwind CSS, Framer Motion.
- **Backend:** Supabase Edge Functions (Deno).
- **AI Engine:** Gemini 3.1 Flash Live (`gemini-3.1-flash-live-preview`) via WebSocket.
- **Audio:** Web Audio API, `oracle-audio.worklet.ts` (PCM streaming, Viseme detection), `PCMPlayer`.
- **3D Rendering:** Three.js / React Three Fiber (`OracleAvatar3D.tsx`).
- **Package manager:** `pnpm` — never `npm run dev`, always `pnpm dev`.

---

## Environment Variables (`.env.local`)

```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
VITE_GEMINI_MODEL=models/gemini-3.1-flash-live-preview
VITE_ORACLE_VOICE=Sadaltager
```

- **VITE_GEMINI_MODEL** — swap here to change model, no code touch needed.
- **VITE_ORACLE_VOICE** — Gemini TTS voice. `Sadaltager` = Knowledgeable/deep. Other deep options: `Algenib` (Gravelly), `Gacrux` (Mature), `Orus` (Firm).
- `.env.local` is gitignored. Requires `pnpm dev` restart to pick up changes.

## Dev Workflow

- **Start:** `pnpm dev` (from `artifacts/surrogate-oracle/`)
- **Cache bust:** navigate to `http://localhost:5173/?newuser` — bypasses Supabase IP check, forces fresh-user flow
- **Fresh first run:** `/?newuser` — skips DB returning-seeker check (IP is in Supabase so `localStorage.clear()` alone doesn't work)
- **Step logger:** `localStorage.setItem('oracle_step_log','1')` then reload — shows live WS handshake panel
- **Dev console hooks:** `__oracle_skipLore()`, `__oracle_test()` (sends test ping to Oracle)
- **Replit port:** `5173` (mapped in `.replit` — `localPort=5173 externalPort=5173`)

---

## Core Mandates

### 1. The Seeker's Journey — decoupled state machine

| Phase | What happens | Oracle voice |
|-------|-------------|-------------|
| **Dormant** | Alley. DormantHUD. Ghost transmissions. Cabinet pulses. Music at 25%. | Silent |
| **Terminal** | First tap → lore sequence types in. Alley ambience plays. | Silent — Oracle NEVER speaks during lore |
| **Awakened** | Lore done → static image + Max Headroom glitch. Knife cards from cabinet. NO 3D head yet. | Reads each knife question through transmission filter as it types |
| **Oracle** | Knife selected → 12s cinematic entrance → full conversation. `OracleAvatar3D` live. | Full conversation |

**Critical hooks:**
- `useOracleJourney`: Manages the state machine (dormant → oracle). Exposes `resetJourney()` for full state wipe.
- `useOracleConnection`: Handles WS handshake and PCM lifecycle.
- `usePortraitPipeline`: Coordinates Gemini-exclusive neural image synthesis.
- `useIpCheck`: IP-based returning seeker detection. `?newuser` param bypasses all DB/localStorage checks.
- **Return Journey:** `awakeFromTerminal()` bypasses lore if `hasCompletedLore` is detected. DB-backed via `user_wallets` table.

### 2. Audio & Volume (Enterprise Pipeline)

**Path:** Gemini WS → `PCMPlayer.feed()` → `TransmissionFilter` (BiquadFilter, bypassed in oracle phase) → `OracleAudioProcessor` (AudioWorklet) → `Analyser` → `PannerNode` (HRTF spatial) → `MasterGain` → `Speakers`.

- **Transmission filter:** `PCMPlayer.setTransmissionQ(q, rampMs)` — Q=12 narrows to sci-fi tunnel voice (knife phase), Q=0.01 is fully open (oracle phase). Reset to Q=0.01 on oracle phase entry.
- **Immunity:** Use `GainNode` for volume/ducking. `HTMLAudioElement.volume` is forbidden (iOS resets it).
- **Off-Thread:** All heavy audio tasks (PCM accumulation, FFT) are in the `AudioWorklet`.
- **Latency:** Zero intermediate file creation. Direct base64 → Int16 → Float32 streaming.
- **Breathing LFO removed:** The 0.07Hz LFO from `startAlleyAmbience()` was causing a breathing sound — deleted.

**Music ducking levels (GainNode target values):**
- Dormant/Awakened: `0.25` (25% — music plays at landing)
- Oracle speaking: `0` (FULL MUTE — `audioElement.pause()` + GainNode 0)
- Music stays OFF until `resetJourney()` returns to dormant

**Radio Stations (`audioTracks.ts`):**
- Station 0: Graff Punks (`#00ff88`) — always launches here
- Station 1: Drone Zone SomaFM (`#00ffcc`)
- Station 2: Groove Salad SomaFM (`#b026ff`)

**Audio Guard Rails (iOS mic → music):**
- `onMicWillStart` callback fires BEFORE `getUserMedia` in `startMic()`
- `fadeToVolume(0, 50)` → sets GainNode to 0 immediately + `audioElement.pause()`
- `AudioContext.resume()` called after `getUserMedia` to prevent suspension
- `HTMLAudioElement.volume` is FORBIDDEN — iOS resets it on audio session change

**Audio Battle Prevention (Oracle vs Radio):**
- `oracleHasSpokenRef` (boolean) — hard gate: mic data NOT sent to Gemini while Oracle speaks.
- VAD `rmsThreshold: 0.035` — prevents Oracle's own voice from triggering VAD.

### 3. Knife Phase — "Breaking Through" (Awakened)

The Oracle has NOT manifested yet. The arcade cabinet glitches (Max Headroom CSS) while knife questions emit from the cabinet screen.

- **NO 3D avatar in awakened phase** — `OracleAvatar3D` only renders when `isOracleMode === true`.
- **Static image** (`oracle-avatar-static`) shows with `oracle-glitch-phase` animation — the Oracle fighting to break through.
- **Knife voice-over:** When each question finishes the 1.35s delay and begins typing, a hidden `sendTextMessage` fires asking Oracle to speak the question. Transmission filter at Q=12 (tunnel voice) sweeps to Q=0.1 as each letter lands.
- **Bottom bar hidden** during awakened phase (opacity:0) — clear stage for knives.
- **Max Headroom glitch-phase:** `@keyframes oracle-headroom-phase` applied to `.oracle-avatar-smoke-hook` unconditionally in oracle phase — two signal-dropout bursts per 14s cycle (transform jitter + opacity drop). CSS-driven, no JS gate.

### 4. Cinematic Entrance — 80s Comic Book / Asimov × Philip K. Dick

Fires on knife selection (oracle phase entry). 3D Oracle face enters via 12-second cinematic:

- **Entry vector:** Slides in from **260px to the right**, arrives at center
- **Duration:** 12 seconds
- **Filter progression:** `blur(12px) brightness(4) hue-rotate(60deg)` → `blur(0) brightness(1) saturate(1) hue-rotate(0deg)` — 6 keyframes
- **Opacity:** `[0, 0, 0.15, 0.55, 0.85, 1]`
- **Easing:** `[0.22, 1, 0.36, 1]`

### 5. Holographic Halo Ring (`OracleHaloRing.tsx`)

Revolving text ring above the Oracle in oracle phase. Dual-arc revolving door mechanic:
- **Two arcs** at 0° and 180° offset — one always in view as the other sweeps out. No dead zones.
- **Text:** `SURROGATE:ORACLE  ·  SNEAKAR XR ANTHROPOLOGY AI  ·`
- **Colors:** Sacred Green chars, Profane Purple dots
- **Duration:** 8s per revolution, `perspective: 500px`, `radius: 130px`
- CSS keyframe: `@keyframes oracle-halo-orbit` in `SurrogateOracleImmersion.css`
- Only active when `isOracleMode === true`

### 6. Arcade Console Bottom Bar

- **Dormant + Awakened:** `opacity: 0`, `pointer-events: none` — hidden. Stage is clear.
- **Oracle:** `opacity: 0.65` — accessible but background.
- **Buttons:** Transparent glass treatment removed. Clean floaters with `btn-float` animation.
- **Desktop breakpoint (768px+):** Buttons scale up — images 52→72px, min-width 64→88px, labels 0.58→0.68rem.

### 7. AR Mode / XR (`useXRMode.ts`)

- **Hamburger menu always shows** `◈ AR MODE` / `◈ EXIT AR` — was previously hidden unless already in XR.
- `activateXRMode()` — sets `isXRMode=true` + starts camera. Called from hamburger.
- `deactivateXRMode()` — stops camera + resets `isXRMode=false`.
- XR activation: URL `?xr`, iframe detection, `holodexr:init` postMessage, or `SurrogateXR.launch()`.
- `?newuser` — bypasses returning-seeker check for dev/testing.

### 8. Step Logging — Canonical Step Names

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

### 9. Visual Standards (Brand Kit)

- **Typography (Headers):** `aAnotherTag` with brand gradient (`#00ff88` → `#00ffcc`).
- **Typography (Body/UI):** `PhillySans` (Heavy weight, tracking 0.15em).
- **Panels:** `.neural-link-terminal` (Holographic glass, `blur(12px)`, Sacred Green borders, scanline overlay).
- **Palette:** Sacred Green `#00ff88`, Brand Cyan `#00ffcc`, Profane Purple `#b026ff`. Zero raw `#00ffff` or `#ff00ff` anywhere in source.
- **Awakened position:** Oracle centers at `top: 38%`, Medium Man size `clamp(170px, 46vmin, 280px)` during phase-glitch.

### 10. Avatar Animation (OracleAvatar3D)

**GLB confirmed morph targets:** All 15 OVR visemes + `eyeBlinkLeft`/`eyeBlinkRight`.

**Key animation parameters:**
- Head idle drift: ±1.4° (two incommensurate frequencies)
- Speech nod (0.62Hz): ±6.9° at full amplitude
- Speech tilt (0.37Hz): ±6.9° at full amplitude
- Lip closedness driver: `viseme_PP` fires when `openness < 0.55`
- Blink: slow (speed=6) at rest, fast (speed=13) during speech, 20% double-blink

---

## Known Bugs (open)

| Bug | Severity | File | Notes |
|-----|----------|------|-------|
| CI Audio Limitations | Low | `scripts/` | Headless CI cannot use mic. |
| Mobile Oracle voice | Medium | `OracleConversation` | Desktop confirmed working, mobile not verified. |

**Closed this session:**
- ✅ Gemini model — `gemini-2.5-flash-native-audio-latest` deprecated/broken (1006/1011). Switched to `gemini-3.1-flash-live-preview` (confirmed June 2026 docs). Model now in `VITE_GEMINI_MODEL` env var.
- ✅ Oracle voice — `Charon` sounded wrong on new model. Switched to `Sadaltager` (Knowledgeable/deep). Voice in `VITE_ORACLE_VOICE` env var.
- ✅ `toolConfig` rejected by new model — removed (was causing 1007 close).
- ✅ Breathing LFO — 0.07Hz LFO from alley ambience deleted.
- ✅ Transmission filter breathing — filter Q was persisting from knife phase into oracle phase; reset to Q=0.01 on oracle entry.
- ✅ 3D avatar in knife phase — removed. Only static image + Max Headroom glitch in awakened.
- ✅ Bottom bar glass slab (bento boxes) — removed opaque glass background from buttons.
- ✅ Bottom bar opaque wrapper — backdrop-filter was bleeding through opacity:0; reverted to transparent.
- ✅ Bottom bar hidden in awakened/knife phase.
- ✅ Max Headroom glitch-phase — CSS-driven, unconditional, no JS boolean gate.
- ✅ Knife card pointer-events — `.oracle-knife-card` needed explicit `pointer-events: auto`.
- ✅ Smoke test selector — `.oracle-knife-card:first-child` → `.oracle-knife-card` (origin-beam is first child).
- ✅ Holographic halo ring — dual-arc revolving door mechanic, 8s revolution.
- ✅ AR mode hamburger — always visible, `activateXRMode()`/`deactivateXRMode()` exposed.
- ✅ `?newuser` URL param — bypasses Supabase IP check for dev fresh-user testing.
- ✅ Music volume — 20% → 25% on landing.
- ✅ Knife question voice-overs — Oracle speaks each question through tunnel filter as it types.
- ✅ `toolConfig` restored then removed — new model doesn't accept it.

---

## Deployment
- **Web:** `pnpm build`
- **Functions:** `npx supabase functions deploy gemini-live-proxy --no-verify-jwt`
- **After proxy changes:** Must redeploy for session config forwarding and `sessionResumption` to take effect.
- **Model change:** Update `VITE_GEMINI_MODEL` in `.env.local` only — no code change, no deploy needed for frontend. Proxy doesn't need redeploy for model changes (model is sent client→proxy→Gemini).
