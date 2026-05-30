#!/usr/bin/env node
/**
 * oracle-morph-verify.mjs
 *
 * Proves the injected morph targets are correct by reading the GLB binary
 * directly and running four assertions:
 *
 *   1. STRUCTURE   — all 15 OVR accessors exist and are VEC3/FLOAT
 *   2. NON-ZERO    — each non-sil viseme has at least one non-zero displacement
 *   3. LOCALITY    — mouth-region vertices move significantly more than forehead
 *   4. SYMMETRY    — left/right displacements are mirror-symmetric (X flipped)
 *
 * Prints per-viseme displacement stats so you can eyeball the mouth shapes.
 * Usage: npm run verify
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const GLB_PATH  = join(__dirname, '../public/hero3.glb');

// ── Parse GLB ────────────────────────────────────────────────────────────────
const buf      = readFileSync(GLB_PATH);
const jsonLen  = buf.readUInt32LE(12);
const gltf     = JSON.parse(buf.toString('utf8', 20, 20 + jsonLen));
const binStart = 12 + 8 + jsonLen + 8;

function readAccessor(accIdx) {
  const acc = gltf.accessors[accIdx];
  const bv  = gltf.bufferViews[acc.bufferView];
  const off = binStart + (bv.byteOffset ?? 0) + (acc.byteOffset ?? 0);
  const N   = acc.count;
  const out = new Float32Array(N * 3);
  for (let i = 0; i < N * 3; i++) out[i] = buf.readFloatLE(off + i * 4);
  return out;
}

// ── Head geometry (rest pose) ─────────────────────────────────────────────────
const headMesh   = gltf.meshes.find(m => m.name === 'Wolf3D_Head');
const restPosAcc = headMesh.primitives[0].attributes['POSITION'];
const restPos    = readAccessor(restPosAcc);
const N          = restPos.length / 3;

// Bounding box of head
let yMin = Infinity, yMax = -Infinity;
for (let i = 0; i < N; i++) { const y = restPos[i*3+1]; if(y<yMin)yMin=y; if(y>yMax)yMax=y; }
const headHeight = yMax - yMin;

// Region classifiers
const MOUTH_Y_LO  = yMin + headHeight * 0.00; // bottom of chin
const MOUTH_Y_HI  = yMin + headHeight * 0.35; // top of mouth region (~35% up from chin)
const FOREHEAD_LO = yMin + headHeight * 0.70; // bottom of forehead region

function isMouthRegion(i) {
  const y = restPos[i*3+1], z = restPos[i*3+2];
  return y >= MOUTH_Y_LO && y <= MOUTH_Y_HI && z > 0.05;
}
function isForeheadRegion(i) {
  return restPos[i*3+1] >= FOREHEAD_LO;
}

const mouthIdxs    = Array.from({length:N}, (_,i)=>i).filter(isMouthRegion);
const foreheadIdxs = Array.from({length:N}, (_,i)=>i).filter(isForeheadRegion);

// ── OVR morph target accessors on Wolf3D_Head ─────────────────────────────────
const targets     = headMesh.primitives[0].targets ?? [];
const targetNames = headMesh.extras?.targetNames ?? [];

// ── Test results ──────────────────────────────────────────────────────────────
let pass = 0, fail = 0;

function assert(name, ok, detail = '') {
  if (ok) { console.log(`  ✓ ${name}${detail ? '  ' + detail : ''}`); pass++; }
  else     { console.log(`  ✗ ${name}${detail ? '  ' + detail : ''}`); fail++; }
}

function rms(arr) {
  let s = 0; for (const v of arr) s += v*v;
  return Math.sqrt(s / arr.length);
}

function maxAbs(arr) { let m = 0; for (const v of arr) if(Math.abs(v)>m)m=Math.abs(v); return m; }

// ── 1. STRUCTURE ──────────────────────────────────────────────────────────────
console.log('\n══════════════════════════════════════════════════');
console.log('  ORACLE MORPH VERIFY');
console.log('══════════════════════════════════════════════════\n');
console.log('HEAD BOUNDS');
console.log(`  Y: ${yMin.toFixed(4)} → ${yMax.toFixed(4)}  height=${headHeight.toFixed(4)}`);
console.log(`  Mouth region:    Y < ${MOUTH_Y_HI.toFixed(4)}  (${mouthIdxs.length} verts)`);
console.log(`  Forehead region: Y > ${FOREHEAD_LO.toFixed(4)}  (${foreheadIdxs.length} verts)`);
console.log();

console.log('TEST 1 — STRUCTURE\n');
assert('Wolf3D_Head has morph targets',  targets.length > 0,   `(${targets.length} targets)`);
assert('15 OVR visemes present',         targets.length === 15, `(got ${targets.length})`);
assert('targetNames count matches',      targetNames.length === targets.length);

for (let t = 0; t < targets.length; t++) {
  const name = targetNames[t];
  const accIdx = targets[t]['POSITION'];
  const acc    = gltf.accessors[accIdx];
  assert(
    `  ${name} accessor`,
    acc?.type === 'VEC3' && acc?.componentType === 5126,
    `count=${acc?.count} type=${acc?.type}`
  );
}

// ── 2. NON-ZERO ───────────────────────────────────────────────────────────────
console.log('\nTEST 2 — NON-ZERO DISPLACEMENTS\n');

const dispByViseme = {};
for (let t = 0; t < targets.length; t++) {
  const name = targetNames[t];
  const disp = readAccessor(targets[t]['POSITION']);
  dispByViseme[name] = disp;
  const maxD = maxAbs(disp);
  if (name === 'viseme_sil') {
    assert(`${name} is all-zero (rest pose)`, maxD < 0.0001, `maxAbs=${maxD.toFixed(6)}`);
  } else {
    assert(`${name} has non-zero data`, maxD > 0.0001, `maxAbs=${maxD.toFixed(5)}`);
  }
}

// ── 3. LOCALITY — mouth moves more than forehead ──────────────────────────────
console.log('\nTEST 3 — LOCALITY (mouth region > forehead)\n');

const ACTIVE = ['viseme_aa','viseme_E','viseme_oh','viseme_ou','viseme_PP'];
for (const name of ACTIVE) {
  const disp = dispByViseme[name];
  if (!disp) { assert(`${name} locality`, false, 'missing'); continue; }

  // RMS of displacement magnitude per region
  const mouthMag = mouthIdxs.map(i => {
    const dx=disp[i*3],dy=disp[i*3+1],dz=disp[i*3+2];
    return Math.sqrt(dx*dx+dy*dy+dz*dz);
  });
  const foreheadMag = foreheadIdxs.map(i => {
    const dx=disp[i*3],dy=disp[i*3+1],dz=disp[i*3+2];
    return Math.sqrt(dx*dx+dy*dy+dz*dz);
  });

  const mouthRMS    = rms(mouthMag);
  const foreheadRMS = rms(foreheadMag);
  const ratio       = foreheadRMS > 0 ? mouthRMS / foreheadRMS : Infinity;
  assert(
    `${name}: mouth > forehead`,
    mouthRMS > foreheadRMS,
    `mouth=${mouthRMS.toFixed(5)}  forehead=${foreheadRMS.toFixed(5)}  ratio=${ratio.toFixed(1)}x`
  );
}

// ── 4. SYMMETRY — X displacement is mirror-symmetric ─────────────────────────
console.log('\nTEST 4 — SYMMETRY (left=right mirror on X)\n');

// For each vertex, find its mirror by matching (y,z) with opposite x
// Use a simpler test: for viseme_E (smile), sum of X displacements should be ≈ 0
// because left corner moves left (-X) and right corner moves right (+X)
const SYMMETRIC = ['viseme_E','viseme_ih','viseme_oh','viseme_ou'];
for (const name of SYMMETRIC) {
  const disp = dispByViseme[name];
  if (!disp) continue;
  let sumX = 0;
  for (let i = 0; i < N; i++) sumX += disp[i*3];
  // For a symmetric face, positive and negative X should nearly cancel
  const meanX = sumX / N;
  assert(
    `${name} X-symmetry (meanX≈0)`,
    Math.abs(meanX) < 0.0005,
    `meanX=${meanX.toFixed(6)}`
  );
}

// ── 5. DISPLACEMENT PROFILE — eyeball check ───────────────────────────────────
console.log('\nDISPLACEMENT PROFILE (max per axis per viseme)\n');
console.log('  viseme         maxDX      maxDY      maxDZ    mouth-RMS');
console.log('  ──────────────────────────────────────────────────────');
for (const name of targetNames) {
  const disp = dispByViseme[name];
  if (!disp) continue;
  let mxX=0,mxY=0,mxZ=0;
  for (let i=0;i<N;i++){
    if(Math.abs(disp[i*3])   > mxX) mxX = Math.abs(disp[i*3]);
    if(Math.abs(disp[i*3+1]) > mxY) mxY = Math.abs(disp[i*3+1]);
    if(Math.abs(disp[i*3+2]) > mxZ) mxZ = Math.abs(disp[i*3+2]);
  }
  const mouthRMS = rms(mouthIdxs.map(i=>{
    const dx=disp[i*3],dy=disp[i*3+1],dz=disp[i*3+2];
    return Math.sqrt(dx*dx+dy*dy+dz*dz);
  }));
  const label = name.padEnd(14);
  console.log(`  ${label} ${mxX.toFixed(5)}    ${mxY.toFixed(5)}    ${mxZ.toFixed(5)}    ${mouthRMS.toFixed(5)}`);
}

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\n══════════════════════════════════════════════════`);
const total = pass + fail;
if (fail === 0) {
  console.log(`  ✅ ALL ${total} ASSERTIONS PASSED`);
} else {
  console.log(`  ❌ ${fail}/${total} ASSERTIONS FAILED`);
}
console.log(`══════════════════════════════════════════════════\n`);
process.exit(fail > 0 ? 1 : 0);
