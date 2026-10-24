/*
 * STAR WARS — character placement + lightsabers for the zone engine.
 *
 * World defs carry `characters: [{ id, model, name, at: [x, z],
 * faceYaw, height?, hand?, saber: { color, length } | null }]`.
 * buildCharacter assembles one figure:
 *
 *   group (seated on the terrain, rotated to faceYaw)
 *    ├─ shadow blob (soft ground disc)
 *    ├─ body (breathing bob + slow look-around drift)
 *    │    ├─ model slot — the GLB, height-fitted, base on y=0
 *    │    └─ saber group at the hand anchor (when def.saber)
 *    └─ name label (canvas sprite, the zone's label style)
 *
 * Characters are dressing: they stand in BOTH Free Roam and Mission
 * modes, are never objectives, and carry only a small body collider
 * (added by zone.js). The figures shipping today are unrigged
 * generation-stage models, so idle life is a subtle bob + yaw drift;
 * when a rigged file later replaces the GLB at the same public path,
 * this module needs no change — the skeleton simply arrives inside
 * the same slot (skeletal idle/gestures become possible then).
 *
 * THE SABER: hilt (procedural metal) + blade (bright core + additive
 * glow shell + point light + synthesized hum). The pure state machine
 * in saber.js decides ignition by player proximity (ignite <= 12 m,
 * retract > 18 m, hysteresis between); this module renders its
 * progress: ~180 ms ease-out extension, a white emitter flare on
 * ignition, ±1.5% length shimmer while lit. The hum is Web Audio,
 * gesture-gated: the context only ever resumes after the user's
 * first pointer/key interaction (the house sfx pattern).
 */
import { createSaberState } from './saber.js';

/*
 * Generated character models, height-fitted (unlike GLB_MODELS in
 * landmarks.js, which fit by horizontal extent). yawFix corrects a
 * model's file-space facing to the house convention (figure faces
 * its local +Z): measured from each model's head-band geometry —
 * the knight's face protrudes toward +Z (fix 0); the dark lord's
 * toward −Z (fix π). One-glance correctable per model.
 */
export const CHARACTER_MODELS = {
  knight: { url: '/models/star-wars/knight.glb', yawFix: 0 },
  'dark-lord': { url: '/models/star-wars/dark-lord.glb', yawFix: Math.PI },
};

/* Default right-hand anchor in body space (metres, figure facing
 * +Z, so the right hand sits at −X): hip height, slightly forward —
 * where a hanging hand grips a hilt. Defs override per character. */
const DEFAULT_HAND = [-0.34, 0.98, 0.10];

/**
 * Load CHARACTER_MODELS[key] into `slot`, normalised by HEIGHT:
 * the figure stands `height` metres tall, base on y=0, centred on
 * x/z, with the registry's yawFix applied to an inner wrap. Same
 * loader idiom as landmarks.attachGlbModel (dynamic import, window
 * guarded, never throws). onArrive fires once the model is in.
 * Returns the slot, or null when loading can't happen here.
 */
export function attachCharacterModel(R, slot, key, height, onArrive) {
  const def = CHARACTER_MODELS[key];
  if (!def || !slot || typeof window === 'undefined') return null;
  const wrap = new R.Group();
  wrap.name = 'character-model:' + key;
  wrap.rotation.y = def.yawFix || 0;
  slot.add(wrap);
  (async () => {
    try {
      const [{ GLTFLoader }, { MeshoptDecoder }] = await Promise.all([
        import('three/examples/jsm/loaders/GLTFLoader.js'),
        import('three/examples/jsm/libs/meshopt_decoder.module.js'),
      ]);
      const loader = new GLTFLoader();
      loader.setMeshoptDecoder(MeshoptDecoder);
      const gltf = await loader.loadAsync(def.url);
      const model = gltf.scene;
      const box = new R.Box3().setFromObject(model);
      const size = new R.Vector3(); box.getSize(size);
      const center = new R.Vector3(); box.getCenter(center);
      const fit = (height || 1.8) / Math.max(size.y, 1e-6);
      model.scale.setScalar(fit);
      model.position.set(-center.x * fit, -box.min.y * fit, -center.z * fit);
      model.traverse((o) => {
        if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; }
      });
      wrap.add(model);
      slot.userData.characterModel = key;
      if (typeof onArrive === 'function') onArrive();
    } catch (e) {
      /* no stand-in for a person: the figure simply never appears */
    }
  })();
  return slot;
}

/* Name label — the zone engine's canvas-sprite house style. */
function makeNameLabel(R, text) {
  const cv = document.createElement('canvas');
  cv.width = 256; cv.height = 64;
  const ctx = cv.getContext('2d');
  if (ctx) {
    ctx.fillStyle = 'rgba(8,10,18,0.72)';
    ctx.fillRect(0, 8, 256, 48);
    ctx.strokeStyle = '#ffcf5e'; ctx.lineWidth = 3;
    ctx.strokeRect(2, 10, 252, 44);
    ctx.fillStyle = '#ffe9b0';
    ctx.font = 'bold 26px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(text).slice(0, 18), 128, 33);
  }
  const tex = new R.CanvasTexture(cv);
  tex.colorSpace = R.SRGBColorSpace;
  const sp = new R.Sprite(new R.SpriteMaterial({
    map: tex, transparent: true, depthWrite: false, fog: false,
  }));
  sp.scale.set(6.4, 1.6, 1);
  return sp;
}

/**
 * Synthesized saber audio: an ignite/retract pitch sweep plus the
 * standing hum (detuned saw pair through a lowpass, ~55 Hz). One
 * handle per saber. Everything is gesture-gated — the context is
 * created/resumed only from a user pointer/key event (or an ignite
 * that follows one), so a saber never sounds uninvited.
 */
export function createSaberAudio() {
  let ctx = null;
  let master = null;
  let humNodes = null;

  function ensure() {
    if (ctx || typeof window === 'undefined') return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.9;
      master.connect(ctx.destination);
    } catch (e) { ctx = null; }
  }
  function unlock() {
    ensure();
    if (ctx && ctx.state === 'suspended') {
      try { ctx.resume(); } catch (e) { /* stays silent until a gesture lands */ }
    }
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
  }

  function sweep(up) {
    if (!ctx || ctx.state !== 'running') return;
    const t0 = ctx.currentTime;
    const osc = ctx.createOscillator();
    const lp = ctx.createBiquadFilter();
    const g = ctx.createGain();
    osc.type = 'sawtooth';
    lp.type = 'lowpass'; lp.frequency.value = 900;
    osc.frequency.setValueAtTime(up ? 90 : 320, t0);
    osc.frequency.exponentialRampToValueAtTime(up ? 340 : 80, t0 + (up ? 0.16 : 0.13));
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.05, t0 + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + (up ? 0.2 : 0.16));
    osc.connect(lp); lp.connect(g); g.connect(master);
    osc.start(t0); osc.stop(t0 + 0.25);
  }

  function startHum() {
    if (!ctx || humNodes) return;
    const o1 = ctx.createOscillator();
    const o2 = ctx.createOscillator();
    const lp = ctx.createBiquadFilter();
    const g = ctx.createGain();
    o1.type = 'sawtooth'; o1.frequency.value = 55;
    o2.type = 'sawtooth'; o2.frequency.value = 55 * 1.008 + 0.7;
    lp.type = 'lowpass'; lp.frequency.value = 420; lp.Q.value = 2;
    g.gain.value = 0;
    o1.connect(lp); o2.connect(lp); lp.connect(g); g.connect(master);
    o1.start(); o2.start();
    humNodes = { o1, o2, g };
  }
  function stopHum() {
    if (!humNodes) return;
    try { humNodes.o1.stop(); humNodes.o2.stop(); } catch (e) { /* already stopped */ }
    humNodes = null;
  }

  return {
    ignite() { unlock(); sweep(true); startHum(); },
    retract() { sweep(false); stopHum(); },
    /* level 0..1 — blade extension × proximity, set every frame. */
    setHum(level) {
      if (humNodes && ctx) {
        const v = Math.max(0, Math.min(1, level)) * 0.055;
        try { humNodes.g.gain.setTargetAtTime(v, ctx.currentTime, 0.08); } catch (e) { /* noop */ }
      }
    },
    dispose() {
      stopHum();
      if (typeof window !== 'undefined') {
        window.removeEventListener('pointerdown', unlock);
        window.removeEventListener('keydown', unlock);
      }
      if (ctx) { try { ctx.close(); } catch (e) { /* noop */ } ctx = null; }
    },
  };
}

/* The saber assembly: hilt + blade + flare + light, origin at the
 * grip, blade extending along +Y. Render state is driven per frame
 * by the pure state machine's blade01(). */
function buildSaber(R, saberCfg) {
  const color = new R.Color(saberCfg.color != null ? saberCfg.color : 0x3f9dff);
  const length = saberCfg.length || 1.05;
  const group = new R.Group();
  group.name = 'saber';

  const hiltMat = new R.MeshStandardMaterial({
    color: 0xb9bec8, metalness: 0.9, roughness: 0.35,
  });
  const darkMat = new R.MeshStandardMaterial({
    color: 0x2a2c31, metalness: 0.7, roughness: 0.5,
  });
  const hilt = new R.Mesh(new R.CylinderGeometry(0.016, 0.018, 0.25, 10), hiltMat);
  hilt.position.y = 0.02;
  group.add(hilt);
  const band = new R.Mesh(new R.CylinderGeometry(0.019, 0.019, 0.035, 10), darkMat);
  band.position.y = -0.05;
  group.add(band);
  const emitter = new R.Mesh(new R.CylinderGeometry(0.020, 0.016, 0.035, 10), darkMat);
  emitter.position.y = 0.16;
  group.add(emitter);

  const bladeGroup = new R.Group();
  bladeGroup.position.y = 0.175;
  bladeGroup.visible = false;
  const coreGeo = new R.CylinderGeometry(0.0105, 0.0125, 1, 8);
  coreGeo.translate(0, 0.5, 0);
  const core = new R.Mesh(coreGeo, new R.MeshBasicMaterial({
    color: color.clone().lerp(new R.Color(0xffffff), 0.82), fog: false,
  }));
  const glowGeo = new R.CylinderGeometry(0.034, 0.038, 1, 12, 1, true);
  glowGeo.translate(0, 0.5, 0);
  const glow = new R.Mesh(glowGeo, new R.MeshBasicMaterial({
    color: color, transparent: true, opacity: 0.32,
    blending: R.AdditiveBlending, side: R.DoubleSide, depthWrite: false, fog: false,
  }));
  bladeGroup.add(core); bladeGroup.add(glow);
  bladeGroup.scale.y = 0.0001;
  group.add(bladeGroup);

  const flare = new R.Mesh(
    new R.SphereGeometry(0.055, 10, 8),
    new R.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0,
      blending: R.AdditiveBlending, depthWrite: false, fog: false,
    })
  );
  flare.position.y = 0.19;
  group.add(flare);

  const light = new R.PointLight(color, 0, 10, 1.6);
  light.position.y = 0.6;
  group.add(light);

  /* A natural ready grip: blade tilted forward off the hand, rolled
   * slightly outward — never spearing the figure's own leg. */
  group.rotation.set(-0.32, 0, 0.14);

  return { group, bladeGroup, flare, light, length };
}

/**
 * Build one character. R = three namespace, charDef as in data.js,
 * groundHeight(x, z) seats the figure on the terrain.
 * Returns { group, update(t, dt, distToPlayer), dispose() }.
 */
export function buildCharacter(R, charDef, groundHeight) {
  const def = charDef || {};
  const at = Array.isArray(def.at) ? def.at : [0, 0];
  const height = def.height || 1.8;
  const phase = at[0] * 1.7 + at[1];

  const group = new R.Group();
  group.name = 'character:' + (def.id || def.model || 'figure');
  group.position.set(at[0], groundHeight(at[0], at[1]), at[1]);
  group.rotation.y = def.faceYaw || 0;

  const shadow = new R.Mesh(
    new R.CircleGeometry(0.55, 20),
    new R.MeshBasicMaterial({
      color: 0x000000, transparent: true, opacity: 0.32, depthWrite: false,
    })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.03;
  group.add(shadow);

  const body = new R.Group();
  body.name = 'character-body';
  group.add(body);

  const slot = new R.Group();
  slot.name = 'character-slot';
  body.add(slot);

  /* Label + saber stay hidden until the model actually arrives —
   * a floating name or a hilt with nobody holding it reads broken. */
  const label = makeNameLabel(R, def.name || def.id || '');
  label.position.y = height + 0.5;
  label.visible = false;
  group.add(label);

  let saber = null;
  let saberState = null;
  let audio = null;
  if (def.saber) {
    saber = buildSaber(R, def.saber);
    const hand = Array.isArray(def.hand) ? def.hand : DEFAULT_HAND;
    saber.group.position.set(hand[0], hand[1], hand[2]);
    saber.group.visible = false;
    body.add(saber.group);
    saberState = createSaberState();
    audio = createSaberAudio();
  }

  attachCharacterModel(R, slot, def.model, height, () => {
    label.visible = true;
    if (saber) saber.group.visible = true;
  });

  function update(t, dt, dist) {
    /* Idle life for an unrigged figure: a breath, and a slow look
     * around. Small and dignified — no theatrics. */
    body.position.y = Math.sin(t * 1.35 + phase) * 0.012;
    body.rotation.y = Math.sin(t * 0.23 + phase * 1.3) * 0.13;

    if (saber && saberState) {
      const events = saberState.update(dt, dist);
      for (const ev of events) {
        if (ev === 'ignite') audio.ignite();
        else if (ev === 'retract') audio.retract();
      }
      const b = saberState.blade01();
      const lit = saberState.state === 'lit';
      const shimmer = lit ? 1 + 0.011 * Math.sin(t * 37 + phase) + 0.006 * Math.sin(t * 61) : 1;
      saber.bladeGroup.visible = b > 0.001;
      saber.bladeGroup.scale.y = Math.max(0.0001, b * saber.length * shimmer);
      /* The ignition flare: a one-beat white bloom at the emitter
       * that dies as the blade reaches full length. */
      const p = saberState.progress;
      saber.flare.material.opacity = saberState.state === 'igniting'
        ? 0.85 * (1 - p) : 0;
      const fs = 1 + (1 - p) * 1.6;
      saber.flare.scale.set(fs, fs, fs);
      saber.light.intensity = 2.4 * b;
      const prox = typeof dist === 'number' && Number.isFinite(dist)
        ? Math.max(0, 1 - dist / 22) : 0;
      audio.setHum(b * prox);
    }
  }

  function dispose() {
    if (audio) audio.dispose();
  }

  return { group, update, dispose };
}
