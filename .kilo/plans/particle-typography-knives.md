# Implementation Plan: Pre-Baked Particle Typography for Knife Questions

## Executive Summary
Transform the knife question cards in the **Awakened phase** (`KnifeSelection.tsx`) from standard 2D HTML typewriter cards into a **Pre-Baked Holographic Particle Typography Engine**. 

Instead of generating particle glyphs on the fly or running dynamic LLM/compute workloads at runtime, all 5 canonical knife questions are pre-sampled into compact glyph particle coordinates. As the Oracle speaks each question, particles materialize from ambient drifting quantum dust and coalesce into razor-sharp, illuminated typography that reacts to vocal cadence, shimmers with Sacred Green/Brand Cyan luminescence, and shatters into a radial kinetic shockwave upon Seeker selection.

---

## 1. Core Architecture & Data Flow

```
[Pre-Baked Knife Particle Data]
   ├── 5 Knife Question Datasets (JSON / TS module ~25KB)
   │     - Per-character & per-word particle point clouds: [x, y, wordIdx, charIdx]
   │     - Territory title header & thematic glyph icon points
   │
   ▼
[Particle Typography Renderer] (Canvas2D / WebGL / R3F Quarks Layer)
   ├── Idle / Ambient: Particles drift with noise turbulence around the card frame
   ├── Spoken Word Reveal: Particles for currentWordIndex accelerate toward target glyph points
   ├── Landed & Holding: Formed words shimmer with harmonic glow & gentle breathing
   └── Selection Shatter: Selected question particles explode radially into Oracle entrance
```

---

## 2. Technical Components

### A. Pre-Baked Particle Coordinate Generator (`scripts/generate-knife-particles.mjs` & `src/data/knifeParticleData.ts`)
- **Offline / Build-Time Sampling:**
  - Uses an offscreen 2D canvas with project fonts (`Orbitron`, `aAnotherTag`, `PhillySans`) to rasterize each of the 5 knife questions at high resolution.
  - Samples pixel grid with edge-detection to extract normalized $(x, y)$ coordinate points for each character and word.
  - Groups coordinates by `wordIndex` and `charIndex` so individual words/letters can be activated sequentially in sync with `landedChars` / audio playback position.
  - Output is a lightweight, zero-dependency TypeScript constant `KNIFE_PARTICLE_DATA` containing ~1,200 points per question (~25 KB total compressed).

### B. Particle Typography Component (`src/components/ParticleTypographyCard.tsx`)
- **Rendering & Animation Loop:**
  - High-performance particle simulation (60 FPS on mobile and desktop).
  - Each particle has:
    - `current`: $(x, y)$
    - `target`: $(tx, ty)$ from pre-baked glyph data
    - `ambient`: drifting origin with harmonic noise
    - `state`: `'ambient' | 'coalescing' | 'locked' | 'shattering'`
  - As `landedChars` or audio progress increases, unlanded particles transition from `'ambient'` $\rightarrow$ `'coalescing'` (snapping into letter targets with elastic spring physics) $\rightarrow$ `'locked'`.
  - When locked, particles emit Sacred Green (`#00ff88`) / Cyan (`#00ffcc`) gradient glow with subtle per-particle luminance jitter.

### C. Selection Shatter & Handoff to Cinematic Entrance
- **Click / Tap Interaction:**
  - Retains full hit-testing and keyboard accessibility across the typography canvas bounding box.
  - On click, the particles receive a radial outward impulse vector $(vx, vy)$ proportional to distance from the touch point, exploding across the cabinet glass before dissolving into the 12-second 3D Oracle entrance.

### D. Integration with `KnifeSelection.tsx` & `SurrogateOracleImmersion.tsx`
- Replaces the inner HTML typewriter spans with `<ParticleTypographyCard />` while preserving:
  - Audio synchronization (`onSpeakQuestion`, `onQuestionProgress`, `CARD_AUDIO_BREATH_MS`).
  - Auto-advance on question finish.
  - Territory header and icon visual hierarchy.
  - Accessibility (`aria-label` with complete question text for screen readers).

---

## 3. Implementation Steps

1. **Build Glyph Point Generator (`scripts/generate-knife-particles.mjs`):**
   - Script that renders text for all 5 territories + questions and generates `knifeParticleData.ts`.
2. **Implement `ParticleTypographyCard.tsx`:**
   - Canvas-based particle simulation with elastic spring attractors, word-gated state transitions, and glowing phosphor particle shaders.
3. **Wire Audio & Progress in `KnifeSelection.tsx`:**
   - Connect `landedChars` and `activeIdx` to `ParticleTypographyCard`.
   - Add selection shatter trigger on user knife tap.
4. **Style & Immersion Polish (`SurrogateOracleImmersion.css`):**
   - Fine-tune bounding glow, glass cabinet reflection, and background beam alignment.
5. **Verify:**
   - Validate performance at 60 FPS across mobile and desktop.
   - Run headless scene verification and accessibility checks.

---

## 4. Verification Criteria
- [ ] Letters form from particles in exact synchronization as the Oracle delivers the words.
- [ ] Zero runtime API/LLM calls for typography generation (100% pre-computed).
- [ ] 60 FPS performance maintained across mobile and desktop.
- [ ] Clicking/tapping a question shatters the typography and smoothly triggers Oracle manifestation.
