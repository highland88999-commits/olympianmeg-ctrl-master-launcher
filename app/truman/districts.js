/*
 * TRUMAN — open-world district rendering (open-world expansion).
 *
 * Draws the seeded districts built by world.js (harbor, market plaza,
 * observatory, park, POIs) in the module's existing 2.5D prism language.
 *
 * Performance contract (iPhone canvas crash — keep it sane):
 *  - all geometry is precomputed ONCE by the builders and cached via
 *    getDistricts(); per frame this module only projects and fills.
 *  - no per-frame gradients; water/pond motion comes from cheap sine
 *    shimmer line strokes (static + dimmer in calm mode).
 *  - a small pool of scratch points is reused — zero allocation in the
 *    prism/quad hot paths (project() is only used for culling anchors,
 *    labels and a few accents).
 *  - each district is culled by projecting its center; POIs cull by
 *    camera distance. Total new primitives per frame: well under ~400.
 */

import { project } from './render.js';
import {
  buildHarbor, buildMarket, buildObservatory, buildPark, buildPOIs,
} from './world.js';

/* Lazy singleton — built once, reused every frame. */
let districtCache = null;
export function getDistricts() {
  if (!districtCache) {
    districtCache = {
      harbor: buildHarbor(),
      market: buildMarket(),
      observatory: buildObservatory(),
      park: buildPark(),
      pois: buildPOIs(),
    };
  }
  return districtCache;
}

/* ---- scratch points: reused every frame, zero allocation in hot paths ---- */
const SP = [];
for (let i = 0; i < 10; i++) SP.push({ x: 0, y: 0 });
function P(i, x, y, z, cam) {
  const dx = x - cam.x, dz = z - cam.z;
  const c = Math.cos(cam.yaw), s = Math.sin(cam.yaw);
  const rx = dx * c - dz * s, rz = dx * s + dz * c;
  const p = SP[i];
  p.x = cam.cx + rx * 0.866 * cam.zoom;
  p.y = cam.cy + rz * 0.5 * cam.zoom - y * cam.zoom;
  return p;
}

function hexA(hex, a) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${a})`;
}

function poly(ctx, a, b, c, d, fill, edge) {
  ctx.beginPath();
  ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.lineTo(d.x, d.y);
  ctx.closePath();
  ctx.fillStyle = fill; ctx.fill();
  if (edge) { ctx.strokeStyle = edge; ctx.lineWidth = 1; ctx.stroke(); }
}

/* Same face convention as render.js drawPrism: left / right / roof. */
function prism(ctx, x, y, z, w, h, dep, cam, top, left, right, edge) {
  const p000 = P(0, x - w / 2, y, z - dep / 2, cam);
  const p100 = P(1, x + w / 2, y, z - dep / 2, cam);
  const p110 = P(2, x + w / 2, y, z + dep / 2, cam);
  const p010 = P(3, x - w / 2, y, z + dep / 2, cam);
  const p001 = P(4, x - w / 2, y + h, z - dep / 2, cam);
  const p101 = P(5, x + w / 2, y + h, z - dep / 2, cam);
  const p111 = P(6, x + w / 2, y + h, z + dep / 2, cam);
  const p011 = P(7, x - w / 2, y + h, z + dep / 2, cam);
  poly(ctx, p010, p110, p111, p011, left, edge);
  poly(ctx, p110, p100, p101, p111, right, edge);
  poly(ctx, p001, p101, p111, p011, top, edge);
}

function flat(ctx, x0, z0, x1, z1, y, cam, fill, edge) {
  const a = P(0, x0, y, z0, cam), b = P(1, x1, y, z0, cam);
  const c = P(2, x1, y, z1, cam), d = P(3, x0, y, z1, cam);
  poly(ctx, a, b, c, d, fill, edge);
}

function line(ctx, x0, y0, z0, x1, y1, z1, cam) {
  const a = P(0, x0, y0, z0, cam), b = P(1, x1, y1, z1, cam);
  ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
}

/* District-level culling: skip if the projected center is far off-screen. */
function visible(cam, x, y, z, W, H, m = 420) {
  const p = project(x, y, z, cam);
  return p.x > -m && p.x < W + m && p.y > -m && p.y < H + m;
}

/* Cheap animated shimmer: drifting highlight strokes, no gradients. */
function shimmer(ctx, x0, x1, z0, z1, y, rows, cam, t, calm, storm) {
  ctx.lineWidth = 1.5;
  const span = x1 - x0;
  const wlen = span * 0.22;
  const drift = calm ? 0 : t * 26;
  const col = storm ? '255,60,90' : '120,220,255';
  for (let i = 0; i < rows; i++) {
    const z = z0 + ((i + 0.5) / rows) * (z1 - z0);
    const off = (drift + i * 137) % (span * 1.3);
    const xs = x0 + off - span * 0.15;
    const a = P(0, xs, y, z, cam), b = P(1, xs + wlen, y, z, cam);
    const alpha = calm ? 0.10 : 0.16 + 0.10 * Math.sin(t * 2 + i * 1.3);
    ctx.strokeStyle = `rgba(${col},${alpha.toFixed(3)})`;
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  }
}

/* Pre-rendered awning stripe boards (one per stall hue), reused per frame. */
const AWNING_HUES = ['#ff2d78', '#00f2ff', '#ffb300', '#aa00ff'];
let awningSprites = null;
function getAwnings() {
  if (awningSprites) return awningSprites;
  awningSprites = [];
  if (typeof document === 'undefined') return awningSprites;
  for (const hue of AWNING_HUES) {
    const cv = document.createElement('canvas');
    cv.width = 96; cv.height = 24;
    const c = cv.getContext('2d');
    if (!c) continue;
    c.fillStyle = 'rgba(0,0,0,0.85)'; c.fillRect(0, 0, 96, 24);
    for (let i = 0; i < 6; i++) {
      c.fillStyle = i % 2 ? hue : 'rgba(255,255,255,0.85)';
      c.fillRect(i * 16, 0, 16, 24);
    }
    c.fillStyle = 'rgba(0,0,0,0.35)'; c.fillRect(0, 18, 96, 6);
    awningSprites.push(cv);
  }
  return awningSprites;
}

/* ------------------------------ HARBOR ------------------------------ */
function drawHarbor(ctx, hb, cam, t, calm, storm, W, H) {
  const cx = (hb.water.x0 + hb.water.x1) / 2, cz = (hb.water.z0 + hb.water.z1) / 2;
  if (!visible(cam, cx, 0, cz, W, H)) return;
  const w = hb.water;
  flat(ctx, w.x0, w.z0, w.x1, w.z1, 0.4, cam,
    storm ? '#140709' : '#061522',
    storm ? 'rgba(255,0,68,0.4)' : 'rgba(0,242,255,0.25)');
  shimmer(ctx, w.x0, w.x1, w.z0, w.z1, 0.7, 10, cam, t, calm, storm);

  const edge = storm ? 'rgba(255,0,68,0.3)' : 'rgba(0,242,255,0.2)';
  for (const p of hb.piers) {
    prism(ctx, p.x, 0, p.z, p.w, p.h, p.d, cam,
      storm ? '#3a242c' : '#24303c', '#141a22', '#0c1016', edge);
  }
  for (const wh of hb.warehouses) {
    prism(ctx, wh.x, 0, wh.z, wh.w, wh.h, wh.d, cam,
      storm ? '#3a2229' : `hsl(${wh.hue | 0},22%,24%)`, '#141a22', '#0c1016', edge);
  }
  for (const b of hb.boats) {
    const bob = calm ? 0 : Math.sin(t * 1.6 + b.phase) * 1.4;
    prism(ctx, b.x, 0.4 + bob, b.z, b.w, b.h, b.d, cam,
      storm ? '#33141b' : `hsl(${b.hue},30%,20%)`, '#10161f', '#0a0e14', 'rgba(0,242,255,0.25)');
    prism(ctx, b.x, 0.4 + bob + b.h, b.z, b.w * 0.4, 6, b.d * 0.7, cam,
      storm ? '#5a2a33' : '#dfe9f2', storm ? '#2a1418' : '#9fb2c4', storm ? '#1c0f12' : '#7c8fa1');
    ctx.strokeStyle = 'rgba(200,220,235,0.7)'; ctx.lineWidth = 1.5;
    line(ctx, b.x, 0.4 + bob + b.h + 6, b.z, b.x, 0.4 + bob + b.h + 22, b.z, cam);
  }
  for (const c of hb.cranes) {
    const py = 4; // standing on the pier deck
    prism(ctx, c.x, py, c.z, 10, c.h, 10, cam,
      storm ? '#4a2a20' : '#8a6a2f', '#3a2c14', '#241a0c', edge);
    prism(ctx, c.x + 20, py + c.h, c.z, 54, 5, 5, cam,
      storm ? '#5a3526' : '#a8843c', '#4a3a1a', '#2e2410');
    ctx.strokeStyle = 'rgba(220,200,160,0.6)'; ctx.lineWidth = 1.5;
    line(ctx, c.x + 40, py + c.h + 2, c.z, c.x + 40, py + c.h - 18, c.z, cam);
    const hp = P(2, c.x + 40, py + c.h - 18, c.z, cam);
    const hs = 3 * cam.zoom;
    ctx.fillStyle = storm ? '#ff003c' : '#ffd27f';
    ctx.fillRect(hp.x - hs / 2, hp.y - hs / 2, hs, hs);
  }
}

/* ------------------------------ MARKET ------------------------------ */
function drawMarket(ctx, mk, cam, t, calm, storm, W, H) {
  if (!visible(cam, 150, 0, 150, W, H)) return;
  const pl = mk.plaza;
  flat(ctx, pl.x0, pl.z0, pl.x1, pl.z1, 0.6, cam,
    storm ? '#12090d' : '#0d1117',
    storm ? 'rgba(255,0,68,0.45)' : 'rgba(0,242,255,0.35)');

  const awns = getAwnings();
  for (const s of mk.stalls) {
    prism(ctx, s.x, 0.6, s.z, s.w, s.h, s.d, cam,
      storm ? '#2c1a20' : '#1d2733', '#121820', '#0b0f16',
      storm ? 'rgba(255,0,68,0.3)' : 'rgba(0,242,255,0.22)');
    // striped awning board (billboarded sprite, same pattern as hologram ads)
    if (awns.length) {
      const idx = AWNING_HUES.indexOf(s.hue);
      const ap = P(2, s.x, 0.6 + s.h + 10, s.z, cam);
      const aw = 30 * cam.zoom, ah = 8 * cam.zoom;
      ctx.drawImage(awns[idx < 0 ? 0 : idx], ap.x - aw / 2, ap.y - ah / 2, aw, ah);
    }
    // goods on the counter
    const gp = P(3, s.x, 0.6 + s.h, s.z, cam);
    const gs = 3.2 * cam.zoom;
    for (let g = 0; g < 3; g++) {
      ctx.fillStyle = s.goods[g];
      ctx.fillRect(gp.x - gs * 2 + g * gs * 2.2, gp.y - gs * 1.4, gs * 1.6, gs * 1.4);
    }
  }

  // poles, sagging wires, bulbs
  ctx.strokeStyle = storm ? 'rgba(255,0,68,0.5)' : 'rgba(255,217,160,0.55)';
  ctx.lineWidth = 1.5;
  for (const pl2 of mk.poles) line(ctx, pl2.x, 0, pl2.z, pl2.x, pl2.h, pl2.z, cam);
  for (const [a, b] of mk.spans) {
    const A = mk.poles[a], B = mk.poles[b];
    ctx.beginPath();
    for (let k = 0; k <= 12; k++) {
      const f = k / 12;
      const q = P(2, A.x + (B.x - A.x) * f, 30 - 6 * Math.sin(Math.PI * f), A.z + (B.z - A.z) * f, cam);
      if (k === 0) ctx.moveTo(q.x, q.y); else ctx.lineTo(q.x, q.y);
    }
    ctx.stroke();
  }
  for (const bl of mk.bulbs) {
    const bp = project(bl.x, bl.y, bl.z, cam);
    const tw = calm ? 1 : 0.75 + 0.25 * Math.sin(t * 3 + bl.phase);
    ctx.fillStyle = `rgba(255,217,160,${(0.85 * tw).toFixed(3)})`;
    ctx.fillRect(bp.x - 1.5, bp.y - 1.5, 3, 3);
  }
}

/* ---------------------------- OBSERVATORY ---------------------------- */
function drawObservatory(ctx, ob, cam, t, calm, storm, W, H) {
  if (!visible(cam, ob.x, 30, ob.z, W, H)) return;
  const edge = storm ? 'rgba(255,0,68,0.25)' : 'rgba(80,255,170,0.18)';
  for (const tr of ob.terraces) {
    prism(ctx, ob.x, tr.y, ob.z, tr.w, tr.h, tr.d, cam,
      storm ? '#241a1e' : '#12301f', '#0a1a10', '#060f0a', edge);
  }
  const d = ob.dome;
  prism(ctx, d.x, d.baseY, d.z, d.w, d.h, d.d, cam,
    storm ? '#4a2a33' : '#c9d6e2',
    storm ? '#2a1418' : '#8fa0b3',
    storm ? '#1c0f12' : '#6d7f92',
    storm ? 'rgba(255,0,68,0.35)' : 'rgba(0,242,255,0.3)');
  // dome cap
  const cp = project(d.x, d.baseY + d.h, d.z, cam);
  const r = (d.w / 2) * cam.zoom;
  ctx.fillStyle = storm ? '#5a2f3a' : '#e8f1fa';
  ctx.beginPath(); ctx.arc(cp.x, cp.y, r, Math.PI, 0); ctx.fill();
  // telescope slit
  ctx.fillStyle = storm ? '#1a0a0e' : '#0a1420';
  const sw = Math.max(2, 7 * cam.zoom);
  ctx.fillRect(cp.x - sw / 2 + d.slit * r * 0.5, cp.y - r, sw, r);
}

/* ------------------------------- PARK ------------------------------- */
function drawPark(ctx, pk, cam, t, calm, storm, W, H) {
  if (!visible(cam, -410, 0, 450, W, H)) return;
  flat(ctx, -560, 300, -260, 600, 0.5, cam,
    storm ? '#120d0c' : '#0a1410',
    storm ? 'rgba(255,0,68,0.3)' : 'rgba(80,255,170,0.25)');
  for (const pth of pk.paths) {
    flat(ctx, pth.x0, pth.z0, pth.x1, pth.z1, 0.8, cam, storm ? '#1c1210' : '#1a1712');
  }
  const pd = pk.pond;
  flat(ctx, pd.x - pd.w / 2, pd.z - pd.d / 2, pd.x + pd.w / 2, pd.z + pd.d / 2, 0.9, cam,
    storm ? '#17080c' : '#0a1c2e',
    storm ? 'rgba(255,0,68,0.4)' : 'rgba(0,242,255,0.3)');
  shimmer(ctx, pd.x - pd.w / 2, pd.x + pd.w / 2, pd.z - pd.d / 2, pd.z + pd.d / 2, 1.1, 3, cam, t, calm, storm);
  // trees — same glyph language as the city forest
  for (const tr of pk.trees) {
    const sway = storm ? Math.sin(t * 5 + tr.x * 0.05) * 0.15 : Math.sin(t + tr.x * 0.05) * 0.02;
    const p = project(tr.x, 0, tr.z, cam);
    const s = cam.zoom * tr.s * 22;
    ctx.fillStyle = storm ? '#33101a' : '#0a2a18';
    ctx.beginPath();
    ctx.moveTo(p.x - s * 0.5 + sway * s, p.y);
    ctx.lineTo(p.x + s * 0.5 + sway * s, p.y);
    ctx.lineTo(p.x + sway * s * 1.5, p.y - s);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#1a100a';
    ctx.fillRect(p.x - s * 0.06, p.y - s * 0.25, s * 0.12, s * 0.25);
  }
  for (const b of pk.benches) {
    prism(ctx, b.x, 0.8, b.z, b.w, 3, b.d, cam, '#3a2c1c', '#241a10', '#171008');
  }
}

/* -------------------------------- POIs ------------------------------- */
const POI_STYLE = {
  restaurant:  { color: '#ffb300' },
  bar:         { color: '#ff00ff' },
  spire:       { color: '#00f2ff' },
  garden:      { color: '#33ff99' },
  gate:        { color: '#ff6600' },
  observatory: { color: '#c9a7ff' },
  harbor:      { color: '#35c8ff' },
  park:        { color: '#7dff9a' },
};

function drawPOIs(ctx, pois, cam, t, calm, storm, W, H) {
  for (const poi of pois) {
    const dx = poi.x - cam.x, dz = poi.z - cam.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist > 900) continue; // structure cull
    const st = POI_STYLE[poi.kind] || POI_STYLE.park;
    const y0 = poi.y || 0;
    const edge = hexA(st.color, 0.5);

    if (poi.kind === 'gate') {
      prism(ctx, poi.x - 13, y0, poi.z, 4, 26, 4, cam, st.color, '#3a2410', '#241608');
      prism(ctx, poi.x + 13, y0, poi.z, 4, 26, 4, cam, st.color, '#3a2410', '#241608');
      prism(ctx, poi.x, y0 + 26, poi.z, 34, 4, 6, cam, st.color, '#3a2410', '#241608');
    } else if (poi.kind === 'spire') {
      prism(ctx, poi.x, y0, poi.z, 7, 80, 7, cam, st.color, '#0a2a33', '#061820', edge);
    } else if (poi.kind === 'restaurant' || poi.kind === 'bar') {
      prism(ctx, poi.x, y0, poi.z, 34, 26, 26, cam,
        storm ? '#2c1c22' : '#232a36', '#141821', '#0c0f15', edge);
    } else if (poi.kind === 'garden') {
      prism(ctx, poi.x, y0, poi.z, 6, 18, 6, cam, st.color, '#0e2a1c', '#08160f', edge);
    } else {
      // beacon obelisk (harbor bobs on the water)
      const bob = poi.kind === 'harbor' && !calm ? Math.sin(t * 1.6 + poi.phase) * 1.5 : 0;
      prism(ctx, poi.x, y0 + bob, poi.z, 6, 16, 6, cam, st.color, '#101418', '#0a0d11', edge);
    }

    // beacon diamond above the structure
    const tipY = y0 + (poi.kind === 'spire' ? 88 : poi.kind === 'gate' ? 36
      : poi.kind === 'restaurant' || poi.kind === 'bar' ? 32 : 22);
    const tp = project(poi.x, tipY, poi.z, cam);
    ctx.save();
    if (!calm) { ctx.shadowColor = st.color; ctx.shadowBlur = 10; }
    ctx.fillStyle = st.color;
    const ds = 4;
    ctx.beginPath();
    ctx.moveTo(tp.x, tp.y - ds); ctx.lineTo(tp.x + ds, tp.y);
    ctx.lineTo(tp.x, tp.y + ds); ctx.lineTo(tp.x - ds, tp.y);
    ctx.closePath(); ctx.fill();
    ctx.restore();

    // name label — fades in within ~350 world units, stays small and clean
    if (dist < 350) {
      const lp = project(poi.x, tipY + 16, poi.z, cam);
      ctx.save();
      ctx.globalAlpha = Math.min(1, (1 - dist / 350) * 1.6);
      ctx.textAlign = 'center';
      ctx.font = '600 11px system-ui, sans-serif';
      ctx.fillStyle = st.color;
      ctx.fillText(poi.name, lp.x, lp.y);
      ctx.font = '9px system-ui, sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.65)';
      ctx.fillText(poi.sub, lp.x, lp.y + 13);
      ctx.restore();
    }
  }
}

/* ------------------------------ entry ------------------------------ */
export function drawDistricts(ctx, cam, D, S) {
  if (!ctx || !D || !cam) return; // null-guard canvas contexts
  const t = S ? S.t || 0 : 0;
  const calm = !!(S && S.calm);
  const storm = !!(S && S.world && S.world.isStormActive);
  const W = (S && S.W) || 0, H = (S && S.H) || 0;
  if (!W || !H) return;
  drawHarbor(ctx, D.harbor, cam, t, calm, storm, W, H);
  drawMarket(ctx, D.market, cam, t, calm, storm, W, H);
  drawObservatory(ctx, D.observatory, cam, t, calm, storm, W, H);
  drawPark(ctx, D.park, cam, t, calm, storm, W, H);
  drawPOIs(ctx, D.pois, cam, t, calm, storm, W, H);
}
