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

    this.init();
  }

  init() {
    this.setupRenderer();
    this.setupCamera();
    this.setupLighting();
    this.setupEnvironment();
    this.setupControls();

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
    this.camera = new THREE.PerspectiveCamera(55, w / h, 0.1, 2000);
    this.camera.position.set(0, 16, 34);
    this.camera.lookAt(0, 0, 0);
  }

  setupLighting() {
    const sunColor = new THREE.Color(this.config.sunColor || '#ffffff');
    const ambientIntensity = clampNum(this.config.ambientLightIntensity, 0.1, 2.0, 0.5);

    // Soft ambient base — never overpowering.
    const ambient = new THREE.AmbientLight(0xffffff, ambientIntensity * 0.6);
    this.scene.add(ambient);
    this.entities.set('__ambient', ambient);

    // Single directional "sun". Intensity is capped; no bloom halo.
    const sun = new THREE.DirectionalLight(sunColor, 1.4);
    sun.position.set(30, 40, 20);
    this.scene.add(sun);
    this.entities.set('__sun', sun);

    // Faint hemisphere fill for depth without wash-out.
    const hemi = new THREE.HemisphereLight(0x334455, 0x0a0a0a, 0.35);
    this.scene.add(hemi);
    this.entities.set('__hemi', hemi);
  }

  setupControls() {
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.06;
    this.controls.minDistance = 8;
    this.controls.maxDistance = 120;
    this.controls.maxPolarAngle = Math.PI * 0.495; // stay above the ground plane
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
    const count = 900;
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
    // "mountains/0.8" world was literally the same shape).
    const seed = this.config.seed || 'unseeded';
    const terrainRand = mulberry32(hashStr(`terrain:${seed}`));
    const ox = terrainRand() * 100, oz = terrainRand() * 100;
    const f1 = 0.06 + terrainRand() * 0.05, f2 = 0.25 + terrainRand() * 0.15;

    const geo = new THREE.PlaneGeometry(160, 160, 96, 96);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const peak = type === 'mountains' ? 14 : type === 'desert' ? 5 : 3;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const h =
        Math.sin((x + ox) * f1) * Math.cos((z + oz) * 0.07) * peak * roughness +
        Math.sin((x + ox) * f2 + (z + oz) * 0.2) * 1.6 * roughness;
      pos.setY(i, h);
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
        new THREE.CircleGeometry(80, 48),
        new THREE.MeshStandardMaterial({ color: 0x0d4d8a, roughness: 0.3, metalness: 0.4, transparent: true, opacity: 0.85 })
      );
      water.rotation.x = -Math.PI / 2;
      water.position.y = 0.4;
      this.addEntity('__water', water);
    }

    // LIFE: seeded flora + fauna from the world's life seed.
    // Replaces the old single green cone cloned via Math.random().
    const life = lifeSeedFromParams(this.config);
    const propRand = mulberry32(hashStr(`props:${seed}`));
    if (life && (life.flora.length > 0 || life.fauna.length > 0)) {
      const lifeGroup = new THREE.Group();
      // Ground height function (matches the terrain displacement above)
      const groundH = (x, z) =>
        Math.sin((x + ox) * f1) * Math.cos((z + oz) * 0.07) * peak * roughness +
        Math.sin((x + ox) * f2 + (z + oz) * 0.2) * 1.6 * roughness;

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
    const count = Math.floor(2500 * Math.max(intensity, 0.05));
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count * 3; i++) {
      positions[i] = (weatherRand() - 0.5) * 120;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const color = type === 'snow' || type === 'ash' ? 0xdfe6ee : 0x7fb2ff;
    const mat = new THREE.PointsMaterial({ color, size: 0.35, transparent: true, opacity: 0.7 });
    const particles = new THREE.Points(geo, mat);
    const fallSpeed = type === 'storm' ? 0.9 : 0.35;
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
    if (this.controls) this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    window.removeEventListener('resize', this.handleResize);
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
