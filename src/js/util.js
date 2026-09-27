// Small shared helpers. Pure, no DOM.

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (t) => {
  t = clamp(t, 0, 1);
  return t * t * (3 - 2 * t);
};
export const easeOutBack = (t) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};
export const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

/** Frame-rate independent exponential approach: move `cur` toward `target` with time constant `tau` seconds. */
export const approach = (cur, target, tau, dt) => {
  if (tau <= 0) return target;
  return target + (cur - target) * Math.exp(-dt / tau);
};

/** Deterministic PRNG (mulberry32). */
export function makeRng(seed = 1) {
  let a = seed >>> 0;
  return function rng() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const pick = (arr, rng = Math.random) => arr[Math.floor(rng() * arr.length) % arr.length];

/**
 * Photosensitivity guard. Anything that blinks (siren lights, sparkles, twinkling stars)
 * goes through this so no light alternates faster than MAX_FLASH_HZ.
 */
export const MAX_FLASH_HZ = 2; // WCAG 2.3.1 limit is 3 flashes per second; we stay well under it.
export function flashPhase(t, hz) {
  const f = Math.min(hz, MAX_FLASH_HZ);
  return Math.floor(t * f * 2) % 2; // 0/1 toggles at 2*f per second, i.e. f full cycles per second
}
