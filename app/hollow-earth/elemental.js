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

// Sun/moon state at session time t (seconds). The sun arcs
// overhead on a 5-minute cycle; the moon rides opposite. Day
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

  // --- base lighting (the world had none) ---
  const hemi = new R.HemisphereLight(0x8a7ab8, 0x2a2018, 0.6);
  group.add(hemi);
  const dir = new R.DirectionalLight(0xffe2b0, 1.2);
  dir.position.set(0, 200, 0);
  group.add(dir);
  group.add(dir.target);

  // --- sun + moon discs (glowing balls: read from anywhere,
  // no billboarding needed) ---
  const sun = new R.Mesh(
    new R.SphereGeometry(18, 16, 12),
    new R.MeshBasicMaterial({ color: 0xffd88a, transparent: true, opacity: 1, fog: false })
  );
  const moon = new R.Mesh(
    new R.SphereGeometry(12, 16, 12),
    new R.MeshBasicMaterial({ color: 0xd8e0f0, transparent: true, opacity: 0, fog: false })
  );
  group.add(sun);
  group.add(moon);

  // --- acid rivers: bright green ribbons draped on the ground ---
  const riverOrigins = [
    { x: -160, z: 40 }, { x: -120, z: 90 }, { x: -190, z: 0 },
  ];
  for (const origin of riverOrigins) {
    const path = acidRiverPath(rng, origin, 20, 6);
    const pos = [];
    const idx = [];
    for (let i = 0; i < path.length; i++) {
      const p = path[i];
      const q = path[Math.min(i + 1, path.length - 1)];
      const dx = q.x - p.x;
      const dz = q.z - p.z;
      const len = Math.hypot(dx, dz) || 1;
      const nx = -dz / len * 1.6;
      const nz = dx / len * 1.6;
      const y = heightAt(p.x, p.z) + 0.35;
      pos.push(p.x - nx, y, p.z - nz, p.x + nx, y, p.z + nz);
      if (i > 0) {
        const a = (i - 1) * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    const geo = new R.BufferGeometry();
    geo.setAttribute('position', new R.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    const ribbon = new R.Mesh(
      geo,
      new R.MeshBasicMaterial({ color: 0x39ff66, transparent: true, opacity: 0.9, side: R.DoubleSide })
    );
    group.add(ribbon);
  }
  // Green wash over the acid flats (physical falloff: intensity
  // in candela, decay 2 — the glow reads at range, the ribbon
  // itself carries the near read).
  for (const [lx, lz] of [[-160, 40], [-120, 90]]) {
    const light = new R.PointLight(0x39ff66, 250, 160, 2);
    light.position.set(lx, heightAt(lx, lz) + 8, lz);
    group.add(light);
  }

  // --- brimstone vents: dark cones with ember tips, red wash ---
  const ventPts = bandPoints(biomeAt, 'fire', { x: 160, z: -60 }, 140, 7, rng);
  for (const p of ventPts) {
    const y = heightAt(p.x, p.z);
    const cone = new R.Mesh(
      new R.ConeGeometry(1.4, 3.2, 6),
      new R.MeshStandardMaterial({ color: 0x2a201c, roughness: 1 })
    );
    cone.position.set(p.x, y + 1.6, p.z);
    group.add(cone);
    const tip = new R.Mesh(
      new R.SphereGeometry(0.7, 8, 6),
      new R.MeshStandardMaterial({ color: 0xff4400, emissive: 0xff4400, emissiveIntensity: 2 })
    );
    tip.position.set(p.x, y + 3.4, p.z);
    group.add(tip);
  }
  for (const [lx, lz] of [[160, -60], [120, -110]]) {
    const light = new R.PointLight(0xff3020, 250, 160, 2);
    light.position.set(lx, heightAt(lx, lz) + 8, lz);
    group.add(light);
  }

  // --- poison veins: dark rocks with glowing violet seams ---
  const veinPts = bandPoints(biomeAt, 'poison', { x: 180, z: 110 }, 160, 8, rng);
  for (const p of veinPts) {
    const y = heightAt(p.x, p.z);
    const rock = new R.Mesh(
      new R.CylinderGeometry(1.6, 2.4, 4, 6),
      new R.MeshStandardMaterial({ color: 0x2e2438, roughness: 1 })
    );
    rock.position.set(p.x, y + 2, p.z);
    rock.rotation.y = rng() * Math.PI;
    group.add(rock);
    for (let v = 0; v < 2; v++) {
      const vein = new R.Mesh(
        new R.BoxGeometry(0.18, 3.2, 0.18),
        new R.MeshBasicMaterial({ color: 0xd080ff })
      );
      vein.position.set(p.x + (rng() - 0.5) * 1.2, y + 2, p.z + (rng() - 0.5) * 1.2);
      vein.rotation.z = 0.5 + rng() * 0.4;
      vein.rotation.y = rng() * Math.PI;
      group.add(vein);
    }
  }
  const poisonLight = new R.PointLight(0xc06ae0, 250, 150, 2);
  poisonLight.position.set(180, heightAt(180, 110) + 8, 110);
  group.add(poisonLight);

  // --- lightning storm: one jagged bolt + one flash light ---
  const boltGroup = new R.Group();
  const boltMat = new R.MeshBasicMaterial({ color: 0xffe14d, transparent: true, opacity: 0, fog: false });
  const zig = [[0, 0, 0], [3, -8, 1], [-2, -16, 0], [2, -24, 1], [0, -32, 0]];
  for (let i = 0; i < zig.length - 1; i++) {
    const a = zig[i];
    const b = zig[i + 1];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const dz = b[2] - a[2];
    const len = Math.hypot(dx, dy, dz) || 1;
    const seg = new R.Mesh(new R.BoxGeometry(0.6, len, 0.6), boltMat);
    seg.position.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
    seg.quaternion.setFromUnitVectors(
      new R.Vector3(0, 1, 0),
      new R.Vector3(dx / len, dy / len, dz / len)
    );
    boltGroup.add(seg);
  }
  boltGroup.visible = false;
  group.add(boltGroup);
  const stormLight = new R.PointLight(0xffe14d, 0, 300, 2);
  stormLight.position.set(-70, 60, -170);
  group.add(stormLight);

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

  let haze = 0;
  let sky = 0x2a1e3f;
  let fog = 0x3a2f4a;

  function update(dt, state = {}) {
    const t = state.t || 0;
    const s = sunMoonState(t);
    // Sun/moon orbit: wide arcs overhead, sun and moon opposite.
    const place = (mesh, angle, opacity) => {
      mesh.position.set(Math.cos(angle) * 380, 60 + Math.sin(angle) * 280, Math.sin(angle * 0.5) * 100);
      mesh.material.opacity = opacity;
    };
    place(sun, s.sunAngle, s.sunOpacity);
    place(moon, s.moonAngle, s.moonOpacity);
    // The key light follows whichever body is up.
    const upMesh = s.sunUp ? sun : moon;
    dir.position.copy(upMesh.position);
    dir.color.setHex(s.dirColor);
    dir.intensity = s.dirIntensity;
    hemi.intensity = s.hemiIntensity;
    // Storm: bolt + flash light share the envelope.
    const flash = stormFlashAt(t);
    boltGroup.visible = flash > 0;
    boltMat.opacity = flash;
    if (flash > 0) {
      const stormIdx = Math.floor(t / 17);
      const srng = mulberry32(9000 + stormIdx);
      const bx = -70 + (srng() - 0.5) * 120;
      const bz = -170 + (srng() - 0.5) * 120;
      boltGroup.position.set(bx, heightAt(bx, bz) + 46, bz);
      boltGroup.rotation.y = srng() * Math.PI;
      stormLight.position.set(bx, heightAt(bx, bz) + 40, bz);
    }
    stormLight.intensity = flash * 3000;
    // Smoke haze: ease toward combat (1) or clear (0).
    haze = hazeApproach(haze, state.shadowCombat ? 1 : 0, dt > 0 && dt < 5 ? dt : 0.016);
    hazeDome.position.set(state.observerX || 0, (state.observerY || 0) + 10, state.observerZ || 0);
    hazeMat.opacity = haze * 0.30;
    // Sky/fog for the page to apply: haze greys the fog out.
    sky = s.sky;
    fog = lerpHex(s.fog, 0x555560, haze * 0.7);
  }

  function colors() {
    return { sky, fog, haze };
  }

  return { group, update, colors };
}
