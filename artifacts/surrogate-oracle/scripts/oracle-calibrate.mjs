#!/usr/bin/env node
/**
 * oracle-calibrate.mjs
 *
 * Reads hero3.glb directly (no browser needed), extracts morph target names
 * from the GLTF JSON chunk, detects the naming convention (OVR / VRM / ARKit
 * / custom), generates ORACLE_TO_OVR, and patches OracleAvatar3D.tsx.
 *
 * GLB format: 12-byte header | JSON chunk | BIN chunk
 * Morph names live in the JSON chunk under:
 *   meshes[i].extras.targetNames   (Three.js / Blender export)
 *   meshes[i].primitives[j].extras.targetNames
 *
 * Usage: npm run calibrate
 */

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname  = dirname(fileURLToPath(import.meta.url));
const GLB_PATH   = join(__dirname, '../public/hero3.glb');
const AVATAR_SRC = join(__dirname, '../src/components/OracleAvatar3D.tsx');

// ── GLB → GLTF JSON ──────────────────────────────────────────────────────────

function parseGlbJson(glbPath) {
  const buf = readFileSync(glbPath);

  // Validate magic bytes: 0x46546C67 = "glTF"
  const magic = buf.readUInt32LE(0);
  if (magic !== 0x46546C67) throw new Error('Not a valid GLB file (bad magic bytes)');

  const version = buf.readUInt32LE(4);
  if (version !== 2) throw new Error(`Unsupported GLB version: ${version} (expected 2)`);

  // First chunk starts at byte 12
  const jsonChunkLen  = buf.readUInt32LE(12);
  const jsonChunkType = buf.readUInt32LE(16); // 0x4E4F534A = "JSON"
  if (jsonChunkType !== 0x4E4F534A) throw new Error('First GLB chunk is not JSON');

  const jsonStr = buf.toString('utf8', 20, 20 + jsonChunkLen);
  return JSON.parse(jsonStr);
}

// ── Extract morph target names from GLTF ─────────────────────────────────────
// Returns [{ meshName, names }]

function extractMorphTargets(gltf) {
  const results = [];
  const meshes  = gltf.meshes ?? [];

  for (const mesh of meshes) {
    const meshName = mesh.name ?? '(unnamed)';
    let names = [];

    // Path 1: mesh-level extras.targetNames (Blender, Three.js exporters)
    if (Array.isArray(mesh.extras?.targetNames)) {
      names = mesh.extras.targetNames;
    }

    // Path 2: primitive-level extras.targetNames (some exporters put it here)
    if (!names.length) {
      for (const prim of mesh.primitives ?? []) {
        if (Array.isArray(prim.extras?.targetNames)) {
          names = prim.extras.targetNames;
          break;
        }
      }
    }

    // Path 3: count targets from primitive attributes and use generic indices
    // (happens when no names are exported — fall back to numeric keys)
    if (!names.length) {
      const prim = mesh.primitives?.[0];
      if (prim?.targets?.length) {
        names = prim.targets.map((_, i) => `target_${i}`);
      }
    }

    if (names.length) {
      results.push({ meshName, names });
    }
  }

  return results;
}

// ── Convention detection ──────────────────────────────────────────────────────

function detectConvention(names) {
  const s = new Set(names);
  if (s.has('viseme_aa') || s.has('viseme_PP') || s.has('viseme_sil'))  return 'ovr';
  if (names.some(n => n.startsWith('Fcl_MTH_')))                         return 'vrm';
  if (s.has('jawOpen') || s.has('mouthSmileLeft'))                       return 'arkit';
  // Partial OVR — some tools export without the sil/PP shapes
  if (names.some(n => n.startsWith('viseme_')))                          return 'ovr';
  return 'custom';
}

// ── Mapping tables per convention ─────────────────────────────────────────────

const MAPS = {
  ovr: {
    X: ['viseme_sil'],
    A: ['viseme_aa'],
    E: ['viseme_E'],
    I: ['viseme_ih'],
    O: ['viseme_oh'],
    U: ['viseme_ou'],
    B: ['viseme_PP'],
    C: ['viseme_sil'],
    D: ['viseme_DD'],
    F: ['viseme_FF'],
    G: ['viseme_kk'],
    H: ['viseme_ou', 'viseme_oh'],
  },
  vrm: {
    X: ['Fcl_MTH_Neutral'],
    A: ['Fcl_MTH_A'],
    E: ['Fcl_MTH_E'],
    I: ['Fcl_MTH_I'],
    O: ['Fcl_MTH_O'],
    U: ['Fcl_MTH_U'],
    B: ['Fcl_MTH_Fun'],
    C: ['Fcl_MTH_Neutral'],
    D: ['Fcl_MTH_A'],
    F: ['Fcl_MTH_Fun'],
    G: ['Fcl_MTH_U'],
    H: ['Fcl_MTH_O'],
  },
  arkit: {
    X: ['mouthClose'],
    A: ['jawOpen'],
    E: ['mouthSmileLeft', 'mouthSmileRight'],
    I: ['mouthStretchLeft', 'mouthStretchRight'],
    O: ['mouthFunnel'],
    U: ['mouthPucker'],
    B: ['mouthPressLeft', 'mouthPressRight'],
    C: ['jawOpen'],
    D: ['jawOpen'],
    F: ['mouthLowerDownLeft', 'mouthLowerDownRight'],
    G: ['mouthFunnel'],
    H: ['mouthFunnel', 'mouthPucker'],
  },
};

// ── Fuzzy fallback ────────────────────────────────────────────────────────────

const FUZZY = {
  X: ['sil', 'silence', 'rest', 'neutral', 'close', 'shut'],
  A: ['_a', '_A', 'mouth_a', 'open', 'mouthA', 'Mouth_A'],
  E: ['_e', '_E', 'smile', 'mouth_e', 'Mouth_E'],
  I: ['_i', '_I', 'mouth_i', 'Mouth_I'],
  O: ['_o', '_O', 'mouth_o', 'Mouth_O'],
  U: ['_u', '_U', 'funnel', 'pucker', 'Mouth_U'],
  B: ['pp', 'PP', 'press', 'close', 'shut', 'Mouth_PP'],
  C: ['neutral', 'sil', 'rest', 'default'],
  D: ['dd', 'DD', 'Mouth_D', 'mouth_d'],
  F: ['ff', 'FF', 'Mouth_F', 'mouth_f'],
  G: ['kk', 'KK', 'Mouth_K', 'mouth_k'],
  H: ['ou', 'OU', 'funnel', 'rounded', 'Mouth_U'],
};

function buildFuzzyMapping(names) {
  const result = {};
  for (const [vis, hints] of Object.entries(FUZZY)) {
    const matched = names.filter(n =>
      hints.some(h => n.toLowerCase().includes(h.toLowerCase()))
    );
    result[vis] = matched.length ? matched.slice(0, 2) : [''];
  }
  return result;
}

// ── Filter candidates to names present in GLB ─────────────────────────────────

function filterPresent(mapping, nameSet) {
  const out = {};
  for (const [k, arr] of Object.entries(mapping)) {
    const present = arr.filter(n => n && nameSet.has(n));
    out[k] = present.length ? present : arr;
  }
  return out;
}

// ── Generate TS source block ──────────────────────────────────────────────────

function generateTs(mapping, convention) {
  const LABELS = {
    X: 'silence',  A: '"ah"',   E: '"eh"',   I: '"ih"',
    O: '"oh"',     U: '"oo"',   B: 'p/b/m',  C: 'neutral',
    D: 'd/t/n',    F: 'f/v',   G: 'k/g',    H: 'rounded',
  };
  const lines = Object.entries(mapping).map(([k, arr]) => {
    const vals    = arr.map(s => `'${s}'`).join(', ');
    const comment = `// ${LABELS[k]}`;
    return `  ${k}: [${vals}], ${comment}`;
  });
  return [
    `// Oracle worklet viseme → morph-target name(s) — AUTO-CALIBRATED (${convention}).`,
    '// Re-run: npm run calibrate after changing hero3.glb.',
    '// Arrays = co-articulation blend (multiple shapes activated together).',
    'const ORACLE_TO_OVR: Record<string, OVRName[]> = {',
    ...lines,
    '};',
  ].join('\n');
}

// ── Patch file ────────────────────────────────────────────────────────────────

function patchFile(newBlock) {
  const src = readFileSync(AVATAR_SRC, 'utf8');
  const re  = /\/\/ Oracle worklet viseme[\s\S]*?const ORACLE_TO_OVR: Record<string, \w+\[\]> = \{[\s\S]*?\};/;
  if (!re.test(src)) {
    console.error('\n❌  Cannot locate ORACLE_TO_OVR block in OracleAvatar3D.tsx — patch aborted.');
    return false;
  }
  writeFileSync(AVATAR_SRC, src.replace(re, newBlock), 'utf8');
  return true;
}

// ── Main ─────────────────────────────────────────────────────────────────────

console.log('\n╔══════════════════════════════════════════╗');
console.log('║   ORACLE MORPH CALIBRATOR                ║');
console.log('╚══════════════════════════════════════════╝\n');

// Parse GLB
let gltf;
try {
  gltf = parseGlbJson(GLB_PATH);
  console.log(`  ✓ Parsed ${GLB_PATH.split('/').pop()}`);
  console.log(`    GLTF version : ${gltf.asset?.version ?? '?'}`);
  console.log(`    Generator    : ${gltf.asset?.generator ?? '?'}`);
  console.log(`    Meshes       : ${(gltf.meshes ?? []).length}`);
} catch (err) {
  console.error(`\n❌  Failed to parse GLB: ${err.message}\n`);
  process.exit(1);
}

// Extract morph targets
const meshTargets = extractMorphTargets(gltf);

if (meshTargets.length === 0) {
  // Check if it looks like an RPM avatar (Wolf3D mesh names)
  const isRPM = (gltf.meshes ?? []).some(m => m.name?.startsWith('Wolf3D'));

  console.log('\n⚠️   No morph targets in hero3.glb.\n');

  if (isRPM) {
    console.log('  This is a Ready Player Me avatar (Wolf3D meshes detected).');
    console.log('  RPM avatars ship without OVR visemes by default.');
    console.log('  To get full OVR lip sync, re-download the GLB with:\n');

    // Try to find the avatar ID from any RPM-related metadata in the GLTF
    const extras = gltf.asset?.extras;
    const rpmUrl = extras?.url ?? extras?.avatarUrl ?? null;
    if (rpmUrl) {
      const withVisemes = rpmUrl.includes('?')
        ? rpmUrl + '&morphTargets=Oculus+Visemes'
        : rpmUrl + '?morphTargets=Oculus+Visemes';
      console.log(`  ${withVisemes}\n`);
    } else {
      console.log('  https://models.readyplayer.me/<YOUR_AVATAR_ID>.glb?morphTargets=Oculus+Visemes\n');
      console.log('  Find your avatar ID in the Ready Player Me Studio or');
      console.log('  check the network tab when the avatar was originally loaded.\n');
    }

    console.log('  Quick fix steps:');
    console.log('  1. Get the RPM avatar URL with ?morphTargets=Oculus+Visemes appended');
    console.log('  2. Download the new GLB:');
    console.log('     curl -o public/hero3.glb "https://models.readyplayer.me/<ID>.glb?morphTargets=Oculus+Visemes"');
    console.log('  3. Run: npm run calibrate');
    console.log('  4. Vite HMR picks up the change — full lip sync active.\n');
    console.log('  In the meantime, OracleAvatar3D falls back to Head bone rotation');
    console.log('  as a visible speaking indicator. It works — just less expressive.\n');
  } else {
    console.log('  The GLB has no blend shapes / shape keys exported.');
    console.log('  • Blender: enable "Shape Keys" in GLTF export settings');
    console.log('  • Other tools: check morph target / blend shape export options\n');
  }
  process.exit(0); // Exit 0 — not a hard error, fallback is in place
}

console.log(`\n  Found ${meshTargets.length} mesh(es) with morph targets:\n`);
const allNames = [];
for (const { meshName, names } of meshTargets) {
  console.log(`  Mesh "${meshName}": ${names.length} target(s)`);
  console.log(`    ${names.join('  ')}\n`);
  allNames.push(...names);
}

const uniqueNames = [...new Set(allNames)];
const nameSet     = new Set(uniqueNames);

// Detect convention
const convention = detectConvention(uniqueNames);
console.log(`  Naming convention: ${convention.toUpperCase()}`);

// Build mapping
let rawMap;
if (convention === 'custom') {
  console.log('  Using fuzzy pattern matching for unknown convention...');
  rawMap = buildFuzzyMapping(uniqueNames);
} else {
  rawMap = MAPS[convention];
}
const mapping = filterPresent(rawMap, nameSet);

// Report
const LABELS = {
  X: 'silence', A: '"ah"', E: '"eh"', I: '"ih"', O: '"oh"', U: '"oo"',
  B: 'p/b/m', C: 'neutral', D: 'd/t/n', F: 'f/v', G: 'k/g', H: 'rounded',
};
let hits = 0;
console.log('\n  Viseme mapping:\n');
for (const [vis, arr] of Object.entries(mapping)) {
  const found = arr.filter(n => n && nameSet.has(n));
  const icon  = found.length === arr.length ? '✓' : found.length ? '⚠' : '✗';
  const miss  = arr.filter(n => n && !nameSet.has(n));
  const note  = miss.length ? `  ← "${miss.join('", "')}" not in GLB` : '';
  if (found.length) hits++;
  console.log(`    ${icon} ${vis} (${LABELS[vis]})  →  [${arr.join(', ')}]${note}`);
}

const pct = Math.round((hits / Object.keys(mapping).length) * 100);
console.log(`\n  Coverage: ${hits}/12 visemes (${pct}%)`);
if      (pct === 100) console.log('  🟢 Full coverage');
else if (pct >= 70)   console.log('  🟡 Partial — unmapped visemes decay to silence gracefully');
else {
  console.log('  🔴 Low coverage. For OVR blendshapes in Ready Player Me:');
  console.log('     https://docs.readyplayer.me/ready-player-me/api-reference/avatar/morph-targets/oculus-ovr-libsync');
}

// Patch
const newBlock = generateTs(mapping, convention);
console.log('\n  Patching OracleAvatar3D.tsx...');
if (patchFile(newBlock)) {
  console.log('  ✅ Done. Vite HMR will reload the avatar automatically.\n');
}
