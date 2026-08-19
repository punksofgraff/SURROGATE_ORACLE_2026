/**
 * OracleQuarks.tsx — High-Performance GPU Particle System (Quarks Architecture).
 *
 * Provides GPU-accelerated quantum particle streams, curl noise vortex fields,
 * and speech-reactive energy quarks directly rendered inside the R3F Canvas.
 *
 * Features:
 *   - GPU vertex shader simulation with 3D noise turbulence and harmonic swirl.
 *   - Manifestation surge: particles condense from the dimensional rift on scene entry.
 *   - Voice excitation: amplitude drives particle velocity, radius, and color temperature.
 *   - Face protection: spatial force-field pushes particles away from the central face zone.
 *   - Tier-scaled particle counts (Tier 1: 120, Tier 2: 320, Tier 3: 650).
 *   - Zero CPU allocations in the hot animation loop (uniform updates only).
 */
import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { logStep } from './CodeAuditor';

interface OracleQuarksProps {
  /** Effective GPU tier (1–3) */
  tier: 1 | 2 | 3;
  /** Live "oracle is speaking" ref */
  speakingRef: React.RefObject<boolean>;
  /** Live viseme amplitude ref if available */
  amplitude?: number;
  /** Preserve the field but slow its continuous stream for accessibility. */
  reducedMotion?: boolean;
}

const QUARKS_VERTEX_SHADER = /* glsl */ `
  uniform float uTime;
  uniform float uSpeaking;
  uniform float uManifest;
  uniform float uSize;
  uniform float uMotionScale;
  
  attribute float aScale;
  attribute float aSpeed;
  attribute vec3 aVelocity;
  attribute vec4 aColor;
  attribute float aPhase;
  
  varying vec4 vColor;
  varying float vLife;

  // Simplex noise helpers
  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
  vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

  float snoise(vec3 v) {
    const vec2 C = vec2(1.0/6.0, 1.0/3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
    vec3 i  = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);
    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;
    i = mod289(i);
    vec4 p = permute(permute(permute(
              i.z + vec4(0.0, i1.z, i2.z, 1.0))
            + i.y + vec4(0.0, i1.y, i2.y, 1.0))
            + i.x + vec4(0.0, i1.x, i2.x, 1.0));
    float n_ = 0.142857142857;
    vec3  ns = n_ * D.wyz - D.xzx;
    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);
    vec4 x = x_ *ns.x + ns.yyyy;
    vec4 y = y_ *ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);
    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);
    vec4 s0 = floor(b0)*2.0 + 1.0;
    vec4 s1 = floor(b1)*2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));
    vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);
    vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2, p2), dot(p3,p3)));
    p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
    vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
  }

  void main() {
    float t = uTime * aSpeed + aPhase;
    float lifeCycle = fract(t * 0.25);
    vLife = sin(lifeCycle * 3.1415926);

    vec3 pos = position;
    float seed = fract(aPhase * 0.61803398875);

    // A small turbulent deviation rides on top of the actual stream. This is
    // intentionally not the motion itself: an offset around a static spawn
    // point only reads as twinkle on a phone.
    vec3 noiseCoord = pos * 1.8 + vec3(0.0, uTime * 0.5, 0.0);
    vec3 noiseOffset = vec3(
      snoise(noiseCoord),
      snoise(noiseCoord + vec3(43.12, 12.8, 8.4)),
      snoise(noiseCoord + vec3(11.3, 91.2, 34.6))
    );

    // Continuous helix around the Oracle. Particles stream bottom-to-top in
    // roughly 4–5 seconds and complete a lateral orbit in 5–8 seconds, so
    // their position changes are visible inside a single phone-sized glance.
    // Keeping the z range behind the bust preserves the face-safe field.
    float stream = fract(seed + uTime * (0.18 + aSpeed * 0.055) * uMotionScale);
    float angle = aPhase + uTime * (0.82 + seed * 0.36) * aSpeed * uMotionScale;
    float radius = 0.45 + seed * 0.75;
    vec3 streamPos = vec3(
      cos(angle) * radius,
      -1.20 + stream * 2.45,
      -0.38 + sin(angle) * (0.14 + radius * 0.16)
    );

    // Speaking excitation surge
    vec3 speechSurge = aVelocity * (uSpeaking * 2.2);

    // Manifestation convergence (vortex pulling in)
    float manifestPull = (1.0 - uManifest) * 1.5;
    vec3 finalPos = streamPos + (noiseOffset * 0.065) + speechSurge;
    finalPos.xz *= (1.0 + manifestPull * sin(aPhase * 6.28));

    // Face zone protection: push away if within face cylinder
    vec2 faceDist = finalPos.xy - vec2(0.0, 0.0);
    if (length(faceDist) < 0.28 && finalPos.z > -0.15) {
      finalPos.x += sign(finalPos.x) * 0.22;
      finalPos.y += sign(finalPos.y) * 0.18;
    }

    vec4 mvPosition = modelViewMatrix * vec4(finalPos, 1.0);
    gl_Position = projectionMatrix * mvPosition;

    // Perspective point size
    float pSize = aScale * uSize * (1.0 + uSpeaking * 0.65) * vLife;
    gl_PointSize = pSize * (300.0 / -mvPosition.z);

    // Color transition based on speaking state & life
    vec4 activeCol = mix(aColor, vec4(0.69, 0.15, 1.0, 1.0), uSpeaking * 0.6);
    vColor = activeCol * vLife;
  }
`;

const QUARKS_FRAGMENT_SHADER = /* glsl */ `
  varying vec4 vColor;
  varying float vLife;

  void main() {
    vec2 coord = gl_PointCoord - vec2(0.5);
    float dist = length(coord);
    if (dist > 0.5) discard;

    // Smooth Gaussian core falloff
    float core = exp(-dist * dist * 18.0);
    float halo = exp(-dist * dist * 4.5) * 0.6;
    float alpha = (core + halo) * vColor.a * vLife;

    gl_FragColor = vec4(vColor.rgb * (core * 1.6 + 0.4), alpha);
  }
`;

const TIER_QUARK_COUNTS = {
  1: 140,
  2: 340,
  3: 680,
} as const;

export function OracleQuarks({
  tier,
  speakingRef,
  amplitude = 0,
  reducedMotion = false,
}: OracleQuarksProps) {
  const pointsRef = useRef<THREE.Points>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const motionTimeRef = useRef(0);
  const frameCountRef = useRef(0);
  const count = TIER_QUARK_COUNTS[tier];

  useEffect(() => {
    logStep(`QUARKS MOUNTED — tier=${tier} count=${count}`, 'ok');
    return () => {
      logStep(`QUARKS UNMOUNTED — tier=${tier} count=${count}`, 'warn');
    };
  }, [tier, count]);

  // Palette colors
  const sacredGreen = useMemo(() => new THREE.Color('#00ff88'), []);
  const brandCyan   = useMemo(() => new THREE.Color('#00ffcc'), []);
  const profanePurp = useMemo(() => new THREE.Color('#b026ff'), []);

  const { geometry, uniforms } = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    const positions  = new Float32Array(count * 3);
    const scales     = new Float32Array(count);
    const speeds     = new Float32Array(count);
    const velocities = new Float32Array(count * 3);
    const colors     = new Float32Array(count * 4);
    const phases     = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      // Cylinder / shell surrounding avatar
      const theta = Math.random() * Math.PI * 2;
      const r = 0.45 + Math.random() * 0.75;
      const y = (Math.random() - 0.5) * 1.8;
      const z = (Math.random() - 0.5) * 0.7 - 0.15;

      positions[i * 3 + 0] = Math.cos(theta) * r;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;

      scales[i] = 0.028 + Math.random() * 0.055;
      speeds[i] = 0.4 + Math.random() * 0.8;

      // Rising charged upward velocity
      velocities[i * 3 + 0] = (Math.random() - 0.5) * 0.08;
      velocities[i * 3 + 1] = 0.15 + Math.random() * 0.35;
      velocities[i * 3 + 2] = (Math.random() - 0.5) * 0.08;

      // Color selection
      const colorPick = Math.random();
      const col = colorPick < 0.55 ? sacredGreen : colorPick < 0.82 ? brandCyan : profanePurp;
      colors[i * 4 + 0] = col.r;
      colors[i * 4 + 1] = col.g;
      colors[i * 4 + 2] = col.b;
      colors[i * 4 + 3] = 0.85 + Math.random() * 0.15;

      phases[i] = Math.random() * 100.0;
    }

    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('aScale', new THREE.BufferAttribute(scales, 1));
    geo.setAttribute('aSpeed', new THREE.BufferAttribute(speeds, 1));
    geo.setAttribute('aVelocity', new THREE.BufferAttribute(velocities, 3));
    geo.setAttribute('aColor', new THREE.BufferAttribute(colors, 4));
    geo.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));

    const unis = {
      uTime: { value: 0 },
      uSpeaking: { value: 0 },
      uManifest: { value: 1.0 },
      uSize: { value: 1.0 },
      // Reduced Motion: ambient orbital stream runs at full speed — it IS the
      // sign of life. Only the speaking-excitation surge is suppressed (see
      // uSpeaking target in useFrame). A motionScale < 1 here makes the orbit
      // imperceptible on a phone and causes the "one-shot freeze" regression.
      uMotionScale: { value: 1.0 },
    };

    return { geometry: geo, uniforms: unis };
  }, [count, sacredGreen, brandCyan, profanePurp, reducedMotion]);

  useFrame((state, delta) => {
    const mat = materialRef.current;
    if (!mat) return;

    // Keep the particle phase owned by this mounted field. R3F's shared clock
    // can be reset when a warmed Canvas crosses scene phases, which made a
    // continuous stream look like it had completed one act and frozen.
    motionTimeRef.current += Math.min(delta, 1 / 20);
    mat.uniforms.uTime.value = motionTimeRef.current;
    frameCountRef.current += 1;
    // Low-rate heartbeat for the existing dev API relay. This distinguishes
    // a stopped R3F loop from a field that is still animating but hidden by
    // a compositor layer, without flooding the log on every frame.
    if (frameCountRef.current % 30 === 0) {
      logStep(
        `QUARK HEARTBEAT — frames=${frameCountRef.current} time=${motionTimeRef.current.toFixed(2)} tier=${tier}`,
        'ok',
      );
    }
    if (typeof window !== 'undefined') {
      const probe = (window as unknown as { __oracle_scene_probe?: Record<string, unknown> }).__oracle_scene_probe ?? {};
      probe.quarkTime = motionTimeRef.current;
      probe.quarkCount = count;
      (window as unknown as { __oracle_scene_probe?: Record<string, unknown> }).__oracle_scene_probe = probe;
    }

    // gl_PointSize is computed with a fixed constant that assumes the original
    // card-sized drawing buffer. In oracle phase the canvas element is enlarged
    // and camera.zoom compensates the projection (OrbitZoomCompensator) — world
    // geometry stays the same on-screen size, but raw point sizes would not.
    // Scaling uSize by camera.zoom keeps quark screen size identical too.
    const camZoom = (state.camera as THREE.PerspectiveCamera).zoom ?? 1;
    mat.uniforms.uSize.value = camZoom;

    
    // Smooth speaking excitation — suppressed in Reduced Motion so the surge
    // doesn't create the "one burst then still" perception. The ambient orbital
    // stream (uTime-driven, not uSpeaking-driven) continues unaffected.
    const isSpeaking = !!speakingRef.current;
    const targetSpeak = (isSpeaking && !reducedMotion) ? Math.max(0.6, Math.min(1.0, amplitude * 3.5)) : 0.0;
    mat.uniforms.uSpeaking.value = THREE.MathUtils.lerp(
      mat.uniforms.uSpeaking.value,
      targetSpeak,
      Math.min(1, delta * 12.0)
    );
  });

  return (
    <points ref={pointsRef} geometry={geometry} frustumCulled={false}>
      <shaderMaterial
        ref={materialRef}
        vertexShader={QUARKS_VERTEX_SHADER}
        fragmentShader={QUARKS_FRAGMENT_SHADER}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        depthTest={true}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}
