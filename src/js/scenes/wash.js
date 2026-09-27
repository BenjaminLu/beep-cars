// Scene 3 — Car wash: a muddy car waits between the big brushes. His movement spins the brushes,
// makes bubbles (more on the side he moves) and washes the mud away. Clean → sparkle, happy honk,
// drive out, next muddy car.

import { approach, clamp } from '../util.js';
import { INK } from '../cars.js';

const CLEAN_RATE = 0.2; // cleanliness per second at full motion (~5 s of good waving)
const BRUSH_COLORS = ['#ff6fa8', '#3d7bff', '#ffd23f', '#2fb34a', '#a66cff'];

export class WashScene {
  constructor(game) {
    this.game = game;
    this.name = 'wash';
    this.spin = 0;
    this.popT = 0;
    this.shine = -1;
  }

  enter() {
    this.newCar();
  }
  exit() {}

  newCar() {
    const g = this.game;
    const car = g.makeCar({ scale: 1, dir: 1 });
    car.scale = Math.min(1.05, (g.vw * 0.42) / car.type.len);
    car.x = -car.w;
    this.car = car;
    this.phase = 'enter';
    this.clean = 0;
    this.shine = -1;
    // mud splats in car-local space
    const L = car.type.len, H = car.type.height;
    this.mud = Array.from({ length: 9 }, (_, i) => ({
      x: (-0.4 + (i / 8) * 0.8) * L + (Math.random() - 0.5) * 30,
      y: -H * (0.2 + Math.random() * 0.45),
      r: 16 + Math.random() * 20,
      th: 0.1 + (i % 5) * 0.18 + Math.random() * 0.08, // washes off when clean passes this
      blobs: Array.from({ length: 4 }, () => [(Math.random() - 0.5) * 1.6, (Math.random() - 0.5) * 1.2, 0.4 + Math.random() * 0.5]),
    }));
    g.audio.setEngine(car.type.engine);
  }

  focusCar() {
    return this.car;
  }

  get floorY() {
    return this.game.vh * 0.86;
  }

  update(dt, input) {
    const g = this.game;
    const car = this.car;
    car.y = this.floorY;
    const cx = g.vw * 0.5;
    this.spin += dt * (0.6 + input.energy * 9);
    if (this.phase === 'enter') {
      car.x = approach(car.x, cx, 0.45, dt);
      car.vx = (cx - car.x) * 2.5;
      if (Math.abs(car.x - cx) < 10) {
        this.phase = 'wash';
        car.vx = 0;
      }
    } else if (this.phase === 'wash') {
      car.vx = 0;
      if (input.moving) {
        this.clean = Math.min(1, this.clean + input.energy * CLEAN_RATE * dt);
        // bubbles from the brushes, biased to the side he moves on
        const n = input.energy * 26 * dt * (g.reduced ? 0.5 : 1);
        const bias = clamp(0.5 + input.steer * 0.45, 0.05, 0.95);
        for (let i = 0; i < n + (Math.random() < n % 1 ? 1 : 0); i++) {
          const left = Math.random() > bias;
          const bx = left ? this.brushX(-1) : this.brushX(1);
          g.fx.bubble(bx + (Math.random() - 0.5) * 60, this.floorY - 60 - Math.random() * car.h, 16 + Math.random() * 18, left ? 80 : -80);
        }
        if (Math.random() < input.energy * dt * 8) g.fx.drop(cx + (Math.random() - 0.5) * car.w, this.topBarY() + 20);
        this.popT -= dt * input.energy;
        if (this.popT <= 0) {
          g.audio.pop();
          this.popT = 0.12;
        }
        if (Math.random() < dt * 1.5) car.bump(0.6);
      }
      if (this.clean >= 1) {
        this.phase = 'clean';
        this.t = 0;
        this.shine = 0;
        g.audio.sparkle();
        car.honk(g.audio, { jump: true });
        for (let i = 0; i < (g.reduced ? 10 : 24); i++) g.fx.sparkle(car.x + (Math.random() - 0.5) * car.w, car.y - Math.random() * car.h, 14 + Math.random() * 16);
        g.stats.washes++;
      }
    } else if (this.phase === 'clean') {
      this.t += dt;
      this.shine = Math.min(1.2, this.shine + dt * 0.9);
      if (Math.random() < dt * 5) g.fx.sparkle(car.x + (Math.random() - 0.5) * car.w, car.y - Math.random() * car.h, 12 + Math.random() * 12);
      if (this.t > 2.6) {
        this.phase = 'leave';
        g.audio.whoosh();
      }
    } else if (this.phase === 'leave') {
      car.vx = approach(car.vx, 1000, 0.4, dt);
      car.x += car.vx * dt;
      if (car.x > g.vw + car.w) {
        g.stats.carsDone++;
        this.newCar();
      }
    }
    g.audio.engineSpeed(clamp(Math.abs(car.vx) / 900, 0, 1));
    car.update(dt, g.fx);
  }

  onHonk() {
    this.car.honk(this.game.audio);
    // a honk also squirts a few bubbles, just for fun
    for (let i = 0; i < 6; i++) this.game.fx.bubble(this.car.x + (Math.random() - 0.5) * this.car.w, this.floorY - this.car.h * 0.5, 18);
  }

  brushX(side) {
    return this.game.vw * 0.5 + side * (this.game.vw * 0.26);
  }
  topBarY() {
    return this.game.vh * 0.22;
  }

  drawBrush(ctx, x, top, bottom, side) {
    const w = 110;
    ctx.fillStyle = '#6c7489';
    ctx.fillRect(x - 6, top - 30, 12, bottom - top + 30);
    const n = 12;
    for (let i = 0; i < n; i++) {
      const ph = (i / n + this.spin * 0.25 * side) % 1;
      const p = ph < 0 ? ph + 1 : ph;
      const xo = Math.sin(p * Math.PI * 2) * w * 0.5;
      const depth = Math.cos(p * Math.PI * 2);
      if (depth < -0.2) continue;
      ctx.fillStyle = BRUSH_COLORS[i % BRUSH_COLORS.length];
      ctx.globalAlpha = 0.55 + 0.45 * depth;
      ctx.beginPath();
      ctx.roundRect(x + xo - 14, top, 28, bottom - top, 14);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.lineWidth = 5;
    ctx.strokeStyle = INK;
    ctx.beginPath();
    ctx.roundRect(x - w / 2 - 14, top, w + 28, bottom - top, 24);
    ctx.stroke();
  }

  draw(ctx) {
    const g = this.game;
    const { vw, vh } = g;
    // tiled wall
    ctx.fillStyle = '#dff4ff';
    ctx.fillRect(-2, -2, vw + 4, vh + 4);
    ctx.strokeStyle = '#c4e6fb';
    ctx.lineWidth = 3;
    for (let y = 0; y < vh; y += 60) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(vw, y);
      ctx.stroke();
      for (let x = (y / 60) % 2 ? 0 : 60; x < vw; x += 120) {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, y + 60);
        ctx.stroke();
      }
    }
    // floor
    ctx.fillStyle = '#9fb3c8';
    ctx.fillRect(-2, this.floorY - 10, vw + 4, vh - this.floorY + 12);
    ctx.fillStyle = '#7cc6ff';
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    ctx.ellipse(vw / 2, this.floorY + 30, vw * 0.3, 22, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    // arch
    const top = this.topBarY();
    ctx.lineWidth = 6;
    ctx.strokeStyle = INK;
    ctx.fillStyle = '#ff9f1c';
    ctx.beginPath();
    ctx.roundRect(vw * 0.16, top - 80, vw * 0.68, 70, 30);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 7; i++) {
      ctx.beginPath();
      ctx.arc(vw * 0.22 + i * vw * 0.093, top - 45, 16, 0, Math.PI * 2);
      ctx.fill();
    }
    // water bar with nozzles
    ctx.fillStyle = '#aab4c4';
    ctx.beginPath();
    ctx.roundRect(vw * 0.3, top, vw * 0.4, 22, 11);
    ctx.fill();
    ctx.stroke();
    for (let i = 0; i < 6; i++) {
      ctx.fillStyle = '#6c7489';
      ctx.fillRect(vw * 0.33 + i * vw * 0.068, top + 20, 14, 16);
    }
    this.drawBrush(ctx, this.brushX(-1), top + 60, this.floorY - 10, 1);
    // car + mud
    const car = this.car;
    car.draw(ctx);
    this.drawMud(ctx, car);
    if (this.shine >= 0 && this.shine <= 1.1) this.drawShine(ctx, car);
    this.drawBrush(ctx, this.brushX(1), top + 60, this.floorY - 10, -1);
    // cleanliness meter for the parent: a row of bubbles, no numbers
    const n = 5;
    for (let i = 0; i < n; i++) {
      const full = this.clean >= (i + 1) / n - 1e-6;
      ctx.beginPath();
      ctx.arc(vw / 2 + (i - (n - 1) / 2) * 44, vh * 0.955, 14, 0, Math.PI * 2);
      ctx.fillStyle = full ? '#7cc6ff' : 'rgba(255,255,255,0.6)';
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = INK;
      ctx.stroke();
    }
  }

  drawMud(ctx, car) {
    ctx.save();
    ctx.translate(car.x, car.y - car.jump);
    ctx.scale(car.scale * car.flip, car.scale);
    for (const m of this.mud) {
      const a = clamp((m.th - this.clean) * 5, 0, 1);
      if (a <= 0) continue;
      ctx.globalAlpha = a * 0.92;
      ctx.fillStyle = '#8a5a34';
      ctx.beginPath();
      ctx.arc(m.x, m.y, m.r * (0.6 + 0.4 * a), 0, Math.PI * 2);
      for (const [bx, by, br] of m.blobs) {
        ctx.moveTo(m.x + bx * m.r + br * m.r, m.y + by * m.r);
        ctx.arc(m.x + bx * m.r, m.y + by * m.r, br * m.r * (0.6 + 0.4 * a), 0, Math.PI * 2);
      }
      ctx.fill();
      ctx.fillStyle = '#6e4526';
      ctx.beginPath();
      ctx.arc(m.x + m.r * 0.2, m.y + m.r * 0.2, m.r * 0.35 * a, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  /** A soft white shine sweeping across the clean car. */
  drawShine(ctx, car) {
    const x = car.x - car.w * 0.7 + this.shine * car.w * 1.4;
    ctx.save();
    ctx.globalAlpha = 0.55 * Math.sin(Math.min(1, this.shine) * Math.PI);
    const gr = ctx.createLinearGradient(x - 80, 0, x + 80, 0);
    gr.addColorStop(0, 'rgba(255,255,255,0)');
    gr.addColorStop(0.5, 'rgba(255,255,255,1)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gr;
    ctx.beginPath();
    ctx.ellipse(car.x, car.y - car.h * 0.45, car.w * 0.55, car.h * 0.55, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}
