import type * as THREE from 'three';

/**
 * R3F accepts an async renderer factory. Keeping the import here makes
 * three/webgpu a progressive enhancement: browsers without WebGPU never pay
 * for the renderer chunk and continue using the existing WebGL renderer.
 */
export async function createOracleWebGPURenderer(
  props: { canvas: HTMLCanvasElement; antialias?: boolean; alpha?: boolean },
): Promise<THREE.WebGLRenderer> {
  const { WebGPURenderer } = await import('three/webgpu');
  const renderer = new WebGPURenderer({
    canvas: props.canvas,
    antialias: props.antialias ?? false,
    alpha: props.alpha ?? true,
  });
  await renderer.init();
  // R3F's public GLProps is typed around WebGLRenderer. WebGPURenderer
  // intentionally exposes the same renderer surface for scene rendering.
  return renderer as unknown as THREE.WebGLRenderer;
}