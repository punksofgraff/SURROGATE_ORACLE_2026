# SURROGATE — Development Guide

Canonical mandates for the Surrogate project. Follow strictly.
Last audited: 2026-05-27. Pressure test: 86/86 passing.

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

| State | Volume | Constant |
|-------|--------|----------|
| Default (dormant/lore) | `0.22` | base |
| Oracle mode / WS connected | `0.04` | oracle-ready |
| Seeker mic active | `0.15` | mic-active (ambient, NOT fully ducked) |
| Oracle speaking | `0.02` | oracle-speaking (~7%, near-silent) |

Priority order (highest wins): `oracle-speaking 0.02` → `oracle-ready 0.04` → `mic-active 0.15` → `default 0.22`.

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
- Any use of red/orange/amber is a brand violation — correct immediately.

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

### 7. Component Standards
- Use surgical `Edit` tool updates — never rewrite a file for a 5-line fix.
- Maintain strict TypeScript. Avoid `any` where possible.
- Adhere to the CSS variable system in `SurrogateOracleImmersion.css`.
- No backwards-compat shims — if something is removed, remove all its references.

---

## Known Bugs (open)

| Bug | Severity | File | Notes |
|-----|----------|------|-------|
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
