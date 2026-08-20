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
  uniform float uMatrixMinY;
  uniform float uMatrixMaxY;
  uniform float uMatrixWidth;
  uniform float uMatrixDepth;
  attribute vec3 aTarget;
  attribute float aSeed;
  attribute float aScale;
  attribute vec2 aGrid;
  attribute float aFlow;
  varying float vAlpha;
  varying float vCharge;

  void main() {
    float settled = smoothstep(0.0, 1.0, uProgress);
    float rise = fract(aFlow + uTime * (0.16 + aSeed * 0.08));
    float flutter = sin(uTime * (2.1 + aSeed * 1.8) + aSeed * 31.0);

    // TNG-style waiting state: a moving, vertical particle matrix. Every point
    // still owns a real GLB surface target for the live reconstruction.
    vec3 transported = vec3(
      aGrid.x * uMatrixWidth + flutter * 0.018,
      mix(uMatrixMinY, uMatrixMaxY, rise) + sin(uTime * 2.0 + aSeed * 27.0) * 0.026,
      aGrid.y * uMatrixDepth - 0.12 + cos(uTime * 2.5 + aSeed * 23.0) * 0.018
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
  const grids = new Float32Array(count * 2);
  const flows = new Float32Array(count);
  const point = new THREE.Vector3();
  let minY = Infinity;
  let maxY = -Infinity;
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
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
    grids[i * 2] = Math.floor(next() * 17) / 16 - 0.5;
    grids[i * 2 + 1] = Math.floor(next() * 7) / 6 - 0.5;
    flows[i] = next();
    minY = Math.min(minY, point.y);
    maxY = Math.max(maxY, point.y);
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minZ = Math.min(minZ, point.z);
    maxZ = Math.max(maxZ, point.z);
  }

  geo.setAttribute('position', new THREE.BufferAttribute(targets.slice(), 3));
  geo.setAttribute('aTarget', new THREE.BufferAttribute(targets, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
  geo.setAttribute('aScale', new THREE.BufferAttribute(scales, 1));
  geo.setAttribute('aGrid', new THREE.BufferAttribute(grids, 2));
  geo.setAttribute('aFlow', new THREE.BufferAttribute(flows, 1));
  geo.userData.matrixMinY = minY;
  geo.userData.matrixMaxY = maxY;
  geo.userData.matrixWidth = Math.max(0.28, (maxX - minX) * 0.34);
  geo.userData.matrixDepth = Math.max(0.18, (maxZ - minZ) * 0.28);
  return geo;
}

export function OracleGLBTransporter({
  scene,
  tier,
  active,
  targetProgress,
  progressRef,
  reducedMotion = false,
}: OracleGLBTransporterProps) {
  const pointsRef = useRef<THREE.Points>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const count = PARTICLE_COUNTS[tier];
  const geometry = useMemo(() => buildGLBPointGeometry(scene, count), [scene, count]);
  const uniforms = useMemo(() => ({
    uTime: { value: 0 },
    uProgress: { value: 1 },
    uSize: { value: 1 },
    uMatrixMinY: { value: geometry.userData.matrixMinY ?? -1 },
    uMatrixMaxY: { value: geometry.userData.matrixMaxY ?? 1 },
    uMatrixWidth: { value: geometry.userData.matrixWidth ?? 0.4 },
    uMatrixDepth: { value: geometry.userData.matrixDepth ?? 0.2 },
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
    const target = active ? Math.max(0, Math.min(1, targetProgress)) : 1;
    const debugRate = import.meta.env.DEV && typeof window !== 'undefined'
      ? Number((window as unknown as { __oracle_debug_transportRate?: number }).__oracle_debug_transportRate ?? 1)
      : 1;
    const speed = (target > progressRef.current ? 1.25 : 5.5) *
      (Number.isFinite(debugRate) ? Math.max(1, debugRate) : 1);
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