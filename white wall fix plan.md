# White Wall Fix Plan

## Status

**The white wall is not conclusively identified yet.**

The project has accumulated several overlapping visual layers, so the next fix must be evidence-driven instead of another broad visual rewrite. The goal is to identify the exact element that paints the rectangle, remove only that element, and verify each Oracle phase independently.

---

## Symptom

In some Oracle states, the avatar/presence appears inside or behind a white rectangular wall. The wall has been reported as an unwanted 2D-looking surface. The exact phase and device/browser where it appears have not yet been captured in a reliable screenshot.

The remaining question is whether the rectangle comes from:

1. A GLB mesh or material containing a plane/background.
2. The R3F/WebGL canvas or postprocessing render target clearing opaquely.
3. The avatar wrapper/canvas bounds exposing a rectangular compositing surface.
4. A CSS cabinet, pseudo-element, filter, or backdrop layer.
5. A still-visible image or canvas missed by the visual audit.

---

## Attempts Already Made

### 1. Removed the full-screen atmosphere canvas

The old `useAtmosphere` 2D canvas system was removed from runtime.

**Reason:** It was a full-screen composited layer and could visually compete with the Three.js scene.

### 2. Removed MatrixRain

The full-screen `MatrixRain` 2D canvas was deleted from runtime.

**Reason:** It added another full-stage canvas and made it harder to identify which layer owned the rectangle.

### 3. Removed the static white-backed avatar poster

The old external/static avatar poster was removed from runtime.

**Reason:** It was the most obvious candidate for a white rectangular background.

**Important:** Stale `.oracle-avatar-static` CSS remains in the stylesheet, but no runtime element currently uses that class. The CSS should eventually be cleaned up after the actual Oracle phase is verified.

### 4. Removed the incorrect centered landing particle DOM cluster

An interim `LandingSignalParticles` implementation used centered DOM dots with CSS transforms and animation. It was removed.

**Reason:** It did not use the existing Three.js/Rapier particle systems and did not satisfy the intended visual direction.

### 5. Added a full-stage landing R3F particle field

The landing field now uses the existing:

- `OracleQuarks`
- `OracleNebula`
- `OraclePhysicsDebris`

It is positioned across the full stage rather than inside the avatar wrapper.

**Important implementation constraint:** The field remains gated by the existing GPU/WebGL admission check. Removing that gate caused the preview sandbox to attempt another WebGL context and show:

```text
THREE.WebGLRenderer: Error creating WebGL context
```

The gate was restored so unsupported WebGL previews do not crash.

### 6. Forced WebGL transparency

The R3F renderer and scene now explicitly use:

- `alpha: true`
- `scene.background = null`
- `gl.setClearColor(0x000000, 0)`
- `gl.setClearAlpha(0)`
- Transparent canvas CSS

This was applied to both the landing field and the main Oracle R3F canvas.

**Reason:** A renderer/composer clear could otherwise expose an opaque rectangular canvas surface.

### 7. Removed the visible Oracle spectrum 2D canvas

`OracleSpectrumRing` was removed from the Oracle runtime and its unused component file was deleted.

**Reason:** It was a full avatar-wrapper 2D canvas layered over the WebGL Oracle. Although it called `clearRect`, it was an unnecessary compositing surface and a plausible contributor to the rectangle.

### 8. Audited the remaining canvas elements

The remaining canvas uses are:

- `ParticleTypographyCard`: localized 2D sparks around ghost/guide/knife text.
- `useXRMode`: offscreen 2D canvas for camera/face processing.
- R3F `<Canvas>` elements: WebGL scene renderers.

The localized text canvas is not full-screen and should not be able to create the reported wall.

### 9. Adjusted radio gain

The radio volume reduction was moved to the actual Web Audio gain boundary:

- `RADIO_VOLUME_SCALE = 0.8`
- Initial gain applies the scale.
- Fade targets apply the same scale.

This avoids applying the reduction only to some scene constants or inconsistently during fades.

---

## Verification So Far

- The production diff identified the strongest regression: production commit
  `f220bc60a903ca78ab5e842d6c5b267af2bf938c` kept the outer WebGL wrapper static,
  while later commit `c32bb4723a7a1c506d07cc5761e68333865ad88d` added
  `oracle-phase-manifest` to that wrapper. The wrapper contains the expanded
  R3F canvas, so its brightness/filter/transform animation could expose a
  rectangular compositing surface. The forward fix restores the stable wrapper
  behavior while retaining the newer GLB transporter.
- TypeScript typecheck passes.
- Production build passes.
- Managed web workflow restarts successfully.
- Preview was clean after restoring the GPU admission gate.
- Preview cannot create WebGL in the current sandbox, so it cannot prove the real-device WebGL compositing result.

The preview environment reported:

```text
Could not create a WebGL context
```

Therefore, a browser screenshot from the sandbox is useful for DOM/CSS auditing but cannot validate the Three.js output itself.

---

## Controlled Next Diagnosis

Do these steps in order. Do not make another broad visual rewrite until the failing layer is identified.

### Step A — Capture the failing state

Capture a screenshot showing the white wall and record:

- `scenePhase`: dormant, terminal, awakened, or oracle
- Whether the Oracle has spoken yet
- Whether portrait reveal is active
- Whether XR mode is active
- Browser and device
- Whether the wall appears before or after WebGL materialization

### Step B — Add temporary layer probes

Temporarily add clearly colored, low-opacity diagnostic outlines—not fills—to these layers:

1. `.oracle-stage`
2. `.oracle-cabinet`
3. `.oracle-avatar-wrapper`
4. `.oracle-avatar-canvas`
5. The R3F `<Canvas>` element
6. Any postprocessing/composer wrapper

The goal is to identify which rectangle has the same bounds as the white wall.

### Step C — Disable layers one at a time

Use a development-only query flag or debug panel to toggle, independently:

1. Main R3F canvas.
2. `EffectComposer`.
3. `OracleAvatar3D`.
4. `OracleQuarks`.
5. `OracleNebula`.
6. `OraclePhysicsDebris`.
7. CSS cabinet/backdrop effects.

The first toggle that removes the wall identifies the owning subsystem.

### Step D — Inspect the GLB only if the wall survives canvas tests

If the rectangle remains after disabling the composer and WebGL canvas effects, inspect the loaded GLB:

- List mesh names.
- List material names.
- Check for plane/quad-like geometry.
- Check material `side`, `transparent`, `opacity`, and `map`.
- Check whether any material has a white base color or white texture.

Do not delete GLB geometry until the mesh is identified by name and verified in isolation.

### Step E — Check postprocessing clear behavior

If the wall disappears when `EffectComposer` is disabled:

- Confirm the composer uses the same transparent renderer.
- Confirm all render passes preserve alpha.
- Check whether Bloom or another pass writes an opaque background.
- Test with only `Bloom`, then with no passes.

The fix should be limited to the pass or clear configuration that introduces opacity.

### Step F — Verify on real mobile hardware

After identifying and fixing the owning layer, verify at minimum:

- iPhone Safari, normal Oracle mode.
- iPhone Safari, XR mode if available.
- Android Chrome if available.
- Desktop Chromium fallback.

Verify both the white wall and the particle field. Do not rely on the current sandbox for WebGL visual confirmation.

---

## Do Not Reintroduce

- Full-screen 2D atmosphere canvases.
- MatrixRain as another full-stage canvas.
- Static white-backed avatar posters.
- Centered DOM particle clusters pretending to be the Three particle field.
- Unconditional R3F canvas creation before GPU/WebGL admission.
- Broad CSS opacity changes without a screenshot of the failing phase.

---

## Definition of Done

The fix is complete only when all of the following are true:

- No white rectangular wall appears in dormant, awakened, or Oracle mode.
- No white rectangular wall appears during portrait reveal.
- No white rectangular wall appears during XR mode.
- The GLB avatar remains visible and properly composited.
- Landing particles use the existing Three/Rapier systems.
- Unsupported WebGL environments do not show a renderer crash overlay.
- Radio gain is audibly reduced consistently during initial playback and fades.
- Typecheck, production build, and workflow restart pass.
- At least one real mobile WebGL screenshot confirms the result.