import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';

const PARTICLE_COUNT = 1800;

const MUSIC_VERTEX_SHADER = /* glsl */ `
  uniform float uAudioTime;
  uniform float uEnergy;
  uniform float uPulse;
  uniform float uMotion;
  uniform float uIntensity;
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
    // Keep the additive field atmospheric on phone-sized canvases. Without a
    // ceiling, the nearest particles become hundreds of pixels wide during
    // the Oracle → Lyria swap and their overlapping halos saturate the
    // transparent Canvas into a white curtain.
    gl_PointSize = clamp(
      aSize * (1.0 + uEnergy * 1.8 + uPulse * 0.9) * (150.0 / max(0.35, -mvPosition.z)),
      1.0,
      24.0
    );
    vEnergy = uEnergy + uPulse * 0.7;
    vDepth = clamp(1.0 - (-mvPosition.z / 4.0), 0.25, 1.0);
  }
`;

const MUSIC_FRAGMENT_SHADER = /* glsl */ `
  uniform float uIntensity;
  varying float vEnergy;
  varying float vDepth;

  void main() {
    vec2 point = gl_PointCoord - vec2(0.5);
    float distanceFromCenter = length(point);
    if (distanceFromCenter > 0.5) discard;
    // Keep a crisp blue pixel core, then add only a restrained edge haze.
    // The former broad Gaussian halo made nearby particles merge into a
    // blurry cyan curtain on the transparent Lyria canvas.
    float core = 1.0 - smoothstep(0.18, 0.34, distanceFromCenter);
    float halo = (1.0 - smoothstep(0.28, 0.5, distanceFromCenter)) * 0.24;
    float edge = 1.0 - smoothstep(0.44, 0.5, distanceFromCenter);
    vec3 blue = vec3(0.02, 0.46, 1.0);
    vec3 violet = vec3(0.68, 0.16, 1.0);
    vec3 color = mix(blue, violet, clamp(vEnergy * 0.58, 0.0, 1.0));
    float alpha = (core * 0.92 + halo * edge) * (0.16 + vEnergy * 0.34) * vDepth * uIntensity;
    gl_FragColor = vec4(color * (core * 1.35 + halo * 0.22) * uIntensity, alpha);
  }
`;

export function OracleMusicVisualizer({
  getAnalyser,
  getAudioTime,
  reducedMotion = false,
  intensity = 1,
}: {
  getAnalyser: () => AnalyserNode | null;
  /** Current Lyria media timestamp in seconds, when the audio element is active. */
  getAudioTime?: () => number;
  reducedMotion?: boolean;
  /** Keeps the handoff dark while the audio clip is still being generated. */
  intensity?: number;
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
    uIntensity: { value: intensity },
  }), [intensity, reducedMotion]);

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
        // Safari can briefly report a frozen media currentTime while an object
        // URL is buffering. Keep the field moving from the render clock until
        // the audio clock advances, then let the music take over.
        audioTimeRef.current = mediaTime > 0
          ? mediaTime
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
     material.uniforms.uMotion.value = reducedMotion
       ? 0.25
       : 1.1 + smoothEnergy * 1.8;
     material.uniforms.uIntensity.value = intensity;
     // Keep the field visibly alive between analyser peaks while letting bass
     // energy accelerate the orbit rather than only changing brightness.
     points.rotation.y += delta * (0.07 + smoothEnergy * 0.22);
     points.rotation.x = Math.sin(audioTimeRef.current * (0.12 + smoothEnergy * 0.18)) * 0.1;
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