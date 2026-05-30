/**
 * OracleFaceRenderer.ts
 *
 * Enterprise-grade WebGL mesh-warp lip sync for the Oracle portrait.
 * Uses MediaPipe landmark skinning for anatomically accurate deformation.
 */

import type { VisemeState } from './visemeDetector';
import type { OracleFaceMap } from './OracleVisionCalibrator';

const VS = `
  attribute vec2 a_pos;
  attribute vec2 a_uv;
  varying   vec2 v_uv;
  void main() {
    gl_Position = vec4(a_pos, 0.0, 1.0);
    v_uv = a_uv;
  }
`;

const FS = `
  precision mediump float;
  uniform sampler2D u_tex;
  varying vec2 v_uv;
  void main() {
    gl_FragColor = texture2D(u_tex, v_uv);
  }
`;

const SHAPES: Record<string, { open: number; spread: number; rounded: number }> = {
  X: { open: 0.00, spread: 0.15, rounded: 0.00 },
  B: { open: 0.00, spread: 0.10, rounded: 0.00 },
  C: { open: 0.12, spread: 0.45, rounded: 0.10 },
  D: { open: 0.24, spread: 0.35, rounded: 0.15 },
  E: { open: 0.18, spread: 0.92, rounded: 0.05 },
  F: { open: 0.30, spread: 0.18, rounded: 0.20 },
  G: { open: 0.58, spread: 0.30, rounded: 0.65 },
  H: { open: 0.80, spread: 0.45, rounded: 0.88 },
  A: { open: 0.95, spread: 0.55, rounded: 0.20 },
};

const ROWS = 32; // Higher resolution for enterprise
const COLS = 32;
const VERTS = (ROWS + 1) * (COLS + 1);

// MediaPipe Landmark Groups — Mouth & Jaw
const L_UPPER_LIP = [0, 11, 12, 13, 37, 38, 39, 40, 80, 81, 82, 185, 191, 267, 268, 269, 270, 310, 311, 312, 415];
const L_LOWER_LIP = [14, 15, 16, 17, 18, 84, 87, 88, 91, 95, 146, 178, 181, 314, 317, 318, 321, 324, 402, 405, 409];
const L_CORNERS   = [61, 291, 78, 308];
const L_JAW       = [152, 148, 149, 150, 176, 377, 378, 379, 399, 400];

// MediaPipe Landmark Groups — Eyes & Brows
const L_LEFT_UPPER_LID  = [159, 160, 161, 246, 163, 144, 145, 153, 158, 157];
const L_LEFT_LOWER_LID  = [145, 153, 154, 155, 133, 173];
const L_RIGHT_UPPER_LID = [386, 385, 384, 398, 390, 373, 374, 380, 381, 387];
const L_RIGHT_LOWER_LID = [374, 380, 381, 382, 362, 249];
const L_LEFT_BROW       = [46, 53, 52, 65, 55, 70, 63, 105, 66, 107];
const L_RIGHT_BROW      = [276, 283, 282, 295, 285, 300, 293, 334, 296, 336];

export class OracleFaceRenderer {
  private canvas: HTMLCanvasElement;
  private gl: WebGLRenderingContext;
  private program: WebGLProgram | null = null;
  private texture: WebGLTexture | null = null;
  private img: HTMLImageElement | null = null;

  private basePos  = new Float32Array(VERTS * 2);
  private pos      = new Float32Array(VERTS * 2);
  private uvs      = new Float32Array(VERTS * 2);
  private indices  = new Uint16Array(ROWS * COLS * 6);

  // Skinning data: each vertex mapped to 2 nearest landmarks
  private skinIndices = new Int32Array(VERTS * 2); 
  private skinWeights = new Float32Array(VERTS * 2);

  private posBuffer: WebGLBuffer | null = null;
  private uvBuffer:  WebGLBuffer | null = null;
  private idxBuffer: WebGLBuffer | null = null;

  private idleRafId      = 0;
  private blinkNextAt    = 0;
  private blinkStartedAt = -1;
  private readonly BLINK_MS = 180;

  private _lerpOpen    = 0;
  private _lerpSpread  = 0.15;
  private _lerpRounded = 0;

  // Eye blendshape lerp targets
  private _lerpBrowRaise = 0;
  private _lerpEyeSquint = 0;
  private _lerpEyeAlert  = 0;

  private _tiltX = 0;
  private _tiltY = 0;

  private faceMap: OracleFaceMap | null = null;
  private uStart = 0;
  private uEnd   = 1;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.gl = canvas.getContext('webgl', { alpha: true, antialias: true, powerPreference: 'high-performance' })!;
    this._initShaders();
    this._buildMesh();
  }

  isReady(): boolean { return this.img !== null; }

  loadFace(src: string): Promise<void> {
    console.log('[OracleFaceRenderer] Loading face from:', src);
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        console.log('[OracleFaceRenderer] Image loaded successfully:', img.width, 'x', img.height);
        this.img = img;
        this._computeUVs();
        this._uploadTexture();
        resolve();
      };
      img.onerror = (err) => {
        console.error('[OracleFaceRenderer] Image load failed for:', src, err);
        reject(new Error('OracleFaceRenderer: image load failed'));
      };
      img.src = src;
    });
  }

  private _computeUVs() {
    if (!this.img) return;
    const imgAspect = this.img.width / (this.img.height || 1);
    let canvasAspect = 1.0;
    if (this.canvas.width > 0 && this.canvas.height > 0) {
      canvasAspect = this.canvas.width / this.canvas.height;
    }

    // Cover logic: crop the image to fit the canvas aspect ratio
    if (imgAspect > canvasAspect) {
      // Image is wider than canvas — crop sides
      const visibleWidth = canvasAspect / imgAspect;
      this.uStart = 0.5 - visibleWidth / 2;
      this.uEnd   = 0.5 + visibleWidth / 2;
    } else {
      // Image is taller than canvas — crop top/bottom
      this.uStart = 0;
      this.uEnd   = 1;
    }

    // Update UV buffer
    for (let r = 0; r <= ROWS; r++) {
      for (let c = 0; c <= COLS; c++) {
        const i = (r * (COLS + 1) + c) * 2;
        const nx = c / COLS, ny = r / ROWS;
        this.uvs[i] = this.uStart + nx * (this.uEnd - this.uStart);
        this.uvs[i + 1] = ny;
      }
    }
    if (this.gl && this.uvBuffer) {
      this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.uvBuffer);
      this.gl.bufferData(this.gl.ARRAY_BUFFER, this.uvs, this.gl.STATIC_DRAW);
    }

    // If already calibrated, re-compute skinning as landmarks might have shifted in UV space
    if (this.faceMap) {
      this._computeSkinning();
    }
  }

  calibrate(map: OracleFaceMap) {
    this.faceMap = map;
    this._computeSkinning();
  }

  private _computeSkinning() {
    if (!this.faceMap) return;
    const lms = this.faceMap.landmarks;

    for (let i = 0; i < VERTS; i++) {
      const vx = (this.basePos[i * 2] + 1) / 2; // 0..1 clip space
      // u = uStart + nx * (uEnd - uStart)
      const u = this.uStart + vx * (this.uEnd - this.uStart);
      const v = 1 - (this.basePos[i * 2 + 1] + 1) / 2;

      // Find 2 nearest landmarks
      let bestD1 = Infinity, bestD2 = Infinity;
      let bestI1 = 0, bestI2 = 0;

      for (let j = 0; j < lms.length; j++) {
        const dx = u - lms[j].x;
        const dy = v - lms[j].y;
        const d = dx * dx + dy * dy;
        if (d < bestD1) {
          bestD2 = bestD1; bestI2 = bestI1;
          bestD1 = d; bestI1 = j;
        } else if (d < bestD2) {
          bestD2 = d; bestI2 = j;
        }
      }

      this.skinIndices[i * 2]     = bestI1;
      this.skinIndices[i * 2 + 1] = bestI2;

      const w1 = 1 / (Math.sqrt(bestD1) + 1e-6);
      const w2 = 1 / (Math.sqrt(bestD2) + 1e-6);
      const sum = w1 + w2;
      this.skinWeights[i * 2]     = w1 / sum;
      this.skinWeights[i * 2 + 1] = w2 / sum;
    }
  }

  drawViseme(state: VisemeState) {
    if (!this.img) return;
    const { amplitude, viseme, openness, rounded } = state;
    
    // Update data attributes for smoke tests / debug visibility
    this.canvas.dataset.viseme = viseme;
    this.canvas.dataset.amplitude = amplitude.toFixed(3);
    this.canvas.dataset.visemeActive = amplitude > 0.01 ? 'true' : 'false';

    const target = SHAPES[viseme] ?? SHAPES.A;
    const scale  = 0.40 + amplitude * 0.85;

    const LERP_MOUTH = 0.50;
    this._lerpOpen    += (target.open    * scale - this._lerpOpen)    * LERP_MOUTH;
    this._lerpSpread  += (target.spread         - this._lerpSpread)   * LERP_MOUTH;
    this._lerpRounded += (target.rounded        - this._lerpRounded)  * LERP_MOUTH;

    // Eye blendshapes — derived from speech features
    const targetBrowRaise = openness * 0.40 + (amplitude > 0.65 ? 0.14 : 0);
    const targetEyeSquint = rounded * 0.30;
    const targetEyeAlert  = amplitude > 0.75 ? (amplitude - 0.75) * 0.40 : 0;

    const LERP_EYE = 0.18;
    this._lerpBrowRaise += (targetBrowRaise - this._lerpBrowRaise) * LERP_EYE;
    this._lerpEyeSquint += (targetEyeSquint - this._lerpEyeSquint) * LERP_EYE;
    this._lerpEyeAlert  += (targetEyeAlert  - this._lerpEyeAlert)  * LERP_EYE;

    this._drawFrame(performance.now());
  }

  private _deformMesh(now: number) {
    const open    = this._lerpOpen;
    const spread  = this._lerpSpread;
    const rounded = this._lerpRounded;
    const breath  = Math.sin(now * 0.00157) * 0.003;

    const blinkT = this.blinkStartedAt >= 0
      ? Math.min(1, (now - this.blinkStartedAt) / this.BLINK_MS)
      : 0;
    const blinkCurve = Math.sin(blinkT * Math.PI); // 0 → 1 → 0

    // 1. Compute landmark displacements
    const deltas = new Float32Array(468 * 2);
    if (this.faceMap) {
      const lms = this.faceMap.landmarks;
      for (let j = 0; j < 468; j++) {
        let dx = 0, dy = 0;

        if (L_UPPER_LIP.includes(j)) {
          dy -= open * 0.015;
        } else if (L_LOWER_LIP.includes(j)) {
          dy += open * 0.06;
        } else if (L_JAW.includes(j)) {
          dy += open * 0.08;
        } else if (L_CORNERS.includes(j)) {
          const sx = lms[j].x > this.faceMap.mouthCenter.x ? 1 : -1;
          dx += (spread - 0.15) * 0.02 * sx;
          dy += open * 0.025;
        }
        else if (L_LEFT_BROW.includes(j) || L_RIGHT_BROW.includes(j)) {
          dy -= this._lerpBrowRaise * 0.030;
        }
        else if (L_LEFT_UPPER_LID.includes(j) || L_RIGHT_UPPER_LID.includes(j)) {
          dy += this._lerpEyeSquint * 0.012;
          dy -= this._lerpEyeAlert  * 0.010;
          dy += blinkCurve          * 0.035;
        }
        else if (L_LEFT_LOWER_LID.includes(j) || L_RIGHT_LOWER_LID.includes(j)) {
          dy -= this._lerpEyeSquint * 0.008;
          dy -= blinkCurve          * 0.010;
        }

        const du = lms[j].x - this.faceMap.mouthCenter.x;
        const dv = lms[j].y - this.faceMap.mouthCenter.y;
        const dist = Math.sqrt(du * du + dv * dv);
        if (dist < 0.1) {
          const p = (rounded - 0.1) * 0.02;
          dx -= du * p;
          dy -= dv * p;
        }

        deltas[j * 2]     = dx;
        deltas[j * 2 + 1] = dy;
      }
    }

    // 2. Apply skinning to grid
    for (let i = 0; i < VERTS; i++) {
      const bx = this.basePos[i * 2];
      const by = this.basePos[i * 2 + 1];

      let dx = 0, dy = 0;
      if (this.faceMap) {
        const i1 = this.skinIndices[i * 2];
        const i2 = this.skinIndices[i * 2 + 1];
        const w1 = this.skinWeights[i * 2];
        const w2 = this.skinWeights[i * 2 + 1];
        
        const dUX = (deltas[i1 * 2] * w1 + deltas[i2 * 2] * w2);
        const dUY = (deltas[i1 * 2 + 1] * w1 + deltas[i2 * 2 + 1] * w2);
        
        dx = dUX / (this.uEnd - this.uStart) * 2;
        dy = -dUY * 2;
      }

      const tx = this._tiltX, ty = this._tiltY;
      dx += tx * 0.05 * (1.0 - Math.abs(bx) * 0.4) + bx * tx * 0.08;
      dy += ty * 0.04 * (1.0 - Math.abs(by) * 0.4) + by * ty * 0.08;
      dy += breath;

      this.pos[i * 2]     = bx + dx;
      this.pos[i * 2 + 1] = by + dy;
    }
  }

  private _drawFrame(now: number) {
    if (!this.img || !this.program || !this.texture) return;
    const { gl, canvas } = this;
    this._deformMesh(now);

    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0.0, 0.05, 0.02, 0.0); // Faint emerald green tint clear (alpha 0)
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.program!);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.pos, gl.DYNAMIC_DRAW);
    const posLoc = gl.getAttribLocation(this.program!, 'a_pos');
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.uvBuffer);
    const uvLoc = gl.getAttribLocation(this.program!, 'a_uv');
    gl.enableVertexAttribArray(uvLoc);
    gl.vertexAttribPointer(uvLoc, 2, gl.FLOAT, false, 0, 0);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.uniform1i(gl.getUniformLocation(this.program!, 'u_tex'), 0);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.idxBuffer);
    gl.drawElements(gl.TRIANGLES, this.indices.length, gl.UNSIGNED_SHORT, 0);

    this._tickBlink(now);
  }

  private _initShaders() {
    const gl = this.gl;
    const compile = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      return s;
    };
    const vs = compile(gl.VERTEX_SHADER,   VS);
    const fs = compile(gl.FRAGMENT_SHADER, FS);
    const prog = gl.createProgram()!;
    gl.attachShader(prog, vs); gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    this.program = prog;
  }

  private _buildMesh() {
    const gl = this.gl;
    for (let r = 0; r <= ROWS; r++) {
      for (let c = 0; c <= COLS; c++) {
        const i = (r * (COLS + 1) + c) * 2;
        const nx = c / COLS, ny = r / ROWS;
        this.basePos[i] = nx * 2 - 1;
        this.basePos[i + 1] = 1 - ny * 2;
        this.uvs[i] = nx; 
        this.uvs[i + 1] = ny;
      }
    }
    this.pos.set(this.basePos);
    let k = 0;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const a = r * (COLS + 1) + c;
        const b = a + 1;
        const d = a + (COLS + 1);
        const e = d + 1;
        this.indices[k++] = a; this.indices[k++] = d; this.indices[k++] = b;
        this.indices[k++] = b; this.indices[k++] = d; this.indices[k++] = e;
      }
    }
    this.posBuffer = gl.createBuffer();
    this.uvBuffer = gl.createBuffer();
    this.idxBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.uvBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.uvs, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.idxBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, this.indices, gl.STATIC_DRAW);
  }

  private _uploadTexture() {
    if (!this.img) return;
    const gl = this.gl;
    this.texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.img);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  }

  private _tickBlink(now: number) {
    if (this.blinkNextAt === 0) this.blinkNextAt = now + 3000 + Math.random() * 5000;
    if (this.blinkStartedAt >= 0) {
      if (now - this.blinkStartedAt >= this.BLINK_MS) {
        this.blinkStartedAt = -1; this.blinkNextAt = now + 3000 + Math.random() * 5500;
      }
    } else if (now >= this.blinkNextAt) this.blinkStartedAt = now;
  }

  startIdleAnimation() {
    if (this.idleRafId) return;
    const tick = () => { this._drawFrame(performance.now()); this.idleRafId = requestAnimationFrame(tick); };
    this.idleRafId = requestAnimationFrame(tick);
  }

  stopIdleAnimation() { if (this.idleRafId) { cancelAnimationFrame(this.idleRafId); this.idleRafId = 0; } }

  drawIdle() { this._drawFrame(performance.now()); }
  setTilt(x: number, y: number) { this._tiltX = x; this._tiltY = y; }
  onResize() { this._computeUVs(); }
  destroy() {
    this.stopIdleAnimation(); this.img = null;
    if (this.texture) this.gl.deleteTexture(this.texture);
    if (this.posBuffer) this.gl.deleteBuffer(this.posBuffer);
    if (this.uvBuffer) this.gl.deleteBuffer(this.uvBuffer);
    if (this.idxBuffer) this.gl.deleteBuffer(this.idxBuffer);
  }
}
