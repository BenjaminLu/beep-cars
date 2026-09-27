// Scene 1 — Road: the more he moves, the faster the car drives. Moving on one side turns the car
// that way. After a good drive the car honks goodbye and zooms off; the next car arrives.

import { approach, clamp } from '../util.js';
import { sky, clouds, hills, roadside, road } from '../backdrop.js';

const MAX_SPEED = 1100;
const TRIP = 6500; // units of driving before the car says goodbye

export class RoadScene {
  constructor(game) {
    this.game = game;
    this.name = 'road';
    this.scroll = 0;
    this.speed = 0;
    this.car = null;
  }

  enter() {
    this.newCar(1);
  }
  exit() {}

  newCar(dir) {
    const g = this.game;
    this.car = g.makeCar({ scale: 1.3, dir });
    this.car.x = dir > 0 ? -this.car.w : g.vw + this.car.w;
    this.phase = 'enter';
    this.dist = 0;
    g.audio.setEngine(this.car.type.engine);
    this.car.honk(g.audio, { jump: false });
  }

  get groundY() {
    return this.game.vh * 0.9;
  }

  focusCar() {
    return this.car;
  }

  update(dt, input) {
    const g = this.game;
    const car = this.car;
    car.y = this.groundY;
    const center = g.vw * 0.5;
    if (this.phase === 'enter') {
      const target = center - car.dir * g.vw * 0.08;
      car.x = approach(car.x, target, 0.35, dt);
      car.vx = (target - car.x) * 3;
      this.speed = approach(this.speed, 0, 0.3, dt);
      if (Math.abs(car.x - target) < 12) this.phase = 'drive';
    } else if (this.phase === 'drive') {
      // Speed follows his motion; a tiny idle creep keeps the world alive.
      this.speed = approach(this.speed, input.energy * MAX_SPEED, input.energy > this.speed / MAX_SPEED ? 0.08 : 0.5, dt);
      if (input.steer < -0.4) car.turnTo(-1);
      else if (input.steer > 0.4) car.turnTo(1);
      const target = center + input.steer * g.vw * 0.22 - car.dir * (this.speed / MAX_SPEED) * g.vw * 0.06;
      car.x = approach(car.x, clamp(target, car.w * 0.5, g.vw - car.w * 0.5), 0.45, dt);
      car.vx = this.speed * car.dir;
      this.dist += this.speed * dt;
      if (this.dist > TRIP) {
        this.phase = 'leave';
        car.honk(g.audio, { jump: true });
        g.audio.whoosh();
      }
    } else if (this.phase === 'leave') {
      this.speed = approach(this.speed, MAX_SPEED * 1.2, 0.3, dt);
      car.vx = this.speed * car.dir;
      car.x += car.dir * (400 + this.speed * 0.6) * dt;
      if (car.x < -car.w || car.x > g.vw + car.w) {
        g.stats.carsDone++;
        this.newCar(car.dir);
      }
    }
    this.scroll += this.speed * car.dir * dt;
    g.audio.engineSpeed(this.speed / MAX_SPEED);
    car.update(dt, g.fx);
  }

  onHonk() {
    this.car.honk(this.game.audio);
  }

  draw(ctx) {
    const g = this.game;
    const { vw, vh } = g;
    sky(ctx, vw, vh, g.t, 0);
    clouds(ctx, vw, vh, this.scroll);
    const horizon = vh * 0.6;
    hills(ctx, vw, horizon, this.scroll);
    road(ctx, vw, vh, vh * 0.66, this.scroll);
    roadside(ctx, vw, vh * 0.62, this.scroll * 0.7, 1);
    this.car.draw(ctx);
  }
}
