/*
 * OLYMPIAN MONSTERVERSE — world zone builder.
 *
 * buildWorld(THREE, def, T, opts) builds the ONE ever-expansive
 * world on the saga template the Star Wars/Middle-earth programs
 * proved:
 *   - terrain from the PURE height function imported from the
 *     saga engine (../star-wars/zone.js createHeightFunction),
 *     shared verbatim by the mesh and the returned groundHeight,
 *     so what you see is exactly what you walk on — with VERTEX
 *     COLOURS mixed from the biome weight field (biomes.js), so
 *     the ground itself shows the blends, never a seam. The
 *     terrain is the INNER SPHERE SHELL (lib/hollow-earth/
 *     planet.js, SPHERE_R 382 m): the flat disc's (x, z) chart
 *     maps onto the shell by surface distance, so every old
 *     coordinate keeps its meaning, the shell has no edge, and
 *     the walker comes back around. Normals point inward
 *     (toward the core-sun), the saga winding, DoubleSide.
 *   - landmarks seated by spanSeatY (footprint-ring minimum
 *     minus a footing sink — nothing hovers), colliders that
 *     cover the visual hulls (sanctuary excluded: The Haven is
 *     never a wall).
 *   - seeded scatter that only grows where its biome holds
 *     weight (> 0.35), so dressing follows the blends too.
 *   - the inverted-horizon ambient and the elemental light
 *     systems (elemental.js: sun/moon cycle, acid rivers,
 *     brimstone vents, poison veins, lightning storms, smoke
 *     haze) that make each habitat band read as its families'
 *     home — the world shipped with zero scene lights before
 *     this rework, so no band could read at all.
 *   - THE HUNT (spawns.js): a habitat-band spawn field (GLB
 *     families only — no procedural stand-ins anywhere, no
 *     record for a family with no placed GLB), with proximity
 *     streaming — records are cheap data, only monsters inside
 *     the working radius get a figure, and a figure is an empty
 *     group until its GLB loads. The zone steps their
 *     two-way-hunt AI against
 *     the observer the page feeds in (sight cone + terrain LOS,
 *     hearing, proximity, give-up, sanctuary break) and reports
 *     events through opts.
 *   - KORUS (spawns.js): dormant on his throne until the
 *     campaign gate opens (opts.gateOpen); his events flow
 *     through opts.onKorusEvent.
 *
 * opts: { gateOpen?, freeRoam?, onPlayerHit(dmg, from, archetype, element),
 *         onMonsterKilled({ victim, killer, cause }), onHazard(hazard),
 *         onAuraStrike(ev), onKorusEvent(ev), onSpotted(monster, via) }
 * Returns { group, colliders, spawn, bounds, groundHeight,
 *   biomeAt, monsters, korus, setObserver, update, dispose,
 *   strikeHunter, damageKorus, setOrbDrops, kind, sky, fog, cycleColors }.
 * bounds is null — the inner sphere has no edge, so there is no
 * clamp to return (the old circle bounds and the radial monster
 * clamp retired with the disc).
 */
import * as ThreeJS from 'three';
import { createHeightFunction, spanSeatY } from '../star-wars/zone.js';
import { biomeWeights, biomeAt, BIOMES } from './biomes.js';
import { buildLandmark, animateLandmark, applyLandmarkArt } from './landmarks.js';
import { sharedTexture } from './textures.js';
import { buildSkyDome, applySkyTint, setSkyDomeMap } from './sky.js';
import { buildAmbientParticles } from './ambient.js';
import { buildAmbientLife } from './ambient-life.js';
import { getParticleTexture } from '../../lib/particles/sprites.js';
import {
  deckToDir, dirToDeck, spherePointFromDeck, sphereUpAtDeck, liftedPoint,
  orientationQuat, flatQuat, auraRingPoints,
} from '../../lib/hollow-earth/planet.js';
import { ELEMENT_AURA } from './elemental-aura.js';
import {
  spawnField, createMonster, stepMonster, strike,
  applyMonsterAuraHit, respawnMonster, RESPAWN_S, ELEMENT_COLORS,
  createKorus, stepKorus, damageKorus as damageKorusPure,
  MONSTER_MODELS, KORUS_MODEL,
  WORLD_SPAWN, ACTIVATE_R, DEACTIVATE_R, mulberry32,
  separateFromPlayer,
} from './spawns.js';
import { AURA_R_M, lightningColorFor } from '../../lib/lightning-aura.js';
import { rainFor, RAIN_MAX_STREAKS, RAIN_FALL_SPEED_M_S, RAIN_HEIGHT_M } from './elemental-rain.js';
import { ORB_DROP_SHELL_R, ORB_DROP_CORE_R } from './elemental-orbs.js';
import { SAFE_ZONES } from './sanctuary.js';
import {
  SANCTUARY_GOLD, RING_SEGMENTS, RING_STRUCTURE_SEGMENTS,
  ringElementColor, structureRingElement, structureRingRadius,
  sanctuaryRingGeometry,
} from './sanctuary-ring.js';
import {
  buildSanctuaryPortal, portalSeatForZone, portalYawForZone,
} from './sanctuary-portal.js';
import { kickOffGlb, preloadGlb } from './model-loader.js';
import { WATCHER, watcherGazeYaw, watcherBlinkOpen, watcherLaughing } from './watcher.js';
import { buildElemental, hazeStateFor } from './elemental.js';
import { createMonsterProjectiles } from './monster-projectiles.js';
import { PLACED_FIELD_KEYS } from './models.js';
import { variantFor, seedFor, breatheScale, clothSway, classifyLocomotionBones, locomotionPose } from './behavior.js';

function R3(THREE) { return THREE || ThreeJS; }

function hexRgb(hex) {
  return [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
}

const SCATTER_SOLID = {
  'ooze-bubble': false, 'ember-rock': true, 'storm-crystal': true,
  'spore-cap': false, 'gloom-pillar': true, 'dune-bone': true, 'peak-rock': true,
  'frost-shard': true,
};

const SCATTER_COLOR = {
  'ooze-bubble': 0xb6e33c, 'ember-rock': 0x3a2c26, 'storm-crystal': 0xffe14d,
  'spore-cap': 0xc06ae0, 'gloom-pillar': 0x3a3a40, 'dune-bone': 0xd8bc82, 'peak-rock': 0x7a7a82,
  'frost-shard': 0x9fd8e8,
};

/* Dive round (Nov 24): every scatter kind wears its procedural
 * map — one shared texture per kind, never one per piece.
 * Colour rule (textures.js): the colour stays as the multiplier
 * where it is light, and goes white where the texture itself
 * carries the colour — ember-rock and gloom-pillar are too dark
 * to multiply through. A stub T (no maker) leaves the piece
 * flat, never a crash. */
const SCATTER_TEXTURE = {
  'ooze-bubble': 'acidBubbleTexture', 'ember-rock': 'emberRockTexture',
  'storm-crystal': 'stormCrystalTexture', 'spore-cap': 'sporeCapTexture',
  'gloom-pillar': 'darkStoneTexture', 'dune-bone': 'sandstoneTexture',
  'peak-rock': 'mountainStoneTexture', 'frost-shard': 'iceTexture',
};
const SCATTER_TEX_WHITE = new Set(['ember-rock', 'gloom-pillar']);

function scatterMat(T, kind, extra) {
  const m = {
    color: SCATTER_TEX_WHITE.has(kind) ? 0xffffff : (SCATTER_COLOR[kind] || 0x888888),
    ...(extra || {}),
  };
  const mapTex = sharedTexture(T, SCATTER_TEXTURE[kind]);
  if (mapTex) m.map = mapTex;
  return m;
}

/* G-11 — transition-band mixed scatter gate: a scatter kind
 * spawns where its own biome holds weight >= 0.35, as before —
 * and, where the point sits in a transition band, also when its
 * biome is the dominant or the runner-up band with weight
 * >= 0.15, so blend lines read as mingled ground rather than a
 * colour wash. Pure (biome field only) for tests. */
export function scatterAllowedAt(x, z, biomeId) {
  const w = biomeWeights(x, z);
  const own = w[biomeId] || 0;
  if (own >= 0.35) return true;
  const b = biomeAt(x, z);
  if (!b.transition) return false;
  if (biomeId !== b.dominant && biomeId !== b.second) return false;
  return own >= 0.15;
}

function losClear(heightAt, ax, az, bx, bz) {
  const samples = 9;
  const aY = heightAt(ax, az) + 1.7;
  const bY = heightAt(bx, bz) + 1.7;
  for (let i = 1; i < samples; i++) {
    const t = i / samples;
    const x = ax + (bx - ax) * t;
    const z = az + (bz - az) * t;
    const lineY = aY + (bY - aY) * t;
    if (heightAt(x, z) + 0.5 > lineY) return false;
  }
  return true;
}

export function buildWorld(THREE, def, T, opts = {}) {
  const R = R3(THREE);
  const group = new R.Group();
  const colliders = [];
  const heightAt = createHeightFunction(def);
  const rng = mulberry32(def.seed || 77701);

  // --- terrain: the INNER SPHERE SHELL, not a disc ---
  // The old radial disc (127 rings × 169 segs at r600) becomes
  // a full shell: rings run pole → antipode (θ 0..π), segs run
  // the azimuth, and every vertex is the deck point's sphere
  // point — ground radius SPHERE_R minus the seeded height, so
  // the deck under your feet does not change and the far side
  // is the same height function carried round the shell. Vertex
  // colours come from the same biome weight field, the ground
  // detail texture is kept (map + bumpMap). Winding is the
  // saga's +y order (star-wars/zone.js), which on the inside
  // gives INWARD normals (verified in node: the old disc order
  // (a,c,b) faces DOWN — the shipped disc ground was
  // backface-culled from above — and the saga order faces in);
  // DoubleSide is belt-and-braces on top. 128 rings × 256 segs
  // (~33k verts) holds the disc's vertex density over the
  // shell's ~1.83M m². UVs still run off the deck coordinates
  // (radius 600 = the pole-to-equator surface distance), with
  // RepeatWrapping so the detail tiles past the old rim instead
  // of clamping to stretched edge texels on the far side.
  const uvRadius = def.worldRadius || 600;
  const rings = 128;
  const segs = 256;
  const positions = [];
  const colors = [];
  const uvs = [];
  const indices = [];
  for (let ri = 0; ri <= rings; ri++) {
    const theta = (ri / rings) * Math.PI;
    for (let si = 0; si <= segs; si++) {
      const alpha = (si / segs) * Math.PI * 2;
      const dir = {
        x: Math.sin(theta) * Math.sin(alpha),
        y: -Math.cos(theta),
        z: -Math.sin(theta) * Math.cos(alpha),
      };
      const deck = dirToDeck(dir);
      const p = spherePointFromDeck(deck.x, deck.z, heightAt);
      positions.push(p.x, p.y, p.z);
      const w = biomeWeights(deck.x, deck.z);
      let cr = 0;
      let cg = 0;
      let cb = 0;
      for (const id of Object.keys(BIOMES)) {
        const [br, bg, bb] = hexRgb(BIOMES[id].ground);
        cr += br * w[id];
        cg += bg * w[id];
        cb += bb * w[id];
      }
      colors.push(cr, cg, cb);
      uvs.push(deck.x / uvRadius * 0.5 + 0.5, deck.z / uvRadius * 0.5 + 0.5);
    }
  }
  const row = segs + 1;
  for (let ri = 0; ri < rings; ri++) {
    for (let si = 0; si < segs; si++) {
      const a = ri * row + si;
      const b = a + 1;
      const c = a + row;
      const d = c + 1;
      indices.push(a, b, c, b, d, c);
    }
  }
  const geo = new R.BufferGeometry();
  geo.setAttribute('position', new R.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new R.Float32BufferAttribute(colors, 3));
  geo.setAttribute('uv', new R.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  // G-01: the dead ground textures live at last — a single neutral
  // detail map (grain + cracks + speckle) multiplied over the
  // vertex colours, plus a matching bumpMap, ~28 tiles across the
  // disc. Per-band character stays in the vertex colours. The
  // page's `* as T` import is live through this call.
  let terrainMat = new R.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: R.DoubleSide });
  try {
    if (T && typeof T.groundDetailTexture === 'function') {
      const detail = T.groundDetailTexture();
      detail.repeat.set(28, 28);
      if (R.RepeatWrapping !== undefined) { detail.wrapS = R.RepeatWrapping; detail.wrapT = R.RepeatWrapping; }
      const bump = T.groundDetailTexture();
      if (R.NoColorSpace !== undefined) bump.colorSpace = R.NoColorSpace;
      bump.repeat.set(28, 28);
      if (R.RepeatWrapping !== undefined) { bump.wrapS = R.RepeatWrapping; bump.wrapT = R.RepeatWrapping; }
      terrainMat = new R.MeshStandardMaterial({
        vertexColors: true, roughness: 1, map: detail, bumpMap: bump, bumpScale: 0.6,
        side: R.DoubleSide,
      });
    }
  } catch { /* plain vertex-colour ground is the fallback */ }
  const terrain = new R.Mesh(geo, terrainMat);
  group.add(terrain);

  // --- sky dome (G-02): the video owns the sky when it loads,
  // the static image is the fallback, the flat tint stands until
  // either lands — never blank. The page retints the dome material
  // each frame via setSkyTint(); the video/art textures arrive
  // through setSkyVideoTexture()/setSkyArtTexture(). The dome is
  // r370 INSIDE the 382 m shell (sky.js) — the old r780 dome sat
  // outside the shell and the shell would hide it entirely; at
  // 370 the player stands outside the dome (feet ~382, eye ~380)
  // and reads its far interior as the sky overhead, the video
  // intact, while the shell curving up around them is the
  // inverted horizon itself.
  const skyDome = buildSkyDome(R, def.sky || 0x2a1e3f);
  group.add(skyDome);
  let skyVideoTex = null;
  let skyArtTex = null;

  // --- elemental light + atmosphere (2026-10-26 rework): this
  // module IS the world's lighting — the world shipped with
  // zero scene lights, so no band could ever read as its
  // families' home. Sun/moon cycle, acid rivers, brimstone
  // vents, poison veins, lightning storms, smoke haze. The
  // inverted-horizon cone ring is RETIRED (Nov 16 inner
  // sphere): 26 cones at r700 stood outside the 382 m shell,
  // invisible — the shell curving up around the walker IS the
  // inverted horizon now. The sun/moon ride the core instead
  // (elemental.js): both bodies sit at the sphere centre and
  // the key light shines outward from it.
  // Sphere projection for everything elemental places on the
  // ground: rivers, vents, veins, wash lights, storm bolts all
  // read groundPoint/groundUp (deck → 3D point / local up) and
  // fall back to flat (x, heightAt, z) without them, so the
  // elemental tests keep passing untouched.
  const sphereGround = {
    groundPoint: (x, z, lift = 0) => liftedPoint(x, z, lift, heightAt),
    groundUp: (x, z) => sphereUpAtDeck(x, z),
  };
  const elemental = buildElemental(R, {
    heightAt,
    biomeAt: (x, z) => biomeAt(x, z).dominant,
    rng,
    groundPoint: sphereGround.groundPoint,
    groundUp: sphereGround.groundUp,
    // G-05: the river flow texture (acid bubble language on a pale
    // base); elemental scrolls it per frame. Plain ribbons if the
    // texture module has no such export.
    riverTexture: (T && typeof T.acidRiverTexture === 'function') ? T.acidRiverTexture() : null,
  });
  group.add(elemental.group);

  // --- ambient particles + ambient life (G-04, G-08): one shared
  // Points system per band-field + procedural sky wings, night
  // fireflies and spore-flies. Zero lights, no colliders, never
  // counted as monsters.
  let ambientParticles = null;
  let ambientLife = null;
  try {
    ambientParticles = buildAmbientParticles(R, {
      heightAt, biomeWeights,
      groundPoint: sphereGround.groundPoint,
      groundUp: sphereGround.groundUp,
      texture: getParticleTexture('glow') || null,
    });
    group.add(ambientParticles.group);
  } catch { /* particles are dressing, never requirement */ }
  try {
    ambientLife = buildAmbientLife(R, {
      heightAt,
      groundPoint: sphereGround.groundPoint,
      groundUp: sphereGround.groundUp,
      texture: getParticleTexture('firefly') || null,
    });
    group.add(ambientLife.group);
  } catch { /* ambient life is dressing, never requirement */ }

  // Monster ranged attacks are visible traveling projectiles
  // (2026-10-26): a ranged 'hit' event launches one instead of
  // dealing damage instantly — damage lands on arrival, so the
  // attack is readable and sidesteppable. Numbers, cooldowns,
  // ranges, and back-away behavior are untouched; melee and
  // short-range keep instant damage + the attack lunge.
  const monsterShots = createMonsterProjectiles(R, group, {
    groundHeight: heightAt,
    groundPoint: sphereGround.groundPoint,
    groundUp: sphereGround.groundUp,
    // WS6: the element rides the arrival — the shot stored it all
    // along, the callback just never passed it (flat-damage site D2).
    onArrive: (dmg, fromId, element) => { if (opts.onPlayerHit) opts.onPlayerHit(dmg, fromId, 'ranged', element); },
  });

  // --- ELEMENTAL RAIN (Merlin, Nov 16 ~01:33: "elemental rains";
  // WS5 phase 2 wiring). Every live monster rains its element
  // inside its own aura radius — the rain is the aura made
  // visible at range, so a band reads its element before the
  // monster is in sight. VISUAL ONLY: the ambient rain HP tick
  // (1 HP / 2 s per element type) is HELD for Merlin's word and
  // is NOT built anywhere — no damage rides this render; the
  // aura strikes are the damage. One preallocated LineSegments
  // (RAIN_MAX_STREAKS = 600), positions + colours updated in
  // place each frame — no per-frame allocations, no new lights
  // (unlit LineBasicMaterial, vertex colours). The streak set
  // rebuilds ~once a second (rainFor walks the whole field);
  // between rebuilds each streak falls in place and respawns at
  // the top of its own column when it reaches the ground.
  const rainGeo = new R.BufferGeometry();
  const rainPos = new Float32Array(RAIN_MAX_STREAKS * 2 * 3);
  const rainCol = new Float32Array(RAIN_MAX_STREAKS * 2 * 3);
  rainGeo.setAttribute('position', new R.BufferAttribute(rainPos, 3));
  rainGeo.setAttribute('color', new R.BufferAttribute(rainCol, 3));
  const rainLines = new R.LineSegments(
    rainGeo,
    new R.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.55 }),
  );
  rainLines.frustumCulled = false;
  group.add(rainLines);
  let rainStreaks = []; // rainFor() streaks, advanced in place
  let rainRebuildAcc = 0;
  function updateRain(dt) {
    const step = typeof dt === 'number' && dt > 0 && dt < 5 ? dt : 0;
    rainRebuildAcc += step;
    if (rainStreaks.length === 0 || rainRebuildAcc >= 1) {
      rainRebuildAcc = 0;
      // In The Haven rainFor suppresses everything (sanctuary);
      // dead / mounted / exempt monsters rain nothing (rainFor).
      const rain = rainFor(monsters, { x: observer.x, z: observer.z, inBase: observer.inBase });
      rainStreaks = rain.streaks;
    }
    const n = Math.min(rainStreaks.length, RAIN_MAX_STREAKS);
    for (let i = 0; i < n; i++) {
      const s = rainStreaks[i];
      s.y -= RAIN_FALL_SPEED_M_S * step;
      // Ground height under the streak, not the flat 0 the pure
      // module assumes — columns follow the terrain. The streak
      // falls RADIAL (toward the shell, the inner world's down):
      // its top is the ground point lifted by its height above
      // ground, its tail the same point less the streak length.
      const gy = heightAt(s.x, s.z);
      if (s.y <= gy) s.y = gy + RAIN_HEIGHT_M;
      const lift = s.y - gy;
      const top = liftedPoint(s.x, s.z, lift, heightAt);
      const bot = liftedPoint(s.x, s.z, Math.max(lift - (s.lengthM || 2), 0), heightAt);
      const o = i * 6;
      rainPos[o] = top.x; rainPos[o + 1] = top.y; rainPos[o + 2] = top.z;
      rainPos[o + 3] = bot.x; rainPos[o + 4] = bot.y; rainPos[o + 5] = bot.z;
      const r = ((s.color >> 16) & 255) / 255;
      const g = ((s.color >> 8) & 255) / 255;
      const b = (s.color & 255) / 255;
      rainCol[o] = r; rainCol[o + 1] = g; rainCol[o + 2] = b;
      rainCol[o + 3] = r; rainCol[o + 4] = g; rainCol[o + 5] = b;
    }
    rainGeo.setDrawRange(0, n * 2);
    rainGeo.attributes.position.needsUpdate = true;
    rainGeo.attributes.color.needsUpdate = true;
    rainLines.visible = n > 0;
  }

  // --- SAVAGERY visuals + kill feed (Merlin, Nov 16 ~01:33) ---
  // Aura rings: one ring per live aura carrier, in its own
  // element's colour, hugging the shell at its own aura radius
  // (ELEMENT_AURA — lightning 59 m, fire 24, acid 18, poison
  // 20, shadow 30, sand 26, frost 16). Lightning keeps its own
  // streak colours (dragons red, lightning monsters
  // white-yellow); every other element wears its ELEMENT_AURA
  // colour. A flat ring would float up to ~4.5 m off the ground
  // at 59 m on a 382 m sphere, so each ring owns its geometry
  // and the points are rewritten in place from
  // auraRingPoints — the J2 pattern — whenever the monster has
  // moved > 2 m since the last build (a rebuild every frame
  // would be 48 height-function calls per ring per frame).
  const RING_SEGMENTS = 48;
  const RING_REBUILD_M = 2;
  const auraRings = new Map(); // monster id -> { loop, mat, geo, phase, radiusM, lastX, lastZ }
  function ringColorFor(m) {
    const element = (m.stats && m.stats.element) || m.element;
    if (element === 'lightning') {
      const kind = m.stats && m.stats.dragon ? 'dragon' : 'lightning-monster';
      const color = lightningColorFor(kind);
      return (color && color.glow) || 0xffe14d;
    }
    const row = ELEMENT_AURA[element];
    return (row && row.color) || 0xffffff;
  }
  function ringRadiusFor(m) {
    const element = (m.stats && m.stats.element) || m.element;
    const row = ELEMENT_AURA[element];
    return (row && row.radiusM) || AURA_R_M;
  }
  function syncAuraRings() {
    const seen = new Set();
    for (const m of monsters) {
      if (m.dead || !m.active || m.mounted) continue;
      const element = (m.stats && m.stats.element) || m.element;
      if (!ELEMENT_AURA[element]) continue;
      seen.add(m.id);
      let ring = auraRings.get(m.id);
      if (!ring) {
        const geo = new R.BufferGeometry();
        geo.setAttribute('position', new R.Float32BufferAttribute(new Float32Array(RING_SEGMENTS * 3), 3));
        const mat = new R.LineBasicMaterial({ color: ringColorFor(m), transparent: true, opacity: 0.2 });
        const loop = new R.LineLoop(geo, mat);
        loop.frustumCulled = false;
        group.add(loop);
        ring = { loop, mat, geo, phase: seedFor(m.id) * Math.PI * 2, radiusM: 0, lastX: null, lastZ: null };
        auraRings.set(m.id, ring);
      }
      const radiusM = ringRadiusFor(m);
      const moved = ring.lastX == null || Math.hypot(m.x - ring.lastX, m.z - ring.lastZ) > RING_REBUILD_M;
      if (moved || ring.radiusM !== radiusM) {
        const pts = auraRingPoints(deckToDir(m.x, m.z), radiusM, RING_SEGMENTS, heightAt);
        const attr = ring.geo.getAttribute('position');
        for (let i = 0; i < RING_SEGMENTS; i++) {
          attr.array[i * 3] = pts[i].x;
          attr.array[i * 3 + 1] = pts[i].y;
          attr.array[i * 3 + 2] = pts[i].z;
        }
        attr.needsUpdate = true;
        ring.radiusM = radiusM;
        ring.lastX = m.x;
        ring.lastZ = m.z;
      }
      ring.mat.color.setHex(ringColorFor(m));
      ring.loop.visible = true;
      ring.mat.opacity = 0.15 + 0.1 * Math.sin(elapsed * 2 + ring.phase);
    }
    for (const [id, ring] of auraRings) {
      if (!seen.has(id)) ring.loop.visible = false;
    }
  }
  // Remains discs: a fading ground disc at a monster-vs-monster
  // death point until the 45 s respawn (J2's remainsFor pattern).
  const remains = []; // { mesh, mat, id, born }
  function addRemainsDisc(victim) {
    removeRemainsDisc(victim.id);
    const r = (victim.stats && victim.stats.footprintR) || 2;
    const mat = new R.MeshBasicMaterial({
      color: ELEMENT_COLORS[victim.element] || 0xffffff,
      transparent: true, opacity: 0.45, side: R.DoubleSide, depthWrite: false,
    });
    const mesh = new R.Mesh(new R.CircleGeometry(r + 0.5, 24), mat);
    // The disc lies flat on the shell: its +Z normal is turned
    // to the local up (toward the core) by flatQuat, and it sits
    // 0.3 m above the ground point.
    const gp = liftedPoint(victim.x, victim.z, 0.3, heightAt);
    mesh.position.set(gp.x, gp.y, gp.z);
    mesh.quaternion.copy(flatQuat(sphereUpAtDeck(victim.x, victim.z)));
    group.add(mesh);
    remains.push({ mesh, mat, id: victim.id, born: elapsed });
  }
  function removeRemainsDisc(id) {
    for (let i = remains.length - 1; i >= 0; i--) {
      if (remains[i].id !== id) continue;
      group.remove(remains[i].mesh);
      try { remains[i].mesh.geometry.dispose(); remains[i].mat.dispose(); } catch { /* noop */ }
      remains.splice(i, 1);
    }
  }
  function updateRemains() {
    for (let i = remains.length - 1; i >= 0; i--) {
      const age = (elapsed - remains[i].born) / RESPAWN_S;
      if (age >= 1) { removeRemainsDisc(remains[i].id); continue; }
      remains[i].mat.opacity = 0.45 * (1 - age);
    }
  }
  // ELEMENTAL ORB DROPS (Merlin, Nov 16 ~01:52): a hunter kill
  // leaves one small glowing orb in the monster's element colour
  // at the death point. Bone-drop scale (Merlin, Nov 24 ~08:05):
  // the shell is ORB_DROP_SHELL_R (0.22 m) — smaller than Earth
  // 2's longest bone (0.9 m) and far under the shortest hero
  // and every monster. Unlit basic materials — no new lights.
  // The page owns the drop list (create/collect/prune) and pushes
  // it through setOrbDrops; this only renders it, bobbing at
  // ground height (0.9 m + a 0.25 m sine bob).
  const orbDropMeshes = new Map(); // drop id -> { group, baseY, phase }
  function syncOrbDrops(drops) {
    const seen = new Set();
    for (const d of drops || []) {
      if (!d || !d.id) continue;
      seen.add(d.id);
      if (orbDropMeshes.has(d.id)) continue;
      const color = ELEMENT_COLORS[d.element] || 0xffffff;
      const shell = new R.Mesh(
        new R.SphereGeometry(ORB_DROP_SHELL_R, 12, 10),
        new R.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, fog: false }),
      );
      const core = new R.Mesh(
        new R.SphereGeometry(ORB_DROP_CORE_R, 8, 6),
        new R.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, fog: false }),
      );
      const g = new R.Group();
      g.add(shell);
      g.add(core);
      // On the shell: 0.9 m above the ground point, along the
      // local up. The bob rides the same up (updateOrbDrops),
      // not world Y — at the far side world Y points down.
      const gp = liftedPoint(d.x, d.z, 0.9, heightAt);
      const up = sphereUpAtDeck(d.x, d.z);
      g.position.set(gp.x, gp.y, gp.z);
      group.add(g);
      orbDropMeshes.set(d.id, { group: g, base: gp, up, phase: Math.random() * Math.PI * 2 });
    }
    for (const [id, rec] of [...orbDropMeshes]) {
      if (seen.has(id)) continue;
      group.remove(rec.group);
      try {
        for (const c of rec.group.children) { c.geometry.dispose(); c.material.dispose(); }
      } catch { /* noop */ }
      orbDropMeshes.delete(id);
    }
  }
  function updateOrbDrops() {
    for (const rec of orbDropMeshes.values()) {
      const bob = Math.sin(elapsed * 2 + rec.phase) * 0.25;
      rec.group.position.set(
        rec.base.x + rec.up.x * bob,
        rec.base.y + rec.up.y * bob,
        rec.base.z + rec.up.z * bob,
      );
    }
  }
  // A monster-vs-monster kill becomes a real event: a remains
  // disc at the death point and the page's kill-feed toast.
  // No hunter reward rides along — the campaign counts the
  // hunter's kills only (spawns.js).
  function forwardMonsterKilled(ev) {
    const victim = monsters.find((o) => o.id === ev.id);
    if (victim) addRemainsDisc(victim);
    if (!opts.onMonsterKilled) return;
    const killer = ev.killerId ? monsters.find((o) => o.id === ev.killerId) : null;
    try { opts.onMonsterKilled({ victim: victim || null, killer: killer || null, cause: ev.cause || 'predation' }); } catch { /* toast is optional */ }
  }
  function drawStrikeBolt(ev, tx, tz) {
    // Only draw strikes the hunter could see: far-slice strikes
    // hundreds of metres out would spawn invisible bolts.
    if (Math.hypot(tx - observer.x, tz - observer.z) > 200) return;
    monsterShots.skyBolt({
      x: tx, z: tz, groundY: heightAt(tx, tz),
      // Lightning events carry the shared-law colour object
      // ({ glow }); every other element carries its numeric
      // ELEMENT_AURA colour — both read as the streak colour.
      color: typeof ev.color === 'number' ? ev.color : ((ev.color && ev.color.glow) || 0xffe14d),
    });
  }
  // A streak at another monster lands on the monster, not the
  // hunter: 8 on the hit + the burn, through the monster's own
  // law — and the sky-bolt visual at the TARGET's position (the
  // exact call Korus already uses). A streak at the player flows
  // to the page unchanged, through the same damage path as
  // before, with its bolt at the observer.
  function routeAuraStrike(ev) {
    if (ev.target && ev.target !== 'player') {
      const prey = monsters.find((o) => o.id === ev.target);
      if (prey) {
        const killed = applyMonsterAuraHit(prey, ev);
        drawStrikeBolt(ev, prey.x, prey.z);
        if (killed) {
          forwardMonsterKilled({ kind: 'monster-killed', id: prey.id, cause: prey.deathCause || 'predation', killerId: ev.from });
        }
      }
    } else {
      drawStrikeBolt(ev, observer.x, observer.z);
      if (opts.onAuraStrike) opts.onAuraStrike(ev);
    }
  }

  // --- landmarks, seated, never hovering ---
  // landmarkGroups is kept so the page can hang each type's art
  // once it loads (applyLandmarkArt) and so update() can pulse
  // the ooze pools and court braziers per frame.
  const landmarkGroups = [];
  // Phase 2c: every structure wears the sanctuary ring — the
  // ring is its boundary AND its sanctuary (the same shared
  // design as the safe zones, sized to the footprint). The list
  // is collected here, while each landmark's footprint is
  // known, and the meshes are built below once the watcher
  // figure exists. The Haven is excepted: its zone ring already
  // stands on its boundary (the landmark's own pillar ring
  // marks the same line), so it is not ringed twice.
  const structureRings = [];
  for (const lm of def.landmarks || []) {
    const built = buildLandmark(lm.type, R, T);
    const seatY = spanSeatY(heightAt, lm.x, lm.z, built.userData.colliderR || 2, { clampDrop: 1.5 });
    // On the shell: the seat height is a lift above the ground
    // point, along the local up; the whole piece stands with its
    // +Y on that up and its own yaw around it.
    const gp = liftedPoint(lm.x, lm.z, seatY - heightAt(lm.x, lm.z) - 0.3, heightAt);
    built.position.set(gp.x, gp.y, gp.z);
    built.quaternion.copy(orientationQuat(gp, lm.ry || 0));
    built.scale.setScalar(lm.s || 1);
    group.add(built);
    landmarkGroups.push({ group: built, seed: lm.x * 0.37 + lm.z * 0.73 });
    if (opts.landmarkArt && opts.landmarkArt[lm.type]) {
      try { applyLandmarkArt(built, R, opts.landmarkArt[lm.type]); } catch { /* plain face stands */ }
    }
    const cr = (built.userData.colliderR || 0) * (lm.s || 1);
    if (cr > 0) colliders.push({ x: lm.x, z: lm.z, r: cr });
    if (lm.type !== 'haven') {
      structureRings.push({
        kind: 'structure', name: lm.type, x: lm.x, z: lm.z,
        r: structureRingRadius(built.userData.colliderR || 0, lm.s || 1),
        element: structureRingElement(lm.x, lm.z),
      });
    }
  }
  // Ghorrum's seat is a structure too (a seated watcher ringed
  // by dressing rocks out to 14 m): its ward-line stands at
  // 16 m, enclosing the whole seat. He is no monster record, so
  // the ring changes nothing about him — it marks the seat.
  structureRings.push({
    kind: 'structure', name: "Ghorrum's Seat", x: WATCHER.pos.x, z: WATCHER.pos.z,
    r: 16, element: structureRingElement(WATCHER.pos.x, WATCHER.pos.z),
  });

  // --- scatter: only where its biome holds weight ---
  // G-11: the transition-band mixed gate (scatterAllowedAt) lets
  // both neighbouring bands' kinds spawn on a blend line.
  // G-05: spore-cap spheres are kept with their base scale so
  // update() can pulse them gently, like the ooze bubbles.
  const sporeCaps = [];
  for (const sc of def.scatter || []) {
    for (let i = 0; i < (sc.count || 0); i++) {
      const a = rng() * Math.PI * 2;
      const r = sc.minR + Math.sqrt(rng()) * ((sc.maxR || 290) - sc.minR);
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      if (!scatterAllowedAt(x, z, sc.biome)) continue;
      const s = sc.size[0] + rng() * (sc.size[1] - sc.size[0]);
      // Scatter stands on the shell: every piece sits on its
      // ground point, lifted by its own half-height along the
      // local up, and the upright pieces (cones, cylinders)
      // stand on that up with a yaw — derived from the piece's
      // own position, NOT from the shared rng: an extra draw
      // per piece would shift the stream the scatter counts
      // (and the G-06 spore-cap yield) are pinned against.
      // Flat-world Y placement would bury them at the far side.
      const ry = (x * 0.31 + z * 0.17) % (Math.PI * 2);
      let piece;
      if (sc.kind === 'ooze-bubble' || sc.kind === 'spore-cap') {
        piece = new R.Mesh(
          new R.SphereGeometry(0.5 * s, 8, 6),
          new R.MeshStandardMaterial(scatterMat(T, sc.kind, { roughness: 0.8 }))
        );
        const p = liftedPoint(x, z, 0.3 * s, heightAt);
        piece.position.set(p.x, p.y, p.z);
      } else if (sc.kind === 'storm-crystal' || sc.kind === 'frost-shard') {
        piece = new R.Mesh(
          new R.ConeGeometry(0.5 * s, 2.2 * s, 5),
          new R.MeshStandardMaterial(scatterMat(T, sc.kind, { emissive: sc.kind === 'frost-shard' ? 0x4a7a8a : 0x887a00, emissiveIntensity: 0.5 }))
        );
        const p = liftedPoint(x, z, 1.1 * s, heightAt);
        piece.position.set(p.x, p.y, p.z);
        piece.quaternion.copy(orientationQuat(p, ry));
      } else {
        piece = new R.Mesh(
          new R.CylinderGeometry(0.4 * s, 0.7 * s, 1.6 * s, 6),
          new R.MeshStandardMaterial(scatterMat(T, sc.kind, { roughness: 1 }))
        );
        const p = liftedPoint(x, z, 0.8 * s, heightAt);
        piece.position.set(p.x, p.y, p.z);
        piece.quaternion.copy(orientationQuat(p, ry));
      }
      group.add(piece);
      if (sc.kind === 'spore-cap') sporeCaps.push({ mesh: piece, base: s, phase: x * 0.31 + z * 0.17 });
      if (SCATTER_SOLID[sc.kind]) colliders.push({ x, z, r: 0.7 * s });
    }
  }

  // --- G-09 dressing clusters (seeded, isolated rng — the shared
  // rng stream must not shift, or monster variants would move):
  // a ring of dark mountain rocks around Ghorrum's seat
  // (198,-132 — his figure, gaze, blink and laugh are untouched)
  // and a few more frost-shards clustered at the frost anchor
  // (-230,130) so the band reads from the wastes. No colliders
  // on the watcher ring (he never blocks the path); frost-shards
  // keep their usual solid collider.
  const dressRng = mulberry32((def.seed || 77701) + 904);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + dressRng() * 0.5;
    const rr = 6 + dressRng() * 8;
    const x = WATCHER.pos.x + Math.cos(a) * rr;
    const z = WATCHER.pos.z + Math.sin(a) * rr;
    const s = 1.5 + dressRng() * 1.5;
    const rock = new R.Mesh(
      new R.CylinderGeometry(0.4 * s, 0.7 * s, 1.6 * s, 6),
      new R.MeshStandardMaterial(scatterMat(T, 'peak-rock', { roughness: 1 }))
    );
    const rp = liftedPoint(x, z, 0.8 * s, heightAt);
    rock.position.set(rp.x, rp.y, rp.z);
    rock.quaternion.copy(orientationQuat(rp, dressRng() * Math.PI));
    group.add(rock);
  }
  for (let i = 0; i < 6; i++) {
    const a = dressRng() * Math.PI * 2;
    const rr = 5 + dressRng() * 7;
    const x = -230 + Math.cos(a) * rr;
    const z = 130 + Math.sin(a) * rr;
    const s = 1 + dressRng() * 1.2;
    const shard = new R.Mesh(
      new R.ConeGeometry(0.5 * s, 2.2 * s, 5),
      new R.MeshStandardMaterial(scatterMat(T, 'frost-shard', { emissive: 0x4a7a8a, emissiveIntensity: 0.5 }))
    );
    const sp = liftedPoint(x, z, 1.1 * s, heightAt);
    shard.position.set(sp.x, sp.y, sp.z);
    shard.quaternion.copy(orientationQuat(sp, (x * 0.31 + z * 0.17) % (Math.PI * 2)));
    group.add(shard);
    colliders.push({ x, z, r: 0.7 * s });
  }

  // --- monsters: habitat-band field, streamed figures ---
  // The field is monster-first: families spawn in their own
  // habitat bands (spawns.js), and the band reader here is the
  // biome field's dominant band — the single source of truth.
  // GLB-ONLY (2026-10-26 rework): spawnField emits records
  // only for placed families, and figures are empty groups
  // until their GLB loads — no procedural stand-in anywhere.
  // Preload every placed URL up front so first activations
  // swap from cache instead of waiting on a cold fetch.
  const records = spawnField(def.seed || 77701, {
    habitatAt: (x, z) => biomeAt(x, z).dominant,
    // Phase 2c: no monster spawns inside a structure ring
    // either — the landmark rings above are the exclusion list.
    exclusionRings: structureRings,
  });
  const monsters = records.map((rec) => createMonster(rec, rng));
  const figures = new Map();
  // Floating HP bars: one sprite per damaged monster, drawn on a
  // canvas only when its HP fraction changes. Shown while the
  // monster is damaged, hidden at full health and on death —
  // damage you can see, not just numbers in the strike code.
  const bars = new R.Group();
  group.add(bars);
  const barSprites = new Map();
  function removeBar(id) {
    const bar = barSprites.get(id);
    if (!bar) return;
    bars.remove(bar.sprite);
    try { bar.tex.dispose(); bar.sprite.material.dispose(); } catch { /* noop */ }
    barSprites.delete(id);
  }
  // Phase 2c: inBase now means "inside ANY sanctuary zone"
  // (the page feeds isInSanctuary + the structure rings in) —
  // the flag's name is the old Haven name, its meaning is the
  // whole sanctuary list. It still gates the same things:
  // stepMonster's sanctuary break, the aura, the rain, the haze.
  const observer = { x: WORLD_SPAWN.x, z: WORLD_SPAWN.z, quiet: 1, noise: null, inBase: false };
  for (const key of new Set([
    ...PLACED_FIELD_KEYS.map((k) => (MONSTER_MODELS[k] || {}).url).filter(Boolean),
    KORUS_MODEL.url, WATCHER.model.url,
  ])) preloadGlb(key);

  // Behavior clock (seconds) for breathe/blink/sway/watcher cycles.
  let elapsed = 0;
  // Far-slice tick (savagery step 7): 500 ms cadence, rotating
  // cursor over the inactive field. FAR_PLAYER is the stand-in
  // the slice steps against — 10 km out, so no far monster can
  // spot it or strike it; only aura + prey-hunt run there.
  let sliceAcc = 0;
  let sliceCursor = 0;
  const FAR_PLAYER = { x: 10000, z: 10000 };

  function syncFigure(m, dt) {
    const step = (typeof dt === 'number' && dt > 0) ? dt : 0.016;
    let fig = figures.get(m.id);
    if (!fig) {
      // GLB-only figure: an empty group until its model loads.
      // A failed load leaves it empty — never a stand-in — and
      // spawnField guarantees no record exists for a family
      // with no placed GLB, so an empty figure has no monster
      // behind it at all.
      fig = new R.Group();
      fig.userData.monsterId = m.id;
      fig.userData.footprintR = m.stats.footprintR;
      fig.userData.modelPath = (MONSTER_MODELS[m.type] || {}).url || null;
      figures.set(m.id, fig);
      group.add(fig);
      kickOffGlb(fig, fig.userData.modelPath, m.stats.scaleM);
    }
    // --- procedural locomotion: speed from real movement ---
    // Gait phase advances only while actually moving, and
    // amplitude eases back to zero at rest so a monster never
    // freezes mid-stride. Batch-4 files carry skeletons but
    // ZERO baked animations, so the walk cycle + arm swing is
    // computed here and applied to the rig's bones; a rig with
    // no matchable leg/arm bones falls back to whole-figure
    // bob/sway — never a crash.
    const lastX = fig.userData.lastX;
    const lastZ = fig.userData.lastZ;
    let inst = 0;
    if (lastX != null && lastZ != null) inst = Math.hypot(m.x - lastX, m.z - lastZ) / step;
    fig.userData.lastX = m.x;
    fig.userData.lastZ = m.z;
    const speedSm = (fig.userData.speedSm || 0) * 0.8 + inst * 0.2;
    fig.userData.speedSm = speedSm;
    if (fig.userData.locoPhase == null) fig.userData.locoPhase = seedFor(m.id) * 6.28;
    if (fig.userData.locoAmp == null) fig.userData.locoAmp = 0;
    const targetAmp = Math.min(1, speedSm / 3);
    fig.userData.locoAmp += (targetAmp - fig.userData.locoAmp) * Math.min(1, step * 8);
    if (speedSm > 0.5) fig.userData.locoPhase += step * speedSm * 2.0;
    const pose = locomotionPose(fig.userData.locoPhase, fig.userData.locoAmp);
    // --- attack lunge: a brief forward jolt when this monster lands a hit ---
    let lunge = 0;
    if (m.attackT != null) {
      const lt = elapsed - m.attackT;
      if (lt >= 0 && lt < 0.3) lunge = Math.sin((lt / 0.3) * Math.PI);
    }
    // --- hit flinch: scale pop + recoil when the hunter's weapon lands ---
    // Computed once per frame and decayed here, on the render path.
    let flinch = 0;
    if (m.hitFlash > 0) {
      flinch = m.hitFlash;
      m.hitFlash *= Math.exp(-step * 8);
      if (m.hitFlash < 0.02) m.hitFlash = 0;
    }
    // --- bone discovery, once the GLB has landed ---
    if (!fig.userData.locoScanned && fig.children.length > 0) {
      try {
        const bones = new Map();
        fig.traverse((o) => {
          if (o && o.isSkinnedMesh && o.skeleton && o.skeleton.bones) {
            for (const b of o.skeleton.bones) if (!bones.has(b.name)) bones.set(b.name, b);
          }
        });
        const map = classifyLocomotionBones([...bones.keys()]);
        const base = new Map();
        for (const name of Object.values(map)) {
          if (name && bones.has(name)) base.set(name, bones.get(name).rotation.clone());
        }
        fig.userData.locoBones = { bones, map, base };
      } catch { /* a bad rig never breaks the frame loop */ }
      fig.userData.locoScanned = true;
    }
    const seed = seedFor(m.id);
    const v = variantFor(m.id); // kin variant: visual scale only
    const br = breatheScale(elapsed, seed);
    const fl = 1 + flinch * 0.12;
    fig.scale.set(v.scaleMul * br.x * fl, v.scaleMul * br.y * fl, v.scaleMul * br.z * fl);
    fig.visible = !m.dead;
    const yaw = m.faceYaw || 0;
    // On the shell: the figure stands on its ground point with
    // its +Y on the local up and its -Z on the facing yaw, the
    // lunge/flinch jolt folded into the deck point first (a
    // small deck-space offset, so it stays tangent). The cloth
    // sway is a small local roll applied after the orientation.
    const deckX = m.x + Math.sin(yaw) * flinch * 0.3 - Math.sin(yaw) * lunge * 0.35;
    const deckZ = m.z + Math.cos(yaw) * flinch * 0.3 - Math.cos(yaw) * lunge * 0.35;
    const fp = liftedPoint(deckX, deckZ, (m.stats.flyHeight || 0) + pose.bob, heightAt);
    fig.position.set(fp.x, fp.y, fp.z);
    fig.quaternion.copy(orientationQuat(fp, yaw));
    const sway = clothSway(elapsed, 0.5, seed).swayZ;
    if (sway) {
      const q = new R.Quaternion();
      q.setFromAxisAngle(new R.Vector3(0, 0, 1), sway);
      fig.quaternion.multiply(q);
    }
    // --- bone pose: walk swing + arm swing, or rest pose when idle ---
    const lb = fig.userData.locoBones;
    if (lb) {
      const applyBone = (key, val) => {
        try {
          const name = lb.map[key];
          if (!name || !lb.bones.has(name) || !lb.base.has(name)) return;
          const b = lb.bones.get(name);
          const br0 = lb.base.get(name);
          b.rotation.set(br0.x + val, br0.y, br0.z);
        } catch { /* one bad bone never breaks the frame loop */ }
      };
      applyBone('thighL', pose.thighL);
      applyBone('thighR', pose.thighR);
      applyBone('shinL', pose.shinL);
      applyBone('shinR', pose.shinR);
      applyBone('armL', pose.armL + lunge * 0.7);
      applyBone('armR', pose.armR + lunge * 0.7);
      applyBone('foreL', pose.foreL);
      applyBone('foreR', pose.foreR);
    }
    // --- floating HP bar: only while damaged, never at full health ---
    if (!m.dead && m.hp < m.stats.hp) {
      let bar = barSprites.get(m.id);
      if (!bar && typeof document !== 'undefined') {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = 128; canvas.height = 16;
          const ctx = canvas.getContext('2d');
          const tex = new R.CanvasTexture(canvas);
          const mat = new R.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
          const sprite = new R.Sprite(mat);
          sprite.scale.set(2.4, 0.3, 1);
          sprite.renderOrder = 10;
          bars.add(sprite);
          bar = { sprite, canvas, ctx, tex, lastFrac: -1 };
          barSprites.set(m.id, bar);
        } catch { /* bars are enhancement, never requirement */ }
      }
      if (bar) {
        const frac = Math.max(0, m.hp / m.stats.hp);
        if (Math.abs(frac - bar.lastFrac) > 0.005) {
          const { ctx } = bar;
          ctx.clearRect(0, 0, 128, 16);
          ctx.fillStyle = 'rgba(0,0,0,0.55)';
          ctx.beginPath();
          if (ctx.roundRect) ctx.roundRect(0, 0, 128, 16, 8); else ctx.rect(0, 0, 128, 16);
          ctx.fill();
          const rr = Math.round(255 * (1 - frac));
          const gg = Math.round(160 * frac + 40);
          ctx.fillStyle = `rgb(${rr},${gg},60)`;
          const w = Math.max(0, 124 * frac);
          ctx.beginPath();
          if (ctx.roundRect) ctx.roundRect(2, 2, w, 12, 6); else ctx.rect(2, 2, w, 12);
          ctx.fill();
          bar.tex.needsUpdate = true;
          bar.lastFrac = frac;
        }
        const up = sphereUpAtDeck(m.x, m.z);
        bar.sprite.position.set(
          fig.position.x + up.x * ((m.stats.scaleM || 2.5) + 0.9),
          fig.position.y + up.y * ((m.stats.scaleM || 2.5) + 0.9),
          fig.position.z + up.z * ((m.stats.scaleM || 2.5) + 0.9),
        );
        bar.sprite.visible = true;
      }
    } else {
      removeBar(m.id);
    }
  }

  const korus = createKorus(!!opts.gateOpen);
  const korusFig = new R.Group();
  korusFig.userData.bossId = 'korus';
  korusFig.userData.footprintR = 3;
  korusFig.userData.modelPath = KORUS_MODEL.url;
  const korusP = spherePointFromDeck(korus.x, korus.z, heightAt);
  korusFig.position.set(korusP.x, korusP.y, korusP.z);
  korusFig.quaternion.copy(orientationQuat(korusP, 0));
  group.add(korusFig);
  kickOffGlb(korusFig, KORUS_MODEL.url, KORUS_MODEL.height);

  // Ghorrum, the Mountain's Grin: blended into the mountain
  // ranges, watching passersby. No collider — he never blocks
  // the path — and he is not a monster record, so he never
  // enters combat, the hunt, or the reward flow. GLB-only like
  // everything else: an empty group until ghorrum.glb loads.
  const watcherFig = new R.Group();
  watcherFig.userData.watcher = true;
  watcherFig.userData.modelPath = WATCHER.model.url;
  const watcherP = spherePointFromDeck(WATCHER.pos.x, WATCHER.pos.z, heightAt);
  watcherFig.position.set(watcherP.x, watcherP.y, watcherP.z);
  watcherFig.quaternion.copy(orientationQuat(watcherP, 0));
  group.add(watcherFig);
  kickOffGlb(watcherFig, WATCHER.model.url, WATCHER.model.height);
  let watcherWasLaughing = false;

  // --- SANCTUARY RINGS (Phase 2c, Merlin Nov 24 ~10:06) ---
  // One shared ring graphic (sanctuary-ring.js: the ward-line
  // — an element-coloured ground band, two sanctuary-gold edge
  // lines, a low shimmer veil) wraps the border of every safe
  // zone and every structure's footprint. The ring IS the
  // boundary marker: it reads as "safe inside, danger outside"
  // from both sides (DoubleSide, fog: false, additive), and the
  // hunter walks straight through it — NO collider is ever
  // built for a ring (the no-barriers law wins; the ring marks
  // where safety starts, it does not fence the world in). The
  // Haven's zone ring stands on its boundary beside the
  // landmark's own pillar ring — the two marks agree on the
  // line. 14 zone rings + 19 structure rings (18 landmarks
  // minus the Haven, plus Ghorrum's seat) = 33 rings.
  const sanctuaryRingRecs = []; // { kind, name, x, z, r, element, group, bandMat, veilMat, phase }
  function addSanctuaryRing({ kind, name, x, z, r, element, segments }) {
    const geo = sanctuaryRingGeometry(x, z, r, heightAt, element, segments);
    const g = new R.Group();
    g.userData = { sanctuaryRing: true, kind, name, radiusM: r, element };
    const flat = (pts) => {
      // Points arrive as {x, y, z}, colours as [r, g, b] —
      // both flatten to triples the same way.
      const arr = new Float32Array(pts.length * 3);
      pts.forEach((p, i) => {
        arr[i * 3] = p.x != null ? p.x : p[0];
        arr[i * 3 + 1] = p.y != null ? p.y : p[1];
        arr[i * 3 + 2] = p.z != null ? p.z : p[2];
      });
      return arr;
    };
    // Ground band: the element colour, additive, breathing.
    const bandGeo = new R.BufferGeometry();
    bandGeo.setAttribute('position', new R.BufferAttribute(flat(geo.band.positions), 3));
    bandGeo.setIndex(geo.band.indices);
    const bandMat = new R.MeshBasicMaterial({
      color: ringElementColor(element), transparent: true, opacity: 0.5,
      side: R.DoubleSide, blending: R.AdditiveBlending, depthWrite: false, fog: false,
    });
    const band = new R.Mesh(bandGeo, bandMat);
    band.frustumCulled = false;
    g.add(band);
    // Shimmer veil: the element colour fading to black at the
    // top (additive, so black is invisible — the curtain
    // dissolves overhead instead of ending in a hard line).
    const veilGeo = new R.BufferGeometry();
    veilGeo.setAttribute('position', new R.BufferAttribute(flat(geo.veil.positions), 3));
    veilGeo.setAttribute('color', new R.BufferAttribute(flat(geo.veil.colors), 3));
    veilGeo.setIndex(geo.veil.indices);
    const veilMat = new R.MeshBasicMaterial({
      vertexColors: true, transparent: true, opacity: 0.14,
      side: R.DoubleSide, blending: R.AdditiveBlending, depthWrite: false, fog: false,
    });
    const veil = new R.Mesh(veilGeo, veilMat);
    veil.frustumCulled = false;
    g.add(veil);
    // Gold edge lines: the ward-line itself, both edges.
    for (const pts of [geo.edgeInner, geo.edgeOuter]) {
      const edgeGeo = new R.BufferGeometry();
      edgeGeo.setAttribute('position', new R.BufferAttribute(flat(pts), 3));
      const loop = new R.LineLoop(edgeGeo, new R.LineBasicMaterial({
        color: SANCTUARY_GOLD, transparent: true, opacity: 0.9, fog: false,
      }));
      loop.frustumCulled = false;
      g.add(loop);
    }
    group.add(g);
    sanctuaryRingRecs.push({
      kind, name, x, z, r, element, group: g, bandMat, veilMat,
      phase: (x * 0.37 + z * 0.73) % (Math.PI * 2),
    });
  }
  for (const zone of SAFE_ZONES) {
    addSanctuaryRing({ kind: 'zone', name: zone.name, x: zone.x, z: zone.z, r: zone.r, element: zone.element, segments: RING_SEGMENTS });
  }
  for (const sr of structureRings) {
    addSanctuaryRing({ ...sr, segments: RING_STRUCTURE_SEGMENTS });
  }

  // --- SANCTUARY PORTALS (dive round, Merlin Nov 24 ~16:51) ---
  // One walk-through portal at the heart of every sanctuary —
  // the ward-line made into a gate (sanctuary-portal.js: the
  // element-coloured arch + glow disc + gold trim and foot-ring,
  // breathing like the rings). The seat is the zone centre
  // wherever the centre is open, and just clear of the blocking
  // landmark collider where one covers it (portalSeatForZone) —
  // the walker must be able to reach the trigger, and a portal
  // seated inside a collider could never fire. NO COLLIDER is
  // ever built for a portal (buildSanctuaryPortal's colliderR
  // is 0 and nothing here pushes it into `colliders`): the
  // walker passes straight through, and the page's tick fires
  // the travel. The band landmarks stay where they are — they
  // are mission targets and band markers, never portals — so
  // nothing here removes or replaces a landmark.
  const sanctuaryPortalRecs = []; // { name, x, z, element, group, glowMat, archMat, phase }
  for (const zone of SAFE_ZONES) {
    const seat = portalSeatForZone(zone, colliders);
    const built = buildSanctuaryPortal(zone, R);
    const gp = liftedPoint(seat.x, seat.z, 0, heightAt);
    built.position.set(gp.x, gp.y, gp.z);
    built.quaternion.copy(orientationQuat(gp, portalYawForZone(zone, seat)));
    group.add(built);
    sanctuaryPortalRecs.push({
      name: zone.name, x: seat.x, z: seat.z, element: zone.element,
      group: built,
      glowMat: built.userData.portal.glowMat,
      archMat: built.userData.portal.archMat,
      phase: (seat.x * 0.37 + seat.z * 0.73) % (Math.PI * 2),
    });
  }

  function setObserver(o) {
    if (o.x != null) observer.x = o.x;
    if (o.z != null) observer.z = o.z;
    if (o.quiet != null) observer.quiet = o.quiet;
    if ('noise' in o) observer.noise = o.noise;
    if (o.inBase != null) observer.inBase = o.inBase;
    // WS6: the page's hit-driven haze deadlines (ms) — shadow
    // dim / sand gust — so the zone can drive the haze dome
    // from them alongside shadow combat.
    if (o.dimUntil != null) observer.dimUntil = o.dimUntil;
    if (o.gustUntil != null) observer.gustUntil = o.gustUntil;
  }

  function update(dt) {
    if (typeof dt === 'number' && dt > 0 && dt < 5) elapsed += dt;
    const player = { x: observer.x, z: observer.z };
    // Ghorrum: gaze + blink need head/eyes the GLB does not map
    // yet (pose test owed) — guarded no-ops on the GLB figure.
    // The laugh tone is audio, not geometry: it plays on
    // schedule regardless of figure type.
    if (watcherFig) {
      const head = watcherFig.userData.head;
      if (head) {
        const yaw = watcherGazeYaw(WATCHER.pos, observer);
        if (yaw != null) head.rotation.y = yaw;
        head.rotation.x = watcherLaughing(elapsed) ? Math.sin(elapsed * 20) * 0.05 : 0;
      }
      const wEyes = watcherFig.userData.eyes;
      if (wEyes && wEyes.length) {
        const open = Math.max(0.15, watcherBlinkOpen(elapsed));
        for (const e of wEyes) e.scale.set(1, open, 1);
      }
    }
    const laughing = watcherLaughing(elapsed);
    if (laughing && !watcherWasLaughing && opts.onWatcherLaugh) {
      try { opts.onWatcherLaugh(); } catch { /* sound is optional */ }
    }
    watcherWasLaughing = laughing;
    for (const m of monsters) {
      if (m.dead) {
        // REGENERATION (savagery step 2): the 45 s clock ran out —
        // the monster returns in-slot, same family, near where it
        // fell. Its figure is still in the map (only hidden), so
        // syncFigure below re-shows it once it re-activates;
        // kickOffGlb is a no-op for an already-attempted figure
        // by design, and the loaded GLB children are still there.
        if (m.respawnAtMs && Date.now() >= m.respawnAtMs) {
          // Phase 2c: the respawn never lands inside a sanctuary
          // zone or a structure ring.
          respawnMonster(m, rng, Date.now(), structureRings);
          removeRemainsDisc(m.id);
          // fall through: re-activate by proximity below
        } else {
          if (figures.has(m.id)) { const f = figures.get(m.id); f.visible = false; }
          removeBar(m.id);
          continue;
        }
      }
      const d = Math.hypot(m.x - observer.x, m.z - observer.z);
      if (!m.active && d <= ACTIVATE_R) m.active = true;
      if (m.active && d > DEACTIVATE_R) {
        m.active = false;
        if (figures.has(m.id)) { group.remove(figures.get(m.id)); figures.delete(m.id); }
        removeBar(m.id);
        continue;
      }
      if (!m.active) continue;
      // RIDING (2026-11-15): a mounted monster is driven by its
      // rider, not its hunt AI — no chasing, no attacks, no
      // push-out from the rider's own circle. The page drives
      // its x/z/faceYaw each frame before update() runs; the
      // figure still syncs so it travels with the rider. On
      // dismount the AI resumes from exactly where it was left.
      if (m.mounted) { syncFigure(m, dt); continue; }
      const evs = stepMonster(m, dt, player, rng, {
        losClear: (ax, az, bx, bz) => losClear(heightAt, ax, az, bx, bz),
        inBase: observer.inBase,
        noise: observer.noise,
        quiet: observer.quiet,
        others: monsters, // monster-vs-monster: the aura's prey list
        // Phase 2c: prey standing inside a structure ring is
        // not aura-struck (the safe zones are covered by
        // isInSanctuary inside stepMonster).
        sanctuaryRings: structureRings,
      });
      for (const ev of evs) {
        if (ev.kind === 'hit') m.attackT = elapsed; // throw motion at launch
        if (ev.kind === 'hit' && m.stats.archetype === 'ranged') {
          // Visible traveling projectile — damage lands on arrival.
          // From the monster's chest (a lift above its ground
          // point, along the local up) to the hunter's chest.
          const from = liftedPoint(m.x, m.z, (m.stats.flyHeight || 0) + (m.stats.scaleM || 2.5) * 0.6, heightAt);
          const to = liftedPoint(observer.x, observer.z, 1.2, heightAt);
          monsterShots.spawn({
            from, to,
            element: m.stats.element, dmg: ev.dmg, fromId: m.id,
          });
        } else if (ev.kind === 'hit' && opts.onPlayerHit) opts.onPlayerHit(ev.dmg, ev.from, ev.archetype, ev.element);
        if (ev.kind === 'hazard' && opts.onHazard) opts.onHazard(ev);
        if (ev.kind === 'aura-strike') routeAuraStrike(ev);
        if (ev.kind === 'monster-killed') forwardMonsterKilled(ev);
        if (ev.kind === 'spotted' && opts.onSpotted) opts.onSpotted(m, ev.via);
      }
      // Solid characters: a ground monster may never stand inside
      // the hunter's own circle — it is pushed out to its
      // footprint + body radius (flyers ride above it, untouched).
      if (!m.stats.flyHeight) separateFromPlayer(m, observer.x, observer.z);
      // No edge clamp: the inner sphere has no rim to fall off
      // — a monster past the old r550 keeps walking and comes
      // back around. The sanctuary push-out is the only
      // boundary left, and it lives in stepMonster (inBase).
      syncFigure(m, dt);
    }
    // SAVAGERY far slice (step 7): every 500 ms, step a rotating
    // 1/5 slice of the inactive field through stepMonster with a
    // far player stand-in — aura + prey-hunt only (no spotting:
    // the stand-in sits 10 km out, past sight and aura alike).
    // Burns tick here too, so a burning prey that deactivates no
    // longer freezes mid-burn. Kills flow through the same
    // monster-killed event as the near field. dt is the 0.5 s
    // tick: far monsters simulate slower than real time rather
    // than teleporting in 2.5 s jumps.
    if (typeof dt === 'number' && dt > 0 && dt < 5) sliceAcc += dt;
    if (sliceAcc >= 0.5) {
      sliceAcc = 0;
      const far = monsters.filter((mm) => !mm.dead && mm.active === false);
      const chunk = Math.max(1, Math.ceil(far.length / 5));
      for (let i = 0; i < chunk && far.length > 0; i++) {
        const mm = far[(sliceCursor + i) % far.length];
        if (mm.mounted) continue;
        const farEvs = stepMonster(mm, 0.5, FAR_PLAYER, rng, {
          losClear: (ax, az, bx, bz) => losClear(heightAt, ax, az, bx, bz),
          others: monsters,
          farSlice: true,
          sanctuaryRings: structureRings,
        });
        for (const ev of farEvs) {
          if (ev.kind === 'aura-strike') routeAuraStrike(ev);
          if (ev.kind === 'monster-killed') forwardMonsterKilled(ev);
        }
      }
      sliceCursor = far.length > 0 ? (sliceCursor + chunk) % far.length : 0;
    }
    syncAuraRings();
    // Sanctuary rings breathe: the band + veil pulse gently
    // (the aura-ring pattern), so the ward-line reads alive
    // without flashing.
    for (const rec of sanctuaryRingRecs) {
      rec.bandMat.opacity = 0.45 + 0.15 * Math.sin(elapsed * 1.5 + rec.phase);
      rec.veilMat.opacity = 0.11 + 0.04 * Math.sin(elapsed * 1.5 + rec.phase);
    }
    // Sanctuary portals breathe with them: the glow disc and
    // the arch's emissive pulse on the same slow cycle.
    for (const rec of sanctuaryPortalRecs) {
      rec.glowMat.opacity = 0.42 + 0.14 * Math.sin(elapsed * 1.5 + rec.phase);
      if (rec.archMat.emissiveIntensity != null) {
        rec.archMat.emissiveIntensity = 0.8 + 0.25 * Math.sin(elapsed * 1.5 + rec.phase);
      }
    }
    updateRemains();
    updateOrbDrops();
    // Fly the monster projectiles against the hunter's live position.
    monsterShots.update(dt, { x: observer.x, z: observer.z });
    // Elemental rain: the aura made visible at range (visual-only).
    try { updateRain(dt); } catch { /* rain is dressing, never breaks the frame */ }
    // Elemental atmosphere: fighting a shadow (smoke) monster
    // rolls smoke haze in around the hunter; it clears after.
    // WS6: the haze state is generalised — a shadow/sand HIT
    // keeps its haze up for its seconds even after the monster
    // unspots or dies; otherwise the old shadow-combat behaviour.
    // In The Haven the haze target is 0 (suppression, R4).
    let shadowCombat = false;
    for (const m of monsters) {
      if (m.active && !m.dead && m.stats.element === 'shadow' && m.spotted
        && Math.hypot(m.x - observer.x, m.z - observer.z) < 40) { shadowCombat = true; break; }
    }
    elemental.update(dt, {
      t: elapsed,
      observerX: observer.x,
      observerY: heightAt(observer.x, observer.z),
      observerZ: observer.z,
      // The core-sun shines outward from the centre: the light
      // target is the observer's real 3D point, not the flat
      // (x, y, z) the old fields build.
      observer3D: liftedPoint(observer.x, observer.z, 1.7, heightAt),
      observerUp: sphereUpAtDeck(observer.x, observer.z),
      shadowCombat,
      haze: hazeStateFor({
        dimUntil: observer.dimUntil || 0,
        gustUntil: observer.gustUntil || 0,
        shadowCombat,
        inBase: observer.inBase,
      }),
    });
    // WS4 dressing tick: ambient particles + ambient life drift,
    // ooze pools bubble, court braziers breathe, spore-caps pulse.
    try { if (ambientParticles) ambientParticles.update(dt, elapsed); } catch { /* dressing never breaks the frame */ }
    try { if (ambientLife) ambientLife.update(dt, elapsed); } catch { /* dressing never breaks the frame */ }
    for (const lg of landmarkGroups) {
      try { animateLandmark(lg.group, elapsed, lg.seed); } catch { /* one bad landmark never breaks the frame */ }
    }
    for (const sp of sporeCaps) {
      const s = sp.base * (1 + 0.08 * Math.sin(elapsed * 1.1 + sp.phase));
      sp.mesh.scale.set(s / sp.base, s / sp.base, s / sp.base);
    }
    // Korus, on his throne.
    if (!korus.dead) {
      const evs = stepKorus(korus, dt, player);
      for (const ev of evs) {
        if (ev.kind === 'hit') {
          // Sky-bolt visual at the blast point — cosmetic only,
          // damage timing is unchanged (it lands with the bolt).
          if (ev.x != null && ev.z != null) {
            monsterShots.skyBolt({
              x: ev.x, z: ev.z, groundY: heightAt(ev.x, ev.z),
              color: ev.from === 'korus-bolt' ? 0xffe14d : 0x8a8a9a,
            });
          }
          if (opts.onPlayerHit) opts.onPlayerHit(ev.dmg, 'korus', 'boss');
        }
        if (opts.onKorusEvent) opts.onKorusEvent(ev);
      }
      korusFig.visible = !korus.dead;
    } else {
      korusFig.visible = false;
    }
  }

  function strikeHunter(px, pz, yaw, spec) {
    const active = monsters.filter((m) => m.active && !m.dead);
    return strike(active, px, pz, yaw, spec);
  }

  function damageKorus(dmg) {
    return damageKorusPure(korus, dmg);
  }

  function dispose() {
    for (const id of [...barSprites.keys()]) removeBar(id);
    for (const r of [...remains]) removeRemainsDisc(r.id);
    for (const rec of [...orbDropMeshes.values()]) {
      group.remove(rec.group);
      try { for (const c of rec.group.children) { c.geometry.dispose(); c.material.dispose(); } } catch { /* noop */ }
    }
    orbDropMeshes.clear();
    try { group.remove(rainLines); rainGeo.dispose(); rainLines.material.dispose(); } catch { /* noop */ }
    for (const ring of auraRings.values()) {
      try { ring.geo.dispose(); ring.mat.dispose(); } catch { /* noop */ }
      try { group.remove(ring.loop); } catch { /* noop */ }
    }
    auraRings.clear();
    // Sanctuary rings: remove + dispose every band, veil and
    // gold edge line (a second dispose() must be a no-op — the
    // list is emptied, and group.clear() below drops the rest).
    for (const rec of sanctuaryRingRecs) {
      try { group.remove(rec.group); } catch { /* noop */ }
      try {
        rec.group.traverse((o) => {
          if (o.geometry) o.geometry.dispose();
          if (o.material) o.material.dispose();
        });
      } catch { /* noop */ }
    }
    sanctuaryRingRecs.length = 0;
    // Sanctuary portals: remove + dispose every arch, disc and
    // foot-ring (a second dispose() must be a no-op — the list
    // is emptied, and group.clear() below drops the rest).
    for (const rec of sanctuaryPortalRecs) {
      try { group.remove(rec.group); } catch { /* noop */ }
      try {
        rec.group.traverse((o) => {
          if (o.geometry) o.geometry.dispose();
          if (o.material) o.material.dispose();
        });
      } catch { /* noop */ }
    }
    sanctuaryPortalRecs.length = 0;
    monsterShots.dispose();
    group.clear();
    figures.clear();
  }

  return {
    group, colliders,
    spawn: { ...(def.spawn || WORLD_SPAWN) },
    // No bounds: the inner sphere has no edge and no clamp.
    // The old circle bound was itself the Phase-1 bug
    // (a bare 295 the clamp never read); on a sphere there is
    // nothing to clamp against — walking past the old r550
    // keeps going and comes back around.
    bounds: null,
    groundHeight: heightAt,
    biomeAt,
    monsters, korus,
    setObserver, update, dispose, strikeHunter, damageKorus,
    // Elemental orb drops: the page pushes its live drop list
    // here (create/collect/prune live in elemental-orbs.js).
    setOrbDrops(drops) { syncOrbDrops(drops); },
    kind: 'walk', sky: def.sky, fog: def.fog,
    // WS4 sky dome (G-02): the video owns the sky when it loads,
    // the static image is the fallback, the flat tint stands
    // until either lands. setSkyTint is the page's per-frame
    // day/night retint, applied to the dome material instead of
    // scene.background.
    skyDome, landmarkGroups,
    // Phase 2c: the sanctuary rings as plain data — the page
    // reads them for its sanctuary predicate (isInsideAnyRing),
    // the HUD name, and the probe. { kind: 'zone' | 'structure',
    // name, x, z, r, element } — 14 zones + 19 structures.
    sanctuaryRings: sanctuaryRingRecs.map((rec) => ({
      kind: rec.kind, name: rec.name, x: rec.x, z: rec.z, r: rec.r, element: rec.element,
    })),
    // The sanctuary portals as plain data — the page reads them
    // for its walk-through trigger ({ name, x, z, element } —
    // one per safe zone, seated where the mesh stands).
    sanctuaryPortals: sanctuaryPortalRecs.map((rec) => ({
      name: rec.name, x: rec.x, z: rec.z, element: rec.element,
    })),
    setSkyTint(hex) { applySkyTint(skyDome, hex); },
    setSkyVideoTexture(tex) {
      skyVideoTex = tex || null;
      if (skyVideoTex) setSkyDomeMap(skyDome, skyVideoTex);
      else if (skyArtTex) setSkyDomeMap(skyDome, skyArtTex);
    },
    setSkyArtTexture(tex) {
      skyArtTex = tex || null;
      if (!skyVideoTex && skyArtTex) setSkyDomeMap(skyDome, skyArtTex);
    },
    // Elemental sky/fog colors for the page to apply each frame
    // (sun/moon cycle + smoke haze retint).
    cycleColors: () => elemental.colors(),
  };
}
