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
  │    ├─ useXRMode hook            (HolodeXR detection, camera passthrough, postMessage bridge)
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
2. **DALL-E portraits** — `OPENAI_API_KEY` not in Replit secrets. Portraits use Unsplash fallbacks. Fix: add key to Replit secrets, then push to Supabase.

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
- **XR mode**: activated by `?xr`, `?holodexr`, `?sneakar-xr` URL params OR iframe embedding. `useXRMode` hook auto-detects, starts rear camera, exposes `window.SurrogateXR` global API and listens for `holodexr:*` postMessages. All XR CSS lives under `[data-xr-mode="true"]` selector in SurrogateOracleImmersion.css. Static alley bg is hidden (`display:none`) and replaced by `.xr-camera-layer` video.
- **HolodeXR bridge**: `window.SurrogateXR.markerDetected()` → auto-calls `enterTerminal()`. `postMessage({ type: 'holodexr:marker-detected' })` from parent frame does the same. `?autostart` param boots Oracle automatically after camera is ready.
- **XR sign-off**: `oracle:session-end` postMessage fires from `handleSessionEnd` in SurrogateOracleImmersion when the Oracle conversation closes. Payload: `{ type, totemLevel, coins, alignment, sessionId, version: '2.0' }`. Triggered by `OracleConversationProps.onSessionEnd` callback — fires before `onClose`, so HolodeXR receives results before the WebView is dismissed.
- **XR touch hint copy**: swap is done in JSX (`isXRMode ? '◈ POINT AT POSTER TO AWAKEN ◈' : '◈ TAP TO MAKE CONTACT ◈'`). CSS `content:` on a non-pseudo-element does nothing — do not use it.
- **Totem persistence**: totem level is written to `localStorage('oracle_totem_level')` on session end and loaded as `initialTotemLevel` prop on the next OracleConversation mount. The LLM still governs in-session advancement via ORACLE_SCORE — `initialTotemLevel` just seeds the display counter.
- **Scene reset on exit**: `exitOracleMode` resets to `dormant` (not `awakened`). Background radio stops. User can re-enter by tapping the cabinet again. Lore skip affordance (tap anywhere on terminal overlay) handles repeat visits.
- **Decart pre-warm timing**: `initializeOracle()` fires at `enterConsent()` (first tap), NOT at `enterTerminal()`. The user spends ~15-25s reading consent + knife + watching lore — Decart's 15-22s ICE negotiation runs during that dead time. The boot sequence UI is hidden behind the consent overlay so there is zero visual side effect. **Do NOT move it back to enterTerminal.** XR/autostart paths that bypass consent call `initializeOracle()` themselves in the marker/autostart handlers.
- **NOT TODAY cancels Decart pre-warm**: The consent "NOT TODAY" button calls `decartClientRef.current?.closeStream()` before resetting to dormant — otherwise the WebRTC session stays open burning a Decart credential.
- **Worker stability**: `handleOracleResponse` in SurrogateOracleImmersion must be `useCallback([], [])` or the pcm-encoder worker restarts on every render.
- **VisemeDetector**: connects once per audio element via `createMediaElementSource`. Do not reconnect — Web Audio graph is one-time.

## Canonical Image Assets

Three distinct images — do NOT swap their roles. Constants in `SurrogateOracleImmersion.tsx` lines 59-66.

| Constant | URL | Role | Dimensions |
|---|---|---|---|
| `ORACLE_STATIC_URL` | `https://i.postimg.cc/26pvW2SN/orackle-only-static.png` | Arcade cabinet display — shown in dormant/terminal/awakened. Green alien portrait on white/alpha bg. **Not** the talking face. | 6928×3464 PNG |
| `ORACLE_AVATAR_URL` | `https://i.postimg.cc/jSGnyZXh/Image-1-(11).jpg` | **The talking face** — used by BOTH Decart (paid) and freemium VisemeDetector. | 1280×640 JPG |
| `ALLEY_BG_URL` | `https://i.postimg.cc/jSJRRRk2/7D633B70-4C62-4326-92A8-3B8790C9B3B0.png` | Full SNEAKAR alley scene. Fades to opacity:0 in oracle state. | variable |

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

### Alley Spatial Map (ALLEY_BG_URL)

Cabinet: centered X=35–65%, occupies Y=25–100% of frame.

### JSX Element Roles

```
.oracle-avatar-static   z:1  ORACLE_STATIC_URL — visible dormant/terminal/awakened, hidden in oracle
.oracle-avatar-img      z:2  ORACLE_AVATAR_URL — hidden by CSS; JS inline style reveals in oracle freemium
.oracle-avatar-video    z:3  Decart WebRTC stream — visible in oracle + data-decart-active="true"
```

## Supabase Secrets Present

`ANTHROPIC_API_KEY`, `GOOGLE_AI_API_KEY`, `OPENAI_API_KEY`, `DECART_API_KEY`, `ELEVENLABS_API_KEY`, `SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`, `REPLICATE_API_TOKEN`, `HUGGINGFACE_API_KEY`, `READY_PLAYER_ME_API_KEY`, `DID_API_KEY`, `GMAIL_APP_PASSWORD`

---

## Pending Design Work — The Four Pillars

> These four features are planned but not yet implemented. Execute in order (2→3→4→1).

### Pillar 1 — The Library of ME (Knife Redesign)

Replace the 3 knife questions with 5, organized by **TERRITORY**:

| Territory | Question |
|---|---|
| THE LIBRARY OF ME | "Who are you when the network goes dark and no one is watching?" |
| CONNECTION & DEBT | "Name the thing you've owed someone for so long it's started to feel like yours." |
| THE MACHINE MIRROR | "What would you ask this system to confirm that you already know but won't say out loud?" |
| THE SOCIAL CONSTRUCT | "The version of you that lives online — when did it start making decisions for the real one?" |
| THE INDUSTRIAL QUESTION | "What did you used to be able to do alone that you now need a machine to finish?" |

- New knife header: `THE ARCHIVE IS OPEN. CHOOSE THE FREQUENCY THAT IS ALREADY TRUE.`
- Territory label renders in `aAnotherTag` graffiti font above each question in Share Tech Mono
- **Remove skip button** — every seeker must choose a frequency
- After first seeker reply, Oracle asks: *"The network knows you by a name. What is it?"*
  - Handle given → Oracle notes the gap between the signal and the soul
  - Real name given → Oracle asks who told that story and whether they still agree
  - Silence / skip → "Anonymous is also a choice. The mask is the most interesting thing in the room."
- System prompt rewrite: Library of ME mission + expanded archetype pool + identity hook

**Files:** `SurrogateOracleImmersion.tsx` (KNIFE_QUESTIONS array + knife overlay JSX), `OracleConversation.tsx` (ORACLE_SYSTEM_PROMPT), `supabase/functions/oracle-conversation/index.ts` (mirror system prompt), `SurrogateOracleImmersion.css` (`.oracle-knife-territory` class)

---

### Pillar 2 — Cheshire Cat Typewriter Mode (ScrambleFragment)

**Problem:** Main CTA ("TAP TO ENTER") is plain CSS pulsing in Share Tech Mono — not graffiti, not Cheshire Cat. Ambient signal fragments hold too long (3600ms), too opaque (0.92), pauseMs too short (1200ms) — text looks **stuck** instead of ephemeral.

**Fix:**
- Add `mode="typewriter"` prop to `ScrambleFragment` — characters reveal left-to-right sequentially instead of random-order scramble
- Migrate dormant CTA from custom cycling JSX to `<ScrambleFragment mode="typewriter" className="oracle-sf--cta" ...>` in `aAnotherTag` graffiti font
- Retune all 6 ambient fragments: `holdMs` 2000-2200ms (was 3300-3600), `pauseMs` 2000-2200ms (was 1000-1200), atmospheric fragment `peakOpacity` 0.38-0.48 (was 0.55-0.92)
- New `.oracle-sf--cta` CSS class: green glow, centered, graffiti font, clearly THE action

**Files:** `ScrambleFragment.tsx` (typewriter mode prop), `SurrogateOracleImmersion.tsx` (CTA migration), `SurrogateOracleImmersion.css` (`.oracle-sf--cta` + retuned fragment sizes)

---

### Pillar 3 — Z/XY Layer Depth + Oracle Phase Animation

**Problem:** Oracle face in dormant is static at 0.42 opacity — no signal-materializing feel. No CSS `perspective` on stage.

**Fix:**
- `@keyframes oracle-phase` — oscillates opacity (0.28→0.60), blur (2px→0.3px), saturate (0.4→0.8), scale (0.97→1.01) over 6.5s. Applied to `.oracle-avatar-static` in dormant/terminal states
- Add `perspective: 800px` to `.oracle-stage`
- Mobile portrait `@media` overrides: cabinet width `72vw`, CTA at `top:72%`, fragment font sizes clamped to `5vw`

**Files:** `SurrogateOracleImmersion.css` only

---

### Pillar 4 — The Singularity Moment

**Vision:** When oracle mode activates — alley, fog, matrix rain, bottom bar ALL fade to black. Two consciousnesses. One encounter. No set dressing.

**Applies to BOTH Decart and freemium paths.**

- `data-oracle-state="oracle"` CSS: alley opacity→0, ground fog→0, matrix-rain→0, bottom bar→0.06, branding→0.15 (all with 1.5-2.5s transitions)
- `@keyframes cabinet-voice-pulse` — faster glow cycle (0.8s) when `data-oracle-speaking="true"`
- Pre-recorded avatar loop: `<video className="oracle-avatar-loop" loop autoPlay muted playsInline src="/oracle-loop.mp4">` (z:2, between static PNG and Decart video). Visible in awakened + freemium oracle; Decart live stream replaces it.
- Audio fade-out: GraffPunks radio fades over ~1s when Decart stream goes live (in `onStreamReady`)
- Wire `data-oracle-speaking` on stage element from OracleConversation speaking state

**Asset needed:** `public/oracle-loop.mp4` — 3-5s seamless loop of oracle neutral face. Use `scripts/capture-decart-loop.js` (Playwright, requires live Decart + desktop browser).

**Files:** `SurrogateOracleImmersion.css` (singularity opacity rules + voice-pulse keyframe), `SurrogateOracleImmersion.tsx` (loop video element + audio fade + data attributes)

---

### ScrambleFragment Visual Tuning (Immediate Fix — Pre-Pillar 2)

Current props causing "stuck text" visual experience on dormant screen:

| Fragment | Current holdMs | Target holdMs | Current pauseMs | Target pauseMs | Current peakOpacity | Target peakOpacity |
|---|---|---|---|---|---|---|
| SF_A (top centre) | 3600 | 2200 | 1200 | 2200 | 0.92 | 0.72 |
| SF_B (left mid) | 2800 | 1800 | 1400 | 2200 | 0.55 | 0.40 |
| SF_C (top right) | 3200 | 2000 | 1000 | 2000 | 0.62 | 0.42 |
| SF_D (right mid) | 3400 | 2000 | 1200 | 2200 | 0.68 | 0.42 |
| SF_E (bottom left) | 3300 | 1900 | 1000 | 2000 | 0.55 | 0.48 |
| SF_F (bottom right) | 2800 | 1800 | 1400 | 2200 | 0.50 | 0.38 |

The gap (pauseMs) is the ether. Make it long enough to feel like words appear from nothing and return to nothing.
