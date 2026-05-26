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
- **Dormant:** High-atmosphere alley. DormantHUD surveillance data in corners. Ghost phrase phasing. Oracle is silent.
- **Terminal:** Lore sequence plays in silence — Oracle does NOT speak during lore. Seeker reads the archive alone.
- **Awakened:** Lore complete → Oracle greets ("Greetings... Seeker") → announces territories → Knife cards appear.
- **Oracle:** Full conversation mode. Pixel-mapped canvas lip-sync on face.

### 2. Audio & Volume
- Base music volume: `0.22` (20% below original 0.28).
- Seeker mic active duck: `0.15` (ambient presence — music stays audible while seeker speaks).
- Oracle Ready duck: `0.04`.
- Oracle Speaking duck: `0.02` (7% — near-silent while Oracle voice is foreground).
- Priority order: default `0.22` → oracle-ready `0.04` → mic-active `0.15` → oracle-speaking `0.02`.
- All SFX should be cinematic and high-fidelity.

### 5. Brand Kit
- Palette: **greens, purples, black, white ONLY.** No red, orange, amber, or yellow.
- Knife card colors: emerald `#00ff88`, violet `#b026ff`, cyan `#00ccff`, neon-purple `#cc00ff`, mint `#00ffcc`.
- Any use of red/orange/amber is a brand violation — correct immediately.

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
