// Typed `window` bridge for SURROGATE Oracle.
//
// Centralizes every ad-hoc property the app attaches to `window` (dev hooks,
// legacy AudioContext prefixes, the HolodeXR JS bridge, the experimental
// Shape Detection API) so call sites can drop `(window as any)` casts.
import type { RefObject } from 'react';
import type { OracleConversationHandle } from '../components/OracleConversation';

export interface OracleFaceDetectorResult {
  boundingBox: { x: number; y: number; width: number; height: number };
}

export interface OracleFaceDetector {
  detect: (source: CanvasImageSource) => Promise<OracleFaceDetectorResult[]>;
}

export interface SurrogateXRBridge {
  version: string;
  launch: () => void;
  markerDetected: (markerId?: string) => void;
  markerLost: () => void;
  getStatus: () => {
    xrMode: boolean;
    cameraReady: boolean;
    markerActive: boolean;
    phase: string;
  };
}

export interface OracleMorphDict {
  meshName: string;
  dict: Record<string, number>;
  resolved: Record<string, number>;
}

export interface OracleRuntimeError {
  type: 'pageerror' | 'unhandledrejection' | 'root-crash';
  message: string;
  source?: string;
  line?: number;
  column?: number;
  stack?: string;
  name?: string;
  reason?: string;
}

declare global {
  interface Window {
    /** Legacy Safari/old-WebKit AudioContext constructor. */
    webkitAudioContext?: typeof AudioContext;
    /** Experimental Shape Detection API (Chrome/Android only). */
    FaceDetector?: new (options: { fastMode: boolean; maxDetectedFaces: number }) => OracleFaceDetector;

    /** HolodeXR JS bridge — launched by the external XR host page. */
    SurrogateXR?: SurrogateXRBridge;

    /** Dev-only morph target debugging (see OracleAvatar3D). */
    __oracle_allMorphs?: Record<string, string[]>;
    __oracle_morphDicts?: OracleMorphDict[];

    /** Step-timing markers used for analytics/step logging. */
    __oracle_speech_start?: number;
    __terminal_start?: number;
    __session_start?: number;

    /** Dev console hooks (see replit.md "Dev UI & Step Logger"). */
    __oracle_handleAudio?: (url: string) => void;
    __oracle_test?: () => void;
    __oracle_skipLore?: () => void;
    /** Dev-only deterministic completion hook for browser regression checks. */
    __oracle_completeLore?: () => void;
    /** Dev-only radio toggle for deterministic handoff regression checks. */
    __oracle_toggleRadio?: () => void;
    oracleConversationRef?: RefObject<OracleConversationHandle | null>;

    /** Structured runtime evidence collected for smoke tests and preview diagnostics. */
    __oracle_runtimeErrors?: OracleRuntimeError[];

    /** Shared singleton AudioContext for one-shot SFX playback. */
    __audioContext?: AudioContext;
  }
}

export {};
