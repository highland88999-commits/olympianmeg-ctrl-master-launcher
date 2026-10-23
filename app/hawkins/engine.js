// HAWKINS — The Vecna Hunt: Three.js engine module.
// Open world. Two dimensions. Hunt demogorgons & demo-bats.
// Gather 5 clock traces. Worlds converge. Capture Vecna.

import * as THREE from 'three';
import { guardCanvasContext } from '../../lib/scene-context-guard.js';
import { hawkinsModel, HAWKINS_PLAYER_CHARACTERS } from '../../lib/hawkins/models.js';
import { instantiateHawkins, prefetchHawkins } from '../../lib/hawkins/loader.js';

const EYE = 7;
const TRACES_NEEDED = 5;

const PAL = {
  hawkins: { fog: 0x0a0005, fogD: 0.005,  sky: 0x050005, ash: 0x553333, amb: 0x220a12 },
  upside:  { fog: 0x1c0310, fogD: 0.0075, sky: 0x0d0208, ash: 0x3a1a2a, amb: 0x0a0a22 },
};

function makeGlowTex() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
const GLOW_TEX = () => makeGlowTex();

export function createEngine(canvas, hooks) {
  const engine = {
    canvas, hooks,
    running: false, raf: 0,
    scene: null, camera: null, renderer: null, clock: null,
    // state (mirrors the standalone build)
    player: null, keys: {}, pointerLocked: false,
    dimension: 'hawkins', convergence: 0, dimTransition: 0,
    demogorgons: [], bats: [], tracers: [], traces: [],
    portal: null,
    vecna: null, mindflayer: null, vecnaRevealed: false, vecnaActive: false, vecnaCaptureHeld: 0,
    bike: null,
    tracesCollected: 0, wave: 1, kills: 0, waveSpawned: 0, waveTimer: 0,
    colliders: [], blasts: [],
    lightningLight: null, skyFlash: null, bloodSun: null, ambient: null,
    ash: null, spores: null, flashlight: null, muzzle: null,
    shakeAmt: 0, isTouch: false,
    hudTimer: 0,
    perspective: 'first', // 'first' | 'third' — camera perspective toggle
    playerAvatar: null,
    // Tripo GLB characters (lib/hawkins): the selected player character
    // and its pose handle. _glbAlive gates async loads after dispose.
    playerCharacter: 'eleven', avatarPose: null, _avatarLoadSeq: 0,
    _glbAlive: true,
  };

  /* ---------------- boot ---------------- */
  engine.boot = function () {
    const E = engine;
    E.isTouch = 'ontouchstart' in window;
    E.clock = new THREE.Clock();
    E.scene = new THREE.Scene();
    E.scene.background = new THREE.Color(PAL.hawkins.sky);
    E.scene.fog = new THREE.FogExp2(PAL.hawkins.fog, PAL.hawkins.fogD);
    E.camera = new THREE.PerspectiveCamera(74, 1, 0.1, 6000);
    E.renderer = new THREE.WebGLRenderer({ canvas: E.canvas, antialias: true, powerPreference: 'high-performance' });
    // Context-loss guard (fleet rollout 2026-10-15): transient losses heal
    // in place; a loss that stays gone surfaces the FEED LOST fallback,
    // and the loop below freezes while the context is lost.
    E.contextGuard = guardCanvasContext(E.canvas, { label: 'HAWKINS' });
    E.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    E.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    E.renderer.toneMappingExposure = 1.15;
    E.renderer.outputColorSpace = THREE.SRGBColorSpace;
    E.renderer.shadowMap.enabled = true;
    E.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    E.player = {
      pos: new THREE.Vector3(0, 0, 420), yaw: Math.PI, pitch: 0,
      health: 100, maxHealth: 100, speed: 30,
      ammo: 8, magSize: 8, reloading: false,
      lastRegen: 0, fireCooldown: 0, alive: true,
    };

    E.buildLights(); E.buildGround(); E.buildRoad(); E.buildHawkins();
    E.buildAsh(); E.buildSpores(); E.buildFlashlight(); E.buildMuzzle();
    E.buildPlayerAvatar();
    // The placeholder above is the stand-in only until the selected
    // Tripo character GLB lands (async); the GLB then takes the slot.
    E.setPlayerCharacter(E.playerCharacter);
    // Warm the other character downloads while the menu is up.
    for (const c of HAWKINS_PLAYER_CHARACTERS) prefetchHawkins(c.id);
    E.bindInput();
    E.resize();
  };

  // Load (or switch) the player's Tripo character. The placeholder
  // figure holds the slot until the GLB is ready; if the load fails
  // the placeholder simply stays — the game never waits on it.
  engine.setPlayerCharacter = function (id) {
    const E = engine;
    const entry = hawkinsModel(id);
    if (!entry || entry.role !== 'player') return;
    E.playerCharacter = id;
    const seq = ++E._avatarLoadSeq;
    instantiateHawkins(id).then((handle) => {
      if (!E._glbAlive || !handle || seq !== E._avatarLoadSeq) {
        if (handle) handle.dispose();
        return;
      }
      if (E.avatarPose && E.avatarPose !== handle) E.avatarPose.dispose();
      E.avatarPose = handle;
      E.setPlayerAvatarModel(handle.group);
      E.hooks.feed('you are ' + entry.name.toUpperCase());
    });
  };

  /* ---------------- player avatar (3rd person) ---------------- */
  // Placeholder figure until the Tripo3D character GLBs land; then this
  // group gets replaced by the loaded model via E.setPlayerAvatarModel().
  engine.buildPlayerAvatar = function () {
    const E = engine;
    const g = new THREE.Group();
    const cloth = new THREE.MeshStandardMaterial({ color: 0x1a1a22, roughness: 0.85 });
    const skin = new THREE.MeshStandardMaterial({ color: 0x2a2a33, roughness: 0.7 });
    const glow = new THREE.MeshBasicMaterial({ color: 0xff3344 });
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 2.0, 5.5, 8), cloth);
    torso.position.y = 8.2; torso.castShadow = true; g.add(torso);
    for (const s of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.55, 5.5, 6), cloth);
      leg.position.set(s * 0.9, 2.75, 0); leg.castShadow = true; g.add(leg);
      leg.userData.side = s;
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.45, 5, 6), cloth);
      arm.position.set(s * 2.4, 8.2, 0); arm.rotation.z = s * 0.12; arm.castShadow = true; g.add(arm);
    }
    const head = new THREE.Mesh(new THREE.SphereGeometry(1.3, 10, 8), skin);
    head.position.y = 12.4; head.castShadow = true; g.add(head);
    const visor = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.35, 0.3), glow);
    visor.position.set(0, 12.5, 1.15); g.add(visor);
    g.visible = false;
    E.scene.add(g);
    E.playerAvatar = g;
  };

  // Swap the placeholder for a loaded character GLB (Tripo3D). The model
  // is scaled to ~13 units tall and parented so the toggle keeps working.
  engine.setPlayerAvatarModel = function (model) {
    const E = engine;
    if (E.playerAvatar) E.scene.remove(E.playerAvatar);
    model.visible = (E.perspective === 'third');
    E.scene.add(model);
    E.playerAvatar = model;
  };

  engine.togglePerspective = function () {
    const E = engine;
    E.perspective = E.perspective === 'first' ? 'third' : 'first';
    if (E.playerAvatar) E.playerAvatar.visible = (E.perspective === 'third');
    E.hooks.feed(E.perspective === 'third' ? 'THIRD PERSON' : 'FIRST PERSON');
    E.hooks.onPerspective(E.perspective);
    return E.perspective;
  };

  // Where shots visually originate: the camera in 1st person, the
  // player's eye line in 3rd person. Hit detection already uses P.pos.
  engine.getShotOrigin = function () {
    const E = engine;
    if (E.perspective === 'third')
      return new THREE.Vector3(E.player.pos.x, EYE + 4, E.player.pos.z);
    return E.camera.position.clone();
  };

  engine.resize = function () {
    const w = engine.canvas.clientWidth || window.innerWidth;
    const h = engine.canvas.clientHeight || window.innerHeight;
    engine.camera.aspect = w / h;
    engine.camera.updateProjectionMatrix();
    engine.renderer.setSize(w, h, false);
  };

  /* ---------------- world builders ---------------- */
  engine.buildLights = function () {
    const E = engine;
    E.ambient = new THREE.AmbientLight(PAL.hawkins.amb, 0.7); E.scene.add(E.ambient);
    const moon = new THREE.DirectionalLight(0x5a1020, 0.35);
    moon.position.set(-300, 500, -600); E.scene.add(moon);
    E.bloodSun = new THREE.Mesh(new THREE.SphereGeometry(70, 24, 24),
      new THREE.MeshBasicMaterial({ color: 0x880000, fog: false }));
    E.bloodSun.position.set(0, 620, -2200); E.scene.add(E.bloodSun);
    E.lightningLight = new THREE.PointLight(0xff2222, 0, 7000);
    E.lightningLight.position.set(0, 900, 0); E.scene.add(E.lightningLight);
    E.skyFlash = new THREE.AmbientLight(0x110011, 0.5); E.scene.add(E.skyFlash);
  };

  engine.buildGround = function () {
    const E = engine;
    const g1 = new THREE.Mesh(new THREE.PlaneGeometry(4000, 7000),
      new THREE.MeshStandardMaterial({ color: 0x0b0508, roughness: 1 }));
    g1.rotation.x = -Math.PI / 2; g1.position.z = -1200; E.scene.add(g1);
    const g2 = new THREE.Mesh(new THREE.PlaneGeometry(4000, 7000),
      new THREE.MeshStandardMaterial({ color: 0x140608, roughness: 1, transparent: true, opacity: 0 }));
    g2.rotation.x = -Math.PI / 2; g2.position.set(0, 0.15, -1200); E.scene.add(g2);
    E.groundUD = g2;
    E.veinMat = new THREE.MeshBasicMaterial({ color: 0x550a1a, transparent: true, opacity: 0 });
    for (let i = 0; i < 40; i++) {
      const v = new THREE.Mesh(new THREE.PlaneGeometry(3 + Math.random() * 8, 60 + Math.random() * 160), E.veinMat);
      v.rotation.x = -Math.PI / 2; v.rotation.z = Math.random() * Math.PI;
      v.position.set((Math.random() - 0.5) * 1600, 0.3, 600 - Math.random() * 4800);
      E.scene.add(v);
    }
  };

  engine.buildRoad = function () {
    const E = engine;
    const road = new THREE.Mesh(new THREE.PlaneGeometry(60, 7000),
      new THREE.MeshStandardMaterial({ color: 0x111114, roughness: 0.9 }));
    road.rotation.x = -Math.PI / 2; road.position.set(0, 0.1, -1200); E.scene.add(road);
    for (let z = 1600; z > -4600; z -= 90) {
      const dash = new THREE.Mesh(new THREE.PlaneGeometry(2, 34),
        new THREE.MeshBasicMaterial({ color: 0x551111 }));
      dash.rotation.x = -Math.PI / 2;
      dash.position.set((Math.random() - 0.5) * 6, 0.2, z); E.scene.add(dash);
    }
  };

  engine.box = function (w, h, d, c, x, y, z, ry) {
    const E = engine;
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d),
      new THREE.MeshStandardMaterial({ color: c, roughness: 0.95 }));
    m.position.set(x, y, z); if (ry) m.rotation.y = ry;
    m.castShadow = true; m.receiveShadow = true;
    E.scene.add(m); return m;
  };

  engine.buildHawkins = function () {
    const E = engine;
    E.box(46, 3, 1, 0x1a0505, 0, 26, 380);
    E.box(2, 26, 2, 0x0d0d0d, -21, 13, 380);
    E.box(2, 26, 2, 0x0d0d0d, 21, 13, 380);
    E.colliders.push({ x: 0, z: 380, r: 26 });
    E.addFlickerSign(0, 26, 380);
    // church
    const cx = -260, cz = -500;
    E.box(70, 55, 50, 0x0a0a0c, cx, 27, cz);
    const steeple = new THREE.Mesh(new THREE.ConeGeometry(16, 55, 4),
      new THREE.MeshStandardMaterial({ color: 0x08080a, roughness: 1 }));
    steeple.position.set(cx, 82, cz); steeple.rotation.y = Math.PI / 4; E.scene.add(steeple);
    for (let i = -1; i <= 1; i++) {
      const w = new THREE.Mesh(new THREE.PlaneGeometry(8, 18),
        new THREE.MeshBasicMaterial({ color: 0xaa0a0a }));
      w.position.set(cx + i * 20, 26, cz + 25.2); E.scene.add(w);
    }
    E.colliders.push({ x: cx, z: cz, r: 48 });
    // radio station + tower
    const rx = 300, rz = -260;
    E.box(55, 30, 40, 0x0c0c0e, rx, 15, rz);
    const tower = new THREE.Mesh(
      new THREE.CylinderGeometry(6, 14, 130, 6, 6, true),
      new THREE.MeshBasicMaterial({ color: 0x330a0a, wireframe: true }));
    tower.position.set(rx + 45, 65, rz); E.scene.add(tower);
    E.beacon = new THREE.Mesh(new THREE.SphereGeometry(3, 10, 10),
      new THREE.MeshBasicMaterial({ color: 0xff0000 }));
    E.beacon.position.set(rx + 45, 132, rz); E.scene.add(E.beacon);
    E.colliders.push({ x: rx, z: rz, r: 40 });
    // water tower
    const wx = -380, wz = -80;
    const tank = new THREE.Mesh(new THREE.SphereGeometry(22, 14, 12),
      new THREE.MeshStandardMaterial({ color: 0x111114, roughness: 0.9 }));
    tank.position.set(wx, 62, wz); E.scene.add(tank);
    for (let i = 0; i < 4; i++) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(2, 2, 55, 6),
        new THREE.MeshStandardMaterial({ color: 0x0a0a0a }));
      const a = (i / 4) * Math.PI * 2 + 0.78;
      leg.position.set(wx + Math.cos(a) * 13, 27, wz + Math.sin(a) * 13);
      E.scene.add(leg);
    }
    E.colliders.push({ x: wx, z: wz, r: 26 });
    // arcade
    const ax = 240, az = -40;
    E.box(60, 26, 45, 0x0d0d10, ax, 13, az);
    E.neon = new THREE.Mesh(new THREE.PlaneGeometry(44, 9),
      new THREE.MeshBasicMaterial({ color: 0xff2266 }));
    E.neon.position.set(ax, 22, az + 22.8); E.scene.add(E.neon);
    E.colliders.push({ x: ax, z: az, r: 42 });
    // houses
    const houseGeo = new THREE.BoxGeometry(40, 26, 40);
    const roofGeo = new THREE.ConeGeometry(32, 22, 4);
    const houseMat = new THREE.MeshStandardMaterial({ color: 0x0a0a0c, roughness: 1 });
    const roofMat = new THREE.MeshStandardMaterial({ color: 0x060607, roughness: 1 });
    for (let i = 0; i < 60; i++) {
      const hx = (Math.random() - 0.5) * 1400, hz = 500 - Math.random() * 4200;
      if (Math.abs(hx) < 110) continue;
      const h = new THREE.Mesh(houseGeo, houseMat);
      h.position.set(hx, 13, hz); h.rotation.y = (Math.random() - 0.5) * 0.6; E.scene.add(h);
      const r = new THREE.Mesh(roofGeo, roofMat);
      r.position.set(hx, 37, hz); r.rotation.y = Math.PI / 4 + h.rotation.y; E.scene.add(r);
      if (Math.random() < 0.4) {
        const w = new THREE.Mesh(new THREE.PlaneGeometry(7, 9),
          new THREE.MeshBasicMaterial({ color: Math.random() < 0.5 ? 0x661111 : 0x223344 }));
        w.position.set(hx, 14, hz + 20.3); w.rotation.y = h.rotation.y; E.scene.add(w);
      }
      E.colliders.push({ x: hx, z: hz, r: 32 });
      if (Math.random() < 0.7) E.makeVineTree(hx + (Math.random() - 0.5) * 90, hz + (Math.random() - 0.5) * 90);
    }
    // graveyard
    for (let i = 0; i < 26; i++) {
      const slab = E.box(5, 7 + Math.random() * 4, 1.5, 0x151518,
        -300 + (Math.random() - 0.5) * 120, 3, 250 + (Math.random() - 0.5) * 120,
        (Math.random() - 0.5) * 0.5);
      slab.rotation.z = (Math.random() - 0.5) * 0.25;
    }
    // streetlights
    E.lamps = [];
    for (let z = 600; z > -4400; z -= 260) {
      for (const sx of [-42, 42]) {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(1, 1.4, 55, 6),
          new THREE.MeshStandardMaterial({ color: 0x0a0a0a }));
        pole.position.set(sx, 27, z); E.scene.add(pole);
        const lamp = new THREE.PointLight(0xff2222, 1.2, 190);
        lamp.position.set(sx, 54, z); E.scene.add(lamp);
        lamp.userData.flick = Math.random() * 10;
        E.lamps.push(lamp);
      }
    }
    // Creel house — Vecna's concealed lair
    const vx = 520, vz = -1500;
    E.box(80, 60, 60, 0x070708, vx, 30, vz, 0.3);
    const vroof = new THREE.Mesh(new THREE.ConeGeometry(60, 40, 4),
      new THREE.MeshStandardMaterial({ color: 0x050506, roughness: 1 }));
    vroof.position.set(vx, 80, vz); vroof.rotation.y = Math.PI / 4 + 0.3; E.scene.add(vroof);
    E.colliders.push({ x: vx, z: vz, r: 60 });
    E.creel = { x: vx, z: vz };
  };

  engine.addFlickerSign = function (x, y, z) {
    const E = engine;
    const c = document.createElement('canvas'); c.width = 512; c.height = 64;
    const g = c.getContext('2d');
    g.fillStyle = '#000'; g.fillRect(0, 0, 512, 64);
    g.font = 'bold 40px Courier New'; g.fillStyle = '#ff2222';
    g.textAlign = 'center'; g.fillText('WELCOME TO HAWKINS', 256, 46);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(44, 5.5),
      new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true }));
    sign.position.set(x, y, z); sign.rotation.y = Math.PI; E.scene.add(sign);
  };

  engine.makeVineTree = function (x, z) {
    const E = engine;
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 4.5, 42, 7),
      new THREE.MeshStandardMaterial({ color: 0x0c0a08, roughness: 1 }));
    trunk.position.y = 21; g.add(trunk);
    for (let i = 0; i < 6; i++) {
      const br = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.6, 20, 5), trunk.material);
      const a = (i / 6) * Math.PI * 2;
      br.position.set(Math.cos(a) * 8, 30 + Math.random() * 8, Math.sin(a) * 8);
      br.rotation.z = Math.cos(a) * 1.1; br.rotation.x = -Math.sin(a) * 1.1;
      g.add(br);
    }
    const vine = new THREE.Mesh(new THREE.TorusGeometry(5.5, 0.9, 6, 14),
      new THREE.MeshStandardMaterial({ color: 0x1a0f14, roughness: 1, wireframe: true }));
    vine.position.y = 16; vine.rotation.x = Math.PI / 2.15; g.add(vine);
    g.position.set(x, 0, z); E.scene.add(g);
    E.colliders.push({ x, z, r: 8 });
  };

  engine.buildAsh = function () {
    const E = engine;
    const N = 9000, geo = new THREE.BufferGeometry(), p = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      p[i * 3] = (Math.random() - 0.5) * 2600; p[i * 3 + 1] = Math.random() * 900;
      p[i * 3 + 2] = 800 - Math.random() * 5200;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(p, 3));
    E.ash = new THREE.Points(geo, new THREE.PointsMaterial({
      color: PAL.hawkins.ash, size: 1.6, transparent: true, opacity: 0.55 }));
    E.scene.add(E.ash);
  };

  engine.buildSpores = function () {
    const E = engine;
    const N = 6000, geo = new THREE.BufferGeometry(), p = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      p[i * 3] = (Math.random() - 0.5) * 2600; p[i * 3 + 1] = Math.random() * 700;
      p[i * 3 + 2] = 800 - Math.random() * 5200;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(p, 3));
    E.spores = new THREE.Points(geo, new THREE.PointsMaterial({
      color: 0x77aaff, size: 2.4, map: GLOW_TEX(), transparent: true, opacity: 0 }));
    E.scene.add(E.spores);
  };

  engine.buildFlashlight = function () {
    const E = engine;
    E.flashlight = new THREE.SpotLight(0xffe8c0, 1.6, 280, 0.42, 0.45, 1.2);
    E.flashlight.castShadow = true;
    E.flashlight.shadow.mapSize.set(512, 512);
    E.scene.add(E.flashlight); E.scene.add(E.flashlight.target);
  };
  engine.buildMuzzle = function () {
    engine.muzzle = new THREE.PointLight(0xffcc66, 0, 60);
    engine.scene.add(engine.muzzle);
  };

  /* ---------------- the portal — center of town ---------------- */
  engine.spawnPortal = function () {
    const E = engine;
    const g = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.TorusGeometry(14, 2.4, 12, 36),
      new THREE.MeshBasicMaterial({ color: 0xaa55ff, transparent: true, opacity: 0.9 }));
    ring.position.y = 17; g.add(ring);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(12.8, 36),
      new THREE.MeshBasicMaterial({ color: 0x331155, transparent: true, opacity: 0.68,
        side: THREE.DoubleSide }));
    disc.position.y = 17; g.add(disc);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: GLOW_TEX(), color: 0x9955ff, transparent: true, opacity: 0.65,
      blending: THREE.AdditiveBlending, depthWrite: false }));
    glow.scale.set(56, 66, 1); glow.position.y = 17; g.add(glow);
    const light = new THREE.PointLight(0x9955ff, 2.2, 160);
    light.position.y = 17; g.add(light);
    // sky beam — visible from anywhere in town
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(9, 13, 600, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: 0x9955ff, transparent: true, opacity: 0.16,
        blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false }));
    beam.position.y = 300; g.add(beam);
    for (const s of [-1, 1]) {
      const pylon = new THREE.Mesh(new THREE.BoxGeometry(5, 30, 5),
        new THREE.MeshStandardMaterial({ color: 0x14141a, roughness: 1 }));
      pylon.position.set(s * 20, 15, 0); pylon.castShadow = true; g.add(pylon);
      E.colliders.push({ x: s * 20, z: 0, r: 5 });
    }
    g.position.set(0, 0, 0);
    E.scene.add(g);
    E.portal = { mesh: g, ring, disc, beam, light, x: 0, z: 0, cd: 0 };
  };

  engine.updatePortal = function (dt, t) {
    const E = engine, gt = E.portal;
    if (!gt) return;
    gt.ring.rotation.z = t * 1.1;
    gt.disc.material.opacity = 0.55 + Math.sin(t * 4) * 0.16;
    gt.beam.material.opacity = 0.13 + Math.sin(t * 2.2) * 0.05;
    gt.light.intensity = 1.9 + Math.sin(t * 5) * 0.6;
    if (gt.cd > 0) gt.cd -= dt;
    const d = Math.hypot(E.player.pos.x - gt.x, E.player.pos.z - gt.z);
    if (d < 14 && gt.cd <= 0 && E.dimTransition <= 0) { gt.cd = 3; E.shiftDimension(); }
  };

  engine.shiftDimension = function () {
    const E = engine;
    E.dimension = E.dimension === 'hawkins' ? 'upside' : 'hawkins';
    E.dimTransition = 1.1;
    E.hooks.onDimFlash();
    E.hooks.onDimension(E.dimension, E.convergence);
    E.shake(0.5);
    E.hooks.feed(E.dimension === 'upside' ? 'you crossed over…' : 'back in hawkins');
    // Vecna waits beyond the portal — he only wakes when you cross over
    if (E.vecnaRevealed && !E.vecnaActive && E.dimension === 'upside') E.activateVecna();
  };

  /* ---------------- bicycle ---------------- */
  engine.spawnBike = function () {
    const E = engine;
    const g = new THREE.Group();
    const wheelGeo = new THREE.TorusGeometry(3, 0.55, 8, 22);
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.8 });
    const spokeMat = new THREE.MeshStandardMaterial({ color: 0x555555, roughness: 0.6 });
    const wheels = [];
    for (const wz of [5.5, -5.5]) {
      const w = new THREE.Group();
      w.add(new THREE.Mesh(wheelGeo, wheelMat));
      for (let i = 0; i < 3; i++) {
        const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.3, 5.6, 0.3), spokeMat);
        spoke.rotation.z = (i / 3) * Math.PI;
        w.add(spoke);
      }
      w.position.set(0, 3, wz);
      g.add(w); wheels.push(w);
    }
    const frameMat = new THREE.MeshStandardMaterial({ color: 0xcc2222, roughness: 0.45, metalness: 0.5 });
    const bar = (x1, y1, z1, x2, y2, z2, r) => {
      const d = new THREE.Vector3(x2 - x1, y2 - y1, z2 - z1);
      const len = d.length();
      const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 6), frameMat);
      m.position.set((x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
      m.castShadow = true;
      g.add(m);
    };
    bar(0, 3, 5.5, 0, 7.5, -0.5, 0.4);
    bar(0, 3, -5.5, 0, 7.5, -0.5, 0.4);
    bar(0, 7.5, -0.5, 0, 7.5, 5.5, 0.4);
    bar(0, 7.5, 5.5, 0, 10.5, 5.5, 0.35);
    bar(0, 10.5, 5.5, 0, 10.5, 2.5, 0.3); // handlebar cross
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 6.5, 6), frameMat);
    grip.rotation.z = Math.PI / 2; grip.position.set(0, 10.5, 4); g.add(grip);
    const seat = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.9, 3.2),
      new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.9 }));
    seat.position.set(0, 8.8, -2.6); seat.castShadow = true; g.add(seat);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: GLOW_TEX(), color: 0xffcc44, transparent: true, opacity: 0.35,
      blending: THREE.AdditiveBlending, depthWrite: false }));
    glow.scale.set(22, 26, 1); glow.position.y = 8; g.add(glow);
    g.position.set(16, 0, 402);
    g.rotation.y = 0.6;
    E.scene.add(g);
    E.bike = { mesh: g, wheels, x: 16, z: 402, mounted: false };
  };

  engine.tryBikeToggle = function () {
    const E = engine;
    if (!E.running || !E.player.alive || !E.bike) return;
    // never toggle while capturing vecna
    if (E.vecna && E.vecna.captureWeak && !E.vecna.dead) {
      if (E.vecna.mesh.position.distanceTo(E.player.pos) < 26) return;
    }
    if (E.bike.mounted) {
      E.bike.mounted = false;
      E.bike.x = E.player.pos.x; E.bike.z = E.player.pos.z;
      E.bike.mesh.position.set(E.bike.x, 0, E.bike.z);
      E.hooks.feed('dismounted');
    } else {
      const bd = Math.hypot(E.player.pos.x - E.bike.x, E.player.pos.z - E.bike.z);
      if (bd < 11) {
        E.bike.mounted = true;
        E.hooks.feed('riding — fast. do not stop.');
      }
    }
  };

  /* ---------------- navigation ---------------- */
  engine.getNavTarget = function () {
    const E = engine;
    if (E.vecnaActive && E.vecna && !E.vecna.dead)
      return { x: E.vecna.mesh.position.x, z: E.vecna.mesh.position.z, label: 'VECNA' };
    return {
      x: 0, z: 0,
      label: E.dimension === 'upside' ? 'PORTAL — BACK TO HAWKINS' : 'PORTAL — THE UPSIDE DOWN',
    };
  };

  engine.applyDimension = function (dt) {
    const E = engine;
    const ud = E.dimension === 'upside' ? 1 : 0;
    const k = Math.max(ud, E.convergence);
    const P0 = PAL.hawkins, P1 = PAL.upside;
    E.scene.fog.color.setHex(P0.fog).lerp(new THREE.Color(P1.fog), k);
    E.scene.fog.density = P0.fogD + (P1.fogD - P0.fogD) * k;
    E.scene.background.setHex(P0.sky).lerp(new THREE.Color(P1.sky), k);
    E.ambient.color.setHex(P0.amb).lerp(new THREE.Color(P1.amb), k);
    E.ash.material.opacity = 0.55 * (1 - k * 0.5);
    E.spores.material.opacity = k * 0.8;
    E.groundUD.material.opacity = k * 0.85;
    E.veinMat.opacity = k * 0.5;
    if (E.dimTransition > 0) E.dimTransition -= dt;
  };

  /* ---------------- traces ---------------- */
  engine.spawnTraces = function () {
    const E = engine;
    const spots = [
      { x: 0, z: 340 }, { x: -260, z: -430 }, { x: 300, z: -200 },
      { x: -300, z: 250 }, { x: 240, z: 20 },
    ];
    for (const s of spots) {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(6, 22, 4),
        new THREE.MeshStandardMaterial({ color: 0x2a1a0d, roughness: 0.8 }));
      body.position.y = 11; body.castShadow = true; g.add(body);
      const face = new THREE.Mesh(new THREE.CircleGeometry(2.6, 20),
        new THREE.MeshBasicMaterial({ color: 0xbb88ff }));
      face.position.set(0, 16, 2.1); g.add(face);
      const aura = new THREE.Sprite(new THREE.SpriteMaterial({
        map: GLOW_TEX(), color: 0x8833ff, transparent: true,
        opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }));
      aura.scale.set(26, 30, 1); aura.position.y = 12; g.add(aura);
      const light = new THREE.PointLight(0x8833ff, 1.4, 60);
      light.position.y = 14; g.add(light);
      g.position.set(s.x, 0, s.z);
      E.scene.add(g);
      E.traces.push({ mesh: g, aura, taken: false });
    }
  };

  engine.collectTrace = function (tr) {
    const E = engine;
    tr.taken = true; E.scene.remove(tr.mesh);
    E.tracesCollected++;
    E.hooks.onTrace(E.tracesCollected, TRACES_NEEDED);
    E.hooks.chime('TRACE ' + E.tracesCollected + ' OF ' + TRACES_NEEDED);
    E.hooks.feed('clock trace secured');
    if (E.tracesCollected >= TRACES_NEEDED) E.revealVecna();
    else E.hooks.setObjective('Hunt demogorgons. Find the <b style="color:#bb88ff">clock traces</b> (' +
      E.tracesCollected + '/' + TRACES_NEEDED + ').');
  };

  /* ---------------- vecna ---------------- */
  engine.revealVecna = function () {
    const E = engine;
    E.vecnaRevealed = true;
    E.hooks.chime('THE BELL TOLLS FOUR TIMES');
    for (const d of E.demogorgons) d.speed *= 1.3;
    if (E.dimension === 'upside') {
      E.activateVecna();
    } else {
      // Vecna stays concealed — he waits in the Upside Down
      E.hooks.banner('HE WAITS IN THE UPSIDE DOWN');
      E.hooks.setObjective('<b style="color:#ff4444">VECNA WAITS IN THE UPSIDE DOWN</b> — take the <b style="color:#aa66ff">portal</b> at the center of town. Follow the arrow.');
      E.hooks.feed('the bell tolls — enter the portal');
    }
  };

  engine.activateVecna = function () {
    const E = engine;
    if (E.vecnaActive) return;
    E.vecnaActive = true;
    E.hooks.banner('THE WORLDS CONVERGE');
    E.hooks.setObjective('<b style="color:#ff4444">VECNA HAS REVEALED HIMSELF</b> — the worlds are merging. Weaken him, then <b style="color:#66ff99">capture</b> him.');
    E.hooks.feed('reality is tearing — find vecna at the creel house');
    E.hooks.onBossReveal();
    E.spawnVecna();
    E.spawnMindflayer();
  };

  engine.spawnVecna = function () {
    const E = engine, c = E.creel;
    const g = new THREE.Group();
    // The body is Merlin's Tripo Vecna GLB now (lib/hawkins manifest);
    // it attaches async into this group. The violet aura is an effect,
    // not a body — it stays, exactly as authored.
    const aura = new THREE.Sprite(new THREE.SpriteMaterial({
      map: GLOW_TEX(), color: 0xaa33ff, transparent: true, opacity: 0.55,
      blending: THREE.AdditiveBlending, depthWrite: false }));
    aura.scale.set(64, 84, 1); aura.position.y = 24; g.add(aura);
    g.position.set(c.x, 0, c.z - 90);
    E.scene.add(g);
    E.vecna = { mesh: g, aura, pose: null, castAt: -99, hp: 100, maxHp: 100,
      teleportCd: 6, blastCd: 3, summonCd: 9, captureWeak: false, finishTimer: 0, dead: false };
    instantiateHawkins('vecna').then((handle) => {
      if (!E._glbAlive || !handle || !E.vecna || E.vecna.mesh !== g) {
        if (handle) handle.dispose();
        return;
      }
      g.add(handle.group);
      E.vecna.pose = handle;
    });
    E.hooks.onBossHp(1);
  };

  // MORTAL KOMBAT moment — he is weak. FINISH HIM.
  engine.weakenVecna = function () {
    const E = engine, v = E.vecna;
    if (!v || v.captureWeak || v.dead) return;
    v.captureWeak = true;
    v.finishTimer = 15;
    E.hooks.onFinishHim();
    E.hooks.feed('get close and hold E — FINISH HIM');
  };

  engine.updateVecna = function (dt, t) {
    const E = engine;
    if (!E.vecna || E.vecna.dead) return;
    E.convergence = Math.min(1, E.convergence + dt * 0.06);
    E.hooks.onDimension(E.dimension, E.convergence);
    const v = E.vecna, m = v.mesh;
    const toPlayer = new THREE.Vector3().subVectors(E.player.pos, m.position);
    toPlayer.y = 0;
    const dist = toPlayer.length();
    if (v.pose) {
      // The GLB body is posed by its skeleton: hovering menace, arms
      // and fingers flaring off a fresh cast; slumped when weakened.
      const sinceCast = t - v.castAt;
      v.pose.update(t, {
        mode: v.captureWeak ? 'weakened' : 'hover',
        phase: 0,
        flare: v.captureWeak ? 0 : Math.max(0.35, 1 - sinceCast * 0.5),
      });
    }
    m.position.y = Math.sin(t * 1.2) * 2 + 2;
    v.aura.material.opacity = 0.4 + Math.sin(t * 2.4) * 0.2;
    if (dist > 1) m.rotation.y = Math.atan2(toPlayer.x, toPlayer.z);
    if (dist > 42) {
      toPlayer.normalize();
      m.position.x += toPlayer.x * 10 * dt;
      m.position.z += toPlayer.z * 10 * dt;
    }
    v.teleportCd -= dt; v.blastCd -= dt; v.summonCd -= dt;
    if (v.teleportCd <= 0) {
      v.teleportCd = 7 + Math.random() * 4;
      const a = Math.random() * Math.PI * 2;
      m.position.set(E.player.pos.x + Math.cos(a) * 55, 0, E.player.pos.z + Math.sin(a) * 55);
      E.triggerLightningAt(m.position.x, m.position.z);
      E.hooks.feed('vecna moves…');
    }
    if (v.blastCd <= 0 && dist < 130) { v.blastCd = 3.6; E.psychicBlast(); }
    if (v.summonCd <= 0) {
      v.summonCd = 11;
      for (let i = 0; i < 2; i++) E.spawnDemogorgonNear(m.position, 55);
      E.spawnBatSwarm(4);
      E.hooks.feed('he calls his children');
    }
    if (v.hp <= 30) E.weakenVecna();
    if (v.captureWeak) {
      v.aura.material.color.setHex(0x66ff99);
      v.finishTimer -= dt;
      if (v.finishTimer <= 0) {
        // too slow — HE RECOVERS
        v.captureWeak = false;
        v.hp = 45;
        E.vecnaCaptureHeld = 0;
        E.hooks.onBossHp(v.hp / v.maxHp);
        E.hooks.onCapturePrompt(false);
        E.hooks.onCaptureProgress(0, 0);
        E.hooks.banner('VECNA RECOVERS');
        E.hooks.feed('weaken him again — faster this time');
      } else if (dist < 26) {
        E.hooks.onCapturePrompt(true);
        if (E.keys.KeyE || E.keys._act) {
          E.vecnaCaptureHeld += dt; E.shake(0.12);
          E.hooks.onCaptureProgress(Math.min(1, E.vecnaCaptureHeld / 2.5), v.finishTimer);
          if (E.vecnaCaptureHeld > 2.5) E.captureVecna();
        } else {
          E.vecnaCaptureHeld = Math.max(0, E.vecnaCaptureHeld - dt * 2);
          E.hooks.onCaptureProgress(Math.min(1, E.vecnaCaptureHeld / 2.5), v.finishTimer);
        }
      } else { E.hooks.onCapturePrompt(false); E.vecnaCaptureHeld = 0; E.hooks.onCaptureProgress(0, v.finishTimer); }
    } else E.hooks.onCapturePrompt(false);
  };

  engine.psychicBlast = function () {
    const E = engine;
    if (E.vecna) E.vecna.castAt = E.clock.getElapsedTime();
    const from = E.vecna.mesh.position.clone(); from.y = 40;
    const dir = new THREE.Vector3().subVectors(E.player.pos, from).normalize();
    const orb = new THREE.Mesh(new THREE.SphereGeometry(2.4, 10, 10),
      new THREE.MeshBasicMaterial({ color: 0xcc66ff }));
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: GLOW_TEX(), color: 0xaa44ff, transparent: true, opacity: 0.9,
      blending: THREE.AdditiveBlending, depthWrite: false }));
    glow.scale.set(16, 16, 1);
    orb.position.copy(from); orb.add(glow); E.scene.add(orb);
    E.blasts.push({ mesh: orb, vel: dir.multiplyScalar(72), life: 4 });
    E.hooks.feed('PSYCHIC BLAST — MOVE');
  };

  engine.updateBlasts = function (dt) {
    const E = engine;
    for (let i = E.blasts.length - 1; i >= 0; i--) {
      const b = E.blasts[i];
      b.life -= dt;
      b.mesh.position.addScaledVector(b.vel, dt);
      const d = b.mesh.position.distanceTo(new THREE.Vector3(E.player.pos.x, EYE, E.player.pos.z));
      if (d < 8) {
        E.damagePlayer(22); E.shake(1.0);
        E.scene.remove(b.mesh); E.blasts.splice(i, 1); continue;
      }
      if (b.life <= 0 || b.mesh.position.y < 0) { E.scene.remove(b.mesh); E.blasts.splice(i, 1); }
    }
  };

  engine.damageVecna = function (n) {
    const E = engine;
    if (!E.vecna || E.vecna.dead || !E.vecnaRevealed) return;
    E.vecna.hp = Math.max(0, E.vecna.hp - n);
    E.hooks.onBossHp(E.vecna.hp / E.vecna.maxHp);
    if (E.vecna.hp <= 0) {
      E.vecna.hp = 1;
      E.weakenVecna();
    }
  };

  engine.captureVecna = function () {
    const E = engine;
    E.vecna.dead = true;
    E.hooks.onCapturePrompt(false);
    const flash = new THREE.PointLight(0x66ff99, 10, 220);
    flash.position.copy(E.vecna.mesh.position); flash.position.y = 24;
    E.scene.add(flash);
    let s = 1;
    const iv = setInterval(() => {
      s *= 0.82;
      E.vecna.mesh.scale.setScalar(Math.max(0.01, s));
      E.vecna.mesh.rotation.y += 0.4;
      if (s < 0.05) {
        clearInterval(iv);
        E.scene.remove(E.vecna.mesh); E.scene.remove(flash);
        if (E.mindflayer) E.scene.remove(E.mindflayer.mesh);
        E.hooks.onCapturePrompt(false);
        E.hooks.onFatality();
        setTimeout(() => E.hooks.onWin(E.kills), 2400);
      }
    }, 50);
  };

  /* ---------------- mind flayer ---------------- */
  // Routed through the manifest (lib/hawkins/models.js): both Flayer
  // GLBs are placed (2026-10-22), so this spawn builds the GLB; the
  // procedural silhouette below survives ONLY as the fallback if a
  // file ever goes missing — no other code changes either way. The
  // Hybrid is the same routing with variantId 'mind-flayer-hybrid'
  // (red aura, speedMul on its attacks, per the manifest entry).
  engine.spawnMindflayer = function (variantId) {
    const E = engine;
    const entry = hawkinsModel(variantId || 'mind-flayer') || hawkinsModel('mind-flayer');
    const g = new THREE.Group();
    g.position.set(E.player.pos.x, 0, E.player.pos.z - 900);
    E.scene.add(g);
    const speedMul = entry.speedMul || 1;
    if (entry.file) {
      E.mindflayer = { mesh: g, legs: [], core: null, pose: null, attackCd: 8 / speedMul, speedMul };
      instantiateHawkins(entry.id).then((handle) => {
        if (!E._glbAlive || !handle || !E.mindflayer || E.mindflayer.mesh !== g) {
          if (handle) handle.dispose();
          return;
        }
        handle.group.position.y = 600; // it looms in the sky, as the silhouette did
        g.add(handle.group);
        E.mindflayer.pose = handle;
        const core = new THREE.Sprite(new THREE.SpriteMaterial({
          map: GLOW_TEX(), color: entry.aura || 0xff2222, transparent: true, opacity: 0.5,
          blending: THREE.AdditiveBlending, depthWrite: false }));
        const cs = 220 * (entry.auraScale || 1);
        core.scale.set(cs, cs * 0.72, 1); core.position.set(0, 660, 0); g.add(core);
        E.mindflayer.core = core;
      });
    } else {
      E.buildProceduralMindflayer(g, entry);
    }
    E.hooks.banner('THE MIND FLAYER WATCHES');
    E.hooks.feed('it has found you');
  };

  // The original procedural silhouette — now ONLY the fallback body,
  // used if a Flayer slot's GLB file ever goes missing again.
  engine.buildProceduralMindflayer = function (g, entry) {
    const E = engine;
    const mat = new THREE.MeshBasicMaterial({ color: 0x050508, transparent: true, opacity: 0.92 });
    const mass = new THREE.Mesh(new THREE.SphereGeometry(120, 16, 12), mat);
    mass.scale.set(1.6, 0.75, 1); mass.position.y = 700; g.add(mass);
    const headM = new THREE.Mesh(new THREE.SphereGeometry(70, 14, 10), mat);
    headM.scale.set(1, 1.3, 1); headM.position.set(0, 640, 90); g.add(headM);
    const legs = [];
    for (let i = 0; i < 14; i++) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(6, 22, 420, 6), mat);
      const a = (i / 14) * Math.PI * 2;
      leg.position.set(Math.cos(a) * 190, 520, Math.sin(a) * 190 - 200);
      leg.rotation.z = Math.cos(a) * 0.55; leg.rotation.x = -Math.sin(a) * 0.55 + 0.35;
      g.add(leg); legs.push({ m: leg, phase: Math.random() * 6 });
    }
    const core = new THREE.Sprite(new THREE.SpriteMaterial({
      map: GLOW_TEX(), color: (entry && entry.aura) || 0xff2222, transparent: true, opacity: 0.5,
      blending: THREE.AdditiveBlending, depthWrite: false }));
    core.scale.set(220, 160, 1); core.position.set(0, 640, 90); g.add(core);
    E.mindflayer = { mesh: g, legs, core, pose: null, attackCd: 8, speedMul: 1 };
  };

  engine.updateMindflayer = function (dt, t) {
    const E = engine;
    if (!E.mindflayer) return;
    const mf = E.mindflayer;
    mf.mesh.position.x += (E.player.pos.x - mf.mesh.position.x) * dt * 0.25;
    mf.mesh.position.z += ((E.player.pos.z - 900) - mf.mesh.position.z) * dt * 0.25;
    for (const l of mf.legs) {
      l.m.rotation.y = Math.sin(t * 0.9 + l.phase) * 0.3;
      l.m.scale.y = 1 + Math.sin(t * 1.4 + l.phase) * 0.08;
    }
    if (mf.pose) mf.pose.update(t, { phase: 0 });
    if (mf.core) mf.core.material.opacity = 0.35 + Math.sin(t * 2) * 0.2;
    mf.attackCd -= dt;
    if (mf.attackCd <= 0) {
      mf.attackCd = (14 + Math.random() * 6) / (mf.speedMul || 1);
      E.hooks.feed('THE SKY MOVES — RUN');
      E.triggerLightningAt(E.player.pos.x + (Math.random() - 0.5) * 120,
        E.player.pos.z + (Math.random() - 0.5) * 120);
      setTimeout(() => {
        if (!E.player.alive) return;
        E.damagePlayer(30); E.shake(1.2); E.hooks.feed('SHADOW STRIKE');
      }, 900);
    }
  };

  /* ---------------- demo-bats ---------------- */
  // Manifest-routed like the Flayer: the Demo-bat GLB is placed
  // (2026-10-22), so swarms are born as GLBs — flapped by their wing
  // bones (the rig's arm chains) with whole-mesh flap as the fallback
  // if a rig ever yields none. The procedural bat below is the
  // fallback body if the file ever goes missing.
  engine.spawnBatSwarm = function (n) {
    const E = engine;
    const entry = hawkinsModel('demobats');
    const batMat = new THREE.MeshStandardMaterial({ color: 0x191014, roughness: 0.9, side: THREE.DoubleSide });
    for (let i = 0; i < n; i++) {
      const g = new THREE.Group();
      const a = Math.random() * Math.PI * 2;
      g.position.set(E.player.pos.x + Math.cos(a) * 120, 60 + Math.random() * 50, E.player.pos.z + Math.sin(a) * 120);
      E.scene.add(g);
      const bat = { mesh: g, wl: null, wr: null, pose: null, state: 'circle',
        phase: Math.random() * 6, speed: 34 + Math.random() * 10,
        diveCd: 2 + Math.random() * 4, dead: 0 };
      E.bats.push(bat);
      if (entry && entry.file) {
        instantiateHawkins('demobats').then((handle) => {
          if (!E._glbAlive || !handle) { if (handle) handle.dispose(); return; }
          if (!E.bats.includes(bat)) { handle.dispose(); return; }
          g.add(handle.group);
          if (handle.animated) bat.pose = handle;
          else bat.glbStatic = true; // rig gave nothing to move — mesh-flap
        });
      } else {
        const body = new THREE.Mesh(new THREE.ConeGeometry(1.6, 7, 5), batMat);
        body.rotation.x = Math.PI / 2; g.add(body);
        const wl = new THREE.Mesh(new THREE.PlaneGeometry(9, 4), batMat); wl.position.x = -4.5; g.add(wl);
        const wr = new THREE.Mesh(new THREE.PlaneGeometry(9, 4), batMat); wr.position.x = 4.5; g.add(wr);
        const tail = new THREE.Mesh(new THREE.ConeGeometry(0.7, 6, 4), batMat);
        tail.position.z = 5; tail.rotation.x = -Math.PI / 2; g.add(tail);
        bat.wl = wl; bat.wr = wr;
      }
    }
  };

  engine.updateBats = function (dt, t) {
    const E = engine;
    if ((E.dimension === 'upside' || E.convergence > 0.3) && E.bats.length < 8 && Math.random() < 0.008)
      E.spawnBatSwarm(3);
    for (let i = E.bats.length - 1; i >= 0; i--) {
      const b = E.bats[i], m = b.mesh;
      if (b.dead > 0) {
        b.dead += dt;
        m.rotation.z += dt * 9; m.position.y -= dt * 26;
        m.scale.setScalar(Math.max(0.01, 1 - b.dead));
        if (b.dead > 1 || m.position.y < 0) { E.scene.remove(m); E.bats.splice(i, 1); }
        continue;
      }
      if (b.pose) b.pose.update(t, { phase: b.phase });
      else if (b.wl && b.wr) {
        const flap = Math.sin(t * 16 + b.phase) * 0.75;
        b.wl.rotation.y = flap; b.wr.rotation.y = -flap;
      } else if (b.glbStatic) {
        m.rotation.z = Math.sin(t * 16 + b.phase) * 0.4;
      }
      const toP = new THREE.Vector3().subVectors(E.player.pos, m.position);
      const dist = toP.length();
      b.diveCd -= dt;
      if (b.state === 'circle') {
        const a = t * 0.7 + b.phase;
        const cx = E.player.pos.x + Math.cos(a) * 70, cz = E.player.pos.z + Math.sin(a) * 70;
        m.position.x += (cx - m.position.x) * dt * 1.4;
        m.position.z += (cz - m.position.z) * dt * 1.4;
        m.position.y += ((55 + Math.sin(t * 2 + b.phase) * 14) - m.position.y) * dt * 1.6;
        m.rotation.y = Math.atan2(cx - m.position.x, cz - m.position.z);
        if (b.diveCd <= 0 && dist < 130) { b.state = 'dive'; b.diveCd = 3 + Math.random() * 3; }
      } else {
        toP.normalize();
        m.position.addScaledVector(toP, b.speed * 1.7 * dt);
        m.rotation.y = Math.atan2(toP.x, toP.z);
        m.rotation.x = -0.5;
        if (dist < 9) {
          E.damagePlayer(8); E.shake(0.4);
          E.hooks.feed('demo-bat bite');
          b.state = 'circle'; b.diveCd = 3 + Math.random() * 3;
          m.position.addScaledVector(toP, -14);
          m.position.y = Math.max(20, m.position.y + 18);
        }
        if (dist > 190) b.state = 'circle';
      }
    }
  };

  /* ---------------- demogorgons ---------------- */
  engine.spawnDemogorgon = function () {
    const E = engine;
    const a = Math.random() * Math.PI * 2, d = 140 + Math.random() * 100;
    E.spawnDemogorgonNear(E.player.pos, d, a);
    E.waveSpawned++;
  };

  engine.spawnDemogorgonNear = function (center, dist, ang) {
    const E = engine;
    const a = ang !== undefined ? ang : Math.random() * Math.PI * 2;
    const g = new THREE.Group();
    g.position.set(center.x + Math.cos(a) * dist, 0, center.z + Math.sin(a) * dist);
    E.scene.add(g);
    const upsideBonus = E.dimension === 'upside' ? 1.25 : 1;
    // The body is Merlin's Tripo Demogorgon GLB (manifest-routed,
    // attached async — spawns happen 140+ units out in fog, and every
    // gameplay system reads the group position, so the pack is live
    // from the first frame). The old procedural build is gone.
    const d = { mesh: g, pose: null, hp: 3, state: 'stalk',
      speed: (13 + E.wave * 1.6 + Math.random() * 4) * upsideBonus,
      phase: Math.random() * Math.PI * 2, attackCd: 0, stun: 0,
      dead: 0, lastKnown: g.position.clone() };
    E.demogorgons.push(d);
    instantiateHawkins('demogorgon').then((handle) => {
      if (!E._glbAlive || !handle) { if (handle) handle.dispose(); return; }
      if (!E.demogorgons.includes(d)) { handle.dispose(); return; }
      g.add(handle.group);
      d.pose = handle;
    });
  };

  engine.killDemogorgon = function (d) {
    const E = engine;
    d.dead = 0.001; E.kills++;
    E.hooks.onKill(E.kills);
    E.hooks.feed('DEMOGORGON DOWN — ' + E.kills);
    const flash = new THREE.PointLight(0xff2222, 6, 60);
    flash.position.copy(d.mesh.position); flash.position.y = 15;
    E.scene.add(flash);
    setTimeout(() => E.scene.remove(flash), 220);
  };

  engine.updateDemogorgons = function (dt, t) {
    const E = engine;
    for (let i = E.demogorgons.length - 1; i >= 0; i--) {
      const d = E.demogorgons[i], m = d.mesh;
      if (d.dead > 0) {
        d.dead += dt;
        m.rotation.x = -Math.min(1, d.dead * 2.4) * 1.4;
        m.position.y = -Math.min(1, d.dead) * 6;
        m.scale.setScalar(Math.max(0.01, 1 - d.dead * 0.7));
        if (d.dead > 1.6) { E.scene.remove(m); E.demogorgons.splice(i, 1); }
        continue;
      }
      if (d.stun > 0) { d.stun -= dt; continue; }
      const toPlayer = new THREE.Vector3().subVectors(E.player.pos, m.position);
      toPlayer.y = 0;
      const dist = toPlayer.length();
      const dirToD = new THREE.Vector3().subVectors(m.position, E.player.pos).normalize();
      const facing = new THREE.Vector3(Math.sin(E.player.yaw), 0, Math.cos(E.player.yaw));
      if ((dist < 55 && dirToD.dot(facing) > -0.2) || d.state === 'chase')
        d.lastKnown.copy(E.player.pos);
      let moving = false;
      if (d.state === 'stalk') {
        const dx = d.lastKnown.x - m.position.x, dz = d.lastKnown.z - m.position.z;
        const dd = Math.hypot(dx, dz);
        if (dd > 4) {
          m.position.x += (dx / dd) * d.speed * 0.45 * dt + Math.cos(t + d.phase) * 2 * dt;
          m.position.z += (dz / dd) * d.speed * 0.45 * dt + Math.sin(t + d.phase) * 2 * dt;
          m.rotation.y = Math.atan2(dx, dz); moving = true;
        } else m.rotation.y += dt * 1.2;
        if (dist < 48 || d.heardShot) d.state = 'chase';
      } else if (d.state === 'chase') {
        if (dist > 7) {
          toPlayer.normalize();
          let nx = m.position.x + toPlayer.x * d.speed * dt;
          let nz = m.position.z + toPlayer.z * d.speed * dt;
          for (const c of E.colliders) {
            const ox = nx - c.x, oz = nz - c.z, od = Math.hypot(ox, oz);
            if (od < c.r + 4 && od > 0.01) { nx = c.x + ox / od * (c.r + 4); nz = c.z + oz / od * (c.r + 4); }
          }
          m.position.x = nx; m.position.z = nz;
          m.rotation.y = Math.atan2(toPlayer.x, toPlayer.z);
          moving = true;
        }
        if (dist < 9) d.state = 'attack';
        else if (dist > 140) d.state = 'stalk';
      } else if (d.state === 'attack') {
        m.rotation.y = Math.atan2(toPlayer.x, toPlayer.z);
        const lunge = Math.max(0, Math.sin(t * 9 + d.phase));
        m.position.x += toPlayer.x * dt * 10 * lunge;
        m.position.z += toPlayer.z * dt * 10 * lunge;
        moving = lunge > 0.3;
        d.attackCd -= dt;
        if (d.attackCd <= 0 && dist < 11) {
          d.attackCd = 1.1;
          E.damagePlayer(12 + E.wave * 2); E.shake(0.7);
        }
        if (dist > 14) d.state = 'chase';
      }
      // The skeleton does the acting now: prowl / chase / lunge read
      // off the AI state, with the attack flare driving the arms.
      if (d.pose) {
        d.pose.update(t, {
          mode: d.state === 'attack' ? 'attack' : moving ? (d.state === 'chase' ? 'chase' : 'stalk') : 'idle',
          phase: d.phase,
          flare: d.state === 'attack' ? 1 : d.state === 'chase' ? 0.45 : 0.1,
        });
      }
    }
  };

  /* ---------------- combat ---------------- */
  engine.getForward = function () {
    const E = engine;
    const v = new THREE.Vector3(0, 0, -1);
    v.applyEuler(new THREE.Euler(E.player.pitch, E.player.yaw, 0, 'YXZ'));
    return v;
  };

  engine.shoot = function () {
    const E = engine, P = E.player;
    if (!E.running || !P.alive) return;
    if (P.fireCooldown > 0 || P.reloading) return;
    if (P.ammo <= 0) { E.startReload(); return; }
    P.ammo--; P.fireCooldown = 0.32;
    E.hooks.onAmmo(P.ammo, P.magSize);
    for (const d of E.demogorgons) { d.heardShot = true; d.lastKnown.copy(P.pos); }
    E.muzzle.position.copy(E.getShotOrigin()).add(new THREE.Vector3(0, -1.5, 0))
      .add(E.getForward().multiplyScalar(6));
    E.muzzle.intensity = 5;
    setTimeout(() => { E.muzzle.intensity = 0; }, 60);
    const dir = E.getForward();
    let hit = false;
    if (E.vecnaRevealed && E.vecna && !E.vecna.dead) {
      const toV = new THREE.Vector3().subVectors(E.vecna.mesh.position, P.pos);
      const dist = toV.length();
      if (dist < 220) {
        toV.normalize();
        if (toV.angleTo(dir) < Math.atan2(15, dist) + 0.03) {
          hit = true; E.damageVecna(4); E.hooks.hitmarker(false);
          E.spawnTracer(E.vecna.mesh.position.clone().add(new THREE.Vector3(0, 26, 0)));
          E.spawnBlood(E.vecna.mesh.position.clone().add(new THREE.Vector3(0, 26, 0)), 0x8833ff);
        }
      }
    }
    if (!hit) {
      const sortedB = E.bats.filter(b => !b.dead)
        .map(b => ({ b, dist: b.mesh.position.distanceTo(P.pos) }))
        .sort((a, b) => a.dist - b.dist);
      for (const { b } of sortedB) {
        const toB = new THREE.Vector3().subVectors(b.mesh.position, P.pos);
        const dist = toB.length();
        if (dist > 170) continue;
        toB.normalize();
        if (toB.angleTo(dir) < Math.atan2(6, dist) + 0.05) {
          hit = true; b.dead = 0.001; E.kills++;
          E.hooks.onKill(E.kills); E.hooks.feed('DEMO-BAT DOWN');
          E.hooks.hitmarker(false);
          E.spawnTracer(b.mesh.position.clone());
          E.spawnBlood(b.mesh.position.clone(), 0x661111);
          break;
        }
      }
    }
    if (!hit) {
      const sorted = E.demogorgons.filter(d => !d.dead)
        .map(d => ({ d, dist: d.mesh.position.distanceTo(P.pos) }))
        .sort((a, b) => a.dist - b.dist);
      for (const { d } of sorted) {
        const toD = new THREE.Vector3().subVectors(d.mesh.position, P.pos);
        const dist = toD.length();
        if (dist > 160) continue;
        toD.normalize();
        if (toD.angleTo(dir) < Math.atan2(9, dist) + 0.035) {
          hit = true;
          const aimY = P.pos.y + EYE + dir.y * dist;
          const isHead = Math.abs(aimY - (d.mesh.position.y + 32)) < 9;
          d.hp -= isHead ? 2 : 1;
          d.stun = Math.max(d.stun, 0.28);
          d.state = 'chase'; d.lastKnown.copy(P.pos);
          E.hooks.hitmarker(isHead);
          E.spawnTracer(d.mesh.position.clone().add(new THREE.Vector3(0, 16, 0)));
          E.spawnBlood(d.mesh.position.clone().add(new THREE.Vector3(0, 16, 0)), 0xaa0000);
          if (d.hp <= 0) E.killDemogorgon(d);
          break;
        }
      }
    }
    if (!hit) E.spawnTracer(E.getShotOrigin().add(dir.multiplyScalar(150)));
    E.shake(0.26);
    if (P.ammo === 0) E.startReload();
  };

  engine.spawnTracer = function (to) {
    const E = engine;
    const from = E.getShotOrigin().add(new THREE.Vector3(0.9, -1.1, 0))
      .add(E.getForward().multiplyScalar(3));
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([from, to]),
      new THREE.LineBasicMaterial({ color: 0xffdd88, transparent: true, opacity: 0.95 }));
    E.scene.add(line);
    E.tracers.push({ line, life: 0.09 });
  };
  engine.spawnBlood = function (at, color) {
    const E = engine;
    const f = new THREE.PointLight(color, 4, 40);
    f.position.copy(at); E.scene.add(f);
    setTimeout(() => E.scene.remove(f), 130);
  };
  engine.startReload = function () {
    const E = engine, P = E.player;
    if (P.reloading || P.ammo === P.magSize) return;
    P.reloading = true;
    E.hooks.onReload(true);
    setTimeout(() => {
      P.ammo = P.magSize; P.reloading = false;
      E.hooks.onAmmo(P.ammo, P.magSize);
      E.hooks.onReload(false);
    }, 1300);
  };
  engine.damagePlayer = function (n) {
    const E = engine, P = E.player;
    if (!P.alive || !E.running) return;
    P.health -= n;
    P.lastRegen = E.clock.getElapsedTime();
    E.hooks.onDamage(P.health / P.maxHealth);
    if (P.health <= 0) { P.health = 0; P.alive = false; E.die(); }
  };
  engine.die = function () {
    // To die is to respawn in Hawkins. Death is a door.
    const E = engine, P = E.player;
    E.hooks.banner('TAKEN — YOU WAKE IN HAWKINS');
    E.hooks.feed('death is a door. you walked back through.');
    P.pos.set(0, 0, 420); P.yaw = Math.PI; P.pitch = 0;
    P.health = P.maxHealth; P.ammo = P.magSize; P.reloading = false;
    P.alive = true; P.lastRegen = E.clock.getElapsedTime();
    if (E.bike && E.bike.mounted) {
      E.bike.mounted = false;
      E.bike.mesh.position.set(E.bike.x, 0, E.bike.z);
    }
    if (E.dimension !== 'hawkins') {
      E.dimension = 'hawkins';
      E.dimTransition = 1.1;
      E.hooks.onDimFlash();
    }
    E.hooks.onDimension(E.dimension, E.convergence);
    E.hooks.onHealth(1);
    E.hooks.onAmmo(P.ammo, P.magSize);
    E.hooks.onReload(false);
    // give the respawn breathing room — push the pack back
    for (const d of E.demogorgons) {
      if (d.dead) continue;
      const dd = d.mesh.position.distanceTo(P.pos);
      if (dd < 150) {
        const a = Math.random() * Math.PI * 2;
        d.mesh.position.set(P.pos.x + Math.cos(a) * 170, 0, P.pos.z + Math.sin(a) * 170);
        d.state = 'stalk';
      }
    }
    for (const b of E.bats) {
      if (b.dead) continue;
      const dd = b.mesh.position.distanceTo(P.pos);
      if (dd < 150) {
        const a = Math.random() * Math.PI * 2;
        b.mesh.position.set(P.pos.x + Math.cos(a) * 170, 60, P.pos.z + Math.sin(a) * 170);
        b.state = 'circle';
      }
    }
  };
  engine.shake = function (n) { engine.shakeAmt = Math.min(1.4, engine.shakeAmt + n); };

  /* ---------------- lightning ---------------- */
  engine.triggerLightningAt = function (x, z) {
    const E = engine;
    const boltColor = E.dimension === 'upside' || E.convergence > 0.5 ? 0x4488ff : 0xff3333;
    E.lightningLight.color.setHex(boltColor);
    E.lightningLight.position.set(x, 800, z);
    const pts = [];
    for (let i = 0; i < 12; i++)
      pts.push(new THREE.Vector3(x + (Math.random() - 0.5) * 120, 1400 - i * 115, z + (Math.random() - 0.5) * 120));
    const bolt = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({ color: boltColor, transparent: true }));
    E.scene.add(bolt);
    E.lightningLight.intensity = 260;
    E.skyFlash.intensity = 6;
    const fogC = E.convergence > 0.5 ? 0x331133 : (E.dimension === 'upside' ? 0x1a0a2a : 0x550a0a);
    E.scene.fog.color.setHex(fogC);
    E.bloodSun.material.color.setHex(0xff6666);
    for (const d of E.demogorgons) if (!d.dead) d.stun = Math.max(d.stun, 1.4);
    setTimeout(() => {
      E.lightningLight.intensity = 0; E.skyFlash.intensity = 0.5;
      E.scene.remove(bolt);
    }, 160);
  };
  engine.triggerLightning = function () {
    const E = engine;
    E.triggerLightningAt(E.player.pos.x + (Math.random() - 0.5) * 900,
      E.player.pos.z + (Math.random() - 0.5) * 900);
  };

  /* ---------------- input ---------------- */
  engine.bindInput = function () {
    const E = engine;
    E._onKeyDown = (e) => {
      E.keys[e.code] = true;
      if (e.code === 'KeyR') E.startReload();
      if (e.code === 'KeyE') E.tryBikeToggle();
      if (e.code === 'KeyV') E.togglePerspective();
      if (['ArrowUp', 'ArrowDown', 'Space'].includes(e.code)) e.preventDefault();
    };
    E._onKeyUp = (e) => { E.keys[e.code] = false; };
    E._onMouseDown = (e) => {
      if (!E.running) return;
      if (!E.isTouch && !E.pointerLocked) { E.canvas.requestPointerLock(); return; }
      if (e.button === 0) E.shoot();
    };
    E._onLockChange = () => { E.pointerLocked = document.pointerLockElement === E.canvas; };
    E._onMouseMove = (e) => {
      if (!E.pointerLocked || !E.running) return;
      E.player.yaw -= e.movementX * 0.0023;
      E.player.pitch = Math.max(-1.35, Math.min(1.35, E.player.pitch - e.movementY * 0.0023));
    };
    window.addEventListener('keydown', E._onKeyDown);
    window.addEventListener('keyup', E._onKeyUp);
    window.addEventListener('mousedown', E._onMouseDown);
    document.addEventListener('pointerlockchange', E._onLockChange);
    window.addEventListener('mousemove', E._onMouseMove);
    E._onResize = () => E.resize();
    window.addEventListener('resize', E._onResize);
  };

  // touch controls bind at game start — the buttons only exist once playing
  engine.bindTouch = function () {
    const E = engine;
    if (!E.isTouch || E._touchBound) return;
    E._touchBound = true;
    let sid = null, sx = 0, sy = 0, lookId = null, lx = 0, ly = 0;
    const stick = document.getElementById('hw-stick');
    const nub = document.getElementById('hw-nub');
    const fire = document.getElementById('hw-fire');
    const act = document.getElementById('hw-act');
    if (stick) {
      stick.addEventListener('touchstart', (e) => {
        const t = e.changedTouches[0]; sid = t.identifier;
        const r = stick.getBoundingClientRect(); sx = r.left + 60; sy = r.top + 60;
        e.preventDefault();
      }, { passive: false });
    }
    window.addEventListener('touchstart', (e) => {
      for (const t of e.changedTouches) {
        if (t.clientX > window.innerWidth * 0.4 && t.target !== fire && t.target !== act && lookId === null) {
          lookId = t.identifier; lx = t.clientX; ly = t.clientY;
        }
      }
    }, { passive: true });
    window.addEventListener('touchmove', (e) => {
      // Block page scroll while a game touch (stick or look) is active —
      // otherwise the drag scrolls the page instead of moving the player.
      let gameTouch = false;
      for (const t of e.changedTouches) {
        if (t.identifier === sid) {
          gameTouch = true;
          let dx = t.clientX - sx, dy = t.clientY - sy;
          const m = Math.hypot(dx, dy), max = 46;
          if (m > max) { dx *= max / m; dy *= max / m; }
          if (nub) { nub.style.left = (38 + dx) + 'px'; nub.style.top = (38 + dy) + 'px'; }
          E.keys._tx = dx / max; E.keys._ty = dy / max;
        } else if (t.identifier === lookId) {
          gameTouch = true;
          E.player.yaw -= (t.clientX - lx) * 0.006;
          E.player.pitch = Math.max(-1.35, Math.min(1.35, E.player.pitch - (t.clientY - ly) * 0.006));
          lx = t.clientX; ly = t.clientY;
        }
      }
      if (gameTouch) e.preventDefault();
    }, { passive: false });
    window.addEventListener('touchend', (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === sid) {
          sid = null; E.keys._tx = 0; E.keys._ty = 0;
          if (nub) { nub.style.left = '38px'; nub.style.top = '38px'; }
        }
        if (t.identifier === lookId) lookId = null;
      }
    });
    if (fire) fire.addEventListener('touchstart', (e) => { E.shoot(); e.preventDefault(); }, { passive: false });
    if (act) {
      act.addEventListener('touchstart', (e) => {
        E.keys._act = true; E.tryBikeToggle(); e.preventDefault();
      }, { passive: false });
      act.addEventListener('touchend', () => { E.keys._act = false; });
    }
  };

  engine.unbindInput = function () {
    const E = engine;
    window.removeEventListener('keydown', E._onKeyDown);
    window.removeEventListener('keyup', E._onKeyUp);
    window.removeEventListener('mousedown', E._onMouseDown);
    document.removeEventListener('pointerlockchange', E._onLockChange);
    window.removeEventListener('mousemove', E._onMouseMove);
    window.removeEventListener('resize', E._onResize);
  };

  engine.movePlayer = function (dt) {
    const E = engine, P = E.player;
    const f = (E.keys.KeyW || E.keys.ArrowUp ? 1 : 0) - (E.keys.KeyS || E.keys.ArrowDown ? 1 : 0);
    const s = (E.keys.KeyD || E.keys.ArrowRight ? 1 : 0) - (E.keys.KeyA || E.keys.ArrowLeft ? 1 : 0);
    let mx = 0, mz = 0;
    if (f || s) {
      const sin = Math.sin(P.yaw), cos = Math.cos(P.yaw);
      mx = (-sin * f + cos * s); mz = (-cos * f - sin * s);
      const l = Math.hypot(mx, mz); mx /= l; mz /= l;
    }
    if (E.isTouch && (E.keys._tx || E.keys._ty)) {
      const sin = Math.sin(P.yaw), cos = Math.cos(P.yaw);
      const f2 = -E.keys._ty, s2 = E.keys._tx;
      mx = (-sin * f2 + cos * s2); mz = (-cos * f2 - sin * s2);
    }
    const rideSpeed = (E.bike && E.bike.mounted) ? 72 : P.speed;
    let nx = P.pos.x + mx * rideSpeed * dt;
    let nz = P.pos.z + mz * rideSpeed * dt;
    for (const c of E.colliders) {
      const ox = nx - c.x, oz = nz - c.z, od = Math.hypot(ox, oz);
      if (od < c.r + 3 && od > 0.01) { nx = c.x + ox / od * (c.r + 3); nz = c.z + oz / od * (c.r + 3); }
    }
    nx = Math.max(-700, Math.min(700, nx));
    nz = Math.max(-4600, Math.min(900, nz));
    P.pos.x = nx; P.pos.z = nz;
    const t = E.clock.getElapsedTime();
    const bob = (mx || mz) ? Math.sin(t * 11) * 0.55 : 0;
    E.camera.position.set(P.pos.x, EYE + bob, P.pos.z);
    let shx = 0, shy = 0;
    if (E.shakeAmt > 0.01) {
      shx = (Math.random() - 0.5) * E.shakeAmt * 1.6;
      shy = (Math.random() - 0.5) * E.shakeAmt * 1.6;
      E.shakeAmt *= Math.pow(0.02, dt);
    }
    if (E.perspective === 'third') {
      // 3rd person: camera trails behind + above, aimed down the shot ray
      // so the center reticle stays true.
      const back = new THREE.Vector3(Math.sin(P.yaw), 0, Math.cos(P.yaw));
      const cx = P.pos.x - back.x * 26, cz = P.pos.z - back.z * 26;
      E.camera.position.set(cx, EYE + 13 + bob * 0.5, cz);
      const aim = new THREE.Vector3(
        P.pos.x + Math.sin(P.yaw) * Math.cos(P.pitch) * 120,
        EYE + 4 + Math.sin(P.pitch) * 120,
        P.pos.z + Math.cos(P.yaw) * Math.cos(P.pitch) * 120);
      E.camera.lookAt(aim);
      if (E.playerAvatar) {
        if (E.avatarPose) {
          // GLB character: the pose driver owns the bob; the group
          // just carries position + facing.
          E.playerAvatar.position.set(P.pos.x, 0, P.pos.z);
          E.playerAvatar.rotation.y = P.yaw;
          const ridingNow = !!(E.bike && E.bike.mounted);
          E.avatarPose.update(t, {
            mode: ridingNow ? 'ride' : (mx || mz) ? 'run' : 'idle',
            phase: 0,
          });
        } else {
          E.playerAvatar.position.set(P.pos.x, Math.abs(Math.sin(t * 11)) * 0.4 * ((mx || mz) ? 1 : 0), P.pos.z);
          E.playerAvatar.rotation.y = P.yaw;
        }
      }
    } else {
      E.camera.rotation.order = 'YXZ';
      E.camera.rotation.y = P.yaw + shx * 0.03;
      E.camera.rotation.x = P.pitch + shy * 0.03;
      E.camera.rotation.z = 0;
    }
    // bike follows the rider; FOV kicks up at speed
    const riding = !!(E.bike && E.bike.mounted);
    if (riding) {
      E.bike.mesh.position.set(P.pos.x, 0, P.pos.z);
      E.bike.mesh.rotation.y = P.yaw + Math.PI;
      const spin = (mx || mz) ? dt * 9 : dt * 1.5;
      for (const w of E.bike.wheels) w.rotation.z -= spin;
    }
    const targetFov = riding ? 84 : 74;
    if (Math.abs(E.camera.fov - targetFov) > 0.1) {
      E.camera.fov += (targetFov - E.camera.fov) * Math.min(1, dt * 4);
      E.camera.updateProjectionMatrix();
    }
    const fwd = E.getForward();
    E.flashlight.position.copy(E.camera.position);
    E.flashlight.target.position.copy(E.camera.position).add(fwd.multiplyScalar(60));
    for (const tr of E.traces) {
      if (tr.taken) continue;
      tr.mesh.rotation.y = t * 0.8;
      tr.aura.material.opacity = 0.35 + Math.sin(t * 3) * 0.2;
      if (tr.mesh.position.distanceTo(P.pos) < 14) E.collectTrace(tr);
    }
    if (P.fireCooldown > 0) P.fireCooldown -= dt;
    if (P.health < P.maxHealth && t - P.lastRegen > 6) {
      P.health = Math.min(P.maxHealth, P.health + 4 * dt);
      E.hooks.onHealth(P.health / P.maxHealth);
    }
  };

  engine.updateWaves = function (dt) {
    const E = engine;
    const aliveCount = E.demogorgons.filter(d => !d.dead).length;
    const target = Math.min(3 + E.wave * 2, 10);
    E.waveTimer -= dt;
    const dimMult = E.dimension === 'upside' ? 1.4 : 1;
    if (E.waveSpawned < target * dimMult && E.waveTimer <= 0 && aliveCount < 9) {
      E.spawnDemogorgon(); E.waveTimer = 1.8;
    }
    const nextWaveAt = E.wave * 6;
    if (E.kills >= nextWaveAt && E.waveSpawned >= target) {
      E.wave++;
      E.waveSpawned = 0;
      E.hooks.onWave(E.wave);
      if (!E.vecnaRevealed) {
        E.hooks.banner('WAVE ' + E.wave + ' — THE PACK GROWS');
        E.hooks.feed('faster. angrier. hungrier.');
      }
    }
  };

  /* ---------------- main loop ---------------- */
  engine.start = function () {
    const E = engine;
    E.running = true;
    E.spawnTraces();
    E.spawnPortal();
    E.spawnBike();
    E.bindTouch();
    E.hooks.setObjective('Hunt demogorgons. Find the <b style="color:#bb88ff">clock traces</b> (' + TRACES_NEEDED + '). The <b style="color:#aa66ff">portal</b> at the center of town leads to the Upside Down — follow the arrow.');
    E.hooks.banner('HAWKINS — SOMETHING STIRS');
    if (!E.isTouch) E.canvas.requestPointerLock();
    const loop = () => {
      if (!E.running) return;
      E.raf = requestAnimationFrame(loop);
      if (E.contextGuard && E.contextGuard.isLost()) return; // frozen while the context is gone
      const dt = Math.min(E.clock.getDelta(), 0.05);
      const t = E.clock.getElapsedTime();
      if (E.player.alive) {
        E.movePlayer(dt);
        E.updatePortal(dt, t);
        E.applyDimension(dt);
        E.updateDemogorgons(dt, t);
        E.updateBats(dt, t);
        E.updateVecna(dt, t);
        E.updateMindflayer(dt, t);
        E.updateBlasts(dt);
        E.updateWaves(dt);
      }
      const ap = E.ash.geometry.attributes.position.array;
      for (let i = 0; i < ap.length; i += 3) {
        ap[i + 1] -= dt * 7; ap[i] += Math.sin(t * 0.7 + i) * dt * 6;
        if (ap[i + 1] < 0) ap[i + 1] = 900;
      }
      E.ash.geometry.attributes.position.needsUpdate = true;
      const sp = E.spores.geometry.attributes.position.array;
      for (let i = 0; i < sp.length; i += 3) {
        sp[i + 1] -= dt * 3; sp[i] += Math.sin(t * 0.5 + i) * dt * 8;
        if (sp[i + 1] < 0) sp[i + 1] = 700;
      }
      E.spores.geometry.attributes.position.needsUpdate = true;
      if (Math.random() > (E.vecnaRevealed ? 0.955 : 0.968)) E.triggerLightning();
      for (const l of E.lamps) {
        l.userData.flick += dt;
        l.intensity = (Math.random() > 0.985 ? 7 : 1.1) + Math.sin(t * 9 + l.userData.flick) * 0.4;
      }
      if (E.beacon) E.beacon.material.color.setHex(Math.sin(t * 4) > 0 ? 0xff0000 : 0x440000);
      if (E.neon) E.neon.material.color.setHex(Math.random() > 0.94 ? 0x551122 : 0xff2266);
      for (let i = E.tracers.length - 1; i >= 0; i--) {
        E.tracers[i].life -= dt;
        E.tracers[i].line.material.opacity = Math.max(0, E.tracers[i].life * 10);
        if (E.tracers[i].life <= 0) {
          E.scene.remove(E.tracers[i].line);
          E.tracers[i].line.geometry.dispose();
          E.tracers.splice(i, 1);
        }
      }
      // HUD sync (throttled)
      E.hudTimer += dt;
      if (E.hudTimer > 0.25) {
        E.hudTimer = 0;
        E.hooks.onTick();
        // navigation arrow
        const nt = E.getNavTarget();
        const ndx = nt.x - E.player.pos.x, ndz = nt.z - E.player.pos.z;
        const targetYaw = Math.atan2(-ndx, -ndz);
        let rel = E.player.yaw - targetYaw;
        rel = Math.atan2(Math.sin(rel), Math.cos(rel));
        E.hooks.onNav(rel, nt.label, Math.hypot(ndx, ndz));
        // bike prompt
        if (E.bike) {
          if (E.bike.mounted) E.hooks.onBikePrompt('dismount');
          else {
            const bd = Math.hypot(E.player.pos.x - E.bike.x, E.player.pos.z - E.bike.z);
            E.hooks.onBikePrompt(bd < 11 ? 'mount' : null);
          }
        }
      }
      E.renderer.render(E.scene, E.camera);
    };
    loop();
  };

  engine.stop = function () {
    const E = engine;
    E.running = false;
    cancelAnimationFrame(E.raf);
    E.unbindInput();
    if (document.exitPointerLock) document.exitPointerLock();
  };

  engine.dispose = function () {
    const E = engine;
    E._glbAlive = false; // pending GLB loads retire themselves
    E.stop();
    if (E.contextGuard) E.contextGuard.dispose();
    E.scene.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach((m) => { if (m.map) m.map.dispose(); m.dispose(); });
      }
    });
    E.renderer.dispose();
  };

  return engine;
}
