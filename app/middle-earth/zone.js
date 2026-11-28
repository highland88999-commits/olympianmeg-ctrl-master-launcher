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
 *   checkpoints, target, characters, horses, hunt: { orcs, boss, heat,
 *   level, records, noteKill, noteLoud, markDead, setHeat,
 *   resetHunt }, setObserver, update, dispose, kind, sky, fog }.
 * bounds is null: the world is ENDLESS (Merlin, Nov 18, 2026) — the
 * ground streams in chunks around the observer and no clamp, wall
 * or turn-back contains the walker, the horse or the hunt. The
 * pod's worldRadius in the data stays the HOME-REGION radius
 * (texture reps, horizon, scatter, spawn field, quests).
 */
import * as ThreeJS from 'three';
import { createHeightFunction, spanSeatY } from '../star-wars/zone.js';
import {
  ME_STREAM, chunkKey, chunkBounds, chunksAround, chunkSetDiff,
  chunkHeightField,
} from '../../lib/world/streaming.js';
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
import { createDragon, stepDragon, isDragonModel } from './dragons.js';
import { placedCreatureExtras, placedCreatureLifeFor } from './operators.js';

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
  /* CGI (Merlin, Nov 26): the horizon spires read as identical
   * flat triangles on camera, so the 'spires' ring is dressed —
   * a glowing ember tip on every spire (the video's red dot,
   * made deliberate), an ember seam up every second spire's
   * flank, and a leaning secondary spike at every third spire's
   * foot, so no two silhouettes match. The tips pulse through
   * the zone's own userData.pulse traverse. */
  const spireSpots = [];
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
    if (style === 'spires') spireSpots.push({ x, z, baseY: heightAt(x, z) + h / 2 - 3, h, w, a });
  }
  ring1.instanceMatrix.needsUpdate = true;
  ring1.castShadow = false; ring1.receiveShadow = false;
  group.add(ring1);
  if (style === 'spires' && spireSpots.length) {
    const tipMat = new R.MeshBasicMaterial({ color: 0xff2a00, transparent: true, opacity: 0.9, fog: false });
    const tips = new R.InstancedMesh(new R.SphereGeometry(1, 6, 5), tipMat, spireSpots.length);
    tips.name = 'me-spire-tips';
    tips.userData.pulse = true;
    spireSpots.forEach((s, i) => {
      const tr = s.w * 0.14;
      dummy.position.set(s.x, s.baseY + s.h / 2 + 0.5, s.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(tr, tr, tr);
      dummy.updateMatrix();
      tips.setMatrixAt(i, dummy.matrix);
    });
    tips.instanceMatrix.needsUpdate = true;
    group.add(tips);
    const seamSpots = spireSpots.filter((s, i) => i % 2 === 0);
    const seams = new R.InstancedMesh(
      new R.BoxGeometry(1, 1, 1),
      new R.MeshBasicMaterial({ color: 0xff5a1a, transparent: true, opacity: 0.85, fog: false }),
      seamSpots.length,
    );
    seams.name = 'me-spire-seams';
    seamSpots.forEach((s, i) => {
      dummy.position.set(
        s.x + Math.cos(s.a) * s.w * 0.54,
        s.baseY - s.h * 0.1,
        s.z + Math.sin(s.a) * s.w * 0.54,
      );
      dummy.rotation.set(0, -s.a, 0);
      dummy.scale.set(0.8, s.h * 0.5, 0.8);
      dummy.updateMatrix();
      seams.setMatrixAt(i, dummy.matrix);
    });
    seams.instanceMatrix.needsUpdate = true;
    group.add(seams);
    const crownSpots = spireSpots.filter((s, i) => i % 3 === 0);
    const crowns = new R.InstancedMesh(new R.ConeGeometry(1, 1, 4), mat, crownSpots.length);
    crowns.name = 'me-spire-crowns';
    crownSpots.forEach((s, i) => {
      dummy.position.set(
        s.x + Math.cos(s.a) * s.w * 0.55,
        s.baseY - s.h / 2 + s.h * 0.25,
        s.z + Math.sin(s.a) * s.w * 0.55,
      );
      dummy.rotation.set(Math.sin(s.a) * 0.25, 0, Math.cos(s.a) * 0.25);
      dummy.scale.set(s.w * 0.4, s.h * 0.5, s.w * 0.4);
      dummy.updateMatrix();
      crowns.setMatrixAt(i, dummy.matrix);
    });
    crowns.instanceMatrix.needsUpdate = true;
    crowns.castShadow = false; crowns.receiveShadow = false;
    group.add(crowns);
    group.userData.spireTips = spireSpots.length;
    group.userData.spireSeams = seamSpots.length;
    group.userData.spireCrowns = crownSpots.length;
  }
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

/* ── CGI ENHANCEMENT (Merlin, Nov 26) ───────────────────────────
 * The video evidence (197 frames, Mordor only): the sky is half
 * the screen and flat brown; the ground is a featureless black
 * plane; the horizon spires are identical flat triangles. The
 * volcano is the best-looking piece — dark cone, glowing
 * lava cracks — so the enhancement extends THAT language, it
 * never invents a new one. Seeded procedural Three.js only
 * (primitives, sprites, vertex colours), deterministic: the
 * same pod def builds the same sky, ground and spires.
 *
 *   buildMESkyDome — 3-stop gradient dome (top/horizon/bottom),
 *     BackSide, fog off, drawn behind everything.
 *   buildMESkyLayers — drifting cloud sprites + (ash pods) a
 *     rising ember field; the dome's weather, animated.
 *   buildMEGroundDressing — ash pods: glowing lava-crack ribbons
 *     hugging the terrain + scorch discs + ground mist; green
 *     pods: shaded meadow discs for ground variation.
 *   buildHorizon spires — glow tips, ember seams, crowning
 *     secondary spikes (see below).
 * The dome + layers ride in the 'me-sky' group, which update()
 * keeps over the observer — the ENDLESS rule: a sky that stayed
 * at the origin would slide away as the walker roams. */

export const ME_SKY_DOME_RADIUS = 1200;
export const ME_SKY_CLOUDS_ASH = 16;
export const ME_SKY_CLOUDS_GREEN = 12;
export const ME_SKY_EMBERS = 48;
export const ME_GROUND_CRACKS = 24;
export const ME_GROUND_SCORCH = 12;
export const ME_GROUND_MIST = 10;
export const ME_GROUND_SHADE = 10;

function isAshPod(def) {
  return (def && (def.biome === 'ash' || def.id === 'mordor')) || false;
}

/* The dome's three stops for a pod: Mordor smoulders (dark top,
 * dusty-rose horizon from the pod's own sky, near-black bottom);
 * green pods grade from their own sky down to darkened ground. */
function skyStopsFor(R, def) {
  const sky = new R.Color(def.sky != null ? def.sky : 0x9fd3e8);
  const ground = new R.Color(def.ground != null ? def.ground : 0x6a7a4d);
  if (isAshPod(def)) {
    return {
      top: new R.Color(0x2e1f1a),
      horizon: sky.clone(),
      bottom: new R.Color(0x191210),
    };
  }
  return {
    top: sky.clone().lerp(new R.Color(0x0a1420), 0.55),
    horizon: sky.clone(),
    bottom: ground.clone().lerp(new R.Color(0x000000), 0.45),
  };
}

export function buildMESkyDome(R, def) {
  const stops = skyStopsFor(R, def || {});
  const geo = new R.SphereGeometry(ME_SKY_DOME_RADIUS, 28, 16);
  const pos = geo.getAttribute('position');
  const colors = new Float32Array(pos.count * 3);
  const c = new R.Color();
  for (let i = 0; i < pos.count; i++) {
    const y01 = (pos.getY(i) / ME_SKY_DOME_RADIUS + 1) / 2;
    if (y01 < 0.5) c.copy(stops.bottom).lerp(stops.horizon, y01 * 2);
    else c.copy(stops.horizon).lerp(stops.top, (y01 - 0.5) * 2);
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new R.BufferAttribute(colors, 3));
  const mat = new R.MeshBasicMaterial({
    vertexColors: true, side: R.BackSide, fog: false, depthWrite: false,
  });
  const dome = new R.Mesh(geo, mat);
  dome.name = 'me-sky-dome';
  dome.frustumCulled = false;
  dome.renderOrder = -1;
  dome.userData.skyRadius = ME_SKY_DOME_RADIUS;
  return dome;
}

export function buildMESkyLayers(R, def, T) {
  const group = new R.Group();
  group.name = 'me-sky-layers';
  const updaters = [];
  const textures = [];
  const ash = isAshPod(def);
  const seed = ((def && def.seed) >>> 0) || 1337;
  const rand = mulberry32(seed ^ 0xc10d);
  /* Drifting clouds: soft brown-grey puffs, low and brooding
   * over Mordor, higher and paler over the green pods. Each
   * sprite keeps its orbit (angle/radius/height) and drifts
   * around the pod centre — the group rides the observer, so
   * the clouds travel with the walker, never slide away. */
  let cloudTex = null;
  try {
    if (T && typeof T.cloudSprite === 'function') cloudTex = T.cloudSprite();
  } catch (e) { cloudTex = null; }
  if (cloudTex) textures.push(cloudTex);
  const cloudCount = ash ? ME_SKY_CLOUDS_ASH : ME_SKY_CLOUDS_GREEN;
  let clouds = 0;
  if (cloudTex) {
    for (let i = 0; i < cloudCount; i++) {
      const sp = new R.Sprite(new R.SpriteMaterial({
        map: cloudTex, color: ash ? 0x9a7a68 : 0xffffff,
        transparent: true, opacity: ash ? 0.5 : 0.42,
        depthWrite: false, fog: false,
      }));
      const a = rand() * Math.PI * 2;
      const r = 650 + rand() * 400;
      const y = ash ? 100 + rand() * 140 : 160 + rand() * 180;
      sp.position.set(Math.cos(a) * r, y, Math.sin(a) * r);
      sp.scale.set(200 + rand() * 220, 60 + rand() * 70, 1);
      sp.name = 'me-cloud';
      sp.userData.orbit = { a, r, y, speed: (0.004 + rand() * 0.006) * (rand() < 0.5 ? 1 : -1) };
      group.add(sp);
      clouds += 1;
    }
    updaters.push(function (t, dt) {
      for (const sp of group.children) {
        if (!sp.userData.orbit) continue;
        const o = sp.userData.orbit;
        o.a += o.speed * (dt || 0);
        sp.position.set(Math.cos(o.a) * o.r, o.y, Math.sin(o.a) * o.r);
      }
    });
  }
  /* Rising embers over Mordor: 48 additive points in a wide
   * cylinder around the walker, climbing slowly and recycling
   * at the top — the air itself smoulders. Green pods get none. */
  let embers = 0;
  if (ash) {
    const positions = new Float32Array(ME_SKY_EMBERS * 3);
    const speeds = new Float32Array(ME_SKY_EMBERS);
    for (let i = 0; i < ME_SKY_EMBERS; i++) {
      const a = rand() * Math.PI * 2;
      const r = 60 + rand() * 440;
      positions[i * 3] = Math.cos(a) * r;
      positions[i * 3 + 1] = 2 + rand() * 68;
      positions[i * 3 + 2] = Math.sin(a) * r;
      speeds[i] = 0.5 + rand() * 1.1;
    }
    const geo = new R.BufferGeometry();
    geo.setAttribute('position', new R.BufferAttribute(positions, 3));
    const pts = new R.Points(geo, new R.PointsMaterial({
      color: 0xff7a1f, size: 3, sizeAttenuation: false,
      transparent: true, opacity: 0.85, blending: R.AdditiveBlending,
      depthWrite: false, fog: false,
    }));
    pts.name = 'me-embers';
    pts.frustumCulled = false;
    pts.userData.speeds = speeds;
    group.add(pts);
    embers = ME_SKY_EMBERS;
    updaters.push(function (t, dt) {
      const p = pts.geometry.getAttribute('position');
      const step = dt || 0;
      for (let i = 0; i < ME_SKY_EMBERS; i++) {
        let y = p.getY(i) + speeds[i] * step;
        if (y > 72) y = 2;
        p.setY(i, y);
      }
      p.needsUpdate = true;
    });
  }
  group.userData.clouds = clouds;
  group.userData.embers = embers;
  return { group, updaters, textures };
}

/* A lava-crack ribbon: a flat strip of quads hugging the analytic
 * terrain (sampled every ~2 m, +0.12 m clear), glowing unlit
 * orange — the volcano's crack language, laid on the ground. */
function buildCrackRibbon(R, heightAt, rand) {
  const a = rand() * Math.PI * 2;
  const r = 25 + rand() * 275;
  const cx = Math.cos(a) * r;
  const cz = Math.sin(a) * r;
  const heading = rand() * Math.PI * 2;
  const len = 6 + rand() * 8;
  const steps = 6;
  const dx = Math.cos(heading);
  const dz = Math.sin(heading);
  const px = -dz;
  const pz = dx;
  const halfW = 0.18;
  const positions = new Float32Array((steps + 1) * 2 * 3);
  const uvs = new Float32Array((steps + 1) * 2 * 2);
  const index = [];
  for (let i = 0; i <= steps; i++) {
    const k = i / steps - 0.5;
    const x = cx + dx * k * len;
    const z = cz + dz * k * len;
    const y = heightAt(x, z) + 0.12;
    const o = i * 6;
    positions[o] = x + px * halfW; positions[o + 1] = y; positions[o + 2] = z + pz * halfW;
    positions[o + 3] = x - px * halfW; positions[o + 4] = y; positions[o + 5] = z - pz * halfW;
    const uo = i * 4;
    uvs[uo] = i / steps; uvs[uo + 1] = 0;
    uvs[uo + 2] = i / steps; uvs[uo + 3] = 1;
    if (i < steps) {
      const b = i * 2;
      index.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
    }
  }
  const geo = new R.BufferGeometry();
  geo.setAttribute('position', new R.BufferAttribute(positions, 3));
  geo.setAttribute('uv', new R.BufferAttribute(uvs, 2));
  geo.setIndex(index);
  return geo;
}

export function buildMEGroundDressing(R, def, heightAt, T) {
  const group = new R.Group();
  group.name = 'me-ground-dressing';
  const updaters = [];
  const textures = [];
  const ash = isAshPod(def);
  const seed = ((def && def.seed) >>> 0) || 1337;
  const rand = mulberry32(seed ^ 0x9a7a);
  const crackColors = [0xff5a1a, 0xffc23d, 0xff7a1f];
  const crackMats = crackColors.map((c) => new R.MeshBasicMaterial({ color: c, fog: true }));
  let cracks = 0;
  let scorch = 0;
  let shade = 0;
  let mist = 0;
  /* Flat ground discs: sample the terrain at centre + 4 edge
   * points and sit on the highest + 0.15, so a disc never sinks
   * into a bump on the 2 m-vertex ground. */
  function discY(x, z, r) {
    let y = heightAt(x, z);
    for (const [ox, oz] of [[r, 0], [-r, 0], [0, r], [0, -r]]) {
      y = Math.max(y, heightAt(x + ox, z + oz));
    }
    return y + 0.15;
  }
  function scatterPos(minR, maxR) {
    for (let tries = 0; tries < 12; tries++) {
      const a = rand() * Math.PI * 2;
      const r = minR + rand() * (maxR - minR);
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      if (Math.hypot(x - 0, z - 95) > 12) return { x, z };
    }
    return null;
  }
  if (ash) {
    for (let i = 0; i < ME_GROUND_CRACKS; i++) {
      const ribbon = new R.Mesh(buildCrackRibbon(R, heightAt, rand), crackMats[i % crackMats.length]);
      ribbon.name = 'me-crack-ribbon';
      group.add(ribbon);
      cracks += 1;
    }
    let scorchTex = null;
    try {
      if (T && typeof T.scorchTexture === 'function') scorchTex = T.scorchTexture();
    } catch (e) { scorchTex = null; }
    if (scorchTex) textures.push(scorchTex);
    for (let i = 0; i < ME_GROUND_SCORCH; i++) {
      const p = scatterPos(20, 300);
      if (!p) continue;
      const r = 3 + rand() * 4;
      const disc = new R.Mesh(
        new R.CircleGeometry(r, 20),
        new R.MeshBasicMaterial({
          map: scorchTex || undefined, color: scorchTex ? 0xffffff : 0x17130f,
          transparent: true, opacity: 0.88, depthWrite: false, fog: true,
        }),
      );
      disc.rotation.x = -Math.PI / 2;
      disc.position.set(p.x, discY(p.x, p.z, r), p.z);
      disc.renderOrder = 1;
      disc.name = 'me-scorch-disc';
      group.add(disc);
      scorch += 1;
    }
    /* Ground mist: low smoke sprites hugging the ash, drifting
     * slowly sideways — the atmosphere the video found missing. */
    let smokeTex = null;
    try {
      if (T && typeof T.smokeSprite === 'function') smokeTex = T.smokeSprite();
    } catch (e) { smokeTex = null; }
    if (smokeTex) {
      textures.push(smokeTex);
      for (let i = 0; i < ME_GROUND_MIST; i++) {
        const p = scatterPos(15, 280);
        if (!p) continue;
        const sp = new R.Sprite(new R.SpriteMaterial({
          map: smokeTex, color: 0x8a7a6a, transparent: true,
          opacity: 0.1 + rand() * 0.05, depthWrite: false, fog: false,
        }));
        sp.position.set(p.x, heightAt(p.x, p.z) + 1.5 + rand() * 1.5, p.z);
        sp.scale.set(30 + rand() * 30, 8 + rand() * 8, 1);
        sp.name = 'me-mist';
        sp.userData.drift = (rand() < 0.5 ? -1 : 1) * (0.4 + rand() * 0.6);
        sp.userData.homeX = p.x;
        group.add(sp);
        mist += 1;
      }
      updaters.push(function (t, dt) {
        for (const sp of group.children) {
          if (sp.name !== 'me-mist') continue;
          let x = sp.position.x + sp.userData.drift * (dt || 0);
          if (Math.abs(x - sp.userData.homeX) > 40) sp.userData.drift *= -1;
          sp.position.x = x;
        }
      });
    }
  } else {
    let shadeTex = null;
    try {
      if (T && typeof T.meadowShadeTexture === 'function') shadeTex = T.meadowShadeTexture();
    } catch (e) { shadeTex = null; }
    if (shadeTex) textures.push(shadeTex);
    for (let i = 0; i < ME_GROUND_SHADE; i++) {
      const p = scatterPos(20, 300);
      if (!p) continue;
      const r = 5 + rand() * 5;
      const disc = new R.Mesh(
        new R.CircleGeometry(r, 20),
        new R.MeshBasicMaterial({
          map: shadeTex || undefined, color: shadeTex ? 0xffffff : 0x5d7d3e,
          transparent: true, opacity: 0.8, depthWrite: false, fog: true,
        }),
      );
      disc.rotation.x = -Math.PI / 2;
      disc.position.set(p.x, discY(p.x, p.z, r), p.z);
      disc.renderOrder = 1;
      disc.name = 'me-shade-disc';
      group.add(disc);
      shade += 1;
    }
  }
  group.userData.cracks = cracks;
  group.userData.scorch = scorch;
  group.userData.shade = shade;
  group.userData.mist = mist;
  return { group, updaters, textures };
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

  /* THE SUN ITSELF (house treatment, Merlin Nov 17): a bright core
   * sphere + glow halo on the light's direction, static — no
   * day/night cycle here. Normalised * 300: inside the page's 2500
   * far plane, high above the terrain (y ~254), fog:false so the
   * exp fog never swallows it. The halo is a radial-gradient canvas
   * sprite (T.makeCanvasTexture, try/caught — no document, no halo,
   * the sphere still carries the sun). No moon exists in
   * Middle-earth — none to add. dispose() traverses the group and
   * frees the halo texture with its material.
   * ENDLESS (Merlin, Nov 18): the sun rides in its own group and
   * update() keeps the group over the observer — a sun that stayed
   * at the origin would slide across the sky and sink as the
   * walker roamed away from home. The DirectionalLight stays put:
   * its direction is all that shades, and it never moves. */
  /* The sky rides with the walker (ENDLESS): dome, sun, clouds
   * and embers live in 'me-sky', and update() keeps the whole
   * group over the observer — a sky that stayed at the origin
   * would slide away as the walker roams. See the CGI builders
   * above (buildMESkyDome / buildMESkyLayers). */
  const skyGroup = new R.Group();
  skyGroup.name = 'me-sky';
  group.add(skyGroup);
  const sunGroup = new R.Group();
  sunGroup.name = 'me-sun';
  skyGroup.add(sunGroup);
  const sunDir = new R.Vector3(60, 110, 35).normalize();
  const sunPos = sunDir.clone().multiplyScalar(300);
  const sunCore = new R.Mesh(
    new R.SphereGeometry(10, 20, 20),
    new R.MeshBasicMaterial({ color: 0xfff2dd, transparent: true, opacity: 0.95, fog: false, depthWrite: false })
  );
  sunCore.position.copy(sunPos);
  sunCore.name = 'me-sun-core';
  sunGroup.add(sunCore);
  let sunGlowTex = null;
  try {
    if (T && typeof T.makeCanvasTexture === 'function') {
      sunGlowTex = T.makeCanvasTexture(128, (ctx, size) => {
        const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
        g.addColorStop(0, 'rgba(255,242,221,0.9)');
        g.addColorStop(0.35, 'rgba(255,242,221,0.35)');
        g.addColorStop(1, 'rgba(255,242,221,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, size, size);
      });
    }
  } catch (e) { sunGlowTex = null; }
  if (sunGlowTex) {
    const sunGlow = new R.Sprite(new R.SpriteMaterial({
      map: sunGlowTex, color: 0xffe9b0, transparent: true, opacity: 0.55,
      depthWrite: false, fog: false,
    }));
    sunGlow.position.copy(sunPos);
    sunGlow.scale.set(90, 90, 1);
    sunGlow.name = 'me-sun-glow';
    sunGroup.add(sunGlow);
  }
  /* Mordor's sun is a sullen ember behind the smoke, not the
   * Shire's bright disc: orange core, wide ember halo. */
  if (isAshPod(def)) {
    const core = sunGroup.getObjectByName('me-sun-core');
    if (core && core.material) core.material.color.set(0xffb347);
    const glow = sunGroup.getObjectByName('me-sun-glow');
    if (glow) { glow.material.color.set(0xff8a3d); glow.scale.set(170, 170, 1); }
  }
  /* The CGI sky: gradient dome + drifting clouds (+ rising
   * embers over Mordor), riding in 'me-sky' with the sun. */
  skyGroup.add(buildMESkyDome(R, def));
  const skyLayers = buildMESkyLayers(R, def, T);
  skyGroup.add(skyLayers.group);
  for (const u of skyLayers.updaters) updaters.push(u);
  for (const t of skyLayers.textures) extraTextures.push(t);

  /* terrain — ENDLESS (Merlin, Nov 18, 2026): the ground streams
   * in chunks around the observer (lib/world/streaming.js,
   * ME_STREAM: 128 m chunks, 2 m vertices, 9x9 ring = 1152 m of
   * ground) instead of one fixed disc — the walker tracks analytic
   * heightAt exactly (page snapY), so the mesh must track it too,
   * and 2 m vertices hold the old disc's own fidelity on every pod
   * (canyon pods 0.27–0.40 m vs the disc's 0.30; the rest ≤ 0.06).
   * The home region renders exactly as the disc did (same height
   * fn, same texture, same disc-space UVs); the ground simply
   * never ends. The ring is built whole the moment the zone builds
   * and follows the observer from update(), one chunk per frame,
   * centre-first, so the walker never stands on a gap. */
  const worldRadius = def.worldRadius || 340;
  const makerName = TEX_BY_NAME[def.tex] || 'grassTexture';
  const gtex = T[makerName]();
  extraTextures.push(gtex);
  if (gtex.wrapS !== undefined) { gtex.wrapS = R.RepeatWrapping; gtex.wrapT = R.RepeatWrapping; }
  const reps = Math.max(4, Math.round(28 * worldRadius / 130));
  gtex.repeat.set(reps, reps);
  const terrainMat = new R.MeshStandardMaterial({ color: def.ground != null ? def.ground : 0x77b255, map: gtex, roughness: 1, metalness: 0 });
  const terrainGroup = new R.Group();
  terrainGroup.name = 'terrain-chunks';
  group.add(terrainGroup);
  const terrainChunks = new Map(); // key -> mesh
  let terrainKeys = [];
  let terrainQueue = [];
  function buildTerrainChunk(cx, cz) {
    const key = chunkKey(cx, cz);
    if (terrainChunks.has(key)) return;
    const f = chunkHeightField(heightAt, cx, cz, {
      chunkM: ME_STREAM.chunkM, tiles: ME_STREAM.tiles, worldRadius,
    });
    const g = new R.BufferGeometry();
    g.setAttribute('position', new R.Float32BufferAttribute(f.positions, 3));
    g.setAttribute('uv', new R.Float32BufferAttribute(f.uvs, 2));
    g.setIndex(new R.BufferAttribute(f.indices, 1));
    g.computeVertexNormals();
    const { x0, z0 } = chunkBounds(cx, cz, ME_STREAM.chunkM);
    const mesh = new R.Mesh(g, terrainMat);
    mesh.name = 'terrain-chunk';
    mesh.userData.chunk = { cx, cz };
    mesh.position.set(x0, 0, z0);
    mesh.castShadow = false; mesh.receiveShadow = false;
    terrainGroup.add(mesh);
    terrainChunks.set(key, mesh);
  }
  function dropTerrainChunk(key) {
    const mesh = terrainChunks.get(key);
    if (!mesh) return;
    terrainGroup.remove(mesh);
    if (mesh.geometry) mesh.geometry.dispose();
    terrainChunks.delete(key);
  }
  function updateStreamingTerrain() {
    const want = chunksAround(observer.x, observer.z, ME_STREAM.chunkM, ME_STREAM.radiusChunks);
    const wantKeys = want.map((c) => c.key);
    const diff = chunkSetDiff(terrainKeys, wantKeys);
    for (const key of diff.drop) dropTerrainChunk(key);
    // Centre-first load queue: nearest ground first. A stale queued
    // chunk the ring no longer wants is dropped, never built.
    const wantByKey = new Map(want.map((c) => [c.key, c]));
    terrainQueue = diff.load.map((key) => wantByKey.get(key)).filter(Boolean)
      .concat(terrainQueue.filter((c) => wantByKey.has(c.key)));
    terrainKeys = wantKeys;
    let built = 0;
    while (terrainQueue.length && built < ME_STREAM.perFrame) {
      const c = terrainQueue.shift();
      buildTerrainChunk(c.cx, c.cz);
      built++;
    }
  }
  // The home ring exists the moment the zone builds — the page
  // renders from the first frame, and the tests sample it.
  {
    const want = chunksAround(observer.x, observer.z, ME_STREAM.chunkM, ME_STREAM.radiusChunks);
    for (const c of want) buildTerrainChunk(c.cx, c.cz);
    terrainKeys = want.map((c) => c.key);
  }
  const horizonGroup = buildHorizon(R, def, heightAt);
  group.add(horizonGroup);
  /* Ground dressing (CGI, Merlin Nov 26): lava-crack ribbons,
   * scorch discs and ground mist on the ash pods, shaded meadow
   * discs elsewhere — the plain dark ground, broken up. */
  const groundDressing = buildMEGroundDressing(R, def, heightAt, T);
  group.add(groundDressing.group);
  for (const u of groundDressing.updaters) updaters.push(u);
  for (const t of groundDressing.textures) extraTextures.push(t);

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
  /* DRAGONS (Merlin, Nov 26): dragon-class placed creatures get
   * a LIVE record (createDragon) + their figure handle, so the
   * update loop can step their hunt, move them, and fall/fade
   * them on death. Every other placed creature keeps the static
   * figure + updater below. A dragon's collider MOVES with it
   * (its entry keeps the collider object); its figure is rebuilt
   * on respawn from the stored figDef. */
  const dragonEntries = [];
  function registerDragon(cd, fig, col) {
    const dragon = createDragon({
      id: cd.id || cd.model, kind: cd.model,
      x: cd.at ? cd.at[0] : cd.x, z: cd.at ? cd.at[1] : cd.z,
      faceYaw: cd.faceYaw || 0,
    });
    dragon.pod = def.id;
    dragon.name = cd.name || dragon.name;
    const figDef = {
      id: cd.id || cd.model, model: cd.model, name: cd.name || '',
      at: [dragon.home.x, dragon.home.z], height: cd.height || dragon.stats.height,
      creature: true, lifeLine: placedCreatureLifeFor(cd).line,
    };
    dragonEntries.push({ dragon, fig, figDef, collider: col });
    return dragon;
  }
  /* HORSES RIDEABLE (Merlin, Nov 15 ~00:57): the page needs the
   * horse FIGURE groups (not just the plain {id,name,x,z} in
   * `characters`) so it can mount the rider on the saddle and
   * move the horse with the rider. A handle carries the live
   * position + yaw, the figure group, and the collider object
   * itself (the same object in `colliders`, so the page can
   * exclude it while mounted and move it with the horse). */
  const horses = [];
  if (Array.isArray(def.characters)) {
    for (const cd of def.characters) {
      if (!cd || !Array.isArray(cd.at)) continue;
      if (options.playerKey && cd.model === options.playerKey) continue;
      try {
        /* Placed creatures carry their life line on the tag's
         * second line (characters.js) — static, because they
         * never die and never hunt. Heroes and folk keep the
         * single-line tag. DRAGONS are the exception (Merlin,
         * Nov 26): their tag line is the hunt line ("Hunts ·
         * 400 HP · drops Dragon Scales or Fire Orbs") and the
         * figure is driven by the dragon tick, not this updater. */
        const figDef = cd.creature
          ? { ...cd, lifeLine: placedCreatureLifeFor(cd).line }
          : cd;
        const fig = buildFigure(R, figDef, heightAt);
        group.add(fig.group);
        const col = { x: cd.at[0], z: cd.at[1], r: cd.creature ? Math.max(0.8, cd.height * 0.3) : 0.45 };
        colliders.push(col);
        characters.push({ id: cd.id || cd.model, name: cd.name || '', x: cd.at[0], z: cd.at[1] });
        if (cd.creature && isDragonModel(cd.model)) {
          registerDragon(cd, fig, col);
        } else if (cd.model === 'horse') {
          const horse = {
            id: cd.id || 'horse', model: 'horse', name: cd.name || '',
            x: cd.at[0], z: cd.at[1], height: cd.height || 2.2,
            faceYaw: cd.faceYaw || 0, yaw: cd.faceYaw || 0,
            group: fig.group, figure: fig, collider: col,
          };
          horses.push(horse);
          updaters.push(function (t, dt) { fig.update(t, dt, Math.hypot(observer.x - horse.x, observer.z - horse.z)); });
        } else {
          const cx = cd.at[0], cz = cd.at[1];
          updaters.push(function (t, dt) { fig.update(t, dt, Math.hypot(observer.x - cx, observer.z - cz)); });
        }
        disposers.push(function () { fig.dispose(); });
      } catch (e) { /* a bad figure def never kills the zone */ }
    }
  }

  /* Operator extras — the population rule (operators.js):
   * a deterministic second copy of every placed creature,
   * mirrored across the pod centre ≥ 100 m from the first,
   * built exactly like a first (figure + collider + character
   * entry + updater/disposer, life line on its tag). Creatures
   * only, never heroes — the twin rule cannot collide — and
   * Saruman / orcs are untouched (singleton by design / the
   * blanket field already meets the rule). Runs before scatter,
   * so the extras' colliders join scatter's avoid list. */
  for (const ex of placedCreatureExtras(def.id)) {
    try {
      const fig = buildFigure(R, {
        id: ex.id, model: ex.model, name: ex.name, at: [ex.x, ex.z],
        height: ex.height, creature: true, lifeLine: placedCreatureLifeFor(ex).line,
      }, heightAt);
      group.add(fig.group);
      const col = { x: ex.x, z: ex.z, r: Math.max(0.8, ex.height * 0.3) };
      colliders.push(col);
      characters.push({ id: ex.id, name: ex.name, x: ex.x, z: ex.z, operatorExtra: true });
      if (isDragonModel(ex.model)) {
        registerDragon({ ...ex, at: [ex.x, ex.z] }, fig, col);
      } else if (ex.model === 'horse') {
        const horse = {
          id: ex.id, model: 'horse', name: ex.name,
          x: ex.x, z: ex.z, height: ex.height || 2.2,
          faceYaw: 0, yaw: 0,
          group: fig.group, figure: fig, collider: col,
        };
        horses.push(horse);
        updaters.push(function (t, dt) { fig.update(t, dt, Math.hypot(observer.x - horse.x, observer.z - horse.z)); });
      } else {
        updaters.push(function (t, dt) { fig.update(t, dt, Math.hypot(observer.x - ex.x, observer.z - ex.z)); });
      }
      disposers.push(function () { fig.dispose(); });
    } catch (e) { /* a bad extra never kills the zone */ }
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
      Math.hypot(x, z) <= (def.boundsRadius || def.worldRadius || 340) - 12 && clearOfColliders(x, z, 8);
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

  /* checkpoint beams + target pillar (mission mode only)
   * rings -> beams, 2026-11-15: checkpoint rings were golden toruses;
   * they are now vertical gold beams in the target pillar's style.
   * Labels, positions, trigger radii (cp.r) and mission gating are
   * unchanged; the target's ground ring is gone (its beam stays).
   * Ground zones, 2026-11-15 (Merlin: beam WITH ground zone, never
   * a vertical ring with a ground zone): every marker also carries a
   * flat gold disc on the terrain showing its trigger radius — a
   * disc, not a torus ring (precedent: the pit marker's flat disc). */
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
    const beam = new R.Mesh(
      new R.CylinderGeometry(1.4, 2.2, 70, 12, 1, true),
      new R.MeshBasicMaterial({ color: 0xd8b25c, transparent: true, opacity: 0.26, blending: R.AdditiveBlending, side: R.DoubleSide, depthWrite: false, fog: false })
    );
    beam.position.set(cp.x, cy + 26, cp.z);
    beam.castShadow = false; beam.receiveShadow = false;
    group.add(beam);
    const zoneDisc = new R.Mesh(
      new R.CircleGeometry(cp.r || 5, 48),
      new R.MeshBasicMaterial({ color: 0xd8b25c, transparent: true, opacity: 0.16, side: R.DoubleSide, depthWrite: false, fog: false })
    );
    zoneDisc.rotation.x = -Math.PI / 2;
    zoneDisc.position.set(cp.x, heightAt(cp.x, cp.z) + 0.4, cp.z);
    zoneDisc.castShadow = false; zoneDisc.receiveShadow = false;
    group.add(zoneDisc);
    let label = null;
    if (cp.label) {
      label = makeGateLabel(cp.label);
      label.position.set(cp.x, cy + 5.5, cp.z);
      group.add(label);
    }
    const phase = cp.x * 1.7 + cp.z;
    updaters.push(function (t) {
      beam.material.opacity = 0.2 + Math.sin(t * 2.2 + phase) * 0.07;
      zoneDisc.material.opacity = 0.12 + Math.sin(t * 2.2 + phase) * 0.04;
    });
    checkpoints.push({ x: cp.x, z: cp.z, r: cp.r || 5, label: cp.label || '', zone: zoneDisc });
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
    const targetZone = new R.Mesh(
      new R.CircleGeometry(tg.r || 6, 48),
      new R.MeshBasicMaterial({ color: 0xd8b25c, transparent: true, opacity: 0.16, side: R.DoubleSide, depthWrite: false, fog: false })
    );
    targetZone.rotation.x = -Math.PI / 2;
    targetZone.position.set(tg.x, ty + 0.4, tg.z);
    targetZone.castShadow = false; targetZone.receiveShadow = false;
    group.add(targetZone);
    updaters.push(function (t) {
      pillar.material.opacity = 0.2 + Math.sin(t * 2.2) * 0.07;
      targetZone.material.opacity = 0.12 + Math.sin(t * 2.2) * 0.04;
    });
    target = { x: tg.x, z: tg.z, r: tg.r || 6, label: tg.label || '', zone: targetZone };
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
  /* NO MOTION WALL — ENDLESS (Merlin, Nov 16 ~02:42; Nov 18 ~04:47):
   * the old 295 m circle clamp walled off 45 m of visible terrain,
   * and the 340 m bound walled the world off at the disc edge. Both
   * are gone: bounds is null, so the page's clampBounds, stepWalker
   * and dismount settle are no-ops and the walker, the horse and
   * the hunt roam as far as the ground streams — which is forever.
   * def.worldRadius / def.boundsRadius stay in the DATA as the
   * HOME-REGION radius (texture reps, horizon, scatter, spawn
   * field, quests); nothing beyond it becomes a quest, a pod or a
   * claim. */
  const bounds = null;

  function update(t, dt) {
    clock += dt;
    /* ENDLESS: the sky stays over the observer and the ground
     * streams under them — the two things that must travel. */
    skyGroup.position.set(observer.x, 0, observer.z);
    updateStreamingTerrain();
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
    /* dragons: step the shared-agent hunt, move the figure with
     * it, fall + fade on death, refill on the pod clock once the
     * player is out of the area (the orc rule, mirrored). */
    for (const entry of dragonEntries) {
      const d = entry.dragon;
      const events = stepDragon(d, dt, player, huntRng, senses);
      for (const ev of events) {
        if (ev.type === 'hitPlayer' && typeof options.onPlayerHit === 'function') {
          options.onPlayerHit(ev.dmg, d);
        } else if (ev.type === 'sighted') {
          seen = true;
          noteSightHeat(huntState, player.x, player.z, huntScale);
        }
        /* windup: the figure carries no breath/bite pose yet —
         * the telegraph visual is open work (see report). */
      }
      if (d.state !== 'dead') {
        pushOutOfColliders(d, 1.0);
        if (entry.collider) { entry.collider.x = d.x; entry.collider.z = d.z; }
        const fig = entry.fig;
        if (fig) {
          fig.group.position.x = d.x;
          fig.group.position.z = d.z;
          fig.group.position.y = heightAt(d.x, d.z);
          fig.group.userData.groundY = fig.group.position.y;
          fig.group.rotation.y = d.yaw;
          fig.update(t, dt, Math.hypot(d.x - player.x, d.z - player.z));
        }
      } else if (entry.fig) {
        // dead: fall + fade, then lift the figure; the record
        // refills below on the pod clock.
        const fig = entry.fig;
        const k = Math.min(1, d.deathT / 0.7);
        fig.group.rotation.x = -k * (Math.PI / 2) * 0.92;
        const fade = d.deathT > 1.6 ? Math.max(0, 1 - (d.deathT - 1.6) / 0.9) : 1;
        fig.group.position.y = (fig.group.userData.groundY || 0) - (d.deathT > 1.6 ? (d.deathT - 1.6) * 0.35 : 0);
        fig.group.traverse((o) => {
          if (o.isMesh && o.material) { o.material.transparent = fade < 1; o.material.opacity = fade; }
        });
        if (d.deathT > 2.6) {
          group.remove(fig.group);
          entry.fig = null;
        }
      }
      if (d.state === 'dead' && d.deadAt >= 0) {
        const pd = Math.hypot(player.x - d.x, player.z - d.z);
        if (clock - d.deadAt >= respawnS && pd > RESPAWN_MIN_DIST) {
          d.hp = d.maxHp; d.state = 'roam'; d.deathT = 0; d.deadAt = -1;
          d.x = d.home.x; d.z = d.home.z; d.heading = 0; d.yaw = 0;
          try {
            const fig = buildFigure(R, entry.figDef, heightAt);
            group.add(fig.group);
            entry.fig = fig;
            if (entry.collider) { entry.collider.x = d.x; entry.collider.z = d.z; }
          } catch (e) { /* the dragon still hunts, invisible */ }
        }
      }
    }
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
    horses,
    hunt: {
      get orcs() { return orcs; },
      get dragons() { return dragonEntries.map((e) => e.dragon); },
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
      /* a dragon kill starts its respawn clock (zone clock,
       * like the orc records above); the page calls this after
       * damageDragon returns loot. */
      markDragonDead: function (dragon) {
        if (dragon) dragon.deadAt = clock;
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
    /* CGI enhancement counts (Merlin, Nov 26): what the sky,
     * ground and spire dressing actually built for this pod. */
    cgi: {
      domeRadius: ME_SKY_DOME_RADIUS,
      clouds: skyLayers.group.userData.clouds || 0,
      embers: skyLayers.group.userData.embers || 0,
      cracks: groundDressing.group.userData.cracks || 0,
      scorch: groundDressing.group.userData.scorch || 0,
      shade: groundDressing.group.userData.shade || 0,
      mist: groundDressing.group.userData.mist || 0,
      spireTips: horizonGroup.userData.spireTips || 0,
      spireSeams: horizonGroup.userData.spireSeams || 0,
      spireCrowns: horizonGroup.userData.spireCrowns || 0,
    },
    sky: skyHex,
    fog: { color: fogHex, density: fogDensity },
  };
}
