# Surrogate Oracle — Project Memory & Instructions

This file serves as the project-level `GEMINI.md` to store team-shared architecture rules, conventions, workflows, and project-wide guidance.

## Current Focus
- The "XD Overhaul Plan" (transitioning from a dashboard UI to an immersive experience) has been successfully implemented across all four phases.
- Custom fonts added: `aAnotherTag`, `adrip1`, `PhillySans`.
- Viewport is locked to native-app scale (`user-scalable=no, viewport-fit=cover`).
- **ChainFuelz Partner Integration:** The "Ghost Infrastructure" is deployed. The system is structurally prepped to accept the ChainFuelz SDK to seamlessly drop users into branded Culture Crew Web3 wallets upon email authentication.

## Architecture Highlights
- **Frontend:** React 18, TypeScript, Vite.
- **Visuals & Depth:** 
  - Centralized custom CSS architecture in `SurrogateOracleImmersion.css`.
  - CSS Custom Property z-index depth system (`--z-world`, `--z-atmosphere`, `--z-auth`, etc.) replaces arbitrary z-index stacking.
  - Native CSS data-attribute styling (`data-oracle-state`, `data-oracle-alignment`) handles global scene transitions, replacing heavy React state/Framer Motion loops.
  - Atmosphere rendered via pure `canvas` RAF loop (`useAtmosphere`), eliminating DOM "digital dandruff" particles.
- **Audio Pipeline:** `pcm-encoder.worker.ts` (Web Worker) isolates PCM-to-WAV assembly from the V8 main thread, preventing GC stutter during live streams.
- **Economy (Subverted):** Token scoring (`Sacred`/`Profane`) remains active in the background, but the UI is completely stripped of gamified overlays. Coins are "revealed" as a world event when the user exits Oracle Mode. Totem level-ups trigger in-character narrative interruptions instead of badge updates.
- **Auth (Zero-Config Email OTP):** Lore-integrated "Neural Link Terminal" UI completely replaces standard Google Auth wrappers. We use **Supabase Email OTP** to bypass Google OAuth domain restrictions on Replit. Users receive a 6-digit code to log in, preserving immersion.
- **Wallet Infrastructure (ChainFuelz):** 
  - Ghost hook (`useChainFuelz.ts`) and UI placeholders are active in the `BackendControlPanel`.
  - Supabase `culture_crew` and `surrogate_sessions` tables have been migrated via CLI (`chainfuelz_wallet_address`, `on_chain_tx_hash`, `culture_coins_minted`) to support non-custodial wallet generation.
  - Edge function stub (`mint-culture-coins`) is prepared for secure server-side minting once the SDK is provided.
- **Avatar Streaming:** Decart LipSync Live (WebSocket).
- **Database/Auth:** Supabase.

## Completed Tasks
- ✅ Phase 1: Visual & Atmospheric Cohesion (Canvas atmosphere, CSS transitions).
- ✅ Phase 2: Audio pipeline (Web Worker offloading).
- ✅ Phase 3: Lore-Integrated Auth (Neural Link Terminal with Email OTP).
- ✅ Phase 4: Subvert token economy (Session-end coin revelation, hidden score badges).
- ✅ ChainFuelz Ghost Infrastructure deployment & Supabase DB migration.
