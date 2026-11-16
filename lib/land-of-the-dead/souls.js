// lib/land-of-the-dead/souls.js
// SOULS OF THE LAND OF THE DEAD (Merlin, Nov 16 ~04:02, Land of the
// Dead round, worker D).
//
// Everything killed goes here. A death record { kind, name, origin,
// diedAt } becomes a wandering soul of the Land of the Dead, and
// the field renders those souls as translucent drifting figures.
//
// WHAT EXISTS ALREADY (checked, not assumed):
// - The 24 afterlife realms render their dead as ONE translucent
//   cone each (coneGeometry [0.7, 2.4, 8], one meshStandardMaterial
//   per disc) in app/<realm>/world3d.js — see
//   lib/afterlife/humanoid-operators.js FIGURE_MATERIALS. There is
//   NO soul/drift figure art on disk (no soul GLB, no ghost mesh —
//   the only soul-adjacent files are TRON bike wraps), so this
//   field reuses the cone vocabulary and improves on it with a
//   head + glow + drift, drawn as SVG — no new asset is invented.
// - The server soul ledger (lib/economy/souls.js,
//   supabase/souls.sql) is a BALANCE ledger: it holds how many
//   souls a user owns. It has no table for *which* souls arrived
//   in the Land of the Dead, and souls.sql itself is still STAGED
//   (not run — Merlin's green light owed). So arrivals recorded
//   here are DEVICE-LOCAL (localStorage) until
//   supabase/land-of-the-dead-souls.sql runs — see that file. The
//   ledger is NOT credited per kill: no decision exists to mint a
//   balance soul for a kill, and this module never invents one.
// - seedSouls() is a SEED, not server truth: the field shows it
//   only when no server data and no recorded arrivals exist.
//
// This file is plain JS (React via createElement, no JSX syntax)
// so node:test can import it with no DOM and no transform.

import React from 'react';

// ── Death kinds ─────────────────────────────────────────────────
// The kinds the wired kill paths actually pass in. Anything else
// keeps its kind string and falls back to the creature style —
// createWanderingSoul never throws on an unknown kind.
export const DEATH_KINDS = Object.freeze(['monster', 'user', 'demogorgon', 'boss', 'creature']);

// The figure's look per kind — the cone's real colour/opacity in
// the 24 realms is the reference (humanoid-operators.js:
// pale #e8e8ee / 0.45 for the first disc, dark #2a2a33 / 0.7 for
// the damned discs, bright #fff3d0 / 0.55 for the blessed).
export const SOUL_KIND_STYLE = Object.freeze({
  monster: { label: 'Shade', color: '#e8e8ee', opacity: 0.45, garment: 'shroud' },
  user: { label: 'Fallen traveller', color: '#fff3d0', opacity: 0.55, garment: 'white cloth' },
  demogorgon: { label: 'Demogorgon shade', color: '#2a2a33', opacity: 0.7, garment: 'dark shroud' },
  boss: { label: 'Fallen boss', color: '#e8a35c', opacity: 0.6, garment: 'gilded shroud' },
  creature: { label: 'Fallen creature', color: '#dfe9f2', opacity: 0.5, garment: 'mist shroud' },
});

const FALLBACK_NAME = Object.freeze({
  monster: 'Fallen monster',
  user: 'A fallen traveller',
  demogorgon: 'Demogorgon',
  boss: 'A fallen boss',
  creature: 'A fallen creature',
});

function slug(value) {
  return String(value == null ? '' : value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'unknown';
}

function styleFor(kind) {
  return SOUL_KIND_STYLE[kind] || SOUL_KIND_STYLE.creature;
}

/**
 * Pure: turn a death record { kind, name, origin, diedAt } into a
 * wandering-soul object. Never throws: a missing name falls back
 * to the kind's name, a missing/invalid diedAt becomes now, an
 * unknown kind keeps its kind and takes the creature style.
 * The soul carries origin + diedAt — the arrival's provenance.
 */
export function createWanderingSoul(record) {
  const rec = record && typeof record === 'object' ? record : {};
  const kind = typeof rec.kind === 'string' && rec.kind ? rec.kind : 'creature';
  const name = typeof rec.name === 'string' && rec.name.trim()
    ? rec.name.trim()
    : (FALLBACK_NAME[kind] || 'A nameless soul');
  const origin = typeof rec.origin === 'string' && rec.origin ? rec.origin : 'unknown';
  const diedAt = Number.isFinite(Number(rec.diedAt)) && Number(rec.diedAt) > 0
    ? Number(rec.diedAt)
    : Date.now();
  const style = styleFor(kind);
  return {
    id: `soul-${slug(origin)}-${slug(kind)}-${slug(name)}-${diedAt}`,
    kind,
    name,
    origin,
    diedAt,
    arrivedAt: Date.now(),
    state: 'wandering',
    label: style.label,
    garment: style.garment,
    color: style.color,
    opacity: style.opacity,
  };
}

/** True when a value has the shape createWanderingSoul returns. */
export function isWellFormedSoul(soul) {
  if (!soul || typeof soul !== 'object') return false;
  return (
    typeof soul.id === 'string' && !!soul.id &&
    typeof soul.kind === 'string' && !!soul.kind &&
    typeof soul.name === 'string' && !!soul.name &&
    typeof soul.origin === 'string' && !!soul.origin &&
    Number.isFinite(Number(soul.diedAt)) && Number(soul.diedAt) > 0 &&
    typeof soul.color === 'string' && !!soul.color &&
    typeof soul.opacity === 'number' && soul.opacity > 0 && soul.opacity <= 1 &&
    soul.state === 'wandering'
  );
}

// ── The seed field ──────────────────────────────────────────────
// DEVICE-LOCAL SEED, not server truth. Twelve souls across the
// wired origins, died over the past 90 days (the nether sojourn).
// The Land of the Dead page shows these only when it has no
// server arrivals and no recorded arrivals yet.
const DAY_MS = 24 * 60 * 60 * 1000;

export function seedSouls() {
  const now = Date.now();
  const seeds = [
    { kind: 'monster', name: 'Stormwing', origin: 'jupiter-2', diedAt: now - 2 * DAY_MS },
    { kind: 'monster', name: 'Cinder Maw', origin: 'hollow-earth', diedAt: now - 5 * DAY_MS },
    { kind: 'creature', name: 'Demo-bat', origin: 'jupiter-2', diedAt: now - 1 * DAY_MS },
    { kind: 'demogorgon', name: 'Demogorgon', origin: 'hawkins', diedAt: now - 9 * DAY_MS },
    { kind: 'user', name: 'A fallen traveller', origin: 'hollow-earth', diedAt: now - 3 * DAY_MS },
    { kind: 'user', name: 'A fallen traveller', origin: 'jupiter-2', diedAt: now - 12 * DAY_MS },
    { kind: 'user', name: 'A fallen traveller', origin: 'hawkins', diedAt: now - 20 * DAY_MS },
    { kind: 'boss', name: 'Korus', origin: 'hollow-earth', diedAt: now - 30 * DAY_MS },
    { kind: 'monster', name: 'Muse, the Luminous', origin: 'hollow-earth', diedAt: now - 7 * DAY_MS },
    { kind: 'creature', name: 'Demo-bat', origin: 'hawkins', diedAt: now - 4 * DAY_MS },
    { kind: 'monster', name: 'Storm Herald', origin: 'jupiter-2', diedAt: now - 45 * DAY_MS },
    { kind: 'monster', name: 'Volta', origin: 'hollow-earth', diedAt: now - 60 * DAY_MS },
  ];
  return seeds.map((s) => createWanderingSoul(s));
}

// ── Device-local arrivals (the wired kill paths land here) ──────
// localStorage only, capped, try/catch-guarded so a kill path can
// never break on storage. In node (no localStorage) the arrival
// is still built and returned, just not persisted.
export const SOUL_ARRIVALS_KEY = 'olympus:land-of-the-dead:arrivals:v1';
export const MAX_SOUL_ARRIVALS = 120;

/** The recorded arrivals, newest first (empty when none). */
export function readSoulArrivals() {
  try {
    if (typeof localStorage === 'undefined') return [];
    const raw = localStorage.getItem(SOUL_ARRIVALS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isWellFormedSoul).slice(0, MAX_SOUL_ARRIVALS);
  } catch {
    return [];
  }
}

/**
 * Record one arrival: build the wandering soul and prepend it to
 * the device-local arrivals (newest first, capped). Returns the
 * soul. Never throws. This is what the kill-event hooks call —
 * one line per death site. DEVICE-LOCAL ONLY: the server copy
 * needs supabase/land-of-the-dead-souls.sql (staged, not run).
 */
export function recordSoulArrival(record) {
  const soul = createWanderingSoul(record);
  try {
    if (typeof localStorage === 'undefined') return soul;
    const next = [soul, ...readSoulArrivals().filter((s) => s.id !== soul.id)]
      .slice(0, MAX_SOUL_ARRIVALS);
    localStorage.setItem(SOUL_ARRIVALS_KEY, JSON.stringify(next));
  } catch { /* storage unavailable — the arrival is still returned */ }
  return soul;
}

// ── Field placement (pure, deterministic per soul) ──────────────
function hashString(value) {
  let h = 0;
  const s = String(value);
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

/** Where a soul stands in the field (percent coords + drift). */
export function soulPlacement(soul, index = 0) {
  const h = hashString(soul && soul.id ? soul.id : `soul-${index}`);
  return {
    x: 6 + (h % 880) / 10, // 6..94
    y: 12 + ((h >>> 8) % 760) / 10, // 12..88
    scale: 0.7 + ((h >>> 16) % 60) / 100, // 0.7..1.3
    driftSeconds: 7 + ((h >>> 20) % 7), // 7..13 s bob
    driftDelaySeconds: -((h >>> 24) % 7), // 0..-6 s stagger
  };
}

// ── The field component ─────────────────────────────────────────
// Renders the field from a souls array: each soul a translucent
// drifting figure — the 24 realms' cone, plus a head and a faint
// glow, so it reads as a figure rather than a bare cone — drawn
// as SVG (no soul art exists on disk to reuse; nothing new is
// invented). Drift is a CSS bob with a per-soul duration/delay.
// Empty field states honestly instead of rendering nothing.
const FIELD_CSS = [
  '.lotd-soul-field{position:relative;width:100%;overflow:hidden;background:radial-gradient(ellipse at 50% 120%,#1a1430 0%,#07060f 70%);border-radius:12px}',
  '.lotd-soul-field h2{margin:0;padding:12px 16px 0;color:#e8e8ee;font-size:13px;letter-spacing:3px;font-weight:600}',
  '.lotd-soul-field .lotd-soul-count{padding:2px 16px 8px;color:#9a93b8;font-size:11px;letter-spacing:1px}',
  '.lotd-soul-field svg{display:block;width:100%;height:auto}',
  '@keyframes lotd-drift{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}',
  '.lotd-soul-drift{animation-name:lotd-drift;animation-iteration-count:infinite;animation-timing-function:ease-in-out}',
  '.lotd-soul-empty{padding:32px 16px;color:#9a93b8;font-size:13px;text-align:center}',
].join('\n');

export function WanderingSoulField({ souls = [], title = 'The Wandering Dead' } = {}) {
  const list = Array.isArray(souls) ? souls.filter(isWellFormedSoul) : [];
  const figures = list.map((soul, i) => {
    const p = soulPlacement(soul, i);
    const w = 7 * p.scale;
    const h = 14 * p.scale;
    return React.createElement(
      'g',
      { key: soul.id, transform: `translate(${p.x} ${p.y})` },
      React.createElement('title', null, `${soul.name} — ${soul.label}, from ${soul.origin}`),
      React.createElement(
        'g',
        {
          className: 'lotd-soul-drift',
          style: { animationDuration: `${p.driftSeconds}s`, animationDelay: `${p.driftDelaySeconds}s` },
        },
        React.createElement('ellipse', {
          cx: 0, cy: h * 0.92, rx: w * 0.9, ry: w * 0.28,
          fill: soul.color, opacity: 0.12,
        }),
        React.createElement('polygon', {
          points: `${-w / 2},${h * 0.9} 0,${-h * 0.35} ${w / 2},${h * 0.9}`,
          fill: soul.color, opacity: soul.opacity,
        }),
        React.createElement('circle', {
          cx: 0, cy: -h * 0.42, r: w * 0.26,
          fill: soul.color, opacity: Math.min(1, soul.opacity + 0.2),
        }),
      ),
    );
  });
  return React.createElement(
    'section',
    { className: 'lotd-soul-field', 'data-soul-count': list.length, 'aria-label': title },
    React.createElement('style', null, FIELD_CSS),
    React.createElement('h2', null, title),
    React.createElement(
      'div',
      { className: 'lotd-soul-count' },
      list.length === 0 ? 'No souls wander here yet.' : `${list.length} soul${list.length === 1 ? '' : 's'} wander${list.length === 1 ? 's' : ''} here.`,
    ),
    list.length === 0
      ? React.createElement('p', { className: 'lotd-soul-empty' }, 'The dead have not arrived yet — what is killed elsewhere will wander here.')
      : React.createElement(
        'svg',
        { viewBox: '0 0 100 100', preserveAspectRatio: 'xMidYMid meet', role: 'img', 'aria-label': `${list.length} wandering souls` },
        figures,
      ),
  );
}
