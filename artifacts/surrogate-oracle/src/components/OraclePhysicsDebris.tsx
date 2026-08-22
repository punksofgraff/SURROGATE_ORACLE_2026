/**
 * OraclePhysicsDebris — Rapier-driven glyph shards orbiting the Oracle cabinet.
 *
 * A handful of small emissive tetrahedron shards drift in the cabinet volume,
 * governed by real rigid-body physics (zero gravity + per-frame attraction
 * impulses toward a slow orbit path). When the Oracle speaks, each shard gets
 * a subtle outward pulse so the debris field visibly "charges".
 *
 * Constraints:
 *   - InstancedRigidBodies → single draw call for all shards.
 *   - Colliders are balls (cheapest narrow-phase); shards may softly collide.
 *   - Fixed timestep comes from <Physics timeStep={1/60}> in the parent —
 *     framerate drops never destabilize the simulation.
 *   - Shards live at z ≤ -0.3, behind the avatar bust — never occlude the face.
 *   - Speaking state read from a ref inside useFrame; zero React re-renders.
 */
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  InstancedRigidBodies,
  type InstancedRigidBodyProps,
  type RapierRigidBody,
} from '@react-three/rapier';
import * as THREE from 'three';

interface OraclePhysicsDebrisProps {
  /** Number of shards — tier-scaled by the parent. */
  count: number;
  /** Live "oracle is speaking" flag. */
  speakingRef: React.RefObject<boolean>;
  musicActive?: boolean;
  getAnalyser?: () => AnalyserNode | null;
}

/** Volume the shards are allowed to roam (cabinet perimeter surrounding the bust). */
const HOME = new THREE.Vector3(0, 0.05, -0.38);
const ROAM_RADIUS = 1.05;

export function OraclePhysicsDebris({ count, speakingRef, musicActive = false, getAnalyser }: OraclePhysicsDebrisProps) {
  const bodiesRef = useRef<(RapierRigidBody | null)[] | null>(null);
  const wasSpeakingRef = useRef(false);
  const audioDataRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const energyRef = useRef(0.08);
  const bassRef = useRef(0.08);

  const instances = useMemo<InstancedRigidBodyProps[]>(() => {
    const list: InstancedRigidBodyProps[] = [];
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      // A filled ellipsoid, not a flat orbit ring. The Rapier bodies provide
      // the depth and the shader/GLB fields provide the fine grain.
      const r = Math.cbrt(Math.random()) * 1.15;
      list.push({
        key: `oracle-shard-${i}`,
        position: [
           HOME.x + Math.cos(angle) * r,
           HOME.y + (Math.random() - 0.5) * 1.35 * r,
           HOME.z + Math.sin(angle) * r * 0.72,
        ],
        rotation: [Math.random() * Math.PI, Math.random() * Math.PI, 0],
        linearVelocity: [
           -Math.sin(angle) * 0.08,
          (Math.random() - 0.5) * 0.05,
          0,
        ],
        angularVelocity: [
          (Math.random() - 0.5) * 1.2,
          (Math.random() - 0.5) * 1.2,
          (Math.random() - 0.5) * 1.2,
        ],
      });
    }
    return list;
  }, [count]);

  // Scratch vectors reused per frame — no allocation in the hot loop.
  const scratch = useMemo(() => ({
    pos: new THREE.Vector3(),
    force: new THREE.Vector3(),
    velocity: new THREE.Vector3(),
  }), []);

  useFrame(() => {
    const bodies = bodiesRef.current;
    if (!bodies) return;
    if (typeof window !== 'undefined') {
      const win = window as unknown as { __oracle_scene_probe?: Record<string, unknown> };
      const probe = win.__oracle_scene_probe ?? {};
      probe.debrisUpdates = ((probe.debrisUpdates as number) ?? 0) + 1;
      probe.activeDebris = bodies.reduce((count, body) => count + (body && !body.isSleeping() ? 1 : 0), 0);
      win.__oracle_scene_probe = probe;
    }

    let energy = 0.08;
    let bass = 0.08;
    const analyser = musicActive ? getAnalyser?.() : null;
    if (analyser) {
      if (!audioDataRef.current || audioDataRef.current.length !== analyser.frequencyBinCount) {
        audioDataRef.current = new Uint8Array(analyser.frequencyBinCount) as Uint8Array<ArrayBuffer>;
      }
      analyser.getByteFrequencyData(audioDataRef.current);
      const data = audioDataRef.current;
      const lowBins = Math.max(1, Math.floor(data.length * 0.12));
      let total = 0;
      let lowTotal = 0;
      for (let i = 0; i < data.length; i++) {
        total += data[i] ?? 0;
        if (i < lowBins) lowTotal += data[i] ?? 0;
      }
      energy = total / data.length / 255;
      bass = lowTotal / lowBins / 255;
    }
    energyRef.current = THREE.MathUtils.lerp(energyRef.current, energy, 0.12);
    bassRef.current = THREE.MathUtils.lerp(bassRef.current, bass, 0.18);

    const speaking = !!speakingRef.current;
    const speakingEdge = speaking && !wasSpeakingRef.current;
    wasSpeakingRef.current = speaking;

    for (let i = 0; i < bodies.length; i++) {
      const body = bodies[i];
      if (!body || body.isSleeping()) continue;

      const t = body.translation();
      scratch.pos.set(t.x, t.y, t.z);
      scratch.force.copy(HOME).sub(scratch.pos);
      const dist = scratch.force.length();

      // Spring toward the roam shell, with a persistent tangential velocity
      // target. The old micro-impulse was quickly erased by Rapier damping:
      // shards moved during the entrance/speaking impulse, then settled into a
      // visually frozen ring even though the frame loop was still alive.
       const musicEnergy = musicActive ? energyRef.current : 0;
       const musicBass = musicActive ? bassRef.current : 0;
       const shell = ROAM_RADIUS + musicEnergy * 0.45;
       if (dist > shell) {
         scratch.force.normalize().multiplyScalar(0.00010 * (dist - shell + 0.2));
        body.applyImpulse(scratch.force, true);
      } else if (dist > 1e-4) {
        // Tangential orbit with a small radial correction back toward HOME.
        scratch.force.normalize();
        const tx = scratch.force.z, tz = -scratch.force.x;
         scratch.velocity.set(tx * (0.12 + musicEnergy * 0.24), (Math.sin(i + performance.now() * 0.001) * musicEnergy * 0.03), tz * (0.12 + musicEnergy * 0.24));
        const current = body.linvel();
        scratch.force.set(
          scratch.velocity.x - current.x,
          -current.y * 0.35,
          scratch.velocity.z - current.z,
        ).multiplyScalar(0.10);
        body.applyImpulse(scratch.force, true);
      }

      // Speaking reactions:
      // 1. Rising edge impulse: noticeable outward blast wave from the center.
      if (speakingEdge && dist > 1e-4) {
        scratch.force.set(t.x - HOME.x, t.y - HOME.y, t.z - HOME.z)
          .normalize()
          .multiplyScalar(0.00028);
        body.applyImpulse(scratch.force, true);
      }
      // 2. Active speech excitation: subtle continuous spin & energy agitation
      if (speaking) {
        scratch.force.set(
          (Math.random() - 0.5) * 0.000025,
          (Math.random() - 0.5) * 0.000025,
          (Math.random() - 0.5) * 0.000025,
        );
        body.applyImpulse(scratch.force, true);
      }
       if (musicActive) {
         // Bass is a depth impulse: the cloud breathes outward on the z axis
         // while sustained energy keeps the volume orbiting rather than settling.
         scratch.force.set(
           (t.x - HOME.x) * musicBass * 0.00018,
           (t.y - HOME.y) * musicEnergy * 0.00012,
           (t.z - HOME.z) * (musicBass * 0.00042 + musicEnergy * 0.00008),
         );
         body.applyImpulse(scratch.force, true);
       }
    }
  });

  return (
    <InstancedRigidBodies
      ref={bodiesRef}
      instances={instances}
      colliders="ball"
      gravityScale={0}
      linearDamping={0.55}
      angularDamping={0.12}
      canSleep={false}
    >
      <instancedMesh args={[undefined, undefined, count]} count={count} frustumCulled={false}>
        <tetrahedronGeometry args={[0.072, 0]} />
        <meshStandardMaterial
          color="#0f2b1d"
          emissive="#00ff88"
          emissiveIntensity={3.2}
          roughness={0.2}
          metalness={0.65}
          transparent
          opacity={musicActive ? 0.82 : 0.95}
        />
      </instancedMesh>
    </InstancedRigidBodies>
  );
}
