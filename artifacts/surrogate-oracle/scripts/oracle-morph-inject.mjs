#!/usr/bin/env node
/**
 * oracle-morph-inject.mjs
 *
 * Generates all 15 OVR viseme morph targets from scratch and injects them
 * into hero3.glb using Gaussian landmark-based vertex displacement.
 *
 * No Blender, no RPM API, no external 3D tools. We build the pipeline.
 *
 * Target meshes (from GLB analysis):
 *   Wolf3D_Head  — 2163 verts  Y:1.4322→1.7431  (mouth at Y≈1.45–1.53)
 *   Wolf3D_Teeth — 98 verts    Y:1.5464→1.5829  (upper teeth)
 *
 * After running this:
 *   npm run calibrate  → auto-patches OracleAvatar3D.tsx with the mapping
 *
 * Usage: npm run inject
 */

import { readFileSync, writeFileSync, copyFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const GLB_IN    = join(__dirname, '../public/hero3.glb');
const GLB_OUT   = join(__dirname, '../public/hero3.glb');
const GLB_BAK   = join(__dirname, '../public/hero3.glb.bak');

// ── OVR Viseme names in the order we'll inject them ──────────────────────────
const OVR_NAMES = [
  'viseme_sil', 'viseme_PP',  'viseme_FF',  'viseme_TH',  'viseme_DD',
  'viseme_kk',  'viseme_CH',  'viseme_SS',  'viseme_nn',  'viseme_RR',
  'viseme_aa',  'viseme_E',   'viseme_ih',  'viseme_oh',  'viseme_ou',
  'eyeBlinkLeft', 'eyeBlinkRight',
];

// ── Landmark control points — calibrated to hero3.glb coordinate system ──────
//
// Head bounds:  X(-0.0953→+0.0953)  Y(1.4322→1.7431)  Z(-0.0556→0.1480)
// Mouth region: Y ≈ 1.45–1.53  Z > 0.08
// Eyes region:  Y ≈ 1.63–1.66  X ≈ ±0.032
//
// Each landmark: { cx, cy, cz, sigma }
// sigma = Gaussian influence radius in world units

const LM = {
  jaw:    { cx: 0,       cy: 1.452, cz: 0.090, sigma: 0.048 }, // lower jaw / chin area
  lower:  { cx: 0,       cy: 1.487, cz: 0.133, sigma: 0.020 }, // lower lip center
  upper:  { cx: 0,       cy: 1.514, cz: 0.133, sigma: 0.018 }, // upper lip center
  lc:     { cx: -0.040,  cy: 1.500, cz: 0.120, sigma: 0.018 }, // left corner
  rc:     { cx:  0.040,  cy: 1.500, cz: 0.120, sigma: 0.018 }, // right corner
  chin:   { cx: 0,       cy: 1.434, cz: 0.082, sigma: 0.032 }, // chin
  eyeL:   { cx: -0.032,  cy: 1.642, cz: 0.090, sigma: 0.025 }, // left eye
  eyeR:   { cx:  0.032,  cy: 1.642, cz: 0.090, sigma: 0.025 }, // right eye
};

// ── Viseme definitions ────────────────────────────────────────────────────────
// Each viseme: array of { landmark, dx, dy, dz }
// Displacements in world units (1 unit ≈ 1 meter for humanoid RPM avatar).
// Jaw open for 'aa' ≈ 25mm → 0.025 units.

const VISEMES = {
  viseme_sil: [], // rest pose — zero displacement

  eyeBlinkLeft: [
    { lm: 'eyeL', dx: 0, dy: -0.015, dz: 0.005 }
  ],
  eyeBlinkRight: [
    { lm: 'eyeR', dx: 0, dy: -0.015, dz: 0.005 }
  ],

  viseme_aa: [    // open vowel "ah" — maximum jaw drop
    { lm: 'jaw',   dx: 0,      dy: -0.022, dz:  0.004 },
    { lm: 'lower', dx: 0,      dy: -0.018, dz:  0.003 },
    { lm: 'chin',  dx: 0,      dy: -0.010, dz:  0.002 },
    { lm: 'upper', dx: 0,      dy:  0.004, dz:  0.000 },
    { lm: 'lc',    dx: -0.003, dy: -0.009, dz:  0.000 },
    { lm: 'rc',    dx:  0.003, dy: -0.009, dz:  0.000 },
  ],

  viseme_E: [     // front vowel "eh" — horizontal smile/spread
    { lm: 'lc',    dx: -0.018, dy:  0.004, dz: -0.004 },
    { lm: 'rc',    dx:  0.018, dy:  0.004, dz: -0.004 },
    { lm: 'upper', dx: 0,      dy:  0.005, dz: -0.002 },
    { lm: 'lower', dx: 0,      dy: -0.006, dz: -0.002 },
    { lm: 'jaw',   dx: 0,      dy: -0.006, dz:  0.000 },
  ],

  viseme_ih: [    // high front "ih" — tighter version of E
    { lm: 'lc',    dx: -0.012, dy:  0.002, dz: -0.002 },
    { lm: 'rc',    dx:  0.012, dy:  0.002, dz: -0.002 },
    { lm: 'upper', dx: 0,      dy:  0.003, dz:  0.000 },
    { lm: 'lower', dx: 0,      dy: -0.003, dz:  0.000 },
  ],

  viseme_oh: [    // rounded open "oh" — lip rounding + jaw drop
    { lm: 'lc',    dx:  0.007, dy:  0.000, dz:  0.002 }, // corners in
    { lm: 'rc',    dx: -0.007, dy:  0.000, dz:  0.002 },
    { lm: 'jaw',   dx: 0,      dy: -0.016, dz:  0.003 },
    { lm: 'lower', dx: 0,      dy: -0.012, dz:  0.004 },
    { lm: 'upper', dx: 0,      dy:  0.003, dz:  0.002 },
    { lm: 'chin',  dx: 0,      dy: -0.007, dz:  0.001 },
  ],

  viseme_ou: [    // rounded pursed "oo" — lip protrusion
    { lm: 'lc',    dx:  0.008, dy:  0.000, dz:  0.008 }, // corners in + forward
    { lm: 'rc',    dx: -0.008, dy:  0.000, dz:  0.008 },
    { lm: 'lower', dx: 0,      dy: -0.006, dz:  0.012 }, // forward protrusion
    { lm: 'upper', dx: 0,      dy:  0.004, dz:  0.010 },
    { lm: 'jaw',   dx: 0,      dy: -0.007, dz:  0.005 },
  ],

  viseme_PP: [    // bilabial closure p/b/m — lips press together
    { lm: 'lower', dx: 0,      dy:  0.012, dz:  0.000 }, // lower lip up
    { lm: 'upper', dx: 0,      dy: -0.007, dz:  0.000 }, // upper lip down
    { lm: 'lc',    dx: -0.002, dy:  0.002, dz:  0.000 },
    { lm: 'rc',    dx:  0.002, dy:  0.002, dz:  0.000 },
    { lm: 'jaw',   dx: 0,      dy:  0.003, dz:  0.000 }, // jaw barely open
  ],

  viseme_FF: [    // labiodental f/v — lower lip rises to upper teeth
    { lm: 'lower', dx: 0,      dy:  0.014, dz:  0.006 }, // lower lip up+forward
    { lm: 'jaw',   dx: 0,      dy: -0.008, dz:  0.000 },
    { lm: 'lc',    dx: -0.003, dy:  0.004, dz:  0.000 },
    { lm: 'rc',    dx:  0.003, dy:  0.004, dz:  0.000 },
  ],

  viseme_TH: [    // dental th — slight tongue protrusion effect (lip opens slightly)
    { lm: 'lower', dx: 0,      dy: -0.006, dz:  0.003 },
    { lm: 'jaw',   dx: 0,      dy: -0.009, dz:  0.001 },
    { lm: 'upper', dx: 0,      dy:  0.002, dz:  0.000 },
  ],

  viseme_DD: [    // alveolar d/t/n — moderate jaw open
    { lm: 'jaw',   dx: 0,      dy: -0.012, dz:  0.002 },
    { lm: 'lower', dx: 0,      dy: -0.008, dz:  0.001 },
    { lm: 'lc',    dx: -0.003, dy: -0.003, dz:  0.000 },
    { lm: 'rc',    dx:  0.003, dy: -0.003, dz:  0.000 },
  ],

  viseme_kk: [    // velar k/g — similar to DD
    { lm: 'jaw',   dx: 0,      dy: -0.011, dz:  0.002 },
    { lm: 'lower', dx: 0,      dy: -0.007, dz:  0.001 },
    { lm: 'chin',  dx: 0,      dy: -0.004, dz:  0.001 },
  ],

  viseme_CH: [    // palato-alveolar ch/sh — slight rounding + open
    { lm: 'lc',    dx:  0.004, dy:  0.000, dz:  0.006 },
    { lm: 'rc',    dx: -0.004, dy:  0.000, dz:  0.006 },
    { lm: 'lower', dx: 0,      dy: -0.007, dz:  0.004 },
    { lm: 'upper', dx: 0,      dy:  0.002, dz:  0.003 },
    { lm: 'jaw',   dx: 0,      dy: -0.008, dz:  0.002 },
  ],

  viseme_SS: [    // sibilant s/z — slight spread, visible teeth
    { lm: 'lc',    dx: -0.007, dy:  0.000, dz: -0.001 },
    { lm: 'rc',    dx:  0.007, dy:  0.000, dz: -0.001 },
    { lm: 'lower', dx: 0,      dy: -0.004, dz:  0.000 },
    { lm: 'jaw',   dx: 0,      dy: -0.004, dz:  0.000 },
  ],

  viseme_nn: [    // nasal n/ng — nearly closed mouth
    { lm: 'jaw',   dx: 0,      dy: -0.006, dz:  0.001 },
    { lm: 'lower', dx: 0,      dy: -0.004, dz:  0.001 },
  ],

  viseme_RR: [    // rhotic r — bunched lip rounding
    { lm: 'lc',    dx:  0.004, dy:  0.000, dz:  0.004 },
    { lm: 'rc',    dx: -0.004, dy:  0.000, dz:  0.004 },
    { lm: 'lower', dx: 0,      dy: -0.007, dz:  0.005 },
    { lm: 'upper', dx: 0,      dy:  0.002, dz:  0.004 },
    { lm: 'jaw',   dx: 0,      dy: -0.006, dz:  0.002 },
  ],
};

// ── Gaussian influence ────────────────────────────────────────────────────────

function gaussian(vx, vy, vz, cx, cy, cz, sigma) {
  const d2 = (vx-cx)**2 + (vy-cy)**2 + (vz-cz)**2;
  return Math.exp(-d2 / (2 * sigma * sigma));
}

// ── Compute displacement array for one viseme × one mesh ─────────────────────

function computeDisplacements(positions, visemeName) {
  const N    = positions.length / 3;
  const out  = new Float32Array(N * 3);
  const defs = VISEMES[visemeName];
  if (!defs || defs.length === 0) return out; // zero = rest pose

  for (let i = 0; i < N; i++) {
    const vx = positions[i*3], vy = positions[i*3+1], vz = positions[i*3+2];
    let dx = 0, dy = 0, dz = 0;

    for (const def of defs) {
      const lm = LM[def.lm];
      const w  = gaussian(vx, vy, vz, lm.cx, lm.cy, lm.cz, lm.sigma);
      if (w > 0.0005) {
        dx += w * def.dx;
        dy += w * def.dy;
        dz += w * def.dz;
      }
    }

    out[i*3] = dx; out[i*3+1] = dy; out[i*3+2] = dz;
  }
  return out;
}

// ── Compute min/max for accessor bounds ───────────────────────────────────────

function minMax3(data) {
  let mnX = Infinity, mnY = Infinity, mnZ = Infinity;
  let mxX = -Infinity, mxY = -Infinity, mxZ = -Infinity;
  for (let i = 0; i < data.length; i += 3) {
    if (data[i]   < mnX) mnX = data[i];   if (data[i]   > mxX) mxX = data[i];
    if (data[i+1] < mnY) mnY = data[i+1]; if (data[i+1] > mxY) mxY = data[i+1];
    if (data[i+2] < mnZ) mnZ = data[i+2]; if (data[i+2] > mxZ) mxZ = data[i+2];
  }
  return { min: [mnX, mnY, mnZ], max: [mxX, mxY, mxZ] };
}

// ── Read vertex positions from a GLB mesh ─────────────────────────────────────

function readPositions(gltf, buf, binStart, meshName) {
  const mesh    = gltf.meshes.find(m => m.name === meshName);
  if (!mesh) throw new Error('Mesh not found: ' + meshName);
  const prim    = mesh.primitives[0];
  const acc     = gltf.accessors[prim.attributes['POSITION']];
  const bv      = gltf.bufferViews[acc.bufferView];
  const offset  = binStart + (bv.byteOffset ?? 0) + (acc.byteOffset ?? 0);
  const count   = acc.count;
  const pos     = new Float32Array(count * 3);
  for (let i = 0; i < count * 3; i++) {
    pos[i] = buf.readFloatLE(offset + i * 4);
  }
  return pos;
}

// ── Pad buffer to 4-byte alignment ───────────────────────────────────────────
// GLTF spec: JSON chunk pads with 0x20 (SPACE), BIN chunk pads with 0x00.

function padJson(buf) {
  const rem = buf.length % 4;
  if (rem === 0) return buf;
  return Buffer.concat([buf, Buffer.alloc(4 - rem, 0x20)]); // space
}

function padBin(buf) {
  const rem = buf.length % 4;
  if (rem === 0) return buf;
  return Buffer.concat([buf, Buffer.alloc(4 - rem, 0x00)]); // zero
}

// ── Main ─────────────────────────────────────────────────────────────────────

console.log('\n╔══════════════════════════════════════════╗');
console.log('║   ORACLE MORPH INJECTOR                  ║');
console.log('╚══════════════════════════════════════════╝\n');

// ── Parse GLB ────────────────────────────────────────────────────────────────
const glbBuf   = readFileSync(GLB_IN);
const jsonLen  = glbBuf.readUInt32LE(12);
const gltf     = JSON.parse(glbBuf.toString('utf8', 20, 20 + jsonLen));

const binChunkOffset = 12 + 8 + jsonLen; // offset of BIN chunk LENGTH field
const binLen   = glbBuf.readUInt32LE(binChunkOffset);
const binStart = binChunkOffset + 8;     // skip BIN chunk header (len + type)

// Copy existing binary into a mutable Buffer
let binData = Buffer.from(glbBuf.slice(binStart, binStart + binLen));

console.log(`  GLB : ${(glbBuf.length / 1024).toFixed(0)} KB`);
console.log(`  Generator: ${gltf.asset?.generator ?? '?'}`);
console.log(`  Meshes: ${gltf.meshes.length}  Accessors: ${gltf.accessors.length}  BufferViews: ${gltf.bufferViews.length}\n`);

// Backup original
copyFileSync(GLB_IN, GLB_BAK);
console.log(`  Backup → public/hero3.glb.bak\n`);

// ── Read vertex positions for each target mesh ────────────────────────────────
const TARGETS = ['Wolf3D_Head', 'Wolf3D_Teeth'];
const meshPositions = {};
for (const name of TARGETS) {
  meshPositions[name] = readPositions(gltf, glbBuf, binStart, name);
  console.log(`  ${name}: ${meshPositions[name].length / 3} vertices read`);
}
console.log();

// ── Generate and inject morph targets ────────────────────────────────────────
// For each target mesh, we inject all 15 OVR viseme displacement arrays.

for (const meshName of TARGETS) {
  const positions = meshPositions[meshName];
  const mesh      = gltf.meshes.find(m => m.name === meshName);
  const prim      = mesh.primitives[0];

  const targetEntries = []; // [{POSITION: accessorIdx}, ...]

  process.stdout.write(`  Generating visemes for ${meshName}: `);

  for (const visemeName of OVR_NAMES) {
    // Compute displacement
    const disp    = computeDisplacements(positions, visemeName);
    const { min, max } = minMax3(disp);

    // Convert to Buffer
    const dispBuf = Buffer.allocUnsafe(disp.length * 4);
    for (let i = 0; i < disp.length; i++) dispBuf.writeFloatLE(disp[i], i * 4);
    const dispPadded = padBin(dispBuf);

    // Append to binData
    const byteOffset = binData.length;
    binData = Buffer.concat([binData, dispPadded]);

    // Add BufferView
    const bvIdx = gltf.bufferViews.length;
    gltf.bufferViews.push({
      buffer:     0,
      byteOffset: byteOffset,
      byteLength: dispBuf.length,
    });

    // Add Accessor
    const accIdx = gltf.accessors.length;
    gltf.accessors.push({
      bufferView:    bvIdx,
      byteOffset:    0,
      componentType: 5126, // FLOAT
      type:          'VEC3',
      count:         positions.length / 3,
      min,
      max,
    });

    targetEntries.push({ POSITION: accIdx });
    process.stdout.write('.');
  }
  process.stdout.write(' done\n');

  // Attach morph targets to primitive
  prim.targets = targetEntries;

  // Store names in mesh extras (Three.js reads from here)
  mesh.extras = { ...(mesh.extras ?? {}), targetNames: OVR_NAMES };
}

// ── Update buffer total byteLength ────────────────────────────────────────────
gltf.buffers[0].byteLength = binData.length;

// ── Repack GLB ────────────────────────────────────────────────────────────────
const jsonStr    = JSON.stringify(gltf);
const jsonBuf    = padJson(Buffer.from(jsonStr, 'utf8'));
const newBinPad  = padBin(binData);

// GLB header
const header = Buffer.allocUnsafe(12);
header.writeUInt32LE(0x46546C67, 0); // magic "glTF"
header.writeUInt32LE(2, 4);          // version
header.writeUInt32LE(
  12 + 8 + jsonBuf.length + 8 + newBinPad.length, 8 // total length
);

// JSON chunk header
const jsonChunkHeader = Buffer.allocUnsafe(8);
jsonChunkHeader.writeUInt32LE(jsonBuf.length, 0);
jsonChunkHeader.writeUInt32LE(0x4E4F534A, 4); // "JSON"

// BIN chunk header
const binChunkHeader = Buffer.allocUnsafe(8);
binChunkHeader.writeUInt32LE(newBinPad.length, 0);
binChunkHeader.writeUInt32LE(0x004E4942, 4);  // "BIN\0"

const outBuf = Buffer.concat([
  header, jsonChunkHeader, jsonBuf,
  binChunkHeader, newBinPad,
]);

writeFileSync(GLB_OUT, outBuf);

console.log(`\n  ✅ Written: public/hero3.glb`);
console.log(`     Original : ${(glbBuf.length  / 1024).toFixed(0)} KB`);
console.log(`     With morphs: ${(outBuf.length / 1024).toFixed(0)} KB`);
console.log(`     Added: ${OVR_NAMES.length} OVR visemes × ${TARGETS.length} meshes`);
console.log('\n  Next: npm run calibrate → patches OracleAvatar3D.tsx automatically\n');
