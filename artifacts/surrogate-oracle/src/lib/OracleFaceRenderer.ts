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

const U_START = 0.25;
const U_END   = 0.75;
const ROWS = 32; // Higher resolution for enterprise
const COLS = 32;
const VERTS = (ROWS + 1) * (COLS + 1);

// MediaPipe Landmark Groups
const L_UPPER_LIP = [0, 11, 12, 13, 37, 38, 39, 40, 80, 81, 82, 185, 191, 267, 268, 269, 270, 310, 311, 312, 415];
const L_LOWER_LIP = [14, 15, 16, 17, 18, 84, 87, 88, 91, 95, 146, 178, 181, 314, 317, 318, 321, 324, 402, 405, 409];
const L_CORNERS   = [61, 291, 78, 308];
const L_JAW       = [152, 148, 149, 150, 176, 377, 378, 379, 399, 400];

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

  private _tiltX = 0;
  private _tiltY = 0;

  private faceMap: OracleFaceMap | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.gl = canvas.getContext('webgl', { alpha: false, antialias: true, powerPreference: 'high-performance' })!;
    this._initShaders();
    this._buildMesh();
  }

  isReady(): boolean { return this.img !== null; }

  loadFace(src: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        this.img = img;
        this._uploadTexture();
        resolve();
      };
      img.onerror = () => reject(new Error('OracleFaceRenderer: image load failed'));
      img.src = src;
    });
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
      // UV crop logic: mesh covers full -1..1 but texture is cropped.
      // u = U_START + nx * (U_END - U_START)
      const u = U_START + vx * (U_END - U_START);
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
    const { amplitude, viseme } = state;
    const target = SHAPES[viseme] ?? SHAPES.A;
    const scale  = 0.40 + amplitude * 0.85;

    const LERP = 0.50;
    this._lerpOpen    += (target.open    * scale - this._lerpOpen)    * LERP;
    this._lerpSpread  += (target.spread         - this._lerpSpread)   * LERP;
    this._lerpRounded += (target.rounded        - this._lerpRounded)  * LERP;

    this._drawFrame(performance.now());
  }

  private _deformMesh(now: number) {
    const open    = this._lerpOpen;
    const spread  = this._lerpSpread;
    const rounded = this._lerpRounded;
    const breath  = Math.sin(now * 0.00157) * 0.003;

    // 1. Compute landmark displacements
    const deltas = new Float32Array(468 * 2);
    if (this.faceMap) {
      const lms = this.faceMap.landmarks;
      for (let j = 0; j < 468; j++) {
        let dx = 0, dy = 0;
        
        if (L_UPPER_LIP.includes(j)) {
          dy -= open * 0.015; // Upper lip up slightly
        } else if (L_LOWER_LIP.includes(j)) {
          dy += open * 0.06;  // Lower lip down
        } else if (L_JAW.includes(j)) {
          dy += open * 0.08;  // Jaw down more
        } else if (L_CORNERS.includes(j)) {
          const sx = lms[j].x > this.faceMap.mouthCenter.x ? 1 : -1;
          dx += (spread - 0.15) * 0.02 * sx;
          dy += open * 0.025; // corners follow jaw a bit
        }
        
        // Pucker influence
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

        // Displacements are in UV space, convert back to clip space for pos
        // clipX = (u - U_START) / (U_END - U_START) * 2 - 1
        // clipY = 1 - v * 2
        // deltaClipX = deltaU / (U_END - U_START) * 2
        // deltaClipY = -deltaV * 2
        
        const dUX = (deltas[i1 * 2] * w1 + deltas[i2 * 2] * w2);
        const dUY = (deltas[i1 * 2 + 1] * w1 + deltas[i2 * 2 + 1] * w2);
        
        dx = dUX / (U_END - U_START) * 2;
        dy = -dUY * 2;
      }

      // 3. Perspective tilt
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
    gl.clearColor(0, 0, 0, 1);
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

  // ... (rest of methods: _initShaders, _buildMesh, _uploadTexture, _tickBlink, destroy, etc.)
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
        this.uvs[i] = U_START + nx * (U_END - U_START);
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
  destroy() {
    this.stopIdleAnimation(); this.img = null;
    if (this.texture) this.gl.deleteTexture(this.texture);
    if (this.posBuffer) this.gl.deleteBuffer(this.posBuffer);
    if (this.uvBuffer) this.gl.deleteBuffer(this.uvBuffer);
    if (this.idxBuffer) this.gl.deleteBuffer(this.idxBuffer);
  }
}
