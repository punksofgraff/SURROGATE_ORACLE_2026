# Immersive Rework & 3D Avatar Migration Plan

## 1. Overview
The goal is to deeply correct the immersive experience by fixing atmospheric audio handoffs (ducking bugs) and migrating from the rudimentary 2D WebGL mesh warper to a full client-side 3D WebGL avatar using Three.js and the newly provided `hero3.glb` model.

## 2. Audio & Behaviorism Fixes
The current implementation awkwardly cuts the ambient radio and gates microphone access behind a UI button, breaking the immersion.

**Proposed Changes:**
1.  **Remove Radio Kill Switch:** In `SurrogateOracleImmersion.tsx`, remove the logic that explicitly calls `setIsAudioPlaying(false)` when `scenePhase === 'oracle'`.
2.  **Fix Ducking Target:** Update the `targetVolRef` logic so that when `scenePhase === 'oracle'`, the target volume is set to a low atmospheric hum (e.g., `0.02`), rather than muting it completely or tying it solely to `isMicActive`.
3.  **Decouple iOS Mic Handoff:**
    *   Currently, the user must click "Open Frequency" to grant microphone access.
    *   **Fix:** We will initialize the `AudioContext` and request microphone permissions proactively during the `handleFirstTap` or `awakeFromTerminal` transitions (which are already user gestures). This ensures the mic channel is open and ambiently ready when the Oracle begins speaking.
    *   **Fallback:** The "Open Frequency" button remains as a fallback/toggle, but the default path becomes seamless.

## 3. 3D Avatar Integration (Three.js + React Three Fiber)
We will replace `OracleFaceRenderer` and `DecartClient` with a new 3D avatar component.

### Step 3.1: Asset Preparation
*   Move `hero3.glb` into `artifacts/surrogate-oracle/public/`.
*   Ensure the model has the necessary blendshapes (morph targets) for lip-syncing (e.g., visemes like A, E, I, O, U, or standard ARKit blendshapes).

### Step 3.2: Dependency Installation
We will need to add the following packages to the `artifacts/surrogate-oracle` project:
*   `three`
*   `@react-three/fiber`
*   `@react-three/drei` (for GLTF loading and helpers)

### Step 3.3: Component Architecture
1.  **`OracleAvatar3D.tsx`:** A new React Three Fiber component responsible for:
    *   Loading and rendering the `hero3.glb` model.
    *   Setting up lighting and camera to match the cyberpunk alley aesthetic.
    *   Applying materials/shaders to fit the world (e.g., matching the neon/phosphor glow).
2.  **Audio-Driven Lip Sync:**
    *   We will retain the existing `useOracleConnection` and `oracle-audio.worklet.ts` pipeline, which already extracts amplitude and viseme states from the Gemini audio stream.
    *   Instead of passing these to the 2D `OracleFaceRenderer`, we will pass them to `OracleAvatar3D`.
    *   Inside `OracleAvatar3D`, a `useFrame` hook will map the incoming `amplitude` and `viseme` state to the corresponding GLTF morph targets on the model's mesh.
3.  **Head Tracking (Optional Enhancement):**
    *   We can map the existing `_tiltX` and `_tiltY` from `useParallax` to the 3D model's neck/head bone rotations, making the Oracle subtly follow the user's cursor/device orientation.

### Step 3.4: Integration into SurrogateOracleImmersion
*   Replace the `canvas` element managed by `OracleFaceRenderer` with the new `<Canvas>` component wrapping `OracleAvatar3D`.
*   Pass the real-time viseme data as props or via a shared ref.

## 4. Execution Phases

1.  **Phase 1: Audio Fixes:** Implement the ducking and mic handoff changes in `SurrogateOracleImmersion.tsx`.
2.  **Phase 2: Three.js Setup:** Install dependencies, move the `.glb` file, and scaffold the `OracleAvatar3D` component.
3.  **Phase 3: Animation Wiring:** Connect the audio worklet's output to the 3D model's morph targets.
4.  **Phase 4: Aesthetic Polish:** Adjust lighting, materials, and positioning to ensure the 3D model sits perfectly within the 2D background layers.