// app/earth-4/scene.js
// EARTH 4 — TRUE EARTH SIZE, FULLY EXPLORABLE (Merlin, 2026-11-12).
// Plain-three world module, mirroring the Earth 3 showcase's
// createWorld contract (app/new-earth/scene.js). No external
// assets beyond the repo's own textures and ESRI's open tiles.
// Mobile-first, Safari-safe. Export contract:
//   createWorld(canvas, cb) -> world API.
//
// WHAT THE WALKER SEES, HONESTLY:
//   * The ground under their feet is REAL Earth: heights from
//     the repo's topology PNG (real continents, real coastline),
//     colours from the repo's earth-day.jpg (real satellite
//     colours), and — when the network answers — real ESRI World
//     Imagery tiles draped over the patch. If the tiles fail,
//     the true-colour ground stays; nothing ever goes bare.
//   * The sky is the SHARED day/night law (lib/day-night.js) run
//     for the walker's CURRENT lat/lon — the sun above you is
//     where the real sun is above that place, right now.
//   * The wildlife is the world feed: real species from the
//     catalogue, spawned by GPS (spawn 250 m, despawn 300 m).
//   * The models are PROCEDURAL, built from the anatomy plan:
//     each real species is built at runtime from its compiled
//     numeric plan (lib/earth4/creature-plans.json) — body, head,
//     legs, wings, fins, cap and stem in their true arrangement,
//     at most 9 meshes per creature, wearing procedural fur /
//     feather / scale / skin maps, and breathing, walking, blinking
//     and turning its head on the real clock. The SPECIES is real
//     and the shape now follows its anatomy. Tap one to see what it is.

import * as THREE from 'three';
import { guardCanvasContext } from '../../lib/scene-context-guard.js';
import { dayNightFor, requestDayNightPlace, applyDayNightRig } from '../../lib/day-night.js';
import {
  creaturesNear,
  stepCreature,
  shouldDespawn,
  SPAWN_RADIUS_M,
  REFRESH_SECONDS,
} from '../../lib/earth4/spawner.js';
import {
  buildCreatureMesh,
  animateCreatureMesh,
  CREATURE_SHARED_GEOMETRIES,
} from '../../lib/earth4/creature-builder.js';
import CREATURE_PLANS from '../../lib/earth4/creature-plans.json';
import {
  START_PLACE,
  localFromLatLon,
  latLonFromLocal,
  heightAtLatLon,
  isWaterAtLatLon,
  grayAtLatLon,
  elevationForGray,
  sampleDayColor,
  tileGridSize,
  esriPatchUV,
  WATER_GRAY_MAX,
} from '../../lib/earth4/geography.js';
import { loadHeightData } from '../../lib/earth/heightmap.js';
import { esriTileUrl } from '../../lib/geo.js';
import { TERRAIN_TEXTURES } from '../../lib/terrain.js';

/* ============================================================
   Constants
   ============================================================ */

const PATCH_M = 640; // the ground patch under the walker, metres
const PATCH_HALF = PATCH_M / 2;
const PATCH_SEG = 80; // terrain mesh segments per side
const EYE = 1.7; // real eye height
const WALK_SPEED = 6; // Earth 2's walk speed — true metres per second
const FLY_SPEED = 22;
const REBASE_M = 160; // walk this far from the patch centre: re-centre
const GRAV = 18;
const JUMP_V = 6;
const ESRI_ZOOM = 16; // the close-up satellite layer
const OCEAN_Y = 0.12; // the sea plane sits just above the 0 m beaches

/* ============================================================
   Small pure helpers (no DOM — safe at module top level)
   ============================================================ */

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

/* ============================================================
   Canvas texture helpers (called inside createWorld — DOM ok)
   ============================================================ */

function softCircleTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.55, 'rgba(255,255,255,0.45)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

function cloudTexture() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 64;
  const g = c.getContext('2d');
  const blob = (x, y, r, a) => {
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, `rgba(255,255,255,${a})`);
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  };
  blob(40, 40, 26, 0.95); blob(64, 32, 30, 1); blob(90, 42, 24, 0.9);
  blob(58, 46, 22, 0.85); blob(78, 30, 18, 0.8);
  return new THREE.CanvasTexture(c);
}

// Decode an image URL to raw RGBA pixels (for the day texture).
function decodeImageToRGBA(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const c = document.createElement('canvas');
        c.width = img.naturalWidth; c.height = img.naturalHeight;
        const g = c.getContext('2d', { willReadFrequently: true });
        if (!g) return resolve(null);
        g.drawImage(img, 0, 0);
        const d = g.getImageData(0, 0, c.width, c.height);
        resolve({ data: d.data, w: c.width, h: c.height });
      } catch { resolve(null); }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

/* ============================================================
   World builders — each receives a ctx object and registers
   per-frame updaters into ctx.anim
   ============================================================ */

function buildSky(ctx) {
  const { scene, anim } = ctx;
  const geo = new THREE.SphereGeometry(900, 32, 16);
  const top = new THREE.Color(0x2e7cd6), mid = new THREE.Color(0x8ec8ee), hor = new THREE.Color(0xd8f0f7);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) / 900;
    if (y > 0.25) tmp.lerpColors(mid, top, Math.min(1, (y - 0.25) / 0.75));
    else tmp.lerpColors(hor, mid, clamp((y + 0.08) / 0.33, 0, 1));
    colors[i * 3] = tmp.r; colors[i * 3 + 1] = tmp.g; colors[i * 3 + 2] = tmp.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const skyDomeMat = new THREE.MeshBasicMaterial({
    vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false,
  });
  scene.add(new THREE.Mesh(geo, skyDomeMat));
  ctx.skyDomeMat = skyDomeMat;

  const sun = new THREE.Mesh(new THREE.CircleGeometry(55, 32),
    new THREE.MeshBasicMaterial({ color: 0xfff6d8, fog: false }));
  sun.position.set(420, 400, -680); sun.lookAt(0, 0, 0);
  scene.add(sun);
  ctx.sunDisc = sun;
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: ctx.tex.soft, color: 0xfff2c0, transparent: true, opacity: 0.85, fog: false, depthWrite: false,
  }));
  glow.scale.set(340, 340, 1); glow.position.copy(sun.position);
  scene.add(glow);
  ctx.sunGlow = glow;

  const clouds = [];
  for (let i = 0; i < 12; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({
      map: ctx.tex.cloud, transparent: true, opacity: 0.75 + ctx.rng() * 0.2, depthWrite: false,
    }));
    const w = 60 + ctx.rng() * 70;
    s.scale.set(w, w * 0.45, 1);
    s.position.set((ctx.rng() - 0.5) * 900, 95 + ctx.rng() * 55, (ctx.rng() - 0.5) * 900);
    s.userData.v = 1.5 + ctx.rng() * 2.5;
    scene.add(s); clouds.push(s);
  }
  anim.push((t, dt) => {
    for (const c of clouds) {
      c.position.x += c.userData.v * dt;
      if (c.position.x > 480) c.position.x = -480;
    }
  });
}

function buildOcean(ctx) {
  const { scene, anim } = ctx;
  // One flat sea at y = OCEAN_Y, big enough to cover the patch
  // and the fog. The terrain dips to -3 m where the topology
  // says water, so the plane reads as the sea; where the land
  // rises above it, the plane is hidden under the ground.
  const geo = new THREE.PlaneGeometry(1600, 1600, 32, 32);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshStandardMaterial({
    color: 0x2f9fd8, transparent: true, opacity: 0.82, roughness: 0.25, metalness: 0.1, depthWrite: false,
  });
  const sea = new THREE.Mesh(geo, mat);
  sea.position.set(0, OCEAN_Y, 0);
  scene.add(sea);
  ctx.ocean = sea;
  const sp = geo.attributes.position;
  const base = Float32Array.from(sp.array);
  anim.push((t) => {
    for (let i = 0; i < sp.count; i++) {
      const x = base[i * 3], z = base[i * 3 + 2];
      sp.array[i * 3 + 1] = Math.sin(x * 0.06 + t * 1.4) * 0.12 + Math.cos(z * 0.09 + t * 0.9) * 0.1;
    }
    sp.needsUpdate = true;
    mat.opacity = 0.78 + Math.sin(t * 0.8) * 0.05;
  });
}

// The terrain patch: real heights + real colours around the origin.
// Rebuilt on every rebase (the walker moves the world, not the
// other way round) and once when the heightmap/day texture land.
function buildTerrainPatch(ctx) {
  const { scene } = ctx;
  if (ctx.terrain) {
    scene.remove(ctx.terrain);
    ctx.terrain.geometry.dispose();
    if (ctx.terrain.material.map) ctx.terrain.material.map.dispose();
    ctx.terrain.material.dispose();
    ctx.terrain = null;
    ctx.esriTex = null;
  }
  const origin = ctx.S.origin;
  const geo = new THREE.PlaneGeometry(PATCH_M, PATCH_M, PATCH_SEG, PATCH_SEG);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const lx = pos.getX(i), lz = pos.getZ(i);
    const ll = latLonFromLocal(lx, lz, origin);
    const gray = ctx.heightCache
      ? grayAtLatLon(ll.lat, ll.lon, ctx.heightCache)
      : 25; // flat land until the real relief loads
    const h = ctx.heightCache ? elevationForGray(gray) : 0;
    pos.setY(i, h);
    if (gray < WATER_GRAY_MAX) tmp.setRGB(0.04, 0.22, 0.4); // seabed
    else if (h < 2) tmp.setRGB(0.85, 0.78, 0.55); // beach sand
    else if (ctx.dayCache) {
      const day = sampleDayColor(ll.lat, ll.lon, ctx.dayCache);
      tmp.setRGB(day.r, day.g, day.b); // the real colour of the place
    } else {
      tmp.setHSL(0.29, 0.5, 0.25 + Math.min(0.2, h / 2000));
    }
    colors[i * 3] = tmp.r; colors[i * 3 + 1] = tmp.g; colors[i * 3 + 2] = tmp.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 1, metalness: 0,
  });
  const mesh = new THREE.Mesh(geo, mat);
  scene.add(mesh);
  ctx.terrain = mesh;
  ctx.terrainMat = mat;
  loadEsriOverlay(ctx);
}

// The close-up true texture: ESRI World Imagery tiles over the
// patch. All-or-nothing per rebuild — if any tile fails, the
// real-colour vertex ground stays (never bare, never broken).
function loadEsriOverlay(ctx) {
  const origin = ctx.S.origin;
  if (Math.abs(origin.lat) > 85) return; // Mercator breaks at the poles
  const grid = tileGridSize(PATCH_M, origin.lat, ESRI_ZOOM);
  const uv = esriPatchUV(PATCH_HALF, origin, ESRI_ZOOM, grid);
  const canvas = document.createElement('canvas');
  canvas.width = grid * 256; canvas.height = grid * 256;
  const g = canvas.getContext('2d');
  if (!g) return;
  const total = grid * grid;
  let settled = 0;
  let failed = 0;
  const token = (ctx.esriToken || 0) + 1;
  ctx.esriToken = token;
  for (let dy = 0; dy < grid; dy++) {
    for (let dx = 0; dx < grid; dx++) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        if (token !== ctx.esriToken) return; // a newer patch superseded this
        g.drawImage(img, dx * 256, dy * 256);
        settled += 1;
        if (settled + failed === total && failed === 0 && ctx.terrainMat) {
          const tex = new THREE.CanvasTexture(canvas);
          tex.colorSpace = THREE.SRGBColorSpace;
          tex.repeat.set(uv.repeatX, uv.repeatY);
          tex.offset.set(uv.offsetX, uv.offsetY);
          ctx.terrainMat.map = tex;
          ctx.terrainMat.vertexColors = false;
          ctx.terrainMat.needsUpdate = true;
          ctx.esriTex = tex;
        }
      };
      img.onerror = () => {
        if (token !== ctx.esriToken) return;
        failed += 1;
        settled += 1;
      };
      img.src = esriTileUrl(uv.tileX + dx, uv.tileY + dy, ESRI_ZOOM);
    }
  }
}

/* ============================================================
   Procedural species models — built from the anatomy plan.
   Earth 4's creatures are real species, but their anatomy plans
   are prose, not GLBs, and real GLBs for all 1,262 species would
   be ~1.5–2.5 GB — far too much GPU-side for a phone. So each
   creature is built at runtime from its compiled numeric plan
   (lib/earth4/creature-plans.json, compiled from the anatomy
   build map by ~/workspace/earth4/build-creature-plans.py):
   primitive shapes, shared geometries and materials, at most 6
   meshes per creature. Colours are seeded by class (not the
   species' real colour — the dataset holds one for only 0.3%
   of species, so no colour is claimed).
   ============================================================ */

function makeCreatureMesh(c) {
  return buildCreatureMesh(c, CREATURE_PLANS);
}

function buildCreatures(ctx, S) {
  const { scene, anim } = ctx;
  const group = new THREE.Group();
  scene.add(group);
  ctx.creatureGroup = group;
  ctx.creatures = new Map(); // id -> { data, mesh }
  let refreshIn = 0;

  function removeCreature(id) {
    // Creature meshes use only the builder's shared geometries
    // and shared materials — nothing here is per-creature, so
    // removal disposes nothing.
    const live = ctx.creatures.get(id);
    if (!live) return;
    group.remove(live.mesh);
    ctx.creatures.delete(id);
  }

  function groundNow() {
    return ctx.ground;
  }

  anim.push((t, dt) => {
    refreshIn -= dt;
    if (refreshIn <= 0) {
      refreshIn = REFRESH_SECONDS;
      const fresh = creaturesNear(S.origin, S.pos.x, S.pos.z, SPAWN_RADIUS_M, groundNow());
      for (const d of fresh) {
        if (ctx.creatures.has(d.id)) continue;
        const mesh = makeCreatureMesh(d);
        mesh.position.set(d.x, d.y, d.z);
        mesh.rotation.y = d.heading;
        group.add(mesh);
        ctx.creatures.set(d.id, { data: d, mesh });
        ctx.hitMeshes.push(mesh.userData.hit);
      }
      for (const [id, live] of [...ctx.creatures]) {
        if (shouldDespawn(live.data, S.pos.x, S.pos.z)) {
          ctx.hitMeshes = ctx.hitMeshes.filter((m) => m.userData.creatureId !== id);
          removeCreature(id);
        }
      }
      ctx.creatureCount = ctx.creatures.size;
    }
    for (const live of ctx.creatures.values()) {
      live.data = stepCreature(live.data, dt, groundNow());
      live.mesh.position.set(live.data.x, live.data.y, live.data.z);
      live.mesh.rotation.y = live.data.heading;
      if (live.mesh.userData.wings) {
        // The wing geometries are pre-flattened at geometry level,
        // so rotation.x IS the flap angle: both tips rise and fall
        // together (rotation.z only swept them fore-aft).
        const f = Math.sin(t * 10 + live.mesh.userData.phase) * 0.55;
        live.mesh.userData.wings[0].rotation.x = f;
        live.mesh.userData.wings[1].rotation.x = -f;
      }
      if (live.data.aquatic) {
        live.mesh.rotation.z = Math.sin(t * 3 + live.mesh.userData.phase) * 0.12;
      }
      // One frame of life: breathing, gait, blinks, ear/tail
      // flicks, head turns, swimmer undulation — the body moving
      // like the animal it is, on the real clock.
      animateCreatureMesh(live.mesh, t, dt, live.data);
    }
  });

  // Re-derive every live creature's local position from its home
  // lat/lon after a rebase (the walk circuit rides its home).
  ctx.repositionCreatures = () => {
    for (const live of ctx.creatures.values()) {
      const home = localFromLatLon(live.data.lat, live.data.lon, S.origin);
      const w = live.data.walk;
      const x = home.x + Math.cos(w.a) * w.r;
      const z = home.z + Math.sin(w.a) * w.r;
      live.data = {
        ...live.data,
        x,
        z,
        y: live.data.aquatic ? -0.6 : ctx.ground.heightAt(x, z)
          + (live.data.flying ? 2 + live.data.sizeM * 2 : 0),
        walk: { ...w, cx: home.x, cz: home.z },
      };
      live.mesh.position.set(live.data.x, live.data.y, live.data.z);
    }
  };

  ctx.clearCreatures = () => {
    for (const id of [...ctx.creatures.keys()]) removeCreature(id);
    ctx.hitMeshes = [];
    ctx.creatureCount = 0;
  };
}

/* ============================================================
   createWorld — builds the scene, wires input, returns the API
   ============================================================ */

export function createWorld(canvas, cb) {
  if (!canvas) throw new Error('Earth 4: createWorld requires a canvas element.');
  cb = cb || {};
  const fireSpecies = (c) => { if (cb.onSpecies) cb.onSpecies(c); };
  const firePlace = (p) => { if (cb.onPlace) cb.onPlace(p); };

  let renderer;
  let contextGuard = null;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    // Context-loss guard (fleet rollout 2026-10-15): transient losses heal
    // in place; a loss that stays gone surfaces the FEED LOST fallback,
    // and the loop below freezes while the context is lost.
    contextGuard = guardCanvasContext(canvas, { label: 'EARTH 4' });
  } catch (err) {
    throw new Error('Earth 4: WebGL is unavailable in this browser (' +
      (err && err.message ? err.message : String(err)) + '). A WebGL-capable browser is required.');
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x9fd0e8);
  scene.fog = new THREE.Fog(0xcfe8f5, 200, 750);

  const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 2500);

  const hemiLight = new THREE.HemisphereLight(0xbfe3ff, 0x6fae5f, 0.85);
  scene.add(hemiLight);
  const sunLight = new THREE.DirectionalLight(0xfff2dd, 1.6);
  sunLight.position.set(220, 320, 140);
  scene.add(sunLight);

  // Day/night (Merlin, 2026-11-14): the shared law — the walker's
  // place is asked once (real location when granted, Sydney when
  // not); Earth 4 runs the cycle for the lat/lon the walker
  // actually stands on, so the sun above you is the real sun
  // above that place, right now.
  try { requestDayNightPlace(); } catch {}

  const ctx = {
    scene, camera, renderer,
    rng: mulberry32(20261112),
    anim: [],
    hitMeshes: [],
    tex: { soft: softCircleTexture(), cloud: cloudTexture() },
    heightCache: null,
    dayCache: null,
    esriTex: null,
    esriToken: 0,
    creatureCount: 0,
    dayNight: null,
  };

  buildSky(ctx);
  buildOcean(ctx);

  /* ---------------- state ---------------- */
  const S = {
    origin: { lat: START_PLACE.lat, lon: START_PLACE.lon },
    anchorName: START_PLACE.name,
    mode: 'walk',
    pos: new THREE.Vector3(0, EYE, 0),
    yaw: 0, pitch: 0,
    move: { x: 0, y: 0 }, lift: 0,
    jumpY: 0, jumpV: 0, grounded: true,
    dragId: null, dragging: false, wasDrag: false,
    lastX: 0, lastY: 0, downX: 0, downY: 0, downT: 0,
  };
  ctx.S = S;

  // The ground the spawner and the walker read: real relief once
  // the topology PNG decodes, flat dry land until then (so the
  // world is walkable from the first frame, never a sea).
  function makeGround(origin) {
    return {
      heightAt: (x, z) => {
        if (!ctx.heightCache) return 0;
        const ll = latLonFromLocal(x, z, origin);
        return heightAtLatLon(ll.lat, ll.lon, ctx.heightCache);
      },
      isWater: (x, z) => {
        if (!ctx.heightCache) return false;
        const ll = latLonFromLocal(x, z, origin);
        return isWaterAtLatLon(ll.lat, ll.lon, ctx.heightCache);
      },
    };
  }
  ctx.ground = makeGround(S.origin);

  buildTerrainPatch(ctx);
  buildCreatures(ctx, S);

  // The real Earth loads in behind the flat first frame: the
  // topology PNG (relief + coastline) and the day texture
  // (true colours). Either may fail — the world stays up on
  // the fallback either way, and the HUD says which is live.
  loadHeightData().then((cache) => {
    if (cache) {
      ctx.heightCache = cache;
      ctx.ground = makeGround(S.origin);
      buildTerrainPatch(ctx);
      S.pos.y = ctx.ground.heightAt(S.pos.x, S.pos.z) + EYE;
    }
    if (cb.onTerrain) cb.onTerrain({ heightmap: !!cache, day: !!ctx.dayCache, esri: !!ctx.esriTex });
  }).catch(() => {});
  decodeImageToRGBA(TERRAIN_TEXTURES.day).then((day) => {
    if (day) {
      ctx.dayCache = day;
      buildTerrainPatch(ctx);
    }
    if (cb.onTerrain) cb.onTerrain({ heightmap: !!ctx.heightCache, day: !!ctx.dayCache, esri: !!ctx.esriTex });
  });

  /* ---------------- rebase ---------------- */
  // The walker moves the world: past REBASE_M from the patch
  // centre, the origin jumps to the walker's real lat/lon and
  // the patch rebuilds around them. Local metres stay small
  // (float precision), while the lat/lon underneath stays exact
  // — that is how a true-scale planet fits on a phone.
  function rebase() {
    const ll = latLonFromLocal(S.pos.x, S.pos.z, S.origin);
    S.origin = { lat: ll.lat, lon: ll.lon };
    S.pos.x = 0; S.pos.z = 0;
    ctx.ground = makeGround(S.origin);
    buildTerrainPatch(ctx);
    ctx.repositionCreatures();
    S.pos.y = ctx.ground.heightAt(0, 0) + EYE + S.jumpY;
    // The anchor's NAME stays behind: the walker has left it,
    // so the HUD reads coordinates from here on.
    firePlace({ lat: S.origin.lat, lon: S.origin.lon, name: '' });
  }

  /* ---------------- movement ---------------- */
  const fwdV = new THREE.Vector3(), rightV = new THREE.Vector3(), fwd3V = new THREE.Vector3();
  function updateMovement(dt) {
    const sy = Math.sin(S.yaw), cy = Math.cos(S.yaw);
    fwdV.set(-sy, 0, -cy);
    rightV.set(cy, 0, sy);
    if (S.mode === 'walk') {
      const nx = S.pos.x + fwdV.x * S.move.y * WALK_SPEED * dt + rightV.x * S.move.x * WALK_SPEED * dt;
      const nz = S.pos.z + fwdV.z * S.move.y * WALK_SPEED * dt + rightV.z * S.move.x * WALK_SPEED * dt;
      // The sea is a wall on foot (Earth's rule: street level
      // stays dry — no swimming). Slide along the shoreline.
      const g = ctx.ground;
      if (!g.isWater(nx, nz)) { S.pos.x = nx; S.pos.z = nz; }
      else if (!g.isWater(nx, S.pos.z)) { S.pos.x = nx; }
      else if (!g.isWater(S.pos.x, nz)) { S.pos.z = nz; }
      if (!S.grounded || S.jumpY > 0) {
        S.jumpV -= GRAV * dt;
        S.jumpY += S.jumpV * dt;
        if (S.jumpY <= 0) { S.jumpY = 0; S.jumpV = 0; S.grounded = true; }
      }
      const targetY = g.heightAt(S.pos.x, S.pos.z) + EYE + S.jumpY;
      S.pos.y += (targetY - S.pos.y) * Math.min(1, dt * 8);
    } else {
      const cp = Math.cos(S.pitch);
      fwd3V.set(-sy * cp, Math.sin(S.pitch), -cy * cp);
      S.pos.addScaledVector(fwd3V, S.move.y * FLY_SPEED * dt);
      S.pos.addScaledVector(rightV, S.move.x * FLY_SPEED * dt);
      S.pos.y += S.lift * FLY_SPEED * dt;
      S.pos.y = clamp(S.pos.y, 2, 150);
    }
    if (Math.hypot(S.pos.x, S.pos.z) > REBASE_M) rebase();
  }

  /* ---------------- input: look-drag + species tap ---------------- */
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  function handleTap(cx, cy) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const hits = raycaster.intersectObjects(ctx.hitMeshes, false);
    if (!hits.length) return;
    const id = hits[0].object.userData.creatureId;
    const live = ctx.creatures.get(id);
    if (live) fireSpecies(live.data);
  }

  function onPointerDown(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    S.dragId = e.pointerId; S.dragging = true; S.wasDrag = false;
    S.lastX = e.clientX; S.lastY = e.clientY;
    S.downX = e.clientX; S.downY = e.clientY;
    S.downT = performance.now();
    try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* noop */ }
  }
  function onPointerMove(e) {
    if (!S.dragging || e.pointerId !== S.dragId) return;
    const dx = e.clientX - S.lastX, dy = e.clientY - S.lastY;
    S.lastX = e.clientX; S.lastY = e.clientY;
    if (!S.wasDrag && Math.hypot(e.clientX - S.downX, e.clientY - S.downY) > 10) {
      S.wasDrag = true;
    }
    if (!S.wasDrag) return;
    const s = S.mode === 'fly' ? 0.0042 : 0.0048;
    S.yaw -= dx * s;
    const lim = S.mode === 'fly' ? 1.5 : 1.25;
    S.pitch = clamp(S.pitch - dy * s, -lim, lim);
  }
  function onPointerUp(e) {
    if (e.pointerId !== S.dragId) return;
    S.dragging = false; S.dragId = null;
    const dtms = performance.now() - S.downT;
    const dist = Math.hypot(e.clientX - S.downX, e.clientY - S.downY);
    const wasDrag = S.wasDrag;
    S.wasDrag = false;
    if (!wasDrag && dist < 10 && dtms < 500) handleTap(e.clientX, e.clientY);
  }
  // Hawkins pattern: block page scroll/zoom gestures while touching the canvas
  function onTouchMove(e) { e.preventDefault(); }

  canvas.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerUp);
  canvas.addEventListener('touchmove', onTouchMove, { passive: false });

  /* ---------------- main loop ---------------- */
  const clock = new THREE.Clock();
  const euler = new THREE.Euler(0, 0, 0, 'YXZ');
  let raf = 0, readyFired = false, destroyed = false;

  function resize() {
    const w = canvas.clientWidth || window.innerWidth || 1;
    const h = canvas.clientHeight || window.innerHeight || 1;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
  }

  // Day/night refresh: the SAME real-clock cycle Earth 2 runs,
  // throttled to ~1 s, run for the lat/lon the walker stands on
  // — the sun above you is the real sun above that place.
  const SUN_DISC_DIST = Math.hypot(420, 400, 680);
  let lastCycleMs = 0;
  function refreshDayNight(nowMs) {
    if (nowMs - lastCycleMs < 1000) return;
    lastCycleMs = nowMs;
    try {
      const ll = latLonFromLocal(S.pos.x, S.pos.z, S.origin);
      const dn = dayNightFor(Date.now(), ll.lat, ll.lon);
      ctx.dayNight = dn;
      applyDayNightRig(
        { sunLight, hemiLight, fog: scene.fog, background: scene.background },
        dn.palette, dn.sunVec, dn.moon, dn.moonVec,
      );
      const sunUp = dn.sun.elevationDeg > -2;
      if (ctx.sunDisc) {
        ctx.sunDisc.position.set(
          dn.sunVec.x * SUN_DISC_DIST,
          dn.sunVec.y * SUN_DISC_DIST,
          dn.sunVec.z * SUN_DISC_DIST,
        );
        ctx.sunDisc.lookAt(0, 0, 0);
        ctx.sunDisc.visible = sunUp;
      }
      if (ctx.sunGlow && ctx.sunDisc) {
        ctx.sunGlow.position.copy(ctx.sunDisc.position);
        ctx.sunGlow.visible = sunUp;
      }
      if (ctx.skyDomeMat) {
        const dayF = 1 - dn.palette.night;
        ctx.skyDomeMat.color.setRGB(0.08 + 0.92 * dayF, 0.10 + 0.90 * dayF, 0.22 + 0.78 * dayF);
      }
    } catch {}
  }

  function tick() {
    if (destroyed) return;
    raf = requestAnimationFrame(tick);
    if (contextGuard && contextGuard.isLost()) return; // frozen while the context is gone
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;
    refreshDayNight(performance.now());
    updateMovement(dt);
    for (const u of ctx.anim) u(t, dt);
    camera.position.copy(S.pos);
    camera.quaternion.setFromEuler(euler.set(S.pitch, S.yaw, 0));
    renderer.render(scene, camera);
    if (!readyFired) { readyFired = true; if (cb.onReady) cb.onReady(); }
  }

  resize();
  tick();

  /* ---------------- public API ---------------- */
  function destroy() {
    destroyed = true;
    cancelAnimationFrame(raf);
    if (contextGuard) contextGuard.dispose();
    canvas.removeEventListener('pointerdown', onPointerDown);
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', onPointerUp);
    canvas.removeEventListener('touchmove', onTouchMove);
    const SHARED_GEO = CREATURE_SHARED_GEOMETRIES;
    scene.traverse((o) => {
      if (o.geometry && !SHARED_GEO.has(o.geometry)) o.geometry.dispose();
      const m = o.material;
      // Shared creature materials (userData.shared) survive: a
      // later world on the same page reuses them.
      const disposeMat = (x) => {
        if (x && !x.userData.shared) { if (x.map) x.map.dispose(); x.dispose(); }
      };
      if (Array.isArray(m)) m.forEach(disposeMat);
      else disposeMat(m);
    });
    for (const k of Object.keys(ctx.tex)) ctx.tex[k].dispose();
    ctx.anim.length = 0; ctx.hitMeshes = [];
    if (ctx.creatures) ctx.creatures.clear();
    renderer.dispose();
    if (renderer.forceContextLoss) renderer.forceContextLoss();
  }

  function walkerLatLon() {
    return latLonFromLocal(S.pos.x, S.pos.z, S.origin);
  }

  return {
    destroy,
    resize,
    getPosition() {
      const ll = walkerLatLon();
      return {
        x: S.pos.x, y: S.pos.y, z: S.pos.z,
        lat: ll.lat, lon: ll.lon,
        elev: ctx.ground.heightAt(S.pos.x, S.pos.z),
        anchor: S.anchorName,
      };
    },
    getSpeciesCount() { return ctx.creatureCount || 0; },
    getNearestSpecies() {
      let best = null;
      let bestD = Infinity;
      for (const live of ctx.creatures.values()) {
        const d = Math.hypot(live.data.x - S.pos.x, live.data.z - S.pos.z);
        if (d < bestD) { bestD = d; best = live.data; }
      }
      return best ? { ...best, dist: bestD } : null;
    },
    getDayNight() { return ctx.dayNight; },
    getTerrainStatus() {
      return {
        heightmap: !!ctx.heightCache,
        day: !!ctx.dayCache,
        esri: !!ctx.esriTex,
      };
    },
    setMode(m) { if (m === 'walk' || m === 'fly') S.mode = m; },
    getMode() { return S.mode; },
    setMove(x, y) {
      S.move.x = clamp(x, -1, 1); S.move.y = clamp(y, -1, 1);
    },
    setLift(v) { S.lift = clamp(v, -1, 1); },
    jump() {
      if (S.mode === 'walk' && S.grounded) { S.grounded = false; S.jumpV = JUMP_V; }
    },
    setAnchor(lat, lon, name) {
      S.origin = { lat, lon };
      S.anchorName = name || '';
      S.pos.set(0, EYE, 0);
      S.jumpY = 0; S.jumpV = 0; S.grounded = true;
      ctx.ground = makeGround(S.origin);
      buildTerrainPatch(ctx);
      ctx.clearCreatures();
      firePlace({ lat, lon, name: S.anchorName });
    },
    getAnchor() {
      return { lat: S.origin.lat, lon: S.origin.lon, name: S.anchorName };
    },
  };
}
