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

// ── Clip preprocessing — strip tracks owned by procedural useFrame ────────────
//
// Rule: every bone/morph that useFrame writes to procedurally must be ABSENT
// from the AnimationClip, otherwise the mixer overwrites the procedural values
// each frame and the two systems fight each other.
//
// Owned by useFrame (strip from ALL clips):
//   head / neck bones        → procedural gaze
//   Wolf3D_Head morphTargets → real-time PCM visemes (mixer would overwrite lips)
//   arms / shoulders / hands → bind pose holds arms; clips would flail them
//   spine / hips / chest     → procedural breathing; spine sway also cascades
//                              world-space movement to arms even with arm tracks
//                              stripped — so spine must be stripped too.
//
// What clips ARE allowed to drive: legs, toes — invisible for a bust avatar.

const ARM_TRACK_RE   = /\.(LeftShoulder|RightShoulder|LeftArm|RightArm|LeftForeArm|RightForeArm|LeftHand|RightHand|LeftFinger|RightFinger)\d*/i;
const SPINE_TRACK_RE = /\.(Hips|Spine|Spine1|Spine2|UpperChest|Chest)\d*/i;
const FINGER_TRACK_RE = /\.(Left|Right)(Index|Middle|Ring|Pinky|Thumb)\d*/i;

function stripForProcedural(clip: THREE.AnimationClip): THREE.AnimationClip {
  const filtered = clip.tracks.filter((t) => {
    const node = t.name.split('.')[0].toLowerCase();
    if (node.includes('head') || node.includes('neck')) return false;
    if (ARM_TRACK_RE.test(t.name))    return false;
    if (SPINE_TRACK_RE.test(t.name))  return false;
    if (FINGER_TRACK_RE.test(t.name)) return false;
    return true;
  });
  return new THREE.AnimationClip(clip.name, clip.duration, filtered);
}

// Variant for TALKING clips: keeps arm/shoulder/hand/finger gesture tracks so
// the Mixamo-authored gestures play during speech. Strips head/neck (procedural
// gaze owns them), Wolf3D_Head morphs (PCM visemes own them), and spine/hips
// (procedural breathing owns spine — also prevents spine sway cascading into
// arms twice through the parent chain).
function stripForProceduralKeepArms(clip: THREE.AnimationClip): THREE.AnimationClip {
  const filtered = clip.tracks.filter((t) => {
    const node = t.name.split('.')[0].toLowerCase();
    if (node.includes('head') || node.includes('neck')) return false;
    if (SPINE_TRACK_RE.test(t.name)) return false;
    return true;
  });
  return new THREE.AnimationClip(clip.name, clip.duration, filtered);
}

// ── Arm rest-pose extraction ──────────────────────────────────────────────────
// Reads LOCAL quaternions from idle clip frame-0 tracks — no world-space math,
// no scene-graph timing dependency. Falls back to hardcoded RPM Mixamo values
// if the track is missing. These quats set arms hanging naturally at sides.
const ARM_REST_NAMES = [
  'LeftShoulder', 'RightShoulder',
  'LeftArm',      'RightArm',
  'LeftForeArm',  'RightForeArm',
] as const;
type ArmRestName = typeof ARM_REST_NAMES[number];

const ARM_FALLBACK_QUATS: Record<ArmRestName, readonly [number, number, number, number]> = {
  LeftShoulder:  [ 0.515890,  0.499170, -0.466506,  0.516777],
  LeftArm:       [ 0.645621,  0.018370, -0.075521,  0.759692],
  LeftForeArm:   [-0.003256,  0.000341,  0.226657,  0.973969],
  RightShoulder: [ 0.532089, -0.480237,  0.442232,  0.539151],
  RightArm:      [ 0.631738, -0.156147, -0.002799,  0.759287],
  RightForeArm:  [-0.000639,  0.000163, -0.204362,  0.978895],
};

function extractArmRestPose(clips: THREE.AnimationClip[]): Map<string, THREE.Quaternion> {
  const map = new Map<string, THREE.Quaternion>();
  const clip = clips[0];
  for (const name of ARM_REST_NAMES) {
    const key = name.toLowerCase();
    const track = clip?.tracks.find(
      (t) => t.name.split('.')[0].toLowerCase() === key && t.name.includes('quaternion'),
    );
    if (track && track.values.length >= 4) {
      map.set(key, new THREE.Quaternion(
        track.values[0], track.values[1], track.values[2], track.values[3],
      ).normalize());
    } else {
      const [x, y, z, w] = ARM_FALLBACK_QUATS[name];
      map.set(key, new THREE.Quaternion(x, y, z, w));
    }
  }
  return map;
}

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
  snap?: boolean; // when true: hard-copy camera to target this frame (no lerp), then clear
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

export function OracleAvatar3D({ visemeStateRef, cameraStateRef, seekerMotionRef }: OracleAvatar3DProps) {
  const { scene }      = useGLTF('/hero3.glb?v=morphs-v2');
  const { animations: idleClips }    = useGLTF('/oracle-idle.glb');
  const { animations: talking1Clips } = useGLTF('/oracle-talking-1.glb');
  const { animations: talking2Clips } = useGLTF('/oracle-talking-2.glb');
  const { camera } = useThree();
  const groupRef   = useRef<THREE.Group>(null);
  // Smooth camera target — avoids snapping on sudden gesture changes
  const camTarget = useRef(new THREE.Vector3(0, CAM_Y_CENTER, CAM_DEFAULT_Z));

  // Idle: strip arms so procedural pin owns them.
  // Talk: keep arm/hand/finger tracks so Mixamo gesture keyframes play during speech.
  // All: strip head/neck (gaze), morphs (PCM visemes), spine (procedural breathing).
  const armFreeIdle = useMemo(() => idleClips.map(stripForProcedural),          [idleClips]);
  const armFreeT1   = useMemo(() => talking1Clips.map(stripForProceduralKeepArms), [talking1Clips]);
  const armFreeT2   = useMemo(() => talking2Clips.map(stripForProceduralKeepArms), [talking2Clips]);

  // Extract arm rest-pose quaternions from the RAW (unstripped) idle clip tracks.
  // Frame-0 local quats give the animator's intended neutral arm pose — no world math.
  const armRestPose = useMemo(() => extractArmRestPose(idleClips), [idleClips]);

  // Smooth blend weight between rest-pose pin (1.0 = idle) and clip-driven arms
  // (0.0 = speaking). Lerped each frame so there is no snap at transition edges.
  const armPinWeightRef = useRef(1.0);

  // Animation mixer — driven by speaking state
  const { mixer } = useAnimations(
    [...armFreeIdle, ...armFreeT1, ...armFreeT2],
    groupRef,
  );

  // Biological head physics (nodding/tilting spring-damper system driven by vocal transients)
  const headPhysRef = useRef({
    nodAngle: 0,
    nodVel: 0,
    tiltAngle: 0,
    tiltVel: 0,
    lastAmp: 0,
  });

  // Forearm spring-damper state — secondary follow-through during speech gestures.
  // Each arm has an independent spring that tracks the upper arm's angular velocity
  // with a ~60-80ms lag, producing wrist/forearm overshoot as gestures land.
  // Same spring-damper pattern as head nod/tilt physics — stiffness=28, damping=5.5.
  const forearmSpringRef = useRef({
    L: { angle: 0, vel: 0 },
    R: { angle: 0, vel: 0 },
  });

  // Stateful animation crossfader with fast-attack, slow-decay amplitude envelopes
  const blendStateRef = useRef({
    currentTalkWeight: 0,
    activeTalkAction: null as THREE.AnimationAction | null,
    fadeDirection: 'idle' as 'idle' | 'talking',
    lastSpeakTime: 0,
    smoothedAmp: 0,
  });

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

  // Records clock.elapsedTime on first useFrame — used for the greeting grace period
  // that suppresses tilt physics impulses until the avatar has settled on mount.
  const mountTimeRef = useRef(-1.0);

  // ── Start idle animation on mount — 45% slower than source clip ──────────
  useEffect(() => {
    const root = groupRef.current;
    if (!root) return;

    // Bind one action per distinct clip instance to the group root.
    const idle  = armFreeIdle[0] ? mixer.clipAction(armFreeIdle[0], root) : null;
    const talk1 = armFreeT1[0]   ? mixer.clipAction(armFreeT1[0], root)   : null;
    const talk2 = armFreeT2[0]   ? mixer.clipAction(armFreeT2[0], root)   : null;
    idleActionRef.current  = idle;
    talk1ActionRef.current = talk1;
    talk2ActionRef.current = talk2;

    if (idle) {
      idle.reset().setLoop(THREE.LoopRepeat, Infinity).play();
      idle.setEffectiveWeight(1);
      idle.setEffectiveTimeScale(0.38);
    }
    // Pre-set talking action time scales too
    if (talk1) talk1.setEffectiveTimeScale(0.38);
    if (talk2) talk2.setEffectiveTimeScale(0.38);

    if (
      import.meta.env.DEV && idle &&
      (idle === talk1 || idle === talk2 || (talk1 && talk1 === talk2))
    ) {
      console.warn('[OracleAvatar3D] idle/talk actions alias — GLB clip names collide; blend will be degraded.');
    }
  }, [mixer, armFreeIdle, armFreeT1, armFreeT2]);

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
    let leftArmBone:       THREE.Object3D | null = null;
    let rightArmBone:      THREE.Object3D | null = null;
    let leftForeArmBone:   THREE.Object3D | null = null;
    let rightForeArmBone:  THREE.Object3D | null = null;

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
             window.__oracle_allMorphs = window.__oracle_allMorphs || {};
             window.__oracle_allMorphs[m.name] = keys;
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
      if (n === 'leftarm'       && !leftArmBone)       leftArmBone       = child;
      if (n === 'rightarm'      && !rightArmBone)      rightArmBone      = child;
      if (n === 'leftforearm'   && !leftForeArmBone)   leftForeArmBone   = child;
      if (n === 'rightforearm'  && !rightForeArmBone)  rightForeArmBone  = child;

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
        window.__oracle_morphDicts = result.map(({ mesh, indexMap }) => ({
          meshName: mesh.name,
          dict:     { ...mesh.morphTargetDictionary },
          resolved: Object.fromEntries(indexMap),
        }));
      } else {
        console.warn('[OracleAvatar3D] hero3.glb has no morph targets.');
        window.__oracle_morphDicts = [];
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
      leftArmBone:        leftArmBone       as THREE.Object3D | null,
      rightArmBone:       rightArmBone      as THREE.Object3D | null,
      leftForeArmBone:    leftForeArmBone   as THREE.Object3D | null,
      rightForeArmBone:   rightForeArmBone  as THREE.Object3D | null,
      hasMorphs,
      avatarYOffset,
    };
  }, [scene]);

  useFrame((state, delta) => {
    const vs     = visemeStateRef.current;
    const amp    = vs?.amplitude ?? 0;
    const lerpDt = Math.min(delta * 60, 1); // frame-rate independent
    const t      = state.clock.elapsedTime;

    // Stamp mount time on the very first frame (used by greeting grace period below)
    if (mountTimeRef.current < 0) mountTimeRef.current = t;

    // ── Animation mixer ───────────────────────────────────────────────────
    mixer.update(delta);

    // Blend idle ↔ talking based on Oracle speaking amplitude
    const idleAction    = idleActionRef.current;
    const talk1Action   = talk1ActionRef.current;
    const talk2Action   = talk2ActionRef.current;

    // Guard per-action: idle drives the base pose even if a talking clip is
    // missing/renamed, so a single bad export can't disable the whole combo.
    if (idleAction) {
      const isSpeaking = amp > 0.035;
      const talkPool = [talk1Action, talk2Action].filter(
        (a): a is THREE.AnimationAction => !!a,
      );

      const bs = blendStateRef.current;
      const now = state.clock.elapsedTime;

      if (isSpeaking) {
        bs.lastSpeakTime = now;
        if (bs.fadeDirection !== 'talking') {
          bs.fadeDirection = 'talking';
          // Pick a random talking variation if we don't have one or if the previous one finished
          if (talkPool.length > 0) {
            const chosen = talkPool[Math.floor(Math.random() * talkPool.length)];
            bs.activeTalkAction = chosen;
            chosen.reset().setLoop(THREE.LoopRepeat, Infinity).play();
          }
        }
      } else {
        // Keep gesturing for 0.45 seconds of pause between words to prevent abrupt stops
        if (bs.fadeDirection === 'talking' && now - bs.lastSpeakTime > 0.45) {
          bs.fadeDirection = 'idle';
        }
      }

      // Fast-attack, slow-decay amplitude envelope for gesturing intensity
      const envelopeTarget = bs.fadeDirection === 'talking' ? Math.max(0.4, Math.min(1.0, amp * 4.0)) : 0.0;
      if (envelopeTarget > bs.smoothedAmp) {
        bs.smoothedAmp += (envelopeTarget - bs.smoothedAmp) * Math.min(1, delta * 12.0); // fast onset
      } else {
        bs.smoothedAmp += (envelopeTarget - bs.smoothedAmp) * Math.min(1, delta * 3.5);  // slow decay gestural hang
      }

      // Blend talk weight smoothly
      const targetWeight = bs.fadeDirection === 'talking' ? bs.smoothedAmp : 0.0;
      const blendSpeed = bs.fadeDirection === 'talking' ? 8.0 : 4.0;
      bs.currentTalkWeight += (targetWeight - bs.currentTalkWeight) * Math.min(1, delta * blendSpeed);

      const tw = bs.currentTalkWeight;

      // Base idle weight is inverse of talk weight
      idleAction.setEffectiveWeight(1.0 - tw);

      // Distribute weights to talking actions, smoothly stopping inactive ones
      for (const a of talkPool) {
        if (a === bs.activeTalkAction) {
          a.setEffectiveWeight(tw);
          // Ensure it is playing if weight is non-zero
          if (tw > 0.01 && !a.isRunning()) {
            a.play();
          }
        } else {
          // Crossfade and stop other talking clips
          const currentWeight = a.getEffectiveWeight();
          if (currentWeight > 0.01) {
            a.setEffectiveWeight(THREE.MathUtils.lerp(currentWeight, 0, Math.min(1, delta * 8.0)));
          } else {
            a.setEffectiveWeight(0);
            a.stop();
          }
        }
      }

      // Clean up when fully transitioned back to idle
      if (tw <= 0.002 && bs.fadeDirection === 'idle') {
        if (bs.activeTalkAction) {
          bs.activeTalkAction.stop();
          bs.activeTalkAction = null;
        }
      }
    }

    // ── Camera: parallax look-around + pinch zoom ─────────────────────────
    if (cameraStateRef?.current) {
      const cs = cameraStateRef.current;
      const targetZ = Math.min(CAM_DEFAULT_Z, Math.max(CAM_MIN_Z, CAM_DEFAULT_Z / Math.max(cs.zoom, 1)));
      camTarget.current.set(cs.x * CAM_X_RANGE, CAM_Y_CENTER - cs.y * CAM_Y_RANGE, targetZ);
      if (cs.snap) {
        // Hard-snap: avatar materialises centred every time — no lerp-in drift from
        // stale knife-tap offset during the 1.8s opacity fade-in.
        camera.position.copy(camTarget.current);
        cameraStateRef.current = { ...cs, snap: false };
      } else {
        camera.position.lerp(camTarget.current, CAM_LERP * lerpDt);
      }
    } else {
      camera.position.lerp(camTarget.current, CAM_LERP * lerpDt);
    }
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
      const { facePos, hasFace, touchPos, hasTouch, touchGazeSuppressedUntil } = seekerMotionRef.current;

      // Priority: face (camera) > touch position > parallax/mouse (default seekerX/Y)
      // NOTE: phoneTilt is NOT used for head gaze — tilt drives the cabinet CSS transform
      // in useParallax, so using it here too would make head+cabinet move in lockstep
      // (zero Mona Lisa effect). Touch position is screen-relative and independent.

      // Suppress stale touch gaze for the first ~1.8s of oracle entry so the knife-selection
      // tap doesn't make the avatar appear right-shifted on manifestation.
      const touchActive = hasTouch && performance.now() >= (touchGazeSuppressedUntil ?? 0);

      if (hasFace) {
        if (touchActive) {
          // Mobile with camera: face (50%) + touch position (30%) + parallax (20%)
          seekerX = facePos.x * 0.50 + touchPos.x * 0.30 + seekerX * 0.20;
          seekerY = facePos.y * 0.50 + touchPos.y * 0.30 + seekerY * 0.20;
        } else {
          // Desktop with camera: face (65%) + parallax/mouse (35%)
          seekerX = facePos.x * 0.65 + seekerX * 0.35;
          seekerY = facePos.y * 0.65 + seekerY * 0.35;
        }
      } else if (touchActive) {
        // Mobile without camera: touch position (80%) + parallax (20%)
        // Touch pos IS the Mona Lisa signal on mobile — avatar looks toward finger.
        seekerX = touchPos.x * 0.80 + seekerX * 0.20;
        seekerY = touchPos.y * 0.80 + seekerY * 0.20;
      }
      // else: no touch, no face → seekerX/Y stays as parallax/mouse (desktop default)
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
      // eyeball scaling removed to avoid deflating grape bug
    }
    if (meshData.rightEyeBone) {
      meshData.rightEyeBone.rotation.y = THREE.MathUtils.lerp(meshData.rightEyeBone.rotation.y, finalEyeX, eyeLerpF);
      meshData.rightEyeBone.rotation.x = THREE.MathUtils.lerp(meshData.rightEyeBone.rotation.x, finalEyeY, eyeLerpF);
      // eyeball scaling removed to avoid deflating grape bug
    }

    // ── Head: organic conversational movement ─────────────────────────────
    if (meshData.headBone) {
      // speakPresence: 0 when silent/listening → 1 when Oracle is mid-delivery.
      // Ramps up fast (currentTalkWeight × 2.5 saturates at 1 by ~40% talk weight)
      // and decays at the same rate as currentTalkWeight (slow gestural hang).
      // Used to gate/dampen anything that fights direct eye contact during speech.
      const speakPresence = Math.min(1.0, blendStateRef.current.currentTalkWeight * 2.5);

      // headLerpF: faster tracking while speaking so head settles on seeker quickly
      const headLerpF = lerpDt * (0.12 + speakPresence * 0.12); // 0.12 idle → 0.24 speaking
      const hp = headPhysRef.current;
      const dt = Math.min(delta, 0.03); // clamp to avoid physics explosion during lag

      // 1. Calculate positive amplitude changes (attacks/onset of speech syllables).
      // Clamp to 0.025 so the first-word amplitude spike (0 → 0.2+ in one frame)
      // can't launch the physics into a large oscillation.
      const ampDiffRaw = Math.max(0, amp - hp.lastAmp);
      const ampDiff    = Math.min(ampDiffRaw, 0.025);
      hp.lastAmp = amp;

      // 2. Drive physics velocity with speech transients (emphasis impulses).
      if (amp > 0.035) {
        // Sudden volume increases cause a downward nod impulse
        hp.nodVel -= ampDiff * 2.8;

        // Tilt left/right randomly based on emphasis.
        // Grace period: suppress tilt for first 2 s after mount so the opening
        // greeting doesn't trigger max-headroom oscillation before the avatar settles.
        // Also suppressed while speakPresence is high — mid-delivery the head should
        // hold toward the seeker, not tilt from emphasis bursts.
        const graceElapsed = t - mountTimeRef.current;
        if (ampDiff > 0.01 && Math.random() < 0.5 && graceElapsed > 2.0 && speakPresence < 0.6) {
          hp.tiltVel += (Math.random() - 0.5) * ampDiff * 3.5;
        }
      }

      // 3. Spring forces pulling back to baseline
      // If speaking, lean slightly forward (nodding down target)
      const targetNodBaseline = amp > 0.035 ? -0.06 * Math.min(1.0, amp * 4) : 0;
      const targetTiltBaseline = 0;

      // Nod spring (Stiffness = 32, damping = 6.2 for snappy but damped response)
      const forceNod = (targetNodBaseline - hp.nodAngle) * 32.0 - hp.nodVel * 6.2;
      hp.nodVel += forceNod * dt;
      hp.nodAngle += hp.nodVel * dt;

      // Tilt spring — damping raised to 7.5 (ζ≈0.77, near-critical).
      // Previous value 5.0 (ζ≈0.51) was visibly underdamped; greeting bursts
      // caused multi-cycle oscillation that read as "looking around".
      const forceTilt = (targetTiltBaseline - hp.tiltAngle) * 24.0 - hp.tiltVel * 7.5;
      hp.tiltVel += forceTilt * dt;
      hp.tiltAngle += hp.tiltVel * dt;

      // 4. Combine with parallax gaze and alive idle drift
      let tx = gx * 0.45;
      let ty = gy * 0.32;
      let tz = 0;

      // Alive idle drift — two incommensurate freqs (~0.11Hz + ~0.18Hz).
      // Scaled down during speech so the head stays on the seeker mid-delivery.
      // ~18% of drift survives at peak speakPresence (not robotic, just quieter).
      const driftScale = 1 - speakPresence * 0.82;
      tx += (Math.sin(t * 0.71 + 0.4) * 0.025 + Math.sin(t * 1.13 + 1.7) * 0.016) * driftScale;
      
      // Apply biological physics offsets to head rotation
      ty += hp.nodAngle;
      tz += hp.tiltAngle;

      // Subtle slow roll on head rotation
      tz += Math.cos(t * 0.57 + 0.9) * 0.020;

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
    // Speed is constant — do NOT link to amp. Amplitude-linked breathing
    // makes the whole avatar bob faster during speech, which reads visually
    // as the body "moving with the lips". Constant rate keeps it life-like
    // without tracking the voice.
    const breathSpeed = 1.35;
    const breathCycle = Math.sin(t * breathSpeed);

    if (meshData.spineBone) {
      const spineLerpF = lerpDt * 0.05;
      // Rotates spine slightly back/upwards on breathing in
      const breathRotX = breathCycle * 0.015;

      // Rhetorical forward lean based on speaking intensity (tw) and current amplitude
      const bs = blendStateRef.current;
      const tw = bs.currentTalkWeight;
      const speakLeanX = -0.055 * tw * Math.min(1.0, amp * 4.0);
      const speakSwayZ = Math.sin(t * 1.5) * 0.035 * tw;

      // Subtle chest expansion scaling
      const chestScale = 1.0 + Math.max(0, breathCycle) * 0.005;

      meshData.spineBone.rotation.x = THREE.MathUtils.lerp(meshData.spineBone.rotation.x, breathRotX + speakLeanX, spineLerpF);
      meshData.spineBone.rotation.z = THREE.MathUtils.lerp(meshData.spineBone.rotation.z, speakSwayZ, spineLerpF);
      meshData.spineBone.scale.set(
        THREE.MathUtils.lerp(meshData.spineBone.scale.x, chestScale, spineLerpF),
        THREE.MathUtils.lerp(meshData.spineBone.scale.y, 1.0, spineLerpF),
        THREE.MathUtils.lerp(meshData.spineBone.scale.z, chestScale, spineLerpF),
      );
    }

    if (groupRef.current) {
      groupRef.current.position.y = THREE.MathUtils.lerp(
        groupRef.current.position.y,
        breathCycle * 0.005,
        lerpDt * 0.04,
      );
    }

    // ── Arm rest-pose pin + shoulder breathing + forearm spring ──────────────
    // Arm pin: smoothly blend between rest-pose (idle) and clip-driven (speech).
    // armPinWeightRef lerps toward 0 when speaking so talk-clip gesture tracks
    // take over, then back to 1 when silent to re-pin to the neutral at-sides pose.
    {
      const bs = blendStateRef.current;
      const tw = bs.currentTalkWeight;
      const targetPin = 1.0 - tw;
      armPinWeightRef.current += (targetPin - armPinWeightRef.current) * Math.min(1, delta * 8.0);
      const w = armPinWeightRef.current;
      if (w > 0.005) {
        const armBoneMap: Array<[THREE.Object3D | null, string]> = [
          [meshData.leftShoulderBone,  'leftshoulder'],
          [meshData.rightShoulderBone, 'rightshoulder'],
          [meshData.leftArmBone,       'leftarm'],
          [meshData.rightArmBone,      'rightarm'],
          [meshData.leftForeArmBone,   'leftforearm'],
          [meshData.rightForeArmBone,  'rightforearm'],
        ];
        for (const [bone, key] of armBoneMap) {
          const q = armRestPose.get(key);
          if (bone && q) (bone as THREE.Bone).quaternion.slerp(q, w);
        }

        // ── Shoulder breathing cascade ─────────────────────────────────────
        // Additive on top of the rest-pose slerp: shoulders subtly follow the
        // spine's breathCycle. Left leads right by a ~0.4s phase offset,
        // mimicking the natural asymmetric sway of a person standing still.
        // All deltas are scaled by w so they vanish smoothly during speech.
        const shoulderBreathe = breathCycle * 0.006 * w;
        // Right side uses a slightly delayed breathCycle (phase -0.54 rad ≈ 0.4s at 1.35Hz)
        const rightBreathe    = Math.sin(t * breathSpeed - 0.54) * 0.006 * w;
        const weightShiftL    =  Math.sin(t * 0.94)        * 0.004 * w;
        const weightShiftR    = -Math.sin(t * 0.94 + 0.50) * 0.004 * w;

        if (meshData.leftShoulderBone) {
          (meshData.leftShoulderBone  as THREE.Bone).rotation.y +=  shoulderBreathe;
          (meshData.leftShoulderBone  as THREE.Bone).rotation.z +=  weightShiftL;
        }
        if (meshData.rightShoulderBone) {
          (meshData.rightShoulderBone as THREE.Bone).rotation.y -= rightBreathe * 0.7;
          (meshData.rightShoulderBone as THREE.Bone).rotation.z +=  weightShiftR;
        }
      }

      // ── Forearm spring follow-through during speech ────────────────────────
      // When the gesture clip drives the upper arm, the forearm adds a lagged
      // spring response — same spring-damper pattern as head nod/tilt physics.
      // stiffness=28, damping=5.5: underdamped (ζ≈0.52) for visible follow-through.
      // The spring target is proportional to the upper arm's Y rotation so the
      // forearm lags behind gestures and overshoots slightly before settling.
      const fs    = forearmSpringRef.current;
      const armDt = Math.min(delta, 0.03);

      if (tw > 0.02) {
        const lArmY = meshData.leftArmBone  ? (meshData.leftArmBone  as THREE.Bone).rotation.y : 0;
        const rArmY = meshData.rightArmBone ? (meshData.rightArmBone as THREE.Bone).rotation.y : 0;

        // Left forearm spring
        const forceL  = (lArmY * 0.12 - fs.L.angle) * 28 - fs.L.vel * 5.5;
        fs.L.vel      += forceL * armDt;
        fs.L.angle    += fs.L.vel * armDt;
        fs.L.angle     = THREE.MathUtils.clamp(fs.L.angle, -0.08, 0.08);
        if (meshData.leftForeArmBone) {
          (meshData.leftForeArmBone  as THREE.Bone).rotation.z += fs.L.angle * tw;
        }

        // Right forearm spring (mirror)
        const forceR  = (rArmY * 0.12 - fs.R.angle) * 28 - fs.R.vel * 5.5;
        fs.R.vel      += forceR * armDt;
        fs.R.angle    += fs.R.vel * armDt;
        fs.R.angle     = THREE.MathUtils.clamp(fs.R.angle, -0.08, 0.08);
        if (meshData.rightForeArmBone) {
          (meshData.rightForeArmBone as THREE.Bone).rotation.z += fs.R.angle * tw;
        }
      } else {
        // Decay spring naturally when idle — no hard reset so there's no snap
        // on the first frame of speech; spring just stops being fed and dies out.
        const decay = Math.max(0, 1 - armDt * 8);
        fs.L.vel *= decay;  fs.L.angle *= decay;
        fs.R.vel *= decay;  fs.R.angle *= decay;
      }
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
