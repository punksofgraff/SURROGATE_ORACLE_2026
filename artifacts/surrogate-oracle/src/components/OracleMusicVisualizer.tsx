import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';

const PARTICLE_COUNT = 1800;

const MUSIC_VERTEX_SHADER = /* glsl */ `
  uniform float uAudioTime;
  uniform float uEnergy;
  uniform float uPulse;
  uniform float uMotion;
  attribute float aRadius;
  attribute float aPhase;
  attribute float aSpeed;
  attribute float aSize;
  varying float vEnergy;
  varying float vDepth;

  void main() {
    float phase = aPhase + uAudioTime * aSpeed * uMotion;
    float orbit = phase * (0.22 + aRadius * 0.08);
    float pulse = 1.0 + uPulse * (0.22 + aRadius * 0.16);
    float shell = aRadius * pulse;
    vec3 pos = vec3(
      cos(orbit + aPhase) * shell,
      sin(orbit * 0.73 + aPhase * 1.7) * shell * 0.82,
      sin(orbit + aPhase) * shell * 0.72
    );
    pos += vec3(
      sin(phase * 1.7 + aPhase) * 0.08,
      cos(phase * 1.2 + aPhase) * 0.08,
      sin(phase * 0.9 + aPhase * 2.0) * 0.12
    ) * (0.25 + uEnergy);

    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    gl_PointSize = aSize * (1.0 + uEnergy * 1.8 + uPulse * 0.9) * (280.0 / -mvPosition.z);
    vEnergy = uEnergy + uPulse * 0.7;
    vDepth = clamp(1.0 - (-mvPosition.z / 4.0), 0.25, 1.0);
  }
`;

const MUSIC_FRAGMENT_SHADER = /* glsl */ `
  varying float vEnergy;
  varying float vDepth;

  void main() {
    vec2 point = gl_PointCoord - vec2(0.5);
    float distanceFromCenter = length(point);
    if (distanceFromCenter > 0.5) discard;
    float core = exp(-distanceFromCenter * distanceFromCenter * 24.0);
    float halo = exp(-distanceFromCenter * distanceFromCenter * 5.0) * 0.7;
    vec3 color = mix(vec3(0.0, 1.0, 0.8), vec3(0.77, 0.18, 1.0), clamp(vEnergy * 0.65, 0.0, 1.0));
    float alpha = (core + halo) * (0.32 + vEnergy * 0.72) * vDepth;
    gl_FragColor = vec4(color * (core * 1.7 + 0.35), alpha);
  }
`;

export function OracleMusicVisualizer({
  getAnalyser,
  getAudioTime,
  reducedMotion = false,
}: {
  getAnalyser: () => AnalyserNode | null;
  /** Current Lyria media timestamp in seconds, when the audio element is active. */
  getAudioTime?: () => number;
  reducedMotion?: boolean;
}) {
  const pointsRef = useRef<THREE.Points>(null);
  const dataRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const smoothEnergyRef = useRef(0.08);
  const pulseRef = useRef(0);
  const previousEnergyRef = useRef(0.08);
  const audioTimeRef = useRef(0);

  const attributes = useMemo(() => {
    const positionValues = new Float32Array(PARTICLE_COUNT * 3);
    const radiusValues = new Float32Array(PARTICLE_COUNT);
    const phaseValues = new Float32Array(PARTICLE_COUNT);
    const speedValues = new Float32Array(PARTICLE_COUNT);
    const sizeValues = new Float32Array(PARTICLE_COUNT);
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      positionValues[i * 3] = 0;
      positionValues[i * 3 + 1] = 0;
      positionValues[i * 3 + 2] = 0;
      radiusValues[i] = 0.28 + Math.pow(Math.random(), 0.7) * 1.35;
      phaseValues[i] = Math.random() * Math.PI * 2;
      speedValues[i] = 0.55 + Math.random() * 1.4;
      sizeValues[i] = 1.1 + Math.random() * 2.8;
    }
    return { positionValues, radiusValues, phaseValues, speedValues, sizeValues };
  }, []);

  const geometry = useMemo(() => {
    const next = new THREE.BufferGeometry();
    next.setAttribute('position', new THREE.BufferAttribute(attributes.positionValues, 3));
    next.setAttribute('aRadius', new THREE.BufferAttribute(attributes.radiusValues, 1));
    next.setAttribute('aPhase', new THREE.BufferAttribute(attributes.phaseValues, 1));
    next.setAttribute('aSpeed', new THREE.BufferAttribute(attributes.speedValues, 1));
    next.setAttribute('aSize', new THREE.BufferAttribute(attributes.sizeValues, 1));
    return next;
  }, [attributes]);

  const uniforms = useMemo(() => ({
    uAudioTime: { value: 0 },
    uEnergy: { value: 0.08 },
    uPulse: { value: 0 },
    uMotion: { value: reducedMotion ? 0.25 : 1 },
  }), [reducedMotion]);

  useFrame((state, delta) => {
    const points = pointsRef.current;
    if (!points) return;

    const analyser = getAnalyser();
    let average = 0.08;
    let bass = 0.08;
    if (analyser) {
      if (!dataRef.current || dataRef.current.length !== analyser.frequencyBinCount) {
        dataRef.current = new Uint8Array(analyser.frequencyBinCount) as Uint8Array<ArrayBuffer>;
      }
      analyser.getByteFrequencyData(dataRef.current);
      const data = dataRef.current;
      const lowBins = Math.max(1, Math.floor(data.length * 0.12));
      let total = 0;
      let lowTotal = 0;
      for (let i = 0; i < data.length; i++) {
        total += data[i] ?? 0;
        if (i < lowBins) lowTotal += data[i] ?? 0;
      }
      average = total / data.length / 255;
      bass = lowTotal / lowBins / 255;
       const mediaTime = getAudioTime?.() ?? 0;
       audioTimeRef.current = mediaTime > 0
         ? mediaTime
         : typeof analyser.context.currentTime === 'number'
           ? analyser.context.currentTime
           : state.clock.elapsedTime;
    } else {
       audioTimeRef.current = getAudioTime?.() || state.clock.elapsedTime;
    }

    const energy = average * 0.65 + bass * 0.35;
    const smoothEnergy = THREE.MathUtils.lerp(
      smoothEnergyRef.current,
      energy,
      Math.min(1, delta * 8),
    );
    const risingEdge = Math.max(0, energy - previousEnergyRef.current);
    pulseRef.current = Math.max(
      pulseRef.current * Math.exp(-delta * (reducedMotion ? 4 : 8)),
      risingEdge > 0.035 ? Math.min(1, bass + risingEdge * 4) : 0,
    );
    smoothEnergyRef.current = smoothEnergy;
    previousEnergyRef.current = energy;

    const material = points.material as THREE.ShaderMaterial;
    material.uniforms.uAudioTime.value = audioTimeRef.current;
    material.uniforms.uEnergy.value = smoothEnergy;
    material.uniforms.uPulse.value = pulseRef.current;
    material.uniforms.uMotion.value = reducedMotion ? 0.25 : 1;
    points.rotation.y += delta * (0.04 + smoothEnergy * 0.08);
    points.rotation.x = Math.sin(audioTimeRef.current * 0.12) * 0.08;
  });

  return (
    <points ref={pointsRef} geometry={geometry} frustumCulled={false}>
      <shaderMaterial
        uniforms={uniforms}
        vertexShader={MUSIC_VERTEX_SHADER}
        fragmentShader={MUSIC_FRAGMENT_SHADER}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}