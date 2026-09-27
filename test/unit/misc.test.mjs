import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LoudnessDetector } from '../../src/js/loudness.js';
import { SessionTimer } from '../../src/js/session.js';
import { ParentCombo, shouldSwallow } from '../../src/js/keys.js';
import { flashPhase, MAX_FLASH_HZ } from '../../src/js/util.js';
import { FX } from '../../src/js/fx.js';
import { MAX_MASTER } from '../../src/js/audio.js';

const DT = 1 / 60;

function settle(d, level = 0.01, frames = 120, t0 = 0) {
  for (let i = 0; i < frames; i++) d.update(level, t0 + i * DT, 0, DT);
  return t0 + frames * DT;
}

test('mic: quiet room never fires; a clap does', () => {
  const d = new LoudnessDetector();
  let t = 0;
  for (let i = 0; i < 600; i++) assert.equal(d.update(0.01 + Math.random() * 0.01, (t += DT), 0, DT), false);
  assert.equal(d.update(0.3, (t += DT), 0, DT), true);
});

test('mic: claps are rate-limited', () => {
  const d = new LoudnessDetector();
  let t = settle(d);
  let fired = 0;
  for (let i = 0; i < 60; i++) if (d.update(0.3, (t += DT), 0, DT)) fired++; // 1 s of shouting
  assert.ok(fired >= 1 && fired <= 2, `${fired}`);
});

test("mic: the game's own honks leaking into the mic do not trigger doot-doot", () => {
  const d = new LoudnessDetector();
  let t = settle(d);
  // our output is loud; the mic hears it at roughly the same level
  for (let i = 0; i < 60; i++) assert.equal(d.update(0.12, (t += DT), 0.12, DT), false);
  // shortly after we stop playing, echo is still ignored
  assert.equal(d.update(0.1, (t += DT), 0, DT), false);
});

test('mic: a noisy room raises the floor instead of firing forever', () => {
  const d = new LoudnessDetector();
  let t = 0, fired = 0;
  for (let i = 0; i < 600; i++) if (d.update(0.05, (t += DT), 0, DT)) fired++;
  assert.equal(fired, 0);
});

test('session: counts only while running, ends exactly once', () => {
  const s = new SessionTimer(10);
  assert.equal(s.tick(5), false, 'not started');
  s.start();
  assert.equal(s.tick(4), false);
  s.pause();
  assert.equal(s.tick(100), false, 'paused (parent menu open)');
  s.start();
  assert.equal(s.tick(7), true);
  assert.equal(s.tick(1), false, 'only once');
  assert.equal(s.remaining, 0);
});

test('session: shortening below the elapsed time still leaves a gentle wind-down', () => {
  const s = new SessionTimer(600);
  s.start();
  s.tick(300);
  s.setDuration(180);
  assert.ok(s.remaining > 0 && s.remaining <= 5);
});

test('parent combo: both Shifts for 2 s, not one, not briefly', () => {
  const c = new ParentCombo(2);
  c.keydown('ShiftLeft', 0);
  assert.equal(c.update(3), false, 'one shift');
  c.keydown('ShiftRight', 3);
  assert.equal(c.update(4), false, 'too short');
  c.keyup('ShiftRight', 4.5);
  c.keydown('ShiftRight', 5);
  assert.equal(c.update(6.9), false, 'timer restarted');
  assert.equal(c.update(7.01), true);
  assert.equal(c.update(8), false, 'fires once per hold');
  c.blur();
  assert.equal(c.progress(9), 0);
});

test('keys are swallowed outside the parent menu only', () => {
  assert.equal(shouldSwallow({ key: 'Tab' }, false), true);
  assert.equal(shouldSwallow({ key: 'Tab' }, true), false);
});

test('photosensitivity: nothing blinks faster than 3 Hz', () => {
  assert.ok(MAX_FLASH_HZ <= 3);
  for (const hz of [0.5, 1, 1.5, 2, 5, 30]) {
    let toggles = 0, prev = flashPhase(0, hz);
    for (let t = 0.001; t < 10; t += 0.001) {
      const p = flashPhase(t, hz);
      if (p !== prev) toggles++;
      prev = p;
    }
    const fullCycles = toggles / 2 / 10;
    assert.ok(fullCycles <= 3, `${hz} Hz requested → ${fullCycles} flashes/s`);
  }
});

test('volume is hard-capped', () => {
  assert.ok(MAX_MASTER > 0 && MAX_MASTER <= 0.6);
});

test('particles are capped (confetti storms cannot grow without bound)', () => {
  const fx = new FX();
  for (let i = 0; i < 50; i++) fx.confetti(0, 0, 100);
  assert.ok(fx.count <= fx.max);
  const r = new FX({ reduced: true });
  r.confetti(0, 0, 90);
  assert.ok(r.count <= 30, 'reduced motion: fewer');
  for (let i = 0; i < 400; i++) fx.update(1 / 30);
  assert.equal(fx.count, 0, 'everything fades away');
});
