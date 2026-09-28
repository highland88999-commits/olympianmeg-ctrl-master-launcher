// app/waste-extraction/feeds.js
// Procedural "signal feed" definitions for the /waste-extraction holoframe.
// Everything is generated locally on a canvas — zero network.
// CommonJS so Node headless tests can require() it.

'use strict';

const FEEDS = [
  {
    id: 'drift',
    name: 'DEEP FIELD',
    desc: 'Slow-drifting starfield with periodic signal streaks.',
    hue: 190,
    renderer: 'drift',
  },
  {
    id: 'plasma',
    name: 'PLASMA CURRENT',
    desc: 'Layered interference currents, rendered as a coarse plasma grid.',
    hue: 300,
    renderer: 'plasma',
  },
  {
    id: 'scope',
    name: 'SIGNAL SCOPE',
    desc: 'Oscilloscope trace of a composite waveform over a calibration grid.',
    hue: 140,
    renderer: 'scope',
  },
  {
    id: 'spore',
    name: 'SPORE BLOOM',
    desc: 'Buoyant luminescent particles rising through the frame.',
    hue: 45,
    renderer: 'spore',
  },
];

function getFeed(id) {
  return FEEDS.find((f) => f.id === id) || null;
}

// Deterministic PRNG (mulberry32) so a seed reproduces the same field.
function makeRng(seed) {
  let a = (Number(seed) >>> 0) || 1;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hex(h) {
  return '#' + h.toString(16).padStart(6, '0');
}

// feedParams(feedId, seed) -> validated render parameters for one feed.
function feedParams(feedId, seed) {
  const feed = getFeed(feedId);
  if (!feed) return null;
  const rng = makeRng(seed);
  const pick = (min, max) => min + rng() * (max - min);
  switch (feed.renderer) {
    case 'drift':
      return {
        stars: Math.floor(pick(140, 260)),
        streakEveryMs: Math.floor(pick(2500, 6000)),
        driftSpeed: pick(0.08, 0.3),
        color: hex(Math.floor(pick(0x88ccff, 0xccffff))),
      };
    case 'plasma':
      return {
        cols: Math.floor(pick(48, 72)),
        rows: Math.floor(pick(28, 40)),
        speed: pick(0.4, 1.1),
        scale: pick(0.012, 0.03),
        hueBase: Math.floor(pick(180, 320)),
      };
    case 'scope':
      return {
        waves: Math.floor(pick(2, 4)),
        amplitude: pick(0.22, 0.38),
        speed: pick(1.2, 2.4),
        traceColor: hex(Math.floor(pick(0x39ff14, 0x9dff57))),
      };
    case 'spore':
      return {
        count: Math.floor(pick(60, 120)),
        riseSpeed: pick(0.2, 0.7),
        sway: pick(0.4, 1.2),
        glow: pick(8, 18),
      };
    default:
      return null;
  }
}

module.exports = { FEEDS, getFeed, makeRng, feedParams };
