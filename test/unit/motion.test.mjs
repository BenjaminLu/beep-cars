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

function calibrated(opts = {}) {
  const det = new MotionDetector(opts);
  const cam = new SyntheticCamera({ seed: opts.seed ?? 3 });
  det.beginCalibration();
  run(det, cam, 'none', 90); // 3 s standing still
  det.endCalibration();
  return { det, cam, t: 3 };
}

test('standing still never triggers', () => {
  const { det, cam, t } = calibrated();
  const outs = run(det, cam, 'none', 300, t); // 10 s
  assert.ok(outs.every((o) => !o.moving), 'never "moving"');
  assert.ok(outs.every((o) => !o.honk), 'never honks');
  assert.ok(Math.max(...outs.map((o) => o.energy)) < 0.02, 'energy stays ~0');
});

test('without calibration, still frames still do not trigger (defaults are safe)', () => {
  const det = new MotionDetector();
  const cam = new SyntheticCamera({ seed: 11 });
  const outs = run(det, cam, 'none', 150);
  assert.ok(outs.every((o) => !o.moving && !o.honk));
});

test('big whole-body motion triggers quickly (within 3 camera frames ≈ 100 ms)', () => {
  const { det, cam, t } = calibrated();
  const outs = run(det, cam, 'all', 30, t);
  const first = outs.findIndex((o) => o.moving);
  assert.ok(first >= 0 && first <= 2, `moving by frame ${first}`);
  assert.ok(outs[10].energy > 0.8, `energy high: ${outs[10].energy}`);
});

test('energy falls back gently when he stops (car keeps rolling a moment, then rests)', () => {
  const { det, cam, t } = calibrated();
  run(det, cam, 'all', 30, t);
  const after = run(det, cam, 'none', 60, t + 1);
  assert.ok(after[2].energy > 0.5, 'still rolling right after stopping');
  assert.ok(after[59].energy < 0.05, 'at rest two seconds later');
});

test('arms up (top-third motion) honks, and honks are rate-limited', () => {
  const { det, cam, t } = calibrated();
  const outs = run(det, cam, 'top', 60, t); // 2 s of waving
  const honks = outs.filter((o) => o.honk).length;
  assert.ok(honks >= 2 && honks <= 3, `honks in 2 s: ${honks}`);
  assert.ok(outs.findIndex((o) => o.honk) <= 2, 'first honk within ~100 ms');
});

test('motion only in the lower half does not honk', () => {
  const { det, cam, t } = calibrated();
  const outs = run(det, cam, 'bottom', 60, t);
  assert.ok(outs.some((o) => o.moving), 'it is motion');
  assert.equal(outs.filter((o) => o.honk).length, 0);
});

test('left motion steers left, right motion steers right', () => {
  const a = calibrated();
  const left = run(a.det, a.cam, 'left', 30, a.t);
  assert.ok(left.at(-1).steer < -0.5, `left steer ${left.at(-1).steer}`);
  assert.ok(left.at(-1).left > left.at(-1).right);
  const b = calibrated();
  const right = run(b.det, b.cam, 'right', 30, b.t);
  assert.ok(right.at(-1).steer > 0.5, `right steer ${right.at(-1).steer}`);
});

test('steering drifts back to centre when he stops', () => {
  const { det, cam, t } = calibrated();
  run(det, cam, 'left', 30, t);
  const after = run(det, cam, 'none', 90, t + 1);
  assert.ok(Math.abs(after.at(-1).steer) < 0.1, `steer ${after.at(-1).steer}`);
});

test('lighting flicker across the whole room is ignored', () => {
  const { det, cam, t } = calibrated();
  const outs = run(det, cam, 'flicker', 150, t);
  assert.ok(outs.every((o) => !o.moving && !o.honk), `max energy ${Math.max(...outs.map((o) => o.energy))}`);
});

test('isolated sensor sparkle is ignored', () => {
  const { det, cam, t } = calibrated();
  const outs = run(det, cam, 'sparkle', 150, t);
  assert.ok(outs.every((o) => !o.moving && !o.honk));
});

test('a noisier camera after calibration still does not trigger', () => {
  const det = new MotionDetector();
  const cam = new SyntheticCamera({ seed: 5, noise: 6 });
  det.beginCalibration();
  run(det, cam, 'none', 90);
  det.endCalibration();
  const outs = run(det, cam, 'none', 300, 3);
  assert.ok(outs.every((o) => !o.moving && !o.honk));
});

test('sensitivity: high reacts to smaller motion than low', () => {
  const lo = calibrated({ sensitivity: 'low' });
  const hi = calibrated({ sensitivity: 'high' });
  const a = run(lo.det, lo.cam, 'all', 20, lo.t, 0.35).at(-1).energy;
  const b = run(hi.det, hi.cam, 'all', 20, hi.t, 0.35).at(-1).energy;
  assert.ok(b > a, `high ${b} > low ${a}`);
});

test('no honks or motion events are emitted during calibration', () => {
  const det = new MotionDetector();
  const cam = new SyntheticCamera();
  det.beginCalibration();
  const outs = run(det, cam, 'top', 30);
  assert.ok(outs.every((o) => !o.honk));
  det.endCalibration();
});

test('rejects frame sizes that do not fit the grid', () => {
  assert.throws(() => new MotionDetector({ width: 63 }));
});
