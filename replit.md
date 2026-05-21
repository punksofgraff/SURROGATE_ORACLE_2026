# SURROGATE Oracle — Replit Workspace Guide

Cinematic cyberpunk AI oracle XR experience. Users enter a graffiti alley, awaken the Oracle, and have a real-time conversation. Gemini Live audio when available; Claude text fallback always active.

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

Deploy all at once:
```bash
npx supabase functions deploy \
  gemini-live-proxy oracle-conversation gemini-portrait-generator \
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
> The Replit env has both; `GEMINI_API_KEY` is the Google AI Studio key that works with generativelanguage.googleapis.com.

After rotating secrets, **redeploy any function that reads the key at module load time** (top-level `Deno.env.get`):
```bash
npx supabase functions deploy gemini-live-proxy --project-ref velmmplevfrtrtrypoch --use-api
```

### List current secrets
```bash
npx supabase secrets list --project-ref velmmplevfrtrtrypoch
```

---

## Replit Secrets Required

| Replit Secret | Maps to Supabase Secret | Used by |
|---|---|---|
| `ANTHROPIC_API_KEY` | `ANTHROPIC_API_KEY` | `oracle-conversation` EFA |
| `GEMINI_API_KEY` | `GOOGLE_AI_API_KEY` | `gemini-live-proxy`, `gemini-portrait-generator` |
| `GOOGLE_AI_API_KEY` | (GCP key, not AI Studio) | not used for generativelanguage API |
| `VITE_SUPABASE_ANON_KEY` | client-side only | Supabase JS client in browser |
| `VITE_DECART_API_KEY` | `DECART_API_KEY` | Decart WebRTC avatar |
| `OPENAI_API_KEY` | `OPENAI_API_KEY` | DALL-E 3 portraits — **⚠️ not yet in Replit** |

---

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React 18 + Vite + Framer Motion
- AI (primary): Gemini Live WebSocket via `gemini-live-proxy` EFA
- AI (fallback): Claude `claude-sonnet-4-6` via `oracle-conversation` EFA
- Avatar (paid): Decart SDK WebRTC (`@decartai/sdk`)
- Avatar (freemium): Static face + `VisemeDetector` (Web Audio API lip-sync)
- Backend: Supabase (Postgres + Auth + Edge Functions in Deno)
- Gamification: Culture Coins + Sacred/Profane Totem Matrix

---

## Where Things Live

```
artifacts/surrogate-oracle/
  src/
    components/
      SurrogateOracleImmersion.tsx  — main scene orchestrator (state machine, tier routing)
      SurrogateOracleImmersion.css  — ALL custom styling (--z-* layers, data-oracle-state CSS)
      OracleConversation.tsx        — Gemini Live WS client + Claude HTTP fallback + scoring
      DecartClient.tsx              — Decart WebRTC paid avatar
      BackendControlPanel.tsx       — dev debug panel (password: 3nculturate!)
    lib/
      visemeDetector.ts             — Preston Blair viseme detection (Web Audio API)
      supabase.ts                   — Supabase client
    workers/
      pcm-encoder.worker.ts         — PCM→WAV assembly off main thread
    hooks/
      useAtmosphere.ts              — canvas RAF particle atmosphere

supabase/
  functions/
    gemini-live-proxy/              — WS proxy + message format translation
    oracle-conversation/            — Claude HTTP fallback with totem scoring
    gemini-portrait-generator/      — Gemini prompt enhance → DALL-E 3 → Unsplash fallback
    elevenlabs-tts/                 — TTS synthesis
    decart-live-token/              — Decart WebRTC auth tokens
    mint-culture-coins/             — ChainFuelz stub (pending SDK)
```

---

## Gotchas

- **CSS Architecture**: `index.css` is Tailwind boilerplate ONLY. All XR immersive styling is in `SurrogateOracleImmersion.css`.
- **Dev mode**: Set `localStorage.setItem('dev_user_session', '1')` in browser console. Forces Decart path; resets to dormant on Decart failure (never falls through to freemium).
- **DALL-E `style` param**: Do NOT pass `style` to DALL-E 3 — rejected with 400.
- **Gemini Live model**: `models/gemini-3.1-flash-live-preview`. Older IDs (`2.0-flash-live-001`) return `1008 not found` on v1beta endpoint as of May 2026.
- **Supabase CLI auth**: Already authenticated in this Replit — no login needed. `npx supabase secrets list` works directly.
- **`VITE_SUPABASE_ANON_KEY` must be set** in `.env.local` for the browser Supabase client. Service role key is server-only (Supabase EFAs via `SUPABASE_SERVICE_ROLE_KEY` env auto-injected by Supabase).
- **BackendControlPanel TypeScript errors**: Pre-existing, non-blocking. Build succeeds despite 4 TS errors in that file.

---

## Supabase Project

- Ref: `velmmplevfrtrtrypoch`
- Dashboard: https://supabase.com/dashboard/project/velmmplevfrtrtrypoch
- Key tables: `surrogate_sessions`, `surrogate_portraits`, `oracle_interactions`, `culture_crew`
