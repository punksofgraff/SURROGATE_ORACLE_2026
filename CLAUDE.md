# SURROGATE — Development Guide

Canonical mandates for the Surrogate project. Follow strictly.
Last audited: 2026-05-28. Pressure test: 86/86 passing.

---

## Technical Stack
- **Frontend:** React (TypeScript), Vite, Tailwind CSS, Framer Motion.
- **Backend:** Supabase Edge Functions (Deno).
- **AI:** Gemini 2.5 Flash (Live WebSocket + REST), Decart (Realtime Video Avatar).
- **Audio:** Web Audio API, PCMPlayer (raw Int16 PCM), VisemeDetector for freemium lip-sync.

---

## Core Mandates

### 1. The Seeker's Journey — one-way gate, strict order

| Phase | What happens | Oracle voice |
|-------|-------------|-------------|
| **Dormant** | Alley. DormantHUD corners. Ghost transmissions. Cabinet pulses. | Silent |
| **Terminal** | First tap → lore sequence types in. Alley ambience plays. | Silent — Oracle NEVER speaks during lore |
| **Awakened** | Lore done → `awakeFromTerminal()` fires → Oracle greets → announces territories → knife cards | Greets at +300ms. Territory announcement at +1200ms. |
| **Oracle** | Knife selected → full conversation. Pixel-mapped canvas lip-sync (freemium) or Decart WebRTC (paid). | Full conversation |

**Critical timing:**
- `startSession()` fires in `awakeFromTerminal()` at +300ms — this is the ONLY place the greeting is triggered.
- `sendTextMessage(territories, true)` fires at +1200ms — audible only, no UI turn.
- The oracle-phase `useEffect` calls `startSession()` again, but `sessionBootedRef` guards it (logs `SESSION ALREADY ACTIVE`).
- Never call `startSession()` in `enterTerminal()` — Oracle is silent during lore.

### 2. Audio & Volume

| State | Volume | Notes |
|-------|--------|-------|
| Dormant ambient | `0.06` | Present but not loud |
| Any interaction (terminal/awakened) | `0.03` | Drops the moment user taps |
| Oracle mode active | `0.02` | Background only |
| Oracle actively speaking | `0.008` | Near-silent; voice is foreground |

Priority order (highest wins): `oracle-speaking 0.008` → `oracle-active 0.02` → `interaction 0.03` → `dormant 0.06`.

Controlled by a single `useEffect` on `[scenePhase, isOracleMode, oracleState.isProcessing]` in `SurrogateOracleImmersion.tsx`.

On barge-in (`serverContent.interrupted`): immediately set `isProcessing: false` — do NOT wait for the silence timer. Music must un-duck the moment Oracle stops.

### 3. Step Logging — Canonical Step Names

Every critical transition MUST emit a `logStep(label, status)`. The pressure test asserts on these exact strings.

**Canonical steps in order:**

```
OracleConversation MOUNTED          ok      — on component mount
ENV OK (Supabase vars)              ok      — validateEnvironment() passes
DECART INIT                         ok      — initializeOracle() starts
GEMINI WS CONNECTING                pending — connectToGemini() fires
GEMINI WS OPENED                    ok      — ws.onopen
GEMINI SESSION CREATED              ok      — session.created message
TAP → TERMINAL                      ok      — enterTerminal() user tap
LORE SEQUENCE STARTING              pending — immediately after TAP
LORE DONE → AWAKENED                ok      — awakeFromTerminal() fires
ORACLE ANNOUNCES TERRITORIES        ok      — territory sendTextMessage fires (+1200ms)
START SESSION (GREETING)            ok      — startSession() called in awakeFromTerminal
__ORACLE_BOOT__ path triggered      ok      — inside OracleConversation.startSession()
KNIFE[N] SELECTED: ...              ok      — selectKnifeQuestion() fires
SEEDING THEMES: ...                 ok      — knife themes logged
ORACLE PHASE ENTERED                ok      — setScenePhase('oracle') settled
FACE LOADED (base64)                ok      — OracleFaceRenderer.loadFace() resolves
RENDERER READY — idle animation     ok      — startIdleAnimation() running
startSession() CALLED               ok      — oracle-phase useEffect
SESSION ALREADY ACTIVE — terminal boot confirmed   ok   — second startSession() is no-op
ORACLE AUDIO START                  ok      — first PCM chunk of a turn
VISEME DETECTOR ACTIVE              ok      — VisemeDetector initialized on first chunk
MIC STARTED                         ok      — getUserMedia success
MIC FAILED: <message>               err     — getUserMedia rejected (expected in CI)
MIC STOPPED                         ok      — stopMic() called
ORACLE TURN COMPLETE                ok      — turnComplete signal from Gemini
ORACLE SCORE: <phase> / <align> / +<n>c   ok   — score parsed from turn
SCORE PARSE FAILED                  warn    — Oracle response missing [[ORACLE_SCORE]] block
ORACLE INTERRUPTED (barge-in)       warn    — serverContent.interrupted received
GEMINI WS ERROR                     err     — ws.onerror
GEMINI WS CLOSED (<code>)           ok/err  — code 1000 = ok, anything else = err
RECONNECTING FOR SESSION            pending — WS closed when startSession() called
DECART READY ✓                      ok      — onStreamReady fired
FREEMIUM PATH READY                 warn    — Decart failed or timed out, freemium active
GENERATING PORTRAIT...              pending
PORTRAIT GENERATED ✓                ok
```

**Never log `ORACLE ASKS FOR FREQUENCY`** — renamed to `ORACLE ANNOUNCES TERRITORIES` (fired inside the setTimeout, at the moment the message actually sends).

**Never have duplicate logs for the same state transition.** One step per event.

### 4. VAD Realtime Spine

The mic pipeline in `OracleConversation.tsx` follows this exact pattern:

```typescript
// 1. Encode FIRST — pre-roll buffer needs real audio data
const base64 = btoa(String.fromCharCode(...new Uint8Array(pcm.buffer)));
const chunk: VADFrame = { data: base64, mimeType: 'audio/pcm;rate=16000' };

// 2. Process through VAD
const result = vadRef.current.processFrame(input, chunk);

// 3. On onset: flush pre-roll (avoids clipping first phoneme)
//    Use else-if to prevent double-send of the onset frame
if (result.isOnsetStart) {
  vadRef.current.flushPreRoll().forEach(frame => { /* send */ });
} else if (result.isSpeaking) {
  // 4. Gate: only send to Gemini while VAD confirms speech
  wsRef.current.send(...);
}
```

**Never send all frames unconditionally** — that sends Oracle echo and room noise to Gemini.

**Never pass `{ data: '' }` to `processFrame`** — pre-roll accumulates empty strings, flush sends garbage.

**getUserMedia MUST use explicit constraints:**
```typescript
{ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } }
```

### 5. Brand Kit
- Palette: **greens, purples, black, white ONLY.** No red, orange, amber, or yellow.
- Knife card colors: emerald `#00ff88`, violet `#b026ff`, cyan `#00ccff`, neon-purple `#cc00ff`, mint `#00ffcc`.
- Particle alignment colors: sacred=`#00ffcc`, profane=`#b026ff`, neutral=`#00ff88`.
- Info/secondary labels: `#00ccff` (cyan). Warning/pending glows: `#b026ff`. Errors: `#cc00ff`.
- `CULTURAL ARCHITECT` tier: `#00ccff`. Sacred Interactions: `#00ffcc`.
- Any use of red/orange/amber/yellow (`#eab308`, `#ef4444`, `#c2410c`, `#f59e0b`) is a brand violation.
- **Enforcement sweep (2026-05-28):** all 8 backend panel components cleaned — `BackendControlPanel`, `CultureCoinDisplay`, `CultureCoinInlineDisplay`, `Learn2EarnInterface`, `InlineSubscriptionModal`, `ConnectingAnimation`, `PortraitGalleryDashboard`, `GoogleSignInOverlay`.
- Gradient text (`.oracle-marquee`, `.ghost-tx`): use `background-clip: text` + `filter: drop-shadow()`. Never `text-shadow` with chromatic aberration layers — they double/blur.

### 6. PCMPlayer — Audio Routing

```
Gemini Live PCM chunks (Int16Array, 24kHz)
  → PCMPlayer.feed()
      ├── source.connect(analyserNode)     ← VisemeDetector side-tap (read-only)
      └── source.connect(HRTF panner)      ← spatial playback (x=0, y=0.3, z=-0.8)
```

- PCMPlayer MUST be pre-created during `enterTerminal()` (the user gesture) so AudioContext is unlocked before the Oracle greets in `awakeFromTerminal()`.
- `playbackRate = ORACLE_PLAYBACK_RATE` (currently `1.0` — Charon voice is deep, pitch shift noticeable).
- Scheduled via `nextStartTime += buffer.duration / playbackRate` — guarantees gapless chunks.

### 7. OracleFaceRenderer — Pixel-Map Lip Sync

Canvas 2D pixel-warp technique: each frame, draw the full face, erase the original mouth with philtrum skin, then redraw upper/lower lip strips shifted apart; fill gap with dark cavity ellipse.

**MOUTH constants (calibrated 2026-05-28 by pixel scan on the actual portrait):**

```typescript
// i.postimg.cc/jSGnyZXh/Image-1-(11).jpg — 1280×640 CGI android face
const MOUTH = {
  cx: 640,    // face is PERFECTLY centred in source image
  midY: 305,  // lip midline — verified by scan lines
  halfW: 52,
  ulTop: 289, ulBot: 302,   // upper lip strip
  llTop: 303, llBot: 320,   // lower lip strip
  skinTop: 265, skinBot: 287, // philtrum (erase source)
  eraseHalfW: 62,
};
```

**Critical lessons:**
- Previous `midY:390` and `midY:344` BOTH landed on the chin — 35–85px below actual lips.
- `cx` was incorrectly changed to 580; face IS centered at 640.
- Separation multiplier boosted to 1.2× for CGI face (subtle natural mouth gap).
- Blink band corrected to Y=32–48% of canvas (eyes at Y=220-255 in source).

**VisemeDetector audio routing (never break this):**
- Analyser is NOT connected to `ctx.destination` — read-only side-tap only.
- `lerpVisemeState` always uses `b.viseme` (not conditional on amplitude direction).
- `PCMPlayer.connect(analyser)` replaces `this.destination`; `feed()` routes each source to BOTH analyser AND panner.

### 8. Component Standards
- Use surgical `Edit` tool updates — never rewrite a file for a 5-line fix.
- Maintain strict TypeScript. Avoid `any` where possible.
- Adhere to the CSS variable system in `SurrogateOracleImmersion.css`.
- No backwards-compat shims — if something is removed, remove all its references.

---

## Known Bugs (open)

| Bug | Severity | File | Notes |
|-----|----------|------|-------|
| Oracle breaks after ~10 turns | High | `OracleConversation.tsx` | Likely WS timeout or context limit; silent fail. Not yet investigated. |
| Oracle crashes when asked to use web tools | High | `OracleConversation.tsx` | Silent fail when Oracle tries tool-use. Likely Gemini tool config or system prompt issue. |
| Contemplative filler phrases | Medium | `OracleConversation.tsx` | No pre-rendered "thinking" audio while Oracle processes. Seeker sees silence. |
| Territory announcement race on WS reconnect | Medium | `awakeFromTerminal()` | `sendTextMessage` at +1200ms silently drops if WS reconnecting. Rare in practice (lore is 32s, WS reconnects in ~500ms). |
| `isGeminiConnected` stays true on WS drop | Medium | `SurrogateOracleImmersion.tsx` | `ws.onclose` in OracleConversation has no parent callback. `◈ OPENING CHANNEL...` hides incorrectly. |
| XR marker path missing PCMPlayer pre-creation | Medium | `onXRMarkerRef` callback | Marker detection is not a user gesture — AudioContext suspended on mobile Safari in XR path. |
| `createScriptProcessor` deprecated | Low | `OracleConversation.tsx` | Works in all browsers. Migrate to AudioWorklet when feasible. |

---

## Deployment
- **Web:** `npm run build` → deploy to Replit/Vercel.
- **Functions:**
  ```bash
  npx supabase functions deploy gemini-live-proxy --no-verify-jwt
  npx supabase functions deploy oracle-conversation gemini-portrait-generator
  ```

---

## Verification

```bash
# Start dev server first
npm run dev

# Run full pressure test (separate terminal)
node scripts/oracle-pressure.mjs
```

**Expected result: 86 passed, 0 failed** (desktop + mobile, 6 phases each).

Phases tested:
1. Dormant — ghost-tx, DormantHUD, WS pre-warm
2. Terminal — lore skip hook, awakened transition, territory announcement
3. Awakened — 5 knife cards, lore bridge overlay, Gemini warm
4. Oracle — conversation panel, __ORACLE_BOOT__ path, Oracle reply received
5. Freemium/VisemeDetector — canvas mounted, viseme fires, lip sync active
6. Exit + Reset — dormant restored, second journey possible

`MIC FAILED: Requested device not found` in CI output is expected — Playwright has no mic device. Not a test failure.
