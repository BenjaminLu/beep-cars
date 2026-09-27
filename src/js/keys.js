// Keyboard policy. A toddler will bang the keyboard: every key is a honk, nothing ever leaves the game.
// The parent opens the menu by holding BOTH Shift keys for 2 seconds (a palm-mash almost never
// holds exactly those two keys that long).

export const PARENT_HOLD_SECONDS = 2;

/**
 * Tracks the two-Shift hold. Feed keydown/keyup codes and the time; `update(now)` returns true once
 * when the combo has been held long enough.
 */
export class ParentCombo {
  constructor(hold = PARENT_HOLD_SECONDS) {
    this.hold = hold;
    this.down = new Set();
    this.since = null;
    this.fired = false;
  }
  keydown(code, now) {
    this.down.add(code);
    this.check(now);
  }
  keyup(code, now) {
    this.down.delete(code);
    this.check(now);
  }
  blur() {
    this.down.clear();
    this.since = null;
    this.fired = false;
  }
  check(now) {
    const both = this.down.has('ShiftLeft') && this.down.has('ShiftRight');
    if (both && this.since == null) {
      this.since = now;
      this.fired = false;
    } else if (!both) {
      this.since = null;
      this.fired = false;
    }
  }
  /** 0..1 progress for a subtle hint ring. */
  progress(now) {
    return this.since == null ? 0 : Math.min(1, (now - this.since) / this.hold);
  }
  update(now) {
    if (this.since != null && !this.fired && now - this.since >= this.hold) {
      this.fired = true;
      return true;
    }
    return false;
  }
}

/** Every key event outside the parent menu is swallowed. */
export function shouldSwallow(event, parentMenuOpen) {
  if (!parentMenuOpen) return true;
  // Inside the menu let the parent use Tab / Enter / Space / arrows on the controls.
  return false;
}
