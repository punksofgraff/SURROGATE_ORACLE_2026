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
  renderer: 'webgpu' | 'webgl';
  pixelRatio: number;
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

export type OracleLiveMicLabel = 'before-mic' | 'mic-open' | 'user-speaking' | 'after-user-speech';
export interface OracleMicDebugState {
  listening: boolean;
  acquiring: boolean;
  captureEnabled: boolean;
  audioContextState: string | null;
  micAudioContextState: string | null;
  vadState: string | null;
  vadScore: number | null;
  audioChunksSent: number | null;
}
export type OracleLiveMicSample = Omit<OracleDiagnosticSample, 'label'> & {
  label: OracleLiveMicLabel;
  mic: OracleMicDebugState | null;
  avatarDebug: Record<string, number> | null;
};

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
  __oracle_live_mic_diagnostics?: {
    samples: OracleLiveMicSample[];
    latest: OracleLiveMicSample | null;
    reset: () => void;
  };
  __oracle_mic_debug?: {
    getState: () => OracleMicDebugState;
  };
  __oracle_avatar_debug?: Record<string, number>;
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

function takeLiveMicSample(label: OracleLiveMicSample['label']): OracleLiveMicSample {
  const base = takeSample('before-speech');
  const win = window as DiagnosticWindow;
  return {
    ...base,
    label,
    mic: win.__oracle_mic_debug?.getState() ?? null,
    avatarDebug: win.__oracle_avatar_debug ? { ...win.__oracle_avatar_debug } : null,
  };
}

/** R3F-side probe. It intentionally has no visual or behavioral effect. */
export function OracleSceneDiagnostics() {
  const { scene, gl, viewport } = useThree();
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
      renderer: (
        (gl as unknown as {
          isWebGPURenderer?: boolean;
          backend?: { isWebGLBackend?: boolean };
        }).isWebGPURenderer &&
        !(gl as unknown as { backend?: { isWebGLBackend?: boolean } }).backend?.isWebGLBackend
      ) ? 'webgpu' : 'webgl',
      pixelRatio: Number(viewport.dpr.toFixed(2)),
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
    const liveCaptured = new Set<OracleLiveMicLabel>();
    let userSpeakingSeen = false;
    const liveReset = () => {
      liveCaptured.clear();
      userSpeakingSeen = false;
      const live = win.__oracle_live_mic_diagnostics;
      if (live) {
        live.samples.length = 0;
        live.latest = null;
      }
    };
    win.__oracle_live_mic_diagnostics = { samples: [], latest: null, reset: liveReset };

    const tick = () => {
      const stage = document.querySelector('.oracle-stage');
      if (!stage || stage.getAttribute('data-oracle-state') !== 'oracle') return;
      const speaking = stage.getAttribute('data-oracle-speaking') === 'true';
      const userSpeaking = stage.getAttribute('data-user-speaking') === 'true';
      const micState = win.__oracle_mic_debug?.getState();
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

      const liveLabel: OracleLiveMicLabel | null = !liveCaptured.has('before-mic') && !micState?.listening && !userSpeaking
        ? 'before-mic'
        : micState?.listening && !liveCaptured.has('mic-open') && !userSpeaking
          ? 'mic-open'
          : userSpeaking && !liveCaptured.has('user-speaking')
            ? 'user-speaking'
            : !userSpeaking && userSpeakingSeen && !liveCaptured.has('after-user-speech')
              ? 'after-user-speech'
              : null;
      if (userSpeaking) userSpeakingSeen = true;
      if (liveLabel) {
        const liveSample = takeLiveMicSample(liveLabel);
        liveCaptured.add(liveLabel);
        const live = win.__oracle_live_mic_diagnostics;
        if (live) {
          live.samples.push(liveSample);
          live.latest = liveSample;
        }
      }
      lastSpeakingRef.current = speaking;
    };

    const timer = window.setInterval(tick, 250);
    return () => {
      window.clearInterval(timer);
      delete win.__oracle_diagnostics;
      delete win.__oracle_live_mic_diagnostics;
      delete win.__oracle_mic_debug;
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