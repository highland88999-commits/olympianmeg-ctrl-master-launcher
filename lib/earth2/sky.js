// lib/earth2/sky.js
// EARTH 2 — THE REAL SKY (Living Planet Wave A, 2026-10-23).
// Merlin walked the planet and ordered the sky made true: "Make
// it weather accurate and time accurate based on users
// location." The planet's clock is the REAL clock — the sun
// stands where the real sun stands for the parcel under the
// walker's feet (every Earth 2 parcel carries a real lat/lon
// from lib/earth2/parcels.js), the moon takes over the night,
// the stars are Earth's real constellations plotted from real
// star positions, and the aurora borealis burns over the high
// latitudes after dark.
//
// Everything here is a pure function of (instant, lat, lon) —
// solar/lunar math, celestial coordinates, palette stops. No
// three.js, no DOM, no Math.random (the faint field stars come
// from a seeded generator, like every other Earth 2 system), so
// the whole sky is unit-testable and identical for every visitor
// standing on the same parcel at the same moment. The scene glue
// (lights, dome, ribbons) lives in Earth2World.jsx.

const DEG = Math.PI / 180;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const lerp = (a, b, t) => a + (b - a) * t;

// ── Seeded RNG (mulberry32 — the world's house generator) ─────
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function dayOfYear(ms) {
  const d = new Date(ms);
  const start = Date.UTC(d.getUTCFullYear(), 0, 0);
  return Math.floor((ms - start) / 86400000);
}

// ── The sun ───────────────────────────────────────────────────
/**
 * The sun's position for an instant and a place, by the standard
 * fractional-year approximation (NOAA solar math, good to a
 * fraction of a degree — plenty for a sky). Returns elevation and
 * azimuth in degrees (azimuth from north, eastward), the local
 * solar time in hours, and a phase read:
 *   'day'       elevation > +2°
 *   'twilight'  −8° … +2° (sunrise/sunset colours live here)
 *   'night'     elevation < −8°
 */
export function solarPosition(dateMs, lat, lon) {
  const ms = Number(dateMs) || 0;
  const la = clamp(Number(lat) || 0, -90, 90);
  const lo = clamp(Number(lon) || 0, -180, 180);
  const d = new Date(ms);
  const utcHours = d.getUTCHours() + d.getUTCMinutes() / 60 + d.getUTCSeconds() / 3600;
  const gamma = ((2 * Math.PI) / 365) * (dayOfYear(ms) - 1 + (utcHours - 12) / 24);
  // Equation of time (minutes) and solar declination (radians).
  const eqtime = 229.18 * (0.000075 + 0.001868 * Math.cos(gamma) - 0.032077 * Math.sin(gamma)
    - 0.014615 * Math.cos(2 * gamma) - 0.040849 * Math.sin(2 * gamma));
  const decl = 0.006918 - 0.399912 * Math.cos(gamma) + 0.070257 * Math.sin(gamma)
    - 0.006758 * Math.cos(2 * gamma) + 0.000907 * Math.sin(2 * gamma)
    - 0.002697 * Math.cos(3 * gamma) + 0.00148 * Math.sin(3 * gamma);
  // True solar time (minutes): UTC + longitude + equation of time.
  const tst = ((utcHours * 60 + eqtime + 4 * lo) % 1440 + 1440) % 1440;
  let hourAngle = tst / 4 - 180; // degrees; negative morning
  if (hourAngle < -180) hourAngle += 360;
  const latR = la * DEG;
  const haR = hourAngle * DEG;
  const cosZen = clamp(
    Math.sin(latR) * Math.sin(decl) + Math.cos(latR) * Math.cos(decl) * Math.cos(haR),
    -1, 1,
  );
  const elevation = 90 - Math.acos(cosZen) / DEG;
  let azimuth = (Math.atan2(
    Math.sin(haR),
    Math.cos(haR) * Math.sin(latR) - Math.tan(decl) * Math.cos(latR),
  ) / DEG) + 180;
  azimuth = ((azimuth % 360) + 360) % 360;
  const phase = elevation > 2 ? 'day' : elevation > -8 ? 'twilight' : 'night';
  return {
    elevationDeg: elevation,
    azimuthDeg: azimuth,
    declinationDeg: decl / DEG,
    solarTimeHours: tst / 60,
    phase,
    isDay: elevation > 0,
  };
}

/** A direction vector for an altitude/azimuth pair, in the
 *  world's frame: x east, y up, z SOUTH (north is −z, the
 *  parcel grid's row 0). Azimuth degrees from north, eastward. */
export function altAzToVector(altDeg, azDeg) {
  const alt = altDeg * DEG;
  const az = azDeg * DEG;
  return {
    x: Math.cos(alt) * Math.sin(az),
    y: Math.sin(alt),
    z: -Math.cos(alt) * Math.cos(az),
  };
}

/** The sun's direction vector (from the ground toward the sun). */
export function sunVector(dateMs, lat, lon) {
  const s = solarPosition(dateMs, lat, lon);
  return altAzToVector(s.elevationDeg, s.azimuthDeg);
}

// ── The moon ──────────────────────────────────────────────────
/**
 * The moon's position, by the standard low-precision lunar
 * approximation (good to ~1°: the synodic phase from a known new
 * moon, the ecliptic longitude advanced at the moon's mean rate,
 * ecliptic latitude neglected). Returns alt/az plus the
 * illuminated fraction (0 new … 1 full) so the scene can light
 * the night honestly — a full moon is a real light source, a
 * new moon is barely a rumour.
 */
export function moonPosition(dateMs, lat, lon) {
  const ms = Number(dateMs) || 0;
  const la = clamp(Number(lat) || 0, -90, 90);
  const lo = clamp(Number(lon) || 0, -180, 180);
  const days = ms / 86400000 - 10957.5; // days since 2000-01-01 UTC
  // Mean ecliptic longitudes (degrees).
  const sunLon = (280.460 + 0.9856474 * days) % 360;
  const moonLon = (218.316 + 13.176396 * days) % 360;
  const elong = ((moonLon - sunLon) % 360 + 360) % 360;
  const illum = (1 - Math.cos(elong * DEG)) / 2;
  // Ecliptic → equatorial (obliquity 23.44°, latitude ≈ 0).
  const eps = 23.44 * DEG;
  const lam = moonLon * DEG;
  const ra = ((Math.atan2(Math.cos(eps) * Math.sin(lam), Math.cos(lam)) / DEG) / 15 + 24) % 24;
  const dec = Math.asin(Math.sin(eps) * Math.sin(lam)) / DEG;
  const altAz = celestialToAltAz(ra, dec, ms, la, lo);
  return { ...altAz, raHours: ra, decDeg: dec, illum, elongationDeg: elong };
}

// ── Stars: equatorial → local ────────────────────────────────
/** Local (Greenwich) sidereal time in hours for an instant and
 *  longitude — the sky's rotation angle. */
export function siderealHours(dateMs, lon) {
  const ms = Number(dateMs) || 0;
  const days = ms / 86400000 - 10957.5; // since 2000-01-01 12:00 UTC (JD 2451545.0 ≈ this epoch read)
  let gmst = (18.697374558 + 24.06570982441908 * days) % 24;
  if (gmst < 0) gmst += 24;
  let lst = (gmst + (Number(lon) || 0) / 15) % 24;
  if (lst < 0) lst += 24;
  return lst;
}

/**
 * A star's local altitude/azimuth (degrees) from its equatorial
 * coordinates (RA in hours, Dec in degrees) for an instant and
 * place. The identity cases pin the math: a star whose RA equals
 * the local sidereal time and whose Dec equals the latitude
 * passes through the zenith (alt 90).
 */
export function celestialToAltAz(raHours, decDeg, dateMs, lat, lon) {
  const la = clamp(Number(lat) || 0, -90, 90);
  let ha = (siderealHours(dateMs, lon) - (Number(raHours) || 0)) * 15; // hour angle, degrees
  ha = ((ha + 540) % 360) - 180;
  const haR = ha * DEG;
  const decR = (Number(decDeg) || 0) * DEG;
  const latR = la * DEG;
  const sinAlt = Math.sin(decR) * Math.sin(latR) + Math.cos(decR) * Math.cos(latR) * Math.cos(haR);
  const alt = Math.asin(clamp(sinAlt, -1, 1)) / DEG;
  let az = Math.atan2(
    -Math.cos(decR) * Math.sin(haR),
    Math.sin(decR) * Math.cos(latR) - Math.cos(decR) * Math.sin(latR) * Math.cos(haR),
  ) / DEG;
  az = ((az % 360) + 360) % 360;
  return { altDeg: alt, azDeg: az };
}

/** A star's direction vector in the world frame (see
 *  altAzToVector) for an instant and place. */
export function starVector(star, dateMs, lat, lon) {
  const { altDeg, azDeg } = celestialToAltAz(star.ra, star.dec, dateMs, lat, lon);
  return { ...altAzToVector(altDeg, azDeg), altDeg };
}

// ── The constellations (real stars, J2000 positions) ─────────
// Plotted from real relative positions: RA in hours, Dec in
// degrees, mag the apparent magnitude. Lines join the pattern
// stars in the order every star atlas draws them, so the shapes
// a walker knows from Earth's sky are the shapes overhead.
export const CONSTELLATIONS = [
  {
    name: 'Ursa Major',
    stars: [
      { name: 'Dubhe', ra: 11.062, dec: 61.751, mag: 1.8 },
      { name: 'Merak', ra: 11.031, dec: 56.382, mag: 2.4 },
      { name: 'Phecda', ra: 11.897, dec: 53.695, mag: 2.4 },
      { name: 'Megrez', ra: 12.257, dec: 57.033, mag: 3.3 },
      { name: 'Alioth', ra: 12.901, dec: 55.960, mag: 1.8 },
      { name: 'Mizar', ra: 13.399, dec: 54.925, mag: 2.3 },
      { name: 'Alkaid', ra: 13.792, dec: 49.313, mag: 1.9 },
    ],
    lines: [[0, 1], [1, 2], [2, 3], [3, 0], [3, 4], [4, 5], [5, 6]],
  },
  {
    name: 'Cassiopeia',
    stars: [
      { name: 'Caph', ra: 0.153, dec: 59.150, mag: 2.3 },
      { name: 'Schedar', ra: 0.675, dec: 56.537, mag: 2.2 },
      { name: 'Gamma Cassiopeiae', ra: 0.945, dec: 60.717, mag: 2.5 },
      { name: 'Ruchbah', ra: 1.430, dec: 60.235, mag: 2.7 },
      { name: 'Segin', ra: 1.907, dec: 63.670, mag: 3.4 },
    ],
    lines: [[0, 1], [1, 2], [2, 3], [3, 4]],
  },
  {
    name: 'Orion',
    stars: [
      { name: 'Betelgeuse', ra: 5.919, dec: 7.407, mag: 0.5 },
      { name: 'Bellatrix', ra: 5.418, dec: 6.350, mag: 1.6 },
      { name: 'Alnitak', ra: 5.679, dec: -1.943, mag: 1.9 },
      { name: 'Alnilam', ra: 5.604, dec: -1.202, mag: 1.7 },
      { name: 'Mintaka', ra: 5.533, dec: -0.299, mag: 2.2 },
      { name: 'Saiph', ra: 5.796, dec: -9.670, mag: 2.1 },
      { name: 'Rigel', ra: 5.242, dec: -8.202, mag: 0.1 },
    ],
    lines: [[0, 2], [1, 4], [4, 3], [3, 2], [2, 5], [4, 6], [0, 1], [5, 6]],
  },
  {
    name: 'Crux',
    stars: [
      { name: 'Acrux', ra: 12.443, dec: -63.099, mag: 0.8 },
      { name: 'Mimosa', ra: 12.795, dec: -59.689, mag: 1.3 },
      { name: 'Gacrux', ra: 12.519, dec: -57.113, mag: 1.6 },
      { name: 'Imai', ra: 12.252, dec: -58.749, mag: 2.8 },
    ],
    lines: [[0, 2], [3, 1]],
  },
];

/** Every pattern star, flattened with its constellation's name. */
export function constellationStars() {
  const out = [];
  for (const c of CONSTELLATIONS) {
    c.stars.forEach((s, i) => out.push({ ...s, constellation: c.name, index: i }));
  }
  return out;
}

// The faint field behind the patterns: seeded, uniform on the
// sphere, dimmer than any pattern star. Deterministic — the
// same sky for every visitor (procedural law).
export const FIELD_STAR_COUNT = 700;
let _fieldStars = null;
export function fieldStars() {
  if (_fieldStars) return _fieldStars;
  const rng = mulberry32(0x57a25);
  const out = [];
  for (let i = 0; i < FIELD_STAR_COUNT; i++) {
    const u = rng() * 2 - 1; // cos(dec)
    const ra = rng() * 24;
    const dec = (Math.acos(clamp(u, -1, 1)) / DEG) - 90;
    out.push({ name: '', ra, dec, mag: 3.6 + rng() * 2.2 });
  }
  _fieldStars = out;
  return out;
}

// ── The aurora ────────────────────────────────────────────────
/**
 * Aurora intensity 0..1 for a place and a sun elevation: dark
 * skies only (the sun well down), scaling with |latitude| —
 * a rumour at 25°, a presence at 45°, a sky-filling fire over
 * the Canada-like latitudes past 60°, mirrored for the southern
 * aurora over the pole. Season and solar weather are beyond a
 * sky model; latitude and darkness are the honest drivers.
 */
export function auroraIntensity(lat, sunElevationDeg) {
  const dark = clamp((-4 - sunElevationDeg) / 8, 0, 1); // full by −12°
  if (dark <= 0) return 0;
  const a = Math.abs(Number(lat) || 0);
  const band = clamp((a - 22) / 38, 0, 1); // 0 at 22°, 1 at 60°+
  return dark * band * band * (3 - 2 * band); // smoothstep the band
}

// ── The palette ───────────────────────────────────────────────
// Sky colours as a function of the sun's elevation: the dome's
// top and horizon stops, the fog, and the light rig's numbers,
// interpolated between measured-feeling stops. Colours are
// [r, g, b] in 0..1. `night` is the master night factor the
// scene multiplies star/moon/aurora visibility by.
const SKY_STOPS = [
  { elev: -16, top: [0.012, 0.023, 0.055], horizon: [0.030, 0.045, 0.085], fog: [0.025, 0.038, 0.070], sun: [0.35, 0.45, 0.70], sunI: 0.0, hemiI: 0.16, night: 1.0 },
  { elev: -8,  top: [0.030, 0.055, 0.120], horizon: [0.100, 0.110, 0.180], fog: [0.070, 0.085, 0.150], sun: [0.45, 0.50, 0.75], sunI: 0.0, hemiI: 0.24, night: 0.92 },
  { elev: -3,  top: [0.090, 0.150, 0.300], horizon: [0.720, 0.380, 0.190], fog: [0.360, 0.300, 0.280], sun: [1.00, 0.450, 0.200], sunI: 0.35, hemiI: 0.38, night: 0.45 },
  { elev: 0,   top: [0.180, 0.300, 0.520], horizon: [0.980, 0.560, 0.260], fog: [0.620, 0.520, 0.400], sun: [1.00, 0.580, 0.300], sunI: 0.9, hemiI: 0.55, night: 0.12 },
  { elev: 3,   top: [0.300, 0.470, 0.700], horizon: [0.880, 0.680, 0.440], fog: [0.740, 0.660, 0.520], sun: [1.00, 0.720, 0.450], sunI: 1.5, hemiI: 0.78, night: 0.0 },
  { elev: 10,  top: [0.420, 0.600, 0.830], horizon: [0.780, 0.840, 0.860], fog: [0.780, 0.840, 0.860], sun: [1.00, 0.880, 0.680], sunI: 2.0, hemiI: 0.98, night: 0.0 },
  { elev: 35,  top: [0.482, 0.706, 0.902], horizon: [0.812, 0.886, 0.941], fog: [0.812, 0.886, 0.941], sun: [1.00, 0.949, 0.851], sunI: 2.2, hemiI: 1.05, night: 0.0 },
];

export function skyPalette(sunElevationDeg) {
  const e = clamp(Number(sunElevationDeg) || 0, -16, 35);
  let a = SKY_STOPS[0];
  let b = SKY_STOPS[SKY_STOPS.length - 1];
  for (let i = 0; i < SKY_STOPS.length - 1; i++) {
    if (e >= SKY_STOPS[i].elev && e <= SKY_STOPS[i + 1].elev) {
      a = SKY_STOPS[i];
      b = SKY_STOPS[i + 1];
      break;
    }
  }
  const t = b.elev > a.elev ? clamp((e - a.elev) / (b.elev - a.elev), 0, 1) : 0;
  const mix3 = (u, v) => [lerp(u[0], v[0], t), lerp(u[1], v[1], t), lerp(u[2], v[2], t)];
  return {
    top: mix3(a.top, b.top),
    horizon: mix3(a.horizon, b.horizon),
    fog: mix3(a.fog, b.fog),
    sunColor: mix3(a.sun, b.sun),
    sunIntensity: lerp(a.sunI, b.sunI, t),
    hemiIntensity: lerp(a.hemiI, b.hemiI, t),
    night: lerp(a.night, b.night, t),
    sunElev: e,
  };
}

/** Local solar time as a clock read ("13:47") for the HUD. */
export function solarClockLabel(dateMs, lat, lon) {
  const { solarTimeHours } = solarPosition(dateMs, lat, lon);
  const h = Math.floor(solarTimeHours);
  const m = Math.floor((solarTimeHours - h) * 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
