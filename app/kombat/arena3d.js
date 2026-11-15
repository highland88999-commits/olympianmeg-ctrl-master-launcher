// KOMBAT ARENA — BRAWL MODE 3D arena support.
// Extends the themed duel arenas (app/kombat/arenas.js) into true 3D play
// spaces: circular ground bounds, ring spawn placement, a boundary ring
// mesh so the playable area reads on a phone, and a dynamic camera rig.
//
// Upgraded to the world-quality standard (lib/worlds/environment.js):
// the 360° surround dressing is built from the shared kit — textured
// ground discs, instanced set pieces, window-grid facades — with a
// seeded RNG so the ring is the same on every load. The duel stage is
// built WITHOUT its duel-only foreground frame (buildArena's
// opts.foreground), and every surround piece sits outside the playable
// circle. Gameplay bounds (ARENA_BOUNDS) are unchanged.

import * as THREE from 'three';
import { buildArena, ARENA_META } from './arenas.js';
import { buildArenaDressing } from '../../lib/kombat/arena-cgi.js';
import { brawlSpawnPositions } from '../../lib/kombat/brawl-rules.js';
import {
  mulberry32, rr, wmat, canvasTexture, PAINTERS, windowsTexture,
  instanced, glowSprite,
} from '../../lib/worlds/environment.js';

// Playable circle radius per arena (index-aligned with ARENA_META).
// Rooftops are tighter; open grounds are roomier. 16 fighters need space.
export const ARENA_BOUNDS = [
  { radius: 7.5 }, // 0 Camp Crystal Lake
  { radius: 7.0 }, // 1 Mustafar
  { radius: 7.5 }, // 2 Jurassic Gate
  { radius: 6.0 }, // 3 Firehouse Roof (rooftop)
  { radius: 8.0 }, // 4 Sunset Canyon (wide open desert)
  { radius: 6.0 }, // 5 Manhattan Rooftop (rooftop)
  { radius: 7.5 }, // 6 Midgar
  { radius: 7.0 }, // 7 Hangar 51
];

export function arenaRadius(index) {
  return (ARENA_BOUNDS[index] || ARENA_BOUNDS[0]).radius;
}

/** Clamp a world XZ position inside the arena circle. Mutates and returns v. */
export function clampToArena(v, index) {
  const r = arenaRadius(index);
  const d = Math.hypot(v.x, v.z);
  if (d > r) {
    const k = r / d;
    v.x *= k;
    v.z *= k;
  }
  return v;
}

// ------------------------------------------------------------------
// 360° surround dressing — TRUE 3D presence for brawl.
//
// The duel stages in arenas.js are layered theater sets facing +Z.
// A brawl camera circles the whole play space, so the surround puts
// themed, textured, instanced structures all the way around the
// fighters, outside the playable circle. Purely visual — gameplay
// bounds (ARENA_BOUNDS) are unchanged. Every surround mesh is stamped
// userData.kind like the duel stages, so tests can prove clearance.
// ------------------------------------------------------------------

const _box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const _cone = (r, h, s = 7) => new THREE.ConeGeometry(r, h, s);
const _cyl = (rt, rb, h, s = 8) => new THREE.CylinderGeometry(rt, rb, h, s);

function _put(parent, geo, mat, x, y, z, kind = 'solid') {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.userData.kind = kind;
  parent.add(m);
  return m;
}

/** Deterministic ring scatter: returns [{x, z, a}] around the circle. */
function ringSpots(rng, count, radius, jitter = 0.35, rJitter = 0.16) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + (rng() - 0.5) * jitter;
    const r = radius * (1 - rJitter / 2 + rng() * rJitter);
    out.push({ x: Math.cos(a) * r, z: Math.sin(a) * r, a });
  }
  return out;
}

// Per-arena surround builders (index-aligned with ARENA_META).
// ground: { tex, repeat } for the big under-disc (null = skip;
// rooftops/hangar have their own floors from the duel stage).
const SURROUND = [
  { // 0 Camp Crystal Lake — pine forest closes in all around
    ground: { key: 'lake-dirt', painter: () => PAINTERS.dirt('#232d1e', '#141a10', '#46543a'), repeat: [9, 9] },
    build(g, rng) {
      const pineMat = wmat(0x14301c, { roughness: 1 });
      const trunkMat = wmat(0x2e2118, { roughness: 1 });
      const spots = ringSpots(rng, 18, 13);
      const pines = [], trunks = [];
      for (const s of spots) {
        const sc = rr(rng, 0.85, 1.5);
        pines.push({ p: [s.x, (2.6 + 1.9) * sc, s.z], ry: rng() * 3, s: sc });
        trunks.push({ p: [s.x, 1.3 * sc, s.z], ry: 0, s: sc });
      }
      g.add(instanced(_cone(1.55, 3.8, 7), pineMat, pines, 1.6));
      g.add(instanced(_cyl(0.13, 0.2, 2.6, 6), trunkMat, trunks, 0.4));
      const plankTex = canvasTexture('lake-planks', 256, 256, PAINTERS.planks('#4a3421', '#2c1e12', '#6a4c2c'), { repeat: [2, 2] });
      const wood = wmat(0xffffff, { map: plankTex, roughness: 1 });
      for (const s of ringSpots(rng, 2, 15)) {
        _put(g, _box(3.4, 2.4, 2.8), wood, s.x, 1.2, s.z).rotation.y = -s.a;
        _put(g, _cone(2.6, 1.4, 4), wmat(0x1c1410, { roughness: 1 }), s.x, 3.1, s.z).rotation.y = Math.PI / 4;
      }
    },
  },
  { // 1 Mustafar — jagged black spires ring the lava field
    ground: { key: 'mustafar-basalt', painter: () => PAINTERS.dirt('#171310', '#0c0a08', '#2c211a'), repeat: [9, 9] },
    build(g, rng) {
      const rockTex = canvasTexture('mustafar-rock', 256, 256, PAINTERS.strata(['#241a12', '#1a1410', '#2c2016', '#14100c']), { repeat: [1, 2] });
      const rock = wmat(0xffffff, { map: rockTex, roughness: 1 });
      const items = ringSpots(rng, 14, 13).map((s) => {
        const h = rr(rng, 5, 10);
        return { p: [s.x, h / 2 - 0.8, s.z], ry: rng() * 3, s: [rr(rng, 0.8, 1.4), h / 6, rr(rng, 0.8, 1.4)] };
      });
      g.add(instanced(_cone(1.9, 6, 7), rock, items, 2));
      const crustTex = canvasTexture('surround-crust', 256, 256, PAINTERS.lavacrust(), { repeat: [1, 1] });
      const lava = wmat(0xffffff, { map: crustTex, emissive: 0xff4400, emissiveMap: crustTex, emissiveIntensity: 1.9, roughness: 0.6 });
      for (const s of ringSpots(rng, 3, 11)) {
        const p = _put(g, new THREE.CircleGeometry(rr(rng, 1.3, 2), 12), lava, s.x, 0.03, s.z, 'flat');
        p.rotation.x = -Math.PI / 2;
      }
    },
  },
  { // 2 Jurassic Gate — jungle wall becomes a jungle circle
    ground: { key: 'jurassic-dirt', painter: () => PAINTERS.dirt('#26331c', '#131c0c', '#54683a'), repeat: [9, 9] },
    build(g, rng) {
      const leaf = wmat(0x1d3d17, { roughness: 1 });
      const items = ringSpots(rng, 16, 13).map((s) => {
        const h = rr(rng, 4, 8);
        return { p: [s.x, h / 2 + 0.6, s.z], ry: rng() * 3, s: [rr(rng, 0.9, 1.6), h / 5, rr(rng, 0.9, 1.6)] };
      });
      g.add(instanced(_cone(1.9, 5, 7), leaf, items, 2));
      const folTex = canvasTexture('jurassic-foliage', 512, 256, PAINTERS.foliage(), { repeat: [4, 1.5] });
      const fol = wmat(0xffffff, { map: folTex, roughness: 1 });
      for (const s of ringSpots(rng, 5, 15.5)) {
        _put(g, _box(4.5, 3, 3), fol, s.x, 1.5, s.z).rotation.y = -s.a;
      }
    },
  },
  { // 3 Firehouse Roof — 360° night skyline + the missing parapet
    ground: null,
    build(g, rng) {
      const brickTex = canvasTexture('roof-brick', 512, 256, PAINTERS.brick(), { repeat: [8, 1] });
      _put(g, _box(27, 1.15, 0.5), wmat(0xffffff, { map: brickTex, roughness: 0.92 }), 0, 0.57, 6.2, 'bounds'); // the roof edge IS the boundary
      const winA = windowsTexture('city-win-a', { cols: 7, rows: 13, lit: 0.4 });
      const winB = windowsTexture('city-win-b', { cols: 9, rows: 16, lit: 0.5, warm: '#ffe2a8' });
      const mats = [winA, winB].map((tx) => wmat(0xffffff, { map: tx, emissive: 0xffffff, emissiveMap: tx, emissiveIntensity: 0.8, roughness: 1 }));
      ringSpots(rng, 14, 21).forEach((s, i) => {
        const w = rr(rng, 2.6, 5), h = rr(rng, 8, 15);
        _put(g, _box(w, h, w), mats[i % 2], s.x, -13 + h / 2, s.z, 'fx');
      });
    },
  },
  { // 4 Sunset Canyon — mesas ring the desert floor
    ground: { key: 'canyon-sand', painter: () => PAINTERS.sand(), repeat: [10, 10] },
    build(g, rng) {
      const strataTex = canvasTexture('canyon-strata', 256, 256, PAINTERS.strata(), { repeat: [2, 1] });
      const mesa = wmat(0xffffff, { map: strataTex, roughness: 1 });
      const items = ringSpots(rng, 11, 14.5).map((s) => {
        const w = rr(rng, 4, 7), h = rr(rng, 5, 9.5);
        return { p: [s.x, h / 2 - 0.3, s.z], ry: rr(rng, -0.3, 0.3), s: [w / 4, h / 4, (w * 0.8) / 4] };
      });
      g.add(instanced(_box(4, 4, 3.2), mesa, items, 4.6));
      const cactus = wmat(0x2a6a2a, { roughness: 1 });
      const citems = ringSpots(rng, 6, 10.8).map((s) => ({ p: [s.x, 1.6, s.z], ry: rng() * 3, s: rr(rng, 0.8, 1.25) }));
      g.add(instanced(_cyl(0.22, 0.26, 3.2, 8), cactus, citems, 0.4));
    },
  },
  { // 5 Manhattan Rooftop — 360° skyline + the missing parapet
    ground: null,
    build(g, rng) {
      _put(g, _box(27, 1.05, 0.45), wmat(0x1c1c22, { roughness: 0.9 }), 0, 0.52, 6.2, 'bounds'); // the roof edge IS the boundary
      const winA = windowsTexture('city-win-a', { cols: 7, rows: 13, lit: 0.4 });
      const winC = windowsTexture('city-win-c', { cols: 6, rows: 11, lit: 0.34, cool: '#a8d4ff' });
      const mats = [winA, winC].map((tx) => wmat(0xffffff, { map: tx, emissive: 0xffffff, emissiveMap: tx, emissiveIntensity: 0.85, roughness: 1 }));
      ringSpots(rng, 14, 21).forEach((s, i) => {
        const w = rr(rng, 2.6, 5), h = rr(rng, 9, 17);
        _put(g, _box(w, h, w), mats[i % 2], s.x, -13 + h / 2, s.z, 'fx');
      });
    },
  },
  { // 6 Midgar — reactor towers and neon ring the sector
    ground: { key: 'midgar-deck', painter: () => PAINTERS.deck('#2e3138', '#1d1f24', '#464a54'), repeat: [9, 9] },
    build(g, rng) {
      const panelTex = canvasTexture('midgar-panels', 256, 256, PAINTERS.panels('#3a3e48', '#26282f', '#54585f'), { repeat: [3, 2] });
      const tower = wmat(0xffffff, { map: panelTex, roughness: 0.55, metalness: 0.5 });
      const items = ringSpots(rng, 9, 14).map((s) => {
        const h = rr(rng, 9, 14);
        return { p: [s.x, h / 2, s.z], ry: rng() * 3, s: [1, h / 10, 1] };
      });
      g.add(instanced(_cyl(2.1, 2.5, 10, 12), tower, items, 2.6));
      const neonP = wmat(0xff2fd6, { emissive: 0xff2fd6, emissiveIntensity: 2.2, roughness: 0.7 });
      const neonC = wmat(0x22d3ee, { emissive: 0x22d3ee, emissiveIntensity: 2.2, roughness: 0.7 });
      ringSpots(rng, 8, 13.5).forEach((s, i) => {
        _put(g, _box(2.4, 0.18, 0.18), i % 2 ? neonP : neonC, s.x, 3.4 + (i % 3), s.z, 'fx').rotation.y = -s.a;
      });
      const glow = glowSprite(0x2bff8a, 15, 0.14);
      glow.position.set(0, 7, -13);
      g.add(glow);
    },
  },
  { // 7 Hangar 51 — close the box: side + front walls, crates
    ground: null,
    build(g, rng) {
      const wallTex = canvasTexture('hangar-wall', 512, 256, PAINTERS.panels(), { repeat: [4, 1] });
      const wall = wmat(0xffffff, { map: wallTex, roughness: 0.7, metalness: 0.3 });
      _put(g, _box(0.6, 10, 26), wall, -18.5, 5, -2, 'bounds');
      _put(g, _box(0.6, 10, 26), wall, 18.5, 5, -2, 'bounds');
      _put(g, _box(38, 10, 0.6), wall, 0, 5, 10.5, 'bounds');
      const rib = wmat(0x2a2e36, { roughness: 0.7 });
      for (let i = -4; i <= 4; i++) {
        _put(g, _box(0.5, 10, 0.7), rib, i * 4, 5, 10.3);
      }
      const crateMat = wmat(0x4a4e56, { roughness: 0.8, metalness: 0.2 });
      const items = ringSpots(rng, 7, 11).map((s) => {
        const sc = rr(rng, 0.9, 1.8);
        return { p: [s.x, sc / 2, s.z], ry: rng() * 1.2, s: sc };
      });
      g.add(instanced(_box(1, 1, 1), crateMat, items, 1.3));
    },
  },
];

/**
 * Build the themed stage plus brawl dressing: a subtle boundary ring and
 * a soft center marker. Returns { group, update, meta, radius }.
 */
export function buildBrawlArena(index) {
  const stage = buildArena(index, { foreground: false });
  const radius = arenaRadius(index);

  // boundary ring — faint glowing circle so the playable edge reads on mobile
  const ringGeo = new THREE.RingGeometry(radius - 0.12, radius + 0.12, 72);
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0xffb84d, transparent: true, opacity: 0.4, side: THREE.DoubleSide,
    depthWrite: false,
  });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.06;
  ring.userData.kind = 'flat';
  stage.group.add(ring);

  const meta = ARENA_META[index] || ARENA_META[0];

  // ---- true-3D surround: textured ground disc + 360° themed perimeter ----
  const surround = new THREE.Group();
  surround.name = 'surround';
  const cfg = SURROUND[index] || SURROUND[0];
  if (cfg.ground != null) {
    // big under-disc so no void shows past the duel stage's finite floor,
    // from any camera angle — textured to match the arena's own ground
    const tex = canvasTexture(cfg.ground.key, 512, 512, cfg.ground.painter(), { repeat: cfg.ground.repeat });
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(30, 40),
      new THREE.MeshStandardMaterial({ map: tex, roughness: 1, metalness: 0 })
    );
    disc.rotation.x = -Math.PI / 2;
    disc.position.y = -0.05;
    disc.userData.kind = 'ground';
    surround.add(disc);
  }
  cfg.build(surround, mulberry32(900 + index * 17));
  stage.group.add(surround);

  // ---- CGI upgrade (2026-11-15): fighting pit, brazier ring, embers,
  // haze, fake rim light, crowd towers — all outside the play circle,
  // zero real lights (see lib/kombat/arena-cgi.js) ----
  const dressing = buildArenaDressing(index, radius);
  stage.group.add(dressing.group);

  let t = 0;
  const update = (dt, elapsed) => {
    t += dt;
    stage.update(dt, elapsed);
    dressing.update(dt, elapsed);
    ringMat.opacity = 0.32 + Math.sin(t * 2.2) * 0.1;
  };

  return { ...stage, update, meta, radius, dressing: dressing.counts };
}

/** Spawn points for n fighters inside the arena circle. */
export function brawlSpawns(count, index, rand = Math.random) {
  return brawlSpawnPositions(count, arenaRadius(index), rand);
}

// ------------------------------------------------------------------
// Dynamic arena camera: follows the player, pulls back as the action
// spreads. Camera sits on +Z looking toward -Z, so screen-up = world -Z.
// ------------------------------------------------------------------
export function createBrawlCamera(camera) {
  const pos = new THREE.Vector3();
  const look = new THREE.Vector3();
  const tmpP = new THREE.Vector3();
  const tmpL = new THREE.Vector3();

  return {
    /**
     * @param {THREE.Vector3} playerPos — player world pos (or null if KO'd)
     * @param {THREE.Vector3[]} points — world positions of living fighters
     * @param {number} rawDt — real dt for smoothing
     */
    update(playerPos, points, rawDt) {
      // focus: blend of player and action centroid (centroid only if no player)
      tmpP.set(0, 0, 0);
      for (const p of points) tmpP.add(p);
      if (points.length > 0) tmpP.multiplyScalar(1 / points.length);

      if (playerPos) {
        tmpL.copy(playerPos).multiplyScalar(0.65).addScaledVector(tmpP, 0.35);
        // spread: farthest living fighter from the player drives pullback
        let spread = 3;
        for (const p of points) {
          const d = Math.hypot(p.x - playerPos.x, p.z - playerPos.z);
          if (d > spread) spread = d;
        }
        spread = Math.min(11, spread);
        tmpP.set(tmpL.x, 6.8 + spread * 0.55, tmpL.z + 7.2 + spread * 0.6);
        tmpL.y = 1.0;
      } else {
        // player KO'd: spectate the remaining action from a wide view
        let spread = 4;
        for (const p of points) {
          const d = Math.hypot(p.x - tmpP.x, p.z - tmpP.z);
          if (d > spread) spread = d;
        }
        spread = Math.min(11, spread);
        tmpL.copy(tmpP);
        tmpP.set(tmpL.x, 7.5 + spread * 0.6, tmpL.z + 8 + spread * 0.65);
        tmpL.y = 1.0;
      }

      const k = 1 - Math.pow(0.0005, rawDt); // smooth follow
      pos.lerp(tmpP, k);
      look.lerp(tmpL, k);
      camera.position.copy(pos);
      camera.lookAt(look);
    },
    snap(playerPos) {
      pos.set(playerPos ? playerPos.x : 0, 9, playerPos ? playerPos.z + 9.5 : 9.5);
      look.set(playerPos ? playerPos.x : 0, 1, playerPos ? playerPos.z : 0);
    },
  };
}
