# SURROGATE Oracle — Replit Workspace Guide

Cinematic cyberpunk AI oracle XR experience. Users enter a graffiti alley, awaken the Oracle, and have a real-time conversation. Gemini Live audio when available; Gemini REST text fallback when Live WS drops. All LLM routing under the same `GOOGLE_AI_API_KEY`.

---

## Run & Operate

```bash
pnpm --filter @workspace/surrogate-oracle run dev       # start dev server → http://localhost:5173
pnpm --filter @workspace/surrogate-oracle run build     # production build → dist/
pnpm --filter @workspace/surrogate-oracle run typecheck # tsc --noEmit
```

> Note: `pnpm run dev` at workspace root has no script. Always target the artifact.

---

## Supabase Edge Functions

### Deploy (no Docker needed)
```bash
cd /home/runner/workspace
npx supabase functions deploy <function-name> --project-ref velmmplevfrtrtrypoch --use-api
```

> ⚠️ `gemini-live-proxy` **must** use `--no-verify-jwt` — browsers can't set Authorization headers on WebSocket upgrades:
> ```bash
> npx supabase functions deploy gemini-live-proxy --project-ref velmmplevfrtrtrypoch --use-api --no-verify-jwt
> ```

Deploy all at once:
```bash
# gemini-live-proxy needs --no-verify-jwt (WebSocket auth workaround)
npx supabase functions deploy gemini-live-proxy \
  --project-ref velmmplevfrtrtrypoch --use-api --no-verify-jwt
npx supabase functions deploy \
  oracle-conversation gemini-portrait-generator \
  elevenlabs-tts elevenlabs-conversational-ai \
  --project-ref velmmplevfrtrtrypoch --use-api
```

### Key Rotation — Replit → Supabase
**When Replit secrets are updated, push them to Supabase:**
```bash
cd /home/runner/workspace
npx supabase secrets set \
  ANTHROPIC_API_KEY="$ANTHROPIC_API_KEY" \
  GOOGLE_AI_API_KEY="$GEMINI_API_KEY" \
  --project-ref velmmplevfrtrtrypoch
```

> ⚠️ Use `$GEMINI_API_KEY` (not `$GOOGLE_AI_API_KEY`) for the Supabase `GOOGLE_AI_API_KEY` secret.
> The Replit env has both variables; only `GEMINI_API_KEY` is the Google AI Studio key that works with `generativelanguage.googleapis.com`.

After rotating secrets, **redeploy any function that reads the key at module load time** (top-level `Deno.env.get`):
```bash
npx supabase functions deploy gemini-live-proxy --project-ref velmmplevfrtrtrypoch --use-api --no-verify-jwt
```

### List current secrets
```bash
npx supabase secrets list --project-ref velmmplevfrtrtrypoch
```

---

## Replit Secrets Required

| Replit Secret | Maps to Supabase Secret | Used by |
|---|---|---|
| `GEMINI_API_KEY` | `GOOGLE_AI_API_KEY` | `gemini-live-proxy`, `oracle-conversation`, `gemini-portrait-generator` — **use this one** (free-tier AI Studio key) |
| `GOOGLE_AI_API_KEY` | — | GCP service key, NOT used for generativelanguage.googleapis.com |
| `VITE_SUPABASE_ANON_KEY` | client-side only | Supabase JS client in browser |
| `VITE_DECART_API_KEY` | `DECART_API_KEY` | Decart WebRTC avatar |
| `ANTHROPIC_API_KEY` | `ANTHROPIC_API_KEY` | Not currently used — Claude fallback retired, Gemini REST is the fallback |
| `OPENAI_API_KEY` | `OPENAI_API_KEY` | DALL-E 3 portraits — **⚠️ not yet in Replit secrets** |

---

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React 18 + Vite + Framer Motion
- AI (primary): Gemini Live WebSocket via `gemini-live-proxy` EFA (`gemini-2.5-flash-native-audio-latest`)
- AI (fallback): Gemini REST `gemini-2.5-flash` via `oracle-conversation` EFA — same `GOOGLE_AI_API_KEY`, text-only on WS drop
- Avatar (paid): Decart SDK WebRTC (`@decartai/sdk`) — takes `ORACLE_AVATAR_URL` → live lip-sync stream
- Avatar (freemium): Talking face img + `VisemeDetector` (Web Audio API → Preston Blair viseme → mouth overlay DOM writes at 60fps)
- Backend: Supabase (Postgres + Auth + Edge Functions in Deno)
- Gamification: Culture Coins + Sacred/Profane Totem Matrix

---

## Where Things Live

```
artifacts/surrogate-oracle/
  src/
    components/
      SurrogateOracleImmersion.tsx  — main scene orchestrator (state machine, tier routing)
      SurrogateOracleImmersion.css  — ALL custom styling (--z-* layers, data-oracle-state, data-xr-mode CSS)
      OracleConversation.tsx        — Gemini Live WS client + Gemini REST fallback + scoring
      DecartClient.tsx              — Decart WebRTC paid avatar
      BackendControlPanel.tsx       — dev debug panel (password: 3nculturate!)
    lib/
      visemeDetector.ts             — Preston Blair viseme detection (Web Audio API)
      supabase.ts                   — Supabase client
    workers/
      pcm-encoder.worker.ts         — PCM→WAV assembly off main thread
    hooks/
      useAtmosphere.ts              — canvas RAF particle atmosphere
      useXRMode.ts                  — HolodeXR detection, camera passthrough, postMessage bridge

supabase/
  functions/
    gemini-live-proxy/              — WS proxy + message format translation
    oracle-conversation/            — Gemini REST fallback (text-only when Live WS drops)
    gemini-portrait-generator/      — Gemini prompt enhance → DALL-E 3 → Unsplash fallback
    elevenlabs-tts/                 — TTS synthesis
    decart-live-token/              — Decart WebRTC auth tokens
    mint-culture-coins/             — ChainFuelz stub (pending SDK)
```

---

## Canonical Image Assets

Three distinct images with fixed roles — do NOT swap them.

| Constant | URL | Role |
|---|---|---|
| `ORACLE_STATIC_URL` | `https://i.postimg.cc/26pvW2SN/orackle-only-static.png` | Arcade cabinet screen — shown in **dormant / terminal / awakened**. Green alien portrait on white/alpha bg. The "waking" bridge image. |
| `ORACLE_AVATAR_URL` | `https://i.postimg.cc/jSGnyZXh/Image-1-(11).jpg` | **The talking face** — used by BOTH Decart (paid lip-sync) and freemium VisemeDetector. 1280×640 JPG. |
| `ALLEY_BG_URL` | `https://i.postimg.cc/jSJRRRk2/7D633B70-4C62-4326-92A8-3B8790C9B3B0.png` | Full SNEAKAR alley scene. Fades to `opacity:0` in oracle state (singularity moment). |

### Talking Face Spatial Map (`ORACLE_AVATAR_URL`)

Displayed in a square container via `object-fit:cover` — height fills, sides crop ~20% each side:

```
Crown  : X=50%  Y= 8%
Eyes   : X=50%  Y=33%
Nose   : X=50%  Y=52%
MOUTH  : X=50%  Y=61%  ← .oracle-mouth-overlay top: 60%
Chin   : X=50%  Y=72%
```

Natural mouth width ≈ **14–16%** of square container. Mouth overlay BASE widths (JS): X/B=13%, C/D=15%, A=18%, E=20%, F=11%, G=13%, H=10%.

### Alley Spatial Map (`ALLEY_BG_URL`)

Cabinet centered X=35–65%, occupies Y=25–100% of frame.

### Avatar Wrapper Z-Index Layer Order

```
z:1  .oracle-avatar-static   ORACLE_STATIC_URL — visible dormant/terminal/awakened, CSS-hidden in oracle
z:2  .oracle-avatar-img      ORACLE_AVATAR_URL — CSS-hidden always; JS inline style reveals in oracle freemium
z:3  .oracle-avatar-video    Decart WebRTC stream — oracle + data-decart-active="true"
```

---

## Gotchas

- **CSS Architecture**: `index.css` is Tailwind boilerplate ONLY. All XR immersive styling is in `SurrogateOracleImmersion.css`.
- **Dev mode**: Set `localStorage.setItem('dev_user_session', '1')` in browser console. Forces Decart path; resets to dormant on Decart failure (never falls through to freemium).
- **DALL-E `style` param**: Do NOT pass `style` to DALL-E 3 — rejected with 400.
- **Gemini Live model**: `models/gemini-2.5-flash-native-audio-latest` (set in `OracleConversation.tsx:34`). `gemini-3.1-flash-live-preview` requires preview allowlist and returns **1011** on free-tier projects — do not use until allowlisted. Older IDs (`2.0-flash-live-001`) return `1008 not found` on v1beta.
- **Gemini Live audio modality**: `gemini-2.5-flash-native-audio-latest` is AUDIO-only. Do NOT add `responseModalities: ['TEXT']` — it breaks the model. Text/thinking parts still arrive automatically and carry the `[[ORACLE_SCORE:…]]` annotation.
- **Gemini proxy — Blob frames**: Gemini Live sends ALL messages (including JSON control like `setupComplete`) as **binary** WebSocket frames. The proxy `gemini.onmessage` must be `async` and call `event.data.text()` on Blobs before `JSON.parse`. Do NOT revert to synchronous `JSON.parse(event.data as string)` — it silently drops every translation.
- **Gemini proxy — deploy flag**: Must be deployed with `--no-verify-jwt`. Browsers can't set custom headers on WebSocket upgrades, so JWT verification fails.
- **Decart SDK event handlers**: `onDisconnect`/`onError` options inside `connect()` are stripped by Zod schema silently. Wire post-connect events via `(client as any).on('error', ...)` and `.on('connectionChange', ...)` instead.
- **XR mode activation**: add `?xr` to any URL or embed the page in an iframe — `useXRMode` auto-detects both. Rear camera starts automatically. `?autostart` skips the tap gesture and boots Oracle ~1.8s after camera is live.
- **HolodeXR integration**: `window.SurrogateXR.markerDetected()` triggers the Oracle awaken sequence. `postMessage({ type: 'holodexr:marker-detected' })` from parent frame does the same. Full API: `launch()`, `markerDetected()`, `markerLost()`, `getStatus()`.
- **XR CSS selector**: all XR overrides use `[data-xr-mode="true"]` on `.oracle-stage`. No JS conditional rendering required — CSS handles layout + visual changes. XR section is clearly delimited at the bottom of `SurrogateOracleImmersion.css`.
- **XR sign-off postMessage**: `oracle:session-end` fires from `SurrogateOracleImmersion.handleSessionEnd` when the Oracle conversation closes. Payload: `{ type, totemLevel, coins, alignment, sessionId, version: '2.0' }`. HolodeXR parent receives this before the WebView is dismissed. Full outgoing protocol: `oracle:ready` → `oracle:camera-ready` → `oracle:awakened` ↔ `oracle:dormant` → `oracle:session-end`.
- **XR touch hint copy**: text is swapped in JSX (`isXRMode` conditional). Do NOT use CSS `content:` on non-pseudo-elements — it does nothing.
- **Totem persistence**: `localStorage('oracle_totem_level')` is written on session end and loaded as `initialTotemLevel` on the next `OracleConversation` mount. The LLM still governs advancement via `ORACLE_SCORE` — localStorage only seeds the counter.
- **Scene reset on exit**: `exitOracleMode` resets to `dormant` (not `awakened`) and stops the background radio. User can re-enter by tapping again. Lore tap-to-skip is available after the 2nd line.
- **Supabase CLI auth**: Already authenticated in this Replit — no login needed. `npx supabase secrets list` works directly.
- **`VITE_SUPABASE_ANON_KEY` must be set** in `.env.local` for the browser Supabase client. Service role key is server-only (Supabase EFAs via `SUPABASE_SERVICE_ROLE_KEY` env auto-injected by Supabase).
- **BackendControlPanel TypeScript errors**: Pre-existing, non-blocking. Build succeeds despite 4 TS errors in that file.

---

## Supabase Project

- Ref: `velmmplevfrtrtrypoch`
- Dashboard: https://supabase.com/dashboard/project/velmmplevfrtrtrypoch
- Key tables: `surrogate_sessions`, `surrogate_portraits`, `oracle_interactions`, `culture_crew`
