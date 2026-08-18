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
}

/** Volume the shards are allowed to roam (cabinet interior, behind the bust). */
const HOME = new THREE.Vector3(0, 0.1, -0.55);
const ROAM_RADIUS = 0.85;

export function OraclePhysicsDebris({ count, speakingRef }: OraclePhysicsDebrisProps) {
  const bodiesRef = useRef<(RapierRigidBody | null)[] | null>(null);
  const wasSpeakingRef = useRef(false);

  const instances = useMemo<InstancedRigidBodyProps[]>(() => {
    const list: InstancedRigidBodyProps[] = [];
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const r = 0.35 + Math.random() * 0.4;
      list.push({
        key: `oracle-shard-${i}`,
        position: [
          HOME.x + Math.cos(angle) * r,
          HOME.y + (Math.random() - 0.5) * 0.9,
          HOME.z + (Math.random() - 0.5) * 0.25,
        ],
        rotation: [Math.random() * Math.PI, Math.random() * Math.PI, 0],
        linearVelocity: [
          -Math.sin(angle) * 0.05,
          (Math.random() - 0.5) * 0.03,
          0,
        ],
        angularVelocity: [
          (Math.random() - 0.5) * 0.8,
          (Math.random() - 0.5) * 0.8,
          (Math.random() - 0.5) * 0.8,
        ],
      });
    }
    return list;
  }, [count]);

  // Scratch vectors reused per frame — no allocation in the hot loop.
  const scratch = useMemo(() => ({ pos: new THREE.Vector3(), force: new THREE.Vector3() }), []);

  useFrame(() => {
    const bodies = bodiesRef.current;
    if (!bodies) return;

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

      // Spring toward the roam shell: pulled back when outside, gently stirred
      // tangentially when deep inside so the field keeps drifting.
      if (dist > ROAM_RADIUS) {
        scratch.force.normalize().multiplyScalar(0.000035 * (dist - ROAM_RADIUS + 0.2));
        body.applyImpulse(scratch.force, true);
      } else if (dist > 1e-4) {
        // tangential stir: cross with up vector
        scratch.force.normalize();
        const tx = scratch.force.z, tz = -scratch.force.x;
        scratch.force.set(tx, 0, tz).multiplyScalar(0.0000012);
        body.applyImpulse(scratch.force, true);
      }

      // Speaking pulse — single outward kick on the rising edge.
      if (speakingEdge && dist > 1e-4) {
        scratch.force.set(t.x - HOME.x, t.y - HOME.y, t.z - HOME.z)
          .normalize()
          .multiplyScalar(0.000012);
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
      linearDamping={0.6}
      angularDamping={0.15}
      canSleep={false}
    >
      <instancedMesh args={[undefined, undefined, count]} count={count} frustumCulled={false}>
        <tetrahedronGeometry args={[0.028, 0]} />
        <meshStandardMaterial
          color="#0a2018"
          emissive="#00ff88"
          emissiveIntensity={1.6}
          roughness={0.35}
          metalness={0.4}
          transparent
          opacity={0.85}
        />
      </instancedMesh>
    </InstancedRigidBodies>
  );
}
