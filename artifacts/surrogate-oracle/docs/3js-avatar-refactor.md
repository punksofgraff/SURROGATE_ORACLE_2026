# Three.js Avatar Refactor — Oracle Real-Time Experience

**Session date:** 2026-05-30  
**Branch:** main

---

## What changed and why

The previous architecture bolted a Three.js GLB avatar onto a system still designed around Decart as primary. The result was three parallel rendering paths running simultaneously, a wasted 22-second Decart ICE negotiation on every awakened entry, MediaPipe vision calibration firing for a hidden canvas, and `OracleAvatar3D` traversing the full scene graph every frame with hardcoded morph target indices that didn't match the GLB.

This refactor makes Three.js the canonical primary renderer, adds a fully self-contained OVR viseme pipeline built from the GLB geometry, and wires pinch zoom + gaze tracking as a unified look-around system.

---

## Architecture

### Avatar rendering

```
PRIMARY   Three.js OracleAvatar3D (always running once awakened)
ENTERPRISE Decart WebRTC video overlay (VITE_DECART_ENTERPRISE=true, concurrent, non-blocking)
```

Three.js never waits on Decart. If Decart connects, it layers over the top. If it fails, nothing degrades.

### Audio → lip sync pipeline

```
Gemini WS → onOracleResponse(Int16Array)
  → PCMPlayer.feed()
  → oracle-audio.worklet.ts (gapless PCM + Goertzel viseme detection)
  → VisemeState { viseme, openness, rounded, spread, amplitude }
  → visemeStateRef.current        ← ref write, no React re-render
  → OracleAvatar3D.useFrame()
  → 15 OVR morph target influences (Wolf3D_Head + Wolf3D_Teeth)
```

### Camera + gaze pipeline

```
Mouse move / gyro / touch drag → useParallax → cameraStateRef.x/y
Pinch / scroll wheel           → useParallax → cameraStateRef.zoom

OracleAvatar3D.useFrame():
  cameraStateRef → camera.position lerp (cinematic follow)
  cameraStateRef.x/y → LeftEye, RightEye, Head, Neck bone rotations (gaze tracking)
```

---

## Files changed

### Source

| File | Change |
|------|--------|
| `src/components/OracleAvatar3D.tsx` | Complete rewrite — OVR morph mapping, gaze tracking, camera control via `useThree` |
| `src/components/SurrogateOracleImmersion.tsx` | Viseme ref pattern, Canvas config + Suspense, Decart decoupled from primary init |
| `src/hooks/useOracleConnection.ts` | Split `initializeOracle` → `initializePCMPlayer` (instant) + `initializeDecart` (async, opt-in) |
| `src/hooks/useParallax.ts` | Added single-finger touch drag, pinch zoom, scroll wheel zoom, `onZoom` callback |

### Asset

| File | Change |
|------|--------|
| `public/hero3.glb` | 15 OVR viseme morph targets injected into Wolf3D_Head + Wolf3D_Teeth (4956 KB → 5361 KB) |

### Scripts

| Script | npm command | What it does |
|--------|-------------|--------------|
| `scripts/oracle-morph-inject.mjs` | `npm run inject` | Generates OVR viseme blend shapes from GLB vertex geometry and writes them into hero3.glb. No Blender, no RPM API. |
| `scripts/oracle-calibrate.mjs` | `npm run calibrate` | Reads morph targets from hero3.glb, detects naming convention (OVR/VRM/ARKit/custom), patches `ORACLE_TO_OVR` in OracleAvatar3D.tsx. |
| `scripts/oracle-morph-verify.mjs` | `npm run verify` | 42 assertions: structure, non-zero displacement, locality (mouth > forehead), X-symmetry. |
| `scripts/oracle-gaze-verify.mjs` | `npm run gaze-verify` | 34 assertions: gaze bones rigged, lerp convergence, hierarchy ordering, zoom formula, pinch math. |

---

## OVR viseme pipeline

The hero3.glb is a Ready Player Me (Wolf3D) avatar exported from Blender without blend shapes. Rather than depending on the RPM API (sunset), morph targets are generated from scratch:

1. **Inject** — `oracle-morph-inject.mjs` reads Wolf3D_Head (2163 verts) and Wolf3D_Teeth (98 verts) from the GLB binary chunk, applies Gaussian landmark-based displacement for all 15 OVR phoneme shapes, and writes them back as valid GLTF morph target accessors.

2. **Calibrate** — `oracle-calibrate.mjs` reads the morph target names, detects the convention, and patches `ORACLE_TO_OVR` in `OracleAvatar3D.tsx`. Running inject then calibrate is the full re-pipeline after any GLB change.

3. **Verify** — `oracle-morph-verify.mjs` confirms all 15 visemes have non-zero displacement data, that mouth-region vertices move more than the forehead (locality), and that left/right displacements are mirror-symmetric.

**Verified displacement profile:**

| Viseme | Phoneme | maxDY (jaw) | maxDZ (protrusion) | mouth-RMS |
|--------|---------|-------------|-------------------|-----------|
| viseme_aa | "ah" | 0.02170 | 0.00405 | 0.00964 |
| viseme_oh | "oh" | 0.01562 | 0.00288 | 0.00687 |
| viseme_ou | "oo" | 0.00532 | **0.01037** | 0.00526 |
| viseme_E  | "eh" | 0.00456 | 0.00192 | 0.00235 |
| viseme_PP | p/b/m | 0.00246 | 0.00000 | 0.00125 |

If the GLB is ever replaced: `npm run inject && npm run calibrate`.

**Oracle worklet → OVR mapping:**

```
X → viseme_sil    A → viseme_aa    E → viseme_E     I → viseme_ih
O → viseme_oh     U → viseme_ou    B → viseme_PP    C → viseme_sil
D → viseme_DD     F → viseme_FF    G → viseme_kk    H → [viseme_ou, viseme_oh]
```

Co-articulation secondaries blend `openness → viseme_aa`, `rounded → viseme_ou`, `spread → viseme_E` at reduced weight alongside the dominant shape.

---

## Gaze tracking

The Oracle watches the user. Same `cameraStateRef.x/y` values that drive CSS parallax layers also drive bone rotations — so the Oracle's gaze follows wherever the user is looking from.

**Hierarchy (all read from `cameraStateRef` in the same `useFrame`):**

| Bone | Max angle | Lerp factor | 90% target |
|------|-----------|-------------|-----------|
| LeftEye / RightEye | ±17° H, ±10° V | 0.14 | **267ms** — eyes dart first |
| Head | ±5.7° H, ±3.4° V | 0.04 | **950ms** — head follows |
| Neck | ±2.3° H | 0.025 | **1517ms** — barely perceptible, kills the robot feel |

Input clamped to ±1 before applying, so oracle phase intensity (1.2×) cannot over-rotate the eyes.

---

## Pinch zoom + look-around

| Input | Device | Effect |
|-------|--------|--------|
| Mouse move | Desktop | Look-around X/Y |
| Scroll wheel | Desktop | Zoom |
| Single-finger drag | Mobile (no gyro) | Look-around X/Y |
| Gyro | Mobile | Look-around X/Y (priority) |
| Two-finger pinch | Mobile | Zoom |

**Camera Z formula:** `Z = clamp(2.8 / zoom, 0.7, 2.8)`

Reciprocal mapping gives natural optical zoom feel. Zoom range 1→4 maps to Z 2.8→0.7 (full body → face close-up). Both ends are hard-clamped — zoom < 1 cannot send the camera to Z = ∞.

**Cinematic lerp:** `CAM_LERP = 0.05`. The camera drifts toward its target rather than snapping. Even after a gesture ends, the camera settles like a floating handheld shot. `camera.lookAt(0, CAM_Y_CENTER, 0)` runs every frame — zooming in always goes straight to the Oracle's face.

---

## Key decisions

**Viseme state as ref, not state** — `visemeStateRef` is a plain `useRef`, written by the AudioWorklet callback at up to 60fps. No `setState` means no React re-renders at 60fps. `OracleAvatar3D.useFrame` reads the ref directly.

**Decart decoupled** — `initializePCMPlayer()` is synchronous and runs immediately on `awakened`. `initializeDecart()` is async and only called when `VITE_DECART_ENTERPRISE=true`. The 22-second Decart timeout no longer blocks or delays the Three.js experience.

**MediaPipe moved** — Vision calibration (`calibrateOracle` / `disposeVisionModel`) now lives exclusively inside `initializeDecart()`. The MediaPipe wasm binary no longer loads on every session.

**Zoom clamp bug found by test** — `gaze-verify.mjs` caught that `zoomToZ(0.1)` returned Z=28 (camera flies to 10m away). Fixed by adding `Math.max(zoom, 1)` before division.
