/**
 * Abyssal Voyage — marine life system (Merlin, 2026-10-29).
 * Rigged Tripo sea creatures swim through the dive with natural motion.
 *
 * How it works:
 *  - Creature definitions name a GLB in public/models/abyssal/, a swim
 *    style, and the depth band where they live.
 *  - On load, bones are scanned and classified by name (tail chain,
 *    spine, fins, head). The swimmer then drives them with the motion
 *    real animals use: fish sweep the tail (lateral undulation growing
 *    toward the tail), sharks glide with slow powerful beats, jellyfish
 *    pulse the bell, anglerfish drift with a glowing lure.
 *  - If a model's bone names don't match, the swimmer falls back to
 *    whole-body procedural motion so nothing ever swims stiff.
 *
 * Creature registry (drop the rigged GLBs in to activate):
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export const CREATURES = [
  { id: 'jellyfish', file: 'jellyfish-rigged.glb', style: 'jelly', depth: [1200, 6500], scale: 1.4, count: 5 },
  { id: 'shark', file: 'shark-rigged.glb', style: 'shark', depth: [400, 3200], scale: 2.2, count: 2 },
  { id: 'blue-tang', file: 'blue-tang-rigged.glb', style: 'fish', depth: [800, 2500], scale: 0.9, count: 4 },
  { id: 'tuna', file: 'tuna-rigged.glb', style: 'tuna', depth: [150, 2200], scale: 1.3, count: 4 },
  { id: 'anglerfish', file: 'anglerfish-rigged.glb', style: 'angler', depth: [4500, 11000], scale: 1.1, count: 3 },
  { id: 'clownfish', file: 'clownfish-rigged.glb', style: 'fish', depth: [7800, 11000], scale: 0.7, count: 6 },
  { id: 'reef-fish', file: 'reef-fish-rigged.glb', style: 'fish', depth: [7800, 11000], scale: 0.8, count: 6 },
];

/** Classify bones by name into swim roles. */
export function classifyBones(root) {
  const bones = [];
  root.traverse((o) => { if (o.isBone) bones.push(o); });
  const byName = (re) => bones.filter((b) => re.test(b.name.toLowerCase()));
  // tail chain: bones with "tail" in the name, ordered root->tip by depth
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

/**
 * A single swimming creature. update(t, dt) advances the swim cycle
 * and the drift path.
 */
export class Swimmer {
  constructor(object3d, def, rng) {
    this.obj = object3d;
    this.def = def;
    this.rng = rng;
    this.bones = classifyBones(object3d);
    this.phase = rng() * Math.PI * 2;
    // swim parameters per style (frequency Hz, amplitude)
    const styles = {
      jelly: { freq: 0.9, amp: 0.5, speed: 1.2 },
      shark: { freq: 1.1, amp: 0.35, speed: 3.2 },
      fish: { freq: 2.2, amp: 0.4, speed: 2.4 },
      tuna: { freq: 3.0, amp: 0.3, speed: 5.0 },
      angler: { freq: 0.7, amp: 0.25, speed: 0.8 },
    };
    this.swim = styles[def.style] || styles.fish;
    this.swim.freq *= 0.85 + rng() * 0.3; // individual variation
    // drift path: cross the trench at the creature's depth band
    this.reset(true);
  }

  reset(initial = false) {
    const [d0, d1] = this.def.depth;
    // creatures live in world space; the dive scrolls past them.
    // We place them ahead in z and let them drift; respawn far when passed.
    this.z = initial ? -20 - this.rng() * 100 : -120 - this.rng() * 40;
    this.x = (this.rng() * 2 - 1) * 26;
    this.y = (this.rng() * 2 - 1) * 6 - 2;
    this.dir = this.rng() < 0.5 ? -1 : 1; // swim left or right
    this.depthAnchor = d0 + this.rng() * (d1 - d0);
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
    const w = Math.sin(t * s.freq * Math.PI * 2 + this.phase);

    // --- skeletal swimming (when the rig has the bones) ---
    const { tail, spine, head, fins } = this.bones;
    if (tail.length > 0) {
      // lateral undulation growing toward the tail tip — how fish swim
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
    // whole-body fallback: if no tail/spine bones, sway the body
    if (tail.length === 0 && spine.length === 0) {
      this.obj.rotation.y = w * s.amp * 0.4;
    }
    if (head) head.rotation.y = -w * s.amp * 0.3; // head counter-swings
    fins.forEach((f, i) => {
      f.rotation.z = Math.sin(t * s.freq * Math.PI * 2 + this.phase + i) * 0.35;
    });

    // --- jellyfish bell pulse ---
    if (this.def.style === 'jelly') {
      const pulse = 1 + Math.sin(t * s.freq * Math.PI * 2 + this.phase) * 0.18;
      this.obj.scale.set(
        this.def.scale * (2 - pulse) * 0.5 + this.def.scale * 0.5,
        this.def.scale * pulse,
        this.def.scale * (2 - pulse) * 0.5 + this.def.scale * 0.5
      );
    }

    // --- drift: swim across, bob gently ---
    this.x += this.dir * s.speed * dt;
    if (this.x > 34 || this.x < -34) this.reset();
    this.obj.position.set(
      this.x,
      this.y + Math.sin(t * 0.8 + this.phase) * 0.8,
      this.z
    );
    // face the swim direction
    this.obj.rotation.y += ((this.dir > 0 ? Math.PI / 2 : -Math.PI / 2) - this.obj.rotation.y) * Math.min(1, dt * 2);
  }
}

/**
 * MarineLife: loads the registry, owns the swimmers, updates them.
 * Missing GLBs are skipped silently — the reef and gates carry the
 * scene until the Tripo downloads land.
 */
export class MarineLife {
  constructor(scene) {
    this.scene = scene;
    this.swimmers = [];
    this.loader = new GLTFLoader();
    this.rng = mulberry(777);
    this.ready = false;
  }

  async load() {
    const jobs = [];
    for (const def of CREATURES) {
      for (let i = 0; i < def.count; i++) {
        jobs.push(this.loadOne(def));
      }
    }
    await Promise.allSettled(jobs);
    this.ready = true;
  }

  loadOne(def) {
    return new Promise((resolve) => {
      this.loader.load(
        `/models/abyssal/${def.file}`,
        (gltf) => {
          const obj = gltf.scene;
          obj.scale.setScalar(def.scale);
          this.scene.add(obj);
          this.swimmers.push(new Swimmer(obj, def, this.rng));
          resolve();
        },
        undefined,
        () => resolve() // missing file: skip silently, reef carries the scene
      );
    });
  }

  update(t, dt, diveDepth) {
    for (const s of this.swimmers) s.update(t, dt, diveDepth);
  }

  dispose() {
    for (const s of this.swimmers) {
      this.scene.remove(s.obj);
      s.obj.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) {
          const ms = Array.isArray(o.material) ? o.material : [o.material];
          ms.forEach((m) => m.dispose());
        }
      });
    }
    this.swimmers = [];
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
