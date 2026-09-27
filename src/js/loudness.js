// Microphone clap/shout detector. Pure: feed it RMS levels, it says when a clap happened.
//
// It learns the room's noise floor, and it refuses to fire on the game's own sounds leaking
// from the laptop speakers into the laptop microphone (otherwise a honk would trigger a
// "doot doot", which triggers another... ). `outputLevel` is the RMS the game is playing right now.

import { approach } from './util.js';

export class LoudnessDetector {
  constructor({ ratio = 4, minLevel = 0.06, leak = 1.6, refractory = 0.7, holdAfterOutput = 0.25 } = {}) {
    this.ratio = ratio; // how far above the noise floor a clap must be
    this.minLevel = minLevel; // absolute RMS floor (0..1)
    this.leak = leak; // mic level expected per unit of our own output level
    this.refractory = refractory;
    this.holdAfterOutput = holdAfterOutput; // seconds of deafness after we played something loud
    this.floor = 0.01;
    this.lastFire = -Infinity;
    this.lastLoudOutput = -Infinity;
    this.sensitivity = 1;
    this.level = 0;
  }

  setSensitivity(mult) {
    this.sensitivity = mult;
  }

  /** Returns true when a clap/shout fires. `now` in seconds. */
  update(level, now, outputLevel = 0, dt = 1 / 60) {
    this.level = level;
    if (outputLevel > 0.02) this.lastLoudOutput = now;
    const thr = Math.max(this.minLevel, this.floor * this.ratio, outputLevel * this.leak) / this.sensitivity;
    const loud = level > thr;
    const deaf = now - this.lastLoudOutput < this.holdAfterOutput && level < thr * 2.5;
    let fire = false;
    if (loud && !deaf && now - this.lastFire >= this.refractory) {
      fire = true;
      this.lastFire = now;
    }
    // Floor tracks quiet room noise quickly downward, slowly upward, and ignores the loud bits.
    if (!loud) this.floor = approach(this.floor, level, level < this.floor ? 0.5 : 4, dt);
    return fire;
  }
}
