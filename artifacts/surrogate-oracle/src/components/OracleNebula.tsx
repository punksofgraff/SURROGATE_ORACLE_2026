/**
 * OracleNebula — three-nebula particle layers inside the R3F Canvas.
 *
 * Two emitters:
 *   AMBIENT DUST — always-on drifting motes filling the cabinet volume,
 *                  a 3D upgrade of the 2D atmosphere canvas behind the glass.
 *   ENERGY TENDRILS — burst emitter that only runs while the Oracle speaks,
 *                  rising charged particles hugging the avatar silhouette.
 *
 * Design constraints:
 *   - No React re-renders at 60fps: speaking state arrives via ref, emitter
 *     rates are swapped imperatively inside useFrame.
 *   - Particle counts are tier-scaled (useGPUTier). Tier 0 never mounts this.
 *   - All particles live BEHIND the avatar (z < 0) or at low alpha so they
 *     never occlude the face. Additive blending keeps them glow-like.
 */
import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import System, {
  Emitter,
  Rate,
  Span,
  Position,
  Mass,
  Radius,
  Life,
  Body,
  RadialVelocity,
  Vector3D,
  Alpha,
  Scale,
  Color,
  RandomDrift,
  Gravity,
  BoxZone,
  SpriteRenderer,
} from 'three-nebula';

interface OracleNebulaProps {
  /** effective GPU tier, 1–3 (component not mounted at tier 0) */
  tier: 1 | 2 | 3;
  /** live "oracle is speaking" flag — read per-frame, never re-renders */
  speakingRef: React.RefObject<boolean>;
}

/** Soft radial glow sprite, built once per page. */
let glowTexture: THREE.Texture | null = null;
function getGlowTexture(): THREE.Texture {
  if (glowTexture) return glowTexture;
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0.0, 'rgba(255,255,255,1.0)');
  grad.addColorStop(0.2, 'rgba(230,255,245,0.92)');
  grad.addColorStop(0.5, 'rgba(0,255,136,0.45)');
  grad.addColorStop(0.75, 'rgba(0,255,204,0.15)');
  grad.addColorStop(1.0, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  glowTexture = new THREE.CanvasTexture(canvas);
  return glowTexture;
}

function makeSprite(color: number, opacity: number): THREE.Sprite {
  const material = new THREE.SpriteMaterial({
    map: getGlowTexture(),
    color,
    blending: THREE.AdditiveBlending,
    transparent: true,
    opacity,
    depthWrite: false,
    // Particles depth-tested against the avatar geometry so they don't occlude the face
    depthTest: true,
  });
  return new THREE.Sprite(material);
}

/** Tier → particle budget. */
const TIER_CONFIG = {
  1: { dustParticles: [2, 3] as [number, number], dustEvery: [0.18, 0.32] as [number, number], energyParticles: [3, 5] as [number, number] },
  2: { dustParticles: [3, 6] as [number, number], dustEvery: [0.10, 0.20] as [number, number], energyParticles: [5, 9] as [number, number] },
  3: { dustParticles: [5, 9] as [number, number], dustEvery: [0.06, 0.12] as [number, number], energyParticles: [8, 16] as [number, number] },
} as const;

/** Near-zero rate object reused when the Oracle falls silent. */
function silentRate() {
  return new Rate(new Span(0, 0), new Span(10, 10));
}

export function OracleNebula({ tier, speakingRef }: OracleNebulaProps) {
  const { scene } = useThree();
  const systemRef = useRef<System | null>(null);
  const energyEmitterRef = useRef<Emitter | null>(null);
  const wasSpeakingRef = useRef(false);
  const cfg = TIER_CONFIG[tier];

  // Rates are cheap to construct but we keep the two energy variants stable.
  const energyActiveRate = useMemo(
    () => new Rate(new Span(cfg.energyParticles[0], cfg.energyParticles[1]), new Span(0.04, 0.08)),
    [cfg],
  );

  useEffect(() => {
    const system = new System();
    system.addRenderer(new SpriteRenderer(scene, THREE));

    // ── Ambient dust — clearly visible motes framing the cabinet & avatar ─────
    const dust = new Emitter()
      .setRate(new Rate(new Span(cfg.dustParticles[0], cfg.dustParticles[1]), new Span(cfg.dustEvery[0], cfg.dustEvery[1])))
      .addInitializers([
        new Position(new BoxZone(0, 0, -0.35, 2.4, 2.2, 0.9)),
        new Mass(1),
        new Radius(0.032, 0.072),
        new Life(4.5, 8.0),
        new Body(makeSprite(0x00ff88, 0.75)),
        new RadialVelocity(new Span(0.015, 0.05), new Vector3D(0, 1, 0), 50),
      ])
      .addBehaviours([
        new Alpha(0.15, 0.85, undefined),
        new Scale(0.6, 1.35),
        new Color('#00ff88', '#00ffcc'),
        new RandomDrift(0.035, 0.015, 0.015, 0.5),
      ])
      .setPosition({ x: 0, y: -0.1, z: -0.35 })
      .emit();

    // ── Energy tendrils — bright rising bursts around avatar silhouette while speaking ──
    const energy = new Emitter()
      .setRate(silentRate())
      .addInitializers([
        new Position(new BoxZone(0, 0, -0.2, 1.4, 0.5, 0.45)),
        new Mass(1),
        new Radius(0.022, 0.052),
        new Life(1.4, 2.6),
        new Body(makeSprite(0xb026ff, 0.9)),
        new RadialVelocity(new Span(0.22, 0.5), new Vector3D(0, 1, 0), 28),
      ])
      .addBehaviours([
        new Alpha(0.95, 0.05),
        new Scale(1.2, 0.3),
        new Color('#b026ff', '#00ffcc'),
        new RandomDrift(0.06, 0.02, 0.03, 0.3),
        new Gravity(-0.035), // negative gravity: gentle extra lift
      ])
      .setPosition({ x: 0, y: -0.5, z: -0.2 })
      .emit();

    system.addEmitter(dust).addEmitter(energy);
    systemRef.current = system;
    energyEmitterRef.current = energy;
    wasSpeakingRef.current = false;

    return () => {
      systemRef.current = null;
      energyEmitterRef.current = null;
      system.destroy(); // kills particles, removes sprites from scene
    };
    // cfg identity changes only when tier changes — rebuild is intended.
  }, [scene, cfg]);

  useFrame((_, delta) => {
    const system = systemRef.current;
    if (!system) return;

    // Swap energy emitter rate only on speaking-state EDGES — no per-frame allocs.
    const speaking = !!speakingRef.current;
    if (speaking !== wasSpeakingRef.current) {
      wasSpeakingRef.current = speaking;
      energyEmitterRef.current?.setRate(speaking ? energyActiveRate : silentRate());
    }

    // three-nebula's update is promise-returning but synchronous in effect for
    // the sprite renderer; clamp delta so background-tab jumps don't explode counts.
    void system.update(Math.min(delta, 1 / 20));
  });

  return null;
}
