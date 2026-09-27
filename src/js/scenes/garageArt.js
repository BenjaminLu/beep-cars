// Garage building with a roll-up door; shared by the Garage peekaboo scene and bedtime.

import { INK } from '../cars.js';
import { drawStar4 } from '../fx.js';

export const GARAGE_STYLES = [
  { wall: '#ffb4a2', roof: '#e5566b', door: '#ffe6a7', icon: 'circle', iconColor: '#ff5d5d' },
  { wall: '#b9e4ff', roof: '#3d7bff', door: '#fff3c4', icon: 'star', iconColor: '#ffc300' },
  { wall: '#d5c6ff', roof: '#8c5cf0', door: '#d9f7e6', icon: 'heart', iconColor: '#ff6fa8' },
];

/** The door opening rectangle for a garage centred at x with its floor at y. */
export function opening(g) {
  const ow = g.w * 0.8;
  const oh = g.h * 0.66;
  return { x: g.x - ow / 2, y: g.y - oh, w: ow, h: oh };
}

export function drawGarageBack(ctx, g, night = 0) {
  const st = GARAGE_STYLES[g.style % GARAGE_STYLES.length];
  const { x, y, w, h } = g;
  ctx.lineWidth = 6;
  ctx.strokeStyle = INK;
  ctx.lineJoin = 'round';
  // wall
  ctx.fillStyle = st.wall;
  ctx.beginPath();
  ctx.roundRect(x - w / 2, y - h, w, h, 10);
  ctx.fill();
  ctx.stroke();
  // roof
  ctx.fillStyle = st.roof;
  ctx.beginPath();
  ctx.moveTo(x - w / 2 - 24, y - h + 8);
  ctx.lineTo(x, y - h - w * 0.28);
  ctx.lineTo(x + w / 2 + 24, y - h + 8);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // icon in the gable (shape, not text: he can't read, but he can point at the star)
  const ix = x, iy = y - h - w * 0.1, r = w * 0.07;
  ctx.fillStyle = st.iconColor;
  ctx.beginPath();
  if (st.icon === 'circle') ctx.arc(ix, iy, r, 0, Math.PI * 2);
  else if (st.icon === 'star') {
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const rad = i % 2 ? r * 0.5 : r * 1.15;
      ctx.lineTo(ix + Math.cos(a) * rad, iy + Math.sin(a) * rad);
    }
    ctx.closePath();
  } else {
    ctx.moveTo(ix, iy + r);
    ctx.bezierCurveTo(ix - r * 1.8, iy - r * 0.2, ix - r * 0.6, iy - r * 1.5, ix, iy - r * 0.5);
    ctx.bezierCurveTo(ix + r * 0.6, iy - r * 1.5, ix + r * 1.8, iy - r * 0.2, ix, iy + r);
  }
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.stroke();
  // interior
  const o = opening(g);
  const ig = ctx.createLinearGradient(0, o.y, 0, o.y + o.h);
  ig.addColorStop(0, night > 0.5 ? '#3b3350' : '#5a5570');
  ig.addColorStop(1, night > 0.5 ? '#6b5a50' : '#8a8499');
  ctx.fillStyle = ig;
  ctx.fillRect(o.x, o.y, o.w, o.h);
  if (night > 0.5) {
    // warm light inside at bedtime
    ctx.fillStyle = 'rgba(255,214,120,0.25)';
    ctx.fillRect(o.x, o.y, o.w, o.h);
  }
}

export function drawGarageDoor(ctx, g, t, selected = false) {
  const st = GARAGE_STYLES[g.style % GARAGE_STYLES.length];
  const o = opening(g);
  const dh = o.h * (1 - g.open);
  if (dh > 1) {
    ctx.fillStyle = st.door;
    ctx.fillRect(o.x, o.y, o.w, dh);
    ctx.strokeStyle = 'rgba(38,48,74,0.35)';
    ctx.lineWidth = 3;
    const slat = o.h / 7;
    for (let yy = o.y + dh - slat; yy > o.y; yy -= slat) {
      ctx.beginPath();
      ctx.moveTo(o.x + 4, yy);
      ctx.lineTo(o.x + o.w - 4, yy);
      ctx.stroke();
    }
    // handle
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.roundRect(g.x - 30, o.y + dh - 26, 60, 12, 6);
    ctx.fill();
  }
  // frame
  ctx.lineWidth = 6;
  ctx.strokeStyle = INK;
  ctx.strokeRect(o.x, o.y, o.w, o.h);
  // rolled-up door drum
  ctx.fillStyle = '#9aa6b8';
  ctx.beginPath();
  ctx.roundRect(o.x - 8, o.y - 24, o.w + 16, 24, 10);
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.stroke();
  // lamp above the chosen garage
  const lx = g.x, ly = o.y - 44;
  ctx.fillStyle = selected ? '#fff3a0' : '#c8ccd8';
  if (selected) {
    ctx.save();
    ctx.globalAlpha = 0.35 + 0.1 * Math.sin(t * 3);
    ctx.beginPath();
    ctx.arc(lx, ly, 46, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    drawStar4(ctx, lx - 48, ly - 8, 12, '#fffbe0');
    drawStar4(ctx, lx + 50, ly + 4, 9, '#fffbe0');
  }
  ctx.beginPath();
  ctx.arc(lx, ly, 16, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}
