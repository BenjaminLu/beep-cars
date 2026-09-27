// Deterministic synthetic "camera": grayscale frames with sensor noise and scripted motion.
// Used by the unit tests and by the browser tests (?synthetic=1) so they never depend on a real
// camera or on Chrome's fake-device pattern.

import { makeRng } from './util.js';

export const REGIONS = ['none', 'all', 'top', 'bottom', 'left', 'right', 'flicker', 'sparkle'];

export class SyntheticCamera {
  constructor({ width = 64, height = 48, seed = 7, noise = 2 } = {}) {
    this.width = width;
    this.height = height;
    this.noise = noise;
    this.rng = makeRng(seed);
    this.frame = 0;
    this.region = 'none';
    this.amount = 1;
    // A static textured "room": soft gradients plus some furniture-like blocks.
    const bg = new Uint8Array(width * height);
    const r = makeRng(seed * 31 + 1);
    const blocks = Array.from({ length: 6 }, () => ({
      x: r() * width, y: r() * height, w: 6 + r() * 20, h: 6 + r() * 20, v: 40 + r() * 150,
    }));
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let v = 90 + 50 * Math.sin(x / 9) * Math.cos(y / 11) + (y / height) * 40;
        for (const b of blocks) if (x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h) v = b.v;
        bg[y * width + x] = Math.max(0, Math.min(255, v));
      }
    }
    this.bg = bg;
    this.buf = new Uint8Array(width * height);
  }

  set(region, amount = 1) {
    if (!REGIONS.includes(region)) throw new Error(`unknown region ${region}`);
    this.region = region;
    this.amount = amount;
  }

  /** Rectangle (in pixels) where moving blobs are painted for the current region. */
  regionRect() {
    const { width: w, height: h } = this;
    switch (this.region) {
      case 'all': return [0, 0, w, h];
      case 'top': return [0, 0, w, Math.round(h / 3)];
      case 'bottom': return [0, Math.round(h / 2), w, h];
      case 'left': return [0, Math.round(h / 3), w / 2, h];
      case 'right': return [w / 2, Math.round(h / 3), w, h];
      default: return null;
    }
  }

  next() {
    const { width: w, height: h, bg, buf, rng } = this;
    const f = this.frame++;
    let shift = 0;
    if (this.region === 'flicker') shift = (f % 2 ? 1 : -1) * 28 * this.amount; // whole-room lighting flicker
    for (let i = 0; i < buf.length; i++) {
      const v = bg[i] + shift + (rng() * 2 - 1) * this.noise;
      buf[i] = v < 0 ? 0 : v > 255 ? 255 : v;
    }
    if (this.region === 'sparkle') {
      // Isolated single-pixel sensor sparkle: must not count as motion.
      for (let k = 0; k < 12; k++) buf[Math.floor(rng() * buf.length)] = rng() < 0.5 ? 0 : 255;
    }
    const rect = this.regionRect();
    if (rect && this.amount > 0) {
      // A waving "arm": a high-contrast checker bar that jumps position every frame.
      const [x0, y0, x1, y1] = rect;
      const bw = Math.max(4, (x1 - x0) * 0.9 * this.amount);
      const bh = Math.max(4, (y1 - y0) * 0.9 * this.amount);
      const phase = f % 2;
      const ox = x0 + ((x1 - x0 - bw) * phase);
      for (let y = Math.floor(y0); y < Math.min(h, y0 + bh); y++) {
        for (let x = Math.floor(ox); x < Math.min(w, ox + bw); x++) {
          buf[y * w + x] = ((x >> 2) + (y >> 2) + f) % 2 ? 235 : 20;
        }
      }
    }
    return buf;
  }
}
