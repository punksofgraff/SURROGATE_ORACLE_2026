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
import React, { useRef, useMemo, useEffect } from 'react';
import { useGLTF, useAnimations, Center } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { VisemeState } from '../lib/visemeDetector';
import type { SeekerMotion } from '../hooks/useXRMode';

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
  'eyeBlinkLeft',
  'eyeBlinkRight',
] as const;

type OVRName = typeof OVR_NAMES[number];

// Oracle worklet viseme → morph-target name(s) — AUTO-CALIBRATED (ovr).
// Re-run: npm run calibrate after changing hero3.glb.
// Arrays = co-articulation blend (multiple shapes activated together).
const ORACLE_TO_OVR: Record<string, OVRName[]> = {
  X: ['viseme_sil'],
  A: ['viseme_aa'],
  E: ['viseme_E', 'viseme_ih'],
  I: ['viseme_ih'],
  O: ['viseme_oh', 'viseme_ou'],
  U: ['viseme_ou'],
  B: ['viseme_PP'],
  C: ['viseme_SS', 'viseme_CH'],
  D: ['viseme_DD', 'viseme_TH'],
  F: ['viseme_FF'],
  G: ['viseme_kk'],
  H: ['viseme_oh', 'viseme_ou'],
};

// Secondary viseme contributions driven by VisemeState shape parameters.
// Broadened to cover all lip axes — openness, rounding, spread, and closure.
// These fire regardless of the primary viseme so lips move even when the
// worklet classifies the frame as a generic vowel (A or C).
const CO_ARTIC: Array<{ viseme: OVRName; dimension: 'openness' | 'rounded' | 'spread'; scale: number }> = [
  { viseme: 'viseme_aa', dimension: 'openness', scale: 1.2 }, // jaw opens with openness
  { viseme: 'viseme_oh', dimension: 'rounded',  scale: 0.9 }, // lips round for O
  { viseme: 'viseme_ou', dimension: 'rounded',  scale: 0.6 }, // more rounding for U
  { viseme: 'viseme_E',  dimension: 'spread',   scale: 0.9 }, // lips spread for E/I
  { viseme: 'viseme_ih', dimension: 'spread',   scale: 0.5 }, // secondary spread
  { viseme: 'viseme_SS', dimension: 'spread',   scale: 0.5 }, // sibilant spread
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

// ── Blinking morphs ──────────────────────────────────────────────────────────
const BLINK_NAMES = ['eyeBlinkLeft', 'eyeBlinkRight', 'EyeBlinkLeft', 'EyeBlinkRight'] as const;

function buildIndexMap(dict: Record<string, number>): Map<string, number> {
  const map = new Map<string, number>();
  
  // 1. OVR Standard
  for (const ovr of OVR_NAMES) {
    if (dict[ovr] !== undefined) { map.set(ovr, dict[ovr]); continue; }
    const bare = ovr.replace('viseme_', '');
    if (dict[bare] !== undefined) { map.set(ovr, dict[bare]); continue; }
    const arkit = ARKIT_FALLBACK[ovr];
    if (arkit) {
      for (const name of arkit) {
        if (dict[name] !== undefined) { map.set(ovr, dict[name]); break; }
      }
    }
  }

  // 2. Blinking
  for (const b of BLINK_NAMES) {
    if (dict[b] !== undefined) map.set(b, dict[b]);
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
  seekerMotionRef?: React.RefObject<SeekerMotion | null>;
}

// Camera orbit bounds
// The avatar group is offset -1.59 on Y so the Wolf3D face sits at world Y≈0.
// All camera constants are in face-centered space (0 = face center).
const CAM_DEFAULT_Z = 1.8;  // portrait distance — head + upper chest visible
const CAM_MIN_Z     = 0.4;  // maximum zoom-in (eyes fill the frame)
const CAM_X_RANGE   = 0.30; // horizontal look-around extent (world units)
// <Center bottom>: feet at Y=0, head at ~Y=1.6. Target Y=1.45 frames the
// mouth area at center — eyes above center, chin below. Not throat.
const CAM_Y_CENTER  = 1.45;
const CAM_Y_RANGE   = 0.22; // vertical look-around extent
const CAM_LERP      = 0.08; // responsive on phone while still smooth

// Fallback group offset if the head bone can't be located. The real offset is
// computed per-model from the actual Head bone (see meshData.avatarYOffset) so a
// swapped GLB (hero3.glb was replaced; .bak is the prior model) frames the FACE,
// not the legs — the old hardcoded -1.59 was calibrated for the previous avatar.
const AVATAR_Y_OFFSET = -1.59;

// ── Crossed-arms "ready to listen" rest pose ─────────────────────────────────
// ROOT CAUSE OF PREVIOUS FAILURES: pass-1 had NO lateral component, so both
// elbows collapsed to x≈±0.13 near center (T-rex / mantis anchor). Natural
// folded arms need elbows at x≈±0.28. Fix: each arm hangs DOWN + OUTWARD
// (shoulder-to-shoulder lateral axis, sign per side) + slight forward so elbows
// land at body sides before the forearms fold across.
// LEFT forearm sits in front of RIGHT. All tunables in one place.
const ARM_FWD           = 0.18; // upper-arm: slight forward lean (keep small)
const ARM_OUT           = 0.50; // upper-arm: lateral spread — the previously missing axis
const CROSS_FRONT_LEFT  = 0.14; // LEFT forearm pushed forward (in front)
const CROSS_FRONT_RIGHT = 0.07; // RIGHT forearm slightly back (behind left)
const HAND_RISE         = 0.06; // wrist target above opposite elbow (forearm rest)
const PRONATE           = 0.0;  // forearm roll around long axis — tune if palms face wrong way

export function OracleAvatar3D({ visemeStateRef, cameraStateRef, seekerMotionRef }: OracleAvatar3DProps) {
  const { scene }      = useGLTF('/hero3.glb?v=morphs-v2');
  const { animations: idleClips }    = useGLTF('/oracle-idle.glb');
  const { animations: talking1Clips } = useGLTF('/oracle-talking-1.glb');
  const { animations: talking2Clips } = useGLTF('/oracle-talking-2.glb');
  const { camera } = useThree();
  const groupRef   = useRef<THREE.Group>(null);
  // Smooth camera target — avoids snapping on sudden gesture changes
  const camTarget = useRef(new THREE.Vector3(0, CAM_Y_CENTER, CAM_DEFAULT_Z));

  // Strip the Head/Neck tracks from every clip so the procedural gaze code is the
  // SOLE driver of head + neck. Otherwise the idle clip keeps overwriting the head
  // each frame to its baked "up & to the left" pose, and the gaze lerp (0.09) only
  // nudges 9% toward the seeker — so at rest he stares off up-left instead of at
  // the seeker. With these tracks gone, the gaze code converges and HOLDS on the
  // seeker (he keeps looking at you while listening on mute), and the procedural
  // nod/tilt handles head motion during speech. Arms/body tracks are untouched.
  const stripHeadNeck = (clips: THREE.AnimationClip[]) =>
    clips.map((c) => {
      const clip = c.clone();
      clip.tracks = clip.tracks.filter((tr) => {
        const node = tr.name.split('.')[0].toLowerCase();
        return !(node.includes('head') || node.includes('neck'));
      });
      return clip;
    });
  const idleAnim  = useMemo(() => stripHeadNeck(idleClips),     [idleClips]);
  const talk1Anim = useMemo(() => stripHeadNeck(talking1Clips), [talking1Clips]);
  const talk2Anim = useMemo(() => stripHeadNeck(talking2Clips), [talking2Clips]);

  // Animation mixer — driven by speaking state
  const { mixer } = useAnimations(
    [...idleAnim, ...talk1Anim, ...talk2Anim],
    groupRef,
  );
  const talkingActionRef = useRef<THREE.AnimationAction | null>(null);

  // Resolve each action from its distinct clip OBJECT (not by name): separate
  // GLB exports often reuse clip names ("mixamo.com"), which collide in drei's
  // name-keyed `actions` map and alias idle/talk together. Keying off the clip
  // instances (bound to the same group root) is collision-proof. Populated in
  // the mount effect below, once groupRef is attached.
  const idleActionRef  = useRef<THREE.AnimationAction | null>(null);
  const talk1ActionRef = useRef<THREE.AnimationAction | null>(null);
  const talk2ActionRef = useRef<THREE.AnimationAction | null>(null);

  // Blinking state — speed, double-blink support, idle vs speech mode
  const blinkRef = useRef({
    intensity: 0,
    lastBlink: 0,
    speed: 12,
    doublePending: false,
    doubleAt: 0,
  });

  // Saccade state (eye darts) — nextTime triggers a randomized micro eye adjustment
  const saccadeRef = useRef({
    x: 0,
    y: 0,
    nextTime: 0,
  });

  // ── Start idle animation on mount — 45% slower than source clip ──────────
  useEffect(() => {
    const root = groupRef.current;
    if (!root) return;

    // Bind one action per distinct clip instance to the group root.
    const idle  = idleAnim[0]  ? mixer.clipAction(idleAnim[0], root)  : null;
    const talk1 = talk1Anim[0] ? mixer.clipAction(talk1Anim[0], root) : null;
    const talk2 = talk2Anim[0] ? mixer.clipAction(talk2Anim[0], root) : null;
    idleActionRef.current  = idle;
    talk1ActionRef.current = talk1;
    talk2ActionRef.current = talk2;

    if (idle) {
      idle.reset().setLoop(THREE.LoopRepeat, Infinity).play();
      idle.setEffectiveWeight(1);
      idle.setEffectiveTimeScale(0.65);
    }
    // Pre-set talking action time scales too
    if (talk1) talk1.setEffectiveTimeScale(0.65);
    if (talk2) talk2.setEffectiveTimeScale(0.65);

    if (
      import.meta.env.DEV && idle &&
      (idle === talk1 || idle === talk2 || (talk1 && talk1 === talk2))
    ) {
      console.warn('[OracleAvatar3D] idle/talk actions alias — GLB clip names collide; blend will be degraded.');
    }
  }, [mixer, idleAnim, talk1Anim, talk2Anim]);

  // Cache skinned meshes + gaze bones — found once on mount, zero traversal per frame.
  const meshData = useMemo(() => {
    const result: Array<{
      mesh:     THREE.SkinnedMesh;
      indexMap: Map<string, number>;
    }> = [];
    let headBone:          THREE.Object3D | null = null;
    let neckBone:          THREE.Object3D | null = null;
    let leftEyeBone:       THREE.Object3D | null = null;
    let rightEyeBone:      THREE.Object3D | null = null;
    let spineBone:         THREE.Object3D | null = null; // Spine2 — upper chest
    let leftShoulderBone:  THREE.Object3D | null = null;
    let rightShoulderBone: THREE.Object3D | null = null;
    // Arm chain (shoulder→hand, both sides) — pinned to the crossed rest pose.
    const armChainBones: THREE.Object3D[] = [];
    scene.traverse((child) => {
      // Mesh logging for debugging
      if (child.type === 'SkinnedMesh' || child.type === 'Mesh') {
        const m = child as THREE.Mesh;
        if (m.morphTargetDictionary) {
           const keys = Object.keys(m.morphTargetDictionary);
           const eyeKeys = keys.filter(k => 
             k.toLowerCase().includes('eye') || 
             k.toLowerCase().includes('blink') || 
             k.toLowerCase().includes('close') || 
             k.toLowerCase().includes('lid')
           );
           console.log(`[OracleAvatar3D] Mesh "${m.name}" eye/blink morphs found:`, eyeKeys.join(', '));
           
           // Expose all morph names for debugging
           if (import.meta.env.DEV) {
             (window as any).__oracle_allMorphs = (window as any).__oracle_allMorphs || {};
             (window as any).__oracle_allMorphs[m.name] = keys;
           }
        }
      }

      const n = child.name.toLowerCase();
      if (n === 'head' && !headBone) headBone = child;
      if (n === 'neck' && !neckBone) neckBone = child;
      if (n.includes('eye') && n.includes('left')  && !leftEyeBone)  leftEyeBone  = child;
      if (n.includes('eye') && n.includes('right') && !rightEyeBone) rightEyeBone = child;
      // Upper chest: Spine2 gives visible upper-body lean — prefer it over Spine/Spine1
      if (n === 'spine2' && !spineBone) spineBone = child;
      if (!spineBone && n === 'spine1') spineBone = child;
      if (n === 'leftshoulder'  && !leftShoulderBone)  leftShoulderBone  = child;
      if (n === 'rightshoulder' && !rightShoulderBone) rightShoulderBone = child;
      if (/^(left|right)(shoulder|arm|forearm|hand)$/.test(n)) armChainBones.push(child);

      const sm = child as THREE.SkinnedMesh;
      if (!sm.isSkinnedMesh || !sm.morphTargetDictionary || !sm.morphTargetInfluences) return;
      const indexMap = buildIndexMap(sm.morphTargetDictionary);
      
      // Auto-detect extra blinking morphs
      const dict = sm.morphTargetDictionary;
      const extraBlinks = ['eyeBlinkLeft', 'eyeBlinkRight', 'EyeBlinkLeft', 'EyeBlinkRight', 'eyesClosed', 'EyesClosed', 'blink'];
      for (const b of extraBlinks) {
        if (dict[b] !== undefined) indexMap.set(b, dict[b]);
      }

      result.push({ mesh: sm, indexMap });
    });

    if (import.meta.env.DEV) {
      console.log('[OracleAvatar3D] Bones found:', {
        head: !!headBone, neck: !!neckBone, leftEye: !!leftEyeBone, rightEye: !!rightEyeBone
      });
      console.log('[OracleAvatar3D] Eye bones found — L:', !!leftEyeBone, 'R:', !!rightEyeBone);
    }

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
          console.log(`Mesh "${mesh.name}" — resolved map:`, Object.fromEntries(indexMap));
        });
        console.groupEnd();
        
        // Expose for debugging
        (window as any).__oracle_morphDicts = result.map(({ mesh, indexMap }) => ({
          meshName: mesh.name,
          dict:     { ...mesh.morphTargetDictionary },
          resolved: Object.fromEntries(indexMap),
        }));
      } else {
        console.warn('[OracleAvatar3D] hero3.glb has no morph targets.');
        (window as any).__oracle_morphDicts = [];
      }
    }

    // ── Build the crossed "ready to listen" rest pose (world-space aim) ────────
    const armRestBones: Array<{ bone: THREE.Object3D; rest: THREE.Quaternion }> = [];
    const byName = new Map<string, THREE.Object3D>();
    for (const b of armChainBones) byName.set(b.name.toLowerCase(), b);
    const skeleton = result[0]?.mesh?.skeleton;
    if (skeleton && byName.size > 0) {
      skeleton.pose();
      scene.updateMatrixWorld(true);

      // Avatar forward = +Z. The group has no rotation (JSX: position Y only), so
      // GLB-local space IS world space. Eye bones in hero3.glb sit *behind* the
      // head pivot, making eyes−head point toward −Z (backward). Hardcoding +Z
      // is unambiguous: camera is at positive Z looking at the avatar at origin.
      const fwd = new THREE.Vector3(0, 0, 1);
      const DOWN = new THREE.Vector3(0, -1, 0);

      // Local quat that re-aims `bone` so (childPos - bonePos) points along dir.
      const aimLocal = (bone: THREE.Object3D, childPos: THREE.Vector3, dir: THREE.Vector3) => {
        const bp = new THREE.Vector3(); bone.getWorldPosition(bp);
        const cur = childPos.clone().sub(bp);
        if (cur.lengthSq() < 1e-9) return bone.quaternion.clone();
        cur.normalize();
        const rot = new THREE.Quaternion().setFromUnitVectors(cur, dir);
        const bw = new THREE.Quaternion(); bone.getWorldQuaternion(bw);
        const pw = new THREE.Quaternion();
        if (bone.parent) bone.parent.getWorldQuaternion(pw);
        return pw.invert().multiply(rot.multiply(bw));
      };

      const sides = ['left', 'right'] as const;

      // Pass 1: hang each upper arm DOWN + OUTWARD (lateral, per side) + slight FWD.
      // The lateral axis is read from shoulder world positions — no assumed ±X.
      // This places elbows at body sides (x≈±0.28) not collapsed center (x≈±0.13).
      const sL = new THREE.Vector3();
      const sR = new THREE.Vector3();
      if (leftShoulderBone)  (leftShoulderBone  as THREE.Object3D).getWorldPosition(sL);
      if (rightShoulderBone) (rightShoulderBone as THREE.Object3D).getWorldPosition(sR);
      const lateral = sR.clone().sub(sL);
      if (lateral.lengthSq() < 1e-6) lateral.set(1, 0, 0); else lateral.normalize();

      for (const s of sides) {
        const arm  = byName.get(s + 'arm');
        const fore = byName.get(s + 'forearm');
        if (!arm || !fore) continue;
        const sign = s === 'left' ? -1 : 1; // left goes −lateral, right goes +lateral
        const downDir = DOWN.clone()
          .addScaledVector(fwd,     ARM_FWD)
          .addScaledVector(lateral, sign * ARM_OUT)
          .normalize();
        const elbow = new THREE.Vector3(); fore.getWorldPosition(elbow);
        const rest = aimLocal(arm, elbow, downDir);
        arm.quaternion.copy(rest);
        armRestBones.push({ bone: arm, rest });
      }
      scene.updateMatrixWorld(true);

      // Elbow positions after the upper arms have dropped.
      const elbowPos: Record<string, THREE.Vector3> = {};
      for (const s of sides) {
        const fore = byName.get(s + 'forearm');
        if (fore) { const p = new THREE.Vector3(); fore.getWorldPosition(p); elbowPos[s] = p; }
      }
      if (import.meta.env.DEV) {
        console.log('[ArmPose] elbowPos L', elbowPos['left']?.toArray().map(v => +v.toFixed(3)),
                                  'R', elbowPos['right']?.toArray().map(v => +v.toFixed(3)),
                    '| fwd', fwd.toArray(), '| lateral', lateral.toArray().map(v => +v.toFixed(3)));
      }

      // Pass 2: fold each forearm across the body toward the OPPOSITE elbow,
      // pushed forward so they cross in front (left in front of right).
      for (const s of sides) {
        const fore     = byName.get(s + 'forearm');
        const hand     = byName.get(s + 'hand');
        const shoulder = byName.get(s + 'shoulder');
        const opp      = s === 'left' ? 'right' : 'left';
        if (fore && elbowPos[s] && elbowPos[opp]) {
          const wrist = new THREE.Vector3();
          if (hand) hand.getWorldPosition(wrist);
          else wrist.copy(elbowPos[s]).add(DOWN);
          const front = s === 'left' ? CROSS_FRONT_LEFT : CROSS_FRONT_RIGHT;
          // Aim the wrist roughly HORIZONTAL across to the OPPOSITE elbow (raised a
          // touch so the hand rests on the opposite forearm) — the forearms fold flat
          // across the chest like relaxed folded arms, not pointing up at the shoulders.
          const aimPt = elbowPos[opp].clone()
            .addScaledVector(fwd, front)
            .add(new THREE.Vector3(0, HAND_RISE, 0));
          const dir  = aimPt.sub(elbowPos[s]).normalize();
          let finalRest = aimLocal(fore, wrist, dir);
          // Optional pronation: twist forearm around its own long axis so palms face
          // the body. PRONATE=0 leaves the bind-pose roll intact. Increase toward
          // ~0.8–1.2 if palms face the wrong way (tune with user's eyes).
          if (PRONATE !== 0) {
            const pw2 = new THREE.Quaternion();
            if (fore.parent) fore.parent.getWorldQuaternion(pw2);
            const twist = new THREE.Quaternion().setFromAxisAngle(dir, PRONATE);
            const twistLocal = pw2.clone().invert().multiply(twist).multiply(pw2);
            finalRest = twistLocal.multiply(finalRest);
          }
          fore.quaternion.copy(finalRest);
          armRestBones.push({ bone: fore, rest: finalRest });
        }
        // Hands & shoulders hold their bind rotation so they ride the arm calmly.
        if (hand)     armRestBones.push({ bone: hand,     rest: hand.quaternion.clone() });
        if (shoulder) armRestBones.push({ bone: shoulder, rest: shoulder.quaternion.clone() });
      }
    }

    return {
      meshes:             result,
      headBone:           headBone          as THREE.Object3D | null,
      neckBone:           neckBone          as THREE.Object3D | null,
      leftEyeBone:        leftEyeBone       as THREE.Object3D | null,
      rightEyeBone:       rightEyeBone      as THREE.Object3D | null,
      spineBone:          spineBone         as THREE.Object3D | null,
      leftShoulderBone:   leftShoulderBone  as THREE.Object3D | null,
      rightShoulderBone:  rightShoulderBone as THREE.Object3D | null,
      armRestBones,
      hasMorphs,
      avatarYOffset,
    };
  }, [scene]);

  // Smoothed idle↔talk crossfade weight: 0 = idle gestures (at rest), 1 = talking
  // gestures (during speech). Eases so the body never snaps between clips.
  const talkBlendRef = useRef(0);
  // Arm-pin strength: eases 0→1 so the arms settle INTO the crossed rest pose on
  // arrival, then hold it (overriding the clip's floaty arms).
  const armRestRef = useRef(0);

  useFrame((state, delta) => {
    const vs     = visemeStateRef.current;
    const amp    = vs?.amplitude ?? 0;
    const lerpDt = Math.min(delta * 60, 1); // frame-rate independent
    const t      = state.clock.elapsedTime;

    // ── Animation mixer ───────────────────────────────────────────────────
    mixer.update(delta);

    // Blend idle ↔ talking based on Oracle speaking amplitude
    const idleAction    = idleActionRef.current;
    const talk1Action   = talk1ActionRef.current;
    const talk2Action   = talk2ActionRef.current;

    // Guard per-action: idle drives the base pose even if a talking clip is
    // missing/renamed, so a single bad export can't disable the whole combo.
    if (idleAction) {
      const isSpeaking = amp > 0.04;
      const talkPool = [talk1Action, talk2Action].filter(
        (a): a is THREE.AnimationAction => !!a,
      );

      // Pick a talking variation when speech starts.
      if (isSpeaking && !talkingActionRef.current && talkPool.length > 0) {
        const chosen = talkPool[Math.floor(Math.random() * talkPool.length)];
        chosen.reset().setLoop(THREE.LoopRepeat, Infinity).play();
        chosen.setEffectiveWeight(0);
        talkingActionRef.current = chosen;
      }

      // Smoothly crossfade idle ↔ talking so the ARMS animate from the avatar's
      // OWN baked skeletal clips — idle = relaxed weight-shift gestures, talk =
      // active conversational gestures. This is natural movement like any game
      // avatar, NOT a pinned/frozen pose. Ease in/out (~0.3s) so gestures never
      // snap or "flap". Head & neck tracks are stripped from the clips, so they
      // only move the body + arms; the procedural gaze keeps the head on the seeker.
      const target = isSpeaking && talkingActionRef.current ? 1 : 0;
      talkBlendRef.current += (target - talkBlendRef.current) * 0.06 * lerpDt;
      const blend = talkBlendRef.current;

      // Release the talking slot once it has fully faded out.
      if (!isSpeaking && talkingActionRef.current && blend < 0.01) {
        talkingActionRef.current.stop();
        talkingActionRef.current = null;
      }

      idleAction.setEffectiveWeight(1 - blend);
      for (const a of talkPool) {
        a.setEffectiveWeight(a === talkingActionRef.current ? blend : 0);
      }
    }

    // ── Arms: hold the crossed "ready to listen" rest pose ────────────────
    // The clips (above) animate the whole body incl. arms; we override ONLY the
    // arm chain back to the deliberate folded pose so they never float or flap.
    armRestRef.current += (1 - armRestRef.current) * 0.05 * lerpDt;
    const restK = armRestRef.current;
    if (restK > 0.001 && meshData.armRestBones.length > 0) {
      for (const a of meshData.armRestBones) {
        a.bone.quaternion.slerp(a.rest, restK);
      }
    }

    // ── Camera: parallax look-around + pinch zoom ─────────────────────────
    if (cameraStateRef?.current) {
      const { x, y, zoom } = cameraStateRef.current;
      const targetZ = Math.min(CAM_DEFAULT_Z, Math.max(CAM_MIN_Z, CAM_DEFAULT_Z / Math.max(zoom, 1)));
      camTarget.current.set(x * CAM_X_RANGE, CAM_Y_CENTER - y * CAM_Y_RANGE, targetZ);
    }
    camera.position.lerp(camTarget.current, CAM_LERP * lerpDt);
    camera.lookAt(0, CAM_Y_CENTER, 0);

    // ── Blinking & Saccades ──────────────────────────────────────────────────
    const blink = blinkRef.current;
    const now   = t;

    if (blink.intensity <= 0) {
      // Trigger a new blink?
      const timeSince = now - blink.lastBlink;
      const interval  = 3.2 + Math.random() * 3.8; // 3.2–7s, human range
      if (timeSince > interval && amp < 0.40) {      // suppress mid-heavy-speech
        blink.lastBlink   = now;
        blink.intensity   = 1.0;
        // Slow contemplative blink at rest, fast blink during speech
        blink.speed       = amp < 0.04 ? 6 : 13;
        blink.doublePending = Math.random() < 0.20; // 20% chance of double
        blink.doubleAt    = now + 0.22 + Math.random() * 0.08;
      }
    } else {
      blink.intensity = Math.max(0, blink.intensity - delta * blink.speed);
      // Fire the second blink of a double
      if (blink.doublePending && now >= blink.doubleAt && blink.intensity <= 0) {
        blink.intensity     = 0.75;
        blink.doublePending = false;
        blink.speed         = 14;
      }
    }

    // Voice intensity-driven emotional squint (narrowing eyelids when speaking with force)
    const voiceIntensity = vs?.intensity ?? 0;
    const squintVal = Math.min(0.24, voiceIntensity * 0.35);

    // Asymmetric blink intensity: left leads right by a tiny offset, mimicking real eyelids
    const leftBlinkVal = Math.max(squintVal, Math.sin(Math.min(1.0, blink.intensity * 1.05) * Math.PI));
    const rightBlinkVal = Math.max(squintVal, Math.sin(THREE.MathUtils.clamp((blink.intensity - 0.03) * 1.05, 0, 1) * Math.PI));

    // Saccades (Rapid, randomized micro eye darts representing biological focus)
    const saccade = saccadeRef.current;
    if (now >= saccade.nextTime) {
      if (Math.random() < 0.78) {
        // Small, subtle biological movements
        saccade.x = (Math.random() - 0.5) * 0.12;
        saccade.y = (Math.random() - 0.5) * 0.07;
      } else {
        saccade.x = 0;
        saccade.y = 0;
      }
      saccade.nextTime = now + 0.20 + Math.random() * 0.90;
    }

    // ── Gaze & bone animation ─────────────────────────────────────────────
    // Seeker Tracking: Use real motion data if in XR/Camera mode, else use parallax
    let seekerX = cameraStateRef?.current ? cameraStateRef.current.x : 0;
    let seekerY = cameraStateRef?.current ? -cameraStateRef.current.y : 0;

    if (seekerMotionRef?.current) {
      const { phoneTilt, facePos, hasFace } = seekerMotionRef.current;
      
      // Determine if we have active sensor data
      const hasTilt = Math.abs(phoneTilt.x) > 0.01 || Math.abs(phoneTilt.y) > 0.01;

      if (hasTilt || hasFace) {
        if (hasTilt) {
          // Mobile/Tablet: Blend phone tilt (70%) and face position (30%)
          seekerX = phoneTilt.x * 0.7 + facePos.x * 0.3;
          seekerY = phoneTilt.y * 0.7 + facePos.y * 0.3;
        } else {
          // Desktop: Use 100% face tracking if camera is active, else seekerX remains mouse parallax
          seekerX = facePos.x;
          seekerY = facePos.y;
        }
      }
    }

    const gx = Math.max(-1, Math.min(1, seekerX));
    const gy = Math.max(-1, Math.min(1, seekerY));

    // Eye gaze follows seeker with active "Mona Lisa" feedback + saccades
    const eyeLerpF = lerpDt * 0.24;
    const finalEyeX = gx * 0.62 + saccade.x;
    const finalEyeY = gy * 0.42 + saccade.y;

    if (meshData.leftEyeBone) {
      meshData.leftEyeBone.rotation.y = THREE.MathUtils.lerp(meshData.leftEyeBone.rotation.y, finalEyeX, eyeLerpF);
      meshData.leftEyeBone.rotation.x = THREE.MathUtils.lerp(meshData.leftEyeBone.rotation.x, finalEyeY, eyeLerpF);
      meshData.leftEyeBone.scale.y    = 1.0 - leftBlinkVal * 0.92;
    }
    if (meshData.rightEyeBone) {
      meshData.rightEyeBone.rotation.y = THREE.MathUtils.lerp(meshData.rightEyeBone.rotation.y, finalEyeX, eyeLerpF);
      meshData.rightEyeBone.rotation.x = THREE.MathUtils.lerp(meshData.rightEyeBone.rotation.x, finalEyeY, eyeLerpF);
      meshData.rightEyeBone.scale.y    = 1.0 - rightBlinkVal * 0.92;
    }

    // ── Head: organic conversational movement ─────────────────────────────
    if (meshData.headBone) {
      const headLerpF = lerpDt * 0.09;
      const speakAmt  = amp * 1.1;

      // Base parallax gaze with enhanced lock-on tracking
      let tx = gx * 0.45;
      let ty = gy * 0.32;
      let tz = 0;

      // Alive idle drift — two incommensurate freqs (~0.11Hz + ~0.18Hz)
      tx += Math.sin(t * 0.71 + 0.4) * 0.025 + Math.sin(t * 1.13 + 1.7) * 0.016;
      tz += Math.cos(t * 0.57 + 0.9) * 0.020;

      if (amp > 0.04) {
        // Conversational nod at 0.62 Hz
        ty -= Math.sin(t * 3.90) * 0.12 * speakAmt;
        // Conversational tilt at 0.37 Hz
        tz += Math.sin(t * 2.30 + 1.2) * 0.12 * speakAmt;
        // Forward lean into the moment — up to 0.04 rad
        ty -= amp * 0.04;
      }

      meshData.headBone.rotation.y = THREE.MathUtils.lerp(meshData.headBone.rotation.y, tx, headLerpF);
      meshData.headBone.rotation.x = THREE.MathUtils.lerp(meshData.headBone.rotation.x, ty, headLerpF);
      meshData.headBone.rotation.z = THREE.MathUtils.lerp(meshData.headBone.rotation.z, tz, headLerpF);
    }

    // ── Neck: gentle follow ───────────────────────────────────────────────
    if (meshData.neckBone) {
      const neckLerpF = lerpDt * 0.05;
      const neckSwayX = Math.sin(t * 0.80) * 0.025 + Math.sin(t * 1.90 + 0.6) * 0.012 * amp;
      const neckSwayZ = Math.cos(t * 0.52 + 1.1) * 0.018;
      meshData.neckBone.rotation.y = THREE.MathUtils.lerp(meshData.neckBone.rotation.y, gx * 0.15, neckLerpF);
      meshData.neckBone.rotation.x = THREE.MathUtils.lerp(meshData.neckBone.rotation.x, gy * 0.12 + neckSwayX, neckLerpF);
      meshData.neckBone.rotation.z = THREE.MathUtils.lerp(meshData.neckBone.rotation.z, neckSwayZ, neckLerpF);
    }

    // ── Breathing — biological spine chest expansion & Y drift ────────────
    const breathSpeed = 1.35 + amp * 1.3;
    const breathCycle = Math.sin(t * breathSpeed);

    if (meshData.spineBone) {
      const spineLerpF = lerpDt * 0.05;
      // Rotates spine slightly back/upwards on breathing in
      const breathRotX = breathCycle * 0.015;
      // Subtle chest expansion scaling
      const chestScale = 1.0 + Math.max(0, breathCycle) * 0.005;

      meshData.spineBone.rotation.x = THREE.MathUtils.lerp(meshData.spineBone.rotation.x, breathRotX, spineLerpF);
      meshData.spineBone.scale.set(
        THREE.MathUtils.lerp(meshData.spineBone.scale.x, chestScale, spineLerpF),
        THREE.MathUtils.lerp(meshData.spineBone.scale.y, 1.0, spineLerpF),
        THREE.MathUtils.lerp(meshData.spineBone.scale.z, chestScale, spineLerpF),
      );
    }

    if (groupRef.current) {
      groupRef.current.position.y = THREE.MathUtils.lerp(
        groupRef.current.position.y,
        breathCycle * 0.012,
        lerpDt * 0.04,
      );
    }

    if (!vs) return;

    // ── PATH A: OVR morph targets ─────────────────────────────────────────
    if (meshData.hasMorphs) {
      const targets = new Map<string, number>();
      OVR_NAMES.forEach(n => targets.set(n, 0));
      BLINK_NAMES.forEach(b => {
        const isLeft = b.toLowerCase().includes('left');
        targets.set(b, isLeft ? leftBlinkVal : rightBlinkVal);
      });

      if (amp > 0.005) {
        const dominant = ORACLE_TO_OVR[vs.viseme] ?? ['viseme_sil'];
        const weight   = Math.min(amp * 4.5, 1.0);
        const perShape = weight / dominant.length;
        for (const name of dominant) {
          targets.set(name, (targets.get(name) ?? 0) + perShape);
        }

        // CO_ARTIC: shape-driven secondary contributions (openness, rounded, spread)
        for (const ca of CO_ARTIC) {
          if (dominant.includes(ca.viseme)) continue;
          const contrib = (vs[ca.dimension as keyof VisemeState] as number ?? 0) * ca.scale * amp;
          if (contrib > 0.008) {
            targets.set(ca.viseme, Math.min(1, (targets.get(ca.viseme) ?? 0) + contrib));
          }
        }

        // Lip closedness driver: when mouth is not wide open, drive viseme_PP
        // (lip closure). This fires even when the primary viseme is A or C,
        // ensuring lips don't just hang open — they close between words.
        const closedness = Math.max(0, 0.55 - vs.openness);
        if (closedness > 0.08) {
          targets.set('viseme_PP', Math.min(1, (targets.get('viseme_PP') ?? 0) + closedness * amp * 1.2));
        }
      }

      const attackLerp = lerpDt * 0.58; // fast onset — crisp consonant attack
      const decayLerp  = lerpDt * 0.32; // faster decay than before — less smear

      for (const { mesh, indexMap } of meshData.meshes) {
        const infl = mesh.morphTargetInfluences!;
        for (const [name, value] of targets) {
          const idx = indexMap.get(name);
          if (idx === undefined) continue;
          const current = infl[idx];
          infl[idx] = THREE.MathUtils.lerp(current, value, value > current ? attackLerp : decayLerp);
        }
      }
      return;
    }

    // ── PATH B: No morph targets — bone jaw fallback ──────────────────────
    const bone = meshData.headBone;
    if (!bone) return;
    const targetRot = amp > 0.03 ? -amp * 0.12 : 0;
    bone.rotation.x = THREE.MathUtils.lerp(bone.rotation.x, targetRot, amp > bone.rotation.x ? lerpDt * 0.55 : lerpDt * 0.28);
  });

  return (
    <group ref={groupRef} position={[0, meshData.avatarYOffset, 0]} dispose={null}>
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

// Eager preload so GLBs are ready before the canvas mounts
useGLTF.preload('/hero3.glb?v=morphs-v2');
useGLTF.preload('/oracle-idle.glb');
useGLTF.preload('/oracle-talking-1.glb');
useGLTF.preload('/oracle-talking-2.glb');
