# Surrogate Oracle — XD Overhaul Plan
## From Dashboard to Experience · May 2026

***

## The Diagnosis (What the Audit Found)

The XD audit identified four structural problems that prevent the current build from functioning as a genuine immersive experience:

| Problem | Current Symptom | Root Cause |
|---|---|---|
| **Illusion of awakening** | `useState<'dormant'\|'awakened'\|'oracle'>` | State machine masquerading as atmosphere |
| **Commodification of feeling** | `[[ORACLE_SCORE: {"coinAward":10}]]` visible in UI | Gamification mechanics surfaced at the wrong layer |
| **Audio pipeline fragility** | PCM blob assembly on main thread | V8 GC stutter during emotional peak moments |
| **Bureaucratic friction** | `<GoogleSignInOverlay />` breaks character | Auth UI not themed to the world |

None of these are fatal. Every single one is fixable within the existing React/TypeScript/Vite stack without a full rewrite. The goal is not to throw away the architecture — it is to **move the machinery below the floor** so the user only sees the world.[^1]

***

## Guiding Principle

> The user should remember how the Oracle made them feel, not the component that rendered it.

Every decision in this overhaul filters through one question: **does this serve the world, or does it serve the dashboard?** If it serves the dashboard, it goes underground.[^2][^1]

***

## Phase 1 — Visual & Atmospheric Cohesion

### Goal

Replace "digital dandruff" (mathematically oscillating `<DustParticle />` divs) and jarring z-index stacking with cohesive, meaningful visual transitions that serve the narrative of Oracle awakening.

### The Problem in Detail

The current `SurrogateOracleImmersion.tsx` uses:
- 28+ absolutely positioned div elements for particles
- Framer Motion loops running on every render cycle regardless of user engagement state
- Hard z-index layers (90, 100, 200, etc.) that create a "digital scrapbook" rather than spatial depth
- A background `filter: brightness()` swap as the entire "immersion" transition

This is visual busyness, not atmosphere. The distinction matters: atmosphere **changes how a user breathes**; busyness just fills screen space.

### What to Build Instead

**1. Canvas-based atmosphere layer**

Replace all `<DustParticle />` divs with a single `anvas>` element managed by a `useAtmosphere` hook. This hook runs on `requestAnimationFrame` and draws:
- Slow-drifting spray-paint mist particles (not bouncing divs — actual diffusion simulation)
- Occasional glitch scan lines (2-3px horizontal artifacts, random intervals)
- Subtle vignette that deepens as Oracle mode activates

This runs off the main React render cycle entirely — RAF loop, no state updates, no re-renders.

**2. Oracle awakening as a world event, not a state transition**

The current `isOracleMode` boolean triggers a CSS opacity swap. Instead, the awakening should be a **sequenced environmental change**:

```
Step 1 (0–800ms):   Alley background desaturates → near black/white
Step 2 (400–1200ms): Oracle canvas fades in with a phosphor-glow effect
Step 3 (800–1600ms): Ambient audio shifts (radio fades, Oracle drone rises)
Step 4 (1200–2000ms): UI elements dissolve except conversation input
Step 5 (complete):   World is fully Oracle — nothing "web app" is visible
```

Each step is a CSS custom property animation driven by a single `data-oracle-state` attribute on `<body>`, not component state. This means the entire visual layer responds to one signal with no React re-renders.[^3]

**3. Eliminate gratuitous z-index stacking**

The full UI should operate within three meaningful depth layers:
- **World layer** (z: 0–10): Background, atmosphere canvas, Oracle canvas
- **Oracle layer** (z: 11–20): Conversation UI, coin display — only visible in Oracle mode
- **System layer** (z: 21+): Auth overlay, error states — reserved for true interruptions

Everything else gets collapsed into these three. No more z-index: 90, 100, 200 for individual UI widgets.

### Files to Touch
- `SurrogateOracleImmersion.tsx` — remove particle divs, add atmosphere canvas ref
- `SurrogateOracleImmersion.css` — replace z-index hierarchy with CSS custom property system
- New: `hooks/useAtmosphere.ts` — RAF-based canvas atmosphere loop
- New: `hooks/useOracleAwakening.ts` — sequenced world-state transition manager

***

## Phase 2 — Audio Pipeline (Eliminating the V8 Stutter)

### Goal

Ensure the Oracle's voice never hitches. The emotional peak of the experience — the moment the Oracle delivers a truth — cannot be interrupted by garbage collection.

### The Problem in Detail

`OracleConversation.tsx` currently:
1. Accumulates `Int16Array` PCM chunks in a `useRef` array during streaming
2. On `turnComplete`, concatenates all chunks into one massive `Int16Array` on the **main thread**
3. Builds a WAV header manually
4. Creates a `Blob` and calls `URL.createObjectURL()`
5. Passes the URL to `DecartClient.sendAudio()`
6. Revokes the URL 60 seconds later

Steps 2–4 run synchronously on the main thread during what should be the most immersive moment of the interaction. On a mid-range mobile device, a 10-second Oracle response generates ~480KB of PCM data. Concatenating and encoding that inline will cause a measurable frame drop.

### What to Build Instead

**Option A: AudioWorklet offload (recommended)**

Move PCM chunk accumulation and WAV encoding into an `AudioWorkletProcessor` that runs on the browser's dedicated audio thread — completely isolated from the V8 main thread and its GC cycles.

```
Gemini Live → PCM chunks → AudioWorklet (audio thread)
                                  ↓
                         Encode WAV in worker
                                  ↓
                         postMessage(blob) → main thread
                                  ↓
                         onOracleResponse(audioUrl)
```

The main thread receives a finished Blob URL — it never touches raw PCM.

**Option B: Web Worker fallback**

If AudioWorklet complexity is a concern for the current sprint, a standard `Worker` achieves the same GC isolation:

```typescript
// workers/pcm-encoder.worker.ts
self.onmessage = ({ data: { chunks, sampleRate } }) => {
  // WAV encoding happens here, off main thread
  const blob = encodeWAV(chunks, sampleRate);
  self.postMessage({ audioUrl: URL.createObjectURL(blob) });
};
```

`OracleConversation` posts chunks to the worker and awaits the URL — main thread stays clean.

**Option C: MediaSource Extensions (streaming, no blob)**

For the most seamless experience, skip blob assembly entirely. Feed PCM chunks directly into a `MediaSource` as they arrive from Gemini, so the Oracle avatar starts moving before the full response is received. This requires Decart to accept a `MediaStream` rather than a URL — worth verifying against the Decart API spec.

### Recommendation

Implement Option B (Web Worker) first — it's a 2-hour fix that eliminates the stutter immediately. Schedule Option A (AudioWorklet) for the next sprint as the production-grade solution.

### Files to Touch
- `OracleConversation.tsx` — remove inline PCM assembly, post to worker
- New: `workers/pcm-encoder.worker.ts` — WAV encoding off main thread
- `DecartClient.tsx` — validate whether `MediaStream` input is supported (Option C path)

***

## Phase 3 — Lore-Integrated Auth (The Vibe-Shift Fix)

### Goal

Never break the Oracle's world to ask for a passport. The underlying technology is still Google OAuth — the wrapper belongs in the graffiti alley.[^4]

### The Problem in Detail

The current flow:
1. User reaches Acolyte threshold → Squad Up CTA surfaces
2. User clicks → `<GoogleSignInOverlay />` renders
3. Standard Google account picker appears
4. User selects account
5. Return to Oracle world

Step 3 is a full hard-break. The user goes from a cyberpunk alley prophet to a Google product UI in one frame. The suspension of disbelief — which was working — collapses completely.[^4]

### What to Build Instead

**Theme the entire auth journey as a lore event.**

| Current | Replacement |
|---|---|
| "Sign in with Google" modal title | "ESTABLISH NEURAL LINK" |
| Google account picker header | "VERIFY SEEKER FREQUENCY" |
| "Continue as [name]" button | "BIND TO THE CULTURE" |
| Loading spinner | Oscilloscope waveform animation |
| Error state | "FREQUENCY REJECTED — RETRY CALIBRATION" |

The Google OAuth popup itself cannot be reskinned — it's a browser security boundary. But everything **before** and **after** the popup is fully controllable. The overlay that launches it and the transition back into the Oracle world should be fully lore-integrated.

**The auth overlay as a ritual:**

```
1. OracleConversation detects Squad Up unlock trigger
2. Oracle says (in character): "Seeker... to walk this alley for real, 
   I need to know your frequency. Open the neural link."
3. Screen dims further — a "NEURAL LINK TERMINAL" overlay appears
   (cyberpunk terminal aesthetic, green phosphor text, no Google branding yet)
4. User hits "INITIATE LINK" → Google popup opens (unavoidable browser UI)
5. On success → terminal shows "FREQUENCY CONFIRMED" → dissolves back to Oracle
6. Oracle resumes in character: "Welcome to the Culture, [name]."
```

The Google popup is a 2-second interruption inside a lore-wrapped ritual. Users tolerate it because the world reasserts itself immediately after.

### Files to Touch
- `GoogleSignInOverlay.tsx` — full retheme to Neural Link Terminal aesthetic
- `OracleConversation.tsx` — change Squad Up trigger to emit lore-dialogue first, then fire auth
- `SurrogateOracleImmersion.css` — add `.neural-link-terminal` styles

***

## Phase 4 — Subverting the Token Economy (Making It Sacred Again)

### Goal

The Totem Matrix scoring system stays — it's load-bearing for the Culture Coin economy and ecosystem progression. What changes is **how and when the user perceives it**. The score should shape the world, not announce itself.[^2]

### The Problem in Detail

The current `OracleConversation.tsx` renders after every Oracle turn:

```tsx
{turn.score && turn.score.coinAward > 0 && (
  <div>+{turn.score.coinAward} · {turn.score.alignment}</div>
)}
```

This is a slot machine payout notification. It reduces the Oracle's wisdom to a transaction receipt. The user's attention moves from what the Oracle said to the number that appeared. The moment is destroyed.[^2]

### What to Build Instead

**1. Environmental feedback replaces on-screen numbers**

| Sacred exchange | Profane exchange |
|---|---|
| Alley atmosphere canvas brightens slightly | Atmosphere dims, particles slow |
| Oracle avatar glow intensifies (Decart canvas filter) | Oracle's response is noticeably shorter |
| Ambient audio shifts toward a warmer tone | A subtle discordant note |
| Nothing is said — the world just responds | Oracle re-engages: "Go deeper." |

The score still runs. Coins still accumulate. But the **UI is silent** — the world speaks instead.

**2. Coin balance is private until invited**

Remove `CultureCoinInlineDisplay` from the always-visible position. Coins are revealed:
- At session end: Oracle delivers a closing line + "You've earned X coins this session."
- When the user opens `EnculturateCrate` (the explicit "show me my status" gesture)
- When a major unlock is triggered (Squad Up, Portrait, Arcade token)

This reframes coins from a running score to a **discovered reward** — the difference between a slot machine and finding money in a jacket pocket.

**3. Totem level advancement is a world event**

When `totemAdvancement === 'ascend'`, the Oracle pauses the conversation and delivers a short in-character acknowledgment:

```
"Seeker no more. The alley knows you now. You walk as Acolyte."
```

This is more valuable than "+1 level" in a badge. It is memorable.

**4. The `[[ORACLE_SCORE]]` annotation stays in the system**

The Sacred/Profane scoring logic in the Gemini system prompt is correct and should not change. The only change is that `OracleConversation.tsx` strips the annotation from display AND suppresses the per-message coin badge. The score is parsed, applied to state, and used to drive environmental effects — but never shown as a number next to the message.[^2]

### Files to Touch
- `OracleConversation.tsx` — remove per-message coin badge, emit world events instead
- `SurrogateOracleImmersion.tsx` — listen for `oracle:sacred` / `oracle:profane` window events, drive atmosphere
- `CultureCoinInlineDisplay.tsx` — move to session-end / EnculturateCrate reveal only
- `hooks/useAtmosphere.ts` — add `setSacredIntensity(level)` API for world-state response

***

## Implementation Priority Matrix

| Phase | Impact on Experience | Implementation Effort | Do First? |
|---|---|---|---|
| Phase 3 — Auth vibe-shift | 🔴 Highest (breaks immersion completely) | Low (1–2 days) | ✅ Yes |
| Phase 4 — Subvert token economy | 🔴 High (slot machine kills magic) | Medium (2–3 days) | ✅ Yes |
| Phase 2 — Audio pipeline | 🟡 Medium (stutter on slow devices) | Low-Medium (1–2 days) | ✅ Yes |
| Phase 1 — Visual cohesion | 🟡 Medium (atmosphere, not broken) | High (3–5 days) | After above |

**Recommended sprint order**: Phase 3 → Phase 4 → Phase 2 → Phase 1.

The auth fix and token economy changes are **zero-risk, high-impact** and can ship in a single session. The audio pipeline fix eliminates a known performance risk. The visual overhaul is the largest investment and benefits from the other phases being stable first.

***

## What Does NOT Change

The following are explicitly out of scope for this overhaul — they are working correctly and should not be touched:[^1]

- Totem Matrix Sacred/Profane scoring logic (Gemini system prompt)
- Culture Coin accounting and Supabase DB writes
- `DecartClient` WebSocket and canvas avatar rendering
- Gemini Live API proxy (`gemini-live-proxy` Edge Function)
- `OracleConversation` → `onOracleResponse(audioUrl)` contract
- `BackendControlPanel` (Coins, Squad, Portraits, Debug tabs)
- SNEAKARCADE / Web3 / Culture Crew ecosystem connections

The machinery is good. The experience layer on top of it needs to do its actual job.

***

## Definition of Done

The overhaul is complete when:

- A user can enter Oracle mode, have a full 5-minute conversation, reach Acolyte threshold, authenticate, and exit — **without once feeling like they are using a web app**
- The Oracle's voice never stutters on a mid-range mobile device
- A user who earns 40 Culture Coins in a session discovers that fact as a **revelation**, not a running tally
- The Google auth popup is the only moment of "real world" UI — and it lasts under 3 seconds before the world reasserts itself

---

## References

1. [yes no that connects in to Surrogate:Oracle via our Culture Crew / Squad UP et c.. make sense?](https://www.perplexity.ai/search/0d710512-9824-4ab4-99cd-749ddcdc833d) - Absolutely—your architecture makes sense, and here’s how the connectivity layers come together:
Orac...

2. [import React, { useState } from 'react';
import { X, Zap, Star, Crown, TrendingUp, Sparkles, Terminal } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { CultureCoinDisplay } from './CultureCoinDisplay';

interfac...

...string; content: string }) => (
  <div className="bg-pink-900/20 border border-pink-800/30 rounded-lg p-4">
    <h3 className="text-pink-400 font-bold mb-2">{title}</h3>
    <p className="text-gray-300">{content}</p>
  </div>
);  learn2earn interface](https://www.perplexity.ai/search/681d0356-99fa-4090-8a8f-0a1d92799929) - ✅ Confirmed: You’ve just authored an exquisitely organized and highly immersive Learn2EarnInterface ...

3. [this includes all of your fix suggestions from all 5 componenets I shgared w you thsi need sto be a global fix prompt for talk streams to load in, video to show, oracle to talk, and bring bacl in teh squad up area](https://www.perplexity.ai/search/ba694a0f-d473-47f6-93fa-6a702bc14e06) - This unified prompt is designed to synchronize your entire Surrogate Oracle streaming experience acr...

4. [yes add that tpp](https://www.perplexity.ai/search/2fb90067-2662-4ec2-9020-d23845361b52) - Absolutely! Here’s the full, direct implementation for your SNEAKAR Oracle UI, with ENCULTURATE as t...

