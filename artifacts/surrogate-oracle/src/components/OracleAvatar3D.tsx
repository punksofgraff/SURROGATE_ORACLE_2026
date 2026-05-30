import React, { useRef, useEffect } from 'react';
import { useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface OracleAvatar3DProps {
  amplitude: number;
  viseme: string;
}

export function OracleAvatar3D({ amplitude, viseme }: OracleAvatar3DProps) {
  const { scene, nodes, materials } = useGLTF('/hero3.glb');
  const group = useRef<THREE.Group>(null);

  // Example generic viseme mapping (adjust based on the specific morph targets in hero3.glb)
  const visemeMap: Record<string, number> = {
    A: 0, E: 1, I: 2, O: 3, U: 4, 
    // Fallbacks
    X: 0, B: 0, C: 1, D: 1, F: 4, G: 2, H: 0,
  };

  useFrame((state, delta) => {
    // 1. Find the head mesh (you might need to log `nodes` to find the exact name)
    // Assuming the morph targets are on the first SkinnedMesh for now
    let headMesh: THREE.SkinnedMesh | null = null;
    scene.traverse((child) => {
      if ((child as THREE.SkinnedMesh).isSkinnedMesh && (child as THREE.SkinnedMesh).morphTargetDictionary) {
        headMesh = child as THREE.SkinnedMesh;
      }
    });

    if (headMesh && headMesh.morphTargetInfluences) {
      // 2. Reset all morph targets
      const influenceCount = headMesh.morphTargetInfluences.length;
      for (let i = 0; i < influenceCount; i++) {
        // Smoothly decay influences back to 0
        headMesh.morphTargetInfluences[i] = THREE.MathUtils.lerp(headMesh.morphTargetInfluences[i], 0, 10 * delta);
      }

      // 3. Apply current viseme based on amplitude
      const targetIndex = visemeMap[viseme] ?? 0;
      
      // Ensure the target index exists in the model
      if (targetIndex < influenceCount) {
         // Apply amplitude to the target blendshape
         headMesh.morphTargetInfluences[targetIndex] = THREE.MathUtils.lerp(
             headMesh.morphTargetInfluences[targetIndex], 
             Math.min(amplitude * 2.0, 1.0), // Scale amplitude up slightly
             15 * delta
         );
      }
    }

    // Optional: Subtle idle breathing animation on the root group
    if (group.current) {
        group.current.position.y = Math.sin(state.clock.elapsedTime * 1.5) * 0.01 - 1.5; // Offset Y slightly
    }
  });

  return (
    <group ref={group} dispose={null}>
      <primitive object={scene} />
      
      {/* Cyberpunk Lighting */}
      <ambientLight intensity={0.2} color="#00ff88" />
      <directionalLight position={[0, 2, 5]} intensity={1.5} color="#ffffff" />
      <spotLight position={[-3, 3, 3]} angle={0.3} penumbra={1} intensity={2} color="#b026ff" />
      <spotLight position={[3, -2, 2]} angle={0.5} penumbra={1} intensity={1} color="#00ccff" />
    </group>
  );
}

useGLTF.preload('/hero3.glb');
