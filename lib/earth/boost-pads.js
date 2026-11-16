// lib/earth/boost-pads.js — Earth 1 boost pads for racers
// (Merlin, 2026-11-15: "Add power ups to earth 1 for racers...
// ground level with a light up effect... drivers pass over them
// for extra speed boosts").
//
// Ground-level light-up pads on Earth 1 streets. A driver who
// passes over an armed pad gets an extra speed boost — the pad
// flares bright, then dims while it recharges. On foot, pads do
// nothing — and there is no on-foot mode left in Earth 1
// (vehicles only, 2026-11-15), so the driver is always mounted.
//
// PLACEMENT (re-anchored 2026-11-15 — the landmarks are gone):
//   the pads used to anchor 6 per landmark spawn (25 landmarks
//   x 6 = 150). Earth 1 has no landmarks anymore (Merlin:
//   "Earth 1 should not have landmarks anymore"), so the pads
//   now sit on a SEEDED GRID: 15 latitude bands x 10 longitude
//   slots = 150 pads, same count, same trigger/cooldown/boost
//   behavior — only the anchor changed. Each pad is jittered
//   inside its cell by a seeded hash, so the set is stable per
//   load and identical for every driver.
//
// VIDEO WRAP (Merlin, 2026-11-15 — correction: the pad WEARS a
//   video, it is not a video OF the effect): the pad disc wears
//   public/videos/earth1/boost-pad-wrap.mp4 as its video texture
//   (map on the unlit disc material, muted, looping, 9.75 s —
//   the loop point is a 0.25 s dissolve, first/last frame diff
//   7.81/255, effectively seamless). The three states modulate
//   the video — tint + opacity per state (padVideoModulation):
//   armed = cyan tint, gentle pulse; flare = white-hot; recharging
//   = slate, dim. No new real lights, the standing rule.
//
// WHAT ALREADY EXISTED (checked before building, not assumed):
//   - Speed/boost is applied in exactly ONE place: stepFlight
//     (lib/nova-flight.js) — target = maxSpeed x boostMult while
//     the boost input is held and thrust > 0.1; speed eases
//     toward the target at accel, so a pad boost that ends
//     decays back instead of snapping. EarthSupercar (all 19
//     roster craft, per-craft tuning) drives through stepFlight.
//   - No road vector data exists in the repo (the street sheets
//     are photographic tiles, not polylines).
//   - Pads are world geometry in the NexusEarth terrain layer
//     (components/EarthBoostPads.jsx), grounded the same way the
//     vehicles are: the higher of surfaceRadiusOrBase and the
//     street patch's drawn facet.
//
// Pure functions + one shared session-state object. No DOM, no
// THREE: headless-testable, same discipline as lib/earth/roam.js.
// The clock is performance.now() milliseconds (one page session);
// callers pass nowMs in, tests pass fake times.

import { fnv1a, mulberry32 } from './seeded-random.js';

/** The real Earth's radius in metres — NOT geo.js's EARTH_RADIUS
 *  (55), which is the hub Earth mesh's radius in world units.
 *  Pad distances are real metres, so the great-circle math here
 *  runs on the real planet. */
export const EARTH_RADIUS_M = 6371000;

/** Drive-over trigger radius from the pad centre, metres. The
 *  disc itself reads ~4 m across; the trigger is wider so a
 *  driver at boost speed (9 m per frame) cannot slip between
 *  frames — the check sweeps the whole frame's path, not just
 *  the end point (see segmentHitsPad). */
export const PAD_TRIGGER_RADIUS_M = 6;
/** The visible disc's radius, metres. */
export const PAD_VISUAL_RADIUS_M = 4;
/** Per-pad recharge after a trigger — one pad cannot be farmed
 *  by circling it. */
export const PAD_COOLDOWN_MS = 20_000;
/** How long a triggered pad boost lasts, milliseconds. */
export const PAD_BOOST_MS = 4_000;
/** Pad boost multiplier, on top of the craft's own boostMult.
 *  House law is x2.0 on the supercar (90 x 2.0 = 180); a pad
 *  multiplies that again by 1.5 while active — 90 x 2.0 x 1.5
 *  = 270 top speed on the Aventador, 60 x 1.8 x 1.5 = 162 on
 *  the Wisp bike. */
export const PAD_BOOST_MULT = 1.5;
/** Pads render within this distance of the driver, metres. */
export const PAD_RENDER_M = 1500;
/** Seeded grid: 15 latitude bands x 10 longitude slots = 150
 *  pads — the same count the landmark rings held. */
export const PAD_GRID_LAT_BANDS = 15;
export const PAD_GRID_LON_SLOTS = 10;
export const PAD_GRID_SEED = 20261115;
/** Latitude span of the grid (poles excluded — no driving there). */
export const PAD_GRID_LAT_MIN = -60;
export const PAD_GRID_LAT_MAX = 75;
/** Jitter inside a grid cell, degrees (a pad never sits on the
 *  cell edge). */
export const PAD_GRID_JITTER_LAT_DEG = 3;
export const PAD_GRID_JITTER_LON_DEG = 12;
/** Flare length after a trigger, milliseconds — the pad reads
 *  white-hot this long, then dims to its recharge colour. */
export const PAD_FLARE_MS = 500;
/** HUD notice lifetime after a trigger, milliseconds. */
export const PAD_NOTICE_MS = 1500;
/** The HUD notice text on a trigger. */
export const PAD_NOTICE_TEXT = '⚡ BOOST!';

/** Pad colours (the light-up effect is unlit bright material —
 *  no new real lights, the standing rule). */
export const PAD_COLOR_ARMED = '#00ffcc';
export const PAD_COLOR_FLARE = '#ffffff';
export const PAD_COLOR_RECHARGING = '#2a4a5a';

/** The pad-wrap video: a looping top-down glowing boost-pad
 *  energy pattern the disc wears as its texture. Muted, looping,
 *  no audio track (the file carries video only). */
export const PAD_VIDEO_URL = '/videos/earth1/boost-pad-wrap.mp4';
export const PAD_VIDEO_LOOP = true;
export const PAD_VIDEO_MUTED = true;

/** Metres per degree of latitude (small-distance approximation;
 *  pads are checked within tens of metres, where this is exact
 *  to centimetres). */
const M_PER_DEG_LAT = 111320;

/** Great-circle distance between two lat/lon points, metres. */
export function haversineM(lat1, lon1, lat2, lon2) {
  const p1 = (lat1 * Math.PI) / 180;
  const p2 = (lat2 * Math.PI) / 180;
  const dPhi = ((lat2 - lat1) * Math.PI) / 180;
  const dLam = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dPhi / 2) * Math.sin(dPhi / 2)
    + Math.cos(p1) * Math.cos(p2) * Math.sin(dLam / 2) * Math.sin(dLam / 2);
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Pad id: grid band + slot — stable across loads. */
export function padIdForGrid(band, slot) {
  return `grid-${band}-${slot}`;
}

/** Build every pad on the seeded grid: 15 bands x 10 slots =
 *  150 pads. Deterministic — the same seed gives the same pads,
 *  in the same order, on every load. Each pad's chevron bearing
 *  is seeded too (0-360 deg), so the chevron points down a
 *  seeded street direction instead of away from a landmark. */
export function buildPads() {
  const out = [];
  const latStep = (PAD_GRID_LAT_MAX - PAD_GRID_LAT_MIN) / PAD_GRID_LAT_BANDS;
  const lonStep = 360 / PAD_GRID_LON_SLOTS;
  for (let band = 0; band < PAD_GRID_LAT_BANDS; band++) {
    for (let slot = 0; slot < PAD_GRID_LON_SLOTS; slot++) {
      const rand = mulberry32(fnv1a(`earth1-pad:${PAD_GRID_SEED}:${band}:${slot}`));
      const lat = PAD_GRID_LAT_MIN + (band + 0.5) * latStep
        + (rand() - 0.5) * 2 * PAD_GRID_JITTER_LAT_DEG;
      const lon = -180 + (slot + 0.5) * lonStep
        + (rand() - 0.5) * 2 * PAD_GRID_JITTER_LON_DEG;
      const bearingDeg = Math.floor(rand() * 360);
      out.push({
        id: padIdForGrid(band, slot),
        band,
        slot,
        lat,
        lon,
        bearingDeg,
      });
    }
  }
  return out;
}

let allPadsCache = null;
/** Every boost pad on Earth 1 (seeded grid, 150), built once. */
export function allBoostPads() {
  if (!allPadsCache) allPadsCache = buildPads();
  return allPadsCache;
}

/** Reset the pad cache (tests). */
export function resetBoostPadsForTests() {
  allPadsCache = null;
}

/** Pads within radiusM of a lat/lon. `pads` defaults to the full
 *  set; tests pass a fixture list. */
export function padsNear(lat, lon, radiusM, pads = allBoostPads()) {
  const out = [];
  for (const p of pads) {
    if (haversineM(lat, lon, p.lat, p.lon) <= radiusM) out.push(p);
  }
  return out;
}

/** Closest approach of the segment (lat1,lon1)->(lat2,lon2) to a
 *  pad centre, in metres — the segment is projected onto the
 *  tangent plane at the pad, so a fast driver cannot jump over
 *  a pad between frames. A zero-length segment (standing still)
 *  reads as the point distance. */
export function segmentHitsPad(lat1, lon1, lat2, lon2, pad, radiusM = PAD_TRIGGER_RADIUS_M) {
  const cosLat = Math.cos((pad.lat * Math.PI) / 180);
  const toXY = (la, lo) => ({
    x: (lo - pad.lon) * cosLat * M_PER_DEG_LAT,
    y: (la - pad.lat) * M_PER_DEG_LAT,
  });
  const a = toXY(lat1, lon1);
  const b = toXY(lat2, lon2);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  let cx;
  let cy;
  if (len2 <= 0) {
    cx = a.x;
    cy = a.y;
  } else {
    const t = Math.max(0, Math.min(1, -(a.x * dx + a.y * dy) / len2));
    cx = a.x + t * dx;
    cy = a.y + t * dy;
  }
  return Math.hypot(cx, cy) <= radiusM;
}

/** A fresh pad session state. `cooldowns` maps pad id ->
 *  { readyAtMs, triggeredAtMs }. `boostUntilMs` is the end of
 *  the driver's current pad boost (0 = none). `lastLat/lastLon`
 *  are the previous frame's driver position for the sweep. */
export function createBoostPadState() {
  return {
    cooldowns: new Map(),
    boostUntilMs: 0,
    lastLat: null,
    lastLon: null,
    lastPadId: null,
  };
}

/** The one session singleton the scene layer shares (same
 *  pattern as roamState / carState / bikeState). */
export const padBoostState = createBoostPadState();

/** Reset the singleton (tests). */
export function resetPadBoostStateForTests() {
  padBoostState.cooldowns = new Map();
  padBoostState.boostUntilMs = 0;
  padBoostState.lastLat = null;
  padBoostState.lastLon = null;
  padBoostState.lastPadId = null;
  boostPadNotice.text = '';
  boostPadNotice.untilMs = 0;
}

/** The HUD notice shared object — EarthConsole polls it on its
 *  existing 250 ms beat (the bike/car UI pattern), so no event
 *  bus is invented. */
export const boostPadNotice = { text: '', untilMs: 0 };

/** Set the HUD notice (called on a trigger). */
export function setBoostNotice(text, nowMs) {
  boostPadNotice.text = text;
  boostPadNotice.untilMs = nowMs + PAD_NOTICE_MS;
  return boostPadNotice;
}

/** Read the HUD notice: the text while it is live, else ''. */
export function readBoostNotice(nowMs) {
  return nowMs < boostPadNotice.untilMs ? boostPadNotice.text : '';
}

/** The pad boost the drive loops read: active while the timer
 *  runs, with the pad multiplier. The car reads this in its own
 *  frame loop — one frame behind the trigger by design (16 ms,
 *  invisible). */
export function readPadBoost(nowMs, state = padBoostState) {
  const active = nowMs < state.boostUntilMs;
  return { active, mult: active ? PAD_BOOST_MULT : 1 };
}

/** Check the driver's path against nearby pads. One call per
 *  frame, from the pad component.
 *  input: { lat, lon, driving, nowMs, pads? } — driving is true
 *  only while mounted in a craft; Earth 1 is vehicles only, so
 *  the driver is always mounted. Returns { triggered,
 *  boostActive, boostMult }. `triggered` is the pad just hit,
 *  or null. */
export function checkBoostPads(state, input) {
  const { lat, lon, driving, nowMs } = input || {};
  const pads = input?.pads || allBoostPads();
  let triggered = null;
  if (driving && lat != null && lon != null) {
    let prevLat = state.lastLat != null ? state.lastLat : lat;
    let prevLon = state.lastLon != null ? state.lastLon : lon;
    // Teleport guard: a legit frame step is at most ~10 m even
    // at full boost. A bigger jump is a respawn / spawn pick /
    // remount after travel — the old position is stale, so the
    // sweep starts here instead of dragging a line across the
    // planet that could clip a pad the driver never passed.
    if (haversineM(prevLat, prevLon, lat, lon) > 100) {
      prevLat = lat;
      prevLon = lon;
    }
    // A pad the frame's path could have crossed sits within the
    // trigger radius + one frame of travel of the current point;
    // 50 m covers boost speed with room to spare.
    const candidates = padsNear(lat, lon, 50, pads);
    for (const pad of candidates) {
      const cd = state.cooldowns.get(pad.id);
      if (cd && nowMs < cd.readyAtMs) continue; // recharging
      if (!segmentHitsPad(prevLat, prevLon, lat, lon, pad)) continue;
      state.cooldowns.set(pad.id, {
        readyAtMs: nowMs + PAD_COOLDOWN_MS,
        triggeredAtMs: nowMs,
      });
      state.boostUntilMs = nowMs + PAD_BOOST_MS;
      state.lastPadId = pad.id;
      setBoostNotice(PAD_NOTICE_TEXT, nowMs);
      triggered = pad;
      break; // one pad per frame — the first hit wins
    }
  }
  state.lastLat = lat;
  state.lastLon = lon;
  const boostActive = nowMs < state.boostUntilMs;
  return {
    triggered,
    boostActive,
    boostMult: boostActive ? PAD_BOOST_MULT : 1,
  };
}

/** What a pad looks like right now: 'armed' (glowing, ready),
 *  'flare' (white-hot, just triggered), or 'recharging' (dim
 *  until its cooldown ends). */
export function padVisual(padId, nowMs, state = padBoostState) {
  const cd = state.cooldowns.get(padId);
  if (!cd || nowMs >= cd.readyAtMs) return 'armed';
  if (nowMs < cd.triggeredAtMs + PAD_FLARE_MS) return 'flare';
  return 'recharging';
}

/**
 * How the pad's video texture is modulated per state — the pad
 * disc wears the wrap video as its map; the state tints it.
 * Armed discs pulse (pulseDisc true: the component multiplies
 * the disc opacity by its gentle pulse); flare is white-hot;
 * recharging is slate and dim. Pure — pinned in tests.
 */
export function padVideoModulation(visual) {
  if (visual === 'flare') {
    return {
      discColor: PAD_COLOR_FLARE, discOpacity: 0.95,
      ringColor: PAD_COLOR_FLARE, ringOpacity: 1,
      chevColor: PAD_COLOR_FLARE, chevOpacity: 1, chevScale: 1.25,
      pulseDisc: false,
    };
  }
  if (visual === 'recharging') {
    return {
      discColor: PAD_COLOR_RECHARGING, discOpacity: 0.18,
      ringColor: PAD_COLOR_RECHARGING, ringOpacity: 0.35,
      chevColor: PAD_COLOR_RECHARGING, chevOpacity: 0.4, chevScale: 1,
      pulseDisc: false,
    };
  }
  return {
    discColor: PAD_COLOR_ARMED, discOpacity: 0.54,
    ringColor: PAD_COLOR_ARMED, ringOpacity: 0.95,
    chevColor: PAD_COLOR_ARMED, chevOpacity: 0.95, chevScale: 1,
    pulseDisc: true,
  };
}
