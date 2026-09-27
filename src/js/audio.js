// All sound is synthesized with WebAudio: no files, no downloads.
// Output chain: voices -> master (user volume, hard-capped) -> limiter -> speakers.
// Nothing from the microphone is ever routed to the speakers.

export const MAX_MASTER = 0.55; // hard cap on loudness, whatever the parent's slider says

const NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12); // MIDI note -> Hz

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.volume = 0.7; // parent slider 0..1
    this.muted = false;
    this.voices = 0;
    this.lastHonk = 0;
    this.engine = null;
    this.outLevel = 0;
    this.onPlay = null; // (name) => void, used by stats/tests
  }

  /** Must be called from a user gesture (the parent's Start click). */
  init() {
    if (this.ctx) return this.ctx;
    const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AC) return null;
    const ctx = new AC({ latencyHint: 'interactive' });
    this.ctx = ctx;
    this.broken = false;
    // The output device can fail or change (headphones unplugged). Rebuild on the next sound.
    ctx.addEventListener?.('error', () => {
      this.broken = true;
    });
    this.master = ctx.createGain();
    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -12;
    this.limiter.knee.value = 6;
    this.limiter.ratio.value = 20;
    this.limiter.attack.value = 0.002;
    this.limiter.release.value = 0.15;
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 512;
    this.anaBuf = new Float32Array(this.analyser.fftSize);
    this.master.connect(this.limiter);
    this.limiter.connect(ctx.destination);
    this.limiter.connect(this.analyser);
    this.applyVolume();
    // A soft shared reverb-ish echo for warmth.
    this.echo = ctx.createDelay(0.5);
    this.echo.delayTime.value = 0.18;
    const fb = ctx.createGain();
    fb.gain.value = 0.22;
    const wet = ctx.createGain();
    wet.gain.value = 0.18;
    this.echo.connect(fb).connect(this.echo);
    this.echo.connect(wet).connect(this.master);
    this.noiseBuf = this.makeNoise();
    return ctx;
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  setVolume(v) {
    this.volume = Math.max(0, Math.min(1, v));
    this.applyVolume();
  }
  setMuted(m) {
    this.muted = !!m;
    this.applyVolume();
  }
  get effectiveGain() {
    return this.muted ? 0 : this.volume * MAX_MASTER;
  }
  applyVolume() {
    if (!this.master) return;
    this.master.gain.setTargetAtTime(this.effectiveGain, this.ctx.currentTime, 0.05);
  }

  /** Current output RMS, so the mic detector can ignore our own sounds. */
  outputLevel() {
    if (!this.analyser) return 0;
    this.analyser.getFloatTimeDomainData(this.anaBuf);
    let s = 0;
    for (let i = 0; i < this.anaBuf.length; i++) s += this.anaBuf[i] * this.anaBuf[i];
    this.outLevel = Math.sqrt(s / this.anaBuf.length);
    return this.outLevel;
  }

  makeNoise() {
    const ctx = this.ctx;
    const buf = ctx.createBuffer(1, ctx.sampleRate * 1, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  // ---- building blocks -------------------------------------------------------------------

  /** One enveloped oscillator voice. */
  tone({ type = 'sine', freq = 440, to = null, start = 0, dur = 0.2, gain = 0.3, attack = 0.01, release = 0.08, filter = null, q = 1, echo = false, detune = 0 }) {
    const ctx = this.ctx;
    const t0 = ctx.currentTime + start;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (detune) osc.detune.value = detune;
    if (to) osc.frequency.exponentialRampToValueAtTime(to, t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + attack);
    g.gain.setValueAtTime(gain, t0 + Math.max(attack, dur - release));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    let node = osc;
    if (filter) {
      const f = ctx.createBiquadFilter();
      f.type = filter.type || 'lowpass';
      f.frequency.value = filter.freq;
      f.Q.value = q;
      node.connect(f);
      node = f;
    }
    node.connect(g);
    g.connect(this.master);
    if (echo) g.connect(this.echo);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
    this.voices++;
    osc.onended = () => {
      this.voices--;
      g.disconnect();
    };
    return osc;
  }

  noise({ start = 0, dur = 0.3, gain = 0.1, freq = 800, to = null, type = 'bandpass', q = 1 }) {
    const ctx = this.ctx;
    const t0 = ctx.currentTime + start;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t0);
    if (to) f.frequency.exponentialRampToValueAtTime(to, t0 + dur);
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t0);
    src.stop(t0 + dur + 0.05);
    this.voices++;
    src.onended = () => {
      this.voices--;
      g.disconnect();
    };
  }

  /** A car-horn note: two detuned buzzy oscillators through a honky band-pass. */
  horn(freqs, { start = 0, dur = 0.22, gain = 0.16, body = 1400, type = 'square', bend = 1 } = {}) {
    for (const f of freqs) {
      this.tone({ type, freq: f, to: bend !== 1 ? f * bend : null, start, dur, gain, attack: 0.012, release: 0.06, filter: { type: 'lowpass', freq: body }, q: 2.5, echo: true });
      this.tone({ type: 'sawtooth', freq: f * 1.003, start, dur, gain: gain * 0.35, attack: 0.012, release: 0.06, filter: { type: 'bandpass', freq: body * 0.8 }, q: 3 });
    }
  }

  ready() {
    if (this.broken) this.recover();
    return !!this.ctx && this.ctx.state !== 'closed';
  }

  /**
   * The output device failed or changed (e.g. headphones unplugged): Chrome suspends the context.
   * Try to resume it — at most once every 5 s. We deliberately never close/recreate the context
   * here: on a dead device that can block the page, and a silent game is better than a frozen one.
   */
  recover() {
    const now = (globalThis.performance?.now() ?? Date.now()) / 1000;
    if (this.lastRecover != null && now - this.lastRecover < 5) return;
    this.lastRecover = now;
    this.recoveries = (this.recoveries || 0) + 1;
    this.ctx?.resume().then(
      () => {
        if (this.ctx?.state === 'running') this.broken = false;
      },
      () => {},
    );
  }

  /** Voice limiting: mashing the keyboard must not become a wall of noise. */
  admit(minGap = 0.09) {
    if (!this.ready()) return false;
    const now = this.ctx.currentTime;
    if (this.voices > 40) return false;
    if (now - this.lastHonk < minGap) return false;
    this.lastHonk = now;
    return true;
  }

  // ---- the car sounds --------------------------------------------------------------------

  /** Play the honk for a car's sound profile. Returns true if it played. */
  honk(profile = 'car', { force = false, pitch = 1 } = {}) {
    if (!force && !this.admit()) return false;
    if (force && !this.ready()) return false;
    const p = pitch;
    switch (profile) {
      case 'fire':
        this.siren('fire');
        this.horn([233 * p, 294 * p], { dur: 0.35, gain: 0.12, body: 1100, type: 'sawtooth' });
        break;
      case 'police':
        this.siren('police');
        break;
      case 'bus':
        this.horn([196 * p, 247 * p], { dur: 0.45, gain: 0.15, body: 900 });
        break;
      case 'truck':
        this.horn([147 * p, 185 * p, 220 * p], { dur: 0.5, gain: 0.11, body: 800, type: 'sawtooth' });
        break;
      case 'garbage':
        this.horn([131 * p, 165 * p], { dur: 0.3, gain: 0.13, body: 700, type: 'sawtooth' });
        this.horn([131 * p, 165 * p], { start: 0.38, dur: 0.3, gain: 0.13, body: 700, type: 'sawtooth' });
        break;
      case 'taxi':
        this.horn([440 * p, 554 * p], { dur: 0.13, gain: 0.13 });
        this.horn([440 * p, 554 * p], { start: 0.17, dur: 0.16, gain: 0.13 });
        break;
      case 'race':
        this.tone({ type: 'sawtooth', freq: 90 * p, to: 420 * p, dur: 0.45, gain: 0.12, filter: { freq: 1600 }, q: 4 });
        this.horn([660 * p, 880 * p], { start: 0.42, dur: 0.12, gain: 0.1, body: 2400 });
        this.horn([660 * p, 880 * p], { start: 0.58, dur: 0.12, gain: 0.1, body: 2400 });
        break;
      case 'tractor':
        // "A-oo-gah!"
        this.horn([180 * p], { dur: 0.5, gain: 0.18, body: 1200, bend: 1.9, type: 'sawtooth' });
        break;
      case 'ice':
        this.bell([0, 4, 7, 12, 7], 0.13, 84);
        break;
      case 'digger':
        for (let i = 0; i < 3; i++) this.tone({ type: 'sine', freq: 1046 * p, start: i * 0.22, dur: 0.14, gain: 0.14, attack: 0.005, release: 0.02 });
        break;
      case 'question':
        // "Beep?" – a questioning upward honk to invite him back.
        this.horn([330 * p, 415 * p], { dur: 0.16, gain: 0.11 });
        this.horn([370 * p, 466 * p], { start: 0.22, dur: 0.34, gain: 0.11, bend: 1.28 });
        break;
      case 'happy':
        this.horn([392 * p, 494 * p], { dur: 0.1, gain: 0.12 });
        this.horn([523 * p, 659 * p], { start: 0.13, dur: 0.18, gain: 0.12 });
        break;
      default:
        this.horn([392 * p, 494 * p], { dur: 0.14, gain: 0.14 });
        this.horn([392 * p, 494 * p], { start: 0.19, dur: 0.2, gain: 0.14 });
    }
    this.onPlay?.(`honk:${profile}`);
    return true;
  }

  siren(kind) {
    if (kind === 'police') {
      // nee-naw ×2
      for (let i = 0; i < 4; i++) {
        const f = i % 2 ? 587 : 784;
        this.tone({ type: 'triangle', freq: f, start: i * 0.28, dur: 0.27, gain: 0.13, attack: 0.02, release: 0.04, echo: true });
        this.tone({ type: 'square', freq: f, start: i * 0.28, dur: 0.27, gain: 0.03, filter: { freq: 2000 }, attack: 0.02, release: 0.04 });
      }
    } else {
      // wee-ooo sweep ×2
      for (let i = 0; i < 2; i++) {
        this.tone({ type: 'triangle', freq: 520, to: 900, start: i * 0.7, dur: 0.35, gain: 0.12, attack: 0.03, release: 0.03, echo: true });
        this.tone({ type: 'triangle', freq: 900, to: 520, start: i * 0.7 + 0.35, dur: 0.35, gain: 0.12, attack: 0.02, release: 0.08, echo: true });
      }
    }
  }

  /** Music-box / ice-cream-van bell: inharmonic partials with a long decay. */
  bell(steps, gap = 0.14, root = 84, gain = 0.1) {
    steps.forEach((s, i) => {
      const f = NOTE(root + s);
      this.tone({ type: 'sine', freq: f, start: i * gap, dur: 0.7, gain, attack: 0.004, release: 0.6, echo: true });
      this.tone({ type: 'sine', freq: f * 2.76, start: i * gap, dur: 0.25, gain: gain * 0.25, attack: 0.002, release: 0.2 });
    });
  }

  /** Clap/shout reward: "doot doot!" on a toy trumpet. */
  doot() {
    if (!this.ready()) return;
    const f1 = NOTE(72), f2 = NOTE(79);
    [[f1, 0], [f2, 0.2]].forEach(([f, s]) => {
      this.tone({ type: 'square', freq: f, start: s, dur: 0.17, gain: 0.09, attack: 0.015, release: 0.05, filter: { freq: 1800 }, q: 1.5, echo: true });
      this.tone({ type: 'sine', freq: f, start: s, dur: 0.17, gain: 0.12, attack: 0.015, release: 0.05 });
    });
    this.onPlay?.('doot');
  }

  pop() {
    if (!this.ready() || this.voices > 30) return;
    const f = 500 + Math.random() * 700;
    this.tone({ type: 'sine', freq: f, to: f * 1.9, dur: 0.07, gain: 0.07, attack: 0.003, release: 0.04 });
  }

  sparkle() {
    if (!this.ready()) return;
    [0, 4, 7, 11, 12, 16, 19, 24].forEach((s, i) => this.tone({ type: 'sine', freq: NOTE(79 + s), start: i * 0.06, dur: 0.5, gain: 0.07, attack: 0.004, release: 0.45, echo: true }));
    this.onPlay?.('sparkle');
  }

  ding() {
    if (!this.ready()) return;
    this.tone({ type: 'sine', freq: NOTE(88), dur: 0.8, gain: 0.08, attack: 0.004, release: 0.7, echo: true });
    this.tone({ type: 'sine', freq: NOTE(95), start: 0.05, dur: 0.6, gain: 0.05, attack: 0.004, release: 0.5 });
  }

  rumble(dur = 0.6) {
    if (!this.ready() || this.voices > 30) return;
    this.noise({ dur, gain: 0.06, freq: 300, to: 700, q: 0.8 });
  }

  whoosh() {
    if (!this.ready()) return;
    this.noise({ dur: 0.5, gain: 0.05, freq: 400, to: 2400, q: 1.2 });
  }

  // ---- continuous engine hum ----------------------------------------------------------

  /** Start or change the looping engine sound for the current car. */
  setEngine(profile) {
    if (!this.ready()) return;
    const P = ENGINE[profile] || ENGINE.car;
    const ctx = this.ctx;
    if (this.engine) this.stopEngine(0.3);
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = P.base;
    const sub = ctx.createOscillator();
    sub.type = 'triangle';
    sub.frequency.value = P.base / 2;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = P.cut;
    lp.Q.value = 3;
    const putt = ctx.createGain();
    putt.gain.value = 0.6;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = P.putt;
    const lfoAmt = ctx.createGain();
    lfoAmt.gain.value = 0.4;
    lfo.connect(lfoAmt).connect(putt.gain);
    const g = ctx.createGain();
    g.gain.value = 0.0001;
    g.gain.setTargetAtTime(P.gain * 0.6, ctx.currentTime, 0.2);
    osc.connect(lp);
    sub.connect(lp);
    lp.connect(putt).connect(g).connect(this.master);
    osc.start();
    sub.start();
    lfo.start();
    this.engine = { osc, sub, lp, lfo, g, P };
  }

  /** speed 0..1 */
  engineSpeed(speed) {
    const e = this.engine;
    if (!e) return;
    const t = this.ctx.currentTime;
    const f = e.P.base * (1 + speed * e.P.rev);
    e.osc.frequency.setTargetAtTime(f, t, 0.08);
    e.sub.frequency.setTargetAtTime(f / 2, t, 0.08);
    e.lp.frequency.setTargetAtTime(e.P.cut * (1 + speed * 1.5), t, 0.08);
    e.lfo.frequency.setTargetAtTime(e.P.putt * (1 + speed * 2), t, 0.1);
    e.g.gain.setTargetAtTime(e.P.gain * (0.6 + speed * 0.6), t, 0.1);
  }

  stopEngine(fade = 0.4) {
    const e = this.engine;
    if (!e || !this.ready()) return;
    this.engine = null;
    const t = this.ctx.currentTime;
    e.g.gain.setTargetAtTime(0.0001, t, fade / 3);
    for (const o of [e.osc, e.sub, e.lfo]) o.stop(t + fade + 0.1);
  }

  // ---- bedtime ------------------------------------------------------------------------

  /** Brahms' Lullaby (public domain) on a soft music box, with a warm pad. ~30 s. */
  lullaby() {
    if (!this.ready()) return 0;
    this.stopEngine(1.5);
    // (midi note, beats)
    const tune = [
      [64, 0.5], [64, 0.5], [67, 1.5], [64, 0.5], [64, 0.5], [67, 2],
      [64, 0.5], [67, 0.5], [72, 1], [71, 1.5], [69, 0.5], [69, 1], [67, 2],
      [62, 0.5], [64, 0.5], [65, 1], [62, 1], [62, 0.5], [64, 0.5], [65, 2],
      [62, 0.5], [65, 0.5], [71, 0.5], [69, 0.5], [67, 1], [71, 1], [72, 3],
    ];
    const beat = 0.62;
    let t = 0.4;
    for (const [n, b] of tune) {
      const f = NOTE(n + 12);
      this.tone({ type: 'sine', freq: f, start: t, dur: Math.max(0.9, b * beat * 1.4), gain: 0.07, attack: 0.006, release: 0.8, echo: true });
      this.tone({ type: 'sine', freq: f * 2, start: t, dur: 0.4, gain: 0.015, attack: 0.004, release: 0.35 });
      t += b * beat;
    }
    // Soft pad chords underneath.
    const chords = [[48, 55, 64], [43, 50, 59], [48, 55, 64], [41, 48, 57], [43, 50, 59], [48, 55, 64]];
    const each = t / chords.length;
    chords.forEach((c, i) =>
      c.forEach((n) => this.tone({ type: 'triangle', freq: NOTE(n), start: 0.4 + i * each, dur: each + 0.3, gain: 0.025, attack: 0.6, release: 0.8, filter: { freq: 700 } })),
    );
    this.onPlay?.('lullaby');
    return t + 1;
  }

  async close() {
    this.stopEngine(0.1);
    if (this.ctx && this.ctx.state !== 'closed') {
      try {
        await this.ctx.close();
      } catch {
        /* already closed */
      }
    }
  }
}

// Engine sound character for each car profile: base Hz, rev range, putt-putt rate, filter, level.
export const ENGINE = {
  car: { base: 55, rev: 1.2, putt: 9, cut: 420, gain: 0.05 },
  taxi: { base: 60, rev: 1.3, putt: 10, cut: 450, gain: 0.05 },
  police: { base: 62, rev: 1.5, putt: 11, cut: 500, gain: 0.05 },
  fire: { base: 42, rev: 1.0, putt: 7, cut: 380, gain: 0.06 },
  bus: { base: 40, rev: 0.9, putt: 6, cut: 350, gain: 0.06 },
  truck: { base: 36, rev: 0.9, putt: 5, cut: 320, gain: 0.065 },
  garbage: { base: 38, rev: 0.8, putt: 5.5, cut: 330, gain: 0.065 },
  tractor: { base: 34, rev: 0.7, putt: 4, cut: 300, gain: 0.07 },
  race: { base: 80, rev: 2.2, putt: 16, cut: 700, gain: 0.045 },
  ice: { base: 58, rev: 1.1, putt: 9, cut: 420, gain: 0.045 },
  digger: { base: 36, rev: 0.8, putt: 4.5, cut: 310, gain: 0.065 },
};
