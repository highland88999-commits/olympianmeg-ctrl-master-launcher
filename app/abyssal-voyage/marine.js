/**
 * Abyssal Voyage — marine life system (Merlin, 2026-10-29).
 * Rigged Tripo sea creatures swim through the dive with natural motion.
 *
 * How it works:
 *  - Creature definitions name a GLB in public/models/abyssal/, a swim
 *    style, the depth band where they live, and a social pattern.
 *  - LAZY LOADING (crash fix, 2026-10-29): the old code fired 31
 *    concurrent GLTF parses of 13–35 MB models and iOS killed the tab.
 *    Now each species parses ONCE (SkeletonUtils.clone for the rest),
 *    at most 2 concurrent fetches, and only when the dive nears the
 *    species' depth band.
 *  - SOCIAL LIFE: tuna/blue-tang/clownfish/reef-fish swim in schools
 *    (shared anchor, synchronized tail beats); sharks cruise alone or
 *    pair up; whales travel alone or as mother + calf; jellyfish drift
 *    upward through the shallows.
 *  - BIOLUMINESCENCE: every creature gets an emissive lift plus a soft
 *    pulsing glow sprite — the deep lights itself.
 *
 * Creature registry (drop the rigged GLBs in to activate):
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';

export const CREATURES = [
  { id: 'jellyfish', file: 'jellyfish-rigged.glb', style: 'jelly', depth: [300, 2200], scale: 1.4, count: 5, glow: 0x66ffee, social: 'drift' },
  { id: 'shark', file: 'shark-rigged.glb', style: 'shark', depth: [400, 3200], scale: 2.2, count: 2, glow: 0x3a7bd5, social: 'pack' },
  { id: 'blue-tang', file: 'blue-tang-rigged.glb', style: 'fish', depth: [800, 2500], scale: 0.9, count: 5, glow: 0x44ccff, social: 'school' },
  { id: 'tuna', file: 'tuna-rigged.glb', style: 'tuna', depth: [150, 2200], scale: 1.3, count: 6, glow: 0x77ddff, social: 'school' },
  { id: 'anglerfish', file: 'anglerfish-rigged.glb', style: 'angler', depth: [4500, 11000], scale: 1.1, count: 3, glow: 0xaa66ff, social: 'solo' },
  { id: 'clownfish', file: 'clownfish-rigged.glb', style: 'fish', depth: [7800, 11000], scale: 0.7, count: 6, glow: 0xffaa33, social: 'school' },
  { id: 'reef-fish', file: 'reef-fish-rigged.glb', style: 'fish', depth: [7800, 11000], scale: 0.8, count: 6, glow: 0x55ff99, social: 'school' },
  { id: 'blue-whale', file: 'blue-whale-rigged.glb', style: 'whale', depth: [1800, 5200], scale: 4.5, count: 2, glow: 0x4488ff, social: 'pod' },
];

/** How far above a band the dive may be before we start fetching it. */
const PRELOAD_ABOVE = 1200;
const MAX_CONCURRENT = 2;

/** Classify bones by name into swim roles. */
export function classifyBones(root) {
  const bones = [];
  root.traverse((o) => { if (o.isBone) bones.push(o); });
  const byName = (re) => bones.filter((b) => re.test(b.name.toLowerCase()));
  const tail = byName(/tail/).sort((a, b) => boneDepth(a) - boneDepth(b));
  const spine = byName(/spine|torso|body|abdomen/).sort((a, b) => boneDepth(a) - boneDepth(b));
  const head = byName(/head|skull|neck/)[0] || null;
  const fins = byName(/fin|flipper|pectoral|dorsal/);
  return { all: bones, tail, spine, head, fins };
}

function boneDepth(bone) {
  let d = 0, o = bone;
  while (o.parent) { d++; o = o.parent; }
  return d;
}

function glowTexture() {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,0.9)');
  grad.addColorStop(0.4, 'rgba(255,255,255,0.28)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
let sharedGlowTex = null;

/** Bioluminescence: emissive lift + a soft pulsing aura sprite. */
function makeBioluminescent(obj, hex, auraScale) {
  const col = new THREE.Color(hex);
  obj.traverse((o) => {
    if (o.isMesh && o.material) {
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        if (!('emissive' in m)) continue;
        const cur = m.emissive ? m.emissive.getHex() : 0;
        if (cur === 0) {
          m.emissive = col.clone();
          m.emissiveIntensity = 0.85;
        } else {
          // already glowing (angler lure): push it brighter
          m.emissiveIntensity = Math.max(m.emissiveIntensity || 1, 1.6);
        }
      }
    }
  });
  if (!sharedGlowTex) sharedGlowTex = glowTexture();
  if (typeof document === 'undefined' || !sharedGlowTex) return null;
  const aura = new THREE.Sprite(new THREE.SpriteMaterial({
    map: sharedGlowTex, color: col, transparent: true, opacity: 0.32,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  aura.scale.set(auraScale, auraScale, 1);
  aura.userData.isAura = true;
  obj.add(aura);
  return aura;
}

/**
 * A single swimming creature. update(t, dt) advances the swim cycle
 * and the drift path. opts: { school, role, follow }.
 */
export class Swimmer {
  constructor(object3d, def, rng, opts = {}) {
    this.obj = object3d;
    this.def = def;
    this.rng = rng;
    this.bones = classifyBones(object3d);
    this.phase = rng() * Math.PI * 2;
    const styles = {
      jelly: { freq: 0.9, amp: 0.5, speed: 1.2 },
      shark: { freq: 1.1, amp: 0.35, speed: 3.2 },
      fish: { freq: 2.2, amp: 0.4, speed: 2.4 },
      tuna: { freq: 3.0, amp: 0.3, speed: 5.0 },
      angler: { freq: 0.7, amp: 0.25, speed: 0.8 },
      whale: { freq: 0.45, amp: 0.3, speed: 1.6 },
    };
    this.swim = styles[def.style] || styles.fish;
    this.swim.freq *= 0.85 + rng() * 0.3;
    // social wiring
    this.school = opts.school || null;   // shared anchor for schools
    this.offset = opts.offset || null;   // {x, y} slot in the school
    this.follow = opts.follow || null;   // another Swimmer to trail (pack/pod)
    this.followOffset = opts.followOffset || { x: 6, y: -1 };
    this.packTimer = 8 + rng() * 14;     // pack/pod regroup rhythm
    this.paired = true;
    this.aura = makeBioluminescent(object3d, def.glow, def.scale * 7);
    this.reset(true);
  }

  reset(initial = false) {
    const [d0, d1] = this.def.depth;
    // Swim lanes cross the play plane (z near 0) so creatures pass by
    // the sub where the player can see them — not a hundred units deep
    // in the fog (2026-10-29, Merlin: "sea life should occasionally
    // swim past users").
    this.z = -10 + this.rng() * 20;
    this.x = (this.rng() * 2 - 1) * 26;
    this.y = (this.rng() - 0.5) * 26;
    this.dir = this.rng() < 0.5 ? -1 : 1;
    this.depthAnchor = d0 + this.rng() * (d1 - d0);
    if (this.school && initial) {
      // school members take formation slots around the anchor
      const i = this.school.members.length;
      const cols = 3;
      this.offset = { x: (i % cols - 1) * 4.5, y: (Math.floor(i / cols) % 2 - 0.5) * 3 };
    }
  }

  /** Visible when the dive depth is inside the creature's band. */
  visibleAt(depth) {
    const [d0, d1] = this.def.depth;
    return depth >= d0 - 400 && depth <= d1 + 400;
  }

  update(t, dt, diveDepth) {
    const vis = this.visibleAt(diveDepth);
    this.obj.visible = vis;
    if (!vis) return;
    const s = this.swim;
    // school members sync their tail beat to the school phase
    const phase = this.school ? this.school.phase + (this.offset ? this.offset.x * 0.35 : 0) : this.phase;
    const w = Math.sin(t * s.freq * Math.PI * 2 + phase);

    const { tail, spine, head, fins } = this.bones;
    if (tail.length > 0) {
      tail.forEach((b, i) => {
        const k = (i + 1) / tail.length;
        b.rotation.y = w * s.amp * k;
      });
    }
    if (spine.length > 0) {
      spine.forEach((b, i) => {
        const k = (i + 1) / spine.length;
        b.rotation.y = w * s.amp * 0.35 * k;
      });
    }
    if (tail.length === 0 && spine.length === 0) {
      this.obj.rotation.y = w * s.amp * 0.4;
    }
    if (head) head.rotation.y = -w * s.amp * 0.3;
    fins.forEach((f, i) => {
      f.rotation.z = Math.sin(t * s.freq * Math.PI * 2 + phase + i) * 0.35;
    });

    if (this.def.style === 'jelly') {
      const pulse = 1 + Math.sin(t * s.freq * Math.PI * 2 + phase) * 0.18;
      this.obj.scale.set(
        this.def.scale * (2 - pulse) * 0.5 + this.def.scale * 0.5,
        this.def.scale * pulse,
        this.def.scale * (2 - pulse) * 0.5 + this.def.scale * 0.5
      );
      // jellyfish rise: slow upward drift, wrap around
      this.y += dt * 0.55;
      if (this.y > 7) this.y = -8;
    }

    // --- movement by social pattern ---
    if (this.school) {
      // formation swimming: anchor leads, members hold slots
      const a = this.school;
      this.obj.position.set(
        a.x + (this.offset ? this.offset.x * a.dir : 0),
        this.y + (this.offset ? this.offset.y : 0) + Math.sin(t * 0.8 + phase) * 0.5,
        this.z
      );
      const faceTarget = a.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      this.obj.rotation.y += (faceTarget - this.obj.rotation.y) * Math.min(1, dt * 3);
    } else if (this.follow && this.paired) {
      // pack/pod trailing: ease toward the leader's slot
      const L = this.follow;
      const tx = L.x - L.dir * this.followOffset.x;
      const ty = L.y + this.followOffset.y;
      this.x += (tx - this.x) * Math.min(1, dt * 1.2);
      this.y += (ty - this.y) * Math.min(1, dt * 1.2);
      this.dir = L.dir;
      this.obj.position.set(this.x, this.y + Math.sin(t * 0.8 + phase) * 0.6, this.z);
      const faceTarget = this.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      this.obj.rotation.y += (faceTarget - this.obj.rotation.y) * Math.min(1, dt * 3);
    } else {
      // solo drift
      this.x += this.dir * s.speed * dt;
      if (this.x > 34 || this.x < -34) this.reset();
      this.obj.position.set(this.x, this.y + Math.sin(t * 0.8 + phase) * 0.8, this.z);
      this.obj.rotation.y += ((this.dir > 0 ? Math.PI / 2 : -Math.PI / 2) - this.obj.rotation.y) * Math.min(1, dt * 2);
    }

    // pack/pod regroup rhythm: sometimes split up, sometimes regroup
    if ((this.def.social === 'pack' || this.def.social === 'pod') && this.follow) {
      this.packTimer -= dt;
      if (this.packTimer <= 0) {
        this.packTimer = 10 + this.rng() * 16;
        this.paired = !this.paired;
        if (!this.paired) this.reset(); // swim off alone for a while
      }
    }

    // aura breathing — the bioluminescent pulse
    if (this.aura) {
      this.aura.material.opacity = 0.26 + Math.sin(t * 2.2 + phase) * 0.1;
    }
  }
}

/**
 * MarineLife: lazy-loads the registry by depth band, owns the swimmers.
 * Each species parses ONCE; instances are SkeletonUtils clones (cheap).
 * At most MAX_CONCURRENT fetches in flight — the old 31-at-once storm
 * is what killed the tab on Merlin's phone.
 */
export class MarineLife {
  constructor(scene) {
    this.scene = scene;
    this.swimmers = [];
    this.loader = new GLTFLoader();
    this.rng = mulberry(777);
    this.ready = false;
    this.loaded = new Map();   // id -> { def, template }
    this.loading = new Set();  // ids in flight
    this.queue = [];           // defs waiting for a slot
    this.schools = new Map();  // id -> school anchor
  }

  /** Kick off loads for bands near the current dive depth. */
  ensureBands(depth) {
    for (const def of CREATURES) {
      if (this.loaded.has(def.id) || this.loading.has(def.id)) continue;
      if (this.queue.includes(def)) continue;
      const [d0] = def.depth;
      if (depth >= d0 - PRELOAD_ABOVE) this.queue.push(def);
    }
    this.pumpQueue();
  }

  pumpQueue() {
    while (this.loading.size < MAX_CONCURRENT && this.queue.length > 0) {
      const def = this.queue.shift();
      this.loading.add(def.id);
      this.loader.load(
        `/models/abyssal/${def.file}`,
        (gltf) => {
          this.loading.delete(def.id);
          this.spawnSpecies(def, gltf.scene);
        },
        undefined,
        () => {
          this.loading.delete(def.id); // missing file: skip, reef carries the scene
          this.pumpQueue();
        }
      );
    }
  }

  spawnSpecies(def, template) {
    template.scale.setScalar(def.scale);
    this.scene.add(template);
    // the template itself swims (instance 0); the rest are clones
    const school = (def.social === 'school') ? { x: 0, dir: 1, phase: this.rng() * 6.28, members: [] } : null;
    if (school) this.schools.set(def.id, school);
    let leader = null;
    for (let i = 0; i < def.count; i++) {
      const obj = i === 0 ? template : cloneSkinned(template);
      if (i > 0) { obj.scale.setScalar(def.scale); this.scene.add(obj); }
      const opts = {};
      if (school) { opts.school = school; }
      if ((def.social === 'pack' || def.social === 'pod') && leader) {
        opts.follow = leader;
        opts.followOffset = { x: 5 + this.rng() * 3, y: -1 - this.rng() * 1.5 };
        if (def.social === 'pod') obj.scale.setScalar(def.scale * 0.55); // the calf
      }
      const sw = new Swimmer(obj, def, this.rng, opts);
      if (school) school.members.push(sw);
      if (!leader) leader = sw;
      // calf starts paired; second shark starts wherever the rhythm puts it
      if (def.social === 'pack' && i > 0) sw.paired = this.rng() < 0.5;
      this.swimmers.push(sw);
    }
    // a school anchor needs a starting point
    if (school) {
      const m0 = school.members[0];
      school.x = m0.x; school.dir = m0.dir;
    }
    this.loaded.set(def.id, { def, template });
    this.pumpQueue();
    if (this.loaded.size === CREATURES.length) this.ready = true;
  }

  update(t, dt, diveDepth) {
    this.ensureBands(diveDepth);
    // school anchors cruise across the trench
    for (const [, school] of this.schools) {
      const speed = 2.6;
      school.x += school.dir * speed * dt;
      school.phase += dt * 2.2;
      if (school.x > 30 || school.x < -30) {
        school.dir *= -1;
        school.x = Math.max(-30, Math.min(30, school.x));
      }
    }
    for (const s of this.swimmers) s.update(t, dt, diveDepth);
  }

  dispose() {
    for (const s of this.swimmers) {
      this.scene.remove(s.obj);
      // clones share geometry with the template; dispose the template once
    }
    const seen = new Set();
    for (const s of this.swimmers) {
      s.obj.traverse((o) => {
        if (o.geometry && !seen.has(o.geometry)) { seen.add(o.geometry); o.geometry.dispose(); }
        if (o.material && !o.userData.isAura) {
          const ms = Array.isArray(o.material) ? o.material : [o.material];
          ms.forEach((m) => { if (!seen.has(m)) { seen.add(m); m.dispose(); } });
        }
      });
    }
    this.swimmers = [];
    this.loaded.clear();
    this.schools.clear();
  }
}

function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
