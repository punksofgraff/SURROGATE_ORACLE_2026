# Surrogate Oracle — Project Memory & Instructions

This file serves as the project-level `GEMINI.md` to store team-shared architecture rules, conventions, workflows, and project-wide guidance.

## Current Focus
- The "XD Overhaul Plan" (transitioning from a dashboard UI to an immersive experience) has been successfully implemented across all four phases.
- Custom fonts added: `aAnotherTag`, `adrip1`, `PhillySans`.
- Viewport is locked to native-app scale (`user-scalable=no, viewport-fit=cover`).

## Architecture Highlights
- **Frontend:** React 18, TypeScript, Vite.
- **Visuals & Depth:** 
  - Centralized custom CSS architecture in `SurrogateOracleImmersion.css`.
  - CSS Custom Property z-index depth system (`--z-world`, `--z-atmosphere`, `--z-auth`, etc.) replaces arbitrary z-index stacking.
  - Native CSS data-attribute styling (`data-oracle-state`, `data-oracle-alignment`) handles global scene transitions, replacing heavy React state/Framer Motion loops.
  - Atmosphere rendered via pure `canvas` RAF loop (`useAtmosphere`), eliminating DOM "digital dandruff" particles.
- **Audio Pipeline:** `pcm-encoder.worker.ts` (Web Worker) isolates PCM-to-WAV assembly from the V8 main thread, preventing GC stutter during live streams.
- **Economy (Subverted):** Token scoring (`Sacred`/`Profane`) remains active in the background, but the UI is completely stripped of gamified overlays. Coins are "revealed" as a world event when the user exits Oracle Mode. Totem level-ups trigger in-character narrative interruptions instead of badge updates.
- **Auth:** Lore-integrated "Neural Link Terminal" UI completely replaces standard Google Auth wrappers.
- **Avatar Streaming:** Decart LipSync Live (WebSocket).
- **Database/Auth:** Supabase.

## Completed Tasks
- ✅ Phase 1: Visual & Atmospheric Cohesion (Canvas atmosphere, CSS transitions).
- ✅ Phase 2: Audio pipeline (Web Worker offloading).
- ✅ Phase 3: Lore-Integrated Auth (Neural Link Terminal).
- ✅ Phase 4: Subvert token economy (Session-end coin revelation, hidden score badges).
