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
  │    └─ FALLBACK: Claude HTTP     → https://<supabase>/functions/v1/oracle-conversation
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
  oracle-conversation        Claude claude-sonnet-4-6 with ORACLE_SYSTEM_PROMPT + TOTEM scoring
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
| Claude model | `oracle-conversation/index.ts:98` | `claude-sonnet-4-6` |
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
- **Worker stability**: `handleOracleResponse` in SurrogateOracleImmersion must be `useCallback([], [])` or the pcm-encoder worker restarts on every render.
- **VisemeDetector**: connects once per audio element via `createMediaElementSource`. Do not reconnect — Web Audio graph is one-time.

## Supabase Secrets Present

`ANTHROPIC_API_KEY`, `GOOGLE_AI_API_KEY`, `OPENAI_API_KEY`, `DECART_API_KEY`, `ELEVENLABS_API_KEY`, `SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`, `REPLICATE_API_TOKEN`, `HUGGINGFACE_API_KEY`, `READY_PLAYER_ME_API_KEY`, `DID_API_KEY`, `GMAIL_APP_PASSWORD`
