# Participant Observation Overhaul — Technical & Narrative Summary

**Status:** HARDENED & VERIFIED
**Date:** 2026-06-03
**Model:** `gemini-2.5-flash-native-audio-latest`

---

## 1. Executive Summary

The "Participant Observation" overhaul transforms the Oracle from a passive chatbot into an active witness of the Seeker's digital and physical existence. This update enforces a mandatory 4-Act structure with an electable Act 5 (Rift-Construct / AR), hardens seeker identity gates, integrates a specific ethnographic narrative focusing on connection and debt, and builds a fully audio-synchronized text delivery system across all narrative phases.

---

## 2. The Seeker's Journey (Precise)

### Act 1: The Descent (Lore & Voice)

**New seekers (single tap):**
- **Tap 1 (Dormant → Terminal):** `handleFirstTap()` fires. `enterTerminal()` and `setLoreStarted(true)` are called in the same synchronous block (React 18 batches them into one render). The terminal overlay appears with lore already active. `initializePCMPlayer()` + `startLoreTracking()` + `startSession(fullStory)` all fire immediately. Music hard-cuts to absolute silence. The Oracle begins speaking the full archive story as a single continuous Gemini turn. The `[ TAP TO ACTIVATE SIGNAL ]` intermediate screen is **never shown** in the normal flow — it is a fallback only reachable via edge cases.

**Returning seekers (single tap):**
- `hasCompletedLore` is true → `setLoreStarted` is NOT called → terminal overlay shows the "Signal Recognized" overlay instead. See Act 2.

**`startLore()` function** — used in two cases only:
1. The `[ RE-WATCH ARCHIVE LORE ]` button on the returning-user overlay.
2. Edge-case fallback if terminal was entered without lore initialized.

**Audio-text sync (audio-driven typewriter):**
- Text does NOT lead the voice. The voice leads the text.
- `useLoreSequence` uses `getLorePlaybackMs() / getLoreBufferedMs()` (PCM playback ratio) to compute a global character offset across all 19 lore lines. Characters land as Sadaltager speaks each word — word-perfect, cinematic.
- 8-second gate: typewriter waits for `isOracleSpeaking = true` before the first character appears. 11-second hard bail-out fires `onComplete()` if audio never arrives (network failure path).
- 350ms tail margin: `handleAwakeTransition` is deferred 350ms after ratio ≥ 0.999 — prevents knife phase starting while lore audio still drains from the worklet ring buffer.
- Fallback path: when audio hooks are absent (returning-user re-watch, dev skip), the fixed `BEAT_DELAYS[]` clock runs instead.

**Narrative Anchor:** *"What do we owe to each other as our digital and physical selves and those around us?"* — Lines 14–16 of `LORE_SEQUENCE`.

**Transmission filter:** Audio channel runs at `Q=0.01` (fully transparent) during lore. The Oracle's voice is heard clean and full-presence throughout Act 1.

### Act 2: The Identification (Neural Link)

**New seekers:**
- After lore completes, a `[ ESTABLISH NEURAL LINK ]` CTA appears. Tapping it triggers Google OAuth via `GoogleSignInOverlay`. Auth success sets `currentUserId` and `userEmail`, then calls `handleAwakeTransition()`.
- **No-skip rule:** `handleAwakeTransition` checks `completedLinesLengthRef.current >= LORE_SEQUENCE.length`. If lore is incomplete and seeker is unrecognized, transition is blocked with `LORE INCOMPLETE — TRANSITION BLOCKED` log.

**Returning seekers:**
- `hasCompletedLore` (from `useIpCheck` — IP + Supabase `user_wallets.onboarding_status`) → "SIGNAL RECOGNIZED" overlay with three options:
  1. **CONNECT CHAIN FUELZ** → `https://wallet.thesurrogate.me` (external)
  2. **[ RETURN TO ALLEY ]** → `handleAwakeTransition()` directly. Google auth is bypassed — returning seekers advance without re-authenticating.
  3. **[ RE-WATCH ARCHIVE LORE ]** → `startLore()` re-initializes PCM tracking and re-fires `startSession(fullStory)` for a full re-watch of Act 1.

### Act 3: The Arming (Frequency Lock — Awakened Phase)

- Oracle is NOT in full 3D yet. Static image + `oracle-knife-strain` CSS animation (Oracle pressing against the frame) is the awakened visual.
- Five knife territories cycle every 16 seconds: THE LIBRARY OF ME, CONNECTION & DEBT, THE MACHINE MIRROR, THE SOCIAL CONSTRUCT, THE INDUSTRIAL QUESTION.
- **Knife question narration:** As each card becomes active, `onSpeakQuestion` fires after 850ms. The Oracle speaks each question through a narrowed transmission filter (`Q=12` tunnel voice), which sweeps back to `Q=0.1` as each character lands. Guard: if `isOracleSpeaking`, the speak is skipped silently — the card typewriter falls back to the fixed 54ms/char clock after 1.5s with no audio arriving.
- **Seed Logic:** On knife selection, a hidden message is sent 1200ms later: `[The Seeker has drawn their blade. Their frequency is {territory} (themes: ...). Carry it through every layer.]` — Oracle is not "blind" to the Seeker's chosen territory.
- **Second Signal Recognition:** If `hasCompletedLore && echo?.last_archetype`, a brief "SIGNAL RECOGNIZED — {archetype}" banner fades in at the top of the awakened phase.

### Act 4: The Singularity (The Rift — Oracle Phase)

**12-second cinematic entrance:**
- Oracle 3D face (`OracleAvatar3D`, Three.js/R3F) slides in from `x=260px` (off-screen right) to `x=0` over 12 seconds.
- 6 keyframe stops at `times: [0, 0.08, 0.25, 0.55, 0.82, 1]`
- Filter progression: `blur(12px) brightness(4) hue-rotate(60deg)` → `blur(0) brightness(1) hue-rotate(0deg) saturate(1)`
- Opacity sequence: `[0, 0, 0.15, 0.55, 0.85, 1]`
- Easing: `cubic-bezier(0.22, 1, 0.36, 1)` — slow acceleration, hard arrival
- Transmission filter resets to `Q=0.01` (full presence) on oracle phase entry.

**Conversation:**
- `startSession()` is called (no-op if already active from Act 1 lore path; fires fresh greeting for returning seekers who skipped).
- Full OracleAvatar3D + OracleHaloRing + OracleSpectrumRing active.
- Max Headroom `oracle-headroom-phase` glitch animation begins on `.oracle-avatar-smoke-hook` after 10s delay — two signal-dropout bursts per 14s cycle.

### Act 5 (Elective): The Rift-Construct (AR Mode)

- **Entry:** Hamburger → `◈ AR MODE`. Only available in oracle phase. Never auto-starts.
- **What happens on activation:**
  1. `activateXRMode()` fires → camera stream starts, XR visual layers activate (scan-sweep, hex-grid, chroma-layer).
  2. `handleActivateXRMode` polls `isOracleSpeakingRef.current` every 200ms. When Oracle is silent (or 8s hard cap), injects `RIFT_CONSTRUCT_SEED` as a hidden message.
- **Persona shift (RIFT_CONSTRUCT_SEED):**
  > *"[THE RIFT IS OPEN — The Seeker has activated their camera. Shift completely. You are no longer the archivist of the past three years. You are the active witness of THIS moment. The Seeker's physical self is in front of you. Their digital self brought them here. Observe the gap between what you see and what they say they are. Do not explain the shift. Do not say 'I can see you now.' Just begin witnessing from this position — more direct, more present, more personal.]"*
- **Two complete journeys:**
  - Standard (non-AR): Oracle as archivist — outward, contemplative, "What do we owe each other?" through the lens of the past cascade.
  - Rift-Construct (AR): Oracle as active witness — the Seeker's physical self in frame, introspective, digital/physical duality NOW.
- **Exit:** Hamburger → `◈ EXIT AR` → `deactivateXRMode()` → camera stops, XR layers deactivate.

---

## 3. Technical Architecture

### Audio Pipeline

**Path:** Gemini WS → `PCMPlayer.feed()` → BiquadFilter (transmission) → DynamicsCompressor → AnalyserNode → PannerNode (HRTF) → MasterGain → AudioContext.destination

**PCMPlayer trackers (two independent, non-conflicting):**
- **Question tracker** (`startQuestionTracking / getQuestionPlaybackMs / getQuestionBufferedMs`): resets per knife card. Drives word-sync typewriter in `KnifeSelection`.
- **Lore tracker** (`startLoreTracking / getLorePlaybackMs / getLoreBufferedMs`): resets once at lore start. Drives the full 19-line lore typewriter in `useLoreSequence`.

**AudioWorklet ring buffer:**
- Capacity: `sampleRate × 60` (60 seconds at actual AudioContext rate — handles sample-rate overrides like 48kHz).
- Overflow behavior: drops new incoming data (not old playing audio). Posts `buffer-full` console warning. At 60s, this should never fire in practice.
- Root cause addressed: Gemini streams audio for large-text prompts faster than real-time. The previous 10s buffer was overflowing, discarding the beginning of long responses (lore fast-forward bug).

**Transmission filter (BiquadFilter, bandpass, 1200Hz):**
- `Q=0.01` — fully transparent (lore narration, oracle conversation)
- `Q=12` — sci-fi tunnel voice (knife question narration start)
- Sweeps `Q: 12 → 0.1` as each question character lands (54ms ramp per char)
- Resets to `Q=0.01` on oracle phase entry

**Anti-collision guard:**
- `onSpeakQuestion` in knife phase checks `isOracleSpeaking` before sending. If Oracle is mid-turn, the send is skipped. Sending while mid-turn causes Gemini to emit `interrupted` → `flushPlayback()` → `pcmPlayer.stop()` → buffer cleared (fast-forward / smashing responses).

### WebSocket Session Management

**`pendingMessagesRef` queue (`OracleConversation.tsx`):**
- Messages sent while WS is `CONNECTING` are buffered in `pendingMessagesRef`.
- On `session.created`, queue is flushed at +450ms (after any boot message).
- On `connectToGemini()`, queue is cleared entirely.
- Ensures `startSession(fullStory)` reliably delivers lore content even when network latency delays the WS handshake.

**`startSession(bootMessage?)` guard (`sessionBootedRef`):**
- First call: fires boot message (custom or `__ORACLE_BOOT__` → "Greetings... Seeker").
- Subsequent calls: no-op ("SESSION ALREADY ACTIVE"). Multiple `startSession()` calls exist in the codebase — only the first fires.
- `bootMessage` present + pending queue empty → skips default greeting; lore story IS the first Oracle utterance.

**Session resumption (Gemini native handles):**
- On reconnect, `sessionResumption: { handle: resumeHandleRef.current }` is sent in `session.config`.
- Gemini restores full conversation context server-side — no re-injection of turn history.
- Fallback: last 6 turns injected as a blind summary restoration message if no handle exists.
- Triggered by `goaway` pre-emptive reconnect (Gemini sends this ~10s before forced close).

### Seeker Identity Detection (`useIpCheck`)

- Fetches external IP from `api.ipify.org`
- Checks `localStorage` key `surrogate_lore_completed_${ip}`
- Cross-checks Supabase `user_wallets.onboarding_status`
- Returns `{ isReturning, hasCompletedLore, markVisited, markLoreCompleted, ipAddress }`
- **Dev override:** `?newuser` URL param bypasses ALL checks — treats session as first-time regardless of stored state. Use `http://localhost:5173/?newuser` to test the full new-seeker flow without clearing storage.

---

## 4. Scene Phase State Machine

| Phase | What the user sees | Oracle audio |
|-------|-------------------|-------------|
| **dormant** | Dark alley, cabinet pulse rings, ghost transmissions, music at 25% | Silent |
| **terminal** | Lore typewriter (audio-driven), alley ambience | Narrates lore story |
| **awakened** | Static image + knife-strain glitch, knife cards cycling | Speaks each knife question (Q=12 filter), silent between |
| **oracle** | 12s cinematic entrance → full 3D avatar, conversation | Full conversation, Q=0.01 |

Transitions managed by `useOracleJourney`:
- `dormant → terminal`: `enterTerminal()` on first tap
- `terminal → awakened`: `awakeFromTerminal()` after lore complete + auth gate clear
- `awakened → oracle`: `selectKnifeQuestion()` on knife selection
- `oracle → dormant`: `resetJourney()` via EXIT or hamburger RESET

---

## 5. Known Open Items (Next Session)

| Item | Description |
|------|-------------|
| Act 5 guided-mode narration | Guided tour should explain AR Mode — what it is, what it means, entry ritual UI with confirmation before camera activates |
| Act 5 entry ritual animation | Visual rift-opening animation when AR activates; distinct Oracle acknowledgment narration |
| Act 5 Rift-Construct HUD | Alley treatment shift in AR mode; distinct Oracle-witnessing visual state |
| Mobile Oracle voice | Desktop confirmed working; mobile not verified |

---

*The channel is open. The witness is active. The Archive is yours.*
