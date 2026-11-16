// World Engine — PrecisionEngine (completed).
//
// The original implementation referenced setupRenderer / setupCamera /
// setupLighting / setupControls but never defined them, so the class crashed
// on construction. This version implements all of them plus a procedural
// world builder driven by clamped AestheticEngine parameters.
//
// Lighting rule: light never drowns out texture or geometry. No bloom pass,
// no camera-facing halos — a single sun light, soft ambient, and restrained
// emissive accents only.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { guardCanvasContext } from '../scene-context-guard.js';
import { lifeSeedFromParams } from './life-seed.js';
import { buildFloraSpecimen, buildFaunaSpecimen } from './life-render.js';
// Render constants live in the 3D Engine datasheet
// (lib/world-engine/datasheets/engine.js) — the single source of truth.
import { ENGINE_RENDER } from './datasheets/engine.js';

// Seeded RNG for deterministic world generation.
function hashStr(s) {
  let h = 2166136261;
  const str = String(s || '');
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- Walk mode: pure helpers (unit-tested in tests/engine-walk.test.mjs) ---

/** Terrain displacement params for a seed/type/roughness — the same seeded
 *  offsets buildTerrain() has always used, factored out so walk mode can
 *  stand on the exact same ground the mesh shows. */
export function deriveTerrainParams(seed, type, roughness) {
  const terrainRand = mulberry32(hashStr(`terrain:${seed || 'unseeded'}`));
  return {
    ox: terrainRand() * 100,
    oz: terrainRand() * 100,
    f1: 0.06 + terrainRand() * 0.05,
    f2: 0.25 + terrainRand() * 0.15,
    peak: ENGINE_RENDER.terrain.peaks[type] ?? ENGINE_RENDER.terrain.peaks.plains,
    roughness: clampNum(roughness, 0.1, 1.0, 0.8),
  };
}

/** Ground height at (x, z) — the exact displacement buildTerrain() writes
 *  into the plane vertices. Returns 0 when no terrain params are known. */
export function computeGroundHeight(params, x, z) {
  if (!params) return 0;
  const { ox, oz, f1, f2, peak, roughness } = params;
  return (
    Math.sin((x + ox) * f1) * Math.cos((z + oz) * 0.07) * peak * roughness +
    Math.sin((x + ox) * f2 + (z + oz) * 0.2) * 1.6 * roughness
  );
}

/** Keep the walker inside the terrain: clamp each axis to ±halfBound. */
export function clampWalkPosition(x, z, halfBound) {
  const b = Math.abs(halfBound);
  return { x: Math.max(-b, Math.min(b, x)), z: Math.max(-b, Math.min(b, z)) };
}

const WALK_FORWARD_KEYS = new Set(['KeyW', 'ArrowUp']);
const WALK_BACK_KEYS = new Set(['KeyS', 'ArrowDown']);
const WALK_LEFT_KEYS = new Set(['KeyA', 'ArrowLeft']);
const WALK_RIGHT_KEYS = new Set(['KeyD', 'ArrowRight']);

/** One walk step: WASD/arrows move the walker in camera-relative yaw
 *  direction. Diagonal input is normalised so it is no faster than
 *  straight ahead. Returns the new { x, z } (input state untouched). */
export function walkStep(state, keys, dt, speed) {
  let fx = 0;
  let fz = 0;
  for (const k of keys) {
    if (WALK_FORWARD_KEYS.has(k)) { fx += -Math.sin(state.yaw); fz += -Math.cos(state.yaw); }
    else if (WALK_BACK_KEYS.has(k)) { fx += Math.sin(state.yaw); fz += Math.cos(state.yaw); }
    else if (WALK_LEFT_KEYS.has(k)) { fx += -Math.cos(state.yaw); fz += Math.sin(state.yaw); }
    else if (WALK_RIGHT_KEYS.has(k)) { fx += Math.cos(state.yaw); fz += -Math.sin(state.yaw); }
  }
  const len = Math.hypot(fx, fz);
  if (len === 0 || dt <= 0) return { x: state.x, z: state.z };
  const step = (speed * dt) / len;
  return { x: state.x + fx * step, z: state.z + fz * step };
}

/** Yaw/pitch (YXZ euler) matching a camera look direction. */
export function yawPitchFromDirection(dx, dy, dz) {
  return { yaw: Math.atan2(-dx, -dz), pitch: Math.asin(Math.max(-1, Math.min(1, dy))) };
}

/** Mode toggle: orbit <-> walk. */
export function nextWalkMode(mode) {
  return mode === 'walk' ? 'orbit' : 'walk';
}

function isTypingTarget(target) {
  if (!target || !target.tagName) return false;
  const tag = target.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || !!target.isContentEditable;
}

export class PrecisionEngine {
  constructor(containerElement, config = null) {
    this.container = containerElement;
    this.config = config || {};

    this.scene = new THREE.Scene();
    this.camera = null;
    this.renderer = null;
    this.clock = new THREE.Clock();

    this.entities = new Map();
    this.updatables = [];

    // Walk mode state (orbit stays the default). terrainParams is filled
    // by buildTerrain() so the walker stands on the real displaced mesh.
    this.walkMode = 'orbit';
    this.walker = { x: 0, z: 0, yaw: 0, pitch: 0 };
    this.walkKeys = new Set();
    this.walkDragging = false;
    this.walkLastPointer = { x: 0, y: 0 };
    this.terrainParams = null;

    this.init();
  }

  init() {
    this.setupRenderer();
    this.setupCamera();
    this.setupLighting();
    this.setupEnvironment();
    this.setupControls();
    this.setupWalkInput();

    this.renderLoop = this.renderLoop.bind(this);
    this.handleResize = this.handleResize.bind(this);

    window.addEventListener('resize', this.handleResize, false);
    this.renderer.setAnimationLoop(this.renderLoop);

    if (this.config && this.config.programName) {
      console.log(`Booting ${this.config.programName} sequence...`);
    }
  }

  setupRenderer() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    // Restrained tone mapping so bright accents stay localized.
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.container.appendChild(this.renderer.domElement);
    // Context-loss guard (fleet rollout 2026-10-15): transient losses heal
    // in place; a loss that stays gone surfaces the FEED LOST fallback,
    // and renderLoop() below freezes while the context is lost.
    this.contextGuard = guardCanvasContext(this.renderer.domElement, { label: 'WORLD ENGINE' });
  }

  setupCamera() {
    const w = this.container.clientWidth || 1;
    const h = this.container.clientHeight || 1;
    this.camera = new THREE.PerspectiveCamera(ENGINE_RENDER.camera.fov, w / h, ENGINE_RENDER.camera.near, ENGINE_RENDER.camera.far);
    this.camera.position.set(...ENGINE_RENDER.camera.position);
    this.camera.lookAt(...ENGINE_RENDER.camera.lookAt);
  }

  setupLighting() {
    const sunColor = new THREE.Color(this.config.sunColor || '#ffffff');
    const ambientIntensity = clampNum(this.config.ambientLightIntensity, 0.1, 2.0, 0.5);

    // Soft ambient base — never overpowering.
    const ambient = new THREE.AmbientLight(0xffffff, ambientIntensity * ENGINE_RENDER.ambientLightFactor);
    this.scene.add(ambient);
    this.entities.set('__ambient', ambient);

    // Single directional "sun". Intensity is capped; no bloom halo.
    const sun = new THREE.DirectionalLight(sunColor, 1.4);
    sun.position.set(...ENGINE_RENDER.sunLight.position);
    this.scene.add(sun);
    this.entities.set('__sun', sun);

    // Faint hemisphere fill for depth without wash-out.
    const hemi = new THREE.HemisphereLight(0x334455, 0x0a0a0a, 0.35);
    this.scene.add(hemi);
    this.entities.set('__hemi', hemi);
  }

  setupControls() {
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = ENGINE_RENDER.controls.enableDamping;
    this.controls.dampingFactor = ENGINE_RENDER.controls.dampingFactor;
    this.controls.minDistance = ENGINE_RENDER.controls.minDistance;
    this.controls.maxDistance = ENGINE_RENDER.controls.maxDistance;
    this.controls.maxPolarAngle = Math.PI * ENGINE_RENDER.controls.maxPolarAngleFactor; // stay above the ground plane
  }

  // Walk mode input: V toggles orbit/walk (the page button dispatches the
  // same toggle as a 'world-engine:toggle-walk' event), WASD/arrows move,
  // pointer-drag looks. Keys are ignored while typing in a form field, and
  // stuck keys clear on window blur. All listeners are removed in dispose().
  setupWalkInput() {
    this.handleWalkKeyDown = (e) => {
      if (isTypingTarget(e.target)) return;
      if (e.code === `Key${ENGINE_RENDER.walk.toggleKey}` && !e.repeat) {
        this.setWalkMode(nextWalkMode(this.walkMode));
        return;
      }
      if (this.walkMode !== 'walk') return;
      if (
        WALK_FORWARD_KEYS.has(e.code) || WALK_BACK_KEYS.has(e.code) ||
        WALK_LEFT_KEYS.has(e.code) || WALK_RIGHT_KEYS.has(e.code)
      ) {
        this.walkKeys.add(e.code);
        if (e.code.startsWith('Arrow')) e.preventDefault();
      }
    };
    this.handleWalkKeyUp = (e) => {
      this.walkKeys.delete(e.code);
    };
    this.handleWalkPointerDown = (e) => {
      if (this.walkMode !== 'walk') return;
      this.walkDragging = true;
      this.walkLastPointer = { x: e.clientX, y: e.clientY };
      try {
        this.renderer.domElement.setPointerCapture(e.pointerId);
      } catch (err) {
        // Older browsers without pointer capture: drag still tracks via window.
      }
    };
    this.handleWalkPointerMove = (e) => {
      if (!this.walkDragging || this.walkMode !== 'walk') return;
      const dx = e.clientX - this.walkLastPointer.x;
      const dy = e.clientY - this.walkLastPointer.y;
      this.walkLastPointer = { x: e.clientX, y: e.clientY };
      const sens = ENGINE_RENDER.walk.lookSensitivity;
      const maxPitch = ENGINE_RENDER.walk.maxPitch;
      this.walker.yaw -= dx * sens;
      this.walker.pitch = Math.max(-maxPitch, Math.min(maxPitch, this.walker.pitch - dy * sens));
    };
    this.handleWalkPointerUp = () => {
      this.walkDragging = false;
    };
    this.handleWalkBlur = () => {
      this.walkKeys.clear();
      this.walkDragging = false;
    };
    this.handleWalkToggleEvent = () => {
      this.setWalkMode(nextWalkMode(this.walkMode));
    };

    window.addEventListener('keydown', this.handleWalkKeyDown);
    window.addEventListener('keyup', this.handleWalkKeyUp);
    window.addEventListener('pointermove', this.handleWalkPointerMove);
    window.addEventListener('pointerup', this.handleWalkPointerUp);
    window.addEventListener('pointercancel', this.handleWalkPointerUp);
    window.addEventListener('blur', this.handleWalkBlur);
    window.addEventListener('world-engine:toggle-walk', this.handleWalkToggleEvent);
    this.renderer.domElement.addEventListener('pointerdown', this.handleWalkPointerDown);
  }

  /** Switch between orbit (default) and first-person walk. Entering walk
   *  drops the camera to eye height on the ground under its current
   *  position, facing the way it was looking; OrbitControls is disabled
   *  while walking so it cannot fight the walker. Returning to orbit
   *  restores the default orbit camera. The page listens for the
   *  'world-engine:walk-mode' event to swap its button + hint. */
  setWalkMode(mode) {
    const next = mode === 'walk' ? 'walk' : 'orbit';
    if (next === this.walkMode) return;
    this.walkMode = next;
    if (next === 'walk') {
      if (this.controls) this.controls.enabled = false;
      const spawn = clampWalkPosition(
        this.camera.position.x,
        this.camera.position.z,
        ENGINE_RENDER.walk.halfBound
      );
      const dir = new THREE.Vector3();
      this.camera.getWorldDirection(dir);
      const { yaw, pitch } = yawPitchFromDirection(dir.x, dir.y, dir.z);
      const maxPitch = ENGINE_RENDER.walk.maxPitch;
      this.walker = {
        x: spawn.x,
        z: spawn.z,
        yaw,
        pitch: Math.max(-maxPitch, Math.min(maxPitch, pitch)),
      };
      this.walkKeys.clear();
      this.applyWalkerToCamera();
    } else {
      this.walkKeys.clear();
      this.walkDragging = false;
      this.camera.position.set(...ENGINE_RENDER.camera.position);
      this.camera.lookAt(...ENGINE_RENDER.camera.lookAt);
      if (this.controls) {
        this.controls.target.set(...ENGINE_RENDER.camera.lookAt);
        this.controls.enabled = true;
        this.controls.update();
      }
    }
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new CustomEvent('world-engine:walk-mode', { detail: { mode: next } }));
    }
  }

  /** Ground height under (x, z) on the live terrain (0 before first build). */
  groundHeight(x, z) {
    return computeGroundHeight(this.terrainParams, x, z);
  }

  /** Put the camera at the walker's eye: terrain height + eye height. */
  applyWalkerToCamera() {
    this.camera.position.set(
      this.walker.x,
      this.groundHeight(this.walker.x, this.walker.z) + ENGINE_RENDER.walk.eyeHeight,
      this.walker.z
    );
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.set(this.walker.pitch, this.walker.yaw, 0);
  }

  /** One frame of walking: step, clamp inside the terrain, re-ground. */
  updateWalk(delta) {
    const dt = Math.max(0, Math.min(delta, 0.1));
    const stepped = walkStep(this.walker, this.walkKeys, dt, ENGINE_RENDER.walk.walkSpeed);
    const clamped = clampWalkPosition(stepped.x, stepped.z, ENGINE_RENDER.walk.halfBound);
    this.walker.x = clamped.x;
    this.walker.z = clamped.z;
    this.applyWalkerToCamera();
  }

  setupEnvironment() {
    this.scene.background = new THREE.Color(0x05070d);
    const density = clampNum(this.config.atmosphereDensity, 0, 1, 0.2);
    this.scene.fog = new THREE.FogExp2(0x05070d, 0.004 + density * 0.02);

    this.buildStars();
    this.buildTerrain();
    this.buildWeather();
  }

  buildStars() {
    const count = ENGINE_RENDER.stars.count;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const r = 400 + Math.random() * 300;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(Math.random());
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = Math.abs(r * Math.cos(phi)) * 0.6 + 10;
      positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({ color: 0xbfd4ff, size: 1.2, sizeAttenuation: false, transparent: true, opacity: 0.8 });
    const stars = new THREE.Points(geo, mat);
    this.addEntity('__stars', stars);
  }

  terrainColorFor(type) {
    switch (type) {
      case 'mountains': return 0x5a6b7a;
      case 'desert': return 0xc2a35c;
      case 'ocean': return 0x0d3b66;
      case 'alien': return 0x3d2b5c;
      default: return 0x2e4a3a; // plains
    }
  }

  buildTerrain() {
    const roughness = clampNum(this.config.terrainRoughness, 0.1, 1.0, 0.8);
    const type = this.config.terrainType || 'plains';
    // Seeded terrain: the world's seed drives the noise offsets, so every
    // seed grows a UNIQUE planet (previously hardcoded offsets meant every
    // "mountains/0.8" world was literally the same shape). The params are
    // kept on the instance so walk mode stands on this exact ground.
    const seed = this.config.seed || 'unseeded';
    this.terrainParams = deriveTerrainParams(seed, type, roughness);

    const geo = new THREE.PlaneGeometry(ENGINE_RENDER.terrain.size, ENGINE_RENDER.terrain.size, ENGINE_RENDER.terrain.segments, ENGINE_RENDER.terrain.segments);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      pos.setY(i, computeGroundHeight(this.terrainParams, x, z));
    }
    geo.computeVertexNormals();

    const mat = new THREE.MeshStandardMaterial({
      color: this.terrainColorFor(type),
      roughness: 0.95,
      metalness: 0.0,
      flatShading: true,
    });
    const terrain = new THREE.Mesh(geo, mat);
    this.addEntity('__terrain', terrain);

    // Water disc for ocean terrain — simple, no glow.
    if (type === 'ocean') {
      const water = new THREE.Mesh(
        new THREE.CircleGeometry(ENGINE_RENDER.water.radius, 48),
        new THREE.MeshStandardMaterial({ color: 0x0d4d8a, roughness: 0.3, metalness: 0.4, transparent: true, opacity: 0.85 })
      );
      water.rotation.x = -Math.PI / 2;
      water.position.y = ENGINE_RENDER.water.y;
      this.addEntity('__water', water);
    }

    // LIFE: seeded flora + fauna from the world's life seed.
    // Replaces the old single green cone cloned via Math.random().
    const life = lifeSeedFromParams(this.config);
    const propRand = mulberry32(hashStr(`props:${seed}`));
    if (life && (life.flora.length > 0 || life.fauna.length > 0)) {
      const lifeGroup = new THREE.Group();
      // Ground height function (matches the terrain displacement above)
      const groundH = (x, z) => computeGroundHeight(this.terrainParams, x, z);

      // Flora
      for (const flora of life.flora) {
        const specimen = buildFloraSpecimen(THREE, flora);
        const count = Math.round(10 + flora.density * 30);
        for (let i = 0; i < count; i++) {
          const inst = specimen.clone();
          const x = (propRand() - 0.5) * 140;
          const z = (propRand() - 0.5) * 140;
          inst.position.set(x, groundH(x, z), z);
          inst.rotation.y = propRand() * Math.PI * 2;
          inst.scale.setScalar(0.8 + propRand() * 0.9);
          lifeGroup.add(inst);
        }
      }
      // Fauna (a few representatives)
      for (const fauna of life.fauna.slice(0, 4)) {
        const specimen = buildFaunaSpecimen(THREE, fauna);
        const count = Math.min(5, fauna.count);
        for (let i = 0; i < count; i++) {
          const inst = specimen.clone(true);
          const x = (propRand() - 0.5) * 130;
          const z = (propRand() - 0.5) * 130;
          inst.position.set(x, groundH(x, z), z);
          inst.rotation.y = propRand() * Math.PI * 2;
          lifeGroup.add(inst);
        }
      }
      this.addEntity('__life', lifeGroup);
    } else {
      // Fallback: seeded props (not Math.random) for seedless worlds
      const density = clampNum(this.config.objectDensity, 0, 1, 0.5);
      const propCount = Math.floor(60 * density);
      const propGeo = new THREE.ConeGeometry(0.7, 2.4, 5);
      const propMat = new THREE.MeshStandardMaterial({ color: 0x1f3a2d, roughness: 1 });
      const props = new THREE.InstancedMesh(propGeo, propMat, Math.max(propCount, 1));
      const dummy = new THREE.Object3D();
      for (let i = 0; i < Math.max(propCount, 1); i++) {
        dummy.position.set((propRand() - 0.5) * 140, 1, (propRand() - 0.5) * 140);
        dummy.scale.setScalar(0.6 + propRand() * 1.4);
        dummy.rotation.y = propRand() * Math.PI;
        dummy.updateMatrix();
        props.setMatrixAt(i, dummy.matrix);
      }
      this.addEntity('__props', props);
    }
  }

  buildWeather() {
    const type = this.config.weatherType || 'clear';
    if (type === 'clear') return;
    const seed = this.config.seed || 'unseeded';
    const weatherRand = mulberry32(hashStr(`weather:${seed}`));
    const intensity = clampNum(this.config.precipitationIntensity, 0, 1, 0.3);
    const count = Math.floor(ENGINE_RENDER.weather.baseParticles * Math.max(intensity, ENGINE_RENDER.weather.minIntensity));
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count * 3; i++) {
      positions[i] = (weatherRand() - 0.5) * 120;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const color = type === 'snow' || type === 'ash' ? 0xdfe6ee : 0x7fb2ff;
    const mat = new THREE.PointsMaterial({ color, size: 0.35, transparent: true, opacity: 0.7 });
    const particles = new THREE.Points(geo, mat);
    const fallSpeed = type === 'storm' ? ENGINE_RENDER.weather.fallSpeed.storm : ENGINE_RENDER.weather.fallSpeed.other;
    particles.update = () => {
      const arr = geo.attributes.position.array;
      for (let i = 1; i < arr.length; i += 3) {
        arr[i] -= fallSpeed;
        if (arr[i] < -4) arr[i] = 40;
      }
      geo.attributes.position.needsUpdate = true;
    };
    this.addEntity('__weather', particles, true);
  }

  /**
   * Rebuild the world from a new (already clamped) parameter set.
   */
  applyWorldParams(params = {}) {
    this.config = { ...this.config, ...params };
    for (const id of ['__stars', '__terrain', '__water', '__props', '__weather']) {
      if (this.entities.has(id)) this.removeEntity(id);
    }
    // Sun color / ambient follow the new params.
    const sun = this.entities.get('__sun');
    if (sun && params.sunColor) sun.color.set(params.sunColor);
    const ambient = this.entities.get('__ambient');
    if (ambient && params.ambientLightIntensity !== undefined) {
      ambient.intensity = clampNum(params.ambientLightIntensity, 0.1, 2.0, 0.5) * 0.6;
    }
    this.buildStars();
    this.buildTerrain();
    this.buildWeather();
  }

  addEntity(id, object, hasUpdateFunction = false) {
    this.scene.add(object);
    this.entities.set(id, object);
    if (hasUpdateFunction && typeof object.update === 'function') {
      this.updatables.push(object);
    }
  }

  removeEntity(id) {
    const object = this.entities.get(id);
    if (object) {
      this.scene.remove(object);
      this.entities.delete(id);
      this.updatables = this.updatables.filter((obj) => obj !== object);
      if (object.geometry) object.geometry.dispose();
      if (object.material) {
        Array.isArray(object.material)
          ? object.material.forEach((mat) => mat.dispose())
          : object.material.dispose();
      }
    }
  }

  handleResize() {
    if (!this.container || !this.camera || !this.renderer) return;
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    if (!width || !height) return;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  renderLoop() {
    if (this.contextGuard && this.contextGuard.isLost()) return; // frozen while the context is gone
    const delta = this.clock.getDelta();
    const elapsedTime = this.clock.getElapsedTime();
    for (const object of this.updatables) {
      object.update(delta, elapsedTime);
    }
    if (this.walkMode === 'walk') {
      this.updateWalk(delta);
    } else if (this.controls) {
      this.controls.update();
    }
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    window.removeEventListener('resize', this.handleResize);
    window.removeEventListener('keydown', this.handleWalkKeyDown);
    window.removeEventListener('keyup', this.handleWalkKeyUp);
    window.removeEventListener('pointermove', this.handleWalkPointerMove);
    window.removeEventListener('pointerup', this.handleWalkPointerUp);
    window.removeEventListener('pointercancel', this.handleWalkPointerUp);
    window.removeEventListener('blur', this.handleWalkBlur);
    window.removeEventListener('world-engine:toggle-walk', this.handleWalkToggleEvent);
    if (this.renderer && this.renderer.domElement) {
      this.renderer.domElement.removeEventListener('pointerdown', this.handleWalkPointerDown);
    }
    if (this.contextGuard) this.contextGuard.dispose();
    if (this.renderer) this.renderer.setAnimationLoop(null);
    for (const id of Array.from(this.entities.keys())) this.removeEntity(id);
    this.entities.clear();
    this.updatables = [];
    if (this.controls) this.controls.dispose();
    if (this.container && this.renderer && this.renderer.domElement) {
      this.container.removeChild(this.renderer.domElement);
    }
    if (this.renderer) this.renderer.dispose();
  }
}

function clampNum(val, min, max, fallback) {
  const num = typeof val === 'number' ? val : parseFloat(val);
  return Number.isFinite(num) ? Math.max(min, Math.min(max, num)) : fallback;
}
