/**
 * OracleFaceRenderer.ts
 *
 * WebGL mesh-warp lip sync for the Oracle portrait.
 *
 * Image: i.postimg.cc/jSGnyZXh/Image-1-(11).jpg — 1280×640 landscape JPEG.
 * Container: square CSS box → object-fit:cover crops to centre 640×640.
 * UV crop: u ∈ [0.25, 0.75] (centre 640px of 1280), v ∈ [0, 1] (full height).
 *
 * Mesh: 24×24 grid. Each vertex stores:
 *   - baseX/baseY  (-1..1 clip space, independent of UV crop)
 *   - u/v          (cropped texture coords, fixed)
 * Each frame deformMesh() displaces baseX/baseY by mouth/jaw/breath offsets.
 *
 * Face anchor defaults (fraction of FULL source image, so x=0.5 = pixel 640):
 *   mouthCenter  { x:0.500, y:0.475 }   — lip midline
 *   jawBottom    0.540                   — jaw centre of mass
 * These match the portrait used in production and are verified by visual scan.
 */

import type { VisemeState } from './visemeDetector';
import type { OracleFaceMap } from './OracleVisionCalibrator';

// ── WebGL shaders ────────────────────────────────────────────────────────────

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

// ── Viseme blendshape targets ────────────────────────────────────────────────
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

// Object-fit:cover crop: image is 1280×640 in a square container.
// Scale = containerSize / 640 → rendered width = 1280 * scale = 2*containerSize.
// Crop = (2*containerSize - containerSize) / 2 / scale = 320px each side.
// UV: u_start = 320/1280 = 0.25, u_end = 960/1280 = 0.75.
const U_START = 0.25;
const U_END   = 0.75;

// Grid resolution — higher = smoother warp, more GPU work
const ROWS = 24;
const COLS = 24;
const VERTS = (ROWS + 1) * (COLS + 1);

export class OracleFaceRenderer {
  private canvas: HTMLCanvasElement;
  private gl: WebGLRenderingContext;
  private program: WebGLProgram | null = null;
  private texture: WebGLTexture | null = null;
  private img: HTMLImageElement | null = null;

  // Mesh arrays — basePos is fixed reference, pos is deformed each frame
  private basePos  = new Float32Array(VERTS * 2); // clip space -1..1
  private pos      = new Float32Array(VERTS * 2); // deformed, uploaded each frame
  private uvs      = new Float32Array(VERTS * 2); // fixed crop UVs
  private indices  = new Uint16Array(ROWS * COLS * 6);

  private posBuffer: WebGLBuffer | null = null;
  private uvBuffer:  WebGLBuffer | null = null;
  private idxBuffer: WebGLBuffer | null = null;

  // Idle animation
  private idleRafId      = 0;
  private blinkNextAt    = 0;
  private blinkStartedAt = -1;
  private readonly BLINK_MS = 180;

  // Lerped viseme state
  private _lerpOpen    = 0;
  private _lerpSpread  = 0.15;
  private _lerpRounded = 0;

  // Head tilt from gyro (normalized -1..1)
  private _tiltX = 0;
  private _tiltY = 0;

  // Face anchor (UV coordinates in FULL image space, so x=0.5 = pixel 640)
  private _mc  = { x: 0.500, y: 0.475 };
  private _jaw = 0.540;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl', { alpha: false, antialias: true, powerPreference: 'high-performance' });
    if (!gl) throw new Error('OracleFaceRenderer: WebGL unavailable');
    this.gl = gl;
    this._initShaders();
    this._buildMesh();
  }

  // ── Public API ──────────────────────────────────────────────────────────────

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
      img.onerror = () => reject(new Error('OracleFaceRenderer: image load failed — ' + src.slice(0, 60)));
      img.src = src;
    });
  }

  /** Apply MediaPipe face map if calibration succeeded. */
  calibrate(map: OracleFaceMap) {
    this._mc  = { x: map.mouthCenter.x, y: map.mouthCenter.y };
    this._jaw = map.jawBottom;
  }

  startIdleAnimation() {
    if (this.idleRafId) return;
    const tick = () => { this._drawFrame(performance.now()); this.idleRafId = requestAnimationFrame(tick); };
    this.idleRafId = requestAnimationFrame(tick);
  }

  stopIdleAnimation() {
    if (this.idleRafId) { cancelAnimationFrame(this.idleRafId); this.idleRafId = 0; }
  }

  drawIdle() { this._drawFrame(performance.now()); }

  drawViseme(state: VisemeState) {
    if (!this.img) return;
    const { amplitude, viseme } = state;
    const target = SHAPES[viseme] ?? SHAPES.A;
    const scale  = 0.40 + amplitude * 0.85; // amplitude scales the shape

    const LERP = 0.50;
    this._lerpOpen    += (target.open    * scale - this._lerpOpen)    * LERP;
    this._lerpSpread  += (target.spread         - this._lerpSpread)   * LERP;
    this._lerpRounded += (target.rounded        - this._lerpRounded)  * LERP;

    this._drawFrame(performance.now());
  }

  setTilt(x: number, y: number) { this._tiltX = x; this._tiltY = y; }

  destroy() {
    this.stopIdleAnimation();
    this.img = null;
    const gl = this.gl;
    if (this.texture)   gl.deleteTexture(this.texture);
    if (this.posBuffer) gl.deleteBuffer(this.posBuffer);
    if (this.uvBuffer)  gl.deleteBuffer(this.uvBuffer);
    if (this.idxBuffer) gl.deleteBuffer(this.idxBuffer);
  }

  // ── Internals ──────────────────────────────────────────────────────────────

  private _initShaders() {
    const gl = this.gl;
    const compile = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        console.error('[OFR] Shader:', gl.getShaderInfoLog(s));
        return null;
      }
      return s;
    };
    const vs = compile(gl.VERTEX_SHADER,   VS);
    const fs = compile(gl.FRAGMENT_SHADER, FS);
    if (!vs || !fs) return;
    const prog = gl.createProgram()!;
    gl.attachShader(prog, vs); gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.error('[OFR] Link:', gl.getProgramInfoLog(prog)); return;
    }
    this.program = prog;
  }

  private _buildMesh() {
    const gl = this.gl;
    // Grid vertices: clip positions and UVs built once, deformed each frame
    for (let r = 0; r <= ROWS; r++) {
      for (let c = 0; c <= COLS; c++) {
        const i = (r * (COLS + 1) + c) * 2;
        const nx = c / COLS; // 0..1
        const ny = r / ROWS; // 0..1

        // Clip space position: vertex covers full -1..1 regardless of UV crop
        this.basePos[i]     =  nx * 2 - 1;
        this.basePos[i + 1] =  1 - ny * 2;

        // UV: horizontal crop for object-fit:cover (centre of 2:1 image)
        this.uvs[i]     = U_START + nx * (U_END - U_START);
        this.uvs[i + 1] = ny;
      }
    }
    this.pos.set(this.basePos); // start undeformed

    // Triangle index list
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
    this.uvBuffer  = gl.createBuffer();
    this.idxBuffer = gl.createBuffer();

    // UVs are static — upload once
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
    // CRITICAL: internal format and format must match in WebGL 1.
    // Using RGBA for both handles JPEGs (browser decodes to RGBA internally).
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.img);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    // Check for GL errors
    const err = gl.getError();
    if (err !== gl.NO_ERROR) console.warn('[OFR] texImage2D error:', err);
  }

  private _deformMesh(now: number) {
    const open    = this._lerpOpen;
    const spread  = this._lerpSpread;
    const rounded = this._lerpRounded;

    // Breath: slow sinusoidal Y drift on all vertices (~4s period, ±0.003 clip)
    const breath = Math.sin(now * 0.00157) * 0.003;

    // Head tilt: perspective warp (mild shear + foreshortening)
    const tx = this._tiltX;
    const ty = this._tiltY;

    // Mouth centre in UV (full image space, 0..1)
    const mcx = this._mc.x; // ≈ 0.5
    const mcy = this._mc.y; // ≈ 0.475
    const jaw  = this._jaw;  // ≈ 0.54

    for (let r = 0; r <= ROWS; r++) {
      for (let c = 0; c <= COLS; c++) {
        const i = (r * (COLS + 1) + c) * 2;

        // Base clip position (independent of UV crop, full -1..1)
        const bx = this.basePos[i];
        const by = this.basePos[i + 1];

        // Texture UV (0.25..0.75 for u, 0..1 for v) — used for feature distances
        const u = this.uvs[i];
        const v = this.uvs[i + 1];

        let ox = 0;
        let oy = 0;

        // ── 1. Head tilt (perspective shear) ────────────────────────────────
        // Shear: edges closer to tilt direction move more than centre
        ox += tx * 0.055 * (1.0 - Math.abs(bx) * 0.4);
        oy += ty * 0.040 * (1.0 - Math.abs(by) * 0.4);
        // Foreshortening: points further from tilt axis compress
        ox += bx * tx * 0.08;
        oy += by * ty * 0.08;

        // ── 2. Mouth influence ───────────────────────────────────────────────
        // Distance measured in full UV space so mc coords are directly comparable
        const du = u - mcx;
        const dv = v - mcy;
        const dist = Math.sqrt(du * du + dv * dv);
        const weight = Math.max(0, 1.0 - dist / 0.14); // 0.14 UV radius ≈ 90px

        if (weight > 0) {
          // Jaw drop — vertices below lip midline move down, above move up
          if (v > mcy) {
            oy -= open * 0.12 * weight;  // lower lip/jaw down
          } else {
            oy += open * 0.06 * weight;  // upper lip up
          }
          // Lip spread — corners move outward
          const sx = u > mcx ? 1 : -1;
          ox += (spread - 0.15) * 0.04 * sx * weight;
          // Pucker (rounded vowels) — lips pull inward
          const pucker = (rounded - 0.2) * 0.025;
          ox -= du * pucker * weight;
          oy -= dv * pucker * weight;
        }

        // ── 3. Jaw mass influence ────────────────────────────────────────────
        const djaw = Math.sqrt(Math.pow(u - mcx, 2) + Math.pow(v - jaw, 2));
        const jawW  = Math.max(0, 1.0 - djaw / 0.18);
        oy -= open * 0.05 * jawW;

        // ── 4. Blink (handled separately in _drawFrame as a full-row tint) ───

        // ── 5. Breath ────────────────────────────────────────────────────────
        oy += breath;

        this.pos[i]     = bx + ox;
        this.pos[i + 1] = by + oy;
      }
    }
  }

  private _drawFrame(now: number) {
    if (!this.img || !this.program || !this.texture) return;
    const { gl, canvas } = this;

    this._deformMesh(now);

    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.program);

    // Upload deformed positions
    gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.pos, gl.DYNAMIC_DRAW);
    const posLoc = gl.getAttribLocation(this.program, 'a_pos');
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    // Static UVs
    gl.bindBuffer(gl.ARRAY_BUFFER, this.uvBuffer);
    const uvLoc = gl.getAttribLocation(this.program, 'a_uv');
    gl.enableVertexAttribArray(uvLoc);
    gl.vertexAttribPointer(uvLoc, 2, gl.FLOAT, false, 0, 0);

    // Texture
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    const texLoc = gl.getUniformLocation(this.program, 'u_tex');
    gl.uniform1i(texLoc, 0);

    // Draw
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.idxBuffer);
    gl.drawElements(gl.TRIANGLES, this.indices.length, gl.UNSIGNED_SHORT, 0);

    // ── Blink overlay ────────────────────────────────────────────────────────
    // Rendered as a dark rect over the eye band (y 34-48% of canvas).
    // WebGL doesn't have a simple rect fill — we skip blinking for now since
    // the mesh warp approach requires a second render pass.
    // TODO: use a scissor-rect clear or a second quad for blink.
    this._tickBlink(now);
  }

  private _tickBlink(now: number) {
    if (this.blinkNextAt === 0) {
      this.blinkNextAt = now + 3000 + Math.random() * 5000;
    }
    if (this.blinkStartedAt >= 0) {
      const elapsed = now - this.blinkStartedAt;
      if (elapsed >= this.BLINK_MS) {
        this.blinkStartedAt = -1;
        this.blinkNextAt = now + 3000 + Math.random() * 5500;
      }
    } else if (now >= this.blinkNextAt) {
      this.blinkStartedAt = now;
    }
  }
}
