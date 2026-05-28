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
 *     Crown  : X=50%  Y=12%
 *     Eyes   : X=50%  Y=34-40%
 *     Nose   : X=50%  Y=41%
 *     MOUTH  : X=50%  Y=48%   ← lip midline (Y=305 / 640)
 *     Chin   : X=50%  Y=52%
 *     Mouth natural width in container ≈ 16%
 *
 *   Mouth region in SOURCE IMAGE pixels (1280×640):
 *     Centre  : (640, 305)
 *     Width   : ~104 px  → left=588, right=692
 *     Height  : ~31  px  → top=289, bottom=320
 *     Upper lip strip: y [289, 302]  (13 px)
 *     Lower lip strip: y [303, 320]  (17 px)
 *     Lip midline:     y  305
 */

import type { VisemeState } from './visemeDetector';

// ── Source image constants ────────────────────────────────────────────────────
const IMG_W = 1280;
const IMG_H = 640;

// Mouth region in source-image pixel space — calibrated to the Oracle portrait
// (i.postimg.cc/jSGnyZXh/Image-1-(11).jpg, 1280×640).
//
// Verified by drawing horizontal scan lines + overlaying a red rectangle on the
// downloaded portrait and inspecting which Y values intersect the actual lips:
//   Crown  : Y≈ 80   Eyes  : Y≈220-255   Nose bottom : Y≈265
//   Mouth  : Y≈288-320   Chin : Y≈335   Face centre X ≈ 640
//
// Previous values (midY:344 and midY:390) both landed on the chin region.
// These corrected values land precisely on the lips.
const MOUTH = {
  cx: 640,    // horizontal centre of lips — face is perfectly centred in source image
  midY: 305,  // vertical lip midline (closed-mouth seam, Y≈305 verified by scan)
  halfW: 52,  // half-width of mouth region (~104px total)
  ulTop: 289, ulBot: 302,  // upper lip strip y-range in source
  llTop: 303, llBot: 320,  // lower lip strip y-range in source
  // Philtrum skin — just above the upper lip, used to erase the original mouth
  skinTop: 265, skinBot: 287,
  // Erase patch is wider than lips to cleanly catch the lip corners
  eraseHalfW: 62,
};

// ── Preston Blair viseme → canonical mouth shape ──────────────────────────────
// Each phoneme has a characteristic jaw-drop (openness) and lip-spread.
// drawViseme() lerps toward these targets so phoneme transitions are smooth,
// not the jerky amplitude-only warp the original pixel-shift produced.
const VISEME_SHAPES: Record<string, { openness: number; spread: number }> = {
  X: { openness: 0.00, spread: 0.15 }, // silence — rest position
  B: { openness: 0.00, spread: 0.10 }, // b / m / p — lips sealed
  C: { openness: 0.10, spread: 0.45 }, // d / k / n / s / th — slight slit
  D: { openness: 0.22, spread: 0.35 }, // th open — a touch wider
  E: { openness: 0.15, spread: 0.92 }, // ee / i — wide-flat smile, minimal drop
  F: { openness: 0.28, spread: 0.18 }, // f / v — lower lip tucked
  G: { openness: 0.55, spread: 0.30 }, // oh / u — rounded mid-open
  H: { openness: 0.78, spread: 0.45 }, // aw / open vowels — wide jaw
  A: { openness: 0.92, spread: 0.55 }, // ah — maximum jaw drop
};

// ── OracleFaceRenderer ────────────────────────────────────────────────────────

export class OracleFaceRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private img: HTMLImageElement | null = null;

  // ── Idle animation state ─────────────────────────────────────────────────────
  private idleRafId      = 0;
  private blinkNextAt    = 0;
  private blinkStartedAt = -1;
  private readonly BLINK_MS = 180;

  // ── Viseme lerp state — smooth phoneme-to-phoneme transitions ─────────────
  // Without this, mouth snaps between shapes every FFT frame (≈60fps stutter).
  private _lerpOpen   = 0;
  private _lerpSpread = 0.15;

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
    const { ctx, canvas, img } = this;
    if (!img) return;
    const cw = canvas.width;
    const ch = canvas.height;

    const closeFraction = Math.sin(progress * Math.PI); // 0→1→0 bell
    if (closeFraction < 0.02) return;

    // Eye band: Y = 32–48% canvas height (eyes at Y≈220-310 / 640 = 34-48%)
    const bandTop = 0.32 * ch;
    const bandH   = 0.16 * ch;
    const lidH    = bandH * closeFraction * 0.95;
    if (lidH < 1) return;

    // Portrait geometry — matches _drawBase() object-fit:cover calculation
    const scale = ch / IMG_H;
    const srcX  = (IMG_W * scale - cw) / 2 / scale;
    const srcW  = cw / scale;

    // Paint FACE SKIN pixels over the eye region — blink looks anatomically real
    // because the eyelid IS the face's own skin tone closing over the eye.
    //   Top lid : sample forehead strip (y 5–18% source) → descends from brow
    //   Bottom lid: sample upper-cheek strip (y 57–67% source) → rises from below
    ctx.save();
    ctx.globalAlpha = Math.min(0.95, closeFraction * 1.08);

    ctx.drawImage(img,
      srcX, 0.10 * IMG_H, srcW, 0.10 * IMG_H,  // source: forehead/brow skin
      0, bandTop,          cw, lidH              // dest: top eyelid descending
    );
    ctx.drawImage(img,
      srcX, 0.52 * IMG_H, srcW, 0.08 * IMG_H,  // source: cheek skin (below mouth)
      0, bandTop + bandH - lidH, cw, lidH        // dest: bottom eyelid rising
    );

    ctx.globalAlpha = 1;
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

    const { amplitude, viseme } = state;

    if (amplitude < 0.04) {
      // Lerp back toward rest so mouth closes smoothly rather than snapping shut
      const LERP_CLOSE = 0.40;
      this._lerpOpen   += (0 - this._lerpOpen)   * LERP_CLOSE;
      this._lerpSpread += (0.15 - this._lerpSpread) * LERP_CLOSE;
      this._drawBase();
      return;
    }

    // Look up the canonical shape for this phoneme, then lerp for smoothness.
    // Amplitude scales jaw drop — louder → fuller open within the viseme's range.
    const target = VISEME_SHAPES[viseme] ?? VISEME_SHAPES.A;
    const targetOpen   = target.openness * (0.45 + amplitude * 0.80);
    const targetSpread = target.spread;
    // VisemeDetector already smooths the raw FFT values at 35% per frame.
    // Renderer lerps at 55% — fast enough to track phonemes without double-lag.
    const LERP = 0.55;
    this._lerpOpen   += (targetOpen   - this._lerpOpen)   * LERP;
    this._lerpSpread += (targetSpread - this._lerpSpread)  * LERP;
    const openness = Math.max(0, Math.min(1, this._lerpOpen));
    const spread   = Math.max(0, Math.min(1, this._lerpSpread));

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
    // Boosted multiplier (1.2) for this CGI face — the natural mouth gap is very
    // subtle, so we need stronger separation to make open-jaw readable.
    const separation   = Math.max(0, openness) * naturalHalfW * 1.2;

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
