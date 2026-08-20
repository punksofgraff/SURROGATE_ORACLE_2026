import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';

export function OracleMusicVisualizer({
  getAnalyser,
  reducedMotion = false,
}: {
  getAnalyser: () => AnalyserNode | null;
  reducedMotion?: boolean;
}) {
  const pointsRef = useRef<THREE.Points>(null);
  const dataRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const positions = useMemo(() => {
    const values = new Float32Array(900 * 3);
    for (let i = 0; i < 900; i++) {
      const radius = 0.36 + Math.random() * 1.25;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      values[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
      values[i * 3 + 1] = radius * Math.cos(phi);
      values[i * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);
    }
    return values;
  }, []);
  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    return g;
  }, [positions]);

  useFrame((state) => {
    const points = pointsRef.current;
    if (!points) return;
    const analyser = getAnalyser();
    if (analyser) {
      if (!dataRef.current || dataRef.current.length !== analyser.frequencyBinCount) dataRef.current = new Uint8Array(analyser.frequencyBinCount) as Uint8Array<ArrayBuffer>;
      analyser.getByteFrequencyData(dataRef.current);
    }
    const average = dataRef.current ? dataRef.current.reduce((sum, value) => sum + value, 0) / dataRef.current.length / 255 : 0.1;
    const t = reducedMotion ? 0 : state.clock.elapsedTime;
    points.rotation.y = t * 0.08;
    points.rotation.x = Math.sin(t * 0.17) * 0.12;
    points.scale.setScalar(0.9 + average * 0.75);
    const material = points.material as THREE.PointsMaterial;
    material.opacity = 0.35 + average * 0.65;
  });

  return (
    <points ref={pointsRef} geometry={geometry}>
      <pointsMaterial color="#c43cff" size={0.018} transparent opacity={0.8} blending={THREE.AdditiveBlending} depthWrite={false} />
    </points>
  );
}