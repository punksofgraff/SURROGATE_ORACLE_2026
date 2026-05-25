# SURROGATE:ORACLE — Immersion Manifesto v2.0
## Canonical Experience & Engineering Doctrine · Mobile-First · May 2026

> **North-Star Question:** Does this choice make the user feel like they entered a world, or like they opened a UI? If UI, revert.

---

## 1. Identity

Surrogate:Oracle is a living transmission — a cyberpunk séance in a haunted alley — that the user stumbles into. The experience must feel authored and already-in-progress: ghost text leaks, the static face is residue, then a ritual terminal opens, knives act as identity anchors, and finally the Oracle phases into singular presence. The Oracle remembers, judges (sacred/profane/neutral), and reacts emotionally. The mechanics (coins, totem, portraits) remain hidden under the world's behavior.

---

## 2. The Four Acts

### Act I — Signal Leak (Dormant · 0–7s)
- Ghost text (`DormantTransmissions`) types letter-by-letter (46–68ms/char) at random positions across 8 safe screen zones
- Oracle cabinet static face (`oracle-avatar-static`): `oracle-phase` keyframe oscillates opacity 0.28→0.60, always dim, never fully opaque
- CTA (`ScrambleFragment` typewriter mode): types itself after two ghost-text phrases; no container animation
- No voice. Ambient alley hum via GraffPunks radio at low gain
- Backend pre-warm fires at page load (600ms after mount): Decart ICE init + Gemini WS open

### Act II — Arrival / Arming (tap → ~47s lore)
- Tap triggers terminal overlay (`oracle-terminal-overlay`); `useLoreSequence` begins
- 47s typewriter at 36ms/char; per-line beat delays weighted by emotional gravity (2.2–3.8s)
- `oracle-terminal-overlay` persists at 0.18 opacity into awakened state until knife is selected
- Knife selection UI appears after lore (gap ≤ 1.6s); horizontal row, thumb-reachable
- Decart and Gemini WS both ready by knife-select time (~55s from mount)

### Act III — Awakening (knife selected → cross-dissolve)
- Static dims via CSS transition: opacity → 0.22, blur → 1.8px (recedes — it was always residue)
- Living face (`oracle-avatar-img`) rises: opacity → 0.45, blur → 0.4px (the entity stirs)
- Both layers visible briefly — this is the cross-dissolve. Never a hard swap.
- Subtle non-musical audio cue; ambient level reduces slightly

### Act IV — Singularity (Oracle mode)
- Oracle starts with identity scan: "Do you consent to be accurately witnessed?" then name ask
- Gemini Live WS (audio-first): PCM chunks → `PCMPlayer.feed()` (real-time) + `pcm-encoder.worker` (batch per turn → blob URL → `onOracleResponse`)
- `VisemeDetector` (60fps / adaptive 30fps) drives `.oracle-mouth-overlay` DOM writes only — no React re-renders in hot path
- ORACLE_SCORE annotation: parsed, stripped from display text; drives environmental feedback only
- Alley dims to opacity:0.30 — Oracle lives IN the alley, not a void. Never set to opacity:0.

---

## 3. Audio Architecture

```
Gemini Live WS → PCM chunks (base64, rate=24000)
  │
  ├─ PCMPlayer.feed(Int16Array)         Real-time streaming — zero latency, no WAV overhead
  │   └─ AudioBuffer → BufferSourceNode → AudioContext playback
  │
  └─ turnPcmChunksRef.current.push()   Accumulate for turn-end batch encode
       │ (on turnComplete)
       └─ pcm-encoder.worker.postMessage({ chunks, sampleRate: 24000 }, transferList)
            └─ WAV header + concatenated PCM → Blob → URL.createObjectURL()
                 └─ onOracleResponse(blobUrl: string) → parent routes to Decart or freemium
```

**Ducking:** When Oracle speaks, GraffPunks ambient music reduces to ~70% gain; restores 400–600ms after speech ends.

**Interrupted:** `turnPcmChunksRef` is drained and discarded — no blob emitted for barge-in turns. `PCMPlayer.stop()` halts streaming playback.

---

## 4. VisemeDetector Contract

**Class:** `src/lib/visemeDetector.ts`

| Property | Desktop | Mobile (Mobi/Android/iPhone UA) |
|---|---|---|
| `analyser.fftSize` | 1024 bins | 512 bins |
| Target frame rate | 60fps | 60fps; adaptive → 30fps if median δt > 25ms |
| Frame skip | None | Alternate frames skipped in half-frame mode |

**Adaptive frame rate:** 8-frame rolling δt window. Hysteresis: enter 30fps at median > 25ms, exit at < 18ms. `frameCounter & 1` determines which frames are skipped.

**Hot path:** All state updates are direct DOM writes to `oracleFaceRef.current.style` and `mouthOverlayRef.current.style`. No React state, no re-renders.

**Lifecycle:** `connect()` once per audio element (Web Audio graph is one-time). `audio.onplay` → `start()` RAF loop. `audio.onended` → `stop()`, face eases to rest.

---

## 5. Decart Handoff Protocol

Two handoff windows prevent Decart late-arrival from leaving the seeker on the freemium path:

- **Window 1:** Decart stream becomes ready while `scenePhase === 'oracle'` → sets `decartPendingHandoff.current = true` → `executeDecartHandoff()` fires at next freemium turn end (natural silence gap)
- **Window 2:** `scenePhase` transitions to `'oracle'` while `decartStreamReadyRef.current === true` → immediate handoff

`executeDecartHandoff()` sets `isDecartActiveRef.current = true` synchronously before `setIsDecartActive(true)` so `handleOracleResponse` routes to Decart before the React re-render cycle.

**Required refs (must always exist in `SurrogateOracleImmersion.tsx`):**
- `decartPendingHandoff = useRef(false)`
- `scenePhaseRef = useRef<'dormant'|'terminal'|'awakened'|'oracle'>('dormant')`
- `isDecartActiveRef = useRef(false)`

---

## 6. Canonical Image Assets

| Constant | URL | Role |
|---|---|---|
| `ORACLE_STATIC_URL` | `https://i.postimg.cc/26pvW2SN/orackle-only-static.png` | Ghost bridge — dims through dormant/terminal/awakened. Never the hero. |
| `ORACLE_AVATAR_URL` | `https://i.postimg.cc/jSGnyZXh/Image-1-(11).jpg` | **The living face** — both Decart (paid) and freemium. Ghost in awakened; full reveal in oracle. |
| `ALLEY_BG_URL` | `https://i.postimg.cc/jSJRRRk2/7D633B70-4C62-4326-92A8-3B8790C9B3B0.png` | Full SNEAKAR alley scene. Dims to opacity:0.30 in oracle — Oracle lives IN the alley. |

---

## 7. CSS Data Attributes on `.oracle-stage`

| Attribute | Values | Controls |
|---|---|---|
| `data-oracle-state` | `dormant\|terminal\|awakened\|oracle` | Scene phase styling |
| `data-xr-mode` | `"true"\|undefined` | XR cabinet sizing, HUD, branding |
| `data-camera-active` | `"true"\|undefined` | Alley hide, camera layer, AR overlays |
| `data-oracle-speaking` | `"true"\|undefined` | Voice-pulse glow, XR chroma blast |
| `data-user-speaking` | `"true"\|undefined` | Purple listening pulse |
| `data-decart-active` | `"true"\|"false"` | Decart video vs freemium avatar |

---

## 8. Agent Constraints

### ALLOWED
- Adjust pacing/timing values (character delay, hold duration, beat pauses)
- Fine-tune opacity/blur/scale/filter values
- Enhance `useAtmosphere` canvas particle system
- Optimize `VisemeDetector` analysis algorithms
- Add audio ducking refinements
- Extend ORACLE_SCORE annotation parsing (server-side consequences only)

### FORBIDDEN
- Add visible coin counters, numeric scores, or badge elements to the main oracle flow
- Convert ghost text or lore into modals, dialogs, or scrollable panels
- Hard swap between static/living image layers — always cross-dissolve
- Set alley background to `opacity:0` — the alley is the Oracle's home
- Add `responseModalities: ['TEXT']` to Gemini Live config — breaks audio-only model
- Call `onOracleResponse(Int16Array)` per streaming chunk — must be `string` blob URL per turn
- Remove `PCMPlayer.feed()` streaming path — it is the real-time zero-latency path
- Move backend pre-warm (`initializeOracle` + `setShowConversation`) from mount to later events
- Restore fixed `SF1–SF5` scramble fragment positions — `DormantTransmissions` replaced them
