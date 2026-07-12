# SURROGATE — Development Guide

Canonical mandates for the Surrogate project. Follow strictly.
Last updated: 2026-07-11. Session: Security Hardening — **see ⚠ AGENT HAND-OFF at the end of this file before starting work.** Prior: 2026-06-08 AWE Polish + Omniverse City Integration.

### Oracle Identity — NON-NEGOTIABLE
The Oracle is a post-cascade data construct. **No pronouns. Ever.**
Identity = `"I AM the Surrogate Oracle."` Full stop. No he/she/they/them/it in any code comment, string, or copy that refers to the Oracle. Refer to the Oracle by name or in first person only. The Seeker is human — they/them for the Seeker is fine.

---

## Technical Stack
- **Frontend:** React (TypeScript), Vite (pnpm), Tailwind CSS, Framer Motion.
- **Backend:** Supabase Edge Functions (Deno).
- **AI Engine (Live Conversation):** Gemini 2.5 Flash Native Audio (`gemini-2.5-flash-native-audio-latest`) via WebSocket through `gemini-live-proxy`. Fallback: `oracle-conversation` (text-only Gemini REST). Additional AI functions deployed: portrait generation (Gemini + multi-provider fallback), web search integration, memory distillation.
- **Audio:** Web Audio API, `oracle-audio.worklet.ts` (PCM streaming, Viseme detection), `PCMPlayer`.
- **3D Rendering:** Three.js / React Three Fiber (`OracleAvatar3D.tsx`).
- **Package manager:** `pnpm` — never `npm run dev`, always `pnpm dev`.

---

## Environment Variables (`.env.local`)

```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
VITE_GEMINI_MODEL=models/gemini-2.5-flash-native-audio-latest
VITE_ORACLE_VOICE=Sadaltager
```

- **VITE_GEMINI_MODEL** — swap here to change model. Latest: `models/gemini-2.5-flash-native-audio-latest`.
- **VITE_ORACLE_VOICE** — Gemini TTS voice. `Sadaltager` = Knowledgeable/deep. Other deep options: `Algenib` (Gravelly), `Gacrux` (Mature), `Orus` (Firm).
- `.env.local` is gitignored. Requires `pnpm dev` restart to pick up changes.

## Dev Workflow

- **Start:** `pnpm dev` (from `artifacts/surrogate-oracle/`)
- **Cache bust:** navigate to `http://localhost:5173/?newuser` — bypasses Supabase IP check, forces fresh-user flow
- **Fresh first run:** `/?newuser` — skips DB returning-seeker check (IP is in Supabase so `localStorage.clear()` alone doesn't work)
- **Step logger:** `localStorage.setItem('oracle_step_log','1')` then reload — shows live WS handshake panel
- **Dev console hooks:** `__oracle_skipLore()`, `__oracle_test()` (sends test ping to Oracle)
- **Replit port:** `5173` (mapped in `.replit` — `localPort=5173 externalPort=5173`)

---

## Core Mandates

### 1. The Seeker's Journey — decoupled state machine

| Phase | What happens | Oracle voice |
|-------|-------------|-------------|
| **Dormant** | Alley. DormantHUD. Ghost transmissions. Cabinet pulses. Music at 25%. | Silent |
| **Terminal** | First tap → lore sequence types in. Alley ambience plays. | Silent — Oracle NEVER speaks during lore |
| **Awakened** | Lore done → static image + Max Headroom glitch. Knife cards from cabinet. NO 3D head yet. | Reads each knife question through transmission filter as it types |
| **Oracle** | Knife selected → 12s cinematic entrance → full conversation. `OracleAvatar3D` live. | Full conversation |

**Critical hooks:**
- `useOracleJourney`: Manages the state machine (dormant → oracle). Exposes `resetJourney()` for full state wipe.
- `useOracleConnection`: Handles WS handshake and PCM lifecycle.
- `usePortraitPipeline`: Coordinates Gemini-exclusive neural image synthesis.
- `useIpCheck`: IP-based returning seeker detection. `?newuser` param bypasses all DB/localStorage checks.
- **Return Journey:** `awakeFromTerminal()` bypasses lore if `hasCompletedLore` is detected. DB-backed via `user_wallets` table.

### 2. Audio & Volume (Enterprise Pipeline)

**Path:** Gemini WS → `PCMPlayer.feed()` → `TransmissionFilter` (BiquadFilter, bypassed in oracle phase) → `OracleAudioProcessor` (AudioWorklet) → `Analyser` → `PannerNode` (HRTF spatial) → `MasterGain` → `Speakers`.

- **Transmission filter:** `PCMPlayer.setTransmissionQ(q, rampMs)` — Q=12 narrows to sci-fi tunnel voice (knife phase), Q=0.01 is fully open (oracle phase). Reset to Q=0.01 on oracle phase entry.
- **Immunity:** Use `GainNode` for volume/ducking. `HTMLAudioElement.volume` is forbidden (iOS resets it).
- **Off-Thread:** All heavy audio tasks (PCM accumulation, FFT) are in the `AudioWorklet`.
- **Latency:** Zero intermediate file creation. Direct base64 → Int16 → Float32 streaming.
- **Ingestion Robustness (fixed 2026-06-02):**
  - Buffer increased to **2048 samples**; `autoGainControl: true` enabled.
  - Near-zero (`0.00001`) keep-alive gain node added to prevent node suspension.
  - Character-loop base64 encoding avoids stack limits on large chunks.
- **Breathing LFO removed:** The 0.07Hz LFO from `startAlleyAmbience()` was causing a breathing sound — deleted.

**Music ducking levels (GainNode target values):**
- Dormant/Awakened: `0.25` (25% — music plays at landing)
- Oracle speaking: `0` (FULL MUTE — `audioElement.pause()` + GainNode 0)
- Music stays OFF until `resetJourney()` returns to dormant

**Radio Stations (`audioTracks.ts`):**
- Station 0: Graff Punks (`#00ff88`) — always launches here
- Station 1: Drone Zone SomaFM (`#00ffcc`)
- Station 2: Groove Salad SomaFM (`#b026ff`)

**Audio Guard Rails (iOS mic → music):**
- `onMicWillStart` callback fires BEFORE `getUserMedia` in `startMic()`
- `fadeToVolume(0, 50)` → sets GainNode to 0 immediately + `audioElement.pause()`
- `AudioContext.resume()` called after `getUserMedia` to prevent suspension
- `HTMLAudioElement.volume` is FORBIDDEN — iOS resets it on audio session change

**Audio Battle Prevention (Oracle vs Radio):**
- `oracleHasSpokenRef` (boolean) — hard gate: mic data NOT sent to Gemini while Oracle speaks.
- VAD `rmsThreshold: 0.035` — prevents Oracle's own voice from triggering VAD.

### 3. Knife Phase — "Breaking Through" (Awakened)

The Oracle has NOT manifested yet. The arcade cabinet glitches (Max Headroom CSS) while knife questions emit from the cabinet screen.

- **NO 3D avatar in awakened phase** — `OracleAvatar3D` only renders when `isOracleMode === true`.
- **Static image** (`oracle-avatar-static`) shows with `oracle-glitch-phase` animation — the Oracle fighting to break through.
- **Knife voice-over:** When each question finishes the 1.35s delay and begins typing, a hidden `sendTextMessage` fires asking Oracle to speak the question. Transmission filter at Q=12 (tunnel voice) sweeps to Q=0.1 as each letter lands.
- **Bottom bar hidden** during awakened phase (opacity:0) — clear stage for knives.
- **Max Headroom glitch-phase:** `@keyframes oracle-headroom-phase` applied to `.oracle-avatar-smoke-hook` unconditionally in oracle phase — two signal-dropout bursts per 14s cycle (transform jitter + opacity drop). CSS-driven, no JS gate.

### 4. Cinematic Entrance — 80s Comic Book / Asimov × Philip K. Dick

Fires on knife selection (oracle phase entry). 3D Oracle face enters via 12-second cinematic:

- **Entry vector:** Slides in from **260px to the right**, arrives at center
- **Duration:** 12 seconds
- **Filter progression:** `blur(12px) brightness(4) hue-rotate(60deg)` → `blur(0) brightness(1) saturate(1) hue-rotate(0deg)` — 6 keyframes
- **Opacity:** `[0, 0, 0.15, 0.55, 0.85, 1]`
- **Easing:** `[0.22, 1, 0.36, 1]`

### 5. Holographic Halo Ring (`OracleHaloRing.tsx`)

Revolving text ring above the Oracle in oracle phase. Dual-arc revolving door mechanic:
- **Two arcs** at 0° and 180° offset — one always in view as the other sweeps out. No dead zones.
- **Text:** `SURROGATE:ORACLE  ·  SNEAKAR XR ANTHROPOLOGY AI  ·`
- **Colors:** Sacred Green chars, Profane Purple dots
- **Duration:** 8s per revolution, `perspective: 500px`, `radius: 130px`
- CSS keyframe: `@keyframes oracle-halo-orbit` in `SurrogateOracleImmersion.css`
- Only active when `isOracleMode === true`

### 6. Arcade Console Bottom Bar (Enculturate Crate)

- **Dormant + Awakened:** `opacity: 0`, `pointer-events: none` — hidden. Stage is clear.
- **Oracle:** `opacity: 0.65` — accessible but background.
- **Diegetic Navigation:** Tabs replaced with **MHz Frequency Tuner** (`RESONANCE`, `SQUAD`, `PRINTS`, `CORE_DIAG`, `SALVAGE`, `MANIFEST`).
- **Visuals:** Cards refactored into **Signal Fragments** with asymmetrical, fractured borders.
- **Diagnostics:** Real-time **Oscilloscope** in `CORE_DIAG` visualizes vocal VAD RMS.
- **Buttons:** Clean floaters with `btn-float` animation.
- **Desktop breakpoint (768px+):** Buttons scale up — images 52→72px, min-width 64→88px, labels 0.58→0.68rem.

### 7. AR Mode / XR (`useXRMode.ts`)

- **Hamburger menu always shows** `◈ AR MODE` / `◈ EXIT AR` — was previously hidden unless already in XR.
- `activateXRMode()` — sets `isXRMode=true` + starts camera. Called from hamburger.
- `deactivateXRMode()` — stops camera + resets `isXRMode=false`.
- XR activation: URL `?xr`, iframe detection, `holodexr:init` postMessage, or `SurrogateXR.launch()`.
- `?newuser` — bypasses returning-seeker check for dev/testing.

### 8. Step Logging — Canonical Step Names

The pressure test asserts on these exact strings. **Never rename without updating tests.**

```
OracleConversation MOUNTED          ok      — on component mount
ENV OK (Supabase vars)              ok      — validateEnvironment() passes
GEMINI WS CONNECTING                pending — connectToGemini() fires
GEMINI WS OPENED                    ok      — ws.onopen
GEMINI SESSION CREATED              ok      — session.created message
TAP → TERMINAL                      ok      — enterTerminal() user tap
LORE SKIPPED (DEV HOOK)             ok      — __oracle_skipLore used
LORE DONE → AWAKENED                ok      — awakeFromTerminal() fires
startSession() CALLED               ok      — greeting or phase entry
ORACLE ANNOUNCES TERRITORIES        ok      — territory sendTextMessage fires (+1200ms)
__ORACLE_BOOT__ path triggered      ok      — inside startSession()
KNIFE[N] SELECTED                   ok      — handleKnifeClick() fires
ORACLE PHASE ENTERED                ok      — setScenePhase('oracle') settled
ORACLE AUDIO START                  ok      — first PCM chunk of a turn
ENTERPRISE AUDIO WORKLET ACTIVE     ok      — Worklet viseme callback registered
MIC STARTED                         ok      — getUserMedia success
ORACLE TURN COMPLETE                ok      — turnComplete signal from Gemini
ORACLE SCORE: <phase> / <align> / +<n>c   ok   — score parsed from turn
ORACLE INTERRUPTED (barge-in)       warn    — serverContent.interrupted received
GEMINI WS ERROR                     err     — ws.onerror
INVOKING PORTRAIT EFA               pending
NEURAL PORTRAIT SYNTHESIZED ✓       ok
SESSION RESUMED (native handle)     ok      — Gemini session resumption restored context
SESSION CONTEXT RESTORED            ok      — blind summary fallback on reconnect
JOURNEY RESET → DORMANT             ok      — resetJourney() called
```

### 9. Visual Standards (Brand Kit)

- **Typography (Headers):** `aAnotherTag` with brand gradient (`#00ff88` → `#00ffcc`).
- **Typography (Body/UI):** `PhillySans` (Heavy weight, tracking 0.15em).
- **Panels:** `.neural-link-terminal` (Holographic glass, `blur(12px)`, Sacred Green borders, scanline overlay).
- **Palette:** Sacred Green `#00ff88`, Brand Cyan `#00ffcc`, Profane Purple `#b026ff`. Zero raw `#00ffff` or `#ff00ff` anywhere in source.
- **Awakened position:** Oracle centers at `top: 38%`, Medium Man size `clamp(170px, 46vmin, 280px)` during phase-glitch.

### 10. Avatar Animation (OracleAvatar3D)

**GLB confirmed morph targets:** All 15 OVR visemes + `eyeBlinkLeft`/`eyeBlinkRight`.

**Key animation parameters:**
- Head idle drift: ±1.4° (two incommensurate frequencies)
- Speech nod (0.62Hz): ±6.9° at full amplitude
- Speech tilt (0.37Hz): ±6.9° at full amplitude
- Lip closedness driver: `viseme_PP` fires when `openness < 0.55`
- Blink: slow (speed=6) at rest, fast (speed=13) during speech, 20% double-blink

---

## Known Bugs (open)

| Bug | Severity | File | Notes |
|-----|----------|------|-------|
| CI Audio Limitations | Low | `scripts/` | Headless CI cannot use mic. |
| Mobile Oracle voice | Medium | `OracleConversation` | Desktop confirmed working, mobile not verified. |

**Closed this session:**
- ✅ Vocal Ingestion — Hardened PCM path. Buffer 2048, AGC, and keep-alive gain fixed "silent mic" drops.
- ✅ Backend XD — Complete "Enculturate Crate" refactor to diegetic Frequency Tuner and Signal Fragments.
- ✅ Gemini model — Synchronized to `gemini-2.5-flash-native-audio-latest`.
- ✅ VAD visualizer — Added real-time Oscilloscope to CORE_DIAG tab.
- ✅ Restore Point — Git tag `restore-point-ingestion-fixed` created post-fix.
- ✅ Oracle voice — Standardized on `Sadaltager`.
- ✅ `toolConfig` rejected by new model — removed (was causing 1007 close).
- ✅ Breathing LFO — 0.07Hz LFO from alley ambience deleted.
- ✅ Transmission filter breathing — filter Q was persisting from knife phase into oracle phase; reset to Q=0.01 on oracle entry.
- ✅ 3D avatar in knife phase — removed. Only static image + Max Headroom glitch in awakened.
- ✅ Bottom bar glass slab (bento boxes) — removed opaque glass background from buttons.
- ✅ Bottom bar opaque wrapper — backdrop-filter was bleeding through opacity:0; reverted to transparent.
- ✅ Bottom bar hidden in awakened/knife phase.
- ✅ Max Headroom glitch-phase — CSS-driven, unconditional, no JS boolean gate.
- ✅ Knife card pointer-events — `.oracle-knife-card` needed explicit `pointer-events: auto`.
- ✅ Smoke test selector — `.oracle-knife-card:first-child` → `.oracle-knife-card` (origin-beam is first child).
- ✅ Holographic halo ring — dual-arc revolving door mechanic, 8s revolution.
- ✅ AR mode hamburger — always visible, `activateXRMode()`/`deactivateXRMode()` exposed.
- ✅ `?newuser` URL param — bypasses Supabase IP check for dev fresh-user testing.
- ✅ Music volume — 20% → 25% on landing.
- ✅ Knife question voice-overs — Oracle speaks each question through tunnel filter as it types.
- ✅ `toolConfig` restored then removed — new model doesn't accept it.

---

## Deployment
- **Web:** `pnpm build`
- **Functions:** `npx supabase functions deploy gemini-live-proxy --no-verify-jwt`
- **After proxy changes:** Must redeploy for session config forwarding and `sessionResumption` to take effect.
- **Model change:** Update `VITE_GEMINI_MODEL` in `.env.local` only — no code change, no deploy needed for frontend. Proxy doesn't need redeploy for model changes (model is sent client→proxy→Gemini).

---

## Backend Reality — Deployed Edge Functions (Inventory)

**Live Conversation Engine:**
- `gemini-live-proxy` — WebSocket proxy for Gemini 2.5 Flash Native Audio. Handles key rotation (free→paid tier on 3 abnormal closes). CRITICAL: WebSocket upgrade check must precede GET-method check in header validation.
- `oracle-conversation` — Text-only Gemini fallback (REST via `generateContent`) activated when Live WS drops. Uses same `GOOGLE_AI_API_KEY`. Model anchor: `gemini-2.5-flash`.

**Client-Invoked Functions:**
| Function | Purpose | Status |
|----------|---------|--------|
| `gemini-portrait-generator` | Neural image synthesis: Gemini 2.5 enriches theme → Gemini 2.0 Flash image gen, fallback cascade (Replicate, HuggingFace, Pollinations, DeepAI, Unsplash) | Active |
| `generate-claim-link` | Culture Coins: generate mintable claim link | Active |
| `oracle-memory-distill` | Post-session: distill conversation to 80-100 word summary for returning Seeker system prompt | Active |
| `seeker-echo` | Seeker profile persistence: read/write name, archetype, totem level, alignment, visit count | Active |

**Backend-Only / Webhook / Possibly Dead:**
| Function | Purpose | Invocation | Status |
|----------|---------|-----------|--------|
| `surrogate-portrait-generator` | Legacy alias delegating to `gemini-portrait-generator` | Not client-invoked | Overlaps — verify before deleting |
| `elevenlabs-tts` | ElevenLabs TTS API wrapper | Not client-invoked | Possibly dead — Gemini TTS is live |
| `elevenlabs-conversational-ai` | ElevenLabs conversational AI (create/send/get conversation) | Not client-invoked | Possibly dead — Gemini Live is live |
| `seeker-define` | Web-grounded identity: name+handles → Gemini generateContent + googleSearch + sources | Backend-only (not client-invoked) | Active — separate path, not spoken by Oracle |
| `culture-coin-manager` | Culture Coins: manager (fetch, update, sync metrics) | Direct fetch in components | Active |
| `mint-culture-coins` | Culture Coins: actual minting function | Not client-invoked (mock in useChainFuelz) | Active backend, but client is mock |
| `culture-crew-signup` | Culture Crew: email signup | Webhook target | Verify if active |
| `revenuecat-integration` | RevenueCat subscription integration | Direct fetch in InlineSubscriptionModal | Webhook target |
| `log-event` | Telemetry: fire-and-forget event logging | Direct fetch in analytics.ts | Active |
| `session-management` | Generic session CRUD | Not client-invoked | Possibly dead — Gemini session ≠ this |
| `initialize-user-storage` | User storage tier initialization | Not client-invoked | Possibly dead |
| `health-check` | Health check endpoint | Not client-invoked | Possibly dead — debug only |
| `decart-live-token` | Decart AI SDK token generation | Not client-invoked | Possibly dead — no client reference |

**Known Drift / Cleanup Candidates:**
- **Overlapping portrait generators:** `gemini-portrait-generator` is canonical; `surrogate-portrait-generator` is a 100% delegating alias. Verify callers before deleting the alias.
- **Mock wallet in useChainFuelz:** Returns `0xCF...PENDING` addresses. Real minting functions (`mint-culture-coins`, `generate-claim-link`) exist in backend, but client-side integration is stubbed. TODO: Await actual Edge Function call + real wallet SDK integration.
- **Possibly-dead functions:** `session-management`, `initialize-user-storage`, `health-check`, `decart-live-token` are not invoked by the client and not obvious webhook targets. Audit before deletion.
- **ElevenLabs functions:** `elevenlabs-tts` and `elevenlabs-conversational-ai` exist but are not called by the live client (Gemini is the TTS engine). Verify if they are still needed for any feature flag or offline fallback.

---

## ⚠ AGENT HAND-OFF — Security Hardening Session (2026-07-11)

**For the next agent picking this up.** An acidic audit ("roast") of the app surfaced real security / privacy / cost holes; this session remediated most of them via delegated sub-agents (Fable directing, Sonnet/Haiku doing the work). **Nothing is committed** — all changes live in the working tree (HEAD = `544fee7`). Full `pnpm build` passes; typecheck clean.

### ✅ Applied this session (uncommitted, build-verified)

| Area | Change | Files |
|------|--------|-------|
| PII RLS | RLS + `REVOKE` from anon on edge-function-only tables (`seeker_echo` = the "IRL dossier" table, `culture_crew`, `surrogate_sessions`). Non-breaking (service_role bypasses RLS). | `supabase/migrations/20260701000000_rls_lock_pii_tables.sql` *(new)* |
| user_wallets | Was client-direct with the anon key → moved server-side into a service-role function; client refactored to call it. Behavior (returning-seeker detection, onboarding transitions, `?newuser`, localStorage fallbacks) preserved. | `supabase/functions/user-wallet-sync/index.ts` *(new)*, `src/hooks/useIpCheck.ts` *(edited)* |
| user_wallets RLS | Gated lock — **apply only after the client refactor is live in prod.** | `supabase/migrations/20260701000001_rls_lock_user_wallets.sql` *(new)* |
| surrogate_portraits | Closed the delete-any-portrait-by-id hole + whole-table read. Client read/delete moved into a service-role function with ownership-scoped delete (`WHERE id=$id AND owner-match`); gated RLS lock. Creation unaffected (`gemini-portrait-generator` writes with service_role). | `supabase/functions/portrait-gallery/index.ts` *(new)*, `src/components/PortraitGalleryDashboard.tsx` *(edited)*, `supabase/migrations/20260701000002_rls_lock_surrogate_portraits.sql` *(new)* |
| Proxy hardening | `gemini-live-proxy`: `ALLOW_PAID_FAILOVER` (default **OFF** — kills auto-escalation to the paid Gemini key), `ALLOWED_ORIGINS` (fail-open if unset), `MAX_SESSION_MS` (15-min hard cap). | `supabase/functions/gemini-live-proxy/index.ts` *(edited)* |
| Git hygiene | Untracked the 2MB self-appending dev log + 3 GLB corpses incl. `hero3.glb.broken` (~16MB total); added ignore rules. | `.gitignore` *(edited)*, `git rm --cached` staged |
| Deps | Removed dead `wouter`. Kept `date-fns` (real peer of `react-day-picker` via `ui/calendar.tsx`) and both headless browsers (scripts use them). | `package.json`, `pnpm-lock.yaml` |
| Docs | Backend Reality inventory (section above). | `CLAUDE.md` |

### ✅ `surrogate_portraits` — COMPLETED this session (build-verified)

Closed via the same server-side pattern as `user_wallets`: new `supabase/functions/portrait-gallery/index.ts` (service role) with `list` (hard-gated — returns `{data:[]}` rather than ever running an unfiltered select) and ownership-scoped `delete` (`WHERE id=$id AND owner-match`, reports `{deleted:true}` only when a row actually matched); `PortraitGalleryDashboard.tsx` refactored to call it (UI removal only on `deleted:true`); gated RLS migration `…20260701000002`. Deploy per step 5 below.
> Note: there is **no real auth** in this app (anonymous, IP-keyed) → this is *best-effort* ownership scoping (the client claims its own ids). It still closes the two real holes: whole-table read and delete-any-row-by-id. A real auth identity (see Remaining) would upgrade this to true per-user RLS.

### 🟡 Remaining (need product/owner decisions — do NOT auto-implement)
- **Wallet split-brain:** `useChainFuelz` is a mock (`0xPENDING_PATRICK_SDK`, `// TODO: Await actual Edge Function call`); real minting functions exist. Wiring real crypto vs. clearly labeling a demo is a product call (real money, user-facing copy).
- **Identity hardening:** still keyed on an `api.ipify.org` fetch. `user-wallet-sync` could derive the IP from request headers server-side as an incremental step; the real fix is a proper auth identity (also unblocks true per-user RLS on portraits).
- **Radix pruning:** ~27 unused `@radix-ui/*` packages — install-size only (Vite tree-shakes the bundle). Optional.
- **Bundle weight:** build warns ~1.8MB main chunk — code-split candidate.

### 🚀 DEPLOYMENT ORDER (order-sensitive — every change above is inert until deployed)
1. Deploy `user-wallet-sync` **and** ship the refactored client **first**.
2. Deploy the hardened `gemini-live-proxy`. Env: set `ALLOW_PAID_FAILOVER=true` to restore auto-paid-failover (otherwise the Oracle fails **visibly** on free-quota exhaustion instead of silently spending on the paid key — this is the intended default); set `ALLOWED_ORIGINS` (comma-separated) to lock origins; `MAX_SESSION_MS` optional (default `900000`).
3. Apply migration `…20260701000000` (PII tables) — safe anytime.
4. Apply migration `…20260701000001` (user_wallets) — **only after step 1 is live in prod**, or returning-seeker detection breaks.
5. Deploy `portrait-gallery` **and** ship the refactored `PortraitGalleryDashboard` client, then apply migration `…20260701000002` (surrogate_portraits) — same client-first ordering as step 1/4.
