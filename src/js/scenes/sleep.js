// End of session — "Cars go home to sleep": the sky turns to night, three cars drive home one by
// one, the garage doors roll down, the windows glow and little z's float up. Calm, no input.

import { approach } from '../util.js';
import { sky, makeStars, hills } from '../backdrop.js';
import { drawGarageBack, drawGarageDoor, opening } from './garageArt.js';

export class SleepScene {
  constructor(game) {
    this.game = game;
    this.name = 'sleep';
    this.stars = makeStars(80);
  }

  enter() {
    const g = this.game;
    this.t = 0;
    this.night = 0;
    this.garages = [0.22, 0.5, 0.78].map((fx, i) => ({ style: i, open: 1, x: g.vw * fx, y: g.vh * 0.72, w: Math.min(g.vw * 0.25, 400), h: Math.min(g.vw * 0.25, 400) * 0.9, car: null, state: 'waiting' }));
    this.garages.forEach((gar, i) => {
      const car = g.makeCar({ scale: 1, dir: 1 });
      const o = opening(gar);
      car.scale = Math.min((o.w * 0.88) / car.type.len, (o.h * 0.9) / car.type.height);
      car.x = -car.w - i * 40;
      car.y = g.vh * 0.93;
      car.startAt = 1.2 + i * 1.7;
      gar.car = car;
    });
    this.zT = 0;
  }
  exit() {}

  focusCar() {
    return null;
  }

  update(dt) {
    const g = this.game;
    this.t += dt;
    this.night = Math.min(1, this.t / 4);
    for (const gar of this.garages) {
      const car = gar.car;
      if (gar.state === 'waiting' && this.t >= car.startAt) gar.state = 'driving';
      if (gar.state === 'driving') {
        car.vx = approach(car.vx, (gar.x - car.x) * 1.4, 0.3, dt);
        car.vx = Math.min(car.vx, 560);
        car.x += car.vx * dt;
        if (Math.abs(car.x - gar.x) < 30) {
          car.x = gar.x;
          gar.state = 'parking';
        }
      } else if (gar.state === 'parking') {
        car.vx = 0;
        car.y = approach(car.y, gar.y, 0.35, dt);
        if (Math.abs(car.y - gar.y) < 3) {
          car.y = gar.y;
          car.sleepy = true;
          gar.state = 'closing';
          g.audio.rumble(1.2);
        }
      } else if (gar.state === 'closing') {
        gar.open = Math.max(0, gar.open - dt * 0.55);
        if (gar.open <= 0) gar.state = 'asleep';
      }
      if (gar.state === 'asleep') {
        if (Math.random() < dt * 0.6) g.fx.zzz(gar.x + gar.w * 0.2, gar.y - gar.h * 0.9);
      }
      car.update(dt, null);
      if (car.sleepy) car.blink = 0;
    }
  }

  onHonk() {}

  draw(ctx) {
    const g = this.game;
    const { vw, vh } = g;
    sky(ctx, vw, vh, g.t, this.night, this.stars);
    hills(ctx, vw, vh * 0.62, 0, this.night);
    ctx.fillStyle = this.night > 0.5 ? '#2c4a3c' : '#7fd672';
    ctx.fillRect(-2, vh * 0.62, vw + 4, vh * 0.4);
    ctx.fillStyle = this.night > 0.5 ? '#3a4058' : '#c9ced9';
    ctx.fillRect(-2, vh * 0.72, vw + 4, vh * 0.3);
    for (const gar of this.garages) {
      drawGarageBack(ctx, gar, this.night);
      if (gar.state === 'parking' || gar.state === 'closing' || gar.state === 'asleep') {
        const o = opening(gar);
        ctx.save();
        ctx.beginPath();
        ctx.rect(o.x - 4, o.y - 4, o.w + 8, o.h + 8 + (gar.state === 'parking' ? 400 : 0));
        ctx.clip();
        gar.car.draw(ctx);
        ctx.restore();
      }
      drawGarageDoor(ctx, gar, g.t, false);
      if (gar.state === 'asleep') {
        // warm little window light
        ctx.fillStyle = 'rgba(255,220,130,0.9)';
        ctx.beginPath();
        ctx.arc(gar.x, gar.y - gar.h * 0.83, 10, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    for (const gar of this.garages) if (gar.state === 'waiting' || gar.state === 'driving') gar.car.draw(ctx);
  }
}
