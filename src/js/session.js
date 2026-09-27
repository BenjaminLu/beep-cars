// Session clock: counts play time only (not while the parent menu is open), ends gently.

export class SessionTimer {
  constructor(seconds = 300) {
    this.duration = seconds;
    this.elapsed = 0;
    this.running = false;
    this.done = false;
  }
  setDuration(seconds) {
    this.duration = Math.max(5, seconds);
    if (this.elapsed >= this.duration) this.elapsed = Math.max(0, this.duration - 5);
  }
  start() {
    this.running = true;
  }
  pause() {
    this.running = false;
  }
  reset() {
    this.elapsed = 0;
    this.done = false;
    this.running = false;
  }
  /** Returns true exactly once, on the tick the session runs out. */
  tick(dt) {
    if (!this.running || this.done) return false;
    this.elapsed += dt;
    if (this.elapsed >= this.duration) {
      this.done = true;
      this.running = false;
      return true;
    }
    return false;
  }
  get remaining() {
    return Math.max(0, this.duration - this.elapsed);
  }
}
