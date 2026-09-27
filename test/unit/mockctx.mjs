// A recording stand-in for CanvasRenderingContext2D, so drawing code can run under node.
export function mockCtx() {
  const calls = [];
  const gradient = { addColorStop() {} };
  const state = { fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, globalAlpha: 1, font: '', textAlign: '', textBaseline: '', lineCap: '', lineJoin: '' };
  const ctx = new Proxy(state, {
    get(target, prop) {
      if (prop in target) return target[prop];
      if (prop === 'createLinearGradient' || prop === 'createRadialGradient') return () => gradient;
      if (prop === 'calls') return calls;
      return (...args) => {
        for (const a of args) if (typeof a === 'number' && !Number.isFinite(a)) throw new Error(`${String(prop)} got ${a}`);
        calls.push(prop);
      };
    },
    set(target, prop, v) {
      target[prop] = v;
      return true;
    },
  });
  return ctx;
}
