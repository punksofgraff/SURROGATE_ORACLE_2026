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
      SurrogateOracleImmersion.css  — core CSS variable depth layer architecture + stage styling
      OracleConversation.tsx        — Gemini 2.5 Flash Live WebSocket client + Sacred/Profane scoring
      DecartClient.tsx              — Decart WebRTC avatar lip-sync
      BackendControlPanel.tsx       — dev debug panel (password: 3nculturate!)
      CultureCoinInlineDisplay.tsx  — real-time coin counter (hidden until triggered)
      EnculturateCrate.tsx          — Enculturate CTA crate
      GraffPunksRadio.tsx           — alley radio player
      GoogleSignInOverlay.tsx       — styled as "Neural Link Terminal" for immersive auth
    hooks/
      useAtmosphere.ts              — pure canvas RAF loop for scene atmosphere
    workers/
      pcm-encoder.worker.ts         — Web Worker offloading WAV assembly
    lib/
      supabase.ts                   — Supabase client + edge function headers
    index.css                       — Tailwind boilerplate ONLY

supabase/
  functions/
    gemini-live-proxy/index.ts      — Deno WS proxy: browser ↔ Gemini Live API (keeps API key server-side)
  config.toml
```

## Architecture decisions

- **Gemini 2.5 Flash Live replaces Claude + ElevenLabs**: single WebSocket handles LLM, STT, and TTS natively — lower latency, simpler stack, no audio stitching needed.
- **gemini-live-proxy Edge Function**: `GOOGLE_AI_API_KEY` never leaves the server. Browser connects to `wss://<project>.supabase.co/functions/v1/gemini-live-proxy`, proxy relays to Google's BidiGenerateContent endpoint.
- **PCM→WAV assembly (Web Worker)**: Gemini outputs 24kHz int16 PCM chunks; `pcm-encoder.worker.ts` stitches them into a WAV Blob URL off the main thread, keeping the V8 GC clean and preventing UI stutter.
- **Sacred/Profane scoring (Subverted UI)**: Oracle embeds `[[ORACLE_SCORE: {...}]]` annotations in responses. These are parsed to drive the hidden economy state, but are stripped from the main UI to preserve immersion. Coins are revealed as a session-end event.
- **CSS Custom Property State Mapping**: Scene phases (`dormant`, `awakened`, `oracle`) and alignment (`sacred`, `profane`) are applied as `data-*` attributes on the `oracle-stage` wrapper. Global transitions are handled entirely by CSS, replacing heavy React render cycles.

## Product

Three-phase cinematic UX:
1. **DORMANT** — dark graffiti alley, glowing Oracle cabinet. One tap to enter.
2. **AWAKENED** — title types in, boombox + crate light up, Decart WebRTC avatar pulses.
3. **ORACLE** — full conversation panel. Voice (mic) or text input. Sacred responses earn Culture Coins under the hood and advance Totem level (Wanderer → Seeker → Acolyte → Initiate → Oracle-Touched → Culture Bearer). Total coins are revealed only upon session exit.

## User preferences

- Dev bypass password: `3nculturate!` (BackendControlPanel)
- Oracle image: `https://i.postimg.cc/D20ctNV0/orackle-only-static.png` (Static)
- Decart Avatar: `https://i.postimg.cc/hnyNRQLz/static-alley-reduced.png`
- Viewport is explicitly locked (`user-scalable=no, viewport-fit=cover`)

## Gotchas

- **Model swap June 2026**: Update `GEMINI_MODEL` constant in `OracleConversation.tsx` to `gemini-3.0-flash-live` (confirm name at GA). See comment anchor at top of file.
- **Supabase Edge Function deployment** requires `SUPABASE_ACCESS_TOKEN` and `SUPABASE_PROJECT_REF=velmmplevfrtrtrypoch` in env. Use `--use-api` flag (no Docker needed).
- **CSS Architecture**: `index.css` is strictly Tailwind boilerplate. ALL custom XR immersive styling lives in `SurrogateOracleImmersion.css` leveraging the `--z-*` variable layer system.
- **`VITE_SUPABASE_ANON_KEY` must be set** for Supabase client. `SUPABASE_SERVICE_ROLE_KEY` is server-only (Supabase Edge Functions), not passed to client.
- `pnpm run dev` at workspace root has no script — always target the artifact: `pnpm --filter @workspace/surrogate-oracle run dev`.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
- Supabase project: `velmmplevfrtrtrypoch` → https://supabase.com/dashboard/project/velmmplevfrtrtrypoch
- Decart avatar SDK docs: https://docs.decart.ai
