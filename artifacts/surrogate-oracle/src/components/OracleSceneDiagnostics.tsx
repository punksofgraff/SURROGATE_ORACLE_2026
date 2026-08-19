import { useEffect, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

export interface OracleSceneProbe {
  frameCount: number;
  r3fDelta: number;
  r3fClock: number;
  quarkTime: number;
  quarkCount: number;
  nebulaUpdates: number;
  debrisUpdates: number;
  activeDebris: number;
  sprites: number;
  instancedMeshes: number;
  particleCount: number;
  drawCalls: number;
  speaking: boolean;
  updatedAt: number;
}

export interface OracleDiagnosticSample {
  label: 'before-speech' | 'speaking-start' | 'during-speech' | 'after-speech';
  at: number;
  speaking: boolean;
  phase: string | null;
  renderTier: number | null;
  probe: OracleSceneProbe | null;
  placement: {
    stage: DOMRectSnapshot | null;
    cabinet: DOMRectSnapshot | null;
    avatar: DOMRectSnapshot | null;
    canvas: DOMRectSnapshot | null;
    centerOffset: number | null;
    transforms: Record<string, string>;
  };
}

export interface DOMRectSnapshot {
  x: number;
  y: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
}

type DiagnosticWindow = Window & {
  __oracle_renderTier?: number;
  __oracle_scene_probe?: OracleSceneProbe;
  __oracle_diagnostics?: {
    enabled: boolean;
    samples: OracleDiagnosticSample[];
    latest: OracleDiagnosticSample | null;
    reset: () => void;
  };
};

function snapshotRect(element: Element | null): DOMRectSnapshot | null {
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  return {
    x: Number(rect.x.toFixed(2)),
    y: Number(rect.y.toFixed(2)),
    width: Number(rect.width.toFixed(2)),
    height: Number(rect.height.toFixed(2)),
    centerX: Number((rect.left + rect.width / 2).toFixed(2)),
    centerY: Number((rect.top + rect.height / 2).toFixed(2)),
  };
}

function getTransforms(element: Element | null): Record<string, string> {
  if (!element) return {};
  const html = element as HTMLElement;
  return {
    inline: html.style.transform || '(none)',
    computed: getComputedStyle(html).transform || 'none',
    transformOrigin: getComputedStyle(html).transformOrigin || 'none',
  };
}

function collectPlacement(): OracleDiagnosticSample['placement'] {
  const stage = document.querySelector('.oracle-stage');
  const cabinet = document.querySelector('.oracle-cabinet');
  const avatar = document.querySelector('.oracle-avatar-wrapper');
  const canvas = document.querySelector('.oracle-avatar-canvas');
  const stageRect = snapshotRect(stage);
  const cabinetRect = snapshotRect(cabinet);
  return {
    stage: stageRect,
    cabinet: cabinetRect,
    avatar: snapshotRect(avatar),
    canvas: snapshotRect(canvas),
    centerOffset: stageRect && cabinetRect
      ? Number((cabinetRect.centerX - stageRect.centerX).toFixed(2))
      : null,
    transforms: {
      center: getTransforms(document.querySelector('.oracle-center')).inline,
      cabinet: getTransforms(cabinet).computed,
      avatar: getTransforms(avatar).computed,
      canvas: getTransforms(canvas).computed,
    },
  };
}

function takeSample(label: OracleDiagnosticSample['label']): OracleDiagnosticSample {
  const win = window as DiagnosticWindow;
  const stage = document.querySelector('.oracle-stage');
  const speaking = stage?.getAttribute('data-oracle-speaking') === 'true';
  return {
    label,
    at: Date.now(),
    speaking,
    phase: stage?.getAttribute('data-oracle-state') ?? null,
    renderTier: typeof win.__oracle_renderTier === 'number' ? win.__oracle_renderTier : null,
    probe: win.__oracle_scene_probe ? { ...win.__oracle_scene_probe } : null,
    placement: collectPlacement(),
  };
}

/** R3F-side probe. It intentionally has no visual or behavioral effect. */
export function OracleSceneDiagnostics() {
  const { scene, gl } = useThree();
  const frameCountRef = useRef(0);

  useFrame((state, delta) => {
    frameCountRef.current += 1;
    let sprites = 0;
    let instancedMeshes = 0;
    let particleCount = 0;
    scene.traverse((object) => {
      if (object.type === 'Sprite') sprites += 1;
      if (object.type === 'InstancedMesh') {
        instancedMeshes += 1;
        particleCount += (object as THREE.InstancedMesh).count;
      }
    });
    const win = window as DiagnosticWindow;
    win.__oracle_scene_probe = {
      frameCount: frameCountRef.current,
      r3fDelta: Number(delta.toFixed(5)),
      r3fClock: Number(state.clock.elapsedTime.toFixed(3)),
      quarkTime: win.__oracle_scene_probe?.quarkTime ?? 0,
      quarkCount: win.__oracle_scene_probe?.quarkCount ?? 0,
      nebulaUpdates: win.__oracle_scene_probe?.nebulaUpdates ?? 0,
      debrisUpdates: win.__oracle_scene_probe?.debrisUpdates ?? 0,
      activeDebris: win.__oracle_scene_probe?.activeDebris ?? 0,
      sprites,
      instancedMeshes,
      particleCount,
      drawCalls: gl.info.render.calls,
      speaking: document.querySelector('.oracle-stage')?.getAttribute('data-oracle-speaking') === 'true',
      updatedAt: Date.now(),
    };
  });
  return null;
}

export function OracleDiagnosticsOverlay() {
  const [samples, setSamples] = useState<OracleDiagnosticSample[]>([]);
  const lastSpeakingRef = useRef(false);
  const speakingStartedAtRef = useRef<number | null>(null);
  const capturedRef = useRef(new Set<OracleDiagnosticSample['label']>());

  useEffect(() => {
    const win = window as DiagnosticWindow;
    const enabled = new URLSearchParams(window.location.search).has('devui');
    if (!enabled) return;

    const reset = () => {
      capturedRef.current.clear();
      speakingStartedAtRef.current = null;
      setSamples([]);
    };
    win.__oracle_diagnostics = { enabled: true, samples: [], latest: null, reset };

    const tick = () => {
      const stage = document.querySelector('.oracle-stage');
      if (!stage || stage.getAttribute('data-oracle-state') !== 'oracle') return;
      const speaking = stage.getAttribute('data-oracle-speaking') === 'true';
      const now = Date.now();
      if (speaking && !lastSpeakingRef.current) speakingStartedAtRef.current = now;

      const label = !capturedRef.current.has('before-speech') && !speaking
        ? 'before-speech'
        : speaking && !capturedRef.current.has('speaking-start')
          ? 'speaking-start'
          : speaking && (now - (speakingStartedAtRef.current ?? now) > 350) && !capturedRef.current.has('during-speech')
            ? 'during-speech'
            : !speaking && lastSpeakingRef.current && capturedRef.current.has('speaking-start') && !capturedRef.current.has('after-speech')
              ? 'after-speech'
              : null;

      if (label) {
        const sample = takeSample(label);
        capturedRef.current.add(label);
        const diagnostics = win.__oracle_diagnostics;
        if (diagnostics) {
          diagnostics.samples.push(sample);
          diagnostics.latest = sample;
          setSamples([...diagnostics.samples]);
        }
      }
      lastSpeakingRef.current = speaking;
    };

    const timer = window.setInterval(tick, 250);
    return () => {
      window.clearInterval(timer);
      delete win.__oracle_diagnostics;
    };
  }, []);

  if (!samples.length) return null;
  return (
    <div className="oracle-devui oracle-diagnostics-overlay" data-testid="oracle-diagnostics">
      <strong>SCENE DIAGNOSTICS</strong>
      {samples.map((sample) => (
        <div key={sample.label}>
          {sample.label} {sample.speaking ? 'VOICE' : 'SILENT'} · tier {sample.renderTier ?? '?'} ·
          {' '}frames {sample.probe?.frameCount ?? 0} · q {sample.probe?.quarkTime.toFixed(2) ?? '0.00'} ·
          {' '}neb {sample.probe?.nebulaUpdates ?? 0} · debris {sample.probe?.activeDebris ?? 0} ·
          {' '}Δx {sample.placement.centerOffset ?? '?'}px
        </div>
      ))}
    </div>
  );
}