// Car parade (hidden, ?scene=gallery): all ten cars on one screen. Used for proofs and for the
// parent to see who's in the game. Honks make every car honk-animate without sound.

import { CARS, INK } from '../cars.js';
import { CarActor } from '../actor.js';
import { sky } from '../backdrop.js';

export class GalleryScene {
  constructor(game) {
    this.game = game;
    this.name = 'gallery';
  }
  enter() {
    this.cars = CARS.map((type) => new CarActor(type, { scale: 0.62, reduced: this.game.reduced }));
  }
  exit() {}
  focusCar() {
    return this.cars[0];
  }
  layout() {
    const { vw, vh } = this.game;
    const cols = 5;
    this.cars.forEach((c, i) => {
      c.x = (vw / cols) * ((i % cols) + 0.5);
      c.y = vh * (i < cols ? 0.46 : 0.9);
      c.scale = Math.min(0.62, (vw / cols) * 0.9 / c.type.len);
    });
  }
  update(dt, input) {
    this.layout();
    for (const c of this.cars) {
      c.vx = input.energy * 400;
      c.update(dt, null);
    }
  }
  onHonk() {
    for (const c of this.cars) c.honk(null, { sound: false });
    this.game.audio.honk('car');
  }
  draw(ctx) {
    const { vw, vh } = this.game;
    sky(ctx, vw, vh, this.game.t, 0);
    ctx.fillStyle = '#7fd672';
    ctx.fillRect(0, vh * 0.46, vw, 14);
    ctx.fillRect(0, vh * 0.9, vw, vh * 0.1);
    for (const c of this.cars) {
      c.draw(ctx);
      ctx.fillStyle = INK;
      ctx.font = '600 22px system-ui, "PingFang TC", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`${c.type.zh} ${c.type.en}`, c.x, c.y + 44);
    }
  }
}
