// OLYMPIAN MONSTERVERSE — elemental light + atmosphere systems.
//
// THE 2026-10-26 REWORK. Two facts drove this module:
//   1. The world shipped with ZERO scene lights — every
//      MeshStandardMaterial surface (terrain, monsters,
//      landmarks) rendered unlit, so no habitat band could ever
//      "read" as its families' home. The Oct 25 rework changed
//      spawn tables, not light — that is what Merlin meant by
//      "it just swapped the webgl characters."
//   2. Merlin ordered elemental light sources: acid rivers
//      (green), brimstone + fire (red), a sun/moon system,
//      poisonous veins in rock, yellow lightning storms, and
//      smoke haze while fighting smoke monsters.
//
// So this module IS the world's lighting: a hemisphere fill, a
// sun/moon directional that cycles day/night, one coloured
// wash light per elemental band, and the six atmospheric
// systems. Everything is built to read on a phone screen —
// emissive/basic materials for the features themselves (they
// glow regardless of light), point lights only as wash — and
// to cost almost nothing per frame: no per-frame allocations,
// no shadow maps, one small light budget (8 lights total).
//
// R-INJECTED (like zone.js): the builder takes R (THREE) so
// tests can pass the real three module. Pure helpers
// (sunMoonState, stormFlashAt, hazeApproach, acidRiverPath)
// carry no THREE and are unit-tested directly.

export const CYCLE_S = 300; // one full day/night in 5 minutes — visible inside one session
export const LIGHT_BUDGET = 8; // hemisphere + directional + acid 2 + fire 2 + poison 1 + storm 1

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function lerpHex(a, b, t) {
  const ar = (a >> 16) & 255;
  const ag = (a >> 8) & 255;
  const ab = a & 255;
  const br = (b >> 16) & 255;
  const bg = (b >> 8) & 255;
  const bb = b & 255;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return (r << 16) | (g << 8) | bl;
}

// Sun/moon state at session time t (seconds). The core-sun
// alternates sun-gold / moon-pale at the sphere centre on a
// 5-minute cycle; the moon rides opposite in the cycle. Day
// factor 1 = midday, 0 = midnight; dusk sits between. Colours
// are hex ints the page applies to scene background + fog.
export function sunMoonState(t) {
  const phase = ((t % CYCLE_S) + CYCLE_S) % CYCLE_S / CYCLE_S;
  const sunAngle = phase * Math.PI * 2;
  const moonAngle = sunAngle + Math.PI;
  const elev = Math.sin(sunAngle); // >0 while the sun is up
  const dayFactor = clamp01(elev * 1.6 + 0.15);
  // Night -> dusk -> day ramps for the key light.
  const dirColor = dayFactor < 0.5
    ? lerpHex(0x5a7ad0, 0xff9a50, dayFactor * 2)
    : lerpHex(0xff9a50, 0xffe2b0, (dayFactor - 0.5) * 2);
  const dirIntensity = 0.3 + dayFactor * 1.1;
  const hemiIntensity = 0.35 + dayFactor * 0.35;
  // Sky/fog: the inner-world dusk base (data.js WORLD) at
  // night, lifting toward pale storm-day at noon.
  const sky = dayFactor < 0.5
    ? lerpHex(0x2a1e3f, 0x4a2a4a, dayFactor * 2)
    : lerpHex(0x4a2a4a, 0x6a7ab0, (dayFactor - 0.5) * 2);
  const fog = dayFactor < 0.5
    ? lerpHex(0x3a2f4a, 0x4a3a52, dayFactor * 2)
    : lerpHex(0x4a3a52, 0x5a6a88, (dayFactor - 0.5) * 2);
  return {
    sunAngle, moonAngle, dayFactor,
    sunUp: elev > -0.15, moonUp: elev <= -0.15,
    sunOpacity: clamp01((elev + 0.15) * 2),
    moonOpacity: clamp01((-elev + 0.15) * 2),
    dirColor, dirIntensity, hemiIntensity, sky, fog,
  };
}

// Lightning-storm flash envelope at time t: deterministic
// windows every 17 s — three flashes (0.18 s, 0.12 s, 0.25 s)
// inside a ~4 s window, each decaying. 0 outside a flash.
export function stormFlashAt(t) {
  const p = ((t % 17) + 17) % 17;
  const flashes = [[3.0, 0.18], [3.45, 0.12], [3.9, 0.25]];
  for (const [start, dur] of flashes) {
    if (p >= start && p < start + dur) return 1 - (p - start) / dur;
  }
  return 0;
}

// Smoke-haze approach: exponential ease toward the target so
// haze rolls in over ~2 s and clears over ~2 s, never snapping.
export function hazeApproach(current, target, dt) {
  const k = Math.min(1, dt * 1.4);
  return current + (target - current) * k;
}

// WS6 — HAZE STATE (generalised from the shadowCombat boolean).
// The dome's target/colour/max are state now, not hardcoded:
// a shadow HIT dims (grey, max 0.30, 4 s), a sand HIT gusts
// (sand-tinted, max 0.35, 2.5 s); otherwise the old behaviour —
// haze while a shadow monster is spotted within 40 m. In The
// Haven the target is 0 (suppression, R4 — timers keep running
// on the hunter, the dome just does not show it). Pure.
export const HAZE_PRESETS = Object.freeze({
  shadow: Object.freeze({ color: 0x5a5a66, max: 0.30, seconds: 4 }),
  sand: Object.freeze({ color: 0xc2a15e, max: 0.35, seconds: 2.5 }),
});

export function hazeStateFor({ dimUntil = 0, gustUntil = 0, shadowCombat = false, inBase = false, nowMs = Date.now() } = {}) {
  if (inBase) return { target: 0, color: HAZE_PRESETS.shadow.color, max: HAZE_PRESETS.shadow.max };
  if (dimUntil > nowMs) return { target: 1, color: HAZE_PRESETS.shadow.color, max: HAZE_PRESETS.shadow.max };
  if (gustUntil > nowMs) return { target: 1, color: HAZE_PRESETS.sand.color, max: HAZE_PRESETS.sand.max };
  if (shadowCombat) return { target: 1, color: HAZE_PRESETS.shadow.color, max: HAZE_PRESETS.shadow.max };
  return { target: 0, color: HAZE_PRESETS.shadow.color, max: HAZE_PRESETS.shadow.max };
}

// Acid-river centreline: a meandering path from `origin`,
// `steps` points `step` metres apart, heading wandering by up
// to ±0.45 rad per step. Pure (takes an rng) for tests.
export function acidRiverPath(rng, origin, steps = 20, step = 6) {
  let heading = rng() * Math.PI * 2;
  let x = origin.x;
  let z = origin.z;
  const pts = [{ x, z }];
  for (let i = 0; i < steps; i++) {
    heading += (rng() - 0.5) * 0.9;
    x += Math.cos(heading) * step;
    z += Math.sin(heading) * step;
    pts.push({ x, z });
  }
  return pts;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Sample points whose dominant band is `band`, around `centre`
// within `spread`, via the zone's biomeAt reader. Guarded so a
// degenerate reader still terminates (falls back to the centre).
function bandPoints(biomeAt, band, centre, spread, count, rng) {
  const pts = [];
  let guard = 0;
  while (pts.length < count && guard++ < 400) {
    const x = centre.x + (rng() - 0.5) * spread;
    const z = centre.z + (rng() - 0.5) * spread;
    if (biomeAt(x, z) === band) pts.push({ x, z });
  }
  while (pts.length < count) pts.push({ x: centre.x, z: centre.z });
  return pts;
}

export function buildElemental(R, opts = {}) {
  const heightAt = opts.heightAt || (() => 0);
  const biomeAt = opts.biomeAt || (() => 'sand');
  const rng = opts.rng || mulberry32(77701);
  const group = new R.Group();
  // SPHERE PROJECTION (Nov 16 inner sphere): every feature the
  // module places on the ground goes through opts.groundPoint
  // (deck → 3D point, lifted above the shell along the local
  // up) and opts.groundUp (deck → local up). Without them the
  // module falls back to the flat (x, heightAt, z) placement,
  // so the elemental tests — which pass no opts — keep passing
  // untouched. Upright pieces align their +Y to the local up
  // with setFromUnitVectors (no planet.js import here: this
  // module stays R-injected and pure-testable).
  const groundPoint = opts.groundPoint || ((x, z, lift = 0) => ({ x, y: heightAt(x, z) + lift, z }));
  const groundUp = opts.groundUp || (() => ({ x: 0, y: 1, z: 0 }));
  const upQuat = (x, z) => {
    const u = groundUp(x, z);
    const q = new R.Quaternion();
    q.setFromUnitVectors(new R.Vector3(0, 1, 0), new R.Vector3(u.x, u.y, u.z).normalize());
    return q;
  };
  const placePoint = (obj, x, z, lift) => {
    const p = groundPoint(x, z, lift);
    obj.position.set(p.x, p.y, p.z);
    return p;
  };

  // --- base lighting (the world had none) ---
  const hemi = new R.HemisphereLight(0x8a7ab8, 0x2a2018, 0.6);
  group.add(hemi);
  const dir = new R.DirectionalLight(0xffe2b0, 1.2);
  dir.position.set(0, 200, 0);
  group.add(dir);
  group.add(dir.target);

  // --- sun + moon discs (glowing balls: read from anywhere,
  // no billboarding needed). CORE-SUN (Nov 16 inner sphere):
  // both bodies sit AT the sphere centre (0,0,0) — one core
  // body alternating sun-gold / moon-pale through the cycle,
  // exactly the fiction (a sun at the hollow world's heart).
  // The old orbit (r380, up to ~520 m from the origin) sat
  // OUTSIDE the 382 m shell — the walker would never see it.
  // The discs are r18 / r12 at the centre: from the shell
  // (~382 m away) they read ~2.7° / 1.8° across, a real sun
  // and moon in the sky overhead, wherever you stand.
  const sun = new R.Mesh(
    new R.SphereGeometry(18, 16, 12),
    new R.MeshBasicMaterial({ color: 0xffd88a, transparent: true, opacity: 1, fog: false })
  );
  sun.position.set(0, 0, 0);
  const moon = new R.Mesh(
    new R.SphereGeometry(12, 16, 12),
    new R.MeshBasicMaterial({ color: 0xd8e0f0, transparent: true, opacity: 0, fog: false })
  );
  moon.position.set(0, 0, 0);
  group.add(sun);
  group.add(moon);

  // --- acid rivers: bright green ribbons draped on the ground ---
  // G-05: the ribbons wear the acid bubble texture (opts.riverTexture,
  // from textures.js via the zone) and scroll it per frame so the
  // river visibly flows. No texture handed in -> plain ribbons,
  // exactly as before.
  const riverTex = opts.riverTexture || null;
  const riverOrigins = [
    { x: -160, z: 40 }, { x: -120, z: 90 }, { x: -190, z: 0 },
  ];
  for (const origin of riverOrigins) {
    const path = acidRiverPath(rng, origin, 20, 6);
    const pos = [];
    const uvs = [];
    const idx = [];
    for (let i = 0; i < path.length; i++) {
      const p = path[i];
      const q = path[Math.min(i + 1, path.length - 1)];
      const dx = q.x - p.x;
      const dz = q.z - p.z;
      const len = Math.hypot(dx, dz) || 1;
      const nx = -dz / len * 1.6;
      const nz = dx / len * 1.6;
      // Ribbon corners are ground points 0.35 m up, each corner
      // projected at its own deck spot (the strip bends with
      // the shell instead of slicing through it).
      const pl = groundPoint(p.x - nx, p.z - nz, 0.35);
      const pr = groundPoint(p.x + nx, p.z + nz, 0.35);
      pos.push(pl.x, pl.y, pl.z, pr.x, pr.y, pr.z);
      const u = (i / (path.length - 1)) * 6;
      uvs.push(u, 0, u, 1);
      if (i > 0) {
        const a = (i - 1) * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    const geo = new R.BufferGeometry();
    geo.setAttribute('position', new R.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new R.Float32BufferAttribute(uvs, 2));
    geo.setIndex(idx);
    const ribbon = new R.Mesh(
      geo,
      new R.MeshBasicMaterial({ color: 0x39ff66, transparent: true, opacity: 0.9, side: R.DoubleSide, map: riverTex || undefined })
    );
    group.add(ribbon);
  }
  // Green wash over the acid flats (physical falloff: intensity
  // in candela, decay 2 — the glow reads at range, the ribbon
  // itself carries the near read).
  for (const [lx, lz] of [[-160, 40], [-120, 90]]) {
    const light = new R.PointLight(0x39ff66, 250, 160, 2);
    placePoint(light, lx, lz, 8);
    group.add(light);
  }

  // --- brimstone vents: dark cones with ember tips, red wash ---
  const ventPts = bandPoints(biomeAt, 'fire', { x: 160, z: -60 }, 140, 7, rng);
  for (const p of ventPts) {
    const cone = new R.Mesh(
      new R.ConeGeometry(1.4, 3.2, 6),
      new R.MeshStandardMaterial({ color: 0x2a201c, roughness: 1 })
    );
    placePoint(cone, p.x, p.z, 1.6);
    cone.quaternion.copy(upQuat(p.x, p.z));
    group.add(cone);
    const tip = new R.Mesh(
      new R.SphereGeometry(0.7, 8, 6),
      new R.MeshStandardMaterial({ color: 0xff4400, emissive: 0xff4400, emissiveIntensity: 2 })
    );
    placePoint(tip, p.x, p.z, 3.4);
    group.add(tip);
  }
  for (const [lx, lz] of [[160, -60], [120, -110]]) {
    const light = new R.PointLight(0xff3020, 250, 160, 2);
    placePoint(light, lx, lz, 8);
    group.add(light);
  }

  // --- poison veins: dark rocks with glowing violet seams ---
  // G-06 (2026-11-16, spore garden): 12 rocks, taller than the
  // old 8 × 4 m — 6 m rocks, 4.8 m seams — so the veins read
  // above the denser spore-caps. Same single violet wash light.
  const veinPts = bandPoints(biomeAt, 'poison', { x: 180, z: 110 }, 160, 12, rng);
  for (const p of veinPts) {
    const rock = new R.Mesh(
      new R.CylinderGeometry(1.6, 2.4, 6, 6),
      new R.MeshStandardMaterial({ color: 0x2e2438, roughness: 1 })
    );
    placePoint(rock, p.x, p.z, 3);
    // Upright on the local up, then its own random yaw.
    rock.quaternion.copy(upQuat(p.x, p.z));
    rock.rotateY(rng() * Math.PI);
    group.add(rock);
    for (let v = 0; v < 2; v++) {
      const vein = new R.Mesh(
        new R.BoxGeometry(0.18, 4.8, 0.18),
        new R.MeshBasicMaterial({ color: 0xd080ff })
      );
      // Seams ride on the rock: same ground point, a small
      // deck-space offset, their own tilt (rotation.z/y are
      // local, so they read against the rock, not the world).
      const vp = groundPoint(p.x + (rng() - 0.5) * 1.2, p.z + (rng() - 0.5) * 1.2, 3);
      vein.position.set(vp.x, vp.y, vp.z);
      vein.quaternion.copy(upQuat(p.x, p.z));
      vein.rotateZ(0.5 + rng() * 0.4);
      vein.rotateY(rng() * Math.PI);
      group.add(vein);
    }
  }
  const poisonLight = new R.PointLight(0xc06ae0, 250, 150, 2);
  placePoint(poisonLight, 180, 110, 8);
  group.add(poisonLight);

  // --- lightning storm: TWO jagged bolts + one flash light ---
  // G-07: a second bolt mesh with a different seed/shape so
  // flashes alternate between two shapes (one 17 s window shows
  // bolt A, the next bolt B). Both share the flash envelope and
  // the single storm light — the light budget stays 8.
  function buildBolt(zig, mat) {
    const grp = new R.Group();
    for (let i = 0; i < zig.length - 1; i++) {
      const a = zig[i];
      const b = zig[i + 1];
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const dz = b[2] - a[2];
      const len = Math.hypot(dx, dy, dz) || 1;
      const seg = new R.Mesh(new R.BoxGeometry(0.6, len, 0.6), mat);
      seg.position.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
      seg.quaternion.setFromUnitVectors(
        new R.Vector3(0, 1, 0),
        new R.Vector3(dx / len, dy / len, dz / len)
      );
      grp.add(seg);
    }
    grp.visible = false;
    return grp;
  }
  const boltMat = new R.MeshBasicMaterial({ color: 0xffe14d, transparent: true, opacity: 0, fog: false });
  const boltMat2 = new R.MeshBasicMaterial({ color: 0xffe14d, transparent: true, opacity: 0, fog: false });
  const boltGroup = buildBolt([[0, 0, 0], [3, -8, 1], [-2, -16, 0], [2, -24, 1], [0, -32, 0]], boltMat);
  const boltGroup2 = buildBolt([[0, 0, 0], [-3, -7, 1], [2, -15, -1], [-2, -23, 1], [1, -31, 0]], boltMat2);
  group.add(boltGroup);
  group.add(boltGroup2);
  const stormLight = new R.PointLight(0xffe14d, 0, 300, 2);
  stormLight.position.set(-70, 60, -170);
  group.add(stormLight);

  // --- storm clouds (G-07): large dark flat silhouettes drifting
  // slowly over the lightning plains and the mountain band, y 60-90,
  // well above the walker. MeshBasicMaterial, no light, fog off so
  // they read dark against the sky instead of washing out.
  const clouds = [];
  const cloudRng = mulberry32(77707);
  const cloudCentres = [
    { x: -70, z: -170, spread: 140 }, { x: 210, z: -150, spread: 110 },
  ];
  for (let c = 0; c < 6; c++) {
    const centre = cloudCentres[c % cloudCentres.length];
    const baseX = centre.x + (cloudRng() - 0.5) * centre.spread;
    const baseZ = centre.z + (cloudRng() - 0.5) * centre.spread;
    const baseY = 60 + cloudRng() * 30;
    const cloud = new R.Mesh(
      new R.SphereGeometry(16 + cloudRng() * 10, 10, 8),
      new R.MeshBasicMaterial({ color: 0x1e1826, transparent: true, opacity: 0.85, fog: false })
    );
    cloud.scale.y = 0.22;
    cloud.position.set(baseX, baseY, baseZ);
    group.add(cloud);
    clouds.push({ mesh: cloud, baseX, baseY, baseZ, phase: cloudRng() * Math.PI * 2, amp: 14 + cloudRng() * 12 });
  }

  // --- smoke haze dome: rolls in around the observer while
  // fighting shadow (smoke) monsters, clears after. BackSide
  // sphere, no depth write: cheap, and it never hides the HUD
  // (the HUD is DOM, above the canvas).
  const hazeMat = new R.MeshBasicMaterial({
    color: 0x5a5a66, transparent: true, opacity: 0,
    side: R.BackSide, depthWrite: false, fog: false,
  });
  const hazeDome = new R.Mesh(new R.SphereGeometry(70, 12, 8), hazeMat);
  group.add(hazeDome);

  // --- poison ground-mist (G-06, 2026-11-16, spore garden):
  // a second haze dome in violet, opacity 0.15, always on
  // while the observer stands in the poison band — same
  // BackSide-sphere shape as the smoke haze, no new light.
  // It eases in/out with hazeApproach so crossing the band
  // edge never snaps. Tagged userData.poisonMist for tests.
  const mistMat = new R.MeshBasicMaterial({
    color: 0xc06ae0, transparent: true, opacity: 0,
    side: R.BackSide, depthWrite: false, fog: false,
  });
  const mistDome = new R.Mesh(new R.SphereGeometry(70, 12, 8), mistMat);
  mistDome.userData.poisonMist = true;
  group.add(mistDome);

  let haze = 0;
  let hazeMax = 0.30; // sticky ceiling: the dome's max while clearing
  let mist = 0;
  let sky = 0x2a1e3f;
  let fog = 0x3a2f4a;

  function update(dt, state = {}) {
    const t = state.t || 0;
    const s = sunMoonState(t);
    // CORE-SUN: both bodies sit at the sphere centre (placed
    // there at build); the cycle only swaps which one shows.
    // The key light radiates from the core OUTWARD: its target
    // is the observer's real 3D point and the light sits 50 m
    // core-ward of it, so the light direction is always
    // core → observer — the sun is overhead wherever you stand.
    // Without an observer3D (tests, old callers) the light
    // falls back to the old orbit position above the origin.
    sun.material.opacity = s.sunOpacity;
    moon.material.opacity = s.moonOpacity;
    if (state.observer3D) {
      const o = state.observer3D;
      const u = state.observerUp || { x: 0, y: 1, z: 0 };
      dir.target.position.set(o.x, o.y, o.z);
      dir.position.set(o.x + u.x * 50, o.y + u.y * 50, o.z + u.z * 50);
    } else {
      const upAngle = s.sunUp ? s.sunAngle : s.moonAngle;
      dir.target.position.set(0, 0, 0);
      dir.position.set(Math.cos(upAngle) * 380, 60 + Math.sin(upAngle) * 280, Math.sin(upAngle * 0.5) * 100);
    }
    dir.color.setHex(s.dirColor);
    dir.intensity = s.dirIntensity;
    hemi.intensity = s.hemiIntensity;
    // Storm: the two bolts alternate by 17 s window and share
    // the flash envelope; the flash light follows the live bolt.
    const flash = stormFlashAt(t);
    const boltAlt = Math.floor(t / 17) % 2 === 1;
    const liveBolt = boltAlt ? boltGroup2 : boltGroup;
    const idleBolt = boltAlt ? boltGroup : boltGroup2;
    idleBolt.visible = false;
    liveBolt.visible = flash > 0;
    boltMat.opacity = flash;
    boltMat2.opacity = flash;
    if (flash > 0) {
      const stormIdx = Math.floor(t / 17);
      const srng = mulberry32(9000 + stormIdx);
      const bx = -70 + (srng() - 0.5) * 120;
      const bz = -170 + (srng() - 0.5) * 120;
      // The bolt hangs from 46 m above its ground point down
      // to the shell — on the sphere that is a radial drop, so
      // the bolt group's +Y aligns to the local up (its zig
      // runs 0..-32 in local Y, i.e. outward, toward the shell)
      // with a random yaw around it.
      placePoint(liveBolt, bx, bz, 46);
      liveBolt.quaternion.copy(upQuat(bx, bz));
      liveBolt.rotateY(srng() * Math.PI);
      placePoint(stormLight, bx, bz, 40);
    }
    stormLight.intensity = flash * 3000;
    // Acid rivers flow: scroll the shared river texture offset.
    if (riverTex) riverTex.offset.x = (t * 0.04) % 1;
    // Storm clouds drift slowly over their bands.
    for (const c of clouds) {
      c.mesh.position.x = c.baseX + Math.sin(t * 0.01 + c.phase) * c.amp;
      c.mesh.position.z = c.baseZ + Math.cos(t * 0.008 + c.phase) * c.amp * 0.6;
    }
    // Smoke haze: ease toward combat (1) or clear (0). WS6:
    // the target/colour/max come from state.haze when the zone
    // passes it (hit-driven dim/gust + shadow combat); the old
    // shadowCombat boolean is the fallback, so existing callers
    // keep working. The max is sticky while clearing, so the
    // dome never snaps its ceiling mid-fade. The poison
    // ground-mist dome below is a SEPARATE dome — untouched.
    const hz = state.haze || (state.shadowCombat
      ? { target: 1, color: 0x5a5a66, max: 0.30 }
      : { target: 0, color: 0x5a5a66, max: 0.30 });
    if (hz.target > 0) hazeMax = hz.max;
    haze = hazeApproach(haze, hz.target, dt > 0 && dt < 5 ? dt : 0.016);
    // The haze/mist domes ride 10 m above the observer along
    // the LOCAL up (toward the core) — the old world-Y +10 put
    // the dome centre under the shell on the far side.
    const hazeCentre = state.observer3D
      ? (() => {
          const u = state.observerUp || { x: 0, y: 1, z: 0 };
          return { x: state.observer3D.x + u.x * 10, y: state.observer3D.y + u.y * 10, z: state.observer3D.z + u.z * 10 };
        })()
      : { x: state.observerX || 0, y: (state.observerY || 0) + 10, z: state.observerZ || 0 };
    hazeDome.position.set(hazeCentre.x, hazeCentre.y, hazeCentre.z);
    hazeMat.color.setHex(hz.color);
    hazeMat.opacity = haze * hazeMax;
    // Poison ground-mist (G-06): on inside the poison band,
    // off everywhere else — eased, never snapped.
    const inPoison = biomeAt(state.observerX || 0, state.observerZ || 0) === 'poison';
    mist = hazeApproach(mist, inPoison ? 1 : 0, dt > 0 && dt < 5 ? dt : 0.016);
    mistDome.position.set(hazeCentre.x, hazeCentre.y, hazeCentre.z);
    mistMat.opacity = mist * 0.15;
    // Sky/fog for the page to apply: haze greys the fog out.
    sky = s.sky;
    fog = lerpHex(s.fog, 0x555560, haze * 0.7);
  }

  function colors() {
    return { sky, fog, haze };
  }

  return { group, update, colors };
}
