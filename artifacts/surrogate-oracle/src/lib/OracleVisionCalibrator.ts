/**
 * OracleVisionCalibrator.ts
 *
 * One-time vision pass to calibrate the Oracle portrait.
 * Uses MediaPipe Face Landmarker to identify precise lip/jaw coordinates.
 * Masked by the Lore sequence to ensure zero perceived latency.
 */

import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';

export interface OracleFaceMap {
  mouthCenter: { x: number; y: number };
  lipTop: number;
  lipBottom: number;
  lipLeft: number;
  lipRight: number;
  jawBottom: number;
  // High-density landmarks for WebGL mesh (indices 0-467)
  landmarks: Array<{ x: number; y: number; z: number }>;
}

let faceLandmarker: FaceLandmarker | null = null;

/**
 * Initialize the vision model.
 * Should be called at the very start of the Lore sequence.
 */
export async function initVisionModel() {
  if (faceLandmarker) return;
  
  const vision = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
  );
  
  faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`,
      delegate: "GPU"
    },
    outputFaceBlendshapes: true,
    runningMode: "IMAGE",
    numFaces: 1
  });
}

/**
 * Calibrate the Oracle portrait.
 * Returns a coordinate map used by OracleFaceRenderer.
 */
export async function calibrateOracle(imageElement: HTMLImageElement): Promise<OracleFaceMap | null> {
  if (!faceLandmarker) {
    await initVisionModel();
  }
  
  if (!faceLandmarker) return null;

  const result = faceLandmarker.detect(imageElement);
  if (!result.faceLandmarks || result.faceLandmarks.length === 0) {
    console.warn('[Vision] No face detected in portrait for calibration');
    return null;
  }

  const landmarks = result.faceLandmarks[0];

  // MediaPipe Landmark Indices:
  // Upper Lip Top: 0, 11, 12, 13, 14, 15, 16, 17... (Inner: 13, Outer: 0)
  // Lower Lip Bottom: 14, 15... (Outer: 17)
  // Lip Corners: 61, 291
  // Jaw: 152
  
  // Normalised coordinates (0.0 - 1.0)
  const lipTop = landmarks[0].y;
  const lipBottom = landmarks[17].y;
  const lipLeft = landmarks[61].x;
  const lipRight = landmarks[291].x;
  const jawBottom = landmarks[152].y;

  return {
    mouthCenter: { 
      x: (lipLeft + lipRight) / 2, 
      y: (lipTop + lipBottom) / 2 
    },
    lipTop,
    lipBottom,
    lipLeft,
    lipRight,
    jawBottom,
    landmarks: landmarks.map(l => ({ x: l.x, y: l.y, z: l.z }))
  };
}

/**
 * Cleanup vision model to free memory.
 * Call this once calibration is complete.
 */
export function disposeVisionModel() {
  if (faceLandmarker) {
    faceLandmarker.close();
    faceLandmarker = null;
  }
}
