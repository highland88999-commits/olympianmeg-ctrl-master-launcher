/*
 * TRUMAN — procedural texture sprites.
 *
 * Pure canvas code, no imports, no network, no external assets.
 * makeTrumanTextures() builds every sprite ONCE (hooked into
 * createRenderer lazily, same pattern as adSprites) — nothing is
 * allocated in the frame loop. All textures are NEUTRAL (grays +
 * structure); the renderer's storm/day mood tints are applied on top
 * at draw time, so the existing color overlays keep working.
 *
 * Returns null when a 2D context is unavailable — the renderer then
 * falls back to flat colors silently.
 */

function cv2d(w, h) {
  if (typeof document === 'undefined') return null;
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const c = cv.getContext('2d');
  if (!c) return null;
  return { cv, c };
}

function speckle(c, w, h, n, light, dark) {
  for (let i = 0; i < n; i++) {
    c.fillStyle = Math.random() < 0.5 ? light : dark;
    c.fillRect(Math.random() * w, Math.random() * h, 1.5, 1.5);
  }
}

/* Seeded rand so window patterns are stable across sessions. */
function seededRand(seed) {
  let s = seed >>> 0;
  return function () {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/*
 * Building facade: neutral concrete + panel seams + window grid with a
 * mix of lit (warm, not cyan/red) and unlit windows.
 */
function facadeTile(w, h, floors, cols, litRatio, seed) {
  const r = cv2d(w, h);
  if (!r) return null;
  const { cv, c } = r;
  // concrete base
  c.fillStyle = '#3a3d42'; c.fillRect(0, 0, w, h);
  const g = c.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, 'rgba(255,255,255,0.10)');
  g.addColorStop(1, 'rgba(0,0,0,0.30)');
  c.fillStyle = g; c.fillRect(0, 0, w, h);
  // vertical panel seams
  c.strokeStyle = 'rgba(0,0,0,0.35)'; c.lineWidth = 1;
  for (let x = 0; x <= w; x += w / 4) {
    c.beginPath(); c.moveTo(x + 0.5, 0); c.lineTo(x + 0.5, h); c.stroke();
  }
  speckle(c, w, h, 260, 'rgba(255,255,255,0.05)', 'rgba(0,0,0,0.12)');
  // window grid
  const rnd = seededRand(seed);
  const mx = 8, my = 10;
  const cw = (w - mx * 2) / cols, ch = (h - my * 2) / floors;
  for (let f = 0; f < floors; f++) {
    for (let col = 0; col < cols; col++) {
      const x = mx + col * cw + cw * 0.18;
      const y = my + f * ch + ch * 0.24;
      const ww = cw * 0.64, hh = ch * 0.52;
      const lit = rnd() < litRatio;
      c.fillStyle = lit ? '#ffe6a8' : '#0a0b0d';
      c.fillRect(x, y, ww, hh);
      if (lit) {
        c.fillStyle = 'rgba(255,255,255,0.38)';
        c.fillRect(x, y, ww, hh * 0.30);
      } else {
        c.fillStyle = 'rgba(130,150,170,0.13)';
        c.fillRect(x, y, ww, hh * 0.26);
      }
      c.strokeStyle = 'rgba(0,0,0,0.55)'; c.lineWidth = 1;
      c.strokeRect(x + 0.5, y + 0.5, ww, hh);
    }
  }
  return cv;
}

/* Rooftop: concrete + parapet edge trim + vents/AC units. */
function roofTile() {
  const W = 128, H = 128;
  const r = cv2d(W, H);
  if (!r) return null;
  const { cv, c } = r;
  const rnd = seededRand(9001);
  c.fillStyle = '#2c2e33'; c.fillRect(0, 0, W, H);
  speckle(c, W, H, 200, 'rgba(255,255,255,0.05)', 'rgba(0,0,0,0.15)');
  // faint slab seams
  c.strokeStyle = 'rgba(0,0,0,0.28)'; c.lineWidth = 1;
  for (let x = 32; x < W; x += 32) {
    c.beginPath(); c.moveTo(x + 0.5, 0); c.lineTo(x + 0.5, H); c.stroke();
  }
  for (let y = 32; y < H; y += 32) {
    c.beginPath(); c.moveTo(0, y + 0.5); c.lineTo(W, y + 0.5); c.stroke();
  }
  // parapet edge trim
  c.strokeStyle = '#4a4e55'; c.lineWidth = 7;
  c.strokeRect(3, 3, W - 6, H - 6);
  c.strokeStyle = 'rgba(0,0,0,0.5)'; c.lineWidth = 1;
  c.strokeRect(7, 7, W - 14, H - 14);
  // vents + AC units
  for (let i = 0; i < 4; i++) {
    const x = 18 + rnd() * (W - 46), y = 18 + rnd() * (H - 46);
    const s = 10 + rnd() * 12;
    c.fillStyle = '#1b1c1f'; c.fillRect(x, y, s, s);
    c.fillStyle = 'rgba(255,255,255,0.10)'; c.fillRect(x, y, s, 2);
    c.strokeStyle = 'rgba(0,0,0,0.6)'; c.lineWidth = 1;
    c.strokeRect(x + 0.5, y + 0.5, s, s);
  }
  // one exhaust pipe
  const px = 30 + rnd() * (W - 60), py = 30 + rnd() * (H - 60);
  c.fillStyle = '#222428';
  c.beginPath(); c.arc(px, py, 7, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#0e0f11';
  c.beginPath(); c.arc(px, py, 4, 0, Math.PI * 2); c.fill();
  return cv;
}

/*
 * Road tile: asphalt + noise + lane dashes. Dashes run vertically on
 * the NS variant and horizontally on the EW variant so each road block
 * reads with a travel direction (chosen by block parity).
 */
function roadTile(horizontal) {
  const W = 256, H = 256;
  const r = cv2d(W, H);
  if (!r) return null;
  const { cv, c } = r;
  c.fillStyle = '#1d1e21'; c.fillRect(0, 0, W, H);
  speckle(c, W, H, 700, 'rgba(255,255,255,0.045)', 'rgba(0,0,0,0.16)');
  // faint tire-wear bands
  c.fillStyle = 'rgba(0,0,0,0.18)';
  if (horizontal) { c.fillRect(0, 96, W, 22); c.fillRect(0, 138, W, 22); }
  else { c.fillRect(96, 0, 22, H); c.fillRect(138, 0, 22, H); }
  // center lane dashes
  c.fillStyle = 'rgba(225,225,225,0.72)';
  for (let i = 0; i < 5; i++) {
    const p = 14 + i * 52;
    if (horizontal) c.fillRect(p, 125, 30, 6);
    else c.fillRect(125, p, 6, 30);
  }
  // edge lines
  c.fillStyle = 'rgba(210,210,210,0.30)';
  if (horizontal) { c.fillRect(0, 6, W, 3); c.fillRect(0, H - 9, W, 3); }
  else { c.fillRect(6, 0, 3, H); c.fillRect(W - 9, 0, 3, H); }
  return cv;
}

/*
 * Intersection/crosswalk overlay: transparent background, zebra stripes
 * + stop bar. Stamped ON TOP of the road tile on alternating road blocks.
 */
function crosswalkTile() {
  const W = 256, H = 256;
  const r = cv2d(W, H);
  if (!r) return null;
  const { cv, c } = r;
  c.clearRect(0, 0, W, H);
  // zebra bands across the north-south road
  c.fillStyle = 'rgba(230,230,230,0.60)';
  for (let i = 0; i < 7; i++) c.fillRect(18 + i * 32, 100, 17, 56);
  // stop bar
  c.fillStyle = 'rgba(230,230,230,0.55)';
  c.fillRect(60, 86, 136, 6);
  // worn patches so it doesn't look painted-on
  c.fillStyle = 'rgba(29,30,33,0.35)';
  for (let i = 0; i < 40; i++) {
    c.fillRect(18 + Math.random() * 220, 100 + Math.random() * 56, 6, 3);
  }
  return cv;
}

/* Ground tile: dark concrete with subtle noise speckle. */
function groundTile() {
  const W = 256, H = 256;
  const r = cv2d(W, H);
  if (!r) return null;
  const { cv, c } = r;
  c.fillStyle = '#0d0e12'; c.fillRect(0, 0, W, H);
  speckle(c, W, H, 420, 'rgba(255,255,255,0.035)', 'rgba(0,0,0,0.22)');
  // faint large-slab seams
  c.strokeStyle = 'rgba(0,0,0,0.35)'; c.lineWidth = 1;
  c.strokeRect(0.5, 0.5, W - 1, H - 1);
  c.beginPath(); c.moveTo(W / 2 + 0.5, 0); c.lineTo(W / 2 + 0.5, H); c.stroke();
  c.beginPath(); c.moveTo(0, H / 2 + 0.5); c.lineTo(W, H / 2 + 0.5); c.stroke();
  return cv;
}

/* Sidewalk strip: lighter concrete + expansion joints. */
function sidewalkTile() {
  const W = 128, H = 128;
  const r = cv2d(W, H);
  if (!r) return null;
  const { cv, c } = r;
  c.fillStyle = '#26282c'; c.fillRect(0, 0, W, H);
  speckle(c, W, H, 160, 'rgba(255,255,255,0.05)', 'rgba(0,0,0,0.14)');
  c.strokeStyle = 'rgba(0,0,0,0.45)'; c.lineWidth = 2;
  for (let x = 0; x <= W; x += 32) {
    c.beginPath(); c.moveTo(x + 0.5, 0); c.lineTo(x + 0.5, H); c.stroke();
  }
  c.strokeStyle = 'rgba(255,255,255,0.06)'; c.lineWidth = 1;
  c.beginPath(); c.moveTo(0, 3.5); c.lineTo(W, 3.5); c.stroke();
  return cv;
}

/*
 * Traffic car sprite: dark body + neon outline (baked in the car's own
 * color) + windshield band + roof panel + rear light strip. Vertical and
 * horizontal variants; drawn stretched to the car's rect each frame.
 */
function carSprite(color, vertical) {
  const W = vertical ? 32 : 64, H = vertical ? 64 : 32;
  const r = cv2d(W, H);
  if (!r) return null;
  const { cv, c } = r;
  c.fillStyle = '#0d0d10';
  c.fillRect(2, 2, W - 4, H - 4);
  // neon outline
  c.strokeStyle = color; c.lineWidth = 3;
  c.strokeRect(2.5, 2.5, W - 5, H - 5);
  c.strokeStyle = 'rgba(255,255,255,0.35)'; c.lineWidth = 1;
  c.strokeRect(5.5, 5.5, W - 11, H - 11);
  // windshield band near the front
  c.fillStyle = 'rgba(170,205,225,0.55)';
  if (vertical) c.fillRect(7, 9, W - 14, 7);
  else c.fillRect(9, 7, 7, H - 14);
  // roof panel
  c.fillStyle = '#18181c';
  if (vertical) c.fillRect(7, 22, W - 14, H - 44);
  else c.fillRect(22, 7, W - 44, H - 14);
  c.fillStyle = 'rgba(255,255,255,0.08)';
  if (vertical) c.fillRect(7, 22, W - 14, 3);
  else c.fillRect(22, 7, 3, H - 14);
  // rear light strip
  c.fillStyle = color;
  if (vertical) c.fillRect(7, H - 9, W - 14, 3);
  else c.fillRect(W - 9, 7, 3, H - 14);
  return cv;
}

/**
 * Build the full sprite set. Returns null if canvas 2D is unavailable —
 * callers must fall back to flat colors in that case.
 */
export function makeTrumanTextures() {
  const t = {};
  t.facades = {
    low:   facadeTile(128, 128, 3, 4, 0.28, 11),
    mid:   facadeTile(128, 256, 7, 5, 0.34, 22),
    tall:  facadeTile(128, 256, 10, 6, 0.30, 33),
    tower: facadeTile(128, 256, 14, 7, 0.38, 44),
  };
  t.roof = roofTile();
  t.roadNS = roadTile(false);
  t.roadEW = roadTile(true);
  t.crosswalk = crosswalkTile();
  t.ground = groundTile();
  t.sidewalk = sidewalkTile();
  t.cars = {
    cyanV: carSprite('#00f2ff', true),
    cyanH: carSprite('#00f2ff', false),
    magV:  carSprite('#ff00ff', true),
    magH:  carSprite('#ff00ff', false),
  };
  // Bail entirely if any sprite failed — renderer falls back to flat colors.
  const all = [t.facades.low, t.facades.mid, t.facades.tall, t.facades.tower,
    t.roof, t.roadNS, t.roadEW, t.crosswalk, t.ground, t.sidewalk,
    t.cars.cyanV, t.cars.cyanH, t.cars.magV, t.cars.magH];
  if (all.some((s) => !s)) return null;
  return t;
}

/*
 * Pick a facade canvas for a building. Height class drives the texture;
 * a stable hash of the building's block coords adds variety between
 * same-class neighbors. Deterministic per building.
 */
export function pickFacade(textures, b) {
  const cls = b.h < 70 ? 'low' : b.h < 100 ? 'mid' : b.h < 130 ? 'tall' : 'tower';
  const keys = ['low', 'mid', 'tall', 'tower'];
  const v = (((b.bx * 7 + b.bz * 13) % 4) + 4) % 4;
  const key = v % 2 === 0 ? cls : keys[(keys.indexOf(cls) + 1) % 4];
  return textures.facades[key];
}
