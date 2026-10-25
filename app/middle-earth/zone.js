/*
 * MIDDLE-EARTH — pod zone builder (the expansive template).
 *
 * buildZone(THREE, podDef, T, opts) builds ONE pod on the shared
 * ever-expanding template the Star Wars saga proved:
 *
 *   - terrain from the PURE height function imported from the saga
 *     engine (../star-wars/zone.js createHeightFunction — seeded
 *     fbm + optional carved canyon), shared verbatim by the mesh
 *     and the returned groundHeight, so what you see is exactly
 *     what you walk on. The mesh builds at the saga's density law
 *     (rings/sectors scale with radius, canyon and relief), which
 *     is what holds rendered-vs-analytic deviation inside 0.2 m
 *     with the walker's snapY ground pin (house QA law).
 *   - landmarks seated by spanSeatY (footprint-ring minimum minus
 *     a footing sink — nothing hovers), with registry GLB swaps,
 *     and colliders that cover the visual hulls.
 *   - seeded instanced scatter, collider-aware, kept clear of
 *     every mission's gates in every mode.
 *   - two horizon silhouette rings in the pod's style.
 *   - placed figures (characters.js) with the shared label law.
 *   - THE HUNT (orcs.js + hunt.js): a BLANKET spawn field — camps
 *     and rovers seeded across the whole disc, not a few bands —
 *     with timed respawns and proximity streaming: records are
 *     cheap data, only orcs inside the working radius get a state
 *     and a figure, so blanket coverage costs a phone nothing.
 *     The zone steps their AI against the observer position the
 *     page feeds in, pushes them out of colliders, and reports
 *     events through opts (onPlayerHit / onOrcKilled). The page
 *     strikes back through the returned hunt handle, and the
 *     hunt meter (hunt.js) dispatches hunting parties to the
 *     player's last known position when the meter runs hot.
 *   - THE BOSS (boss.js): in Rohan only, Saruman waits at Orthanc.
 *     opts.gateOpen decides dormant vs ready at build; his events
 *     flow through opts.onBossEvent.
 *
 * opts: { mission?, freeRoam?, gateOpen?, playerKey?,
 *         playerQuiet?, initialHeat?,
 *         onPlayerHit(dmg), onOrcKilled(orc, loot), onBossEvent(ev) }
 * Returns { group, colliders, spawn, bounds, groundHeight,
 *   checkpoints, target, characters, hunt: { orcs, boss, heat,
 *   level, records, noteKill, noteLoud, markDead, setHeat,
 *   resetHunt }, setObserver, update, dispose, kind, sky, fog }.
 */
import * as ThreeJS from 'three';
import { createHeightFunction, spanSeatY } from '../star-wars/zone.js';
import { buildLandmark, buildAmbient, GLB_MODELS, attachGlbModel } from './landmarks.js';
import { buildFigure } from './characters.js';
import {
  mulberry32, createOrc, stepOrc, buildOrcFigure, spawnField,
  hearNoise, raiseAlarm, ACTIVATE_R, DEACTIVATE_R, RESPAWN_MIN_DIST, POD_SPAWN,
} from './orcs.js';
import {
  createHunt, stepHunt, noteKillHeat, noteSightHeat, noteAlarmHeat,
  noteLoudHeat, heatLevel, losClear,
} from './hunt.js';
import { createSaruman, stepBoss, buildSarumanFigure, BOSS_POS } from './boss.js';

function R3(THREE) { return THREE || ThreeJS; }

const TEX_BY_NAME = {
  grass: 'grassTexture', forest: 'forestFloorTexture', stone: 'stoneTexture',
  ash: 'ashTexture', rock: 'rockTexture', marble: 'marbleTexture',
};

/* ---- ME scatter kinds: instanced parts + collider law, the saga
 * shape. Trunks/rocks/columns are solid; soft dressing walks
 * through. Collider radii were fitted to the part geometry (the
 * podracer lesson: a collider must cover the visual hull). ---- */
const SCATTER_KINDS = {
  'oak-tree': {
    collider: (s) => (s >= 1.2 ? s * 0.55 : 0),
    parts: [
      { geo: (R) => new R.CylinderGeometry(0.3, 0.55, 5.5, 6), color: 0x6b4a2f,
        at: (s) => ({ y: 2.7 * s, sx: s, sy: s, sz: s }) },
      { geo: (R) => new R.SphereGeometry(3, 8, 6), color: 0x4c8a3f,
        at: (s) => ({ y: 7.4 * s, sx: s * 1.15, sy: s * 0.85, sz: s * 1.15 }) },
    ],
  },
  'garden-tree': {
    collider: (s) => (s >= 1.2 ? s * 0.5 : 0),
    parts: [
      { geo: (R) => new R.CylinderGeometry(0.24, 0.44, 4.6, 6), color: 0x7a5a36,
        at: (s) => ({ y: 2.3 * s, sx: s, sy: s, sz: s }) },
      { geo: (R) => new R.SphereGeometry(2.5, 8, 6), color: 0x5da24a,
        at: (s) => ({ y: 5.8 * s, sx: s, sy: s * 0.9, sz: s }) },
    ],
  },
  'pine-tree': {
    collider: (s) => (s >= 1.2 ? s * 0.5 : 0),
    parts: [
      { geo: (R) => new R.CylinderGeometry(0.22, 0.4, 4, 6), color: 0x5a4630,
        at: (s) => ({ y: 2 * s, sx: s, sy: s, sz: s }) },
      { geo: (R) => new R.ConeGeometry(2.2, 6.5, 7), color: 0x2f6034,
        at: (s) => ({ y: 6.4 * s, sx: s, sy: s, sz: s }) },
      { geo: (R) => new R.ConeGeometry(1.5, 4.4, 7), color: 0x35703b,
        at: (s) => ({ y: 9.6 * s, sx: s, sy: s, sz: s }) },
    ],
  },
  'dark-pine': {
    collider: (s) => (s >= 1.2 ? s * 0.52 : 0),
    parts: [
      { geo: (R) => new R.CylinderGeometry(0.26, 0.48, 5, 6), color: 0x2e241a,
        at: (s) => ({ y: 2.5 * s, sx: s, sy: s, sz: s }) },
      { geo: (R) => new R.ConeGeometry(2.5, 8, 7), color: 0x1e3d24,
        at: (s) => ({ y: 7.6 * s, sx: s, sy: s, sz: s }) },
      { geo: (R) => new R.ConeGeometry(1.6, 5, 7), color: 0x24482a,
        at: (s) => ({ y: 11.4 * s, sx: s, sy: s, sz: s }) },
    ],
  },
  'swamp-tree': {
    collider: (s) => (s >= 1.2 ? s * 0.95 : 0),
    parts: [
      { geo: (R) => new R.CylinderGeometry(0.5, 0.95, 8, 6), color: 0x4a4238,
        at: (s, ry) => ({ y: 4 * s, sx: s, sy: s, sz: s, tilt: 0.14, tiltDir: ry }) },
      { geo: (R) => new R.SphereGeometry(2.9, 7, 5), color: 0x39543c,
        at: (s) => ({ y: 8.8 * s, sx: s * 1.25, sy: s * 0.6, sz: s * 1.25 }) },
    ],
  },
  bush: { // walk-through
    parts: [
      { geo: (R) => new R.SphereGeometry(1.05, 6, 5), color: 0x4c7a3a,
        at: (s) => ({ y: 0.5 * s, sx: s, sy: s * 0.66, sz: s }) },
    ],
  },
  undergrowth: { // walk-through
    parts: [
      { geo: (R) => new R.SphereGeometry(1.1, 6, 5), color: 0x2c5228,
        at: (s) => ({ y: 0.5 * s, sx: s, sy: s * 0.62, sz: s }) },
    ],
  },
  'grass-tuft': { // walk-through
    parts: [
      { geo: (R) => new R.ConeGeometry(0.7, 1.5, 5), color: 0x93b45e,
        at: (s) => ({ y: 0.65 * s, sx: s, sy: s, sz: s }) },
    ],
  },
  'ash-drift': { // walk-through
    parts: [
      { geo: (R) => new R.SphereGeometry(1.6, 7, 5), color: 0x6e675f,
        at: (s) => ({ y: 0.08 * s, sx: s, sy: s * 0.3, sz: s * 0.72 }) },
    ],
  },
  rock: {
    collider: (s) => (s >= 1 ? s * 1.0 : 0),
    parts: [
      { geo: (R) => new R.IcosahedronGeometry(1, 0), color: 0x7d7a72, flat: true,
        at: (s) => ({ y: s * 0.5, sx: s, sy: s * 0.78, sz: s }) },
    ],
  },
  'lava-rock': {
    collider: (s) => (s >= 1 ? s * 1.0 : 0),
    parts: [
      { geo: (R) => new R.IcosahedronGeometry(1, 0), color: 0x35302c, flat: true,
        at: (s) => ({ y: s * 0.52, sx: s, sy: s * 0.8, sz: s }) },
    ],
  },
  obsidian: {
    collider: (s) => (s >= 1.2 ? s * 0.6 : 0),
    parts: [
      { geo: (R) => new R.ConeGeometry(0.55, 3.6, 4), color: 0x17141c, flat: true,
        at: (s) => ({ y: 1.7 * s, sx: s, sy: s, sz: s }) },
    ],
  },
  'dead-tree': {
    collider: (s) => (s >= 1.2 ? s * 0.5 : 0),
    parts: [
      { geo: (R) => new R.CylinderGeometry(0.16, 0.42, 6.5, 6), color: 0x4c443c,
        at: (s, ry) => ({ y: 3.2 * s, sx: s, sy: s, sz: s, tilt: 0.1, tiltDir: ry }) },
      { geo: (R) => new R.CylinderGeometry(0.07, 0.14, 2.6, 5), color: 0x4c443c,
        at: (s, ry) => ({ y: 6.4 * s, sx: s, sy: s, sz: s, tilt: 0.7, tiltDir: ry + 0.8 }) },
    ],
  },
  'white-column': {
    collider: (s) => s * 0.62,
    parts: [
      { geo: (R) => new R.CylinderGeometry(0.5, 0.62, 6.5, 8), color: 0xe8e2d2,
        at: (s) => ({ y: 3.25 * s, sx: s, sy: s, sz: s }) },
      { geo: (R) => new R.BoxGeometry(1.5, 0.5, 1.5), color: 0xd8d2c2,
        at: (s) => ({ y: 6.7 * s, sx: s, sy: s, sz: s }) },
    ],
  },
};

function buildWorldScatter(R, def, T, heightAt, colliders, avoid) {
  const group = new R.Group();
  const rand = mulberry32((def.seed >>> 0) ^ 0x5ca7);
  const dummy = new R.Object3D();
  const heightFn = createHeightFunction(def);
  for (const entry of def.scatter || []) {
    const kind = SCATTER_KINDS[entry.kind];
    if (!kind) continue;
    const placed = [];
    const count = entry.count | 0;
    for (let i = 0; i < count; i++) {
      let px = 0, pz = 0, ok = false;
      for (let tries = 0; tries < 12 && !ok; tries++) {
        const a = rand() * Math.PI * 2;
        const r = (entry.minR || 0) + rand() * ((entry.maxR || 280) - (entry.minR || 0));
        px = (entry.cx || 0) + Math.cos(a) * r;
        pz = (entry.cz || 0) + Math.sin(a) * r;
        ok = true;
        for (const av of avoid) {
          const dx = px - av.x, dz = pz - av.z;
          if (dx * dx + dz * dz < av.r * av.r) { ok = false; break; }
        }
        if (ok && def.canyon) {
          // keep scatter out of the carve cut
          const h = heightFn(px, pz);
          if (h < -1.2) ok = false;
        }
      }
      if (!ok) continue;
      const s = (entry.size ? entry.size[0] : 1) + rand() * ((entry.size ? entry.size[1] - entry.size[0] : 0) || 0);
      placed.push({ x: px, z: pz, s, ry: rand() * Math.PI * 2 });
    }
    for (const part of kind.parts) {
      const matOpts = { color: entry.tint != null ? entry.tint : part.color, roughness: 0.95, flatShading: !!part.flat };
      if (part.tex && T && typeof T[part.tex] === 'function') matOpts.map = T[part.tex]();
      const inst = new R.InstancedMesh(part.geo(R), new R.MeshStandardMaterial(matOpts), placed.length);
      placed.forEach((p, k) => {
        const tr = part.at(p.s, p.ry);
        dummy.position.set(p.x, heightAt(p.x, p.z) + (tr.y || 0) - 0.12, p.z);
        dummy.rotation.set(
          tr.tilt ? Math.cos(tr.tiltDir || 0) * tr.tilt : 0, p.ry,
          tr.tilt ? Math.sin(tr.tiltDir || 0) * tr.tilt : 0);
        dummy.scale.set(tr.sx || 1, tr.sy || 1, tr.sz || 1);
        dummy.updateMatrix();
        inst.setMatrixAt(k, dummy.matrix);
      });
      inst.instanceMatrix.needsUpdate = true;
      inst.castShadow = false; inst.receiveShadow = false;
      group.add(inst);
    }
    if (kind.collider) {
      for (const p of placed) {
        const spec = kind.collider(p.s);
        if (Array.isArray(spec)) {
          const cos = Math.cos(p.ry), sin = Math.sin(p.ry);
          for (const c of spec) {
            if (c[2] > 0) colliders.push({ x: p.x + (c[0] * cos + c[1] * sin), z: p.z + (-c[0] * sin + c[1] * cos), r: c[2] });
          }
        } else if (spec > 0) {
          colliders.push({ x: p.x, z: p.z, r: spec });
        }
      }
    }
  }
  return group;
}

/* Radial disc geometry (CircleGeometry has no interior verts). */
function makeDiscGeometry(R, radius, rings, segs, heightAt) {
  const positions = [], uvs = [], indices = [];
  for (let ri = 0; ri <= rings; ri++) {
    const r = (ri / rings) * radius;
    for (let si = 0; si <= segs; si++) {
      const a = (si / segs) * Math.PI * 2;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      positions.push(x, heightAt(x, z), z);
      uvs.push(x / radius * 0.5 + 0.5, z / radius * 0.5 + 0.5);
    }
  }
  const row = segs + 1;
  for (let ri = 0; ri < rings; ri++) {
    for (let si = 0; si < segs; si++) {
      const a = ri * row + si, b = a + 1, c = a + row, d = c + 1;
      indices.push(a, b, c, b, d, c);
    }
  }
  const g = new R.BufferGeometry();
  g.setAttribute('position', new R.Float32BufferAttribute(positions, 3));
  g.setAttribute('uv', new R.Float32BufferAttribute(uvs, 2));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}

/* Two silhouette rings in the pod's horizon style. */
function buildHorizon(R, def, heightAt) {
  const hz = def.horizon || {};
  const group = new R.Group();
  const radius = hz.radius || 430;
  const count = hz.count || 16;
  const style = hz.style || 'hills';
  const rand = mulberry32((def.seed >>> 0) ^ 0xa011 ^ 0x51ab);
  const mat = new R.MeshStandardMaterial({
    color: new R.Color(hz.color || 0x6da352).lerp(new R.Color(0xffffff), 0.18),
    flatShading: true, roughness: 1,
  });
  const geo = style === 'spires' ? new R.ConeGeometry(1, 1, 4)
    : style === 'trees' ? new R.ConeGeometry(1, 1, 7)
    : style === 'peaks' ? new R.ConeGeometry(1, 1, 5)
    : new R.SphereGeometry(1, 8, 6);
  const dummy = new R.Object3D();
  const ring1 = new R.InstancedMesh(geo, mat, count);
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + rand() * 0.24;
    const r = radius + (rand() - 0.5) * 70;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    let w = 34 + rand() * 46, h = 12 + rand() * 18;
    if (style === 'peaks') { w = 36 + rand() * 42; h = 24 + rand() * 30; }
    if (style === 'trees') { w = 15 + rand() * 13; h = 17 + rand() * 13; }
    if (style === 'spires') { w = 8 + rand() * 7; h = 36 + rand() * 36; }
    dummy.position.set(x, heightAt(x, z) + h / 2 - 3, z);
    dummy.rotation.set(0, rand() * Math.PI, 0);
    dummy.scale.set(w, h, w * (0.7 + rand() * 0.5));
    dummy.updateMatrix();
    ring1.setMatrixAt(i, dummy.matrix);
  }
  ring1.instanceMatrix.needsUpdate = true;
  ring1.castShadow = false; ring1.receiveShadow = false;
  group.add(ring1);
  const ring2 = new R.InstancedMesh(geo, mat, count);
  for (let i = 0; i < count; i++) {
    const a = ((i + 0.5) / count) * Math.PI * 2 + rand() * 0.2;
    const r = radius * 1.45 + (rand() - 0.5) * 80;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const w = 62 + rand() * 58, h = 9 + rand() * 11;
    dummy.position.set(x, heightAt(x, z) + h / 2 - 2.5, z);
    dummy.rotation.set(0, rand() * Math.PI, 0);
    dummy.scale.set(w, h, w * 0.8);
    dummy.updateMatrix();
    ring2.setMatrixAt(i, dummy.matrix);
  }
  ring2.instanceMatrix.needsUpdate = true;
  ring2.castShadow = false; ring2.receiveShadow = false;
  group.add(ring2);
  return group;
}

export function buildZone(THREE, podDef, T, opts) {
  const R = R3(THREE);
  const def = podDef || {};
  const options = opts || {};
  const freeRoam = !!options.freeRoam;
  const beat = freeRoam ? {} : (options.mission || (Array.isArray(def.missions) ? def.missions[0] : {}) || {});
  const seed = (def.seed >>> 0) || 1337;
  const group = new R.Group();
  const colliders = [];
  const updaters = [];
  const extraTextures = [];
  const disposers = [];
  const observer = { x: 0, z: 95 };

  const heightAt = createHeightFunction(def);

  /* atmosphere */
  const skyHex = def.sky != null ? def.sky : 0x9fd3e8;
  const fogHex = def.fog != null ? def.fog : skyHex;
  const fogDensity = def.fogDensity != null ? def.fogDensity : 0.0016;
  group.add(new R.HemisphereLight(skyHex, def.ground != null ? def.ground : 0x6a7a4d, 0.85));
  const sun = new R.DirectionalLight(0xfff2dd, 1.2);
  sun.position.set(60, 110, 35);
  group.add(sun);

  /* terrain — DENSE on purpose (the saga density law): the walker
   * tracks analytic heightAt exactly (page snapY), so the mesh
   * must track it too; this is what keeps deviation inside 0.2 m. */
  const worldRadius = def.worldRadius || 340;
  const makerName = TEX_BY_NAME[def.tex] || 'grassTexture';
  const gtex = T[makerName]();
  extraTextures.push(gtex);
  if (gtex.wrapS !== undefined) { gtex.wrapS = R.RepeatWrapping; gtex.wrapT = R.RepeatWrapping; }
  const reps = Math.max(4, Math.round(28 * worldRadius / 130));
  gtex.repeat.set(reps, reps);
  const ampFactor = 1 + Math.max(0, (def.groundAmp != null ? def.groundAmp : 2.5) - 2.5) * 0.125;
  const rings = Math.max(26, Math.round(worldRadius / 1.5 * (def.canyon ? 1.25 : 1) * ampFactor));
  const segs = Math.max(64, Math.round(worldRadius * 0.95 * (def.canyon ? 1.5 : 1) * ampFactor));
  const terrain = new R.Mesh(
    makeDiscGeometry(R, worldRadius, rings, segs, heightAt),
    new R.MeshStandardMaterial({ color: def.ground != null ? def.ground : 0x77b255, map: gtex, roughness: 1, metalness: 0 })
  );
  terrain.castShadow = false; terrain.receiveShadow = false;
  group.add(terrain);
  group.add(buildHorizon(R, def, heightAt));

  /* landmarks — span seating, GLB registry colliders + swap */
  const landmarkDefs = Array.isArray(def.landmarks) ? def.landmarks : [];
  for (const ld of landmarkDefs) {
    let built;
    try { built = buildLandmark(ld.type, R, T); } catch (e) { continue; }
    const s = ld.s || 1, ry = ld.ry || 0;
    const glb = ld.model ? GLB_MODELS[ld.model] : null;
    const localColliders = glb ? glb.colliders : built.colliders;
    let footprint = 0;
    for (const c of localColliders) {
      footprint = Math.max(footprint, (Math.hypot(c.x, c.z) + c.r) * s);
    }
    if (glb) footprint = (glb.meters / 2) * s;
    let seatY;
    if (glb) {
      seatY = spanSeatY(heightAt, ld.x || 0, ld.z || 0, Math.max(footprint, 1), { clampDrop: 3.5 }) - 0.3;
    } else if (footprint >= 6) {
      seatY = spanSeatY(heightAt, ld.x || 0, ld.z || 0, footprint * 0.75, { clampDrop: 2 }) - 0.3;
    } else {
      seatY = heightAt(ld.x || 0, ld.z || 0) - 0.12;
    }
    built.group.name = 'landmark:' + ld.type;
    built.group.position.set(ld.x || 0, seatY, ld.z || 0);
    built.group.rotation.y = ry;
    built.group.scale.setScalar(s);
    group.add(built.group);
    if (glb) { try { attachGlbModel(R, built.group, ld.model); } catch (e) { /* stand-in stays */ } }
    const cos = Math.cos(ry), sin = Math.sin(ry);
    for (const c of localColliders) {
      colliders.push({
        x: (ld.x || 0) + (c.x * cos + c.z * sin) * s,
        z: (ld.z || 0) + (-c.x * sin + c.z * cos) * s,
        r: c.r * s,
      });
    }
  }

  /* figures — dressing in every mode; body colliders join in.
   * The twin rule: when the player IS a hero (opts.playerKey),
   * that hero's NPC seat in its home pod stands empty — no
   * second wizard in the Shire. The seat's collider goes with it. */
  const characters = [];
  if (Array.isArray(def.characters)) {
    for (const cd of def.characters) {
      if (!cd || !Array.isArray(cd.at)) continue;
      if (options.playerKey && cd.model === options.playerKey) continue;
      try {
        const fig = buildFigure(R, cd, heightAt);
        group.add(fig.group);
        colliders.push({ x: cd.at[0], z: cd.at[1], r: cd.creature ? Math.max(0.8, cd.height * 0.3) : 0.45 });
        characters.push({ id: cd.id || cd.model, name: cd.name || '', x: cd.at[0], z: cd.at[1] });
        const cx = cd.at[0], cz = cd.at[1];
        updaters.push(function (t, dt) { fig.update(t, dt, Math.hypot(observer.x - cx, observer.z - cz)); });
        disposers.push(function () { fig.dispose(); });
      } catch (e) { /* a bad figure def never kills the zone */ }
    }
  }

  /* scatter — clear of EVERY mission's gates + spawn */
  if (Array.isArray(def.scatter) && def.scatter.length) {
    const avoid = [];
    for (const m of (Array.isArray(def.missions) ? def.missions : [])) {
      for (const cp of (Array.isArray(m.checkpoints) ? m.checkpoints : [])) {
        avoid.push({ x: cp.x, z: cp.z, r: (cp.r || 5) + 3 });
      }
      if (m.target) avoid.push({ x: m.target.x, z: m.target.z, r: (m.target.r || 6) + 3 });
    }
    avoid.push({ x: 0, z: 95, r: 9 });
    for (const c of colliders) avoid.push({ x: c.x, z: c.z, r: c.r + 1.5 });
    group.add(buildWorldScatter(R, def, T, heightAt, colliders, avoid));
  }

  /* ambient critters (legacy builders — sheep, deer...) */
  const ambientDefs = Array.isArray(def.ambient) ? def.ambient : [];
  const arand = mulberry32(seed ^ 0x51f7);
  function clearOfColliders(x, z, pad) {
    for (const c of colliders) {
      const dx = x - c.x, dz = z - c.z, rr = c.r + pad;
      if (dx * dx + dz * dz < rr * rr) return false;
    }
    return true;
  }
  for (const ad of ambientDefs) {
    const n = ad.count | 0;
    for (let i = 0; i < n; i++) {
      let px = 0, pz = 0, ok = false;
      for (let tries = 0; tries < 14 && !ok; tries++) {
        const a = arand() * Math.PI * 2, r = 14 + arand() * ((def.ambientRadius || 100) - 14);
        px = Math.cos(a) * r; pz = Math.sin(a) * r;
        ok = clearOfColliders(px, pz, 4);
      }
      if (!ok) continue;
      try {
        const amb = buildAmbient(ad.type, R, T);
        amb.group.position.set(px, heightAt(px, pz), pz);
        group.add(amb.group);
        updaters.push(function (t, dt) { amb.update(t, dt); });
      } catch (e) { /* unknown ambient: skip */ }
    }
  }

  /* ---------------- THE HUNT — BLANKET FIELD + STREAMING ----------------
   * Records are the whole pod's orc population (camps + rovers,
   * seeded across the disc). Only records near the observer get
   * a live orc state + figure; the rest cost nothing. A cleared
   * record refills on its pod's respawn clock once the player has
   * left the area, so the hunt never empties the world. Hunting
   * parties (hunt.js dispatches) retask live orcs — or wake the
   * nearest sleeping records — toward the last-known position;
   * tasked orcs stay live until the trail cools, however far the
   * march takes them, because a party is at most five figures. */
  const huntRng = mulberry32(seed ^ 0xbe57);
  const huntState = createHunt(options.initialHeat || 0);
  const huntScale = options.playerQuiet != null ? options.playerQuiet : 1;
  const senses = {
    losClear: (ox, oz, tx, tz) => losClear(heightAt, ox, oz, tx, tz),
  };
  let clock = 0;
  let records = [];
  let orcs = []; // LIVE orcs only (streamed in)
  let orcFigures = new Map();
  const orcGroup = new R.Group();
  orcGroup.name = 'orc-bands';
  group.add(orcGroup);
  const respawnS = def.orcs && def.orcs.respawnS ? def.orcs.respawnS : 45;
  if (def.orcs) {
    const tryPlace = (x, z) =>
      Math.hypot(x, z) <= (def.boundsRadius || 295) - 12 && clearOfColliders(x, z, 8);
    records = spawnField(seed, def.orcs, tryPlace).map((r) => ({
      ...r, alive: true, deadAt: -1,
    }));
  }
  function spawnLive(rec) {
    const orc = createOrc(rec, rec.campId);
    orc.recordId = rec.id;
    orcs.push(orc);
    try {
      const fig = buildOrcFigure(R, orc);
      fig.group.position.set(orc.x, heightAt(orc.x, orc.z), orc.z);
      fig.group.userData.groundY = heightAt(orc.x, orc.z);
      fig.group.rotation.y = orc.yaw;
      orcGroup.add(fig.group);
      orcFigures.set(orc, fig);
    } catch (e) { /* the orc still hunts, invisible */ }
    return orc;
  }
  function despawnLive(orc) {
    const fig = orcFigures.get(orc);
    if (fig) { orcGroup.remove(fig.group); orcFigures.delete(orc); }
    orcs = orcs.filter((o) => o !== orc);
  }
  function streamOrcs() {
    for (const rec of records) {
      if (!rec.alive) continue;
      const live = orcs.find((o) => o.recordId === rec.id);
      const d = Math.hypot(observer.x - rec.x, observer.z - rec.z);
      if (!live && d <= ACTIVATE_R) spawnLive(rec);
      else if (live && !live.task && d > DEACTIVATE_R) despawnLive(live);
    }
    /* respawns: a cleared record refills once its clock runs out
     * AND the player is out of the immediate area. */
    for (const rec of records) {
      if (rec.alive || rec.deadAt < 0) continue;
      const d = Math.hypot(observer.x - rec.x, observer.z - rec.z);
      if (clock - rec.deadAt >= respawnS && d > RESPAWN_MIN_DIST) {
        rec.alive = true;
        rec.deadAt = -1;
      }
    }
  }
  function resetHunt() {
    for (const fig of orcFigures.values()) orcGroup.remove(fig.group);
    orcFigures = new Map();
    orcs = [];
    for (const rec of records) { rec.alive = true; rec.deadAt = -1; }
    streamOrcs();
    return orcs;
  }
  streamOrcs();

  /* Hunting-party fulfilment: retask the nearest idle live orcs
   * first; wake sleeping records near the last-known point if the
   * party still needs bodies. Parties march — never teleport. */
  function fulfilDispatch(size, partyId, x, z) {
    const idle = orcs.filter((o) => o.state === 'idle' && !o.task)
      .sort((a, b) => Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z));
    const picked = idle.slice(0, size);
    if (picked.length < size) {
      const sleeping = records.filter((r) => r.alive && !orcs.find((o) => o.recordId === r.id))
        .sort((a, b) => Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z));
      for (const rec of sleeping.slice(0, size - picked.length)) picked.push(spawnLive(rec));
    }
    for (const o of picked) {
      o.task = { type: 'seek', x, z, phase: 'go', t: 0, partyId };
      o.state = 'idle';
    }
    return picked.length;
  }

  function pushOutOfColliders(e, radius) {
    for (const c of colliders) {
      const dx = e.x - c.x, dz = e.z - c.z;
      const rr = c.r + radius;
      const d2 = dx * dx + dz * dz;
      if (d2 < rr * rr && d2 > 1e-9) {
        const d = Math.sqrt(d2);
        e.x = c.x + (dx / d) * rr;
        e.z = c.z + (dz / d) * rr;
      }
    }
  }

  /* ---------------- THE BOSS (Rohan only) ---------------- */
  let boss = null;
  let bossFigure = null;
  let bossRings = [];
  if (def.id === 'rohan') {
    boss = createSaruman(BOSS_POS.x, BOSS_POS.z, !!options.gateOpen);
    try {
      bossFigure = buildSarumanFigure(R);
      bossFigure.group.position.set(boss.x, heightAt(boss.x, boss.z), boss.z);
      bossFigure.group.rotation.y = boss.yaw;
      group.add(bossFigure.group);
      colliders.push({ x: boss.x, z: boss.z, r: 0.8 });
    } catch (e) { bossFigure = null; }
    /* telegraph rings, pooled */
    for (let i = 0; i < 4; i++) {
      const ring = new R.Mesh(
        new R.TorusGeometry(3.2, 0.22, 8, 40),
        new R.MeshBasicMaterial({ color: 0xbfd8ff, transparent: true, opacity: 0, fog: false })
      );
      ring.rotation.x = -Math.PI / 2;
      ring.visible = false;
      group.add(ring);
      bossRings.push({ mesh: ring, t: 0, active: false });
    }
  }
  function showTelegraph(x, z) {
    const slot = bossRings.find((r) => !r.active) || bossRings[0];
    if (!slot) return;
    slot.active = true;
    slot.t = 0;
    slot.mesh.position.set(x, heightAt(x, z) + 0.35, z);
    slot.mesh.visible = true;
  }

  /* checkpoint rings + target pillar (mission mode only) */
  const checkpoints = [];
  const cpDefs = !freeRoam && Array.isArray(beat.checkpoints) ? beat.checkpoints : [];
  function makeGateLabel(text) {
    const cv = document.createElement('canvas');
    cv.width = 256; cv.height = 64;
    const ctx = cv.getContext('2d');
    if (ctx) {
      ctx.fillStyle = 'rgba(8,10,18,0.72)';
      ctx.fillRect(0, 8, 256, 48);
      ctx.strokeStyle = '#d8b25c'; ctx.lineWidth = 3;
      ctx.strokeRect(2, 10, 252, 44);
      ctx.fillStyle = '#ffe9b0';
      ctx.font = 'bold 26px Georgia, serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(String(text).slice(0, 18), 128, 33);
    }
    const tex = new R.CanvasTexture(cv);
    tex.colorSpace = R.SRGBColorSpace;
    extraTextures.push(tex);
    const sp = new R.Sprite(new R.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false }));
    sp.scale.set(14, 3.5, 1);
    return sp;
  }
  for (const cp of cpDefs) {
    const cy = heightAt(cp.x, cp.z) + 6;
    const ring = new R.Mesh(
      new R.TorusGeometry(4, 0.28, 10, 40),
      new R.MeshStandardMaterial({ color: 0xd8b25c, emissive: 0x9a7414, emissiveIntensity: 1.2, roughness: 0.4, metalness: 0.3 })
    );
    ring.position.set(cp.x, cy, cp.z);
    ring.castShadow = false; ring.receiveShadow = false;
    group.add(ring);
    let label = null;
    if (cp.label) {
      label = makeGateLabel(cp.label);
      label.position.set(cp.x, cy + 5.5, cp.z);
      group.add(label);
    }
    const phase = cp.x * 1.7 + cp.z;
    updaters.push(function (t, dt) {
      ring.rotation.y += dt * 1.2;
      ring.position.y = cy + Math.sin(t * 1.6 + phase) * 0.5;
      if (label) label.position.y = cy + 5.5 + Math.sin(t * 1.6 + phase) * 0.5;
    });
    checkpoints.push({ x: cp.x, z: cp.z, r: cp.r || 5, label: cp.label || '' });
  }
  let target = null;
  if (!freeRoam && beat.target) {
    const tg = beat.target;
    const ty = heightAt(tg.x, tg.z);
    const pillar = new R.Mesh(
      new R.CylinderGeometry(1.4, 2.2, 70, 12, 1, true),
      new R.MeshBasicMaterial({ color: 0xd8b25c, transparent: true, opacity: 0.26, blending: R.AdditiveBlending, side: R.DoubleSide, depthWrite: false, fog: false })
    );
    pillar.position.set(tg.x, ty + 32, tg.z);
    group.add(pillar);
    const gring = new R.Mesh(
      new R.TorusGeometry(tg.r || 6, 0.3, 8, 48),
      new R.MeshBasicMaterial({ color: 0xd8b25c, transparent: true, opacity: 0.7, fog: false })
    );
    gring.rotation.x = -Math.PI / 2;
    gring.position.set(tg.x, ty + 0.4, tg.z);
    group.add(gring);
    updaters.push(function (t) {
      pillar.material.opacity = 0.2 + Math.sin(t * 2.2) * 0.07;
      gring.rotation.z += 0.004;
    });
    target = { x: tg.x, z: tg.z, r: tg.r || 6, label: tg.label || '' };
  }

  /* emissive pulse (tagged accents: beacon flame, Orthanc eye...) */
  group.traverse(function (o) {
    if ((o.isMesh || o.isSprite) && o.userData && o.userData.pulse && o.material) {
      const m = o.material;
      const base = m.opacity == null ? 1 : m.opacity;
      const ph = (o.position.x * 1.3 + o.position.z) % 6.28;
      updaters.push(function (t) { m.opacity = base * (0.82 + 0.18 * Math.sin(t * 2 + ph)); });
    }
  });

  const spawn = { x: 0, z: 95, yaw: Math.PI };
  const bounds = { kind: 'circle', max: def.boundsRadius || 295 };

  function update(t, dt) {
    clock += dt;
    for (const u of updaters) u(t, dt);
    /* hunt: stream the field, then step live orcs against the
     * observer (the player). Senses get the terrain LOS check. */
    streamOrcs();
    const player = {
      x: observer.x, z: observer.z, alive: options.playerAlive !== false,
      quiet: huntScale,
    };
    let seen = false;
    const deadToRemove = [];
    for (const orc of [...orcs]) {
      const wasSwingReady = orc.swingT <= 0;
      const events = stepOrc(orc, dt, player, huntRng, senses);
      for (const ev of events) {
        if (ev.type === 'hitPlayer') {
          const fig = orcFigures.get(orc);
          if (fig && wasSwingReady) fig.noteSwing();
          if (typeof options.onPlayerHit === 'function') options.onPlayerHit(ev.dmg, orc);
        } else if (ev.type === 'windup') {
          // The blow is coming: the figure's arm rises now, the hit
          // lands one wind-up later (the AI owns that timing).
          const fig = orcFigures.get(orc);
          if (fig && fig.noteWindup) fig.noteWindup();
        } else if (ev.type === 'sighted') {
          seen = true;
          noteSightHeat(huntState, player.x, player.z, huntScale);
        }
      }
      if (orc.state === 'chase' && Math.hypot(orc.x - player.x, orc.z - player.z) <= 60) seen = true;
      if (orc.state !== 'dead') pushOutOfColliders(orc, 0.5);
      const fig = orcFigures.get(orc);
      if (fig) {
        fig.group.position.x = orc.x;
        fig.group.position.z = orc.z;
        if (orc.state !== 'dead') {
          fig.group.position.y = heightAt(orc.x, orc.z);
          fig.group.userData.groundY = fig.group.position.y;
          fig.group.rotation.y = orc.yaw;
        }
        /* the figure gets its true distance so the hunt marker
         * can hide once the orc is close enough to see */
        fig.update(t, dt, Math.hypot(orc.x - player.x, orc.z - player.z));
        if (orc.state === 'dead' && orc.deathT > 2.6) deadToRemove.push(orc);
      }
    }
    for (const orc of deadToRemove) despawnLive(orc);
    /* the meter: decay, trail cold, party dispatch */
    for (const ev of stepHunt(huntState, dt, seen)) {
      if (ev.type === 'dispatch') fulfilDispatch(ev.size, ev.partyId, ev.x, ev.z);
      if (ev.type === 'trailCold') {
        for (const o of orcs) if (o.task) o.task = null;
      }
    }
    /* boss */
    if (boss) {
      const events = stepBoss(boss, dt, player);
      for (const ev of events) {
        if (ev.type === 'telegraph') showTelegraph(ev.x, ev.z);
        if (typeof options.onBossEvent === 'function') options.onBossEvent(ev);
        if (ev.type === 'hitPlayer' && typeof options.onPlayerHit === 'function') {
          options.onPlayerHit(ev.dmg, boss);
        }
      }
      if (bossFigure) {
        bossFigure.group.rotation.y = boss.yaw;
        bossFigure.update(t, dt, boss);
      }
      for (const r of bossRings) {
        if (!r.active) continue;
        r.t += dt;
        const k = Math.min(1, r.t / 1.1);
        r.mesh.material.opacity = 0.25 + k * 0.55;
        r.mesh.scale.setScalar(0.4 + k * 0.6);
        if (r.t >= 1.35) { r.active = false; r.mesh.visible = false; }
      }
    }
  }

  function dispose() {
    for (const d of disposers) { try { d(); } catch (e) { /* noop */ } }
    group.traverse(function (o) {
      if (o.isMesh || o.isPoints || o.isSprite) {
        if (o.geometry) o.geometry.dispose();
        const mats = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
        for (const m of mats) {
          if (m.map) { try { m.map.dispose(); } catch (e) { /* noop */ } }
          try { m.dispose(); } catch (e) { /* noop */ }
        }
      }
    });
    for (const t of extraTextures) { try { t.dispose(); } catch (e) { /* noop */ } }
  }

  return {
    group,
    colliders,
    spawn,
    bounds,
    groundHeight: heightAt,
    checkpoints,
    target,
    characters,
    hunt: {
      get orcs() { return orcs; },
      boss,
      get heat() { return huntState.heat; },
      get level() { return heatLevel(huntState.heat); },
      get lastKnown() { return huntState.lastKnown; },
      get records() { return records; },
      get liveCount() { return orcs.length; },
      /* the page reports what it did so the meter, the alarm and
       * the noise all stay one system: a kill feeds heat, wakes
       * nearby orcs and starts the record's respawn clock; a
       * ranged shot feeds heat and turns hearers toward it. */
      noteKill: function (x, z) {
        noteKillHeat(huntState, x, z, huntScale);
        noteAlarmHeat(huntState, huntScale);
        raiseAlarm(orcs, x, z, 40);
      },
      noteLoud: function (x, z) {
        noteLoudHeat(huntState, huntScale);
        hearNoise(orcs, x, z, 30, senses);
      },
      markDead: function (orc) {
        const rec = records.find((r) => r.id === orc.recordId);
        if (rec) { rec.alive = false; rec.deadAt = clock; }
      },
      setHeat: function (v) { huntState.heat = Math.max(0, Math.min(100, v)); },
      resetHunt,
      figureOf: function (orc) { return orcFigures.get(orc); },
    },
    setObserver: function (x, z) { observer.x = x; observer.z = z; },
    setPlayerAlive: function (alive) { options.playerAlive = !!alive; },
    update,
    dispose,
    kind: 'walk',
    sky: skyHex,
    fog: { color: fogHex, density: fogDensity },
  };
}
