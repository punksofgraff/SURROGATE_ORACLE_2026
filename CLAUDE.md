# SURROGATE — Development Guide

Canonical mandates for the Surrogate project. Follow strictly.

---

## Technical Stack
- **Frontend:** React (TypeScript), Vite, Tailwind CSS, Framer Motion.
- **Backend:** Supabase Edge Functions (Deno).
- **AI:** Gemini 2.5 Flash (Live WebSocket + REST), Decart (Realtime Video Avatar).
- **Audio:** Web Audio API, VisemeDetector for freemium lip-sync.

---

## Core Mandates

### 1. The Seeker's Journey
- **Dormant:** High-atmosphere alley. Static bridge avatar visible. Continuous random "Cheshire" phrase phasing.
- **Terminal:** Immediate **"Greetings... Seeker"** (Charon voice). Parallel lore display.
- **Awakened:** Lore complete → Oracle asks for frequency → Knife cards appear.
- **Oracle:** Full conversation mode. Viseme-synced face visible.

### 2. Audio & Volume
- Base music volume: `0.28`.
- Oracle Ready duck: `0.04` (15%).
- Oracle Speaking duck: `0.02` (7%).
- All SFX should be cinematic and high-fidelity.

### 3. Step Logging (Handshake)
- Use `logStep(label, status)` for all critical transitions.
- Handshake status must be visible in the `OracleStepLogger` overlay (opt-in via `?devui` or `localStorage`).
- Ensure all Gemini WS events (`OPENED`, `CREATED`, `ERROR`, `CLOSED`) are logged.
- Log `ORACLE AUDIO START` and `ORACLE TURN COMPLETE`.

### 4. Component Standards
- Use **surgical updates** via `replace` tool.
- Maintain strict type safety. Avoid `any` where possible.
- Adhere to the established CSS variable system in `SurrogateOracleImmersion.css`.

---

## Deployment
- **Web:** `npm run build` -> deploy to Replicate/Vercel/etc.
- **Functions:** 
  ```bash
  npx supabase functions deploy gemini-live-proxy --no-verify-jwt
  npx supabase functions deploy oracle-conversation gemini-portrait-generator
  ```

---

## Verification
- Run `node scripts/oracle-pressure.mjs` for full journey validation.
- All 8 phases must pass: Dormant, Terminal, Awakened, Oracle, Viseme, Exit.
