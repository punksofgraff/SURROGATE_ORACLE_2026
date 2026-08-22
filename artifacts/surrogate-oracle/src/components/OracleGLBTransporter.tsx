import { useEffect, useMemo, useRef, type MutableRefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { MeshSurfaceSampler } from 'three/addons/math/MeshSurfaceSampler.js';
import { logStep } from './CodeAuditor';

type Tier = 1 | 2 | 3;

interface OracleGLBTransporterProps {
  scene: THREE.Object3D;
  tier: Tier;
  active: boolean;
  targetProgress: number;
  progressRef: MutableRefObject<number>;
  mode?: 'manifest' | 'lyria';
  getAnalyser?: () => AnalyserNode | null;
  reducedMotion?: boolean;
}

// The reference simulator renders 20k+ desktop particles. These caps preserve
// the same dense, surface-derived reading while remaining viable alongside
// audio, post-processing, and physics on the Oracle's protected GPU tiers.
const PARTICLE_COUNTS: Record<Tier, number> = { 1: 900, 2: 2800, 3: 6500 };

const VERTEX_SHADER = /* glsl */ `
  uniform float uTime;
  uniform float uProgress;
  uniform float uSize;
  attribute vec3 aTarget;
  attribute float aSeed;
  attribute float aScale;
  varying float vAlpha;
  varying float vCharge;

  void main() {
    float settled = smoothstep(0.0, 1.0, uProgress);
    float rise = fract(uTime * (0.12 + aSeed * 0.05) + aSeed);
    float flutter = sin(uTime * (2.1 + aSeed * 1.8) + aSeed * 31.0);

    // The existing glitch phase now uses the sampled GLB surface as its source.
    // It tightens into a signal-shaped field before resolving back to the target.
    vec3 transported = vec3(
      aTarget.x * 0.16 + flutter * (0.035 + aSeed * 0.065),
      aTarget.y + (rise - 0.5) * 0.26 + flutter * 0.075,
      aTarget.z * 0.14 - 0.10 + cos(uTime * 2.5 + aSeed * 23.0) * 0.04
    );
    vec3 pos = mix(transported, aTarget, settled);

    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    gl_PointSize = aScale * uSize * (1.18 - settled * 0.33) * (300.0 / -mvPosition.z);

    // Keep the mesh-shaped particle form readable while it rebuilds, then hand
    // the last fraction of opacity to the actual animated GLB.
    vAlpha = (0.42 + (1.0 - settled) * 0.46) * (1.0 - smoothstep(0.88, 1.0, settled));
    vCharge = 0.45 + 0.55 * sin(aSeed * 19.0 + uTime * 1.7);
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  varying float vAlpha;
  varying float vCharge;

  void main() {
    vec2 point = gl_PointCoord - vec2(0.5);
    float d = length(point);
    if (d > 0.5) discard;
    float core = exp(-d * d * 22.0);
    float halo = exp(-d * d * 5.0) * 0.55;
    vec3 color = mix(vec3(0.0, 1.0, 0.53), vec3(0.69, 0.15, 1.0), vCharge * 0.24);
    gl_FragColor = vec4(color * (core * 1.8 + 0.3), (core + halo) * vAlpha);
  }
`;

type PositionAttribute = THREE.BufferAttribute | THREE.InterleavedBufferAttribute;

interface SurfaceSource {
  sampler?: MeshSurfaceSampler;
  position: PositionAttribute;
  matrix: THREE.Matrix4;
  area: number;
}

function getSurfaceArea(
  position: PositionAttribute,
  index: THREE.BufferAttribute | null,
  matrix: THREE.Matrix4,
) {
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const triangleCount = Math.floor((index?.count ?? position.count) / 3);
  let area = 0;

  for (let triangle = 0; triangle < triangleCount; triangle++) {
    const offset = triangle * 3;
    const ia = index ? index.getX(offset) : offset;
    const ib = index ? index.getX(offset + 1) : offset + 1;
    const ic = index ? index.getX(offset + 2) : offset + 2;
    a.fromBufferAttribute(position, ia).applyMatrix4(matrix);
    b.fromBufferAttribute(position, ib).applyMatrix4(matrix);
    c.fromBufferAttribute(position, ic).applyMatrix4(matrix);
    area += a.sub(b).cross(c.sub(b)).length() * 0.5;
  }

  return area;
}

function buildGLBPointGeometry(scene: THREE.Object3D, count: number) {
  scene.updateMatrixWorld(true);
  const sceneInverse = scene.matrixWorld.clone().invert();
  const sources: SurfaceSource[] = [];
  let totalArea = 0;

  scene.traverse((node) => {
    const mesh = node as THREE.Mesh;
    const position = mesh.geometry?.getAttribute('position');
    if (!mesh.isMesh || !position || position.count === 0) return;
    const matrix = sceneInverse.clone().multiply(mesh.matrixWorld);
    const index = mesh.geometry.getIndex();
    let sampler: MeshSurfaceSampler | undefined;
    try {
      // This is the reference engine's direct model-to-particle path: sample
      // faces by area rather than exposing a sparse, topology-biased vertex set.
      sampler = new MeshSurfaceSampler(mesh).build();
    } catch {
      // Point-only assets can still participate through the vertex fallback.
    }
    const area = getSurfaceArea(position, index, matrix);
    const sourceArea = Number.isFinite(area) && area > 0 ? area : position.count;
    sources.push({
      position,
      sampler,
      matrix,
      area: sourceArea,
    });
    totalArea += sourceArea;
  });

  const geo = new THREE.BufferGeometry();
  if (!sources.length) return geo;
  const targets = new Float32Array(count * 3);
  const seeds = new Float32Array(count);
  const scales = new Float32Array(count);
  const point = new THREE.Vector3();
  const next = (() => {
    let state = 0x8d4a_7c11;
    return () => {
      state |= 0;
      state = (state + 0x6d2b79f5) | 0;
      let value = Math.imul(state ^ (state >>> 15), 1 | state);
      value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
      return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
  })();

  for (let i = 0; i < count; i++) {
    let pick = next() * Math.max(1, totalArea);
    let source = sources[0]!;
    for (const candidate of sources) {
      if (pick < candidate.area) {
        source = candidate;
        break;
      }
      pick -= candidate.area;
    }
    if (source.sampler) {
      source.sampler.sample(point);
    } else {
      point.fromBufferAttribute(source.position, Math.floor(next() * source.position.count));
    }
    point.applyMatrix4(source.matrix);
    targets[i * 3] = point.x;
    targets[i * 3 + 1] = point.y;
    targets[i * 3 + 2] = point.z;
    seeds[i] = next();
    scales[i] = 6.0 + next() * 7.5;
  }

  geo.setAttribute('position', new THREE.BufferAttribute(targets.slice(), 3));
  geo.setAttribute('aTarget', new THREE.BufferAttribute(targets, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
  geo.setAttribute('aScale', new THREE.BufferAttribute(scales, 1));
  return geo;
}

export function OracleGLBTransporter({
  scene,
  tier,
  active,
  targetProgress,
  progressRef,
  mode = 'manifest',
  getAnalyser,
  reducedMotion = false,
}: OracleGLBTransporterProps) {
  const pointsRef = useRef<THREE.Points>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const audioDataRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const smoothEnergyRef = useRef(0.08);
  const smoothBassRef = useRef(0.08);
  const count = PARTICLE_COUNTS[tier];
  const geometry = useMemo(() => buildGLBPointGeometry(scene, count), [scene, count]);
  const uniforms = useMemo(() => ({
    uTime: { value: 0 },
    uProgress: { value: 1 },
    uSize: { value: 1 },
  }), []);

  useEffect(() => {
    logStep(`GLB TRANSPORTER MOUNTED — tier=${tier} points=${count}`, 'ok');
    return () => {
      geometry.dispose();
      logStep(`GLB TRANSPORTER UNMOUNTED — tier=${tier} points=${count}`, 'warn');
    };
  }, [tier, count, geometry]);

  useFrame((state, delta) => {
    const material = materialRef.current;
    if (!material) return;
    let target = active ? Math.max(0, Math.min(1, targetProgress)) : 1;

    if (active && mode === 'lyria') {
      const analyser = getAnalyser?.();
      let energy = 0.08;
      let bass = 0.08;
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
      const blend = Math.min(1, delta * 8);
      const smoothEnergy = THREE.MathUtils.lerp(smoothEnergyRef.current, energy, blend);
      const smoothBass = THREE.MathUtils.lerp(smoothBassRef.current, bass, blend);
      smoothEnergyRef.current = smoothEnergy;
      smoothBassRef.current = smoothBass;

      // Lyria reverses the manifestation relationship: sustained energy
      // gathers the surface, while bass briefly fractures it outward.
      target = THREE.MathUtils.clamp(
        0.36 + smoothEnergy * 0.42 - smoothBass * 0.12,
        0.28,
        0.68,
      );
    }
    const speed = target > progressRef.current ? 1.25 : 5.5;
    progressRef.current = THREE.MathUtils.lerp(
      progressRef.current,
      target,
      Math.min(1, delta * speed),
    );
    // An alpha-zero shader still consumes a full draw call. The point cloud is
    // only needed while it is dispersing or reforming; remove it from the
    // renderer entirely once the animated GLB has ownership again.
    if (pointsRef.current) {
      pointsRef.current.visible = progressRef.current < 0.995 || (active && target < 0.995);
    }
    material.uniforms.uTime.value += Math.min(delta, 1 / 20) * (reducedMotion ? 0.5 : 1);
    material.uniforms.uProgress.value = progressRef.current;
    material.uniforms.uSize.value = (state.camera as THREE.PerspectiveCamera).zoom ?? 1;
    if (typeof window !== 'undefined') {
      const probe = (window as unknown as { __oracle_scene_probe?: Record<string, unknown> }).__oracle_scene_probe ?? {};
      probe.glbTransportProgress = progressRef.current;
      probe.glbTransportPoints = count;
      (window as unknown as { __oracle_scene_probe?: Record<string, unknown> }).__oracle_scene_probe = probe;
    }
  });

  return (
    <points
      name="oracle-glb-transporter"
      ref={pointsRef}
      geometry={geometry}
      frustumCulled={false}
      visible={active || progressRef.current < 0.995}
    >
      <shaderMaterial
        ref={materialRef}
        uniforms={uniforms}
        vertexShader={VERTEX_SHADER}
        fragmentShader={FRAGMENT_SHADER}
        transparent
        depthWrite={false}
        depthTest={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}