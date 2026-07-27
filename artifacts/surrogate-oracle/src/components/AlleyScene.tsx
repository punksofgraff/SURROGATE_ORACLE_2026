/**
 * AlleyScene.tsx
 *
 * Unified Three.js scene components: alley environment + arcade cabinet prop.
 * Both are loaded in Suspense so they never block the avatar render path.
 *
 * GLB coordinate info:
 *   alley-v3.glb   : Sketchfab export, nodes carry their own rotation/scale.
 *                    Place at position [0, -1.2, -3] scale [1.6, 1.6, 1.6].
 *   arcade-cabinet.glb : Tripo3D PBR model, ~0.95 units tall, centered at origin.
 *                        Scale [1.6, 1.6, 1.6] → ~1.5 units tall (≈ real cabinet).
 */

import React, { useRef, useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

// ── Alley Environment ─────────────────────────────────────────────────────────

export function AlleyEnvironment() {
  const { scene } = useGLTF('/alley-v3.glb');
  const groupRef = useRef<THREE.Group>(null);

  const alleyScene = useMemo(() => {
    const clone = scene.clone(true);
    clone.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        mesh.receiveShadow = true;
        mesh.castShadow = false;
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        mats.forEach((mat) => {
          if (mat instanceof THREE.MeshStandardMaterial) {
            mat.toneMapped = true;
          }
        });
      }
    });
    return clone;
  }, [scene]);

  // Subtle atmospheric breathing
  useFrame(({ clock }) => {
    if (!groupRef.current) return;
    const t = clock.elapsedTime;
    groupRef.current.position.y = -1.2 + Math.sin(t * 0.18) * 0.008;
  });

  return (
    <group ref={groupRef} position={[0, -1.2, -3]} scale={[1.6, 1.6, 1.6]}>
      <primitive object={alleyScene} />
    </group>
  );
}

// ── Arcade Cabinet ─────────────────────────────────────────────────────────────

export interface ArcadeCabinetProps {
  onPointerDown?: () => void;
}

export function ArcadeCabinet({ onPointerDown }: ArcadeCabinetProps) {
  const { scene } = useGLTF('/arcade-cabinet.glb');
  const groupRef = useRef<THREE.Group>(null);

  const cabinetScene = useMemo(() => {
    const clone = scene.clone(true);
    clone.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
    });
    return clone;
  }, [scene]);

  // Cabinet floats with a slow idle bob and slight sway
  useFrame(({ clock }) => {
    if (!groupRef.current) return;
    const t = clock.elapsedTime;
    groupRef.current.position.y = -0.25 + Math.sin(t * 0.7) * 0.015;
    groupRef.current.rotation.y = -0.28 + Math.sin(t * 0.12) * 0.03;
  });

  return (
    <group
      ref={groupRef}
      // Right of center, behind avatar plane, slight angle toward camera
      position={[0.85, -0.25, -1.8]}
      rotation={[0, -0.28, 0]}
      // Cabinet is 0.95 units tall; scale 1.6 → ~1.52 units (arcade cabinet height)
      scale={[1.6, 1.6, 1.6]}
      onPointerDown={onPointerDown}
    >
      <primitive object={cabinetScene} />
      {/* Neon glow from screen — matches Oracle green */}
      <pointLight color="#00ff88" intensity={2.0} distance={2.2} decay={2} position={[0, 0.2, 0.35]} />
      {/* Subtle underlighting — wet-floor bounce */}
      <pointLight color="#003311" intensity={0.8} distance={1.5} decay={2} position={[0, -0.5, 0]} />
    </group>
  );
}

// ── Scene Lighting ─────────────────────────────────────────────────────────────

export function AlleyLighting() {
  return (
    <>
      {/* Very dark ambient — alley barely lit by itself */}
      <ambientLight color="#050f08" intensity={0.8} />

      {/* Sky slit — faint cyan overhead from alley opening */}
      <directionalLight color="#061a10" intensity={1.1} position={[0, 8, 2]} />

      {/* Oracle face key — entity emits its own presence */}
      <pointLight color="#00ff88" intensity={2.4} distance={3.8} decay={2} position={[0, 1.5, 1.0]} />

      {/* Floor bounce — neon on wet concrete */}
      <pointLight color="#004422" intensity={1.6} distance={4.5} decay={2} position={[0, -1.0, 0]} />

      {/* Left wall contamination */}
      <pointLight color="#002233" intensity={0.9} distance={5.5} decay={2} position={[-3.5, 0.8, -1.5]} />

      {/* Right wall contamination */}
      <pointLight color="#1a0022" intensity={0.7} distance={5.5} decay={2} position={[3.5, 0.3, -1.5]} />

      {/* Deep alley terminus glow — something at the end of the corridor */}
      <pointLight color="#002211" intensity={1.2} distance={8} decay={1.5} position={[0, 0.5, -6]} />
    </>
  );
}

// Preload both assets so they are ready when scene mounts
useGLTF.preload('/alley-v3.glb');
useGLTF.preload('/arcade-cabinet.glb');
