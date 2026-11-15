// lib/luge/cgi.js
// Procedural CGI for Luge — the same "CGI method" as the Earth 4 v2 pass:
// seeded PRNG + procedural CanvasTexture colour/bump/roughness, procedural
// geometry, alive motion. NO Tripo (balance is 10), NO paid assets, and
// Unreal Engine cannot run in a phone browser — nothing here pretends
// otherwise. Everything is drawn at runtime from a seed, so there are no
// new asset files to ship.
//
// Texture builders need `document` (canvas) and return null headlessly —
// the page falls back to its existing hull/track textures when they do.
// The motion helpers (riderBreath, sledVibration, shardSway) are pure
// and headless-testable.
import * as THREE from 'three';
import { seededRandom } from './track.js';

function makeCanvas(w, h) {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function toTexture(canvas, repeatX, repeatY) {
  if (!canvas) return null;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  if (repeatX) tex.repeat.set(repeatX, repeatY || 1);
  return tex;
}

/**
 * Procedural ice for the track surface: dark blue-black ice with seeded
 * speckles, pale groove lines along the run direction and cyan veins.
 * Laid as a translucent overlay tube just inside the course texture, so
 * the course art stays and the ice grain + veins read on top of it.
 */
export function makeIceTrackTexture(seed) {
  const canvas = makeCanvas(512, 512);
  if (!canvas) return null;
  const g = canvas.getContext('2d');
  const rand = seededRandom(seed * 7919 + 5);
  g.fillStyle = '#06121f';
  g.fillRect(0, 0, 512, 512);
  // Speckled frost.
  for (let i = 0; i < 2600; i++) {
    const v = 18 + Math.floor(rand() * 40);
    g.fillStyle = `rgba(${v}, ${v + 30}, ${v + 60}, ${0.25 + rand() * 0.4})`;
    g.fillRect(rand() * 512, rand() * 512, 1 + rand() * 2, 1 + rand() * 2);
  }
  // Grooves along the run direction (canvas y = along-track).
  for (let i = 0; i < 26; i++) {
    const x = rand() * 512;
    g.strokeStyle = `rgba(140, 220, 255, ${0.05 + rand() * 0.12})`;
    g.lineWidth = 1 + rand() * 2;
    g.beginPath();
    g.moveTo(x, 0);
    g.bezierCurveTo(x + (rand() - 0.5) * 30, 170, x + (rand() - 0.5) * 30, 340, x, 512);
    g.stroke();
  }
  // Cyan veins: seeded random walks.
  for (let i = 0; i < 9; i++) {
    let x = rand() * 512;
    let y = rand() * 512;
    g.strokeStyle = `rgba(0, 242, 255, ${0.25 + rand() * 0.35})`;
    g.lineWidth = 1 + rand() * 1.5;
    g.beginPath();
    g.moveTo(x, y);
    for (let s = 0; s < 14; s++) {
      x += (rand() - 0.5) * 60;
      y += (rand() - 0.5) * 60;
      g.lineTo(x, y);
    }
    g.stroke();
  }
  return toTexture(canvas, 6, 2);
}

/**
 * Graphic wrap for one obstacle type (256², drawn art — never a flat
 * colour): hazard chevrons on the barrel, a painted rune face + cracks
 * on the boulder, snow-dusted pine needles on the branches.
 */
export function makeObstacleTexture(type, seed) {
  const canvas = makeCanvas(256, 256);
  if (!canvas) return null;
  const g = canvas.getContext('2d');
  const rand = seededRandom(seed * 104729 + (type === 'barrel' ? 11 : type === 'boulder' ? 23 : 37));

  if (type === 'barrel') {
    g.fillStyle = '#1a1206';
    g.fillRect(0, 0, 256, 256);
    // Amber/black hazard chevrons.
    for (let i = -4; i < 10; i++) {
      g.fillStyle = i % 2 === 0 ? '#ffb300' : '#111111';
      g.beginPath();
      g.moveTo(i * 48, 256);
      g.lineTo(i * 48 + 48, 0);
      g.lineTo(i * 48 + 96, 0);
      g.lineTo(i * 48 + 48, 256);
      g.fill();
    }
    // Rivet bands top and bottom.
    g.fillStyle = '#3a2c10';
    g.fillRect(0, 0, 256, 18);
    g.fillRect(0, 238, 256, 18);
    g.fillStyle = '#ffd54f';
    for (let x = 8; x < 256; x += 32) {
      g.beginPath(); g.arc(x, 9, 4, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.arc(x, 247, 4, 0, Math.PI * 2); g.fill();
    }
  } else if (type === 'boulder') {
    g.fillStyle = '#7fa8c9';
    g.fillRect(0, 0, 256, 256);
    // Ice shading: pale facets.
    for (let i = 0; i < 26; i++) {
      g.fillStyle = `rgba(${200 + rand() * 55}, ${220 + rand() * 35}, 255, ${0.08 + rand() * 0.16})`;
      const x = rand() * 256;
      const y = rand() * 256;
      const r = 12 + rand() * 46;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + r, y + (rand() - 0.5) * 30);
      g.lineTo(x + (rand() - 0.5) * 30, y + r);
      g.closePath();
      g.fill();
    }
    // Painted cyan rune face: a ring + rune strokes, glowing centre.
    g.strokeStyle = '#00f2ff';
    g.lineWidth = 5;
    g.beginPath(); g.arc(128, 128, 62, 0, Math.PI * 2); g.stroke();
    g.lineWidth = 7;
    g.beginPath();
    g.moveTo(128, 82); g.lineTo(128, 174);
    g.moveTo(128, 100); g.lineTo(162, 128); g.lineTo(128, 156);
    g.moveTo(128, 100); g.lineTo(94, 128); g.lineTo(128, 156);
    g.stroke();
    g.fillStyle = 'rgba(0, 242, 255, 0.9)';
    g.beginPath(); g.arc(128, 128, 10, 0, Math.PI * 2); g.fill();
    // Cracks.
    g.strokeStyle = 'rgba(10, 30, 50, 0.7)';
    g.lineWidth = 2;
    for (let i = 0; i < 7; i++) {
      let x = rand() * 256;
      let y = rand() * 256;
      g.beginPath(); g.moveTo(x, y);
      for (let s = 0; s < 5; s++) { x += (rand() - 0.5) * 50; y += (rand() - 0.5) * 50; g.lineTo(x, y); }
      g.stroke();
    }
  } else {
    // branches: pine-needle barrier, snow-dusted.
    g.fillStyle = '#0d2b12';
    g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 420; i++) {
      const x = rand() * 256;
      const y = rand() * 256;
      const a = rand() * Math.PI;
      const len = 10 + rand() * 22;
      g.strokeStyle = `rgba(${20 + rand() * 40}, ${110 + rand() * 90}, ${30 + rand() * 40}, 0.9)`;
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
      g.stroke();
    }
    // Snow dust on the needles.
    for (let i = 0; i < 160; i++) {
      g.fillStyle = `rgba(255, 255, 255, ${0.3 + rand() * 0.5})`;
      g.beginPath(); g.arc(rand() * 256, rand() * 256, 1 + rand() * 3, 0, Math.PI * 2); g.fill();
    }
  }
  return toTexture(canvas, 2, 1);
}

/** Soft round sprite for snow-spray particles. */
export function makeSnowSpriteTexture() {
  const canvas = makeCanvas(64, 64);
  if (!canvas) return null;
  const g = canvas.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.55, 'rgba(220,240,255,0.45)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(canvas);
}

/** Dark carbon weave for the sled runner blades. */
export function makeCarbonTexture(seed) {
  const canvas = makeCanvas(128, 128);
  if (!canvas) return null;
  const g = canvas.getContext('2d');
  const rand = seededRandom(seed * 31 + 3);
  g.fillStyle = '#0b0b0e';
  g.fillRect(0, 0, 128, 128);
  for (let y = 0; y < 128; y += 8) {
    for (let x = 0; x < 128; x += 8) {
      const v = 14 + Math.floor(rand() * 26);
      g.fillStyle = `rgb(${v}, ${v}, ${v + 6})`;
      g.fillRect(x, y, 7, 7);
    }
  }
  return toTexture(canvas, 3, 1);
}

// --- Alive motion: pure helpers -------------------------------------------

/** Rider breathing: slow chest scale, ~4 s cycle, ±1.2%. */
export function riderBreath(t) {
  return 1 + 0.012 * Math.sin(t * (Math.PI * 2) / 4);
}

/**
 * Sled vibration: tiny vertical jitter that grows with speed, so the
 * sled feels alive instead of glued to the spline. Returns metres.
 */
export function sledVibration(t, speed) {
  const amp = 0.012 + Math.min(0.05, (speed || 0) * 0.00012);
  return amp * Math.sin(t * 47) + amp * 0.5 * Math.sin(t * 31 + 1.3);
}

/** Trackside shard sway: gentle radial bob for a seeded shard. */
export function shardSway(t, seed) {
  return 0.35 * Math.sin(t * 0.7 + seed * 1.7);
}
