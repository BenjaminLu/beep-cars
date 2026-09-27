// Ten hand-drawn cars. Each is drawn in its own local space: facing right (+x), wheels on the
// ground at y = 0, up is -y, roughly centred on x = 0. Every car has a big friendly headlight eye,
// a smile, spinning wheels and its own sound profile.
//
// Draw state `s`:
//   t       seconds (for idle wiggles)
//   wheel   wheel rotation in radians
//   blink   0..1 eyelid closed amount
//   happy   bool: happy squinty eye
//   sleepy  bool: closed sleeping eye
//   honk    0..1 honk animation (mouth open, action parts move)
//   look    {x, y} -1..1 where the eye looks
//   siren   bool: siren lights on
//   action  0..1 special-part animation (dump bed, digger arm, bus stop sign, garbage bin)
//   clean   0..1 how shiny (car wash sparkle sweep)

import { flashPhase } from './util.js';

export const INK = '#26304a';
const TIRE = '#353a4c';
const GLASS = '#bfe8ff';
const GLASS_D = '#8fd0f5';
const CHROME = '#e6ebf2';
const EYE_SCALE = 1.3; // big eyes read as a face from across the room
const SKINS = ['#f6c9a6', '#e0a57c', '#b97a52', '#8a5a3b', '#f3d4bb'];
const HAIRS = ['#3b2a20', '#6b4423', '#1f1a17', '#d9a441', '#8b3a1a'];

// ---- drawing helpers ------------------------------------------------------------------

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}
function paint(ctx, fill, lw = 6) {
  ctx.fillStyle = fill;
  ctx.fill();
  if (lw) {
    ctx.lineWidth = lw;
    ctx.strokeStyle = INK;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.stroke();
  }
}
function vgrad(ctx, y0, y1, c0, c1) {
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, c0);
  g.addColorStop(1, c1);
  return g;
}
/** Glossy white highlight strip. */
function gloss(ctx, x, y, w, h, a = 0.45) {
  ctx.save();
  ctx.globalAlpha = a;
  rr(ctx, x, y, w, h, h / 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.restore();
}
function glass(ctx, x, y, w, h, r = 10) {
  rr(ctx, x, y, w, h, r);
  paint(ctx, vgrad(ctx, y, y + h, GLASS, GLASS_D), 5);
  // reflection streaks
  ctx.save();
  ctx.clip();
  ctx.globalAlpha = 0.6;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = Math.max(4, w * 0.08);
  ctx.beginPath();
  ctx.moveTo(x + w * 0.25, y + h + 4);
  ctx.lineTo(x + w * 0.6, y - 4);
  ctx.stroke();
  ctx.lineWidth = Math.max(2, w * 0.03);
  ctx.beginPath();
  ctx.moveTo(x + w * 0.5, y + h + 4);
  ctx.lineTo(x + w * 0.8, y - 4);
  ctx.stroke();
  ctx.restore();
}

export function wheel(ctx, x, r, angle, hub = CHROME, cap = '#ff5d5d') {
  const y = -r;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  paint(ctx, TIRE, 6);
  // tread nubs
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.fillStyle = '#4a5064';
  for (let i = 0; i < 10; i++) {
    ctx.rotate((Math.PI * 2) / 10);
    ctx.beginPath();
    ctx.arc(r * 0.84, 0, r * 0.07, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.56, 0, Math.PI * 2);
  paint(ctx, hub, 4);
  ctx.fillStyle = '#b8c2d1';
  for (let i = 0; i < 5; i++) {
    ctx.rotate((Math.PI * 2) / 5);
    ctx.beginPath();
    ctx.arc(r * 0.34, 0, r * 0.08, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.2, 0, Math.PI * 2);
  paint(ctx, cap, 3);
  ctx.restore();
}

/** The headlight eye + blush. */
export function eye(ctx, x, y, r, s, blush = true) {
  r *= EYE_SCALE;
  if (blush) {
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = '#ff7aa2';
    ctx.beginPath();
    ctx.ellipse(x - r * 1.35, y + r * 0.9, r * 0.55, r * 0.34, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  // chrome headlight rim
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  paint(ctx, '#ffe07a', 5);
  ctx.beginPath();
  ctx.arc(x, y, r * 0.8, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = INK;
  if (s.sleepy) {
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(x, y - r * 0.05, r * 0.45, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();
    return;
  }
  if (s.happy) {
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(x, y + r * 0.25, r * 0.42, 1.15 * Math.PI, 1.85 * Math.PI);
    ctx.stroke();
    return;
  }
  const lx = (s.look?.x ?? 0.3) * r * 0.22;
  const ly = (s.look?.y ?? 0.1) * r * 0.22;
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r * 0.8, 0, Math.PI * 2);
  ctx.clip();
  ctx.beginPath();
  ctx.arc(x + lx, y + ly, r * 0.47, 0, Math.PI * 2);
  ctx.fillStyle = '#3b2c63';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x + lx, y + ly, r * 0.28, 0, Math.PI * 2);
  ctx.fillStyle = '#10121d';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x + lx + r * 0.15, y + ly - r * 0.17, r * 0.13, 0, Math.PI * 2);
  ctx.arc(x + lx - r * 0.12, y + ly + r * 0.14, r * 0.06, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  // eyelid (blink)
  if (s.blink > 0.02) {
    ctx.fillStyle = '#ffd24d';
    ctx.fillRect(x - r, y - r, r * 2, r * 1.6 * s.blink);
    ctx.beginPath();
    ctx.moveTo(x - r, y - r + r * 1.6 * s.blink);
    ctx.lineTo(x + r, y - r + r * 1.6 * s.blink);
    ctx.stroke();
  }
  ctx.restore();
}

/** Smile; opens into a happy "O" with a tongue while honking. */
export function mouth(ctx, x, y, w, s) {
  ctx.lineWidth = 5;
  ctx.strokeStyle = INK;
  ctx.lineCap = 'round';
  if (s.honk > 0.05 && !s.sleepy) {
    const h = w * (0.5 + 0.5 * s.honk);
    ctx.beginPath();
    ctx.ellipse(x, y + h * 0.3, w * 0.5, h * 0.55, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#7a1f3d';
    ctx.fill();
    ctx.stroke();
    ctx.save();
    ctx.clip();
    ctx.beginPath();
    ctx.ellipse(x, y + h * 0.75, w * 0.35, h * 0.3, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#ff8fab';
    ctx.fill();
    ctx.restore();
  } else {
    ctx.beginPath();
    ctx.arc(x, y - w * 0.15, w * 0.5, 0.2 * Math.PI, 0.8 * Math.PI);
    ctx.stroke();
  }
}

function sirenLamp(ctx, x, y, w, h, colors, s, hz = 1.5) {
  const on = s.siren ? flashPhase(s.t, hz) : -1;
  const half = w / 2;
  for (let i = 0; i < 2; i++) {
    const lit = on === i;
    rr(ctx, x + i * half, y, half, h, i === 0 ? [h / 2, 0, 0, h / 2] : [0, h / 2, h / 2, 0]);
    paint(ctx, lit ? colors[i] : shade(colors[i]), 4);
    if (lit) {
      ctx.save();
      ctx.globalAlpha = 0.28;
      ctx.fillStyle = colors[i];
      ctx.beginPath();
      ctx.arc(x + i * half + half / 2, y + h / 2, h * 1.9, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }
}
function shade(hex) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => Math.round(v * 0.55 + 40);
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}
function bumper(ctx, x, y, w, h) {
  rr(ctx, x, y, w, h, h / 2);
  paint(ctx, CHROME, 4);
}
function star(ctx, x, y, r, fill) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rad = i % 2 ? r * 0.45 : r;
    ctx.lineTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad);
  }
  ctx.closePath();
  paint(ctx, fill, 3);
}
function kid(ctx, x, y, r, i, s) {
  const bob = Math.sin(s.t * 3 + i * 1.7) * 2 - (s.honk > 0.1 ? 6 * s.honk : 0);
  ctx.beginPath();
  ctx.arc(x, y + bob, r, 0, Math.PI * 2);
  ctx.fillStyle = SKINS[i % SKINS.length];
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x, y + bob - r * 0.35, r * 0.95, Math.PI * 1.05, Math.PI * 1.95);
  ctx.fillStyle = HAIRS[i % HAIRS.length];
  ctx.fill();
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.arc(x + r * 0.35, y + bob, r * 0.12, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x + r * 0.3, y + bob + r * 0.3, r * 0.25, 0.1 * Math.PI, 0.9 * Math.PI);
  ctx.stroke();
}
function door(ctx, x, y, w, h) {
  rr(ctx, x, y, w, h, 8);
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(38,48,74,0.55)';
  ctx.stroke();
  rr(ctx, x + w - 26, y + 14, 16, 6, 3);
  ctx.fillStyle = INK;
  ctx.fill();
}

// ---- the cars -------------------------------------------------------------------------

function fireEngine(ctx, s) {
  const R = '#e8322f';
  // ladder
  ctx.save();
  ctx.translate(-205, -198);
  ctx.rotate(-0.06 * s.action);
  ctx.lineWidth = 5;
  ctx.strokeStyle = INK;
  rr(ctx, 0, -6, 275, 22, 6);
  paint(ctx, '#cfd6e0', 5);
  ctx.fillStyle = '#9aa6b8';
  for (let x = 16; x < 270; x += 26) ctx.fillRect(x, -2, 7, 14);
  ctx.restore();
  // rear box
  rr(ctx, -228, -186, 305, 140, 16);
  paint(ctx, vgrad(ctx, -186, -46, '#ff4a44', '#cf2522'));
  // compartments
  for (let i = 0; i < 3; i++) {
    rr(ctx, -212 + i * 96, -172, 84, 62, 10);
    paint(ctx, '#d62a27', 4);
    rr(ctx, -200 + i * 96, -160, 60, 8, 4);
    ctx.fillStyle = '#ffd23f';
    ctx.fill();
  }
  // white stripe
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(-225, -98, 300, 14);
  ctx.fillStyle = '#ffd23f';
  ctx.fillRect(-225, -84, 300, 8);
  // cab
  ctx.beginPath();
  ctx.moveTo(70, -46);
  ctx.lineTo(70, -198);
  ctx.quadraticCurveTo(70, -212, 86, -212);
  ctx.lineTo(178, -212);
  ctx.quadraticCurveTo(196, -212, 204, -196);
  ctx.lineTo(228, -120);
  ctx.quadraticCurveTo(234, -100, 234, -80);
  ctx.lineTo(234, -58);
  ctx.quadraticCurveTo(234, -46, 222, -46);
  ctx.closePath();
  paint(ctx, vgrad(ctx, -212, -46, '#ff4a44', '#cf2522'));
  glass(ctx, 100, -196, 62, 56, 10);
  ctx.beginPath();
  ctx.moveTo(174, -196);
  ctx.lineTo(196, -196);
  ctx.lineTo(214, -140);
  ctx.lineTo(174, -140);
  ctx.closePath();
  paint(ctx, vgrad(ctx, -196, -140, GLASS, GLASS_D), 5);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(72, -98, 158, 14);
  gloss(ctx, 84, -207, 90, 8);
  gloss(ctx, -212, -182, 150, 8);
  sirenLamp(ctx, 100, -232, 64, 20, ['#ff2d2d', '#3d7bff'], s, 1.5);
  bumper(ctx, 206, -62, 38, 18);
  // wheels
  wheel(ctx, -165, 42, s.wheel);
  wheel(ctx, -75, 42, s.wheel);
  wheel(ctx, 150, 42, s.wheel);
  eye(ctx, 208, -118, 22, s);
  mouth(ctx, 214, -72, 18, s);
}

function policeCar(ctx, s) {
  const B = '#2f6fe4';
  // cabin
  ctx.beginPath();
  ctx.moveTo(-138, -118);
  ctx.lineTo(-100, -190);
  ctx.quadraticCurveTo(-92, -200, -78, -200);
  ctx.lineTo(48, -200);
  ctx.quadraticCurveTo(62, -200, 72, -188);
  ctx.lineTo(122, -118);
  ctx.closePath();
  paint(ctx, B);
  glass(ctx, -90, -186, 70, 58, [30, 8, 8, 8]);
  ctx.beginPath();
  ctx.moveTo(-8, -186);
  ctx.lineTo(50, -186);
  ctx.lineTo(90, -128);
  ctx.lineTo(-8, -128);
  ctx.closePath();
  paint(ctx, vgrad(ctx, -186, -128, GLASS, GLASS_D), 5);
  // body
  rr(ctx, -195, -128, 390, 82, [30, 40, 26, 26]);
  paint(ctx, vgrad(ctx, -128, -46, '#3d7ff5', '#2257c4'));
  // white doors
  rr(ctx, -100, -122, 190, 66, 10);
  paint(ctx, '#f7f9fc', 4);
  ctx.beginPath();
  ctx.moveTo(-5, -122);
  ctx.lineTo(-5, -56);
  ctx.lineWidth = 3;
  ctx.stroke();
  star(ctx, 42, -90, 20, '#ffd23f');
  gloss(ctx, -180, -122, 60, 8);
  sirenLamp(ctx, -48, -222, 96, 22, ['#ff2d2d', '#3d7bff'], s, 1.5);
  bumper(ctx, 170, -62, 36, 18);
  bumper(ctx, -206, -62, 30, 18);
  wheel(ctx, -118, 40, s.wheel);
  wheel(ctx, 120, 40, s.wheel);
  eye(ctx, 165, -98, 22, s);
  mouth(ctx, 180, -66, 16, s);
}

function schoolBus(ctx, s) {
  const Y = '#ffc21a';
  rr(ctx, -245, -232, 470, 186, [26, 34, 18, 18]);
  paint(ctx, vgrad(ctx, -232, -46, '#ffd23f', '#f2a900'));
  // hood
  rr(ctx, 205, -126, 46, 80, [0, 18, 14, 0]);
  paint(ctx, vgrad(ctx, -126, -46, '#ffd23f', '#f2a900'));
  // windows with kids
  for (let i = 0; i < 5; i++) {
    const x = -225 + i * 70;
    glass(ctx, x, -212, 58, 58, 10);
    if (i !== 2) {
      ctx.save();
      rr(ctx, x, -212, 58, 58, 10);
      ctx.clip();
      kid(ctx, x + 29, -170, 16, i, s);
      ctx.restore();
    }
  }
  // door
  rr(ctx, 130, -212, 50, 150, 8);
  paint(ctx, vgrad(ctx, -212, -62, GLASS, GLASS_D), 5);
  ctx.beginPath();
  ctx.moveTo(155, -212);
  ctx.lineTo(155, -62);
  ctx.lineWidth = 4;
  ctx.stroke();
  // windshield
  ctx.beginPath();
  ctx.moveTo(190, -212);
  ctx.lineTo(214, -212);
  ctx.lineTo(222, -140);
  ctx.lineTo(190, -140);
  ctx.closePath();
  paint(ctx, vgrad(ctx, -212, -140, GLASS, GLASS_D), 5);
  // black stripes
  ctx.fillStyle = INK;
  ctx.fillRect(-243, -132, 370, 8);
  ctx.fillRect(-243, -110, 370, 8);
  gloss(ctx, -228, -228, 200, 7);
  // stop arm: folded flat against the bus, swings out on honk
  ctx.fillStyle = INK;
  ctx.fillRect(112, -160, 8, 22);
  if (s.action > 0.03) {
    const k = s.action;
    ctx.save();
    ctx.translate(112, -149);
    ctx.fillRect(-46 * k, -3, 46 * k, 6);
    ctx.translate(-46 * k - 18 * k, 0);
    ctx.scale(k, k);
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const ang = Math.PI / 8 + (i * Math.PI) / 4;
      ctx.lineTo(Math.cos(ang) * 26, Math.sin(ang) * 26);
    }
    ctx.closePath();
    paint(ctx, '#e5383b', 4);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-14, -3, 28, 6);
    ctx.restore();
  }
  // top lights
  ctx.beginPath();
  ctx.arc(-230, -222, 7, 0, Math.PI * 2);
  ctx.arc(205, -222, 7, 0, Math.PI * 2);
  ctx.fillStyle = s.siren && flashPhase(s.t, 1) ? '#ff5d5d' : '#ff9f1c';
  ctx.fill();
  bumper(ctx, 224, -62, 36, 18);
  bumper(ctx, -256, -62, 30, 18);
  wheel(ctx, -150, 44, s.wheel);
  wheel(ctx, 150, 44, s.wheel);
  eye(ctx, 228, -100, 22, s);
  mouth(ctx, 240, -66, 14, s);
}

function dumpTruck(ctx, s) {
  // chassis
  rr(ctx, -225, -78, 440, 26, 8);
  paint(ctx, '#4a4f63', 5);
  // bed tips up around its rear hinge
  ctx.save();
  ctx.translate(-225, -78);
  ctx.rotate(-s.action * 0.55);
  // rocks
  const rocks = [[40, -128, 26, '#a47148'], [85, -140, 30, '#8d6e63'], [135, -132, 26, '#b08968'], [175, -138, 28, '#9c7a5b'], [215, -126, 22, '#8d6e63'], [62, -150, 20, '#c9a27e'], [150, -156, 20, '#a47148']];
  for (const [x, y, r, c] of rocks) {
    ctx.beginPath();
    ctx.arc(x, y + 18, r, 0, Math.PI * 2);
    paint(ctx, c, 4);
  }
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(-12, -128);
  ctx.lineTo(262, -128);
  ctx.lineTo(250, 0);
  ctx.closePath();
  paint(ctx, vgrad(ctx, -128, 0, '#ff8c1a', '#e36a00'));
  ctx.lineWidth = 4;
  for (let x = 40; x < 250; x += 52) {
    ctx.beginPath();
    ctx.moveTo(x, -118);
    ctx.lineTo(x, -10);
    ctx.stroke();
  }
  gloss(ctx, 4, -120, 180, 8);
  ctx.restore();
  // cab
  ctx.beginPath();
  ctx.moveTo(52, -52);
  ctx.lineTo(52, -196);
  ctx.quadraticCurveTo(52, -212, 68, -212);
  ctx.lineTo(160, -212);
  ctx.quadraticCurveTo(178, -212, 186, -196);
  ctx.lineTo(226, -118);
  ctx.lineTo(226, -60);
  ctx.quadraticCurveTo(226, -52, 216, -52);
  ctx.closePath();
  paint(ctx, vgrad(ctx, -212, -52, '#ffdd33', '#f0b400'));
  ctx.beginPath();
  ctx.moveTo(80, -194);
  ctx.lineTo(158, -194);
  ctx.lineTo(192, -128);
  ctx.lineTo(80, -128);
  ctx.closePath();
  paint(ctx, vgrad(ctx, -194, -128, GLASS, GLASS_D), 5);
  gloss(ctx, 66, -207, 80, 7);
  // exhaust stack
  rr(ctx, 36, -236, 14, 150, 5);
  paint(ctx, CHROME, 4);
  // hazard light
  ctx.beginPath();
  ctx.arc(120, -220, 9, Math.PI, 0);
  paint(ctx, '#ff9f1c', 4);
  bumper(ctx, 208, -70, 34, 18);
  wheel(ctx, -160, 46, s.wheel, '#ffdd33', INK);
  wheel(ctx, -62, 46, s.wheel, '#ffdd33', INK);
  wheel(ctx, 150, 46, s.wheel, '#ffdd33', INK);
  eye(ctx, 204, -110, 22, s);
  mouth(ctx, 214, -80, 15, s);
}

function tractor(ctx, s) {
  const G = '#2fb34a';
  // exhaust
  rr(ctx, 50, -228, 14, 100, 5);
  paint(ctx, '#5b6275', 4);
  ctx.save();
  ctx.translate(57, -228);
  ctx.rotate(-0.4 - Math.abs(Math.sin(s.t * 10)) * 0.5 * (0.3 + s.honk));
  rr(ctx, -2, -4, 20, 8, 3);
  paint(ctx, '#5b6275', 3);
  ctx.restore();
  // cabin frame
  rr(ctx, -178, -292, 170, 18, 8);
  paint(ctx, '#ff5d5d');
  ctx.fillStyle = INK;
  ctx.fillRect(-170, -276, 10, 130);
  ctx.fillRect(-26, -276, 10, 130);
  // seat + steering wheel
  rr(ctx, -130, -178, 44, 40, 8);
  paint(ctx, '#ffd23f', 4);
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(-40, -150);
  ctx.lineTo(-60, -190);
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(-62, -194, 20, 7, -0.4, 0, Math.PI * 2);
  ctx.stroke();
  // hood / body
  ctx.beginPath();
  ctx.moveTo(-185, -70);
  ctx.lineTo(-185, -150);
  ctx.lineTo(-10, -150);
  ctx.lineTo(-10, -128);
  ctx.lineTo(150, -128);
  ctx.quadraticCurveTo(170, -128, 172, -108);
  ctx.lineTo(176, -70);
  ctx.closePath();
  paint(ctx, vgrad(ctx, -150, -70, '#43cc5c', '#23963b'));
  // grille
  for (let i = 0; i < 4; i++) {
    rr(ctx, 120, -120 + i * 12, 44, 5, 2);
    ctx.fillStyle = '#1c7a30';
    ctx.fill();
  }
  gloss(ctx, -4, -122, 110, 7);
  // big rear fender + wheel
  wheel(ctx, -100, 82, s.wheel * 0.55, '#ffd23f', INK);
  ctx.beginPath();
  ctx.arc(-100, -82, 94, Math.PI * 1.05, Math.PI * 1.95);
  ctx.lineWidth = 16;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.lineWidth = 10;
  ctx.strokeStyle = G;
  ctx.stroke();
  wheel(ctx, 118, 44, s.wheel, '#ffd23f', INK);
  eye(ctx, 150, -92, 20, s);
  mouth(ctx, 168, -64, 13, s);
}

function raceCar(ctx, s) {
  // spoiler
  ctx.fillStyle = INK;
  ctx.fillRect(-196, -128, 10, 50);
  rr(ctx, -228, -140, 66, 18, 6);
  paint(ctx, '#ef233c', 5);
  // body
  ctx.beginPath();
  ctx.moveTo(-205, -46);
  ctx.lineTo(-210, -100);
  ctx.quadraticCurveTo(-208, -112, -194, -112);
  ctx.lineTo(-70, -112);
  ctx.quadraticCurveTo(-40, -150, 10, -148);
  ctx.quadraticCurveTo(40, -146, 60, -108);
  ctx.quadraticCurveTo(150, -92, 212, -64);
  ctx.quadraticCurveTo(224, -56, 218, -46);
  ctx.closePath();
  paint(ctx, vgrad(ctx, -150, -46, '#ff3d55', '#c8102e'));
  // stripes
  ctx.save();
  ctx.clip();
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(-220, -86, 460, 10);
  ctx.fillStyle = '#ffd23f';
  ctx.fillRect(-220, -76, 460, 6);
  ctx.restore();
  // cockpit + helmet
  ctx.beginPath();
  ctx.arc(-4, -140, 26, Math.PI, 0);
  paint(ctx, '#ffd23f', 5);
  rr(ctx, -2, -150, 26, 12, 6);
  paint(ctx, '#3b2c63', 3);
  // number
  ctx.beginPath();
  ctx.arc(-72, -84, 22, 0, Math.PI * 2);
  paint(ctx, '#ffffff', 4);
  ctx.fillStyle = INK;
  ctx.font = 'bold 30px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('7', -72, -82);
  gloss(ctx, -60, -106, 90, 6);
  wheel(ctx, -130, 44, s.wheel, '#222838', '#ffd23f');
  wheel(ctx, 140, 38, s.wheel, '#222838', '#ffd23f');
  eye(ctx, 90, -96, 17, s);
  mouth(ctx, 118, -66, 12, s);
}

function taxi(ctx, s) {
  // roof sign
  rr(ctx, -46, -226, 84, 28, 8);
  paint(ctx, '#ffffff', 4);
  ctx.fillStyle = INK;
  ctx.font = 'bold 18px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('TAXI', -4, -211);
  // cabin
  ctx.beginPath();
  ctx.moveTo(-140, -118);
  ctx.lineTo(-104, -186);
  ctx.quadraticCurveTo(-96, -198, -82, -198);
  ctx.lineTo(44, -198);
  ctx.quadraticCurveTo(58, -198, 68, -186);
  ctx.lineTo(118, -118);
  ctx.closePath();
  paint(ctx, '#ffcf21');
  glass(ctx, -92, -184, 72, 56, [30, 8, 8, 8]);
  ctx.beginPath();
  ctx.moveTo(-8, -184);
  ctx.lineTo(46, -184);
  ctx.lineTo(86, -128);
  ctx.lineTo(-8, -128);
  ctx.closePath();
  paint(ctx, vgrad(ctx, -184, -128, GLASS, GLASS_D), 5);
  rr(ctx, -190, -128, 380, 82, [30, 40, 26, 26]);
  paint(ctx, vgrad(ctx, -128, -46, '#ffd84a', '#f2b400'));
  // checker band
  ctx.save();
  rr(ctx, -186, -104, 372, 20, 0);
  ctx.clip();
  for (let i = 0; i < 38; i++) {
    for (let j = 0; j < 2; j++) {
      ctx.fillStyle = (i + j) % 2 ? INK : '#ffffff';
      ctx.fillRect(-186 + i * 10, -104 + j * 10, 10, 10);
    }
  }
  ctx.restore();
  door(ctx, -90, -126, 84, 72);
  door(ctx, -4, -126, 84, 72);
  gloss(ctx, -176, -122, 60, 8);
  bumper(ctx, 166, -62, 34, 18);
  bumper(ctx, -200, -62, 30, 18);
  wheel(ctx, -116, 40, s.wheel);
  wheel(ctx, 118, 40, s.wheel);
  eye(ctx, 160, -100, 22, s);
  mouth(ctx, 176, -68, 15, s);
}

function iceCreamVan(ctx, s) {
  // giant cone on the roof, wiggling
  ctx.save();
  ctx.translate(-40, -236);
  ctx.rotate(Math.sin(s.t * 2.2) * 0.06 + s.honk * 0.12);
  ctx.beginPath();
  ctx.moveTo(-28, -40);
  ctx.lineTo(28, -40);
  ctx.lineTo(0, 16);
  ctx.closePath();
  paint(ctx, '#e0a458', 4);
  ctx.strokeStyle = '#b5762d';
  ctx.lineWidth = 2;
  for (let i = -2; i <= 2; i++) {
    ctx.beginPath();
    ctx.moveTo(i * 10 - 6, -40);
    ctx.lineTo(i * 10 + 10, -10);
    ctx.stroke();
  }
  const scoops = [[0, -58, 30, '#ff9ecb'], [-14, -84, 24, '#fff3d6'], [12, -100, 20, '#8d5b3d']];
  for (const [x, y, r, c] of scoops) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    paint(ctx, c, 4);
  }
  ctx.beginPath();
  ctx.arc(14, -124, 9, 0, Math.PI * 2);
  paint(ctx, '#e5383b', 3);
  const sprinkles = ['#3d7bff', '#ffd23f', '#2fb34a', '#ffffff'];
  for (let i = 0; i < 8; i++) {
    ctx.fillStyle = sprinkles[i % 4];
    ctx.fillRect(-18 + ((i * 11) % 34), -66 + ((i * 7) % 16), 6, 3);
  }
  ctx.restore();
  // van body
  ctx.beginPath();
  ctx.moveTo(-205, -46);
  ctx.lineTo(-205, -212);
  ctx.quadraticCurveTo(-205, -236, -181, -236);
  ctx.lineTo(120, -236);
  ctx.quadraticCurveTo(142, -236, 150, -216);
  ctx.lineTo(196, -128);
  ctx.quadraticCurveTo(204, -112, 204, -96);
  ctx.lineTo(204, -58);
  ctx.quadraticCurveTo(204, -46, 192, -46);
  ctx.closePath();
  paint(ctx, vgrad(ctx, -236, -46, '#a6f0d8', '#63cfae'));
  // pink skirt
  ctx.save();
  ctx.clip();
  ctx.fillStyle = '#ff9ecb';
  ctx.fillRect(-210, -96, 420, 50);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(-210, -100, 420, 6);
  ctx.restore();
  // serving window + awning
  glass(ctx, -180, -196, 150, 70, 10);
  ctx.save();
  rr(ctx, -180, -196, 150, 70, 10);
  ctx.clip();
  // an ice-cream scoop person
  ctx.beginPath();
  ctx.arc(-110, -150, 22, 0, Math.PI * 2);
  ctx.fillStyle = SKINS[0];
  ctx.fill();
  rr(ctx, -132, -186, 44, 20, 8);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.arc(-102, -152, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.beginPath();
  ctx.moveTo(-190, -206);
  for (let i = 0; i <= 6; i++) {
    const x = -190 + i * 28.3;
    ctx.lineTo(x, -206);
  }
  ctx.lineTo(-20, -206);
  ctx.lineTo(-20, -214);
  ctx.lineTo(-190, -214);
  ctx.closePath();
  for (let i = 0; i < 6; i++) {
    const x = -190 + i * 28.3;
    ctx.beginPath();
    ctx.moveTo(x, -214);
    ctx.lineTo(x + 28.3, -214);
    ctx.lineTo(x + 28.3, -198);
    ctx.arc(x + 14.15, -198, 14.15, 0, Math.PI);
    ctx.closePath();
    paint(ctx, i % 2 ? '#ffffff' : '#ff6fa8', 3);
  }
  // windshield
  ctx.beginPath();
  ctx.moveTo(60, -220);
  ctx.lineTo(128, -220);
  ctx.lineTo(170, -136);
  ctx.lineTo(60, -136);
  ctx.closePath();
  paint(ctx, vgrad(ctx, -220, -136, GLASS, GLASS_D), 5);
  gloss(ctx, -190, -230, 180, 7);
  // bell
  ctx.beginPath();
  ctx.arc(30, -246, 12, Math.PI, 0);
  ctx.lineTo(42, -238);
  ctx.lineTo(18, -238);
  ctx.closePath();
  paint(ctx, '#ffd23f', 3);
  bumper(ctx, 184, -62, 30, 18);
  wheel(ctx, -120, 40, s.wheel, '#ffffff', '#ff6fa8');
  wheel(ctx, 124, 40, s.wheel, '#ffffff', '#ff6fa8');
  eye(ctx, 178, -104, 22, s);
  mouth(ctx, 192, -72, 14, s);
}

function garbageTruck(ctx, s) {
  // bin lifted by the rear arm
  const lift = s.action;
  ctx.save();
  ctx.translate(-246 + lift * 10, -60 - lift * 150);
  ctx.rotate(-lift * 2.3);
  rr(ctx, -30, -60, 52, 66, 6);
  paint(ctx, '#3d7bff', 4);
  rr(ctx, -34, -68, 60, 12, 5);
  paint(ctx, '#2f5fd0', 4);
  ctx.restore();
  // hopper
  ctx.beginPath();
  ctx.moveTo(-200, -52);
  ctx.lineTo(-236, -60);
  ctx.lineTo(-236, -170);
  ctx.quadraticCurveTo(-226, -196, -200, -200);
  ctx.closePath();
  paint(ctx, '#9aa6b8');
  // body box
  rr(ctx, -206, -214, 262, 166, 18);
  paint(ctx, vgrad(ctx, -214, -48, '#2cc36b', '#16934d'));
  // recycling loop
  ctx.save();
  ctx.translate(-80, -132);
  ctx.rotate(s.t * 0.4);
  ctx.lineWidth = 9;
  ctx.strokeStyle = '#ffffff';
  for (let i = 0; i < 3; i++) {
    ctx.rotate((Math.PI * 2) / 3);
    ctx.beginPath();
    ctx.arc(0, 0, 36, 0.15, 1.75);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(36 * Math.cos(1.75) + 10, 36 * Math.sin(1.75) + 2);
    ctx.lineTo(36 * Math.cos(1.75) - 4, 36 * Math.sin(1.75) - 12);
    ctx.lineTo(36 * Math.cos(1.75) - 12, 36 * Math.sin(1.75) + 8);
    ctx.closePath();
    ctx.fillStyle = '#ffffff';
    ctx.fill();
  }
  ctx.restore();
  // chevron stripe
  ctx.save();
  rr(ctx, -206, -76, 262, 22, 0);
  ctx.clip();
  for (let i = 0; i < 16; i++) {
    ctx.fillStyle = i % 2 ? '#ff9f1c' : '#ffffff';
    ctx.beginPath();
    ctx.moveTo(-220 + i * 20, -54);
    ctx.lineTo(-200 + i * 20, -76);
    ctx.lineTo(-180 + i * 20, -76);
    ctx.lineTo(-200 + i * 20, -54);
    ctx.fill();
  }
  ctx.restore();
  gloss(ctx, -190, -208, 150, 8);
  // cab
  ctx.beginPath();
  ctx.moveTo(64, -48);
  ctx.lineTo(64, -186);
  ctx.quadraticCurveTo(64, -202, 80, -202);
  ctx.lineTo(176, -202);
  ctx.quadraticCurveTo(196, -202, 202, -184);
  ctx.lineTo(226, -110);
  ctx.lineTo(226, -60);
  ctx.quadraticCurveTo(226, -48, 214, -48);
  ctx.closePath();
  paint(ctx, vgrad(ctx, -202, -48, '#f7f9fc', '#cfd8e3'));
  ctx.beginPath();
  ctx.moveTo(90, -186);
  ctx.lineTo(176, -186);
  ctx.lineTo(206, -120);
  ctx.lineTo(90, -120);
  ctx.closePath();
  paint(ctx, vgrad(ctx, -186, -120, GLASS, GLASS_D), 5);
  ctx.beginPath();
  ctx.arc(130, -212, 9, Math.PI, 0);
  paint(ctx, '#ff9f1c', 4);
  bumper(ctx, 208, -66, 32, 18);
  wheel(ctx, -150, 44, s.wheel, '#ffd23f', INK);
  wheel(ctx, -60, 44, s.wheel, '#ffd23f', INK);
  wheel(ctx, 150, 44, s.wheel, '#ffd23f', INK);
  eye(ctx, 205, -96, 22, s);
  mouth(ctx, 214, -66, 14, s);
}

function digger(ctx, s) {
  const Y = '#ffc300';
  // tracks
  rr(ctx, -175, -74, 320, 74, 37);
  paint(ctx, '#3d4356', 6);
  const off = ((s.wheel * 20) % 24 + 24) % 24;
  ctx.save();
  rr(ctx, -175, -74, 320, 74, 37);
  ctx.clip();
  ctx.fillStyle = '#23283a';
  for (let x = -200 + off; x < 170; x += 24) {
    ctx.fillRect(x, -74, 10, 9);
    ctx.fillRect(x, -9, 10, 9);
  }
  ctx.restore();
  for (const x of [-138, -70, 0, 70, 108]) {
    ctx.save();
    ctx.translate(x, -37);
    ctx.rotate(s.wheel);
    ctx.beginPath();
    ctx.arc(0, 0, x === -138 || x === 108 ? 26 : 18, 0, Math.PI * 2);
    paint(ctx, '#aab4c4', 4);
    ctx.fillStyle = INK;
    ctx.fillRect(-3, -12, 6, 24);
    ctx.restore();
  }
  // turntable
  rr(ctx, -150, -96, 260, 24, 8);
  paint(ctx, '#4a4f63', 5);
  // counterweight
  rr(ctx, -190, -172, 90, 80, [22, 8, 8, 22]);
  paint(ctx, vgrad(ctx, -172, -92, '#ffd23f', '#e6a800'));
  // exhaust
  rr(ctx, -150, -212, 12, 44, 4);
  paint(ctx, '#5b6275', 4);
  // arm (behind the cab): boom + stick + bucket
  const scoop = s.action;
  const idle = Math.sin(s.t * 1.3) * 0.04;
  ctx.save();
  ctx.translate(30, -150);
  ctx.rotate(-0.95 + scoop * 0.55 + idle);
  rr(ctx, -14, -16, 190, 32, 14);
  paint(ctx, vgrad(ctx, -16, 16, '#ffd23f', '#e6a800'));
  ctx.translate(176, 0);
  ctx.rotate(1.95 - scoop * 1.1);
  rr(ctx, -12, -12, 140, 24, 10);
  paint(ctx, vgrad(ctx, -12, 12, '#ffd23f', '#e6a800'));
  ctx.translate(132, 0);
  ctx.rotate(0.3 + scoop * 0.9);
  ctx.beginPath();
  ctx.moveTo(0, -18);
  ctx.quadraticCurveTo(52, -24, 56, 18);
  ctx.lineTo(44, 34);
  ctx.lineTo(30, 26);
  ctx.lineTo(18, 36);
  ctx.lineTo(8, 24);
  ctx.quadraticCurveTo(-6, 10, 0, -18);
  ctx.closePath();
  paint(ctx, '#6c7489', 5);
  ctx.restore();
  // piston
  ctx.lineWidth = 10;
  ctx.strokeStyle = INK;
  ctx.beginPath();
  ctx.moveTo(40, -100);
  ctx.lineTo(80 + scoop * 12, -190 + scoop * 40);
  ctx.stroke();
  ctx.lineWidth = 6;
  ctx.strokeStyle = CHROME;
  ctx.stroke();
  // cab
  ctx.beginPath();
  ctx.moveTo(-104, -96);
  ctx.lineTo(-104, -226);
  ctx.quadraticCurveTo(-104, -242, -88, -242);
  ctx.lineTo(10, -242);
  ctx.quadraticCurveTo(28, -242, 36, -224);
  ctx.lineTo(56, -150);
  ctx.lineTo(56, -96);
  ctx.closePath();
  paint(ctx, vgrad(ctx, -242, -96, '#ffd23f', '#e6a800'));
  ctx.beginPath();
  ctx.moveTo(-60, -226);
  ctx.lineTo(8, -226);
  ctx.lineTo(34, -156);
  ctx.lineTo(-60, -156);
  ctx.closePath();
  paint(ctx, vgrad(ctx, -226, -156, GLASS, GLASS_D), 5);
  ctx.beginPath();
  ctx.arc(-40, -250, 9, Math.PI, 0);
  paint(ctx, '#ff9f1c', 4);
  gloss(ctx, -94, -236, 80, 7);
  eye(ctx, 30, -126, 20, s);
  mouth(ctx, 46, -104, 12, s);
}

// ---- catalogue ------------------------------------------------------------------------

/**
 * len/height: body extent in local units (for layout, mud, bubbles).
 * exhaust: where puffs come out, and their direction.
 * sound: honk profile (audio.js) and engine profile.
 * action: what "action" does on honk: 'ladder' | 'siren' | 'stop' | 'dump' | 'bin' | 'dig' | null.
 */
export const CARS = [
  { id: 'fire', zh: '消防車', en: 'Fire engine', draw: fireEngine, len: 470, height: 235, color: '#e8322f', sound: 'fire', engine: 'fire', siren: true, exhaust: { x: -232, y: -54, dx: -1, dy: 0 } },
  { id: 'police', zh: '警車', en: 'Police car', draw: policeCar, len: 400, height: 225, color: '#2f6fe4', sound: 'police', engine: 'police', siren: true, exhaust: { x: -205, y: -52, dx: -1, dy: 0 } },
  { id: 'bus', zh: '校車', en: 'School bus', draw: schoolBus, len: 500, height: 235, color: '#ffc21a', sound: 'bus', engine: 'bus', action: 'stop', exhaust: { x: -252, y: -54, dx: -1, dy: 0 } },
  { id: 'dump', zh: '砂石車', en: 'Dump truck', draw: dumpTruck, len: 460, height: 236, color: '#ff8c1a', sound: 'truck', engine: 'truck', action: 'dump', exhaust: { x: 43, y: -238, dx: 0, dy: -1 } },
  { id: 'tractor', zh: '拖拉機', en: 'Tractor', draw: tractor, len: 370, height: 295, color: '#2fb34a', sound: 'tractor', engine: 'tractor', exhaust: { x: 60, y: -232, dx: 0.2, dy: -1 } },
  { id: 'race', zh: '賽車', en: 'Race car', draw: raceCar, len: 450, height: 170, color: '#ef233c', sound: 'race', engine: 'race', exhaust: { x: -214, y: -60, dx: -1, dy: 0 } },
  { id: 'taxi', zh: '計程車', en: 'Taxi', draw: taxi, len: 400, height: 228, color: '#ffcf21', sound: 'taxi', engine: 'taxi', exhaust: { x: -206, y: -52, dx: -1, dy: 0 } },
  { id: 'ice', zh: '冰淇淋車', en: 'Ice-cream van', draw: iceCreamVan, len: 420, height: 370, color: '#8ee3c8', sound: 'ice', engine: 'ice', exhaust: { x: -210, y: -52, dx: -1, dy: 0 } },
  { id: 'garbage', zh: '垃圾車', en: 'Garbage truck', draw: garbageTruck, len: 480, height: 222, color: '#1fa35c', sound: 'garbage', engine: 'garbage', action: 'bin', exhaust: { x: -240, y: -56, dx: -1, dy: 0 } },
  { id: 'digger', zh: '挖土機', en: 'Digger', draw: digger, len: 420, height: 300, color: '#ffc300', sound: 'digger', engine: 'digger', action: 'dig', exhaust: { x: -144, y: -214, dx: 0, dy: -1 } },
];

export const CAR_BY_ID = Object.fromEntries(CARS.map((c) => [c.id, c]));
