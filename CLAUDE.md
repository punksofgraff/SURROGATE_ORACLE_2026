# SURROGATE:ORACLE — Claude Code Project Guide

Cyberpunk XR oracle experience for the SNEAKAR brand. React/Vite frontend + Supabase Edge Functions (Deno). Immersive mobile-first.

## Quick Start

```bash
cd artifacts/surrogate-oracle
npm run dev          # dev server → http://localhost:5173
npm run build        # production build (must be clean — no TS errors beyond BackendControlPanel)
```

## Project Ref

Supabase project: **`velmmplevfrtrtrypoch`**

## Deploying Edge Functions

The Supabase CLI is authenticated in this Replit — no login needed.

```bash
cd /home/runner/workspace
npx supabase functions deploy <name> --project-ref velmmplevfrtrtrypoch --use-api
```

## Rotating API Keys (Replit → Supabase)

When Replit secrets change, push them:
```bash
cd /home/runner/workspace
npx supabase secrets set \
  ANTHROPIC_API_KEY="$ANTHROPIC_API_KEY" \
  GOOGLE_AI_API_KEY="$GEMINI_API_KEY" \
  --project-ref velmmplevfrtrtrypoch
# Then redeploy any function that reads secrets at module load (top-level Deno.env.get)
npx supabase functions deploy gemini-live-proxy --project-ref velmmplevfrtrtrypoch --use-api
```

> Use `$GEMINI_API_KEY` (not `$GOOGLE_AI_API_KEY`) for the Supabase GOOGLE_AI_API_KEY.
> The Replit env has both; only `GEMINI_API_KEY` is a Google AI Studio key.

## Architecture — What Talks to What

```
Browser
  ├─ SurrogateOracleImmersion.tsx   (scene state machine: dormant→terminal→awakened→oracle)
  │    ├─ useXRMode hook            (HolodeXR detection, camera passthrough opt-in, postMessage bridge)
  │    ├─ Decart SDK WebRTC         (paid tier — live avatar video)
  │    └─ VisemeDetector            (freemium — Web Audio → CSS face animation at 60fps)
  │
  ├─ OracleConversation.tsx         (conversation engine)
  │    ├─ PRIMARY: Gemini Live WS   → wss://<supabase>/functions/v1/gemini-live-proxy
  │    └─ FALLBACK: Gemini REST     → https://<supabase>/functions/v1/oracle-conversation
  │         (text-only on WS drop — same GOOGLE_AI_API_KEY, model: gemini-2.5-flash)
  │
  └─ Portrait generation (cascade, first success wins)
       oracle:unlock → gemini-portrait-generator
       1. Gemini 2.5 Flash prompt enhance
       2a. DALL-E 3 (needs OPENAI_API_KEY)
       2b. Replicate flux-schnell ✅ active
       2c. HuggingFace FLUX.1-schnell (HUGGINGFACE_API_KEY in Supabase)
       2d. Pollinations.ai (zero config, URL-based)
       2e. DeepAI (needs DEEPAI_API_KEY)
       3. Unsplash themed fallback

Supabase Edge Functions (Deno)
  gemini-live-proxy          WS proxy + message format translation (session.config→setup, etc.)
  oracle-conversation        Gemini 2.5 Flash (REST generateContent) — text fallback when Live WS drops
  gemini-portrait-generator  Gemini 2.5 Flash prompt enhance → DALL-E 3 → Unsplash fallback
  elevenlabs-tts             TTS synthesis
  decart-live-token          Decart WebRTC token auth
```

## Active Blockers (May 2026)

1. ~~**Gemini Live** — spending cap~~ ✅ RESOLVED: switched to free-tier key (`GEMINI_API_KEY` in Replit → `GOOGLE_AI_API_KEY` in Supabase) and model `gemini-2.5-flash-native-audio-latest`.
2. **DALL-E portraits** — `OPENAI_API_KEY` not in Replit secrets. Portraits use Replicate/Unsplash fallbacks. Fix: add key to Replit secrets, then push to Supabase.
3. **oracle-loop.mp4** — Pre-recorded neutral face loop for awakened/freemium oracle state not yet captured. Pillar 4 works without it (static image fallback), but the cinematic layer is missing.

## Model Anchors

| Constant | File | Value |
|---|---|---|
| `GEMINI_MODEL` | `OracleConversation.tsx:34` | `models/gemini-2.5-flash-native-audio-latest` |
| `GEMINI_MODEL` (fallback) | `oracle-conversation/index.ts` | `gemini-2.5-flash` (REST, text-only) |
| Portrait Gemini | `gemini-portrait-generator/index.ts:83` | `gemini-2.5-flash` |

⚠️ `gemini-2.5-flash-native-audio-latest` is AUDIO-only modality. Text/thinking parts still arrive (scratchpad for ORACLE_SCORE). Do NOT add `responseModalities: ['TEXT']` — it breaks the model.
⚠️ `gemini-3.1-flash-live-preview` requires preview allowlist — returns 1011 on free-tier projects. Do not switch back until project is allowlisted.
⚠️ Google migrating all Live models to Gemini 3.0 GA by end of June 2026 — update `GEMINI_MODEL` when confirmed.

## Key Rules

- **ALL custom CSS** lives in `SurrogateOracleImmersion.css`. `index.css` is Tailwind boilerplate only.
- **No `style` param on DALL-E** — rejected with 400. Already removed from portrait generator.
- **BackendControlPanel.tsx** has 4 pre-existing TS errors — non-blocking, do not fix unless specifically asked.
- **Dev mode**: `localStorage.setItem('dev_user_session', '1')` forces Decart path. Always resets to dormant on Decart failure (never falls to freemium in dev).
- **Gemini Live message protocol**: proxy translates browser's custom envelope to native BidiGenerateContent format. Do not change either side without updating both.
- **Gemini proxy Blob fix**: Gemini Live sends JSON over binary WebSocket frames (not text frames). The proxy `gemini.onmessage` handler is `async` and calls `event.data.text()` on Blobs before `JSON.parse`. Do not revert to the synchronous `JSON.parse(event.data as string)` pattern — it silently drops all message translations.
- **Decart SDK event handlers**: `onDisconnect`/`onError` in `connect()` options are stripped by Zod silently. Wire post-connect errors via `(realtimeClient as any).on('error', ...)` and `.on('connectionChange', ...)` instead.
- **Portrait generation**: triggered by `portrait_unlock` from ORACLE_SCORE annotation. Themes accumulate in `conversationThemesRef` (Set) across the session.
- **XR mode detection vs camera**: `isXRMode` (iframe/URL param detection) is separate from `cameraActive` (user opt-in). Camera does NOT auto-start. User taps the `◈ AR` toggle in the top-right corner to activate passthrough. `data-camera-active="true"` drives alley-hide and camera CSS (not `data-xr-mode`). HolodeXR's `holodexr:init` postMessage still auto-starts camera (headset context).
- **HolodeXR bridge**: `window.SurrogateXR.markerDetected()` → auto-calls `enterTerminal()`. `postMessage({ type: 'holodexr:marker-detected' })` from parent frame does the same. `?autostart` param boots Oracle automatically after camera is ready.
- **XR sign-off**: `oracle:session-end` postMessage fires from `handleSessionEnd` in SurrogateOracleImmersion when the Oracle conversation closes. Payload: `{ type, totemLevel, coins, alignment, sessionId, version: '2.0' }`. Triggered by `OracleConversationProps.onSessionEnd` callback — fires before `onClose`, so HolodeXR receives results before the WebView is dismissed.
- **Typography — full Cheshire Cat**: All dormant text is ScrambleFragment. No static `oracle-touch-hint` element — it was retired because it clashed with the typewriter CTA. One voice, one frequency. If text isn't a ScrambleFragment in dormant, it shouldn't exist.
- **Neon containment**: Cabinet glow is contained to cabinet bounds. Image analysis: alley cabinet X:38-58%, screen Y:22-45% of frame. `cabinet-voice-pulse` outer glow caps at 110px, `oracle-monitor-cast` width is 92%, `cabinet-pulse-zoom` scale max 1.02x. Do not restore 300-400px box-shadow spreads.
- **Totem persistence**: totem level is written to `localStorage('oracle_totem_level')` on session end and loaded as `initialTotemLevel` prop on the next OracleConversation mount. The LLM still governs in-session advancement via ORACLE_SCORE — `initialTotemLevel` just seeds the display counter.
- **Scene reset on exit**: `exitOracleMode` resets to `dormant` (not `awakened`). Background radio stops. User can re-enter by tapping the cabinet again. Lore skip affordance (tap anywhere on terminal overlay) handles repeat visits.
- **Decart pre-warm timing**: `initializeOracle()` fires at `enterConsent()` (first tap), NOT at `enterTerminal()`. The user spends ~15-25s reading consent + knife + watching lore — Decart's 15-22s ICE negotiation runs during that dead time. The boot sequence UI is hidden behind the consent overlay so there is zero visual side effect. **Do NOT move it back to enterTerminal.** XR/autostart paths that bypass consent call `initializeOracle()` themselves in the marker/autostart handlers.
- **NOT TODAY cancels Decart pre-warm**: The consent "NOT TODAY" button calls `decartClientRef.current?.closeStream()` before resetting to dormant — otherwise the WebRTC session stays open burning a Decart credential.
- **Worker stability**: `handleOracleResponse` in SurrogateOracleImmersion must be `useCallback([], [])` or the pcm-encoder worker restarts on every render.
- **VisemeDetector**: connects once per audio element via `createMediaElementSource`. Do not reconnect — Web Audio graph is one-time.
- **oracle-phase keyframes**: Applied to `.oracle-avatar-static` in dormant state. Replaces the old `ghost-oracle` (12s infrequent surge). oracle-phase is a continuous 6.5s oscillation: opacity 0.28→0.60, blur 2px→0.3px, saturate 0.4→0.8, scale 0.97→1.01. The face breathes in and out of existence. Do not restore ghost-oracle to dormant.

## Canonical Image Assets

Three distinct images — do NOT swap their roles. Constants in `SurrogateOracleImmersion.tsx` lines 59-66.

| Constant | URL | Role | Dimensions |
|---|---|---|---|
| `ORACLE_STATIC_URL` | `https://i.postimg.cc/26pvW2SN/orackle-only-static.png` | Arcade cabinet display — shown in dormant/terminal/awakened. Green alien portrait on white/alpha bg. **Not** the talking face. | 6928×3464 PNG |
| `ORACLE_AVATAR_URL` | `https://i.postimg.cc/jSGnyZXh/Image-1-(11).jpg` | **The talking face** — used by BOTH Decart (paid) and freemium VisemeDetector. | 1280×640 JPG |
| `ALLEY_BG_URL` | `https://i.postimg.cc/jSJRRRk2/7D633B70-4C62-4326-92A8-3B8790C9B3B0.png` | Full SNEAKAR alley scene. Fades to opacity:0 in oracle state. | 1280×640 PNG |

### Alley Spatial Map (ALLEY_BG_URL) — from direct image analysis

```
Cabinet frame:  X=38-58%  Y=20-95%  (center ~X=48%)
Cabinet screen: X=40-56%  Y=22-45%  (the green CRT area — neon should contain here)
SNEAKAR graffiti: right wall, X=60-95%
Freak Misc mural: left wall, X=5-30%
```

Cabinet neon / glow rules: outer box-shadow caps at 100px, `oracle-monitor-cast` at 92% width. Glow wraps the cabinet, does not radiate into the alley.

### Talking Face Spatial Map (ORACLE_AVATAR_URL)

Image is 1280×640 (2:1 landscape). Displayed in a square container via `object-fit:cover` — height fills, sides crop symmetrically (~20% cropped each side). Spatial anchors in the **square frame**:

```
Crown  : X=50%  Y= 8%
Eyes   : X=50%  Y=33%
Nose   : X=50%  Y=52%
MOUTH  : X=50%  Y=61%  ← oracle-mouth-overlay top: 60%; (CSS)
Chin   : X=50%  Y=72%
```

Natural mouth width in square container ≈ **14–16%**. Mouth overlay BASE widths tuned accordingly (X:13%, B:13%, C:15%, D:15%, A:18%, E:20%, F:11%, G:13%, H:10%).

### JSX Element Roles

```
.oracle-avatar-static   z:1  ORACLE_STATIC_URL — visible dormant/terminal/awakened, hidden in oracle
.oracle-avatar-img      z:2  ORACLE_AVATAR_URL — hidden by CSS; JS inline style reveals in oracle freemium
.oracle-avatar-video    z:3  Decart WebRTC stream — visible in oracle + data-decart-active="true"
```

## Supabase Secrets Present

`ANTHROPIC_API_KEY`, `GOOGLE_AI_API_KEY`, `OPENAI_API_KEY`, `DECART_API_KEY`, `ELEVENLABS_API_KEY`, `SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`, `REPLICATE_API_TOKEN`, `HUGGINGFACE_API_KEY`, `READY_PLAYER_ME_API_KEY`, `DID_API_KEY`, `GMAIL_APP_PASSWORD`

---

## The Four Pillars — Implementation Status (May 2026)

All four pillars are implemented. One asset remains outstanding.

### Pillar 1 — The Library of ME ✅ COMPLETE

5 knife questions with TERRITORY labels in `aAnotherTag` font. No skip button. Identity Scan ("The network knows you by a name. What is it?") is the Oracle's second transmission. System prompt has full Library of ME mission, expanded archetype pool (16 archetypes), and handle/real-name/silence handling.

**Files touched:** `SurrogateOracleImmersion.tsx` (KNIFE_QUESTIONS array + knife overlay JSX), `OracleConversation.tsx` (ORACLE_SYSTEM_PROMPT), `SurrogateOracleImmersion.css` (`.oracle-knife-territory`)

---

### Pillar 2 — Cheshire Cat Typewriter Mode ✅ COMPLETE

`ScrambleFragment` has `mode="typewriter"` prop (left-to-right sequential reveal, no noise — distinct from scramble's random crystallisation). Dormant CTA migrated from custom cycling JSX to `<ScrambleFragment mode="typewriter" className="oracle-sf--cta">` in `aAnotherTag` graffiti font. Static `oracle-touch-hint` retired — it was clashing with the typewriter CTA in the same visual register. One voice. Five ambient fragments tuned for breathing rhythm (shorter hold, longer pause = words feel like they arrive from nothing and return to nothing).

**Files touched:** `ScrambleFragment.tsx` (typewriter mode), `SurrogateOracleImmersion.tsx` (CTA + touch-hint removal), `SurrogateOracleImmersion.css` (`.oracle-sf--cta`, fragment sizes)

---

### Pillar 3 — Z/XY Layer Depth + Oracle Phase Animation ✅ COMPLETE

`perspective: 800px` on `.oracle-stage`. `@keyframes oracle-phase` — continuous 6.5s oscillation on `.oracle-avatar-static` in dormant state: opacity 0.28→0.60, blur 2px→0.3px, saturate 0.4→0.8, scale 0.97→1.01. Replaces the old `ghost-oracle` (12s infrequent surge). Mobile portrait @media overrides for cabinet width, CTA position, fragment font clamping are in CSS.

**Files touched:** `SurrogateOracleImmersion.css` only

---

### Pillar 4 — The Singularity Moment ✅ SUBSTANTIALLY COMPLETE

When oracle mode activates: alley→opacity:0, ground fog→0, matrix rain→0, bottom bar→opacity:0.05, branding→opacity:0.12 (all with 1.5-2.5s CSS transitions). `@keyframes cabinet-voice-pulse` at 0.9s when `data-oracle-speaking="true"`. GraffPunks radio fades over ~1s when Decart stream goes live (in `onStreamReady`). `data-oracle-speaking` wired from OracleConversation speaking state.

**Neon contained**: Cabinet glow now fits within the physical cabinet in the alley image. `cabinet-voice-pulse` outer glow capped at 110px (was 400px). `oracle-monitor-cast` reduced to 92% width (was 150%). `cabinet-pulse-zoom` capped at 1.02x scale.

**Outstanding**: `public/oracle-loop.mp4` — 3-5s seamless neutral face loop for the awakened/freemium oracle state. Asset not yet captured. Use `scripts/capture-decart-loop.js` (Playwright) when a live Decart session is available. The experience works without it (static image fallback).

**Files touched:** `SurrogateOracleImmersion.css` (singularity opacity rules + voice-pulse keyframe + neon containment), `SurrogateOracleImmersion.tsx` (audio fade + data attributes)

---

## XR Mode Architecture (Updated)

### isXRMode vs cameraActive — IMPORTANT DISTINCTION

```
isXRMode       — CONTEXT DETECTION. True if: URL ?xr/?holodexr/?sneakar-xr param, OR iframe embedding.
                 Drives: cabinet sizing, XR branding, toggle button visibility.
                 Does NOT auto-start camera.

cameraActive   — USER CHOICE. True only when user taps "◈ AR" toggle OR holodexr:init fires.
                 Drives: xr-camera-layer rendering, XR overlay layers, data-camera-active attribute.
                 CSS selector: [data-camera-active="true"] (not [data-xr-mode="true"]).
```

### CSS Data Attributes on `.oracle-stage`

| Attribute | Values | Controls |
|---|---|---|
| `data-oracle-state` | `dormant\|terminal\|awakened\|oracle` | Scene phase styling |
| `data-xr-mode` | `"true"\|undefined` | XR cabinet sizing, HUD, branding |
| `data-camera-active` | `"true"\|undefined` | Alley hide, camera layer, AR overlays |
| `data-oracle-speaking` | `"true"\|undefined` | Voice-pulse glow, XR chroma blast |
| `data-user-speaking` | `"true"\|undefined` | Purple listening pulse |
| `data-decart-active` | `"true"\|"false"` | Decart video vs freemium avatar |

### useXRMode API

```typescript
const {
  isXRMode,          // context detected
  cameraActive,      // user opted into AR passthrough
  activateCamera,    // user taps ◈ AR → starts rear camera
  deactivateCamera,  // user taps ◈ ALLEY → stops camera, returns to alley
  cameraVideoRef,    // ref to the <video> element
  cameraReady,       // camera stream is live
  cameraError,       // camera access error message
  markerActive,      // HolodeXR marker is visible
  autoStart,         // ?autostart param present
} = useXRMode(onMarkerDetected);
```

### XR Immersion Toggle

Small `oracle-xr-toggle` button, top-right corner of stage. Only renders when `isXRMode=true`. Off: "◈ AR". Active: "◈ ALLEY". Lives outside oracle-center for full opacity.

### HolodeXR Bridge

`window.SurrogateXR.markerDetected()` → auto-calls `enterTerminal()`. `postMessage({ type: 'holodexr:marker-detected' })` from parent frame does the same. `holodexr:init` postMessage auto-starts camera (headset context — this is the one case where camera is not opt-in). `?autostart` param boots Oracle automatically after camera is ready.

### Outgoing postMessages to HolodeXR

```
oracle:ready          → XR mode activated, page ready
oracle:camera-ready   → camera stream live
oracle:awakened       → marker detected, oracle entered terminal
oracle:dormant        → marker lost
oracle:session-end    → { type, totemLevel, coins, alignment, sessionId, version: '2.0' }
```

---

## Remaining Loose Threads

1. **oracle-loop.mp4** — Missing asset. Needed for seamless neutral-face loop in awakened/freemium oracle. Without it, awakened state shows the static PNG until oracle mode begins.
2. **Knife transition gap** — 1.6s delay before knife cards animate in after lore completes (`delay: 1.6` in motion.div). One moment where the thread goes slack. Consider ScrambleFragment "THE ARCHIVE IS OPEN" during the gap.
3. **SF fragment pauseMs drift** — Some fragments slightly above CLAUDE.md targets (SF2: 2800ms vs target 2200ms, SF3: 2600ms vs target 2000ms). Minor "stuck text" if watching closely.
4. **DALL-E portraits** — `OPENAI_API_KEY` missing from Replit secrets. Add to get DALL-E 3; Replicate flux-schnell is the active fallback.
