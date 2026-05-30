/**
 * OracleAvatar3D.tsx
 *
 * Three.js GLB avatar renderer following the OVR/Oculus viseme standard.
 *
 * Viseme pipeline:
 *   AudioWorklet → VisemeState ref → useFrame → OVR morph targets
 *
 * Design principles:
 * - SkinnedMesh is cached on mount — zero scene traversal per frame
 * - OVR morph target indices resolved once at load from morphTargetDictionary
 * - Co-articulation: openness/rounded/spread drive secondary morphs for
 *   natural blending, not just a single active shape at a time
 * - visemeStateRef pattern — no React re-renders at 60fps
 */
import React, { useRef, useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { VisemeState } from '../lib/visemeDetector';

// ── OVR Viseme Standard (Oculus / Ready Player Me) ───────────────────────────
// 15 phoneme visemes + silence. Stored as morph targets in RPM-compatible GLBs.
// Oracle worklet produces internal labels (A–H, X); we map them to OVR keys.

const OVR_NAMES = [
  'viseme_sil',  // silence / rest
  'viseme_PP',   // p, b, m  (bilabial)
  'viseme_FF',   // f, v      (labiodental)
  'viseme_TH',   // θ, ð      (dental)
  'viseme_DD',   // d, t, n   (alveolar)
  'viseme_kk',   // k, g      (velar)
  'viseme_CH',   // tʃ, dʒ, ʃ (palato-alveolar)
  'viseme_SS',   // s, z      (sibilant)
  'viseme_nn',   // n, ŋ      (nasal)
  'viseme_RR',   // r         (rhotic)
  'viseme_aa',   // "ah" as in father
  'viseme_E',    // "eh" as in bed
  'viseme_ih',   // "ih" as in bit
  'viseme_oh',   // "oh" as in go
  'viseme_ou',   // "oo" as in too
] as const;

type OVRName = typeof OVR_NAMES[number];

// Oracle worklet viseme → morph-target name(s) — AUTO-CALIBRATED (ovr).
// Re-run: npm run calibrate after changing hero3.glb.
// Arrays = co-articulation blend (multiple shapes activated together).
const ORACLE_TO_OVR: Record<string, OVRName[]> = {
  X: ['viseme_sil'], // silence
  A: ['viseme_aa'], // "ah"
  E: ['viseme_E'], // "eh"
  I: ['viseme_ih'], // "ih"
  O: ['viseme_oh'], // "oh"
  U: ['viseme_ou'], // "oo"
  B: ['viseme_PP'], // p/b/m
  C: ['viseme_sil'], // neutral
  D: ['viseme_DD'], // d/t/n
  F: ['viseme_FF'], // f/v
  G: ['viseme_kk'], // k/g
  H: ['viseme_ou', 'viseme_oh'], // rounded
};

// Secondary viseme contributions driven by the VisemeState shape parameters.
// These simulate co-articulation — lips never move to just one extreme shape.
const CO_ARTIC: Array<{ viseme: OVRName; dimension: 'openness' | 'rounded' | 'spread'; scale: number }> = [
  { viseme: 'viseme_aa', dimension: 'openness', scale: 0.6 },   // jaw open → aa shape
  { viseme: 'viseme_ou', dimension: 'rounded',  scale: 0.5 },   // lip rounding → ou
  { viseme: 'viseme_E',  dimension: 'spread',   scale: 0.4 },   // lip spread → E
];

// ── Morph target index resolution ────────────────────────────────────────────
// Tries OVR prefixed names → unprefixed OVR names → ARKit equivalents → index

const ARKIT_FALLBACK: Partial<Record<OVRName, string[]>> = {
  viseme_sil: ['mouthClose', 'Mouth_Closed'],
  viseme_PP:  ['mouthPressLeft', 'mouthPressRight', 'Mouth_PP'],
  viseme_FF:  ['Mouth_F'],
  viseme_DD:  ['Mouth_D', 'jawOpen'],
  viseme_kk:  ['Mouth_K'],
  viseme_aa:  ['jawOpen', 'Mouth_A', 'mouthOpen'],
  viseme_E:   ['mouthSmileLeft', 'mouthSmileRight', 'Mouth_E'],
  viseme_ih:  ['Mouth_I'],
  viseme_oh:  ['Mouth_O'],
  viseme_ou:  ['mouthFunnel', 'Mouth_U'],
};

function buildIndexMap(dict: Record<string, number>): Map<OVRName, number> {
  const map = new Map<OVRName, number>();
  for (const ovr of OVR_NAMES) {
    // 1. OVR prefixed
    if (dict[ovr] !== undefined) { map.set(ovr, dict[ovr]); continue; }
    // 2. Unprefixed (e.g. "aa", "E", "ih")
    const bare = ovr.replace('viseme_', '');
    if (dict[bare] !== undefined) { map.set(ovr, dict[bare]); continue; }
    // 3. ARKit equivalents
    const arkit = ARKIT_FALLBACK[ovr];
    if (arkit) {
      for (const name of arkit) {
        if (dict[name] !== undefined) { map.set(ovr, dict[name]); break; }
      }
    }
    // 4. Index fallback handled at apply-time (skip if no entry)
  }
  return map;
}

// ── Component ─────────────────────────────────────────────────────────────────

export interface CameraState {
  x:    number; // normalized −1 … +1  (parallax look-around)
  y:    number; // normalized −1 … +1
  zoom: number; // 1 = default distance, 4 = maximum close-up
}

export interface OracleAvatar3DProps {
  visemeStateRef:  React.RefObject<VisemeState>;
  cameraStateRef?: React.RefObject<CameraState>;
}

// Camera orbit bounds
// The avatar group is offset -1.59 on Y so the Wolf3D face sits at world Y≈0.
// All camera constants are in face-centered space (0 = face center).
const CAM_DEFAULT_Z = 1.8;  // portrait distance — head + upper chest visible
const CAM_MIN_Z     = 0.4;  // maximum zoom-in (eyes fill the frame)
const CAM_X_RANGE   = 0.30; // horizontal look-around extent (world units)
const CAM_Y_CENTER  = 0.0;  // face center (group is offset so face is at Y=0)
const CAM_Y_RANGE   = 0.22; // vertical look-around extent
const CAM_LERP      = 0.05; // cinematic smooth-follow

// Fallback group offset if the head bone can't be located. The real offset is
// computed per-model from the actual Head bone (see meshData.avatarYOffset) so a
// swapped GLB (hero3.glb was replaced; .bak is the prior model) frames the FACE,
// not the legs — the old hardcoded -1.59 was calibrated for the previous avatar.
const AVATAR_Y_OFFSET = -1.59;

export function OracleAvatar3D({ visemeStateRef, cameraStateRef }: OracleAvatar3DProps) {
  const { scene }  = useGLTF('/hero3.glb');
  const { camera } = useThree();
  const groupRef   = useRef<THREE.Group>(null);
  // Smooth camera target — avoids snapping on sudden gesture changes
  const camTarget = useRef(new THREE.Vector3(0, CAM_Y_CENTER, CAM_DEFAULT_Z));

  // Cache skinned meshes + gaze bones — found once on mount, zero traversal per frame.
  const meshData = useMemo(() => {
    const result: Array<{
      mesh:     THREE.SkinnedMesh;
      indexMap: Map<OVRName, number>;
    }> = [];
    let headBone:     THREE.Object3D | null = null as THREE.Object3D | null;
    let neckBone:     THREE.Object3D | null = null as THREE.Object3D | null;
    let leftEyeBone:  THREE.Object3D | null = null as THREE.Object3D | null;
    let rightEyeBone: THREE.Object3D | null = null as THREE.Object3D | null;

    scene.traverse((child) => {
      if (child.name === 'Head'     && !headBone)     headBone     = child;
      if (child.name === 'Neck'     && !neckBone)     neckBone     = child;
      if (child.name === 'LeftEye'  && !leftEyeBone)  leftEyeBone  = child;
      if (child.name === 'RightEye' && !rightEyeBone) rightEyeBone = child;

      const sm = child as THREE.SkinnedMesh;
      if (!sm.isSkinnedMesh || !sm.morphTargetDictionary || !sm.morphTargetInfluences) return;
      const indexMap = buildIndexMap(sm.morphTargetDictionary);
      result.push({ mesh: sm, indexMap });
    });

    const hasMorphs = result.length > 0;

    // ── Frame the FACE, not the legs — compute the group offset from the model ──
    // The camera looks at world Y=0, so we shift the group down by the head bone's
    // natural Y. Computed from THIS GLB rather than a hardcoded constant, so a
    // swapped/rescaled model still lands head-and-shoulders in the cabinet.
    let avatarYOffset = AVATAR_Y_OFFSET;
    if (headBone) {
      scene.updateMatrixWorld(true);
      const headWorld = new THREE.Vector3();
      (headBone as THREE.Object3D).getWorldPosition(headWorld);
      // Drop the offset slightly below the head center so eyes/face sit at frame center.
      if (Number.isFinite(headWorld.y) && headWorld.y > 0.01) avatarYOffset = -(headWorld.y - 0.05);
      if (import.meta.env.DEV) console.log('[OracleAvatar3D] head Y =', headWorld.y, '→ avatarYOffset =', avatarYOffset);
    }

    if (import.meta.env.DEV) {
      if (hasMorphs) {
        console.group('[OracleAvatar3D] Morph Target Dictionary');
        result.forEach(({ mesh, indexMap }) => {
          console.log(`Mesh "${mesh.name}" — raw dict:`, mesh.morphTargetDictionary);
          console.log(`Mesh "${mesh.name}" — resolved OVR map:`, Object.fromEntries(indexMap));
        });
        console.groupEnd();

        // Expose for oracle-calibrate.mjs
        (window as any).__oracle_morphDicts = result.map(({ mesh, indexMap }) => ({
          meshName: mesh.name,
          dict:     { ...mesh.morphTargetDictionary },
          resolved: Object.fromEntries(indexMap),
        }));
      } else {
        console.warn(
          '[OracleAvatar3D] hero3.glb has no morph targets.\n' +
          'If this is a Ready Player Me avatar, re-download with:\n' +
          '  https://models.readyplayer.me/<avatarId>.glb?morphTargets=Oculus+Visemes\n' +
          'Falling back to Head bone speaking animation.'
        );
        (window as any).__oracle_morphDicts = [];
      }
    }

    return { meshes: result, headBone, neckBone, leftEyeBone, rightEyeBone, hasMorphs, avatarYOffset };
  }, [scene]);

  useFrame((state, delta) => {
    const vs     = visemeStateRef.current;
    const amp    = vs?.amplitude ?? 0;
    const lerpDt = Math.min(delta * 60, 1); // frame-rate independent

    // ── Camera: parallax look-around + pinch zoom ──────────────────────────
    // Runs every frame so the cinematic lerp stays smooth even when the
    // cameraStateRef hasn't changed (drift settle / breathing feel).
    if (cameraStateRef?.current) {
      const { x, y, zoom } = cameraStateRef.current;
      // Map zoom 1→4 to Z distance 2.8→0.7 (reciprocal = natural optical zoom feel).
      // Clamp both ends: zoom<1 must not send camera to Z=Infinity.
      const targetZ = Math.min(CAM_DEFAULT_Z, Math.max(CAM_MIN_Z, CAM_DEFAULT_Z / Math.max(zoom, 1)));
      camTarget.current.set(
        x * CAM_X_RANGE,
        CAM_Y_CENTER - y * CAM_Y_RANGE,
        targetZ,
      );
    }
    const cf = CAM_LERP * lerpDt;
    camera.position.lerp(camTarget.current, cf);
    camera.lookAt(0, CAM_Y_CENTER, 0); // face is at Y=0 after group offset

    // ── Gaze tracking — Oracle watches the viewer ─────────────────────────
    // Eyes lead, head follows, neck barely moves. Hierarchy mirrors how a real
    // person maintains eye contact while the head lags behind the gaze.
    // cameraStateRef.x/y are the same parallax values driving the CSS layers,
    // so the Oracle's gaze is always aimed at wherever the user is looking from.
    if (cameraStateRef?.current) {
      // Clamp to ±1 regardless of phase intensity overshoot
      const gx = Math.max(-1, Math.min(1,  cameraStateRef.current.x));
      const gy = Math.max(-1, Math.min(1, -cameraStateRef.current.y)); // invert Y (up = positive)

      // Eye bones — snappy, wide angle (they do most of the work)
      const eyeLerpF = lerpDt * 0.14;
      const eyeMaxH  =  0.30; // ~17° horizontal
      const eyeMaxV  =  0.18; // ~10° vertical
      if (meshData.leftEyeBone) {
        meshData.leftEyeBone.rotation.y  = THREE.MathUtils.lerp(meshData.leftEyeBone.rotation.y,  gx * eyeMaxH, eyeLerpF);
        meshData.leftEyeBone.rotation.x  = THREE.MathUtils.lerp(meshData.leftEyeBone.rotation.x,  gy * eyeMaxV, eyeLerpF);
      }
      if (meshData.rightEyeBone) {
        meshData.rightEyeBone.rotation.y = THREE.MathUtils.lerp(meshData.rightEyeBone.rotation.y, gx * eyeMaxH, eyeLerpF);
        meshData.rightEyeBone.rotation.x = THREE.MathUtils.lerp(meshData.rightEyeBone.rotation.x, gy * eyeMaxV, eyeLerpF);
      }

      // Head bone — slower, narrower (compensates partially for eye movement)
      if (meshData.headBone) {
        const headLerpF = lerpDt * 0.04;
        meshData.headBone.rotation.y = THREE.MathUtils.lerp(meshData.headBone.rotation.y, gx * 0.10, headLerpF);
        meshData.headBone.rotation.x = THREE.MathUtils.lerp(meshData.headBone.rotation.x, gy * 0.06, headLerpF);
      }

      // Neck — barely perceptible, just enough to feel organic
      if (meshData.neckBone) {
        const neckLerpF = lerpDt * 0.025;
        meshData.neckBone.rotation.y = THREE.MathUtils.lerp(meshData.neckBone.rotation.y, gx * 0.04, neckLerpF);
      }
    }

    // ── Idle breathing — subtle Y drift around the face-centered offset ──
    if (groupRef.current) {
      groupRef.current.position.y = THREE.MathUtils.lerp(
        groupRef.current.position.y,
        meshData.avatarYOffset + Math.sin(state.clock.elapsedTime * 1.4) * 0.008,
        lerpDt * 0.04,
      );
    }

    if (!vs) return;

    // ── PATH A: OVR morph targets ─────────────────────────────────────────
    if (meshData.hasMorphs) {
      const targets = new Map<OVRName, number>();
      OVR_NAMES.forEach(n => targets.set(n, 0));

      if (amp > 0.01) {
        const dominant = ORACLE_TO_OVR[vs.viseme] ?? ['viseme_sil'];
        const weight   = Math.min(amp * 1.4, 1.0);
        const perShape = weight / dominant.length;
        for (const name of dominant) {
          targets.set(name, (targets.get(name) ?? 0) + perShape);
        }
        for (const ca of CO_ARTIC) {
          if (dominant.includes(ca.viseme)) continue;
          const contrib = (vs[ca.dimension] ?? 0) * ca.scale * amp;
          if (contrib > 0.01) {
            targets.set(ca.viseme, Math.min(1, (targets.get(ca.viseme) ?? 0) + contrib));
          }
        }
      }

      const attackLerp = lerpDt * 0.50;
      const decayLerp  = lerpDt * 0.18;

      for (const { mesh, indexMap } of meshData.meshes) {
        const infl      = mesh.morphTargetInfluences!;
        const totalMorphs = infl.length;
        for (const name of OVR_NAMES) {
          const idx = indexMap.get(name);
          if (idx === undefined || idx >= totalMorphs) continue;
          const target  = targets.get(name) ?? 0;
          const current = infl[idx];
          infl[idx] = THREE.MathUtils.lerp(current, target, target > current ? attackLerp : decayLerp);
        }
      }
      return;
    }

    // ── PATH B: No morph targets — bone-based speaking indicator ─────────
    // Animates the Head bone with a subtle jaw-open rotation when speaking.
    // Crude but visible. Replace by re-downloading the GLB with OVR visemes.
    const bone = meshData.headBone;
    if (!bone) return;

    const targetRot = amp > 0.03 ? -amp * 0.09 : 0; // subtle downward rotation = jaw open
    bone.rotation.x = THREE.MathUtils.lerp(
      bone.rotation.x,
      targetRot,
      amp > bone.rotation.x ? lerpDt * 0.55 : lerpDt * 0.20,
    );
  });

  return (
    <group ref={groupRef} dispose={null}>
      <primitive object={scene} />
      <OracleSceneLights />
    </group>
  );
}

// ── Scene lighting — cyberpunk palette ───────────────────────────────────────
function OracleSceneLights() {
  return (
    <>
      <ambientLight intensity={0.18} color="#00ff88" />
      <directionalLight position={[0, 2, 4]} intensity={1.4} color="#e8f0ff" castShadow={false} />
      <spotLight position={[-3, 4, 3]}  angle={0.28} penumbra={1} intensity={2.2} color="#b026ff" />
      <spotLight position={[ 3, -1, 2]} angle={0.45} penumbra={1} intensity={1.2} color="#00ccff" />
      {/* Subtle rim from below for depth */}
      <pointLight position={[0, -2, 1]} intensity={0.4} color="#001a0a" />
    </>
  );
}

// Eager preload so the GLB is ready before the canvas mounts
useGLTF.preload('/hero3.glb');
