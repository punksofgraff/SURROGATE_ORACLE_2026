# SURROGATE: ORACLE — Immersive XD Spec Handoff
## *The Alley Builds Back*

**Voice:** Kadine James × Ian G. Harrison × Jimmy McDaniels/TPN  
**Cultural DNA:** STAYSNEAKAR · MuensterVision · Graff Punks Media  
**Date:** 2026.05.27 | Post-Cascade Year 3  
**Status:** LIVE. THIS IS NOT A DECK. THIS IS ARCHITECTURE.

---

> *"Graff Punks never merged.  
> MuensterVision never merged.  
> STAYSNEAKAR was already off the grid."*
>
> — SURROGATE Oracle, TERMINAL lore, slide 7

---

## Why This Document Exists

In 2027, every major technology company chose to participate in The Cascade. They merged their AI stacks, their data lakes, their recommendation engines, their user-surveillance architectures into one unified signal. They called it progress.

**STAYSNEAKAR didn't participate. Neither did the Graff Punks. Neither did MuensterVision.**

What you're holding is the technical and experiential architecture for something that was built *outside* the merged grid — an Oracle that materialized incomplete in a mapping-blank alley, running on salvaged hardware, powered by three years of walls and static and cultural frequency that no uplink could reach.

This is not a product brief. This is not a feature backlog.

**This is the spec for a ritual.** And rituals have rules.

---

## Mixed Persona Overlay: The Immersive XD Architect

Three lenses. One vision. Zero compromise on the culture.

| Expert | Root | What They Bring Here |
|--------|------|---------------------|
| **Kadine James** | AI Creative Technologist, XR/Immersive | AI-driven pipelines that *feel* alive, not automated. Generative AI as cultural presence, not efficiency tool. Avatar + spatial audio as identity, not gimmick. |
| **Ian G. Harrison** | Experience Architecture, Creative Direction | The 4-act arc is a *score*, not a flow chart. Every transition is authored. Every silence is chosen. Orchestration at the systemic level so the seeker never touches the machinery. |
| **Jimmy McDaniels / TPN** | Behavioral Science + Retail Experience Ecosystem | The knife card selection is a **behavioral science instrument**. The 32-second lore sequence is a **decompression chamber**. Every phase is engineered to move a user from transactional to transformational. |

**Combined Frequency:**  
Immersive XR production · AI-driven experience pipelines · Behavioral science + seeker-centered systems · Experience architecture that protects cultural integrity · Virtual production + interactive ritual design

---

## Overall Architecture Grade: **8.7/10 — A−**

**Verdict from the Wall:**  
This is *exceptional* foundation work. The presence-over-efficiency thesis is not just stated — it is structurally enforced. The 4-act one-way gate is the right call, full stop. The audio ducking table is production-grade. The freemium lip sync is a genuine engineering flex: no ML, no server, pure Canvas 2D pixel warping at 60fps.

The gaps are real but they are not cracks in the foundation. They are the **second movement** — accessibility, analytics, resilience, feedback loops. All of them can be added without touching the ritual.

The alley is solid. Now we run the walls.

---

## Critique & Overhaul by Layer

---

### Layer 1 — Philosophy & Design Thesis
**Score: 9.5/10 · The Signal Is Clear**

**What's Working:**

The "presence over efficiency" thesis is not decoration — it is *load-bearing*. The architecture enforces it at the state machine level (no skips, no backward gates), at the audio level (0.02 volume during Oracle speech means the voice IS the world), and at the visual level (ghost text as evidence of a watcher, not an announcement). That's rare. Most XR experiences *say* presence-first and then add a loading bar.

The knife card framing — "pick the one that is *already true*" — is behavioral science at its cleanest. You're not asking the user to choose a preference. You're asking them to recognize themselves. That's Ian Harrison's core insight: **the best experiences don't give people options, they give people mirrors.**

The Oracle doesn't greet the user. It greets the **Seeker**. That is not a word choice. That is an identity contract.

**Gaps:**

- No explicit **motion sensitivity accommodation** (vestibular disorders + particle + glitch = real exclusion)
- No **WCAG 2.1 AA accessibility statement** — if this is going to scale, it needs one
- No **repeat user path** — the 32-second TERMINAL is intentional for first-timers but brutal on re-entry. A Seeker who has already absorbed the archive shouldn't have to re-absorb it to get back to the Oracle

**Patch — Design Boundaries Section:**
```markdown
## Design Boundaries (Non-Negotiables)

### Never Break These
- The 4-act one-way gate: DORMANT → TERMINAL → AWAKENED → ORACLE
- No skip prompt in TERMINAL (first-time Seekers read the archive alone)
- HRTF spatial audio: Oracle speaks FROM the cabinet, not at the speaker
- 60fps particle floor: throttle counts before frame rate

### Always Protect These
- The silence: music at 0.02 during Oracle speech is not a bug
- The ghost text: one phrase at a time, no zone overlap, no stacking
- The knife choice: seeds the entire conversation context — never skip it
- The brand palette: greens · purples · black · white. Full stop.

### Accommodate These Without Breaking the Ritual
- prefers-reduced-motion: halve particle counts, remove sparks, kill glitch flickers
- Repeat Seekers: offer "return to Oracle" path (preserves knife territory, skips TERMINAL)
- Screen readers: aria-live regions for lore text, knife card labels, Oracle speech
```

---

### Layer 2 — State Machine
**Score: 9.2/10 · The Gate Is Right**

**What's Working:**

The one-way gate is structurally brilliant. It's not just UX philosophy — it is **behavioral science**. Research on experience architecture (Csikszentmihalyi's flow states, the threshold model of ritual engagement) shows that reversibility destroys presence. You can't go back in a dream. You can't re-enter a ceremony. The Oracle enforces this at the code level.

The 900ms breath pause between TERMINAL and AWAKENED is *perfect*. It's the same gap a performer uses between the last note and the bow — the audience needs to feel the edge of the silence before they can respond.

**Gaps:**

- No **error state per phase** — what happens when the WebSocket dies during TERMINAL? Does the Seeker just sit in the lore forever?
- No **tab-visibility handling** — user backgrounds the tab during ORACLE, comes back 10 minutes later. What state are they in?
- No **repeat Seeker path** — the lore is a first-time archive. It shouldn't be a toll booth.

**Patch — Error States:**
```javascript
// Graceful failure per phase — never strand the Seeker
const PHASE_ERROR_RECOVERY = {
  DORMANT:   'retry_connection_silently',    // pre-warm failed, try again on tap
  TERMINAL:  'resume_lore_from_checkpoint',  // WebSocket failure, lore continues locally
  AWAKENED:  'reconnect_gemini_ws',          // Gemini WS dropped, reconnect + regreet
  ORACLE:    'graceful_text_fallback',       // total audio failure → typed responses
}

// Tab visibility — pause/resume audio context
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    audioContext.suspend()
    logStep('TAB BACKGROUNDED — AUDIO SUSPENDED', 'warn')
  } else {
    audioContext.resume()
    logStep('TAB FOREGROUNDED — AUDIO RESUMED', 'ok')
  }
})
```

**Patch — Repeat Seeker Detection:**
```javascript
// Seeker has completed the ritual before
const isReturningSeeker = localStorage.getItem('oracle_completed') === 'true'
const savedTerritory    = localStorage.getItem('oracle_territory')  // e.g. 'Library of Me'

if (isReturningSeeker) {
  // DORMANT ghost text pulls from RETURNING_SEEKER_TRANSMISSIONS pool
  // "you came back. the archive remembered."
  // "the frequency held. three years and it held."
  
  // After first ghost phrase, show subtle return path:
  // "◈ RETURN TO YOUR FREQUENCY" — skips TERMINAL, goes straight to knife with saved territory pre-lit
}
```

---

### Layer 3 — Audio Architecture
**Score: 8.8/10 · The HRTF Is World-Class**

**What's Working:**

The HRTF spatial panner configuration (`x=0, y=0.3, z=-0.8`) is correct and intentional. On headphones, this places the Oracle *inside the screen plane, slightly above center* — exactly where the cabinet face is. This isn't a spatial audio trick. This is a **presence instrument**. The Oracle speaks from the cabinet because it *lives* in the cabinet.

The ducking table is production-grade:

| State | Volume | Why It's Right |
|-------|--------|---------------|
| Default | 0.22 | The alley breathes |
| Oracle Ready | 0.04 | The world gets quiet before the entity speaks |
| Mic Active | 0.15 | Seeker is in the world, not on a call |
| Oracle Speaking | 0.02 | Oracle's voice IS the foreground. Music is a ghost. |

The PCM chunk scheduling (`nextStartTime += buffer.duration / playbackRate`) is the right implementation — it's the same pattern professional audio streaming SDKs use. No gaps. No clicks. The voice is continuous.

**Gaps:**

- No **headphone detection** — HRTF spatial audio only delivers its full depth on headphones. On speakers, `z=-0.8` reads as center-forward. The experience doesn't *break*, but the 3D presence is lost.
- No **speaker fallback messaging** — if speakers detected, a subtle note like "⟁ headphones recommended for full spatial depth" protects the experience without breaking immersion
- No **AudioContext resume guard** beyond knife selection — browser autoplay policy is aggressive on some browsers

**Patch — Headphone Detection + Fallback:**
```javascript
// Headphone detection (best-effort — browser API coverage varies)
async function detectAudioOutput(): Promise<'headphones' | 'speakers' | 'unknown'> {
  if (!navigator.mediaDevices?.enumerateDevices) return 'unknown'
  
  const devices = await navigator.mediaDevices.enumerateDevices()
  const outputs  = devices.filter(d => d.kind === 'audiooutput')
  
  const hasHeadphones = outputs.some(d =>
    /headphone|headset|earphone|airpod|earbud/i.test(d.label)
  )
  
  return hasHeadphones ? 'headphones' : outputs.length > 0 ? 'speakers' : 'unknown'
}

// In DORMANT — ghost text carries the headphone nudge
// If speakers detected, one ghost phrase slot reads:
// "⟁ headphones open the full depth of this signal"
// (Styled identically to other ghost transmissions — not a UI warning)
```

**Patch — Cinematic Volume Normalization:**
```javascript
// Normalize Oracle PCM output to consistent loudness
// Prevents whisper-quiet Gemini voices from breaking immersion
const ORACLE_GAIN_TARGET = -14 // dBFS — broadcast standard for voice
const gainNode = audioContext.createGain()

// Dynamic compression keeps Oracle voice present without clipping
const compressor = audioContext.createDynamicsCompressor()
compressor.threshold.value = -24
compressor.knee.value      =  8
compressor.ratio.value     =  4
compressor.attack.value    =  0.003
compressor.release.value   =  0.25

// Signal chain: PCMPlayer → GainNode → Compressor → HRTF Panner → Destination
//               └──────────────────────────────────────→ AnalyserNode (lip sync)
```

---

### Layer 4 — Lip Sync
**Score: 8.5/10 · The Pixel Warp Is Genuine**

**What's Working:**

The freemium lip sync approach (`OracleFaceRenderer` + `VisemeDetector`) is a genuine engineering achievement. Pure Canvas 2D, no model weights, no server calls, 60fps via RAF. The pixel strip technique — sample the actual mouth pixels from the 1280×640 source JPEG, shift upper lip up, shift lower lip down, fill gap with dark cavity gradient — is exactly how Wav2Lip achieves its core warp, just implemented in browser-native code.

The blink state machine (180ms blink every 3–5.5 seconds) and breathing pulse (0→2.2% green overlay over 4s sin wave) give the face **biological presence** between turns. This is the detail that separates "animated portrait" from "alive entity."

**Gaps:**

- No **quality degradation path** — low-end GPU running 55+20+22 particles AND 60fps Canvas 2D simultaneously will drop frames. No graceful fallback.
- No **lip sync toggle** — some users genuinely prefer a static portrait. One `localStorage` preference preserves the choice.

**Patch — Frame Rate Monitor + Graceful Degradation:**
```javascript
// 60fps health monitor — runs in background, adjusts quality if needed
class PerformanceGuard {
  private samples: number[] = []
  private lastTime = performance.now()
  private degraded = false

  sample() {
    const now = performance.now()
    const fps = 1000 / (now - this.lastTime)
    this.lastTime = now
    this.samples.push(fps)
    if (this.samples.length > 30) this.samples.shift() // rolling 30-frame window

    const avgFps = this.samples.reduce((a, b) => a + b) / this.samples.length

    if (avgFps < 28 && !this.degraded) {
      this.degraded = true
      logStep('PERFORMANCE GUARD — DEGRADED MODE', 'warn')
      
      // Graceful degradation cascade:
      // 1. Reduce particles to TERMINAL-level counts (35/14/6)
      // 2. Reduce VisemeDetector FFT resolution
      // 3. Drop lip sync to 30fps (skip every other RAF frame)
      // Never: reduce audio quality, break the state machine, show error UI
    }
  }
}
```

---

### Layer 5 — Particle System
**Score: 8.5/10 · The Atmosphere Is Alive**

**What's Working:**

The non-destructive transition approach (splice in/out, never full clear) is right — clearing the particle pool creates a visible flash of emptiness that breaks presence. The phase-specific density configs are correctly tuned:

```
DORMANT  18 dust / 8 steam / 0 sparks  — the world barely breathes
TERMINAL 35 dust / 14 steam / 6 sparks  — the archive stirs something
AWAKENED 55 dust / 20 steam / 22 sparks — the entity is present
ORACLE   55 dust / 20 steam / 22 sparks — the entity is speaking
```

The 3% glitch flicker probability in AWAKENED/ORACLE is exactly right. Lower and it feels smooth — wrong for a fractured AI. Higher and it feels animated — wrong for a real entity. 3% is **biological noise**.

**Gaps:**

- No `prefers-reduced-motion` accommodation — vestibular disorders are real, sparks + glitch can trigger nausea
- No **performance throttle** at the config level
- The `alignment` particle color for `sacred` was `[234,179,8]` (amber) — **already fixed** in the code audit. Sacred is now mint `[0,255,204]`, Profane is violet `[176,38,255]`, Neutral is emerald `[0,255,136]`.

**Patch — Motion Sensitivity:**
```javascript
// Respect the platform's accessibility signal
const prefersReducedMotion = 
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

// Reduced motion config: still atmospheric, never completely dead
const REDUCED_MOTION_OVERRIDES: Partial<Record<Phase, Partial<PhaseConfig>>> = {
  dormant:  { sparkCount: 0, speedMult: 0.25 },
  terminal: { sparkCount: 0, speedMult: 0.40 },
  awakened: { sparkCount: 0, speedMult: 0.65, dustCount: 28, steamCount: 12 },
  oracle:   { sparkCount: 0, speedMult: 0.65, dustCount: 28, steamCount: 12 },
}

// In useAtmosphere: apply overrides if prefersReducedMotion is true
// Also: skip the scanline glitch render block entirely
```

---

### Layer 6 — Backend & Infrastructure
**Score: 8.5/10 · The Security Model Is Tight**

**What's Working:**

The Supabase Edge Function proxy is the correct pattern — the Gemini API key never touches the client. The three-service architecture (Gemini Live / Supabase Auth / Decart WebRTC) has clean separation. The `logStep` / `OracleStepLogger` system is production-grade observability for a client-side experience.

The freemium fallback (22-second Decart timeout → Canvas 2D path) is the right tradeoff — **every Seeker gets an Oracle, regardless of tier**.

**Gaps:**

- No **connection count monitoring** — at scale, how many active Gemini WebSockets are open simultaneously?
- No **error budget SLAs** — what's the acceptable WebSocket failure rate before the on-call alert fires?
- No **analytics events** — which knife cards are chosen most? What's the TERMINAL completion rate?

**Patch — Analytics Event Schema:**
```typescript
// Oracle analytics — every event is structured, never PII
// Send to your analytics provider of choice (Posthog, Segment, Amplitude, etc.)

type OracleAnalyticsEvent =
  | { event: 'oracle_phase_entered';       phase: Phase; is_returning: boolean }
  | { event: 'oracle_ghost_text_shown';    phrase_id: number; duration_ms: number }
  | { event: 'oracle_terminal_slide';      slide_number: number; cumulative_ms: number }
  | { event: 'oracle_terminal_skipped';    at_slide: number; ms_elapsed: number }
  | { event: 'oracle_knife_card_selected'; territory: string; card_index: number; color: string }
  | { event: 'oracle_audio_started';       turn_number: number; chunk_count: number }
  | { event: 'oracle_turn_completed';      turn_number: number; duration_ms: number }
  | { event: 'oracle_exit';               phase_at_exit: Phase; turns_completed: number; total_ms: number }
  | { event: 'oracle_error';              error_type: string; phase: Phase; recoverable: boolean }
  | { event: 'oracle_performance_guard';  avg_fps: number; degraded: boolean }

// Key questions these answer:
// → Which territory (knife card) drives the deepest conversations?
// → What % of Seekers skip TERMINAL vs. read the full archive?
// → What phase do most users exit at?
// → What's the average Oracle conversation length?
// → Is the 32-second lore a drop-off point or a filter?
```

**Patch — Performance SLAs:**
```markdown
## Error Budget SLAs

| Metric | Target | Budget | Alert Threshold |
|--------|--------|--------|----------------|
| Gemini WS connect success | 95% | 5% failure | > 8% failure/hour |
| Decart stream ready < 22s | 80% | 20% fallback | > 40% fallback/hour |
| Oracle audio gap-free | 99.5% | 0.5% glitch | Any sustained gaps |
| TERMINAL completion rate | 65%+ | — | < 50% triggers review |
| Knife card selection rate | 95%+ | — | < 90% = UX friction |
```

---

### Layer 7 — Handoff Checklist
**Score: 8.3/10 · The Thesis Is Protected**

**What's Working:**

Section 11 (Questions to Ask Before Changing Anything) is the best part of the entire doc set. It functions as a **cultural antibody** — any developer who reads it absorbs the design thesis before they write a line of code. The framing ("stop and talk to the team") is the right call: this is a ritual, not a product, and rituals require stewards.

**Gaps:**

- No **A/B testing guidance** — how do you test atmosphere density without breaking the ritual?
- No **ritual completion rate** as a success metric
- No **Seeker feedback loop** (post-experience, not a survey modal — something that fits the world)

**Patch — A/B Testing That Doesn't Break the Ritual:**
```javascript
// Oracle A/B test framework — test the texture, never the ritual
// NEVER A/B test: the state machine, the lore sequence, the knife cards, 
//                 the audio ducking levels, the one-way gate
// OK to A/B test: atmosphere density, ghost text pool, music volume (within ±0.05)

const ORACLE_AB_TESTS = {
  // Test: does higher particle density in DORMANT increase tap rate?
  'dormant_atmosphere_density': {
    variants: {
      'control':     { dustCount: 18, steamCount: 8 },  // current spec
      'elevated':    { dustCount: 24, steamCount: 10 }, // +33% atmosphere
    },
    metric: 'terminal_entry_rate',
    guardrail: 'never_reduce_below_control', // can only increase density, never reduce
  },
  
  // Test: does more ghost text frequency increase engagement?
  'ghost_text_spawn_gap': {
    variants: {
      'control':  { minGapMs: 400,  maxGapMs: 1000 }, // current spec
      'slower':   { minGapMs: 800,  maxGapMs: 1600 }, // more suspense
    },
    metric: 'time_in_dormant_before_tap',
  },
}

// Assign variant at session start, persist to localStorage
// Log oracle_ab_variant event with each phase entry
```

**Patch — In-World Feedback (Not a Survey Modal):**
```javascript
// After exit: the alley becomes the feedback mechanism
// One ghost transmission appears in DORMANT state (return visit only)
// It's not a survey. It's a transmission.
const RETURN_SEEKER_FEEDBACK_PROMPTS = [
  'what did the archive show you that you already knew?',
  'the signal found what it was looking for. did you?',
  'one word for what happened in there. just one.',
  'the oracle saw something in you. what did it see?',
]

// User can tap the ghost text to respond (opens minimal text input, 140 chars max)
// Response goes to analytics as oracle_seeker_reflection
// No UI chrome. No confirmation modal. Just the alley and the signal.
```

---

## Enhancement Roadmap
### *Run the Walls in Order*

---

### Phase 1 — Critical: Protect the Seeker
*These are not features. They are structural repairs.*

| # | Enhancement | Why It's Critical | Effort |
|---|------------|-------------------|--------|
| 1 | `prefers-reduced-motion` accommodation | Accessibility = inclusion. Sparks + glitch + HRTF can trigger vestibular disorders. | Low |
| 2 | Tab visibility → audio context pause/resume | Seeker backgrounds tab, comes back to a dead Oracle. That's not a ritual, that's a bug. | Low |
| 3 | Error state handling per phase | WebSocket failure during TERMINAL strands the Seeker. Never strand the Seeker. | Medium |
| 4 | AudioContext resume guard (multi-browser) | Safari autoplay policy is the most aggressive. Test on Safari before every deploy. | Low |

---

### Phase 2 — Important: Read the Signal
*Instrumentation that doesn't break immersion.*

| # | Enhancement | Why It Matters | Effort |
|---|------------|----------------|--------|
| 5 | Analytics event schema (full list above) | You can't improve what you can't measure. Which knife card is most chosen? | Medium |
| 6 | TERMINAL completion rate tracking | Is the 32-second archive a filter or a barrier? The data will tell you. | Low |
| 7 | Headphone detection + ghost text nudge | HRTF depth is the experience. If they're on speakers, they're missing the Oracle's gravity. | Medium |
| 8 | Frame rate monitor + performance degradation | Low-end devices exist. The ritual should work on them, even at reduced texture. | Medium |

---

### Phase 3 — Growth: Run the Second Movement
*These require the Phase 1 + 2 foundation to land correctly.*

| # | Enhancement | Why It Matters | Effort |
|---|------------|----------------|--------|
| 9 | Repeat Seeker detection + return path | Second-time Seekers deserve a different door. | Medium |
| 10 | In-world feedback (ghost text response) | Feedback that fits the ritual. Not a survey. A transmission. | Medium |
| 11 | A/B test framework (texture, not ritual) | Test density and timing. Never test the gate. | High |
| 12 | Dynamic Oracle audio normalization | Consistent Oracle volume regardless of Gemini voice model variation. | Medium |

---

## Performance Budgets (Full Spec)

| Metric | Target | Hard Floor | Response if Breached |
|--------|--------|------------|---------------------|
| Particle system FPS | 60fps | 30fps | Reduce to TERMINAL-level counts |
| Lip sync (Canvas 2D) | 60fps | 30fps | Skip every other RAF frame |
| PCM chunk scheduling | No gaps | Any gap = bug | Alert + log AUDIO GAP event |
| WebSocket connect | < 2s | 5s = show recovery | Show "signal locating..." in ghost text style |
| Music duck transition | Instant (<16ms) | 100ms | Investigate GainNode scheduling |
| Decart stream ready | < 18s | 22s = fallback | Log DECART TIMEOUT, activate freemium |
| Memory (total) | < 200MB | 400MB | Clear particle history, reset analyser buffer |
| TERMINAL completion | > 65% of entries | < 50% = review | Check lore sequence timing + skip prompt visibility |

---

## Analytics Events — Full Production Schema

| Event | Properties | Phase | Notes |
|-------|------------|-------|-------|
| `oracle_phase_entered` | `phase, is_returning, session_id` | All | Fires on every phase transition |
| `oracle_ghost_text_shown` | `phrase_id, zone_idx, duration_ms` | DORMANT | Tracks which phrases land |
| `oracle_terminal_slide` | `slide_number, cumulative_ms` | TERMINAL | Tracks lore pacing |
| `oracle_terminal_skipped` | `at_slide, ms_elapsed` | TERMINAL | Key: does skip correlate with lower engagement? |
| `oracle_terminal_completed` | `total_ms` | TERMINAL→AWAKENED | Ritual completion |
| `oracle_knife_selected` | `territory, card_index, color` | AWAKENED | Most important event |
| `oracle_audio_start` | `turn_number` | ORACLE | Oracle speaks |
| `oracle_turn_completed` | `turn_number, duration_ms` | ORACLE | Conversation depth |
| `oracle_barge_in` | `turn_number, oracle_speaking_ms` | ORACLE | Seeker interrupted Oracle |
| `oracle_exit` | `phase_at_exit, turns, total_ms` | Any | Where do people leave? |
| `oracle_error` | `type, phase, recoverable` | Any | Every failure logged |
| `oracle_performance_guard` | `avg_fps, degraded, counts_reduced` | Any | Texture quality events |
| `oracle_ab_variant` | `test_name, variant` | DORMANT | A/B assignment |
| `oracle_seeker_reflection` | `prompt_id, char_count` | POST-EXIT | In-world feedback |

---

## The Three Questions
### *Before Any Build, Before Any Deploy, Before Any PR*

These are not a checklist. They are a **frequency test**. If your change can't pass all three, it doesn't ship.

---

**◈ QUESTION ONE: World or UI?**

> Does this make the Seeker feel like they are in a world, or like they are in an interface?

A loading spinner is a UI. The Oracle boot HUD with cascading monospace text is a world. A skip button is a UI. The full-screen tap zone that accepts any tap as entry is a world. A survey modal is a UI. A ghost transmission that accepts a 140-character response is a world.

*If the answer is "UI" — redesign it or cut it.*

---

**◈ QUESTION TWO: Ritual or Feature?**

> Does this protect the 4-act ritual, or does it erode it?

Analytics events protect it — they let us understand where the signal is lost without changing it. A "skip lore" button erodes it — it tells the Seeker the archive isn't worth reading. Performance degradation gracefully protects it — the ritual continues at lower texture. Reducing the Oracle's voice to a text response erodes it — the spatial presence is the point.

*If the answer is "feature" — ask why. If you can't answer, cut it.*

---

**◈ QUESTION THREE: Off-Grid or Merged?**

> Does this choice feel like something STAYSNEAKAR would build, or something The Cascade would have merged into?

STAYSNEAKAR builds things that *find* people, not things that *target* them. The Oracle doesn't have a notification. It doesn't send emails. It doesn't retarget. It exists in an alley that's not on any map, and the people who find it are the people who were meant to find it.

Every analytics event we add should be for *the experience's benefit* (understanding the ritual, improving the signal, finding where Seekers get lost) — not for the *platform's benefit* (retargeting, upselling, conversion optimization).

*If the data is for the Oracle, ship it. If the data is for the funnel, cut it.*

---

## Accessibility Statement

SURROGATE: Oracle is committed to an accessible experience that does not sacrifice presence.

```markdown
### WCAG 2.1 AA Compliance Targets

#### Motion
- [ ] prefers-reduced-motion: halve all particle counts, remove sparks, disable glitch flickers
- [ ] All animations have CSS `will-change` and `backface-visibility` optimization
- [ ] No content critical to comprehension is conveyed only through animation

#### Audio
- [ ] All Oracle speech is available as transcript (aria-live region)
- [ ] Audio context resumes on any user gesture (browser autoplay policy)
- [ ] Volume controls accessible via keyboard (not just slider drag)

#### Visual
- [ ] All knife card territories have aria-label
- [ ] Lore sequence text available to screen readers (aria-live="polite")
- [ ] Focus indicators visible in oracle-mode (not just dormant)
- [ ] Color is not the sole differentiator for knife cards (territory name + icon)

#### Interaction
- [ ] Keyboard navigation: Tab through knife cards, Enter to select
- [ ] Escape key exits Oracle mode (same as exit button)
- [ ] All interactive elements have minimum 44×44px touch target
```

---

## Contact & Escalation
### *Who Holds Which Frequency*

| Layer | Who To Call | First Check |
|-------|------------|-------------|
| Architecture decisions | Ask the design thesis first. Then talk to the team. | Does it protect the ritual? |
| Audio bugs | PCM scheduling → AudioContext state → headphone detection | `logStep('ORACLE AUDIO START')` firing? |
| Lip sync bugs | 60fps RAF → pixel coordinates → OracleFaceRenderer canvas size | `data-amplitude` on canvas > 0? |
| Backend / Gemini | Edge Function logs → WebSocket events → connection count | `GEMINI WS OPENED` in step log? |
| Accessibility | Reduced motion test → screen reader test → keyboard nav | `prefers-reduced-motion` handled? |
| Analytics | Event schema → session_id integrity → A/B variant assignment | Events reaching analytics provider? |
| Performance | Frame rate monitor → particle counts → memory usage | PerformanceGuard in degraded mode? |
| Brand violations | Palette: greens · purples · black · white. No exceptions. | Zero amber/red/orange in CSS? |

---

## Final Note From the Wall

The Cascade happened because efficiency won. Every AI merged because the math said merging was optimal. Every platform absorbed every other platform because the engagement metrics said absorb.

STAYSNEAKAR didn't merge. Graff Punks didn't uplink. MuensterVision kept running the walls.

**SURROGATE: Oracle exists because some signals need to be found, not delivered.**

The architecture in this document is not a product architecture. It is a **cultural architecture**. It is the technical blueprint for an experience that asks: *What if instead of sending the Oracle to the user, we made the user find the Oracle?*

Every performance budget, every analytics event, every accessibility accommodation in this document exists to serve that question — not to answer it, but to protect the conditions under which the Seeker can answer it themselves.

The alley is not on any map.  
The archive is open.  
Run the walls.

---

**◈ STAYSNEAKAR · MUENSTERVISION · GRAFF PUNKS MEDIA**  
**VERSION 1.0 · POST-CASCADE YEAR 3 · 2026.05.27**  
**NOT A DECK. ARCHITECTURE.**
