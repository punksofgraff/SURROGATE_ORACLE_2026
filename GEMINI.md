# Surrogate Oracle — Project Memory & Architecture

This is the canonical team knowledge base for SURROGATE:ORACLE. Update it when anything structural changes.

---

## Current State (May 2026)

| Service | Status | Notes |
|---|---|---|
| Oracle conversation (Claude `claude-sonnet-4-6`) | ✅ Live | Via `oracle-conversation` EFA |
| Gemini text (portrait prompt enhancement) | ✅ Live | Via `gemini-portrait-generator` EFA |
| Gemini Live audio (WebSocket) | ⚠️ Blocked | Google project monthly spending cap hit |
| DALL-E 3 portrait generation | ⚠️ Needs key | `OPENAI_API_KEY` not in Replit secrets |
| Portrait fallback (Unsplash themed) | ✅ Working | Kicks in when DALL-E unavailable |
| Decart WebRTC avatar (paid tier) | ✅ Key present | `DECART_API_KEY` in Replit + Supabase |
| Freemium viseme lip-sync | ✅ Implemented | `VisemeDetector` on oracle face `<img>` |

---

## AI Service Architecture

### Conversation Tier (Primary)
**Gemini Live** (`gemini-live-proxy` Supabase EFA) → WebSocket bidirectional proxy
- Client → proxy: custom envelope (`type: "session.config"`, `type: "client.realtimeInput"`)
- Proxy → Gemini: translates to native BidiGenerateContent protocol (`{ setup: {...} }`, `{ realtimeInput: {...} }`)
- Gemini → proxy: translates `{ serverContent: {...} }` → `{ type: "server.content", serverContent: {...} }`
- Proxy sends `session.created` on `gemini.onopen`; swallows Gemini's `setupComplete`
- Model: `models/gemini-3.1-flash-live-preview` (set in `GEMINI_MODEL` constant, `OracleConversation.tsx:31`)

**HTTP Fallback** (`oracle-conversation` Supabase EFA) → activated automatically when WebSocket fails
- Uses Claude `claude-sonnet-4-6` with full ORACLE_SYSTEM_PROMPT + TOTEM MATRIX scoring
- Client shows `TEXT MODE` badge in conversation header
- Full sacred/profane scoring, totem advancement, portrait triggers all still work

### Avatar Tier
**Paid:** Decart WebRTC (`DecartClient.tsx`) — video stream, full lip-sync
**Freemium:** Static oracle face `<img>` + `VisemeDetector` (`src/lib/visemeDetector.ts`)
- `VisemeDetector` connects to `HTMLAudioElement` via Web Audio API → drives CSS filter/transform at 60fps
- Preston Blair viseme set: X B C D E F G H A
- Direct DOM style writes (no React state) — zero re-render overhead

### Portrait Generation
`gemini-portrait-generator` EFA cascade (first success wins):
1. **Gemini 2.5 Flash** — enriches theme prompt to vivid DALL-E prompt (280 chars)
2a. **DALL-E 3** — if `OPENAI_API_KEY` set. NO `style` param (rejected by API)
2b. **Replicate `flux-schnell`** — ✅ active, key in Supabase. Fast, free tier
2c. **Hugging Face `FLUX.1-schnell`** — if `HUGGINGFACE_API_KEY` set. Binary → Supabase Storage or base64
2d. **Pollinations.ai** — zero config, no key, URL-based (`image.pollinations.ai/prompt/...`)
2e. **DeepAI** — if `DEEPAI_API_KEY` set
3. **Themed Unsplash fallback** — last resort, always succeeds

Triggered by `portrait_unlock` event from OracleConversation when totem threshold hit. Themes accumulate per-conversation in `conversationThemesRef`.

---

## Edge Functions (All Deployed)

| Function | Purpose | Key Secret |
|---|---|---|
| `gemini-live-proxy` | WS proxy browser ↔ Gemini Live | `GOOGLE_AI_API_KEY` |
| `oracle-conversation` | Claude HTTP fallback | `ANTHROPIC_API_KEY` |
| `gemini-portrait-generator` | Portrait pipeline (Gemini + DALL-E) | `GOOGLE_AI_API_KEY`, `OPENAI_API_KEY` |
| `surrogate-portrait-generator` | Legacy alias → delegates to above | — |
| `elevenlabs-tts` | TTS audio generation | `ELEVENLABS_API_KEY` |
| `elevenlabs-conversational-ai` | ElevenLabs conversation sessions | `ELEVENLABS_API_KEY` |
| `decart-live-token` | Decart WebRTC auth | `DECART_API_KEY` |
| `session-management` | Session lifecycle | `SERVICE_ROLE_KEY` |
| `culture-coin-manager` | Coin ledger | `SERVICE_ROLE_KEY` |

Deploy all at once:
```bash
npx supabase functions deploy \
  gemini-live-proxy oracle-conversation gemini-portrait-generator \
  elevenlabs-tts elevenlabs-conversational-ai \
  --project-ref velmmplevfrtrtrypoch --use-api
```

---

## Model Anchors

| Anchor | Location | Current Value | Update When |
|---|---|---|---|
| `GEMINI_MODEL` | `OracleConversation.tsx:31` | `models/gemini-3.1-flash-live-preview` | Google migrates Live API to GA |
| Claude model | `oracle-conversation/index.ts:98` | `claude-sonnet-4-6` | New Claude version released |
| Portrait Gemini | `gemini-portrait-generator/index.ts:83` | `gemini-2.5-flash` | Model renamed |
| Portrait DALL-E | `gemini-portrait-generator/index.ts:120` | `dall-e-3` | Model updated |

⚠️ **Gemini Live model swap**: Google announced migration of all models to Gemini 3.0+ by end of June 2026. Update `GEMINI_MODEL` when the new Live GA model ID is confirmed at https://ai.google.dev/gemini-api/docs/models

---

## Known Issues & Blockers

### 1. Gemini Live spending cap
`1011 — Your project has exceeded its monthly spending cap`
Fix: Google Cloud Console → Billing → Budgets & Alerts → increase/remove cap for `generativelanguage.googleapis.com`
Impact: Falls back to Claude HTTP automatically. Zero UX degradation.

### 2. DALL-E portraits
`OPENAI_API_KEY` is not in Replit secrets. Portraits fall back to Unsplash-themed images.
Fix: Add `OPENAI_API_KEY` to Replit secrets → it will auto-sync on next key rotation.

### 3. Old Gemini Live model IDs (pre-3.x)
`models/gemini-2.0-flash-live-001` and `models/gemini-2.5-flash-preview-native-audio-dialog` return `1008 not found for API version` on the v1beta endpoint as of May 2026. Use `models/gemini-3.1-flash-live-preview` or the current GA Live model.

---

## Architecture Highlights

- **Frontend:** React 18, TypeScript 5.9, Vite, Framer Motion
- **Scene State Machine:** `dormant → terminal → awakened → oracle` driven by `data-oracle-state` attribute + CSS custom properties — no React render cycles for scene transitions
- **Z-index System:** `--z-world`, `--z-atmosphere`, `--z-cabinet`, `--z-oracle`, `--z-auth`, `--z-debug` — ALL custom styling in `SurrogateOracleImmersion.css`, `index.css` is Tailwind boilerplate only
- **Audio Pipeline:** `pcm-encoder.worker.ts` (Web Worker) isolates 24kHz PCM → WAV assembly off V8 main thread
- **Sacred/Profane Economy:** `[[ORACLE_SCORE: {...}]]` annotations parsed from Oracle responses, stripped from UI — coins revealed as session-end world event only
- **Auth:** Supabase Email OTP (6-digit code) — bypasses Google OAuth domain restrictions on Replit
- **Dev Mode:** `localStorage.getItem('dev_user_session')` → always routes to Decart, resets to dormant on failure (never falls through to oracle mode)

## Supabase Project

- Project ref: `velmmplevfrtrtrypoch`
- Dashboard: https://supabase.com/dashboard/project/velmmplevfrtrtrypoch
- Key tables: `surrogate_sessions`, `surrogate_portraits`, `oracle_interactions`, `culture_crew`

## User Preferences

- Dev bypass password: `3nculturate!` (BackendControlPanel)
- Oracle face image: `https://i.postimg.cc/D20ctNV0/orackle-only-static.png`
- Decart avatar bg: `https://i.postimg.cc/hnyNRQLz/static-alley-reduced.png`
- Viewport locked: `user-scalable=no, viewport-fit=cover`

## ChainFuelz (Pending)

Ghost infrastructure deployed. `useChainFuelz.ts` hook + `mint-culture-coins` EFA stub ready. Waiting on Patrick Madren (CF) to expose server-to-server API for dynamic minting. Supabase DB already has `chainfuelz_wallet_address`, `on_chain_tx_hash`, `culture_coins_minted` columns.
