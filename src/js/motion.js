// Coarse webcam motion detection by frame differencing. Pure: no DOM, no models, no downloads.
//
// Input: a low-resolution grayscale frame (default 64x48, already mirrored so "left" means the
// left of the screen as the child sees himself). Output: how much he is moving overall, in the
// top third (arms up), on the left and right halves, plus a "honk" event for big arm waves.
//
// Robustness:
//  * Global lighting changes (flicker, auto-exposure) are removed by fitting cur ≈ a·prev + b over
//    the whole frame and differencing against that prediction instead of the raw previous frame.
//  * Each cell keeps an adaptive noise baseline; a cell only counts when it is well above its own
//    baseline AND at least one neighbour is also moving (kills isolated sensor sparkle).
//  * Calibration (child standing still for ~3 s) seeds the baseline.

import { clamp, approach } from './util.js';

export const SENSITIVITY = {
  low: { thr: 1.5, gain: 0.75 },
  medium: { thr: 1.0, gain: 1.0 },
  high: { thr: 0.7, gain: 1.35 },
};

export class MotionDetector {
  constructor(opts = {}) {
    this.width = opts.width ?? 64;
    this.height = opts.height ?? 48;
    this.cols = opts.cols ?? 16;
    this.rows = opts.rows ?? 12;
    this.cellW = this.width / this.cols;
    this.cellH = this.height / this.rows;
    if (!Number.isInteger(this.cellW) || !Number.isInteger(this.cellH)) {
      throw new Error('frame size must be a multiple of the cell grid');
    }
    this.nCells = this.cols * this.rows;
    this.minAbs = opts.minAbs ?? 5; // gray levels: below this nothing ever counts
    this.noiseMul = opts.noiseMul ?? 3.2;
    this.adaptQuiet = opts.adaptQuiet ?? 0.6; // seconds: baseline time constant for quiet cells
    this.adaptBusy = opts.adaptBusy ?? 25; // seconds: slowly absorb a permanently busy cell (a TV)
    this.honkRefractory = opts.honkRefractory ?? 0.75; // seconds between arm-wave honks
    this.setSensitivity(opts.sensitivity ?? 'medium');

    this.prev = null;
    this.noise = new Float32Array(this.nCells).fill(2.5);
    this.cell = new Float32Array(this.nCells);
    this.active = new Float32Array(this.nCells);
    this.calib = null;
    this.lastTime = null;
    this.lastHonk = -Infinity;
    this.frames = 0;
    this.out = {
      energy: 0, // smoothed 0..1 whole-frame motion (fast attack, gentle release)
      raw: 0, // this frame's 0..1 whole-frame motion
      top: 0, // this frame's 0..1 top-third motion
      left: 0,
      right: 0,
      steer: 0, // smoothed -1 (left) .. +1 (right)
      moving: false,
      honk: false, // true on the frame an arm-wave honk fires
      activeCells: 0,
    };
  }

  setSensitivity(name) {
    const s = SENSITIVITY[name] || SENSITIVITY.medium;
    this.sensitivity = SENSITIVITY[name] ? name : 'medium';
    this.thrMul = s.thr;
    this.gain = s.gain;
  }

  reset() {
    this.prev = null;
    this.lastTime = null;
    this.out.energy = 0;
    this.out.steer = 0;
  }

  /** Start collecting a noise baseline while the child stands still. */
  beginCalibration() {
    this.calib = { sum: new Float32Array(this.nCells), sumSq: new Float32Array(this.nCells), n: 0 };
  }

  /** Finish calibration; returns how noisy the room is (mean cell noise) for the parent UI. */
  endCalibration() {
    const c = this.calib;
    this.calib = null;
    if (!c || c.n < 3) return null;
    let total = 0;
    for (let i = 0; i < this.nCells; i++) {
      const mean = c.sum[i] / c.n;
      const variance = Math.max(0, c.sumSq[i] / c.n - mean * mean);
      this.noise[i] = Math.max(1.2, mean + Math.sqrt(variance));
      total += this.noise[i];
    }
    return total / this.nCells;
  }

  /** How much the calibration frames moved so far (0..1); calibration restarts if it is high. */
  calibrationMotion() {
    return this.out.raw;
  }

  fit(prev, gray, n, maxRes, a0, b0) {
    let sx = 0, sy = 0, sxx = 0, sxy = 0, m = 0;
    for (let i = 0; i < n; i++) {
      const x = prev[i], y = gray[i];
      if (maxRes !== Infinity) {
        const r = y - (a0 * x + b0);
        if (r > maxRes || r < -maxRes) continue;
      }
      sx += x; sy += y; sxx += x * x; sxy += x * y; m++;
    }
    if (m < n * 0.2) return [a0, b0];
    const varX = sxx - (sx * sx) / m;
    let a = varX > 1e-6 ? (sxy - (sx * sy) / m) / varX : 1;
    a = clamp(a, 0.6, 1.6);
    return [a, (sy - a * sx) / m];
  }

  /**
   * Feed one grayscale frame. `now` is in seconds. Returns the (reused) output object.
   */
  update(gray, now) {
    const out = this.out;
    out.honk = false;
    const dt = this.lastTime == null ? 1 / 30 : clamp(now - this.lastTime, 0.001, 0.25);
    this.lastTime = now;
    this.frames++;
    const n = this.width * this.height;
    if (!this.prev || this.prev.length !== n) {
      this.prev = new Uint8Array(gray);
      out.raw = out.top = out.left = out.right = 0;
      out.activeCells = 0;
      return out;
    }
    const prev = this.prev;

    // Robust least-squares fit cur ≈ a·prev + b: cancels flicker and exposure changes.
    // Pass 1 fits everything; pass 2 refits on pixels that pass 1 explains well, so a child
    // filling half the frame does not drag the fit (and fake motion into the other half).
    let [a, b] = this.fit(prev, gray, n, Infinity, 1, 0);
    [a, b] = this.fit(prev, gray, n, 18, a, b);

    // Per-cell mean absolute residual.
    const cell = this.cell;
    cell.fill(0);
    const { width, cellW, cellH, cols } = this;
    for (let y = 0; y < this.height; y++) {
      const rowBase = ((y / cellH) | 0) * cols;
      const off = y * width;
      for (let x = 0; x < width; x++) {
        const i = off + x;
        let d = gray[i] - (a * prev[i] + b);
        if (d < 0) d = -d;
        // Clip each pixel so one hot pixel cannot light up a whole cell on its own.
        cell[rowBase + ((x / cellW) | 0)] += d > 40 ? 40 : d;
      }
    }
    const perCell = cellW * cellH;
    for (let c = 0; c < this.nCells; c++) cell[c] /= perCell;
    prev.set(gray);

    if (this.calib) {
      for (let c = 0; c < this.nCells; c++) {
        this.calib.sum[c] += cell[c];
        this.calib.sumSq[c] += cell[c] * cell[c];
      }
      this.calib.n++;
    }

    // Threshold against each cell's own baseline, then require a moving neighbour.
    const act = this.active;
    const { rows } = this;
    for (let c = 0; c < this.nCells; c++) {
      const thr = Math.max(this.minAbs, this.noise[c] * this.noiseMul) * this.thrMul;
      act[c] = cell[c] > thr ? clamp((cell[c] - thr) / thr + 0.5, 0.5, 1) : 0;
    }
    let total = 0, top = 0, left = 0, right = 0, count = 0;
    const topRows = Math.round(rows / 3);
    const halfCols = cols / 2;
    for (let r = 0; r < rows; r++) {
      for (let q = 0; q < cols; q++) {
        const c = r * cols + q;
        let w = act[c];
        if (w > 0) {
          const nb =
            (q > 0 && act[c - 1] > 0) ||
            (q < cols - 1 && act[c + 1] > 0) ||
            (r > 0 && act[c - cols] > 0) ||
            (r < rows - 1 && act[c + cols] > 0);
          if (!nb) w = 0;
        }
        if (w > 0) {
          count++;
          total += w;
          if (r < topRows) top += w;
          if (q < halfCols) left += w; else right += w;
        }
        // Adapt the baseline: fast when quiet, very slow when busy.
        const tau = w > 0 ? this.adaptBusy : this.adaptQuiet;
        this.noise[c] = Math.max(0.8, approach(this.noise[c], cell[c], tau, dt));
      }
    }

    // Normalise: ~10% of the frame moving is already "a lot" for a small child 1–2 m away.
    const g = this.gain;
    out.activeCells = count;
    out.raw = clamp((total / this.nCells / 0.1) * g, 0, 1);
    out.top = clamp((top / (topRows * cols) / 0.12) * g, 0, 1);
    const halfCells = (rows * cols) / 2;
    out.left = clamp((left / halfCells / 0.1) * g, 0, 1);
    out.right = clamp((right / halfCells / 0.1) * g, 0, 1);

    // Fast attack, gentle release so the car keeps rolling between waves.
    out.energy = out.raw > out.energy ? approach(out.energy, out.raw, 0.03, dt) : approach(out.energy, out.raw, 0.45, dt);
    if (out.energy < 0.002) out.energy = 0;
    out.moving = out.energy > 0.08;

    const lr = out.left + out.right;
    const steerTarget = lr > 0.15 ? (out.right - out.left) / (lr + 0.05) : 0;
    out.steer = approach(out.steer, steerTarget, lr > 0.15 ? 0.15 : 0.9, dt);

    if (!this.calib && out.top >= 0.3 && now - this.lastHonk >= this.honkRefractory) {
      out.honk = true;
      this.lastHonk = now;
    }
    return out;
  }
}
