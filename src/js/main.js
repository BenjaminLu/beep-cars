// 叭叭車 Beep Cars — app shell: start screen, calibration, play loop, parent menu, bedtime.

import { clamp, makeRng } from './util.js';
import { MotionDetector } from './motion.js';
import { LoudnessDetector } from './loudness.js';
import { SyntheticCamera } from './synth.js';
import { SessionTimer } from './session.js';
import { ParentCombo, shouldSwallow } from './keys.js';
import { AudioEngine } from './audio.js';
import { MediaInput, SAMPLE_W, SAMPLE_H } from './sources.js';
import { FX } from './fx.js';
import { CARS } from './cars.js';
import { CarActor } from './actor.js';
import { RoadScene } from './scenes/road.js';
import { GarageScene } from './scenes/garage.js';
import { WashScene } from './scenes/wash.js';
import { LightScene } from './scenes/light.js';
import { SleepScene } from './scenes/sleep.js';
import { GalleryScene } from './scenes/gallery.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const num = (k) => (params.has(k) && Number.isFinite(+params.get(k)) ? +params.get(k) : null);

const SCENES = ['road', 'garage', 'wash', 'light'];
const DEFAULTS = { scene: 'road', sensitivity: 'medium', volume: 0.7, muted: false, mirror: true, minutes: 5 };

// ---- settings (parent's choices, remembered on this computer only) ------------------------
function loadSettings() {
  try {
    const s = JSON.parse(localStorage.getItem('beepcars.settings') || '{}');
    return { ...DEFAULTS, ...s };
  } catch {
    return { ...DEFAULTS };
  }
}
function saveSettings() {
  try {
    localStorage.setItem('beepcars.settings', JSON.stringify(settings));
  } catch {
    /* private window: fine, just not remembered */
  }
}
const settings = loadSettings();
if (params.get('scene') && [...SCENES, 'gallery'].includes(params.get('scene'))) settings.scene = params.get('scene');

// ---- core objects -------------------------------------------------------------------------
const canvas = $('stage');
const ctx = canvas.getContext('2d', { alpha: false });
const video = $('mirror-video');
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const synthetic = params.has('synthetic');

const audio = new AudioEngine();
const media = new MediaInput(video);
const detector = new MotionDetector({ width: SAMPLE_W, height: SAMPLE_H, sensitivity: settings.sensitivity });
const loud = new LoudnessDetector();
const synthCam = synthetic ? new SyntheticCamera({ width: SAMPLE_W, height: SAMPLE_H }) : null;
const session = new SessionTimer(num('sessionSeconds') ?? settings.minutes * 60);
const combo = new ParentCombo();
const fx = new FX({ reduced });
const rng = makeRng((Date.now() & 0xffff) + 1);

const stats = {
  honks: 0, waveHonks: 0, keyHonks: 0, keyPresses: 0, doots: 0, carsDone: 0, invites: 0,
  garageOpens: 0, washes: 0, greens: 0, frames: 0, camFrames: 0, sceneChanges: 0,
  latency: { moving: null, honk: null },
};
const frameWork = [];
const frameGaps = [];

const game = {
  vw: 1600, vh: 900, t: 0, reduced, audio, fx, stats,
  deck: [],
  lastType: null,
  makeCar(opts = {}) {
    if (!this.deck.length) {
      this.deck = CARS.slice();
      for (let i = this.deck.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [this.deck[i], this.deck[j]] = [this.deck[j], this.deck[i]];
      }
      if (this.deck[this.deck.length - 1] === this.lastType) this.deck.unshift(this.deck.pop());
    }
    const type = this.deck.pop();
    this.lastType = type;
    return new CarActor(type, { ...opts, reduced });
  },
};

const scenes = {
  road: new RoadScene(game),
  garage: new GarageScene(game),
  wash: new WashScene(game),
  light: new LightScene(game),
  sleep: new SleepScene(game),
  gallery: new GalleryScene(game),
};

let state = 'start'; // start | calibrate | play | sleep
let scene = scenes.road;
let panelOpen = false;
let fade = 0;
let lastActivity = 0;
let keyQueue = 0;
let lastKeyHonk = 0;
let clapQueue = 0;
let synthMic = 0;
let synthLastFrame = 0;
let motionSetAt = null;
let calib = null;
const idleSeconds = num('idleSeconds') ?? 25;
const calibSeconds = num('calibSeconds') ?? 3;
const input = { energy: 0, steer: 0, moving: false, top: 0, left: 0, right: 0 };

// ---- sizing -------------------------------------------------------------------------------
let scale = 1;
function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  canvas.width = Math.round(innerWidth * dpr);
  canvas.height = Math.round(innerHeight * dpr);
  scale = canvas.height / 900;
  game.vh = 900;
  game.vw = canvas.width / scale;
}
addEventListener('resize', resize);
resize();

// ---- scenes -------------------------------------------------------------------------------
function setScene(name, { remember = true } = {}) {
  if (!scenes[name]) return;
  scene.exit();
  fx.clear();
  scene = scenes[name];
  scene.enter();
  fade = 1;
  stats.sceneChanges++;
  if (remember && SCENES.includes(name)) {
    settings.scene = name;
    saveSettings();
  }
  document.body.dataset.scene = name;
  updatePanel();
}

// ---- the "beep?" invitation car when he wanders off -----------------------------------
const invite = {
  car: null,
  state: 'hidden',
  t: 0,
  asks: 0,
  start() {
    this.car = game.makeCar({ scale: 0.8, dir: 1 });
    this.car.y = game.vh * 0.97;
    this.car.x = -this.car.w * 0.6;
    this.state = 'in';
    this.t = 0;
    this.asks = 0;
    stats.invites++;
  },
  cheer() {
    if (this.state === 'in' || this.state === 'wait') {
      this.state = 'out';
      this.car.honk(audio, { jump: true });
    }
  },
  update(dt) {
    if (this.state === 'hidden') return;
    const c = this.car;
    this.t += dt;
    if (this.state === 'in') {
      c.x += (c.w * 0.3 - c.x) * Math.min(1, dt * 3);
      c.vx = 120;
      if (this.t > 0.9) {
        this.state = 'wait';
        this.t = 0;
        this.ask();
      }
    } else if (this.state === 'wait') {
      c.vx = 0;
      if (this.t > 6) {
        this.t = 0;
        if (this.asks >= 3) {
          this.state = 'back';
        } else this.ask();
      }
    } else if (this.state === 'out') {
      c.vx = Math.min(1400, c.vx + 2400 * dt);
      c.x += c.vx * dt;
      if (c.x > game.vw + c.w) this.state = 'hidden';
    } else if (this.state === 'back') {
      c.vx = -300;
      c.x -= 300 * dt;
      if (c.x < -c.w) {
        this.state = 'hidden';
        lastActivity = game.t; // wait a full idle period before asking again
      }
    }
    c.update(dt, fx);
  },
  ask() {
    this.asks++;
    audio.honk('question', { force: true });
    this.car.honkT = 1;
    this.car.lookTarget = { x: 0.9, y: -0.3 };
    this.car.hop(0.35);
  },
  draw(ctx) {
    if (this.state !== 'hidden') this.car.draw(ctx);
  },
};

// ---- events -------------------------------------------------------------------------------
function honkFromChild(source) {
  stats.honks++;
  if (source === 'wave') stats.waveHonks++;
  if (source === 'key') stats.keyHonks++;
  if (invite.state !== 'hidden') invite.cheer();
  scene.onHonk(source);
  const car = scene.focusCar();
  if (car) {
    const f = car.front();
    for (let i = 0; i < 2; i++) fx.note(f.x, f.y - 30);
  }
}

function clap() {
  stats.doots++;
  audio.doot();
  fx.confetti(game.vw * 0.5, game.vh * 0.3, 70, 1100);
  const car = scene.focusCar();
  if (car) car.hop(0.8);
  if (invite.state !== 'hidden') invite.cheer();
}

// ---- keyboard: every key is a honk, nothing ever leaves the game ---------------------------
function onKeyDown(e) {
  const now = performance.now() / 1000;
  combo.keydown(e.code, now);
  if (panelOpen) {
    if (e.key === 'Escape') {
      e.preventDefault();
      closePanel();
    }
    if (!shouldSwallow(e, true)) return;
  }
  e.preventDefault();
  e.stopPropagation();
  stats.keyPresses++;
  if (state === 'play' && !e.repeat) keyQueue++;
  if (state === 'play' && !document.fullscreenElement) requestFull();
}
function onKeyUp(e) {
  combo.keyup(e.code, performance.now() / 1000);
  if (!panelOpen) {
    e.preventDefault();
    e.stopPropagation();
  }
}
addEventListener('keydown', onKeyDown, { capture: true });
addEventListener('keyup', onKeyUp, { capture: true });
addEventListener('keypress', (e) => !panelOpen && e.preventDefault(), { capture: true });
addEventListener('blur', () => combo.blur());

// No context menu, no zoom, no scroll, no dragging, no swipe-back.
for (const ev of ['contextmenu', 'dragstart', 'selectstart', 'gesturestart', 'gesturechange']) {
  addEventListener(ev, (e) => e.preventDefault(), { capture: true });
}
addEventListener('wheel', (e) => e.preventDefault(), { passive: false, capture: true });
addEventListener('touchmove', (e) => e.preventDefault(), { passive: false, capture: true });

// A trackpad bash is also a honk; a parent can long-press the top-left corner for the menu.
let cornerPress = null;
addEventListener('pointerdown', (e) => {
  if (panelOpen || e.target.closest('button, input, label, .card')) return;
  if (e.clientX < 90 && e.clientY < 90) cornerPress = { t: performance.now(), x: e.clientX, y: e.clientY };
  if (state === 'play') keyQueue++;
});
addEventListener('pointerup', () => (cornerPress = null));
addEventListener('pointermove', (e) => {
  if (cornerPress && Math.hypot(e.clientX - cornerPress.x, e.clientY - cornerPress.y) > 30) cornerPress = null;
});

// Guard against accidental navigation (the back gesture, Cmd+R, closing the tab).
function armNavigationGuards() {
  try {
    history.pushState({ beep: 1 }, '', location.href);
  } catch {
    /* file:// in some browsers */
  }
}
addEventListener('popstate', () => {
  if (state === 'play' || state === 'calibrate') armNavigationGuards();
});
addEventListener('beforeunload', (e) => {
  if (state === 'play') {
    e.preventDefault();
    e.returnValue = '';
  }
});

function requestFull() {
  const el = document.documentElement;
  if (document.fullscreenElement || !el.requestFullscreen) return;
  el.requestFullscreen({ navigationUI: 'hide' })
    .then(() => navigator.keyboard?.lock?.().catch(() => {}))
    .catch(() => {});
}

// ---- parent menu ----------------------------------------------------------------------------
function openPanel() {
  if (panelOpen || state === 'start') return;
  panelOpen = true;
  session.pause();
  $('panel').hidden = false;
  updatePanel();
  $('resume').focus();
}
function closePanel() {
  panelOpen = false;
  $('panel').hidden = true;
  if (state === 'play') session.start();
  canvas.focus();
}
function fmtRemain() {
  const s = Math.ceil(session.remaining);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
function updatePanel() {
  const p = $('panel');
  if (!p) return;
  for (const b of p.querySelectorAll('[data-scene]')) b.setAttribute('aria-pressed', String(b.dataset.scene === scene.name));
  for (const b of p.querySelectorAll('[data-sens]')) b.setAttribute('aria-pressed', String(b.dataset.sens === settings.sensitivity));
  for (const b of p.querySelectorAll('[data-min]')) b.setAttribute('aria-pressed', String(+b.dataset.min * 60 === session.duration));
  $('mute').setAttribute('aria-pressed', String(settings.muted));
  $('mirror-toggle').setAttribute('aria-pressed', String(settings.mirror));
  $('volume').value = String(Math.round(settings.volume * 100));
  $('remain').textContent = fmtRemain();
  $('devices').textContent = `攝影機 Camera: ${media.hasVideo || synthetic ? '✓' : '✗'} · 麥克風 Mic: ${media.hasAudio ? '✓' : '✗'}`;
  document.body.classList.toggle('no-mirror', !settings.mirror);
}

function wirePanel() {
  const p = $('panel');
  p.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.scene) {
      setScene(b.dataset.scene);
      closePanel();
    } else if (b.dataset.sens) {
      settings.sensitivity = b.dataset.sens;
      detector.setSensitivity(settings.sensitivity);
      loud.setSensitivity({ low: 0.7, medium: 1, high: 1.4 }[settings.sensitivity]);
    } else if (b.dataset.min) {
      settings.minutes = +b.dataset.min;
      session.setDuration(settings.minutes * 60);
    } else if (b.id === 'mute') {
      settings.muted = !settings.muted;
      audio.setMuted(settings.muted);
    } else if (b.id === 'mirror-toggle') {
      settings.mirror = !settings.mirror;
    } else if (b.id === 'recalibrate') {
      closePanel();
      beginCalibration();
    } else if (b.id === 'end') {
      closePanel();
      endSession();
    } else if (b.id === 'resume') {
      closePanel();
    }
    saveSettings();
    updatePanel();
  });
  $('volume').addEventListener('input', (e) => {
    settings.volume = +e.target.value / 100;
    audio.setVolume(settings.volume);
    saveSettings();
  });
}

// ---- flow: start → calibrate → play → sleep ----------------------------------------------
async function start() {
  $('start').hidden = true;
  requestFull();
  audio.init();
  audio.resume();
  audio.setVolume(settings.volume);
  audio.setMuted(settings.muted);
  audio.onPlay = (name) => {
    if (name.startsWith('honk:')) document.body.dataset.lastSound = name;
  };
  armNavigationGuards();
  state = 'calibrate';
  $('calib').hidden = false;
  $('calib-msg').hidden = false;
  $('calib-nocam').hidden = true;
  document.body.classList.add('calibrating');
  const st = await media.start(audio.ctx);
  document.body.classList.toggle('live', st.video);
  if (!st.video && !synthetic) {
    $('calib-msg').hidden = true;
    $('calib-nocam').hidden = false;
    setTimeout(beginPlay, 2500);
    return;
  }
  beginCalibration();
}

function beginCalibration() {
  state = 'calibrate';
  $('calib').hidden = false;
  document.body.classList.add('calibrating');
  detector.reset();
  detector.beginCalibration();
  calib = { t: 0, restarts: 0 };
  setRing(0);
}

function setRing(k) {
  const c = $('calib-ring');
  if (c) c.style.strokeDashoffset = String(Math.round(339 * (1 - k)));
  const n = $('calib-count');
  if (n) n.textContent = String(Math.max(1, Math.ceil(calibSeconds * (1 - k))));
}

function updateCalibration(dt, out) {
  if (out.raw > 0.35 && calib.restarts < 3 && calib.t > 0.3) {
    // He moved: start the count again (at most three times; then just accept — never a dead end).
    calib.t = 0;
    calib.restarts++;
    detector.beginCalibration();
  }
  calib.t += dt;
  setRing(calib.t / calibSeconds);
  if (calib.t >= calibSeconds) {
    detector.endCalibration();
    beginPlay();
  }
}

function beginPlay() {
  $('calib').hidden = true;
  document.body.classList.remove('calibrating');
  const wasPlaying = session.elapsed > 0 && !session.done;
  state = 'play';
  lastActivity = game.t;
  if (!wasPlaying) {
    session.reset();
    setScene(settings.scene, { remember: false });
  }
  session.start();
}

function endSession() {
  if (state === 'sleep') return;
  state = 'sleep';
  session.pause();
  invite.state = 'hidden';
  media.stop(); // camera light goes off right away
  document.body.classList.remove('live');
  $('calib').hidden = true;
  document.body.classList.remove('calibrating');
  document.body.classList.add('asleep');
  setScene('sleep', { remember: false });
  const len = audio.lullaby();
  $('sleep-card').hidden = false;
  $('again').hidden = true;
  setTimeout(() => {
    $('again').hidden = false;
    audio.stopEngine();
  }, Math.max(3000, (len || 0) * 1000));
}

function playAgain() {
  $('sleep-card').hidden = true;
  document.body.classList.remove('asleep');
  session.reset();
  session.setDuration(num('sessionSeconds') ?? settings.minutes * 60);
  start();
}

// ---- main loop ------------------------------------------------------------------------------
let last = performance.now() / 1000;
function frame() {
  requestAnimationFrame(frame);
  const w0 = performance.now();
  const now = w0 / 1000;
  frameGaps.push((now - last) * 1000);
  if (frameGaps.length > 600) frameGaps.shift();
  const dt = clamp(now - last, 0, 0.05);
  last = now;
  game.t += dt;
  stats.frames++;

  // 1. sense
  let out = null;
  if (state === 'calibrate' || state === 'play') {
    let gray = null;
    if (synthCam) {
      if (now - synthLastFrame >= 1 / 30 - 0.002) {
        synthLastFrame = now;
        gray = synthCam.next();
      }
    } else gray = media.sample();
    if (gray) {
      stats.camFrames++;
      out = detector.update(gray, now);
    }
  }
  const o = detector.out;
  input.energy = state === 'play' ? o.energy : 0;
  input.steer = o.steer;
  input.moving = state === 'play' && o.moving;
  input.top = o.top;
  input.left = o.left;
  input.right = o.right;
  if (state === 'calibrate' && out && calib) updateCalibration(dt, out);

  // 2. parent combo (both Shift keys, or a 2 s press in the top-left corner)
  if (combo.update(now)) openPanel();
  if (cornerPress && performance.now() - cornerPress.t > 2000) {
    cornerPress = null;
    openPanel();
  }
  const hold = combo.progress(now);
  $('hold').style.opacity = hold > 0.15 && !panelOpen ? String(hold) : '0';

  // 3. play
  if (state === 'play' && !panelOpen) {
    if (session.tick(dt)) endSession();
    if (out && out.honk) {
      if (motionSetAt != null && stats.latency.honk == null) stats.latency.honk = performance.now() - motionSetAt;
      honkFromChild('wave');
    }
    if (o.moving && motionSetAt != null && stats.latency.moving == null) stats.latency.moving = performance.now() - motionSetAt;
    // mic
    const level = synthetic ? synthMic : media.micLevel();
    if (loud.update(level, now, audio.outputLevel(), dt)) clapQueue++;
    if (clapQueue > 0) {
      clapQueue = 0;
      clap();
      lastActivity = game.t;
    }
    if (keyQueue > 0) {
      keyQueue = 0;
      lastActivity = game.t;
      if (now - lastKeyHonk > 0.15) {
        lastKeyHonk = now;
        honkFromChild('key');
      }
    }
    if (o.moving) {
      lastActivity = game.t;
      if (invite.state !== 'hidden') invite.cheer();
    }
    if (invite.state === 'hidden' && game.t - lastActivity > idleSeconds) invite.start();
  } else {
    keyQueue = 0;
  }

  if (state === 'start') {
    // attract mode behind the start card: a car idles and rolls along gently
    input.energy = 0.25 + 0.2 * Math.sin(game.t * 0.7);
    input.moving = true;
  }
  if (!panelOpen || state !== 'play') scene.update(dt, input);
  invite.update(dt);
  fx.update(dt);
  $('mirror').style.setProperty('--energy', o.energy.toFixed(2));

  // 4. draw
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  scene.draw(ctx);
  fx.draw(ctx, game.t);
  invite.draw(ctx);
  if (fade > 0) {
    ctx.fillStyle = `rgba(214,240,255,${fade})`;
    ctx.fillRect(0, 0, game.vw, game.vh);
    fade = Math.max(0, fade - dt * 2.5);
  }
  frameWork.push(performance.now() - w0);
  if (frameWork.length > 600) frameWork.shift();
  if (panelOpen && stats.frames % 15 === 0) $('remain').textContent = fmtRemain();
}

// ---- boot -------------------------------------------------------------------------------------
$('go').addEventListener('click', start);
$('again').addEventListener('click', playAgain);
wirePanel();
document.body.classList.toggle('reduced', reduced);
detector.setSensitivity(settings.sensitivity);
if (settings.scene === 'gallery') {
  // car parade: shown straight away, no camera needed
  scene = scenes.gallery;
  $('start').hidden = true;
  settings.scene = 'road';
}
scene.enter();
document.body.dataset.scene = scene.name;
updatePanel();
requestAnimationFrame(frame);

// Test / debugging hook. Read-only views plus the synthetic camera and mic used by the tests.
window.__beep = {
  get state() { return state; },
  get scene() { return scene.name; },
  get panelOpen() { return panelOpen; },
  get input() { return { ...input }; },
  get detector() { return { ...detector.out, sensitivity: detector.sensitivity }; },
  get settings() { return { ...settings }; },
  get session() { return { duration: session.duration, elapsed: session.elapsed, done: session.done }; },
  get audio() { return { muted: audio.muted, gain: audio.effectiveGain, state: audio.ctx?.state ?? 'none', recoveries: audio.recoveries || 0, broken: !!audio.broken }; },
  /** Simulates the output device failing (e.g. headphones unplugged) to test recovery. */
  /** Release camera, mic and audio (tests call this before the page is torn down). */
  teardown() {
    media.stop();
  },
  simulateAudioDeviceError() {
    audio.ctx?.dispatchEvent(new Event('error'));
  },
  get fx() { return { count: fx.count, confetti: fx.countOf('confetti'), bubbles: fx.countOf('bubble'), max: fx.max }; },
  get invite() { return invite.state; },
  get reduced() { return reduced; },
  get view() { return { vw: game.vw, vh: game.vh }; },
  sceneState() {
    const s = scene;
    return {
      name: s.name,
      speed: s.speed, scroll: s.scroll, dist: s.dist, phase: s.phase,
      carX: s.car?.x, carDir: s.car?.dir, carType: s.car?.type.id,
      doors: s.garages?.map((g) => +g.open.toFixed(3)), sel: s.sel,
      clean: s.clean,
      light: s.state, carsVx: s.cars?.map((c) => Math.round(c.vx)),
    };
  },
  stats,
  frameWork,
  frameGaps,
  tracks: () => media.trackStates(),
  videoAttached: () => !!video.srcObject,
  synthetic: {
    set(region, amount = 1) {
      if (!synthCam) throw new Error('load with ?synthetic');
      if (region !== 'none') {
        motionSetAt = performance.now();
        stats.latency = { moving: null, honk: null };
      }
      synthCam.set(region, amount);
    },
    mic(level) {
      synthMic = level;
    },
  },
  setScene,
  endSession,
};
