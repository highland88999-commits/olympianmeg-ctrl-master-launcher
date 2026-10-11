// KOMBAT ARENA — BRAWL MODE 3D arena support.
// Extends the themed duel arenas (app/kombat/arenas.js) into true 3D play
// spaces: circular ground bounds, ring spawn placement, a boundary ring
// mesh so the playable area reads on a phone, and a dynamic camera rig.

import * as THREE from 'three';
import { buildArena, ARENA_META } from './arenas.js';
import { brawlSpawnPositions } from '../../lib/kombat/brawl-rules.js';

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
// The duel stages in arenas.js are 2.5D theater sets: every scenic element
// sits at -Z (behind the fight line) and the ground planes are finite. A
// brawl camera circles the whole play space, so without surround dressing
// half the view is empty void. These rings put themed 3D structures all the
// way around the fighters, outside the playable circle. Purely visual —
// gameplay bounds (ARENA_BOUNDS) are unchanged.
// ------------------------------------------------------------------

function _std(color, emissive = 0x000000, ei = 1) {
  return new THREE.MeshStandardMaterial({
    color, roughness: 0.9, metalness: 0.05,
    emissive, emissiveIntensity: ei,
  });
}

function _put(parent, geo, mat, x, y, z) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}

/** Scatter count items around a circle; fn(x, z, angle, i). */
function _ring(count, radius, fn) {
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.35;
    const r = radius * (0.92 + Math.random() * 0.16);
    fn(Math.cos(a) * r, Math.sin(a) * r, a, i);
  }
}

const _box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const _cone = (r, h, s = 7) => new THREE.ConeGeometry(r, h, s);
const _cyl = (rt, rb, h, s = 8) => new THREE.CylinderGeometry(rt, rb, h, s);

// Per-arena surround builders (index-aligned with ARENA_META).
// ground: color of the big under-disc (null = skip; rooftops/hangar have floors).
const SURROUND = [
  { // 0 Camp Crystal Lake — pine forest closes in all around
    ground: 0x0c130e,
    build(g) {
      const pine = _std(0x0e2416), trunk = _std(0x2e2118);
      _ring(14, 12.5, (x, z) => {
        const h = 4.5 + Math.random() * 2.5;
        _put(g, _cyl(0.14, 0.22, 2.4, 6), trunk, x, 1.2, z);
        _put(g, _cone(1.5, h, 7), pine, x, 2.2 + h / 2, z);
      });
      const wood = _std(0x241a12);
      _ring(2, 14, (x, z) => {
        _put(g, _box(3.4, 2.4, 2.8), wood, x, 1.2, z);
        _put(g, _cone(2.6, 1.4, 4), _std(0x1c1410), x, 3.1, z).rotation.y = Math.PI / 4;
      });
    },
  },
  { // 1 Mustafar — jagged black spires ring the lava field
    ground: 0x0f0b07,
    build(g) {
      const rock = _std(0x1a1410);
      _ring(12, 12.5, (x, z) => {
        const h = 5 + Math.random() * 5;
        _put(g, _cone(1.6 + Math.random(), h, 7), rock, x, h / 2 - 1, z);
      });
      const lava = _std(0xff5a00, 0xff4400, 2.2);
      _ring(3, 10.5, (x, z) => {
        const p = _put(g, new THREE.CircleGeometry(1.4 + Math.random(), 10), lava, x, 0.03, z);
        p.rotation.x = -Math.PI / 2;
      });
    },
  },
  { // 2 Jurassic Gate — jungle wall becomes a jungle circle
    ground: 0x111a10,
    build(g) {
      const leaf = _std(0x14280f);
      _ring(14, 12.5, (x, z) => {
        const h = 4 + Math.random() * 4;
        _put(g, _cone(1.6 + Math.random(), h, 7), leaf, x, h / 2, z);
      });
    },
  },
  { // 3 Firehouse Roof — 360° night skyline + the missing parapet
    ground: null,
    build(g) {
      _put(g, _box(26, 1.1, 0.5), _std(0x6b2a22), 0, 0.55, 6); // +Z parapet
      const city = _std(0x0c0e16);
      const win = _std(0xffd98a, 0xffc860, 1.6);
      _ring(16, 19, (x, z) => {
        const w = 2.5 + Math.random() * 2.5, h = 8 + Math.random() * 7;
        _put(g, _box(w, h, w), city, x, -12 + h / 2, z); // tops stay near/below roof
        for (let k = 0; k < 3; k++) {
          _put(g, _box(0.3, 0.3, 0.05), win,
            x + (Math.random() - 0.5) * w * 0.6, -12 + Math.random() * (h - 2), z + w / 2 + 0.03);
        }
      });
    },
  },
  { // 4 Sunset Canyon — mesas ring the desert floor
    ground: 0x7a4e28,
    build(g) {
      const mesa = _std(0x8a4a2a), top = _std(0xa85c34);
      _ring(10, 13.5, (x, z) => {
        const w = 4 + Math.random() * 3, h = 5 + Math.random() * 4;
        _put(g, _box(w, h, w * 0.8), mesa, x, h / 2, z);
        _put(g, _box(w * 1.12, h * 0.14, w * 0.9), top, x, h + h * 0.05, z);
      });
      const cactus = _std(0x2a6a2a);
      _ring(6, 10, (x, z) => {
        _put(g, _cyl(0.22, 0.26, 3.2, 8), cactus, x, 1.6, z);
      });
    },
  },
  { // 5 Manhattan Rooftop — 360° skyline + the missing parapet
    ground: null,
    build(g) {
      _put(g, _box(26, 1.0, 0.4), _std(0x1c1c22), 0, 0.5, 6); // +Z edge
      const tower = _std(0x0a0c14);
      const winA = _std(0xbfe0ff, 0x9ac8ff, 1.5);
      const winB = _std(0xffd98a, 0xffc860, 1.4);
      _ring(16, 19, (x, z) => {
        const w = 2.5 + Math.random() * 2.5, h = 9 + Math.random() * 8;
        _put(g, _box(w, h, w), tower, x, -12 + h / 2, z);
        for (let k = 0; k < 4; k++) {
          _put(g, _box(0.32, 0.32, 0.05), Math.random() < 0.6 ? winA : winB,
            x + (Math.random() - 0.5) * w * 0.6, -12 + Math.random() * (h - 2), z + w / 2 + 0.03);
        }
      });
    },
  },
  { // 6 Midgar — reactor towers and neon ring the sector
    ground: 0x0b0d12,
    build(g) {
      const tower = _std(0x2a2e38);
      const neonP = _std(0xff2fd6, 0xff2fd6, 2.2), neonC = _std(0x22d3ee, 0x22d3ee, 2.2);
      _ring(8, 13, (x, z, a, i) => {
        const h = 9 + Math.random() * 5;
        _put(g, _cyl(2.0, 2.4, h, 10), tower, x, h / 2, z);
        _put(g, _box(2.4, 0.18, 0.18), i % 2 ? neonP : neonC, x, 3.4 + (i % 3), z).rotation.y = -a;
      });
    },
  },
  { // 7 Hangar 51 — close the box: side + front walls, crates
    ground: null,
    build(g) {
      const wall = _std(0x3a3e46);
      _put(g, _box(0.6, 9, 24), wall, -18, 4.5, -2);
      _put(g, _box(0.6, 9, 24), wall, 18, 4.5, -2);
      _put(g, _box(36, 9, 0.6), wall, 0, 4.5, 9);
      for (let i = -4; i <= 4; i++) {
        _put(g, _box(0.5, 9, 0.7), _std(0x2a2e36), i * 4, 4.5, 8.9);
      }
      const crate = _std(0x4a4e56);
      _ring(6, 10.5, (x, z) => {
        const s = 1 + Math.random();
        _put(g, _box(s, s, s), crate, x, s / 2, z).rotation.y = Math.random() * 1.2;
      });
    },
  },
];

/**
 * Build the themed stage plus brawl dressing: a subtle boundary ring and a
 * soft center marker. Returns { group, update, meta, radius }.
 */
export function buildBrawlArena(index) {
  const stage = buildArena(index);
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
  stage.group.add(ring);

  const meta = ARENA_META[index] || ARENA_META[0];

  // ---- true-3D surround: ground disc + 360° themed perimeter ----
  const surround = new THREE.Group();
  const cfg = SURROUND[index] || SURROUND[0];
  if (cfg.ground != null) {
    // big under-disc so no void shows past the duel stage's finite floor,
    // from any camera angle
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(30, 40),
      new THREE.MeshStandardMaterial({ color: cfg.ground, roughness: 1, metalness: 0 })
    );
    disc.rotation.x = -Math.PI / 2;
    disc.position.y = -0.05;
    surround.add(disc);
  }
  cfg.build(surround);
  stage.group.add(surround);

  let t = 0;
  const update = (dt, elapsed) => {
    t += dt;
    stage.update(dt, elapsed);
    ringMat.opacity = 0.32 + Math.sin(t * 2.2) * 0.1;
  };

  return { ...stage, update, meta, radius };
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
