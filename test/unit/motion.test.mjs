import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MotionDetector } from '../../src/js/motion.js';
import { SyntheticCamera } from '../../src/js/synth.js';

const FPS = 30;

/** Run `frames` frames of `region` through a detector; returns per-frame outputs (copied). */
function run(det, cam, region, frames, t0 = 0, amount = 1) {
  cam.set(region, amount);
  const outs = [];
  for (let i = 0; i < frames; i++) {
    const o = det.update(cam.next(), t0 + i / FPS);
    outs.push({ ...o });
  }
  return outs;
}

/** A detector that has just finished its silent settle window (default ~1.2 s of frames). */
function settled(opts = {}) {
  const det = new MotionDetector(opts);
  const cam = new SyntheticCamera({ seed: opts.seed ?? 3 });
  det.settle();
  run(det, cam, 'none', 40); // ~1.3 s of whatever is in the room
  assert.equal(det.settling, false, 'settled after ~1.3 s');
  return { det, cam, t: 40 / FPS };
}

test('standing still never triggers', () => {
  const { det, cam, t } = settled();
  const outs = run(det, cam, 'none', 300, t); // 10 s
  assert.ok(outs.every((o) => !o.moving), 'never "moving"');
  assert.ok(outs.every((o) => !o.honk), 'never honks');
  assert.ok(Math.max(...outs.map((o) => o.energy)) < 0.02, 'energy stays ~0');
});

test('without a settle window, still frames still do not trigger (defaults are safe)', () => {
  const det = new MotionDetector();
  const cam = new SyntheticCamera({ seed: 11 });
  const outs = run(det, cam, 'none', 150);
  assert.ok(outs.every((o) => !o.moving && !o.honk));
});

test('big whole-body motion triggers quickly (within 3 camera frames ≈ 100 ms)', () => {
  const { det, cam, t } = settled();
  const outs = run(det, cam, 'all', 30, t);
  const first = outs.findIndex((o) => o.moving);
  assert.ok(first >= 0 && first <= 2, `moving by frame ${first}`);
  assert.ok(outs[10].energy > 0.8, `energy high: ${outs[10].energy}`);
});

test('energy falls back gently when he stops (car keeps rolling a moment, then rests)', () => {
  const { det, cam, t } = settled();
  run(det, cam, 'all', 30, t);
  const after = run(det, cam, 'none', 60, t + 1);
  assert.ok(after[2].energy > 0.5, 'still rolling right after stopping');
  assert.ok(after[59].energy < 0.05, 'at rest two seconds later');
});

test('arms up (top-third motion) honks, and honks are rate-limited', () => {
  const { det, cam, t } = settled();
  const outs = run(det, cam, 'top', 60, t); // 2 s of waving
  const honks = outs.filter((o) => o.honk).length;
  assert.ok(honks >= 2 && honks <= 3, `honks in 2 s: ${honks}`);
  assert.ok(outs.findIndex((o) => o.honk) <= 2, 'first honk within ~100 ms');
});

test('motion only in the lower half does not honk', () => {
  const { det, cam, t } = settled();
  const outs = run(det, cam, 'bottom', 60, t);
  assert.ok(outs.some((o) => o.moving), 'it is motion');
  assert.equal(outs.filter((o) => o.honk).length, 0);
});

test('left motion steers left, right motion steers right', () => {
  const a = settled();
  const left = run(a.det, a.cam, 'left', 30, a.t);
  assert.ok(left.at(-1).steer < -0.5, `left steer ${left.at(-1).steer}`);
  assert.ok(left.at(-1).left > left.at(-1).right);
  const b = settled();
  const right = run(b.det, b.cam, 'right', 30, b.t);
  assert.ok(right.at(-1).steer > 0.5, `right steer ${right.at(-1).steer}`);
});

test('steering drifts back to centre when he stops', () => {
  const { det, cam, t } = settled();
  run(det, cam, 'left', 30, t);
  const after = run(det, cam, 'none', 90, t + 1);
  assert.ok(Math.abs(after.at(-1).steer) < 0.1, `steer ${after.at(-1).steer}`);
});

test('lighting flicker across the whole room is ignored', () => {
  const { det, cam, t } = settled();
  const outs = run(det, cam, 'flicker', 150, t);
  assert.ok(outs.every((o) => !o.moving && !o.honk), `max energy ${Math.max(...outs.map((o) => o.energy))}`);
});

test('isolated sensor sparkle is ignored', () => {
  const { det, cam, t } = settled();
  const outs = run(det, cam, 'sparkle', 150, t);
  assert.ok(outs.every((o) => !o.moving && !o.honk));
});

test('a noisier camera still does not trigger right after the settle window', () => {
  const det = new MotionDetector();
  const cam = new SyntheticCamera({ seed: 5, noise: 6 });
  det.settle();
  run(det, cam, 'none', 40);
  const outs = run(det, cam, 'none', 300, 40 / FPS);
  assert.ok(outs.every((o) => !o.moving && !o.honk));
});

test('lighting flicker from the very first frame never triggers, during or after settling', () => {
  const det = new MotionDetector();
  const cam = new SyntheticCamera({ seed: 9 });
  det.settle();
  const outs = run(det, cam, 'flicker', 240); // 8 s of flicker starting at the first frame
  assert.ok(outs.every((o) => !o.moving && !o.honk), `max energy ${Math.max(...outs.map((o) => o.energy))}`);
});

test('a noisy camera plus sparkle right after start does not trigger', () => {
  const det = new MotionDetector();
  const cam = new SyntheticCamera({ seed: 13, noise: 5 });
  det.settle();
  const outs = run(det, cam, 'sparkle', 240);
  assert.ok(outs.every((o) => !o.moving && !o.honk));
});

test('sensitivity: high reacts to smaller motion than low', () => {
  const lo = settled({ sensitivity: 'low' });
  const hi = settled({ sensitivity: 'high' });
  const a = run(lo.det, lo.cam, 'all', 20, lo.t, 0.35).at(-1).energy;
  const b = run(hi.det, hi.cam, 'all', 20, hi.t, 0.35).at(-1).energy;
  assert.ok(b > a, `high ${b} > low ${a}`);
});

test('settle window: motion is silent for ~1.2 s, then reacts normally even if he never stopped', () => {
  const det = new MotionDetector();
  const cam = new SyntheticCamera();
  det.settle();
  const during = run(det, cam, 'top', 34); // ~1.1 s of waving from the very first frame
  assert.ok(during.every((o) => !o.honk && !o.moving && o.energy === 0), 'nothing during settling');
  assert.ok(during.at(-1).settling, 'still settling at 1.1 s');
  const after = run(det, cam, 'top', 30, 34 / FPS);
  const firstHonk = after.findIndex((o) => o.honk);
  assert.ok(firstHonk >= 0 && firstHonk <= 6, `honks once settled (frame ${firstHonk})`);
  assert.ok(after.some((o) => o.moving), 'moving once settled');
});

test('settle() mid-play (recalibrate) mutes motion briefly, then it works again', () => {
  const { det, cam, t } = settled();
  run(det, cam, 'all', 15, t);
  det.reset();
  det.settle(1);
  const during = run(det, cam, 'all', 32, t + 0.5); // first frame after reset only primes prev
  assert.ok(during.every((o) => !o.moving && !o.honk));
  assert.ok(during.at(-1).settling === false, 'settled after 1 s of frames');
  const after = run(det, cam, 'all', 15, t + 0.5 + 32 / FPS);
  const first = after.findIndex((o) => o.moving);
  assert.ok(first >= 0 && first <= 3, `moving again right after (frame ${first})`);
});

test('default settle window is ~1.2 s of camera frames', () => {
  const det = new MotionDetector();
  const cam = new SyntheticCamera();
  det.settle();
  const outs = run(det, cam, 'none', 45);
  const end = outs.findIndex((o) => !o.settling);
  assert.ok(end >= 30 && end <= 40, `settled at frame ${end}`);
});

test('rejects frame sizes that do not fit the grid', () => {
  assert.throws(() => new MotionDetector({ width: 63 }));
});
