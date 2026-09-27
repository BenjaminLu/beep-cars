// Scene 2 — Garage peekaboo: three garages. His movement rolls the chosen door up (the wheels peek
// out first), and when it is open the car inside pops out with a honk. Moving on one side picks the
// garage on that side. Then the car drives away and a new one hides behind the door.

import { approach, clamp } from '../util.js';
import { sky, clouds } from '../backdrop.js';
import { drawGarageBack, drawGarageDoor, opening } from './garageArt.js';

const OPEN_RATE = 0.85; // door opening per second at full motion

export class GarageScene {
  constructor(game) {
    this.game = game;
    this.name = 'garage';
    this.garages = [];
    this.sel = 1;
    this.rumbleT = 0;
  }

  layout() {
    const { vw, vh } = this.game;
    const w = Math.min(vw * 0.29, 470);
    const h = w * 0.9;
    const floor = vh * 0.66;
    [0.19, 0.5, 0.81].forEach((fx, i) => {
      const g = this.garages[i] || (this.garages[i] = { style: i, open: 0, state: 'closed', car: null, t: 0 });
      g.x = vw * fx;
      g.y = floor;
      g.w = w;
      g.h = h;
    });
  }

  enter() {
    this.layout();
    for (const g of this.garages) this.fill(g);
    this.game.audio.stopEngine();
  }
  exit() {}

  fill(g) {
    const car = this.game.makeCar({ scale: 1, dir: 1 });
    const o = opening(g);
    car.scale = Math.min((o.w * 0.9) / car.type.len, (o.h * 0.92) / car.type.height);
    car.x = g.x;
    car.y = g.y;
    g.car = car;
    g.state = 'closed';
    g.open = 0;
  }

  focusCar() {
    const g = this.garages.find((q) => q.state === 'out' || q.state === 'leaving');
    return g ? g.car : null;
  }

  update(dt, input) {
    const game = this.game;
    this.layout();
    if (input.steer < -0.35) this.sel = 0;
    else if (input.steer > 0.35) this.sel = 2;
    else if (input.moving && Math.abs(input.steer) < 0.12 && this.garages[this.sel].state !== 'closed') this.sel = 1;
    let chosen = this.garages[this.sel];
    // if the chosen garage is busy, open the nearest closed one instead (never a dead end)
    if (chosen.state !== 'closed') {
      const alt = this.garages.filter((q) => q.state === 'closed').sort((a, b) => Math.abs(a.x - chosen.x) - Math.abs(b.x - chosen.x))[0];
      if (alt) {
        this.sel = this.garages.indexOf(alt);
        chosen = alt;
      }
    }
    const frontY = game.vh * 0.95;
    for (const g of this.garages) {
      const car = g.car;
      g.t += dt;
      if (g.state === 'closed') {
        if (g === chosen && input.moving) {
          g.open = Math.min(1, g.open + input.energy * OPEN_RATE * dt);
          this.rumbleT -= dt;
          if (this.rumbleT <= 0) {
            game.audio.rumble(0.35);
            this.rumbleT = 0.3;
          }
          if (Math.random() < dt * 3) car.hop(0.3); // excited wiggle behind the door
        } else if (g.open > 0) {
          g.open = Math.max(0, g.open - dt * 0.12); // sinks back very gently
        }
        if (g.open >= 1) {
          g.state = 'out';
          g.t = 0;
          car.honk(game.audio, { jump: true });
          game.fx.confetti(g.x, g.y - g.h * 0.4, 40, 700);
          game.stats.garageOpens++;
          game.audio.setEngine(car.type.engine);
        }
      } else if (g.state === 'out') {
        // roll forward out of the garage, towards him
        const k = clamp(g.t / 0.8, 0, 1);
        car.y = approach(car.y, frontY, 0.2, dt);
        const base = Math.min((opening(g).w * 0.9) / car.type.len, 1);
        car.scale = approach(car.scale, base * 1.12, 0.3, dt);
        car.vx = k < 1 ? 60 : 0;
        if (input.moving && Math.random() < dt * 2) car.hop(0.4);
        if (g.t > 3.2 && !input.moving) {
          g.state = 'leaving';
          car.dir = g.x < game.vw / 2 ? -1 : 1;
          car.honk(game.audio, { jump: false });
        }
        if (g.t > 6) {
          g.state = 'leaving';
          car.dir = g.x < game.vw / 2 ? -1 : 1;
        }
      } else if (g.state === 'leaving') {
        car.vx = approach(car.vx, 900 * car.dir, 0.4, dt);
        car.x += car.vx * dt;
        g.open = Math.max(0, g.open - dt * 0.8);
        if (g.open > 0 && Math.random() < dt * 2) game.audio.rumble(0.3);
        if (car.x < -car.w || car.x > game.vw + car.w) {
          game.stats.carsDone++;
          game.audio.stopEngine();
          this.fill(g);
          g.open = 0;
        }
      }
      car.update(dt, g.state === 'closed' ? null : game.fx);
    }
  }

  onHonk() {
    const car = this.focusCar();
    if (car) car.honk(this.game.audio);
    else {
      // behind the door: a muffled honk and the door jiggles a little bit open (peekaboo!)
      const g = this.garages[this.sel];
      g.car.honk(this.game.audio, { jump: true });
      g.open = Math.min(0.95, g.open + 0.12);
    }
  }

  draw(ctx) {
    const game = this.game;
    const { vw, vh } = game;
    sky(ctx, vw, vh, game.t, 0);
    clouds(ctx, vw, vh, game.t * 30);
    // lawn + driveway
    ctx.fillStyle = '#7fd672';
    ctx.fillRect(-2, vh * 0.6, vw + 4, vh * 0.4 + 2);
    ctx.fillStyle = '#c9ced9';
    ctx.fillRect(-2, vh * 0.66, vw + 4, vh * 0.34 + 2);
    ctx.fillStyle = '#b8bfcc';
    for (let x = 0; x < vw; x += 120) ctx.fillRect(x, vh * 0.66, 4, vh * 0.34);
    for (const g of this.garages) {
      drawGarageBack(ctx, g, 0);
      if (g.state === 'closed') {
        // hidden car: clip to the opening so only the peeking part shows as the door rises
        const o = opening(g);
        ctx.save();
        ctx.beginPath();
        ctx.rect(o.x, o.y, o.w, o.h);
        ctx.clip();
        g.car.draw(ctx);
        ctx.restore();
      }
      drawGarageDoor(ctx, g, game.t, this.garages.indexOf(g) === this.sel && g.state === 'closed');
    }
    // cars that are out are drawn in front of everything
    for (const g of this.garages) if (g.state !== 'closed') g.car.draw(ctx);
  }
}
