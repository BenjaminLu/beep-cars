// A car on stage: position, bouncy squash-and-stretch, jumping on honk, blinking, exhaust puffs.

import { clamp, approach } from './util.js';
import { INK } from './cars.js';

export class CarActor {
  constructor(type, { x = 0, y = 0, scale = 1, dir = 1, reduced = false } = {}) {
    this.type = type;
    this.x = x;
    this.y = y; // ground line (screen units)
    this.scale = scale;
    this.dir = dir; // 1 facing right, -1 facing left
    this.flip = dir; // animated scaleX sign for turning around
    this.vx = 0;
    this.wheel = 0;
    this.jump = 0; // height above ground (positive = up)
    this.jv = 0;
    this.squash = 0; // + = squashed flat, - = stretched tall
    this.sv = 0;
    this.honkT = 0;
    this.happyT = 0;
    this.action = 0;
    this.actionT = 0;
    this.blink = 0;
    this.nextBlink = 1 + Math.random() * 3;
    this.t = Math.random() * 10;
    this.look = { x: 0.4, y: 0.2 };
    this.lookTarget = { x: 0.4, y: 0.2 };
    this.puffT = 0;
    this.sleepy = false;
    this.siren = false;
    this.sirenT = 0;
    this.alpha = 1;
    this.reduced = reduced;
    this.tilt = 0;
    this.lastVx = 0;
    this.dirt = 0;
    this.shineT = -1;
  }

  get w() {
    return this.type.len * this.scale;
  }
  get h() {
    return this.type.height * this.scale;
  }

  /** Honk: sound + little jump + happy eye + open mouth + the car's special action. */
  honk(audio, { jump = true, sound = true } = {}) {
    let played = true;
    if (sound && audio) played = audio.honk(this.type.sound) !== false;
    this.honkT = 1;
    this.happyT = 0.9;
    this.actionT = 1.4;
    if (this.type.siren) this.sirenT = 3;
    if (jump) this.hop(this.reduced ? 0.5 : 1);
    return played;
  }

  hop(strength = 1) {
    if (this.jump <= 1) {
      this.sv -= 5 * strength; // stretch as it leaves the ground
      this.jv = 520 * strength * this.scale;
    }
  }

  bump(strength = 1) {
    this.sv += 6 * strength;
  }

  turnTo(dir) {
    if (dir !== this.dir) {
      this.dir = dir;
      this.hop(0.5);
    }
  }

  update(dt, fx) {
    this.t += dt;
    const S = this.scale;
    // wheels roll with speed
    this.wheel += (this.vx / (40 * S)) * dt;
    // turning-around flip animation
    this.flip = approach(this.flip, this.dir, 0.08, dt);
    // tilt with acceleration (leans back when speeding up)
    const acc = (this.vx - this.lastVx) / Math.max(dt, 1e-3);
    this.lastVx = this.vx;
    const lean = this.reduced ? 0.02 : 0.06;
    this.tilt = approach(this.tilt, clamp(-acc / 6000, -lean, lean) * Math.sign(this.dir || 1), 0.12, dt);
    // jump physics
    if (this.jump > 0 || this.jv > 0) {
      this.jv -= 2600 * S * dt;
      this.jump += this.jv * dt;
      if (this.jump <= 0) {
        this.jump = 0;
        const impact = Math.min(1, -this.jv / (520 * S));
        this.jv = 0;
        this.sv += (this.reduced ? 3 : 7) * impact; // squash on landing
      }
    }
    // squash spring
    const k = 220, damp = 11;
    this.sv += (-k * this.squash - damp * this.sv) * dt;
    this.squash += this.sv * dt;
    this.squash = clamp(this.squash, -0.25, 0.3);
    // idle engine jiggle, stronger when driving
    const speedN = clamp(Math.abs(this.vx) / (600 * S), 0, 1);
    this.idle = Math.sin(this.t * (14 + speedN * 10)) * (this.reduced ? 0.004 : 0.01 + speedN * 0.012);
    // honk / happy / action timers
    this.honkT = Math.max(0, this.honkT - dt * 2.2);
    this.happyT = Math.max(0, this.happyT - dt);
    this.actionT = Math.max(0, this.actionT - dt);
    this.sirenT = Math.max(0, this.sirenT - dt);
    const actionTarget = this.actionT > 0.4 ? 1 : 0;
    this.action = approach(this.action, actionTarget, 0.16, dt);
    // blinking
    this.nextBlink -= dt;
    if (this.nextBlink <= 0) {
      this.blink = 1;
      this.nextBlink = 2 + Math.random() * 3.5;
    }
    this.blink = Math.max(0, this.blink - dt * 7);
    // eyes wander, or look where it drives
    if (Math.random() < dt * 0.6) this.lookTarget = { x: Math.random() * 1.6 - 0.4, y: Math.random() * 0.8 - 0.3 };
    this.look.x = approach(this.look.x, this.lookTarget.x, 0.15, dt);
    this.look.y = approach(this.look.y, this.lookTarget.y, 0.15, dt);
    // exhaust puffs
    if (fx && this.alpha > 0.5) {
      this.puffT -= dt * (1.2 + speedN * 6 + this.honkT * 6);
      if (this.puffT <= 0) {
        this.puffT = 1;
        const e = this.type.exhaust;
        const p = this.localToWorld(e.x, e.y);
        const dx = e.dx * this.dir;
        fx.puff(p.x, p.y, dx * (60 + speedN * 120) * S - this.vx * 0.3, e.dy * 60 * S - 20 * S, 12 * S + 10 * S * speedN);
      }
    }
  }

  localToWorld(lx, ly) {
    return {
      x: this.x + lx * this.scale * this.flip,
      y: this.y - this.jump + ly * this.scale,
    };
  }

  /** Front of the car in world space (for honk rings, text, etc.). */
  front() {
    return this.localToWorld(this.type.len * 0.5, -this.type.height * 0.45);
  }

  draw(ctx) {
    const S = this.scale;
    if (this.alpha <= 0) return;
    ctx.save();
    ctx.globalAlpha = this.alpha;
    // ground shadow
    const sh = clamp(1 - this.jump / (300 * S), 0.4, 1);
    ctx.fillStyle = 'rgba(30,40,70,0.18)';
    ctx.beginPath();
    ctx.ellipse(this.x, this.y + 4 * S, this.type.len * 0.48 * S * sh, 16 * S * sh, 0, 0, Math.PI * 2);
    ctx.fill();
    // body transform: squash/stretch anchored at the ground
    const sq = this.squash + this.idle;
    ctx.translate(this.x, this.y - this.jump);
    ctx.rotate(this.tilt);
    ctx.scale(S * this.flip * (1 + sq * 0.5), S * (1 - sq));
    const st = {
      t: this.t,
      wheel: this.wheel * Math.sign(this.flip || 1),
      blink: this.blink,
      happy: this.happyT > 0 && !this.sleepy,
      sleepy: this.sleepy,
      honk: this.honkT,
      look: this.look,
      siren: this.type.siren && this.sirenT > 0,
      action: this.action,
    };
    this.type.draw(ctx, st);
    ctx.restore();
    if (this.honkT > 0.05 && !this.sleepy) this.drawHonkRings(ctx);
  }

  /** "Sound" rings coming out of the front while honking: visual cause→effect. */
  drawHonkRings(ctx) {
    const f = this.front();
    const S = this.scale;
    ctx.save();
    ctx.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
      const p = (1 - this.honkT) + i * 0.18;
      if (p > 1) continue;
      ctx.globalAlpha = (1 - p) * 0.9;
      ctx.strokeStyle = ['#ffd23f', '#ff6fa8', '#3d7bff'][i];
      ctx.lineWidth = 10 * S;
      const r = (40 + p * 120) * S;
      const a0 = this.flip > 0 ? -0.6 : Math.PI - 0.6;
      ctx.beginPath();
      ctx.arc(f.x + 20 * S * this.dir, f.y, r, a0, a0 + 1.2);
      ctx.stroke();
    }
    ctx.restore();
  }
}

export { INK };
