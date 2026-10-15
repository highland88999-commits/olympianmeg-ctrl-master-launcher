// Test-harness boot for the kombat-player-specials suite: browser-
// global stubs + a virtual clock + a seeded RNG, then the REAL duel
// engine (app/kombat/engine.js) driven ONLY through its public API —
// press() / setMove() / setBlock(), the exact calls the page layer
// makes from the controller pads — and observed ONLY through its
// public hooks (onHud / onSpecialUsed / onSpecialDenied / onCombo).
// No debug ports, no reaching into engine internals: if a behavior
// can't be seen here, a player can't see it either.
let vnow = 0;
let rafCb = null;

const anyFn = function () { return anyProxy; };
const anyProxy = new Proxy(anyFn, {
  get: (t, p) => {
    if (p === Symbol.toPrimitive) return () => 0;
    if (p === 'length') return 0;
    return anyProxy;
  },
  apply: () => anyProxy,
  set: () => true,
});

function fakeCanvas() {
  return {
    width: 300, height: 150, style: {},
    getContext: () => anyProxy,
    toDataURL: () => '',
    addEventListener() {}, removeEventListener() {},
  };
}

globalThis.window = {
  addEventListener() {}, removeEventListener() {},
  devicePixelRatio: 1,
  AudioContext: undefined, webkitAudioContext: undefined,
};
globalThis.document = { createElement: () => fakeCanvas(), body: anyProxy };
globalThis.performance = { now: () => vnow };
globalThis.requestAnimationFrame = (cb) => { rafCb = cb; return 1; };
globalThis.cancelAnimationFrame = () => { rafCb = null; };
globalThis.fetch = () => Promise.reject(new Error('test harness: offline (GLB stays procedural)'));

// deterministic RNG (mulberry32) — the engine's AI reads Math.random,
// so a seed makes a whole match reproducible.
let seed = 1234567;
export function reseed(s) { seed = s >>> 0; }
Math.random = () => {
  seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

export const DT = 1 / 60;
export function step(frames = 1) {
  for (let i = 0; i < frames; i++) {
    vnow += DT * 1000;
    const cb = rafCb; rafCb = null;
    if (cb) cb();
  }
}
export function now() { return vnow / 1000; }

export async function makeMatch(playerId, cpuId, difficulty = 'easy') {
  const { createKombatEngine } = await import('../../app/kombat/engine.js');
  const canvas = {
    clientWidth: 390, clientHeight: 844,
    parentElement: { clientWidth: 390, clientHeight: 844 },
    getContext: () => anyProxy, style: {},
    addEventListener() {}, removeEventListener() {},
  };
  const hooksLog = [];
  let lastHud = null;
  const hooks = {
    onHud: (p) => { lastHud = p; hooksLog.push({ t: now(), ev: 'hud', hud: p }); },
    onSpecialUsed: (who, idx) => hooksLog.push({ t: now(), ev: 'specialUsed', who, idx }),
    onSpecialDenied: (idx, reason) => hooksLog.push({ t: now(), ev: 'specialDenied', idx, reason }),
    onCombo: (who, n) => hooksLog.push({ t: now(), ev: 'combo', who, n }),
    onAnnounce: (a, b) => hooksLog.push({ t: now(), ev: 'announce', a, b }),
  };
  const engine = createKombatEngine(canvas, {
    playerId, cpuId, difficulty, arena: 0, hooks,
  });
  engine.start();
  // Browser fidelity: on a real device the microtask queue drains
  // between animation frames, so promise-driven engine state (the
  // round-1 GLB summoning gate — the offline fetch stub rejects,
  // the gate lifts, the match begins) settles before the next
  // pumped frame. This harness pumps frames synchronously, so yield
  // one macrotask here to model the browser exactly. Without the
  // yield the gate could never lift inside step()'s sync loop — a
  // harness artifact, not engine behavior.
  await new Promise((r) => setTimeout(r, 0));
  return { engine, hooksLog, hud: () => lastHud };
}

export function waitFight(m, maxFrames = 400) {
  let n = 0;
  while (m.engine.phase !== 'fight' && n < maxFrames) { step(1); n++; }
  return m.engine.phase === 'fight';
}

/** Walk the player into point-blank contact and keep them there. */
export function walkIn(m, frames = 115) {
  m.engine.setMove(1);
  step(frames);
  m.engine.setMove(0.25); // keep leaning in; separation clamps at 0.9
}

export function events(m, ev, who = 0) {
  return m.hooksLog.filter((e) => e.ev === ev && (who === null || e.who === who));
}

/** Re-close to point blank after a lull (the foe may have drifted). */
export function reclose(m, frames = 15) {
  m.engine.setMove(1);
  step(frames);
  m.engine.setMove(0.25);
}

/**
 * Wait for a neutral lull — ~0.6s with no health change on either
 * side — before pressing. A real player fires from neutral, not into
 * the middle of the opponent's active combo; pressing into a live
 * barrage tests the opponent's offense, not the player's input path.
 */
export function waitLull(m, maxFrames = 900) {
  let quiet = 0;
  let last = null;
  for (let i = 0; i < maxFrames; i++) {
    const h = m.hud();
    const key = h ? `${h.p1}|${h.p2}` : '';
    if (key === last) quiet++;
    else { quiet = 0; last = key; }
    if (quiet >= 35) return true;
    step(1);
  }
  return false;
}
