import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CARS } from '../../src/js/cars.js';
import { CarActor } from '../../src/js/actor.js';
import { FX } from '../../src/js/fx.js';
import { ENGINE } from '../../src/js/audio.js';
import { mockCtx } from './mockctx.mjs';

test('at least 8 distinct cars, each with its own look and sound', () => {
  assert.ok(CARS.length >= 8, `${CARS.length} cars`);
  assert.equal(new Set(CARS.map((c) => c.id)).size, CARS.length, 'unique ids');
  assert.equal(new Set(CARS.map((c) => c.draw)).size, CARS.length, 'each has its own drawing');
  assert.ok(new Set(CARS.map((c) => c.color)).size >= 8, 'varied colours');
  assert.ok(new Set(CARS.map((c) => c.sound)).size >= 8, 'varied honks');
  for (const c of CARS) {
    assert.ok(ENGINE[c.engine], `${c.id} has an engine sound`);
    assert.ok(c.zh && c.en, `${c.id} has parent-facing names`);
  }
  for (const id of ['fire', 'police', 'bus', 'dump', 'tractor', 'race', 'taxi', 'ice', 'garbage', 'digger']) {
    assert.ok(CARS.some((c) => c.id === id), `has ${id}`);
  }
  assert.ok(CARS.filter((c) => c.siren).map((c) => c.id).sort().join() === 'fire,police', 'fire engine and police car have sirens');
});

test('every car draws in every mood without errors (and without NaN coordinates)', () => {
  const moods = [
    { t: 0, wheel: 0, blink: 0, honk: 0, look: { x: 0, y: 0 }, action: 0 },
    { t: 1.3, wheel: 2.1, blink: 1, honk: 1, look: { x: 1, y: -1 }, action: 1, siren: true },
    { t: 2, wheel: -5, blink: 0, honk: 0.5, happy: true, action: 0.5 },
    { t: 3, wheel: 0, blink: 0, honk: 0, sleepy: true, action: 0 },
  ];
  for (const c of CARS) {
    for (const m of moods) {
      const ctx = mockCtx();
      c.draw(ctx, m);
      assert.ok(ctx.calls.length > 50, `${c.id} draws plenty (${ctx.calls.length} calls)`);
    }
  }
});

test('a car honks, jumps, squashes on landing, and settles', () => {
  const car = new CarActor(CARS[0], { x: 500, y: 800 });
  const sounds = [];
  const audio = { honk: (p) => (sounds.push(p), true) };
  car.honk(audio);
  assert.deepEqual(sounds, ['fire']);
  let maxJump = 0, minSquash = 0, maxSquash = 0;
  const fx = new FX();
  for (let i = 0; i < 120; i++) {
    car.update(1 / 60, fx);
    maxJump = Math.max(maxJump, car.jump);
    minSquash = Math.min(minSquash, car.squash);
    maxSquash = Math.max(maxSquash, car.squash);
  }
  assert.ok(maxJump > 40, `jumps (${maxJump.toFixed(0)})`);
  assert.ok(minSquash < -0.05, 'stretches on take-off');
  assert.ok(maxSquash > 0.05, 'squashes on landing');
  assert.equal(car.jump, 0, 'back on the ground');
  assert.ok(Math.abs(car.squash) < 0.02, 'settled');
  assert.ok(fx.countOf('puff') > 0, 'little exhaust puffs');
  const ctx = mockCtx();
  car.draw(ctx);
  assert.ok(ctx.calls.length > 50);
});

test('wheels spin with speed, in the direction of travel', () => {
  const car = new CarActor(CARS[6], {});
  car.vx = 400;
  for (let i = 0; i < 30; i++) car.update(1 / 60, null);
  assert.ok(car.wheel > 1);
  const back = new CarActor(CARS[6], {});
  back.vx = -400;
  for (let i = 0; i < 30; i++) back.update(1 / 60, null);
  assert.ok(back.wheel < -1);
});

test('reduced motion: smaller jumps', () => {
  const a = new CarActor(CARS[1], {});
  const b = new CarActor(CARS[1], { reduced: true });
  a.honk(null, { sound: false });
  b.honk(null, { sound: false });
  let ma = 0, mb = 0;
  for (let i = 0; i < 60; i++) {
    a.update(1 / 60, null);
    b.update(1 / 60, null);
    ma = Math.max(ma, a.jump);
    mb = Math.max(mb, b.jump);
  }
  assert.ok(mb < ma * 0.7, `${mb} < ${ma}`);
});
