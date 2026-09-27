// Scene 4 — Traffic light: cars wait at a friendly red light. Whenever he moves, the light turns
// green and every car goes (faster the more he moves). No timing needed: moving anytime works.
// When he stays still for a while the light gently goes yellow, then red, and new cars line up.

import { approach, clamp } from '../util.js';
import { sky, clouds, hills, road } from '../backdrop.js';
import { INK } from '../cars.js';

const MIN_CHANGE = 0.8; // seconds between light changes (well under 3 Hz)
const STILL_TO_YELLOW = 1.8;
const YELLOW_TIME = 1.1;
const SCALE = 0.72;

export class LightScene {
  constructor(game) {
    this.game = game;
    this.name = 'light';
    this.cars = [];
    this.state = 'red';
    this.since = 0;
    this.still = 0;
    this.scroll = 0;
  }

  enter() {
    this.cars = [];
    this.state = 'red';
    this.since = MIN_CHANGE;
    // line up behind the stop line, nose to tail
    let front = this.stopX() - 45;
    for (let i = 0; i < 3; i++) {
      const c = this.spawn(0);
      c.x = front - c.w / 2;
      front = c.x - c.w / 2 - 60;
    }
    this.game.audio.setEngine('car');
  }
  exit() {}

  stopX() {
    return this.game.vw * 0.6;
  }
  laneY() {
    return this.game.vh * 0.9;
  }

  spawn(x) {
    const car = this.game.makeCar({ scale: SCALE, dir: 1 });
    car.x = x ?? -car.w;
    car.y = this.laneY();
    car.passed = false;
    this.cars.push(car);
    return car;
  }

  focusCar() {
    // the car nearest the light is the one who honks back
    let best = null;
    for (const c of this.cars) if (c.x < this.game.vw && (!best || c.x > best.x) && !c.passed) best = c;
    return best || this.cars[0] || null;
  }

  setLight(s) {
    if (this.state === s) return;
    this.state = s;
    this.since = 0;
    const g = this.game;
    if (s === 'green') {
      g.stats.greens++;
      g.audio.ding();
      this.cars.forEach((c, i) => {
        if (!c.passed && i < 2) setTimeout(() => c.honk(g.audio, { jump: true }), i * 180);
        else c.hop(0.5);
      });
    }
  }

  update(dt, input) {
    const g = this.game;
    this.since += dt;
    this.still = input.moving ? 0 : this.still + dt;
    if (input.moving && this.state !== 'green' && this.since >= MIN_CHANGE * (this.state === 'yellow' ? 0.3 : 1)) this.setLight('green');
    else if (this.state === 'green' && this.still > STILL_TO_YELLOW && this.since >= MIN_CHANGE) this.setLight('yellow');
    else if (this.state === 'yellow' && this.since >= YELLOW_TIME) this.setLight('red');

    const go = this.state === 'green';
    const cruise = 320 + input.energy * 820;
    // sort front to back so each car can keep a gap to the one ahead
    this.cars.sort((a, b) => b.x - a.x);
    let aheadX = Infinity;
    for (const car of this.cars) {
      car.y = this.laneY();
      const halfLen = car.w / 2;
      let limit = aheadX - 60 - halfLen;
      if (!go && !car.passed) limit = Math.min(limit, this.stopX() - halfLen - 45);
      const target = car.x < limit - 5 ? (go || car.passed ? cruise : 380) : 0;
      car.vx = approach(car.vx, target, target > car.vx ? 0.35 : 0.12, dt);
      if (car.x + car.vx * dt > limit && !(go || car.passed)) car.vx = Math.max(0, (limit - car.x) / Math.max(dt, 1e-3));
      car.x += car.vx * dt;
      if (car.x - halfLen > this.stopX()) car.passed = true;
      aheadX = car.x - halfLen;
      car.update(dt, g.fx);
    }
    // cars that have left the screen go home; new ones join the queue
    for (let i = this.cars.length - 1; i >= 0; i--) {
      if (this.cars[i].x - this.cars[i].w / 2 > g.vw) {
        this.cars.splice(i, 1);
        g.stats.carsDone++;
      }
    }
    const last = this.cars.reduce((m, c) => (c.x < m ? c.x : m), Infinity);
    if (this.cars.length < 5 && (last === Infinity || last > 120)) this.spawn();
    const fastest = this.cars.reduce((m, c) => Math.max(m, c.vx), 0);
    g.audio.engineSpeed(clamp(fastest / 1100, 0, 1));
  }

  onHonk() {
    const c = this.focusCar();
    if (c) c.honk(this.game.audio);
  }

  drawLight(ctx) {
    const { vh } = this.game;
    const x = this.stopX() + 70;
    const base = vh * 0.8;
    const w = 130, h = 330;
    const top = base - 300 - h;
    ctx.lineWidth = 6;
    ctx.strokeStyle = INK;
    ctx.fillStyle = '#6c7489';
    ctx.beginPath();
    ctx.roundRect(x - 12, top + h - 10, 24, 310, 8);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#3a4158';
    ctx.beginPath();
    ctx.roundRect(x - w / 2, top, w, h, 34);
    ctx.fill();
    ctx.stroke();
    const lamps = [['red', '#ff4d4d', '#5a2a33'], ['yellow', '#ffd23f', '#5a5030'], ['green', '#39d96b', '#244d35']];
    lamps.forEach(([name, on, off], i) => {
      const cy = top + 58 + i * 105;
      const lit = this.state === name;
      if (lit) {
        ctx.save();
        ctx.globalAlpha = 0.35;
        ctx.fillStyle = on;
        ctx.beginPath();
        ctx.arc(x, cy, 76, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      ctx.fillStyle = lit ? on : off;
      ctx.beginPath();
      ctx.arc(x, cy, 42, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 5;
      ctx.stroke();
      if (lit) {
        // the lit lamp has a happy face
        ctx.strokeStyle = INK;
        ctx.lineWidth = 5;
        ctx.lineCap = 'round';
        ctx.beginPath();
        if (name === 'red') {
          ctx.arc(x - 14, cy - 6, 6, 0, Math.PI * 2);
          ctx.moveTo(x + 20, cy - 6);
          ctx.arc(x + 14, cy - 6, 6, 0, Math.PI * 2);
          ctx.moveTo(x + 10, cy + 12);
          ctx.arc(x, cy + 12, 10, 0.15 * Math.PI, 0.85 * Math.PI);
        } else {
          ctx.arc(x - 14, cy - 2, 8, 1.15 * Math.PI, 1.85 * Math.PI);
          ctx.moveTo(x + 22, cy - 2);
          ctx.arc(x + 14, cy - 2, 8, 1.15 * Math.PI, 1.85 * Math.PI);
          ctx.moveTo(x + 16, cy + 10);
          ctx.arc(x, cy + 10, 16, 0.1 * Math.PI, 0.9 * Math.PI);
        }
        ctx.stroke();
        ctx.fillStyle = '#ffffff';
        ctx.globalAlpha = 0.5;
        ctx.beginPath();
        ctx.arc(x - 18, cy - 20, 9, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.strokeStyle = INK;
      }
    });
    // visor caps
    ctx.fillStyle = '#2a3045';
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.roundRect(x - 50, top + 12 + i * 105, 100, 10, 5);
      ctx.fill();
    }
  }

  draw(ctx) {
    const g = this.game;
    const { vw, vh } = g;
    sky(ctx, vw, vh, g.t, 0);
    clouds(ctx, vw, vh, g.t * 30);
    hills(ctx, vw, vh * 0.6, 0);
    road(ctx, vw, vh, vh * 0.66, 0);
    // stop line + zebra crossing
    const sx = this.stopX();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(sx, vh * 0.66 + 8, 12, vh * 0.34 - 60);
    for (let y = vh * 0.66 + 16; y < vh - 60; y += 46) ctx.fillRect(sx + 30, y, 110, 26);
    this.drawLight(ctx);
    for (const c of [...this.cars].sort((a, b) => a.x - b.x)) c.draw(ctx);
  }
}
