/**
 * OracleFaceRenderer.ts
 *
 * Pixel-accurate talking-head lip sync for a static face image.
 * Inspired by the technique used in Wav2Lip / SadTalker / D-ID:
 *   1. Identify the exact mouth region in the source image.
 *   2. Each frame: redraw the full face, then warp the actual lip
 *      pixels — upper strip shifts up, lower strip shifts down,
 *      gap filled with dark cavity, edges feathered to surrounding skin.
 *   3. No synthetic overlays. The animated mouth IS the face pixels.
 *
 * Works entirely in the browser via Canvas 2D API.
 * No server calls. No WebAssembly. No model weights.
 * CORS-safe: only uses drawImage(), never getImageData().
 *
 * ── Face Spatial Map (ORACLE_AVATAR_URL = 1280×640 JPEG) ─────────────────
 *
 *   Object-fit:cover in a SQUARE container:
 *     – Height fills exactly → scale = containerSize / 640
 *     – Displayed width = 1280 * scale = 2 * containerSize → crop each side by containerSize/2
 *     – Visible source x range: [320, 960]  (centre 640px of 1280)
 *
 *   Known anchor points (% of container, from face analysis):
 *     Crown  : X=50%  Y= 8%
 *     Eyes   : X=50%  Y=33%
 *     Nose   : X=50%  Y=52%
 *     MOUTH  : X=50%  Y=61%   ← lip midline
 *     Chin   : X=50%  Y=72%
 *     Mouth natural width in container ≈ 15%
 *
 *   Mouth region in SOURCE IMAGE pixels (1280×640):
 *     Centre  : (640, 390)
 *     Width   : ~100 px  → left=590, right=690
 *     Height  : ~44  px  → top=368, bottom=412
 *     Upper lip strip: y [368, 389]  (21 px)
 *     Lower lip strip: y [391, 412]  (21 px)
 *     Lip midline:     y  390
 */

import type { VisemeState } from './visemeDetector';

// ── Source image constants ────────────────────────────────────────────────────
const IMG_W = 1280;
const IMG_H = 640;

// Mouth region in source-image pixel space.
// Tune these if the face image changes (measure in an image editor).
const MOUTH = {
  cx: 640,   // horizontal centre of lips in source image
  midY: 390, // vertical lip midline (closed-mouth seam)
  halfW: 50, // half-width of mouth region (total mouth = 100px in source)
  ulTop: 368, ulBot: 389,  // upper lip strip y-range in source
  llTop: 391, llBot: 412,  // lower lip strip y-range in source
  // Skin-fill strip: pixels just ABOVE upper lip (philtrum area).
  // This covers the original mouth position before we redraw the warped lips.
  skinTop: 345, skinBot: 368,
  // Width of the erase patch — slightly wider than lips to catch corners
  eraseHalfW: 58,
};

// ── OracleFaceRenderer ────────────────────────────────────────────────────────

export class OracleFaceRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private img: HTMLImageElement | null = null;

  // ── Idle animation state ─────────────────────────────────────────────────────
  // Drives a continuous breathing + blink cycle that plays between Oracle turns.
  // Gives the face "presence" even when silent — it is alive, not a static image.
  private idleRafId  = 0;
  private blinkNextAt    = 0;
  private blinkStartedAt = -1;
  private readonly BLINK_MS = 180;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('OracleFaceRenderer: 2D context unavailable');
    this.ctx = ctx;
  }

  /**
   * Load a face image. Accepts a data: URL or a same/CORS-enabled https: URL.
   * Callers should pass `oracleAvatarDataUrl` (the base64 pre-fetch) to avoid
   * any cross-origin canvas tainting concerns.
   */
  loadFace(src: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        this.img = img;
        this.drawIdle();
        resolve();
      };
      img.onerror = () => reject(new Error('OracleFaceRenderer: image load failed — ' + src.slice(0, 60)));
      img.src = src;
    });
  }

  isReady() {
    return this.img !== null;
  }

  /**
   * Start the idle animation loop — breathing pulse + random blinks.
   * Should be called immediately after loadFace() resolves, before any
   * VisemeDetector is attached. Once VisemeDetector starts calling drawIdle()
   * at 60fps, call stopIdleAnimation() so only one loop drives the canvas.
   */
  startIdleAnimation() {
    if (this.idleRafId) return; // already running
    const tick = () => {
      this._drawIdleFrame(performance.now());
      this.idleRafId = requestAnimationFrame(tick);
    };
    this.idleRafId = requestAnimationFrame(tick);
  }

  /** Stop the internal idle animation loop (VisemeDetector takes over). */
  stopIdleAnimation() {
    if (this.idleRafId) {
      cancelAnimationFrame(this.idleRafId);
      this.idleRafId = 0;
    }
  }

  /**
   * Render the idle (silent) face.
   * Time-aware: includes breathing pulse + blink so the face stays alive
   * between Oracle turns (called by VisemeDetector at 60fps when amplitude < 0.04).
   */
  drawIdle() {
    if (!this.img) return;
    this._drawIdleFrame(performance.now());
  }

  /** Internal time-aware idle frame: base face + green breath pulse + blink. */
  private _drawIdleFrame(now: number) {
    if (!this.img) return;
    this._drawBase();

    // ── Breathing: a very subtle green tint that pulses over ~4 s ─────────────
    // Oracle's presence breathes through the alley walls — 0→2.5% green overlay
    const breathAlpha = ((Math.sin(now * 0.00157) + 1) / 2) * 0.022; // ±2.2%
    if (breathAlpha > 0.001) {
      this.ctx.save();
      this.ctx.fillStyle = `rgba(0, 255, 136, ${breathAlpha.toFixed(4)})`;
      this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      this.ctx.restore();
    }

    // ── Blink state machine ───────────────────────────────────────────────────
    if (this.blinkNextAt === 0) {
      // First-time init: first blink in 3–8 seconds
      this.blinkNextAt = now + 3000 + Math.random() * 5000;
    }

    if (this.blinkStartedAt >= 0) {
      const elapsed = now - this.blinkStartedAt;
      if (elapsed < this.BLINK_MS) {
        this._drawBlink(elapsed / this.BLINK_MS);
      } else {
        this.blinkStartedAt = -1;
        this.blinkNextAt = now + 3000 + Math.random() * 5500;
      }
    } else if (now >= this.blinkNextAt) {
      this.blinkStartedAt = now;
    }
  }

  /**
   * Draw an eyelid close-open cycle over the eye region.
   * progress 0→1: blink from open → closed → open (bell curve via sin).
   * Uses face coordinates: eyes at ~25–42% canvas height, full width.
   */
  private _drawBlink(progress: number) {
    const { ctx, canvas } = this;
    const cw = canvas.width;
    const ch = canvas.height;

    const closeFraction = Math.sin(progress * Math.PI); // 0→1→0 bell
    if (closeFraction < 0.02) return;

    // Eye band: Y = 23–43% of canvas height (covers both eyes + brow)
    const bandTop = 0.23 * ch;
    const bandH   = 0.20 * ch;
    const lidH    = bandH * closeFraction * 0.90;
    const alpha   = closeFraction * 0.80;

    ctx.save();
    ctx.fillStyle = `rgba(8, 4, 12, ${alpha.toFixed(3)})`;
    // Top eyelid: descends from brow
    ctx.fillRect(0, bandTop, cw, lidH);
    // Bottom eyelid: rises from cheekbone
    ctx.fillRect(0, bandTop + bandH - lidH, cw, lidH);
    ctx.restore();
  }

  /**
   * Render the face with viseme-driven mouth warp.
   *
   * Technique (mirroring Wav2Lip's per-frame pipeline in canvas 2D):
   *   1. Draw full face image (object-fit:cover simulation).
   *   2. Cover the original mouth region with skin sampled from the
   *      philtrum (area just above the lips). This erases the static mouth.
   *   3. Fill the inter-lip gap with a dark cavity shape.
   *   4. Redraw the upper lip strip from source, shifted UP by `separation`.
   *   5. Redraw the lower lip strip from source, shifted DOWN by `separation`.
   *   6. Feather edges so the transplanted lips blend into surrounding skin.
   *   7. Optional: subtle oracle glow composite at high amplitude.
   */
  drawViseme(state: VisemeState) {
    if (!this.img) return;

    const { amplitude, openness, spread } = state;

    if (amplitude < 0.04) {
      this._drawBase();
      return;
    }

    const { ctx, canvas, img } = this;
    const cw = canvas.width;
    const ch = canvas.height;

    // ── Object-fit:cover geometry ─────────────────────────────────────────────
    const scale      = ch / IMG_H;
    const displayedW = IMG_W * scale;          // wider than canvas (2× for 2:1 image)
    const cropX      = (displayedW - cw) / 2;  // pixels cropped each side in display space

    // Convert source image x-coordinate to canvas x-coordinate
    const srcToCanvasX = (sx: number) => sx * scale - cropX;
    // Source region x offset to align sampled strip to canvas mouth position
    const srcX_offset  = cropX / scale;         // source x to start at left canvas edge

    // ── Mouth region in canvas space ──────────────────────────────────────────
    const mcx = srcToCanvasX(MOUTH.cx);       // mouth centre x in canvas
    const midY = MOUTH.midY  * scale;         // lip midline y in canvas
    const ulTop = MOUTH.ulTop * scale;
    const ulBot = MOUTH.ulBot * scale;
    const llTop = MOUTH.llTop * scale;
    const llBot = MOUTH.llBot * scale;

    const ulH = ulBot - ulTop;  // upper lip strip height in canvas
    const llH = llBot - llTop;  // lower lip strip height in canvas

    // Lip width: viseme spread drives horizontal extent.
    // At spread=0 (pucker): 90% of natural width.  At spread=1 (smile): 120%.
    const naturalHalfW = MOUTH.halfW * scale;
    const halfW        = naturalHalfW * (0.90 + spread * 0.30);

    // Separation: how far lips move from midline.
    // Scales with openness; clamped so corners stay anatomically plausible.
    const separation   = Math.max(0, openness) * naturalHalfW * 0.75;

    // ── 1. Draw full face ─────────────────────────────────────────────────────
    this._drawBase();

    // ── 2. Erase original mouth — fill with philtrum skin ────────────────────
    // Sample the philtrum (skin just above the upper lip).
    // Using drawImage(src, srcX, srcY, srcW, srcH, dstX, dstY, dstW, dstH).
    const skinSrcY  = MOUTH.skinTop;
    const skinSrcH  = MOUTH.skinBot - MOUTH.skinTop;
    const eraseSrcX = MOUTH.cx - MOUTH.eraseHalfW;  // source x for erase patch
    const eraseSrcW = MOUTH.eraseHalfW * 2;
    const eraseDstX = mcx - MOUTH.eraseHalfW * scale;
    const eraseDstW = eraseSrcW * scale;
    const eraseDstY = ulTop - ulH * 0.15;           // start slightly above lips
    const eraseDstH = (llBot - ulTop) * scale * 1.1; // cover the full mouth height + small margin

    ctx.drawImage(
      img,
      eraseSrcX, skinSrcY, eraseSrcW, skinSrcH, // source: philtrum strip
      eraseDstX, eraseDstY, eraseDstW, eraseDstH, // dest: over original mouth region
    );

    // ── 3. Dark cavity between the separated lips ─────────────────────────────
    if (openness > 0.06) {
      // Cavity dimensions scale with separation and spread
      const cavHalfW = halfW * (0.72 + spread * 0.18);
      const cavHalfH = Math.max(1, separation * 0.88);
      const cavCX    = mcx;
      const cavCY    = midY;

      ctx.save();
      // Elliptical opening — more rounded for H/G (round vowels), flatter for E (smile)
      const xRad = cavHalfW;
      const yRad = cavHalfH;

      ctx.beginPath();
      ctx.ellipse(cavCX, cavCY, xRad, yRad, 0, 0, Math.PI * 2);

      // Gradient fill — darker at back of mouth, slightly lighter at opening edge
      const cavGrad = ctx.createRadialGradient(cavCX, cavCY - yRad * 0.1, 0, cavCX, cavCY, yRad * 1.2);
      cavGrad.addColorStop(0,   `rgba(2, 1, 1, ${0.97})`);
      cavGrad.addColorStop(0.7, `rgba(4, 2, 2, ${0.93})`);
      cavGrad.addColorStop(1,   `rgba(8, 4, 4, ${0.80})`);
      ctx.fillStyle = cavGrad;
      ctx.fill();

      // Teeth hint: only for wide-open vowels (A, E, D) — visible at high openness + spread
      if (openness > 0.45 && spread > 0.30) {
        const teethOpacity = Math.min(0.55, (openness - 0.45) * 1.1);
        const teethW = cavHalfW * 1.5;
        const teethH = Math.min(cavHalfH * 0.30, scale * 5);
        ctx.fillStyle = `rgba(218, 208, 200, ${teethOpacity})`;
        ctx.fillRect(cavCX - teethW / 2, cavCY - cavHalfH, teethW, teethH);
      }
      ctx.restore();
    }

    // ── 4. Upper lip: source pixels shifted UP ────────────────────────────────
    // Sample the upper lip strip from the original source image.
    // Widen/narrow by lipW; shift up by separation.
    const ulSrcW = (halfW / scale) * 2;          // source width to sample (proportional)
    const ulSrcX = MOUTH.cx - ulSrcW / 2;        // source x (may shift for spread skew)
    const ulDstX = mcx - halfW;
    const ulDstY = ulTop - separation * 0.60;    // shift the upper lip UP
    const ulDstW = halfW * 2;

    ctx.drawImage(
      img,
      ulSrcX, MOUTH.ulTop, ulSrcW, (MOUTH.ulBot - MOUTH.ulTop), // source strip
      ulDstX, ulDstY, ulDstW, ulH,                              // dest: shifted up
    );

    // ── 5. Lower lip: source pixels shifted DOWN ──────────────────────────────
    const llSrcX = ulSrcX; // same horizontal sampling
    const llDstX = ulDstX;
    const llDstY = llTop + separation * 0.40;    // shift the lower lip DOWN
    const llDstW = ulDstW;

    ctx.drawImage(
      img,
      llSrcX, MOUTH.llTop, ulSrcW, (MOUTH.llBot - MOUTH.llTop), // source strip
      llDstX, llDstY, llDstW, llH,                              // dest: shifted down
    );

    // ── 6. Edge feathering — blend warped lips into surrounding face ─────────
    // A subtle radial gradient mask softens the hard edges of the transplanted strips.
    ctx.save();
    const edgeR = halfW * 1.25;
    const edgeGrad = ctx.createRadialGradient(mcx, midY, halfW * 0.55, mcx, midY, edgeR);
    edgeGrad.addColorStop(0,   'rgba(0,0,0,0)');
    edgeGrad.addColorStop(0.7, 'rgba(0,0,0,0)');
    edgeGrad.addColorStop(1,   'rgba(0,0,0,0.18)');
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = edgeGrad;
    ctx.fillRect(mcx - edgeR, midY - edgeR, edgeR * 2, edgeR * 2);
    ctx.globalCompositeOperation = 'source-over';
    ctx.restore();

    // ── 7. Oracle glow — green shimmer at high amplitude ─────────────────────
    if (amplitude > 0.15) {
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      const glowAlpha = (amplitude - 0.15) * 0.10;
      const glowGrad = ctx.createRadialGradient(mcx, midY, 0, mcx, midY, halfW * 1.6);
      glowGrad.addColorStop(0,   `rgba(0, 255, 136, ${glowAlpha})`);
      glowGrad.addColorStop(0.6, `rgba(0, 255, 136, ${glowAlpha * 0.4})`);
      glowGrad.addColorStop(1,   'rgba(0, 255, 136, 0)');
      ctx.fillStyle = glowGrad;
      ctx.beginPath();
      ctx.ellipse(mcx, midY, halfW * 1.6, naturalHalfW * 0.8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  // ── Internal helpers ────────────────────────────────────────────────────────

  /** Simulate object-fit:cover for a landscape image in a square canvas. */
  private _drawBase() {
    if (!this.img) return;
    const { ctx, canvas } = this;
    const cw = canvas.width;
    const ch = canvas.height;

    const scale      = ch / IMG_H;
    const displayedW = IMG_W * scale;
    const cropX      = (displayedW - cw) / 2;

    // Source rect that maps to the full canvas (covers it exactly)
    const srcX = cropX / scale;
    const srcW = cw / scale;

    ctx.drawImage(this.img, srcX, 0, srcW, IMG_H, 0, 0, cw, ch);
  }

  destroy() {
    this.stopIdleAnimation();
    this.img = null;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }
}
