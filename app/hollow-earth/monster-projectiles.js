// app/hollow-earth/monster-projectiles.js — visible monster ranged attacks.
//
// THE PROBLEM (video QA, 2026-10-26): a ranged monster's attack was
// an instant, invisible damage event out to 22 m — the hunter's
// health melted with no projectile, no telegraph, nothing to see
// or dodge. This module makes every ranged attack a REAL 3D
// OBJECT in the scene (Three.js/WebGL meshes, not DOM, not
// sprites): it flies from the monster to the hunter, and damage
// lands only when it ARRIVES. That is the one behavior change,
// and it is the point: the attack becomes readable and
// sidesteppable. Damage numbers, attack cooldowns, ranges, and
// the back-away behavior are exactly as before.
//
// SCOPE — read this before touching anything:
// - 'ranged' archetype ONLY (22 m band). Melee and short-range
//   keep instant damage + the attack lunge — at contact range
//   the monster itself is the telegraph. Environmental hazards
//   keep their 0.9 s telegraph ring + area damage, untouched.
// - "WebGL" here means the rendering engine. This does NOT bring
//   back procedural/WebGL character figures — the 2026-10-26
//   rework's GLB-only rule stands; projectiles are effects,
//   never characters. Ghorrum never gets one (non-hostile
//   watcher, no combat). Korus keeps his boss mechanics; his
//   telegraphed blasts only gain a sky-bolt visual at the
//   moment damage lands (timing unchanged).
// - No lights are added (the world light budget is 8) —
//   projectiles use unlit bright materials so they read at
//   night and at range on a phone screen.
//
// DODGE MATH (pinned by tests): flight speed 16 m/s beats the

import { getParticleTexture } from '../../lib/particles/sprites.js';
// hunter's 10 m/s walk, so running away does NOT save you —
// but a sidestep does: the hit radius at the endpoint is 1.2 m,
// and walking 1.2 m sideways takes ~0.12 s against a 0.6–1.4 s
// flight. Standing still takes exactly the old damage; a
// strafing hunter dodges most ranged attacks. That softening
// against a moving hunter is the honest price of readability,
// and it is stated in the receipt, not hidden.

export const MONSTER_PROJECTILE_SPEED = 16; // m/s — beats walk (10), dodgeable by sidestep
export const MONSTER_PROJECTILE_HIT_R = 1.2; // m from the endpoint on arrival
export const MONSTER_PROJECTILE_GRACE_R = 0.8; // m mid-flight intercept radius
export const MONSTER_PROJECTILE_MAX_LIFE = 4; // s safety cap; a shot never flies forever

// One look per element, from families.js. shape drives the mesh:
// balls arc gently (thrown), bolts/shards fly straight.
export const PROJECTILE_STYLE = {
  acid: { shape: 'ooze', color: 0x7ed321, core: 0xd4ff7a, size: 0.34, arc: 1.5, label: 'dripping ooze ball' },
  fire: { shape: 'fireball', color: 0xff6a22, core: 0xffd23f, size: 0.36, arc: 1.2, label: 'fire bomb' },
  lightning: { shape: 'bolt', color: 0xffe14d, core: 0xfff9c4, size: 0.3, arc: 0, label: 'lightning bolt' },
  poison: { shape: 'glob', color: 0xc06ae0, core: 0xe9c6ff, size: 0.34, arc: 1.5, label: 'poison glob' },
  shadow: { shape: 'smoke', color: 0x555560, core: 0xb9b9c6, size: 0.4, arc: 0, label: 'smoke bolt' },
  sand: { shape: 'sand', color: 0xe8c87a, core: 0xf5e6b8, size: 0.38, arc: 1.0, label: 'sand burst' },
  frost: { shape: 'shard', color: 0x9fd8e8, core: 0xe8fbff, size: 0.42, arc: 0, label: 'ice shard' },
};

export function projectileStyleFor(element) {
  return PROJECTILE_STYLE[element] || PROJECTILE_STYLE.shadow;
}

// WS6 (2026-11-16): every projectile wears its element's sprite
// as an additive halo — the geometry body stays (colour/shape
// only), the sprite is glow, not a replacement. Kind map:
// acid bubble, fire ember, lightning spark, poison wisp, shadow
// mist, sand grain, frost flake. Unknown elements fall back to
// 'glow' (the sprites.js contract); a null texture (SSR / no
// document) means NO sprite — the caller keeps the plain mesh.
export const PROJECTILE_SPRITE_KIND = {
  acid: 'bubble', fire: 'ember', lightning: 'spark', poison: 'wisp',
  shadow: 'mist', sand: 'grain', frost: 'flake',
};

export function projectileSpriteKindFor(element) {
  return PROJECTILE_SPRITE_KIND[element] || 'glow';
}

export function projectileFlightTime(dist, speed = MONSTER_PROJECTILE_SPEED) {
  return Math.max(0, dist) / speed;
}

// Flight path: straight line plus a gentle thrown arc for balls
// (parabola peaking at mid-flight). t in [0, 1].
export function projectilePath(from, to, arc, t) {
  const x = from.x + (to.x - from.x) * t;
  const z = from.z + (to.z - from.z) * t;
  const y = from.y + (to.y - from.y) * t + arc * 4 * t * (1 - t);
  return { x, y, z };
}

// Flight path on a SPHERE (Nov 16 inner sphere): the same
// straight lerp, but the thrown arc lifts along the RADIAL
// (toward the core), not world +Y — a world-Y arc on the far
// side would throw the ball sideways through the shell. The
// radial direction at the flight point is -normalize(point),
// the point being measured from the sphere centre. Pure.
export function projectilePathSphere(from, to, arc, t) {
  const x = from.x + (to.x - from.x) * t;
  const y = from.y + (to.y - from.y) * t;
  const z = from.z + (to.z - from.z) * t;
  const lift = arc * 4 * t * (1 - t);
  if (!lift) return { x, y, z };
  const len = Math.hypot(x, y, z) || 1;
  return { x: x - (x / len) * lift, y: y - (y / len) * lift, z: z - (z / len) * lift };
}

export function createMonsterProjectiles(R, group, opts = {}) {
  const onArrive = opts.onArrive || (() => {});
  const groundHeight = opts.groundHeight || (() => 0);
  // SPHERE PROJECTION (Nov 16 inner sphere): with
  // opts.groundPoint/groundUp the flight path arcs radially,
  // sky-bolts stand on the local up, and the player point is
  // the real 3D chest. Without them every behaviour is the
  // flat one, so the projectile tests keep passing untouched.
  const groundPoint = opts.groundPoint || null;
  const groundUp = opts.groundUp || null;
  const shots = [];
  const puffs = [];
  const skyBolts = [];

  function basic(color, opacity = 1) {
    return new R.MeshBasicMaterial({ color, fog: false, transparent: opacity < 1, opacity });
  }

  // Additive sprite halo for a style: the style's element kind
  // tinted the style's colour, or null when no texture exists
  // (SSR — the caller keeps the plain mesh, never a crash).
  function spriteFor(style) {
    const tex = getParticleTexture(projectileSpriteKindFor(style && style.element));
    if (!tex) return null;
    return new R.Sprite(new R.SpriteMaterial({
      map: tex, color: style.color, transparent: true, opacity: 0.85,
      blending: R.AdditiveBlending, depthWrite: false,
    }));
  }

  // Thin box from point a to point b (for jagged bolts).
  function tubeBetween(a, b, thickness, material) {
    const dir = new R.Vector3().subVectors(b, a);
    const len = dir.length() || 0.001;
    const mesh = new R.Mesh(new R.BoxGeometry(thickness, thickness, len), material);
    mesh.position.copy(a).addScaledVector(dir, 0.5);
    mesh.quaternion.setFromUnitVectors(new R.Vector3(0, 0, 1), dir.clone().normalize());
    return mesh;
  }

  // Jagged bolt along +Z, zigzag in X/Y, bright core down the middle.
  function buildBoltMesh(style, length) {
    const g = new R.Group();
    const mat = basic(style.color, 0.95);
    const coreMat = basic(style.core);
    const pts = [];
    const segs = 5;
    for (let i = 0; i <= segs; i++) {
      const z = (i / segs) * length;
      const edge = i === 0 || i === segs;
      pts.push(new R.Vector3(
        edge ? 0 : (Math.random() - 0.5) * style.size * 1.4,
        edge ? 0 : (Math.random() - 0.5) * style.size * 1.4,
        z,
      ));
    }
    for (let i = 0; i < segs; i++) g.add(tubeBetween(pts[i], pts[i + 1], style.size * 0.3, mat));
    const core = new R.Mesh(new R.BoxGeometry(style.size * 0.12, style.size * 0.12, length), coreMat);
    core.position.z = length / 2;
    g.add(core);
    return g;
  }

  function buildBallMesh(style) {
    const g = new R.Group();
    const outer = new R.Mesh(new R.SphereGeometry(style.size, 12, 10), basic(style.color, 0.9));
    const core = new R.Mesh(new R.SphereGeometry(style.size * 0.55, 10, 8), basic(style.core));
    g.add(outer, core);
    return g;
  }

  function buildShardMesh(style) {
    const geo = new R.OctahedronGeometry(style.size, 0);
    geo.scale(1, 1, 2.4); // stretched along +Z, the flight axis
    return new R.Mesh(geo, basic(style.color, 0.95));
  }

  function buildSmokeMesh(style) {
    const geo = new R.SphereGeometry(style.size, 10, 8);
    geo.scale(1, 1, 2.6); // stretched along +Z
    return new R.Mesh(geo, basic(style.color, 0.75));
  }

  function buildSandMesh(style) {
    const g = new R.Group();
    const mat = basic(style.color, 0.9);
    const coreMat = basic(style.core);
    for (let i = 0; i < 5; i++) {
      const s = new R.Mesh(new R.SphereGeometry(style.size * 0.42, 8, 6), i === 0 ? coreMat : mat);
      const a = (i / 5) * Math.PI * 2;
      s.position.set(Math.cos(a) * style.size * 0.55, Math.sin(a) * style.size * 0.55, (i - 2) * style.size * 0.4);
      g.add(s);
    }
    return g;
  }

  function buildMesh(style) {
    switch (style.shape) {
      case 'bolt': return buildBoltMesh(style, style.size * 3);
      case 'shard': return buildShardMesh(style);
      case 'smoke': return buildSmokeMesh(style);
      case 'sand': return buildSandMesh(style);
      default: return buildBallMesh(style); // ooze, fireball, glob
    }
  }

  function spawn({ from, to, element, dmg, fromId }) {
    const style = projectileStyleFor(element);
    const mesh = buildMesh(style);
    // WS6 halo: the sprite rides ON the body (a child, so it
    // follows the flight and the velocity quaternion) — mid-bolt
    // for elongated shapes, centred for balls/shards.
    const halo = spriteFor({ ...style, element });
    if (halo) {
      halo.scale.set(style.size * 4, style.size * 4, 1);
      if (style.shape === 'bolt') halo.position.z = style.size * 1.5;
      mesh.add(halo);
    }
    mesh.position.set(from.x, from.y, from.z);
    group.add(mesh);
    const dist = Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z) || 0.001;
    shots.push({
      mesh, style,
      from: { ...from }, to: { ...to },
      element, dmg, fromId,
      t: 0, dur: dist / MONSTER_PROJECTILE_SPEED, trailT: 0,
    });
  }

  function spawnBurst(x, y, z, style, big) {
    for (let i = 0; i < (big ? 7 : 4); i++) {
      // WS6: bursts wear the element sprite when a texture
      // exists; plain spheres are the null-texture fallback.
      // `base` is the puff's rest scale — the update loop grows
      // from it, so a sprite (rest 0.6/0.36) and a mesh (rest 1)
      // fade identically.
      const halo = spriteFor(style);
      let s;
      let base = 1;
      if (halo) {
        base = big ? 0.6 : 0.36;
        halo.scale.set(base, base, 1);
        halo.material.opacity = 0.95;
        s = halo;
      } else {
        s = new R.Mesh(
          new R.SphereGeometry(big ? 0.3 : 0.18, 8, 6),
          basic(style.color, 0.95),
        );
      }
      s.position.set(
        x + (Math.random() - 0.5) * 0.9,
        y + (Math.random() - 0.5) * 0.9,
        z + (Math.random() - 0.5) * 0.9,
      );
      group.add(s);
      puffs.push({ mesh: s, life: 0.35, maxLife: 0.35, grow: big ? 2.0 : 1.3, base });
    }
  }

  function spawnTrailPuff(pos, style) {
    if (puffs.length > 120) return; // perf guard: trails never pile up
    // WS6: trail puffs wear the element sprite, same fallback.
    const halo = spriteFor(style);
    let s;
    let base = 1;
    if (halo) {
      base = 0.24;
      halo.scale.set(base, base, 1);
      halo.material.opacity = 0.7;
      s = halo;
    } else {
      s = new R.Mesh(new R.SphereGeometry(0.12, 6, 5), basic(style.color, 0.7));
    }
    s.position.set(pos.x, pos.y, pos.z);
    group.add(s);
    puffs.push({ mesh: s, life: 0.4, maxLife: 0.4, grow: 1.0, base });
  }

  // Korus sky-bolt: a vertical jagged bolt from the sky to a blast
  // point, purely visual — damage timing is unchanged (the bolt
  // coincides with the damage that was already landing). On the
  // sphere the bolt is built in LOCAL space (0..14 m along the
  // local up) and the group stands on the ground point with its
  // +Y on the local up — a world-Y bolt on the far side would
  // lie flat along the shell instead of striking it.
  function skyBolt({ x, z, groundY, color }) {
    const g = new R.Group();
    const mat = basic(color, 0.95);
    const segs = 4;
    const pts = [];
    if (groundPoint) {
      const gp = groundPoint(x, z, 0);
      const u = groundUp(x, z);
      const ul = Math.hypot(u.x, u.y, u.z) || 1;
      g.position.set(gp.x, gp.y, gp.z);
      g.quaternion.setFromUnitVectors(
        new R.Vector3(0, 1, 0),
        new R.Vector3(u.x / ul, u.y / ul, u.z / ul),
      );
      for (let i = 0; i <= segs; i++) {
        const y = 14 - (14 * i) / segs;
        const edge = i === 0 || i === segs;
        pts.push(new R.Vector3(
          edge ? 0 : (Math.random() - 0.5) * 1.2,
          y,
          edge ? 0 : (Math.random() - 0.5) * 1.2,
        ));
      }
    } else {
      const top = groundY + 14;
      for (let i = 0; i <= segs; i++) {
        const y = top - ((top - groundY) * i) / segs;
        const edge = i === 0 || i === segs;
        pts.push(new R.Vector3(
          edge ? 0 : (Math.random() - 0.5) * 1.2,
          y,
          edge ? 0 : (Math.random() - 0.5) * 1.2,
        ));
      }
      g.position.set(x, 0, z);
    }
    for (let i = 0; i < segs; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      const dir = new R.Vector3().subVectors(b, a);
      const len = dir.length() || 0.001;
      const seg = new R.Mesh(new R.BoxGeometry(0.22, len, 0.22), mat);
      seg.position.copy(a).addScaledVector(dir, 0.5);
      seg.quaternion.setFromUnitVectors(new R.Vector3(0, 1, 0), dir.clone().normalize());
      g.add(seg);
    }
    group.add(g);
    skyBolts.push({ group: g, life: 0.3, x, z, groundY, color });
  }

  function removeShot(i) {
    group.remove(shots[i].mesh);
    shots.splice(i, 1);
  }

  function update(dt, player) {
    // The hunter's chest in 3D: with a sphere projection it is
    // the ground point lifted 1.2 m along the local up; flat
    // callers keep the old (x, groundHeight + 1.2, z).
    const player3D = groundPoint
      ? groundPoint(player.x, player.z, 1.2)
      : { x: player.x, y: groundHeight(player.x, player.z) + 1.2, z: player.z };
    // Age puffs and sky-bolts FIRST: anything spawned by the shots
    // loop below must live its full life starting next tick, or a
    // single long frame would spawn-and-kill a trail puff at once.
    for (let i = puffs.length - 1; i >= 0; i--) {
      const p = puffs[i];
      p.life -= dt;
      if (p.life <= 0) {
        group.remove(p.mesh);
        puffs.splice(i, 1);
        continue;
      }
      p.mesh.material.opacity = Math.max(0, p.life / p.maxLife) * 0.95;
      p.mesh.scale.setScalar((p.base || 1) * (1 + (1 - p.life / p.maxLife) * (p.grow - 1)));
    }
    for (let i = skyBolts.length - 1; i >= 0; i--) {
      const b = skyBolts[i];
      b.life -= dt;
      if (b.life <= 0) {
        group.remove(b.group);
        const bp = groundPoint ? groundPoint(b.x, b.z, 0.5) : { x: b.x, y: b.groundY + 0.5, z: b.z };
        spawnBurst(bp.x, bp.y, bp.z, { color: b.color }, true);
        skyBolts.splice(i, 1);
      }
    }
    for (let i = shots.length - 1; i >= 0; i--) {
      const s = shots[i];
      s.t += dt / s.dur;
      if (s.t >= 1 || s.dur <= 0) {
        // Arrival: hit only if the hunter is still near the endpoint.
        // The distance is fully 3D (the hunter's chest point
        // against the shot's endpoint), never deck-vs-world.
        const d = Math.hypot(player3D.x - s.to.x, player3D.y - s.to.y, player3D.z - s.to.z);
        const hit = d <= MONSTER_PROJECTILE_HIT_R;
        removeShot(i);
        spawnBurst(s.to.x, s.to.y, s.to.z, s.style, hit);
        if (hit) onArrive(s.dmg, s.fromId, s.element);
        continue;
      }
      const pos = groundPoint
        ? projectilePathSphere(s.from, s.to, s.style.arc, s.t)
        : projectilePath(s.from, s.to, s.style.arc, s.t);
      const prev = s.mesh.position.clone();
      s.mesh.position.set(pos.x, pos.y, pos.z);
      // Elongated shapes point along their velocity.
      if (s.style.shape === 'bolt' || s.style.shape === 'shard' || s.style.shape === 'smoke') {
        const dir = new R.Vector3(pos.x - prev.x, pos.y - prev.y, pos.z - prev.z);
        if (dir.lengthSq() > 1e-8) s.mesh.quaternion.setFromUnitVectors(new R.Vector3(0, 0, 1), dir.normalize());
      }
      // Mid-flight intercept: walking under the shot still hurts
      // (drips/splash from an arcing ball). Horizontal distance
      // only — the arc lifts balls above chest height mid-flight,
      // and standing under one must still count as being hit.
      // On the sphere "horizontal" is the tangent plane at the
      // shot: the radial component is stripped out of the
      // hunter-to-shot vector before the distance is taken.
      let gd;
      if (groundPoint) {
        const dx = player3D.x - pos.x;
        const dy = player3D.y - pos.y;
        const dz = player3D.z - pos.z;
        const pl = Math.hypot(pos.x, pos.y, pos.z) || 1;
        const radial = (dx * -pos.x + dy * -pos.y + dz * -pos.z) / pl;
        gd = Math.sqrt(Math.max(0, dx * dx + dy * dy + dz * dz - radial * radial));
      } else {
        gd = Math.hypot(player.x - pos.x, player.z - pos.z);
      }
      if (gd <= MONSTER_PROJECTILE_GRACE_R) {
        removeShot(i);
        spawnBurst(pos.x, pos.y, pos.z, s.style, true);
        onArrive(s.dmg, s.fromId, s.element);
        continue;
      }
      s.trailT += dt;
      if (s.trailT >= 0.06) {
        s.trailT = 0;
        spawnTrailPuff(pos, s.style);
      }
    }
  }

  function dispose() {
    for (const s of shots) group.remove(s.mesh);
    for (const p of puffs) group.remove(p.mesh);
    for (const b of skyBolts) group.remove(b.group);
    shots.length = 0;
    puffs.length = 0;
    skyBolts.length = 0;
  }

  return {
    spawn, skyBolt, update, dispose,
    count: () => shots.length,
  };
}
