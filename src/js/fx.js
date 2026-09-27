// Particles: exhaust puffs, confetti, bubbles, sparkles, Zzz. Pooled and capped.

import { flashPhase } from './util.js';

const CONFETTI = ['#ff5d5d', '#ffd23f', '#3d7bff', '#2fb34a', '#ff6fa8', '#a66cff', '#ff9f1c'];

export class FX {
  constructor({ reduced = false } = {}) {
    this.list = [];
    this.reduced = reduced;
    this.max = reduced ? 160 : 420;
  }
  get count() {
    return this.list.length;
  }
  countOf(kind) {
    let n = 0;
    for (const p of this.list) if (p.kind === kind) n++;
    return n;
  }
  add(p) {
    if (this.list.length >= this.max) this.list.shift();
    p.age = 0;
    this.list.push(p);
    return p;
  }
  clear() {
    this.list.length = 0;
  }

  puff(x, y, vx, vy, r) {
    this.add({ kind: 'puff', x, y, vx, vy, r, life: 1.1 });
  }
  confetti(x, y, n = 60, spread = 900) {
    const k = this.reduced ? Math.ceil(n / 3) : n;
    for (let i = 0; i < k; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.2;
      const sp = (0.4 + Math.random() * 0.6) * spread * (this.reduced ? 0.5 : 1);
      this.add({ kind: 'confetti', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: 8 + Math.random() * 8, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 12, color: CONFETTI[i % CONFETTI.length], life: 2.4 });
    }
  }
  bubble(x, y, r = 20, vx = 0) {
    this.add({ kind: 'bubble', x, y, vx: vx + (Math.random() - 0.5) * 60, vy: -60 - Math.random() * 90, r: r * (0.6 + Math.random() * 0.8), life: 2 + Math.random() * 1.5, wob: Math.random() * 6 });
  }
  sparkle(x, y, r = 18) {
    this.add({ kind: 'sparkle', x, y, vx: 0, vy: -10, r, life: 1.2 + Math.random() * 0.6, ph: Math.random() });
  }
  drop(x, y) {
    this.add({ kind: 'drop', x, y, vx: (Math.random() - 0.5) * 40, vy: 200 + Math.random() * 200, r: 5 + Math.random() * 4, life: 0.9 });
  }
  zzz(x, y) {
    this.add({ kind: 'zzz', x, y, vx: 14, vy: -28, r: 26, life: 4 });
  }
  note(x, y, color) {
    this.add({ kind: 'note', x, y, vx: (Math.random() - 0.3) * 80, vy: -120, r: 22, life: 1.4, color: color || CONFETTI[Math.floor(Math.random() * CONFETTI.length)] });
  }

  update(dt) {
    const L = this.list;
    let w = 0;
    for (let i = 0; i < L.length; i++) {
      const p = L[i];
      p.age += dt;
      if (p.age >= p.life) continue;
      switch (p.kind) {
        case 'confetti':
          p.vy += 900 * dt;
          p.vx *= Math.pow(0.35, dt);
          p.vy = Math.min(p.vy, 260);
          p.rot += p.vr * dt;
          break;
        case 'bubble':
          p.vx += Math.sin(p.age * 3 + p.wob) * 40 * dt;
          break;
        case 'puff':
          p.vx *= Math.pow(0.4, dt);
          p.vy -= 20 * dt;
          break;
        case 'drop':
          p.vy += 800 * dt;
          break;
        default:
          break;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      L[w++] = p;
    }
    L.length = w;
  }

  draw(ctx, t) {
    for (const p of this.list) {
      const k = p.age / p.life;
      switch (p.kind) {
        case 'puff': {
          ctx.globalAlpha = 0.55 * (1 - k);
          ctx.fillStyle = '#eef1f7';
          ctx.beginPath();
          const r = p.r * (1 + k * 1.8);
          ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
          ctx.arc(p.x + r * 0.6, p.y - r * 0.3, r * 0.7, 0, Math.PI * 2);
          ctx.fill();
          break;
        }
        case 'confetti': {
          ctx.globalAlpha = k > 0.8 ? (1 - k) * 5 : 1;
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.fillStyle = p.color;
          ctx.fillRect(-p.r / 2, -p.r / 4, p.r, p.r / 2 * (0.4 + Math.abs(Math.sin(p.rot))));
          ctx.restore();
          break;
        }
        case 'bubble': {
          const r = p.r * (k > 0.92 ? 1 + (k - 0.92) * 6 : 1);
          ctx.globalAlpha = k > 0.92 ? (1 - k) * 12 : 0.85;
          ctx.fillStyle = 'rgba(200,235,255,0.35)';
          ctx.strokeStyle = 'rgba(120,180,255,0.9)';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = 'rgba(255,255,255,0.95)';
          ctx.beginPath();
          ctx.ellipse(p.x - r * 0.35, p.y - r * 0.35, r * 0.25, r * 0.15, -0.7, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = 'rgba(255,150,220,0.55)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(p.x, p.y, r * 0.8, 0.2, 1.4);
          ctx.stroke();
          break;
        }
        case 'sparkle': {
          // twinkles at most 2 Hz (photosensitivity)
          const tw = flashPhase(t + p.ph, 2) ? 1 : 0.7;
          ctx.globalAlpha = (1 - k) * tw;
          drawStar4(ctx, p.x, p.y, p.r * (0.6 + 0.4 * Math.sin(k * Math.PI)), '#fffbe0');
          break;
        }
        case 'drop':
          ctx.globalAlpha = 0.8 * (1 - k);
          ctx.fillStyle = '#7cc6ff';
          ctx.beginPath();
          ctx.ellipse(p.x, p.y, p.r * 0.6, p.r, 0, 0, Math.PI * 2);
          ctx.fill();
          break;
        case 'zzz':
          ctx.globalAlpha = Math.min(1, k * 4) * (1 - k);
          ctx.fillStyle = '#e8ecff';
          ctx.font = `bold ${Math.round(p.r * (0.8 + k))}px system-ui, sans-serif`;
          ctx.textAlign = 'center';
          ctx.fillText('z', p.x, p.y);
          break;
        case 'note':
          ctx.globalAlpha = 1 - k;
          drawNote(ctx, p.x, p.y, p.r, p.color);
          break;
        default:
          break;
      }
    }
    ctx.globalAlpha = 1;
  }
}

export function drawStar4(ctx, x, y, r, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.quadraticCurveTo(x, y, x, y + r);
  ctx.quadraticCurveTo(x, y, x - r, y);
  ctx.quadraticCurveTo(x, y, x, y - r);
  ctx.fill();
}

function drawNote(ctx, x, y, r, color) {
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = r * 0.2;
  ctx.beginPath();
  ctx.ellipse(x, y, r * 0.5, r * 0.38, -0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x + r * 0.42, y - r * 0.1);
  ctx.lineTo(x + r * 0.42, y - r * 1.4);
  ctx.quadraticCurveTo(x + r * 0.9, y - r * 1.1, x + r * 1.0, y - r * 0.7);
  ctx.stroke();
}
