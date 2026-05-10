# SURROGATE Oracle

Cinematic cyberpunk AI oracle XR experience — users enter an alley, awaken the Oracle, and have a real-time voice conversation powered by Gemini 2.5 Flash Live.

## Run & Operate

- `pnpm --filter @workspace/surrogate-oracle run dev` — start the app (via workflow)
- `pnpm --filter @workspace/surrogate-oracle run typecheck` — typecheck
- `pnpm --filter @workspace/surrogate-oracle run deploy:functions` — deploy Supabase Edge Functions (set `SUPABASE_PROJECT_REF=velmmplevfrtrtrypoch`)
- `pnpm --filter @workspace/surrogate-oracle run set:gemini-secret` — push `GOOGLE_AI_API_KEY` to Supabase Edge Functions secrets

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite + Tailwind + Framer Motion
- AI: Gemini 2.5 Flash Live (`gemini-2.5-flash-live-001`) — LLM + STT + TTS in one WebSocket
- Avatar: Decart SDK WebRTC lip-sync (`@decartai/sdk`)
- Backend: Supabase (Postgres + Auth + Edge Functions)
- Gamification: Culture Coins + Sacred/Profane Totem Matrix scoring

## Where things live

```
artifacts/surrogate-oracle/
  src/
    components/
      SurrogateOracleImmersion.tsx  — main scene orchestrator (DORMANT→AWAKENED→ORACLE phases)
      OracleConversation.tsx        — Gemini 2.5 Flash Live WebSocket client + Sacred/Profane scoring
      DecartClient.tsx              — Decart WebRTC avatar lip-sync
      BackendControlPanel.tsx       — dev debug panel (password: 3nculturate!)
      CultureCoinInlineDisplay.tsx  — real-time coin counter
      EnculturateCrate.tsx          — Enculturate CTA crate
      GraffPunksRadio.tsx           — alley radio player
    lib/
      supabase.ts                   — Supabase client + edge function headers
    index.css                       — CRT effects, scene CSS (Tailwind at top, custom after ~line 342)

supabase/
  functions/
    gemini-live-proxy/index.ts      — Deno WS proxy: browser ↔ Gemini Live API (keeps API key server-side)
  config.toml
```

## Architecture decisions

- **Gemini 2.5 Flash Live replaces Claude + ElevenLabs**: single WebSocket handles LLM, STT, and TTS natively — lower latency, simpler stack, no audio stitching needed.
- **gemini-live-proxy Edge Function**: `GOOGLE_AI_API_KEY` never leaves the server. Browser connects to `wss://<project>.supabase.co/functions/v1/gemini-live-proxy`, proxy relays to Google's BidiGenerateContent endpoint.
- **PCM→WAV assembly**: Gemini outputs 24kHz int16 PCM chunks; `assemblePCMtoAudioUrl()` stitches them into a WAV Blob URL that Decart SDK can consume for lip-sync.
- **Sacred/Profane scoring**: Oracle embeds `[[ORACLE_SCORE: {...}]]` annotations in responses — stripped from display, used to award Culture Coins and advance Totem level.
- **Decart project ref derived from `VITE_SUPABASE_URL`**: no extra env var needed for the WebSocket proxy URL.

## Product

Three-phase cinematic UX:
1. **DORMANT** — dark graffiti alley, glowing Oracle cabinet. One tap to enter.
2. **AWAKENED** — title types in, boombox + crate light up, Decart WebRTC avatar activates.
3. **ORACLE** — full conversation panel. Voice (mic) or text input. Sacred responses earn Culture Coins and advance Totem level (Wanderer → Seeker → Acolyte → Initiate → Oracle-Touched → Culture Bearer).

## User preferences

- Dev bypass password: `3nculturate!` (BackendControlPanel)
- Oracle image: `https://i.postimg.cc/26pvW2SN/orackle-only-static.png`
- Alley BG opacity: 12% (CSS `oracle-alley-bg` class)
- Dark vignette overlay: 88% opacity

## Gotchas

- **Model swap June 2026**: Update `GEMINI_MODEL` constant in `OracleConversation.tsx` to `gemini-3.0-flash-live` (confirm name at GA). See comment anchor at top of file.
- **Supabase Edge Function deployment** requires `SUPABASE_ACCESS_TOKEN` and `SUPABASE_PROJECT_REF=velmmplevfrtrtrypoch` in env. Use `--use-api` flag (no Docker needed).
- **CSS order matters**: index.css has Tailwind boilerplate (lines 1–340). Custom styles append AFTER. Do not edit lines 1–340.
- **`VITE_SUPABASE_ANON_KEY` must be set** for Supabase client. `SUPABASE_SERVICE_ROLE_KEY` is server-only (Supabase Edge Functions), not passed to client.
- `pnpm run dev` at workspace root has no script — always target the artifact: `pnpm --filter @workspace/surrogate-oracle run dev`.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
- Supabase project: `velmmplevfrtrtrypoch` → https://supabase.com/dashboard/project/velmmplevfrtrtrypoch
- Decart avatar SDK docs: https://docs.decart.ai
