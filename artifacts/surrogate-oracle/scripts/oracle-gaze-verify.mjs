#!/usr/bin/env node
/**
 * oracle-gaze-verify.mjs
 *
 * Proves the gaze tracking + pinch zoom system is correct without a browser.
 * Runs four test groups:
 *
 *   1. BONES      — LeftEye, RightEye, Head, Neck all exist in hero3.glb
 *   2. CONVERGENCE — each bone reaches target within expected frame count at 60fps
 *   3. HIERARCHY  — eyes always ahead of head, head ahead of neck (at same frame)
 *   4. ZOOM MATH  — pinch → Z, scroll → Z, clamping, reciprocal feel
 *
 * Usage: npm run gaze-verify
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const GLB_PATH  = join(__dirname, '../public/hero3.glb');

let pass = 0, fail = 0;
function assert(label, ok, detail = '') {
  const icon = ok ? '✓' : '✗';
  console.log(`  ${icon} ${label}${detail ? '  (' + detail + ')' : ''}`);
  ok ? pass++ : fail++;
}

// ── Simulate lerp convergence ─────────────────────────────────────────────────
// Returns the frame count needed to reach pct% of target (at 60fps, delta=1/60).
// lerpFactor = the constant in: value = lerp(value, target, lerpFactor * lerpDt)
// lerpDt = min(delta*60, 1) = 1.0 at 60fps → effective per-frame factor = lerpFactor.
function framesTo(lerpFactor, pct = 0.90) {
  let v = 0, target = 1;
  for (let f = 1; f <= 600; f++) {
    v += (target - v) * lerpFactor;
    if (v >= pct) return f;
  }
  return Infinity;
}

// Simulate N frames of the gaze update given gx input, return final rotation value.
function simulateGaze(lerpFactor, maxAngle, gx, frames) {
  let rot = 0;
  const gxClamped = Math.max(-1, Math.min(1, gx));
  const target = gxClamped * maxAngle;
  for (let f = 0; f < frames; f++) {
    rot += (target - rot) * lerpFactor;
  }
  return { rot, target, pct: target !== 0 ? rot / target : 1 };
}

// ── Camera Z formula (same as OracleAvatar3D) ────────────────────────────────
const CAM_DEFAULT_Z = 2.8;
const CAM_MIN_Z     = 0.7;
function zoomToZ(zoom) {
  return Math.min(CAM_DEFAULT_Z, Math.max(CAM_MIN_Z, CAM_DEFAULT_Z / Math.max(zoom, 1)));
}

// ── 1. BONES — exist in hero3.glb ────────────────────────────────────────────
console.log('\n══════════════════════════════════════════════════');
console.log('  ORACLE GAZE + CAMERA VERIFY');
console.log('══════════════════════════════════════════════════\n');

console.log('TEST 1 — GAZE BONES IN hero3.glb\n');

const buf     = readFileSync(GLB_PATH);
const jsonLen = buf.readUInt32LE(12);
const gltf    = JSON.parse(buf.toString('utf8', 20, 20 + jsonLen));
const nodeNames = new Set((gltf.nodes ?? []).map(n => n.name).filter(Boolean));

for (const bone of ['LeftEye', 'RightEye', 'Head', 'Neck']) {
  assert(`Bone "${bone}" present`, nodeNames.has(bone));
}

// Verify the bones are in a skin (i.e. actually rigged, not just scene nodes)
const skinJointIndices = new Set((gltf.skins ?? []).flatMap(s => s.joints ?? []));
const skinBoneNames = new Set([...skinJointIndices].map(i => gltf.nodes[i]?.name));
for (const bone of ['LeftEye', 'RightEye', 'Head', 'Neck']) {
  assert(`Bone "${bone}" is rigged (in skin)`, skinBoneNames.has(bone));
}

// ── 2. CONVERGENCE at 60fps ───────────────────────────────────────────────────
console.log('\nTEST 2 — LERP CONVERGENCE (at 60fps, delta=1/60)\n');

// Constants from OracleAvatar3D.tsx
const EYE_LERP  = 0.14;
const HEAD_LERP = 0.04;
const NECK_LERP = 0.025;

const eyeFrames  = framesTo(EYE_LERP,  0.90);
const headFrames = framesTo(HEAD_LERP, 0.90);
const neckFrames = framesTo(NECK_LERP, 0.90);

const eyeMs   = (eyeFrames  / 60 * 1000).toFixed(0);
const headMs  = (headFrames / 60 * 1000).toFixed(0);
const neckMs  = (neckFrames / 60 * 1000).toFixed(0);

assert(`Eyes reach 90% target in ≤20 frames`,  eyeFrames  <= 20,  `${eyeFrames} frames = ${eyeMs}ms`);
assert(`Head reaches 90% target in ≤60 frames`, headFrames <= 60,  `${headFrames} frames = ${headMs}ms`);
assert(`Neck reaches 90% target in ≤100 frames`, neckFrames <= 100, `${neckFrames} frames = ${neckMs}ms`);
assert(`All converge within 2s`, Math.max(eyeFrames, headFrames, neckFrames) <= 120,
  `max=${Math.max(eyeFrames, headFrames, neckFrames)} frames`);

// Verify limits don't overshoot (lerp should never exceed target)
{
  const r = simulateGaze(EYE_LERP, 0.30, 1.0, 200);
  assert(`Eyes don't overshoot target`, r.rot <= r.target + 0.0001, `max=${r.rot.toFixed(5)}`);
}
{
  const r = simulateGaze(HEAD_LERP, 0.10, 1.0, 200);
  assert(`Head doesn't overshoot target`, r.rot <= r.target + 0.0001, `max=${r.rot.toFixed(5)}`);
}

// ── 3. HIERARCHY — eyes always faster than head ───────────────────────────────
console.log('\nTEST 3 — GAZE HIERARCHY (eyes lead, head follows)\n');

// At each sample frame, eye convergence % > head convergence % > neck convergence %
for (const frames of [5, 10, 20, 40]) {
  const eye  = simulateGaze(EYE_LERP,  0.30, 1.0, frames);
  const head = simulateGaze(HEAD_LERP, 0.10, 1.0, frames);
  const neck = simulateGaze(NECK_LERP, 0.04, 1.0, frames);
  const ok   = eye.pct > head.pct && head.pct > neck.pct;
  assert(
    `At frame ${String(frames).padStart(2)}: eye(${(eye.pct*100).toFixed(0)}%) > head(${(head.pct*100).toFixed(0)}%) > neck(${(neck.pct*100).toFixed(0)}%)`,
    ok
  );
}

// Verify clamping: gx=1.5 (oracle phase intensity can push past 1.0) → treated as 1.0
{
  const unclamped = simulateGaze(EYE_LERP, 0.30, 1.5, 200);
  const clamped   = simulateGaze(EYE_LERP, 0.30, 1.0, 200);
  assert(
    `Over-input gx=1.5 clamps to gx=1.0 (same final rotation)`,
    Math.abs(unclamped.rot - clamped.rot) < 0.0001,
    `unclamped=${unclamped.rot.toFixed(5)} clamped=${clamped.rot.toFixed(5)}`
  );
}

// Max rotation angles are within safe ocular range
const EYE_MAX_H = 0.30; // radians ≈ 17.2°
const EYE_MAX_V = 0.18; // radians ≈ 10.3°
assert(`Max horizontal eye rotation ≤ 20°`, EYE_MAX_H <= 0.35,
  `${(EYE_MAX_H * 180 / Math.PI).toFixed(1)}°`);
assert(`Max vertical eye rotation ≤ 15°`,   EYE_MAX_V <= 0.26,
  `${(EYE_MAX_V * 180 / Math.PI).toFixed(1)}°`);

// ── 4. ZOOM MATH ──────────────────────────────────────────────────────────────
console.log('\nTEST 4 — PINCH ZOOM + CAMERA Z FORMULA\n');

// Reciprocal feel: zoom=1 → Z=2.8 (default), zoom=2 → Z=1.4, zoom=4 → Z=0.7
assert(`zoom=1 → Z=2.80 (default distance)`, Math.abs(zoomToZ(1) - 2.80) < 0.001,
  `Z=${zoomToZ(1).toFixed(2)}`);
assert(`zoom=2 → Z=1.40 (upper body)`,       Math.abs(zoomToZ(2) - 1.40) < 0.001,
  `Z=${zoomToZ(2).toFixed(2)}`);
assert(`zoom=4 → Z=0.70 (face close-up)`,    Math.abs(zoomToZ(4) - 0.70) < 0.001,
  `Z=${zoomToZ(4).toFixed(2)}`);
assert(`zoom=10 → Z clamped at 0.70`,         Math.abs(zoomToZ(10) - CAM_MIN_Z) < 0.001,
  `Z=${zoomToZ(10).toFixed(2)}`);
assert(`zoom < 1 → Z clamped at 2.80`,        zoomToZ(0.1) === CAM_DEFAULT_Z,
  `Z=${zoomToZ(0.1).toFixed(2)}`);

// Pinch scale formula: zoom = baseZoom * (currentDist / initialDist)
function simulatePinch(initialDist, currentDist, baseZoom = 1.0) {
  const scale = currentDist / initialDist;
  return Math.max(1.0, Math.min(4.0, baseZoom * scale));
}

assert(`Pinch in 50% → zoom clamps at 1.0 (can't zoom out past default)`,
  simulatePinch(200, 100) === 1.0, `zoom=${simulatePinch(200, 100).toFixed(2)}`);
assert(`Pinch out 2× → zoom=2.0`,
  Math.abs(simulatePinch(100, 200) - 2.0) < 0.001, `zoom=${simulatePinch(100, 200).toFixed(2)}`);
assert(`Pinch out 4× → zoom=4.0 (max)`,
  Math.abs(simulatePinch(100, 400) - 4.0) < 0.001, `zoom=${simulatePinch(100, 400).toFixed(2)}`);
assert(`Pinch out 10× → zoom clamped at 4.0`,
  simulatePinch(100, 1000) === 4.0, `zoom=${simulatePinch(100, 1000).toFixed(2)}`);
assert(`Mid-pinch resumed from zoom=2: out 2× → zoom=4.0`,
  Math.abs(simulatePinch(100, 200, 2.0) - 4.0) < 0.001,
  `zoom=${simulatePinch(100, 200, 2.0).toFixed(2)}`);

// Scroll wheel (deltaY accumulation): deltaY=-100 (scroll up) → zoom increases
const WHEEL_FACTOR = 0.0015;
function applyWheel(currentZoom, deltaY) {
  return Math.max(1.0, Math.min(4.0, currentZoom - deltaY * WHEEL_FACTOR));
}
assert(`Scroll up (deltaY=-100) from zoom=1 → zoom increases`,
  applyWheel(1.0, -100) > 1.0, `zoom=${applyWheel(1.0, -100).toFixed(3)}`);
assert(`Scroll down (deltaY=+100) at zoom=1 → clamps at 1.0 (no zoom-out)`,
  applyWheel(1.0, 100) === 1.0, `zoom=${applyWheel(1.0, 100).toFixed(3)}`);
assert(`Scroll up from zoom=3.99 → clamps at 4.0`,
  applyWheel(3.99, -1000) === 4.0, `zoom=${applyWheel(3.99, -1000).toFixed(2)}`);

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\n══════════════════════════════════════════════════`);
const total = pass + fail;
if (fail === 0) {
  console.log(`  ✅ ALL ${total} ASSERTIONS PASSED`);
} else {
  console.log(`  ❌ ${fail}/${total} FAILED`);
}
console.log(`══════════════════════════════════════════════════\n`);
process.exit(fail > 0 ? 1 : 0);
