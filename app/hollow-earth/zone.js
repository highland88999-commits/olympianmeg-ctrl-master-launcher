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
 *     the ground itself shows the blends, never a seam.
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
 * opts: { gateOpen?, freeRoam?, onPlayerHit(dmg, from, archetype),
 *         onMonsterKilled(monster), onHazard(hazard),
 *         onKorusEvent(ev), onSpotted(monster, via) }
 * Returns { group, colliders, spawn, bounds, groundHeight,
 *   biomeAt, monsters, korus, setObserver, update, dispose,
 *   strikeHunter, damageKorus, kind, sky, fog, cycleColors }.
 */
import * as ThreeJS from 'three';
import { createHeightFunction, spanSeatY } from '../star-wars/zone.js';
import { biomeWeights, biomeAt, BIOMES } from './biomes.js';
import { buildLandmark, buildAmbient } from './landmarks.js';
import {
  spawnField, createMonster, stepMonster, damageMonster, strike,
  createKorus, stepKorus, damageKorus as damageKorusPure,
  MONSTER_MODELS, KORUS_MODEL,
  WORLD_SPAWN, ACTIVATE_R, DEACTIVATE_R, mulberry32,
  separateFromPlayer,
} from './spawns.js';
import { kickOffGlb, preloadGlb } from './model-loader.js';
import { WATCHER, watcherGazeYaw, watcherBlinkOpen, watcherLaughing } from './watcher.js';
import { buildElemental } from './elemental.js';
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

  // --- terrain: radial disc, vertex colours from the biome field ---
  const radius = def.worldRadius || 340;
  const rings = 72;
  const segs = 96;
  const positions = [];
  const colors = [];
  const uvs = [];
  const indices = [];
  for (let ri = 0; ri <= rings; ri++) {
    const r = (ri / rings) * radius;
    for (let si = 0; si <= segs; si++) {
      const a = (si / segs) * Math.PI * 2;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      positions.push(x, heightAt(x, z), z);
      const w = biomeWeights(x, z);
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
      uvs.push(x / radius * 0.5 + 0.5, z / radius * 0.5 + 0.5);
    }
  }
  const row = segs + 1;
  for (let ri = 0; ri < rings; ri++) {
    for (let si = 0; si < segs; si++) {
      const a = ri * row + si;
      const b = a + 1;
      const c = a + row;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  const geo = new R.BufferGeometry();
  geo.setAttribute('position', new R.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new R.Float32BufferAttribute(colors, 3));
  geo.setAttribute('uv', new R.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  const terrain = new R.Mesh(geo, new R.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
  group.add(terrain);

  // --- elemental light + atmosphere (2026-10-26 rework): this
  // module IS the world's lighting — the world shipped with
  // zero scene lights, so no band could ever read as its
  // families' home. Sun/moon cycle, acid rivers, brimstone
  // vents, poison veins, lightning storms, smoke haze. The
  // inverted horizon stays; the static core-sun is replaced
  // by the cycling sun/moon (same sky role, now alive).
  const elemental = buildElemental(R, {
    heightAt,
    biomeAt: (x, z) => biomeAt(x, z).dominant,
    rng,
  });
  group.add(elemental.group);
  group.add(buildAmbient('inverted-horizon', R, T));

  // --- landmarks, seated, never hovering ---
  for (const lm of def.landmarks || []) {
    const built = buildLandmark(lm.type, R, T);
    const seatY = spanSeatY(heightAt, lm.x, lm.z, built.userData.colliderR || 2, { clampDrop: 1.5 });
    built.position.set(lm.x, seatY - 0.3, lm.z);
    built.rotation.y = lm.ry || 0;
    built.scale.setScalar(lm.s || 1);
    group.add(built);
    const cr = (built.userData.colliderR || 0) * (lm.s || 1);
    if (cr > 0) colliders.push({ x: lm.x, z: lm.z, r: cr });
  }

  // --- scatter: only where its biome holds weight ---
  for (const sc of def.scatter || []) {
    for (let i = 0; i < (sc.count || 0); i++) {
      const a = rng() * Math.PI * 2;
      const r = sc.minR + Math.sqrt(rng()) * ((sc.maxR || 290) - sc.minR);
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      const w = biomeWeights(x, z);
      if ((w[sc.biome] || 0) < 0.35) continue;
      const s = sc.size[0] + rng() * (sc.size[1] - sc.size[0]);
      const y = heightAt(x, z);
      let piece;
      if (sc.kind === 'ooze-bubble' || sc.kind === 'spore-cap') {
        piece = new R.Mesh(
          new R.SphereGeometry(0.5 * s, 8, 6),
          new R.MeshStandardMaterial({ color: SCATTER_COLOR[sc.kind] || 0x888888, roughness: 0.8 })
        );
        piece.position.set(x, y + 0.3 * s, z);
      } else if (sc.kind === 'storm-crystal' || sc.kind === 'frost-shard') {
        piece = new R.Mesh(
          new R.ConeGeometry(0.5 * s, 2.2 * s, 5),
          new R.MeshStandardMaterial({ color: SCATTER_COLOR[sc.kind], emissive: sc.kind === 'frost-shard' ? 0x4a7a8a : 0x887a00, emissiveIntensity: 0.5 })
        );
        piece.position.set(x, y + 1.1 * s, z);
      } else {
        piece = new R.Mesh(
          new R.CylinderGeometry(0.4 * s, 0.7 * s, 1.6 * s, 6),
          new R.MeshStandardMaterial({ color: SCATTER_COLOR[sc.kind] || 0x888888, roughness: 1 })
        );
        piece.position.set(x, y + 0.8 * s, z);
      }
      group.add(piece);
      if (SCATTER_SOLID[sc.kind]) colliders.push({ x, z, r: 0.7 * s });
    }
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
  const records = spawnField(def.seed || 77701, { habitatAt: (x, z) => biomeAt(x, z).dominant });
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
  const observer = { x: WORLD_SPAWN.x, z: WORLD_SPAWN.z, quiet: 1, noise: null, inBase: false };
  for (const key of new Set([
    ...PLACED_FIELD_KEYS.map((k) => (MONSTER_MODELS[k] || {}).url).filter(Boolean),
    KORUS_MODEL.url, WATCHER.model.url,
  ])) preloadGlb(key);

  // Behavior clock (seconds) for breathe/blink/sway/watcher cycles.
  let elapsed = 0;

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
    fig.rotation.z = clothSway(elapsed, 0.5, seed).swayZ;
    fig.rotation.y = m.faceYaw || 0;
    fig.visible = !m.dead;
    const yaw = m.faceYaw || 0;
    fig.position.set(
      m.x + Math.sin(yaw) * flinch * 0.3 - Math.sin(yaw) * lunge * 0.35,
      heightAt(m.x, m.z) + (m.stats.flyHeight || 0) + pose.bob,
      m.z + Math.cos(yaw) * flinch * 0.3 - Math.cos(yaw) * lunge * 0.35,
    );
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
        bar.sprite.position.set(fig.position.x, fig.position.y + (m.stats.scaleM || 2.5) + 0.9, fig.position.z);
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
  korusFig.position.set(korus.x, heightAt(korus.x, korus.z), korus.z);
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
  watcherFig.position.set(WATCHER.pos.x, heightAt(WATCHER.pos.x, WATCHER.pos.z), WATCHER.pos.z);
  group.add(watcherFig);
  kickOffGlb(watcherFig, WATCHER.model.url, WATCHER.model.height);
  let watcherWasLaughing = false;

  function setObserver(o) {
    if (o.x != null) observer.x = o.x;
    if (o.z != null) observer.z = o.z;
    if (o.quiet != null) observer.quiet = o.quiet;
    if ('noise' in o) observer.noise = o.noise;
    if (o.inBase != null) observer.inBase = o.inBase;
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
        if (figures.has(m.id)) { const f = figures.get(m.id); f.visible = false; }
        removeBar(m.id);
        continue;
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
      const evs = stepMonster(m, dt, player, rng, {
        losClear: (ax, az, bx, bz) => losClear(heightAt, ax, az, bx, bz),
        inBase: observer.inBase,
        noise: observer.noise,
        quiet: observer.quiet,
      });
      for (const ev of evs) {
        if (ev.kind === 'hit') m.attackT = elapsed; // drives the attack lunge
        if (ev.kind === 'hit' && opts.onPlayerHit) opts.onPlayerHit(ev.dmg, ev.from, ev.archetype);
        if (ev.kind === 'hazard' && opts.onHazard) opts.onHazard(ev);
        if (ev.kind === 'spotted' && opts.onSpotted) opts.onSpotted(m, ev.via);
      }
      // Solid characters: a ground monster may never stand inside
      // the hunter's own circle — it is pushed out to its
      // footprint + body radius (flyers ride above it, untouched).
      if (!m.stats.flyHeight) separateFromPlayer(m, observer.x, observer.z);
      // Keep monsters out of the sanctuary ring and inside bounds.
      const bd = Math.hypot(m.x, m.z);
      if (bd > (def.boundsRadius || 295)) {
        m.x *= (def.boundsRadius || 295) / bd;
        m.z *= (def.boundsRadius || 295) / bd;
      }
      syncFigure(m, dt);
    }
    // Elemental atmosphere: fighting a shadow (smoke) monster
    // rolls smoke haze in around the hunter; it clears after.
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
      shadowCombat,
    });
    // Korus, on his throne.
    if (!korus.dead) {
      const evs = stepKorus(korus, dt, player);
      for (const ev of evs) {
        if (ev.kind === 'hit' && opts.onPlayerHit) opts.onPlayerHit(ev.dmg, 'korus', 'boss');
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
    group.clear();
    figures.clear();
  }

  return {
    group, colliders,
    spawn: { ...(def.spawn || WORLD_SPAWN) },
    bounds: def.boundsRadius || 295,
    groundHeight: heightAt,
    biomeAt,
    monsters, korus,
    setObserver, update, dispose, strikeHunter, damageKorus,
    kind: 'walk', sky: def.sky, fog: def.fog,
    // Elemental sky/fog colors for the page to apply each frame
    // (sun/moon cycle + smoke haze retint).
    cycleColors: () => elemental.colors(),
  };
}
