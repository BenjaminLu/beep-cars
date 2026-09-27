// Shared scenery: sky, sun/moon, clouds, hills, trees, houses, road. `scroll` gives parallax.

import { INK } from './cars.js';
import { flashPhase, lerp } from './util.js';

const CLOUDS = [[0.1, 0.12, 1], [0.42, 0.07, 0.8], [0.7, 0.16, 1.2], [0.95, 0.09, 0.9], [1.25, 0.14, 1]];
const TREE_COLORS = ['#3dbb5a', '#58c96b', '#2ea24b', '#7ad36f'];
const HOUSE_COLORS = ['#ff9f9f', '#ffd98e', '#a6d8ff', '#c7b3ff', '#ffc3e1'];

function mix(c0, c1, k) {
  const a = parseInt(c0.slice(1), 16), b = parseInt(c1.slice(1), 16);
  const ch = (s) => Math.round(lerp((a >> s) & 255, (b >> s) & 255, k));
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}

/** night: 0 day .. 1 night */
export function sky(ctx, vw, vh, t, night = 0, stars = null) {
  const g = ctx.createLinearGradient(0, 0, 0, vh);
  g.addColorStop(0, mix('#7fd0ff', '#1b2352', night));
  g.addColorStop(0.7, mix('#d8f3ff', '#3a3f7a', night));
  g.addColorStop(1, mix('#fff6d8', '#4b4a85', night));
  ctx.fillStyle = g;
  ctx.fillRect(-2, -2, vw + 4, vh + 4);
  if (night > 0.05 && stars) {
    for (const s of stars) {
      const tw = flashPhase(t + s.p, 0.5) ? 1 : 0.6;
      ctx.globalAlpha = night * tw * s.a;
      ctx.fillStyle = '#fff9d6';
      ctx.beginPath();
      ctx.arc(s.x * vw, s.y * vh * 0.6, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  // sun sinks, moon rises
  if (night < 0.95) sun(ctx, vw * 0.82, lerp(vh * 0.16, vh * 0.75, night), 70, t, 1 - night);
  if (night > 0.05) moon(ctx, vw * 0.18, lerp(vh * 0.7, vh * 0.17, night), 60, night);
}

export function makeStars(n = 70) {
  const s = [];
  for (let i = 0; i < n; i++) s.push({ x: Math.random(), y: Math.random(), r: 1.5 + Math.random() * 2.5, a: 0.5 + Math.random() * 0.5, p: Math.random() * 3 });
  return s;
}

function sun(ctx, x, y, r, t, a) {
  ctx.save();
  ctx.globalAlpha = a;
  ctx.translate(x, y);
  ctx.rotate(t * 0.15);
  ctx.fillStyle = '#ffe066';
  for (let i = 0; i < 12; i++) {
    ctx.rotate(Math.PI / 6);
    ctx.beginPath();
    ctx.roundRect(r * 1.15, -7, r * 0.45, 14, 7);
    ctx.fill();
  }
  ctx.rotate(-t * 0.15);
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fillStyle = '#ffd23f';
  ctx.fill();
  ctx.lineWidth = 5;
  ctx.strokeStyle = '#f5a400';
  ctx.stroke();
  // sleepy-happy sun face
  ctx.strokeStyle = INK;
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(-22, -8, 10, 1.15 * Math.PI, 1.85 * Math.PI);
  ctx.moveTo(32, -8);
  ctx.arc(22, -8, 10, 1.15 * Math.PI, 1.85 * Math.PI);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 10, 20, 0.2 * Math.PI, 0.8 * Math.PI);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,120,120,0.4)';
  ctx.beginPath();
  ctx.arc(-38, 12, 10, 0, Math.PI * 2);
  ctx.arc(38, 12, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function moon(ctx, x, y, r, a) {
  ctx.save();
  ctx.globalAlpha = a;
  ctx.fillStyle = 'rgba(255,248,200,0.15)';
  ctx.beginPath();
  ctx.arc(x, y, r * 1.7, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fff4c2';
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = mix('#fff4c2', '#e8d98f', 0.6);
  ctx.beginPath();
  ctx.arc(x - r * 0.3, y + r * 0.25, r * 0.16, 0, Math.PI * 2);
  ctx.arc(x + r * 0.35, y - r * 0.3, r * 0.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(x - r * 0.3, y - r * 0.05, r * 0.14, 0.15 * Math.PI, 0.85 * Math.PI);
  ctx.moveTo(x + r * 0.44, y - r * 0.05);
  ctx.arc(x + r * 0.3, y - r * 0.05, r * 0.14, 0.15 * Math.PI, 0.85 * Math.PI);
  ctx.stroke();
  ctx.restore();
}

export function cloud(ctx, x, y, s, night = 0) {
  ctx.fillStyle = night > 0.5 ? 'rgba(160,170,220,0.35)' : '#ffffff';
  ctx.beginPath();
  ctx.arc(x, y, 38 * s, 0, Math.PI * 2);
  ctx.arc(x + 42 * s, y - 16 * s, 46 * s, 0, Math.PI * 2);
  ctx.arc(x + 90 * s, y, 36 * s, 0, Math.PI * 2);
  ctx.roundRect(x - 10 * s, y - 10 * s, 110 * s, 46 * s, 20 * s);
  ctx.fill();
}

export function clouds(ctx, vw, vh, scroll, night = 0) {
  const span = vw + 400;
  for (const [fx, fy, s] of CLOUDS) {
    let x = (fx * span - scroll * 0.08) % span;
    if (x < 0) x += span;
    cloud(ctx, x - 200, fy * vh + 20, s * 1.1, night);
  }
}

/** Two layers of rolling hills. `horizon` is the y where the hills meet the ground. */
export function hills(ctx, vw, horizon, scroll, night = 0) {
  const layers = [
    { c: mix('#9be38b', '#2f4a4a', night), amp: 60, len: 520, sp: 0.15, off: 90 },
    { c: mix('#6fd174', '#27403e', night), amp: 40, len: 380, sp: 0.3, off: 30 },
  ];
  for (const L of layers) {
    ctx.fillStyle = L.c;
    ctx.beginPath();
    ctx.moveTo(-10, horizon + 10);
    for (let x = -10; x <= vw + 20; x += 20) {
      const u = (x + scroll * L.sp) / L.len;
      ctx.lineTo(x, horizon - L.off - L.amp * (0.5 + 0.5 * Math.sin(u * Math.PI * 2)) - 14 * Math.sin(u * 5.3));
    }
    ctx.lineTo(vw + 20, horizon + 10);
    ctx.closePath();
    ctx.fill();
  }
}

export function tree(ctx, x, y, s, c) {
  ctx.fillStyle = '#8a5a3b';
  ctx.beginPath();
  ctx.roundRect(x - 9 * s, y - 60 * s, 18 * s, 62 * s, 6 * s);
  ctx.fill();
  ctx.fillStyle = c;
  ctx.beginPath();
  ctx.arc(x, y - 90 * s, 46 * s, 0, Math.PI * 2);
  ctx.arc(x - 30 * s, y - 64 * s, 30 * s, 0, Math.PI * 2);
  ctx.arc(x + 30 * s, y - 66 * s, 32 * s, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.beginPath();
  ctx.arc(x - 14 * s, y - 106 * s, 14 * s, 0, Math.PI * 2);
  ctx.fill();
}

export function house(ctx, x, y, s, c, night = 0) {
  ctx.lineWidth = 4;
  ctx.strokeStyle = INK;
  ctx.fillStyle = c;
  ctx.beginPath();
  ctx.roundRect(x - 60 * s, y - 90 * s, 120 * s, 90 * s, 6 * s);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#e5566b';
  ctx.beginPath();
  ctx.moveTo(x - 76 * s, y - 86 * s);
  ctx.lineTo(x, y - 150 * s);
  ctx.lineTo(x + 76 * s, y - 86 * s);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = night > 0.4 ? '#ffe28a' : '#bfe8ff';
  ctx.beginPath();
  ctx.roundRect(x - 40 * s, y - 70 * s, 30 * s, 28 * s, 5 * s);
  ctx.roundRect(x + 10 * s, y - 70 * s, 30 * s, 28 * s, 5 * s);
  ctx.fill();
  ctx.stroke();
}

/** Roadside strip of trees and houses that scrolls with the road. */
export function roadside(ctx, vw, y, scroll, s = 1, night = 0) {
  const spacing = 260 * s;
  const start = Math.floor(scroll / spacing) - 1;
  for (let i = start; i < start + vw / spacing + 3; i++) {
    const x = i * spacing - scroll;
    const k = ((i * 2654435761) >>> 0) % 7;
    if (k === 0 || k === 4) house(ctx, x, y, s * 0.9, HOUSE_COLORS[(i >>> 0) % HOUSE_COLORS.length], night);
    else tree(ctx, x + (k * 17) % 60, y, s * (0.8 + (k % 3) * 0.15), TREE_COLORS[k % TREE_COLORS.length]);
  }
}

/** Ground + road with a moving dashed centre line. Returns the lane y (car ground line). */
export function road(ctx, vw, vh, top, scroll, night = 0) {
  ctx.fillStyle = mix('#7fd672', '#2c4a3c', night);
  ctx.fillRect(-2, top - 40, vw + 4, vh - top + 42);
  const h = vh - top - 40;
  ctx.fillStyle = mix('#5d6478', '#2a2f45', night);
  ctx.fillRect(-2, top, vw + 4, h);
  ctx.fillStyle = mix('#c9ced9', '#555b75', night);
  ctx.fillRect(-2, top - 8, vw + 4, 12);
  ctx.fillRect(-2, top + h - 4, vw + 4, 12);
  ctx.fillStyle = mix('#ffe066', '#b8a24a', night);
  const dash = 90, gap = 70;
  let x = -((scroll % (dash + gap)) + (dash + gap)) % (dash + gap);
  for (; x < vw + dash; x += dash + gap) {
    ctx.beginPath();
    ctx.roundRect(x, top + h * 0.5 - 6, dash, 12, 6);
    ctx.fill();
  }
  return top + h * 0.78;
}
