// lib/hub-glider/meshes.js
// The hub solar-sail glider's mesh — OUR OWN original procedural
// CGI (Merlin, Nov 27, 2026: in the spirit of Disney's Treasure
// Planet solar surfer, no Disney assets, no ripped models, no film
// stills). Built from three.js primitives, following
// lib/jupiter2/meshes.js buildSpeeder() + its std() helper idiom.
//
// The craft: an elongated surfboard, a mast, and one big billowed
// solar sail — the reflective star of the show — with rigging stays
// and a tail fin. The rider stands on the board facing the nose
// (+Z), leaning into the sail; the selected character's GLB (when
// one is picked) attaches to riderAnchor, and a procedural rider
// figure stands there until it is ready (never a hole).
//
// THE SAIL MUST REFLECT LIGHT (Merlin, Nov 27, 2026): the sail is
// NOT flat matte cloth — MeshStandardMaterial, metalness 0.95,
// roughness 0.08, envMapIntensity 1.5, DoubleSide (a sail is seen
// from both faces), with its OWN env-map from the RoomEnvironment
// PMREM singleton below. THE TRAP: the hub Canvas sets NO
// scene.environment and lights only ambient 0.4 plus the sun's
// point light — a metalness-1 / roughness-0.08 material with NO
// env-map renders BLACK in that scene. The sail carries its own
// envMap (the lib/earth/ground-video.js getGroundEnvMap pattern,
// replicated here in ~6 lines rather than importing Earth's whole
// video-ground module into the hub bundle). Do NOT set an
// environment on the hub scene — a wider change needing Merlin's
// word. The env-map is a module singleton per renderer: one PMREM
// bake, shared by every sail built.

import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { getGliderVariant } from '../hub-glider-variants.js';

/** Sail material values — the brightest, most light-catching part. */
export const SAIL_METALNESS = 0.95;
export const SAIL_ROUGHNESS = 0.08;
export const SAIL_ENV_MAP_INTENSITY = 1.5;

// --- The sail's environment: one RoomEnvironment PMREM. -----------
let sailEnvMap = null;

/**
 * The sail's env-map for a renderer (module singleton — one PMREM
 * bake, shared by every sail). Returns null when there is no
 * renderer or the bake fails; the sail then falls back to the hub
 * sun + ambient alone (dimmer, never a crash).
 */
export function getHubGliderEnvMap(gl) {
  if (sailEnvMap) return sailEnvMap;
  if (!gl) return null;
  try {
    const pmrem = new THREE.PMREMGenerator(gl);
    sailEnvMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
  } catch {
    return null;
  }
  return sailEnvMap;
}

/** Small std() helper in the jupiter2/meshes.js idiom. */
function std(color, opts) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.7,
    metalness: 0.15,
    ...(opts || {}),
  });
}

/** A thin cylindrical stay between two points (rigging). */
function strut(from, to, r, mat) {
  const a = new THREE.Vector3(from[0], from[1], from[2]);
  const b = new THREE.Vector3(to[0], to[1], to[2]);
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 6), mat);
  mesh.position.copy(a).addScaledVector(dir, 0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  return mesh;
}

/**
 * The billowed solar sail geometry: a tall panel that runs fore-aft
 * from the mast, tapering toward the top and raking back, bellied
 * sideways so it catches the light as it turns. Built in local
 * space (x = fore-aft from the mast, y = up, z = belly), then the
 * mesh is rotated to face sideways — the sail's plane contains the
 * fore-aft axis, like a windsurf sail.
 */
function buildSailGeometry() {
  const W = 4.0; // fore-aft extent from the mast
  const H = 5.2; // height
  const geo = new THREE.PlaneGeometry(W, H, 12, 12);
  geo.translate(W / 2, 0, 0); // front edge (x=0) sits at the mast
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const u = x / W; // 0 at the mast, 1 at the trailing edge
    const v = (y + H / 2) / H; // 0 at the foot, 1 at the head
    // Taper: the head is narrower than the foot.
    const taperedX = x * (1 - 0.45 * v);
    // Belly: fullest mid-panel, vanishing at every edge.
    const belly = Math.sin(Math.PI * u) * Math.sin(Math.PI * v) * 0.85;
    // Rake: the head sweeps back toward the tail.
    const rake = -v * v * 0.6;
    pos.setXYZ(i, taperedX, y, belly + rake * u);
  }
  geo.computeVertexNormals();
  return geo;
}

/** The procedural rider figure (the fallback body — never a hole). */
function buildProcRider() {
  const g = new THREE.Group();
  g.name = 'proc-rider';
  const suit = std('#223140', { roughness: 0.7, metalness: 0.1 });
  const helmetMat = std('#d8dee6', { roughness: 0.3, metalness: 0.4 });
  const dark = std('#11161c', { roughness: 0.8, metalness: 0.1 });

  // Surf stance: feet apart fore-aft, knees bent — approximated
  // with single angled leg cylinders from hips to feet.
  const legGeo = new THREE.CylinderGeometry(0.09, 0.07, 0.95, 8);
  const legF = new THREE.Mesh(legGeo, suit);
  legF.position.set(0, 0.48, 0.28);
  legF.rotation.x = 0.35; // front foot forward, knee bent
  g.add(legF);
  const legB = new THREE.Mesh(legGeo, suit);
  legB.position.set(0, 0.48, -0.3);
  legB.rotation.x = -0.4; // back foot aft, knee bent
  g.add(legB);

  // Boots on the board.
  const bootGeo = new THREE.BoxGeometry(0.16, 0.09, 0.34);
  const bootF = new THREE.Mesh(bootGeo, dark);
  bootF.position.set(0, 0.05, 0.42);
  g.add(bootF);
  const bootB = new THREE.Mesh(bootGeo, dark);
  bootB.position.set(0, 0.05, -0.46);
  bootB.rotation.y = 0.5; // back foot angled across the board
  g.add(bootB);

  // Torso — a capsule leaning into the sail (the anchor adds the lean).
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.55, 6, 12), suit);
  torso.position.set(0, 1.28, 0);
  g.add(torso);

  // Arms reaching forward-up toward the mast/boom.
  const armGeo = new THREE.CylinderGeometry(0.06, 0.05, 0.85, 8);
  const armF = new THREE.Mesh(armGeo, suit);
  armF.position.set(0.14, 1.62, 0.32);
  armF.rotation.x = 1.0;
  armF.rotation.z = -0.25;
  g.add(armF);
  const armB = new THREE.Mesh(armGeo, suit);
  armB.position.set(-0.14, 1.58, 0.28);
  armB.rotation.x = 0.9;
  armB.rotation.z = 0.25;
  g.add(armB);

  // Helmeted head.
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 20, 16), helmetMat);
  head.position.set(0, 1.82, 0.02);
  g.add(head);
  const visor = new THREE.Mesh(
    new THREE.SphereGeometry(0.13, 16, 12, -0.6, 1.2, 1.1, 0.9),
    std('#0a0f14', { roughness: 0.15, metalness: 0.8 }),
  );
  visor.position.set(0, 1.82, 0.06);
  g.add(visor);

  return g;
}

/**
 * Build the glider group for a variant.
 * variant: a variant id (or record) from lib/hub-glider-variants.js.
 * gl: the hub renderer's WebGLRenderer (useThree's gl) — feeds the
 *   sail's env-map. Omit it and the sail builds without an env-map
 *   (dimmer, never a crash).
 * Returns a THREE.Group. userData: { variantId, sailMat, boardMat,
 * riderAnchor, procRider }.
 */
export function buildHubGlider(variant, gl) {
  const v = typeof variant === 'string' ? getGliderVariant(variant) : variant || getGliderVariant('dart');
  const g = new THREE.Group();
  g.name = `hub-glider:${v.id}`;

  const envMap = getHubGliderEnvMap(gl || null);

  // Board — an elongated ellipsoid, 5.2 long, 1.4 wide.
  const boardMat = std(v.board, { roughness: 0.35, metalness: 0.6, envMapIntensity: 0.8 });
  if (envMap) boardMat.envMap = envMap;
  const board = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), boardMat);
  board.scale.set(0.7, 0.12, 2.6);
  board.position.y = 0;
  g.add(board);
  // Nose tip.
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.7, 12), boardMat);
  nose.rotation.x = Math.PI / 2;
  nose.position.set(0, 0, 2.75);
  g.add(nose);
  // Tail fin under the rear.
  const finMat = std(v.trim, { roughness: 0.4, metalness: 0.5 });
  const fin = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.6, 4), finMat);
  fin.scale.set(1, 1, 0.25);
  fin.rotation.x = Math.PI;
  fin.position.set(0, -0.3, -2.2);
  g.add(fin);

  // Mast — tilted slightly back, ahead of the rider.
  const rigMat = std(v.rig, { roughness: 0.35, metalness: 0.7 });
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 6.0, 8), rigMat);
  mast.position.set(0, 3.0, 0.9);
  mast.rotation.x = -0.1; // top rakes back toward the tail
  g.add(mast);
  // Boom — the sail's foot, running aft from the mast.
  const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.1, 8), rigMat);
  boom.rotation.x = Math.PI / 2;
  boom.position.set(0, 1.7, -0.15);
  g.add(boom);

  // THE SAIL — the brightest, most light-catching part of the craft.
  const sailMat = new THREE.MeshStandardMaterial({
    color: v.sail,
    metalness: SAIL_METALNESS,
    roughness: SAIL_ROUGHNESS,
    envMapIntensity: SAIL_ENV_MAP_INTENSITY,
    side: THREE.DoubleSide,
  });
  if (envMap) sailMat.envMap = envMap;
  const sail = new THREE.Mesh(buildSailGeometry(), sailMat);
  sail.rotation.y = Math.PI / 2; // plane runs fore-aft, belly sideways
  sail.position.set(0, 3.1, 0.9);
  g.add(sail);
  // Accent edge along the mast-side of the sail.
  const accentMat = std(v.sailAccent, { roughness: 0.25, metalness: 0.6, emissive: v.sailAccent, emissiveIntensity: 0.25 });
  const accent = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 5.2, 8), accentMat);
  accent.position.set(0, 3.1, 0.9);
  accent.rotation.x = -0.1;
  g.add(accent);

  // Rigging stays: mast top to nose and to tail.
  g.add(strut([0, 5.9, 0.35], [0, 0.1, 2.5], 0.02, rigMat));
  g.add(strut([0, 5.9, 0.35], [0, 0.1, -2.4], 0.02, rigMat));

  // Rider anchor — the selected character's GLB (or the procedural
  // figure) stands here, leaning forward into the sail. The anchor
  // is parented to the board, so the rider banks with it.
  const riderAnchor = new THREE.Group();
  riderAnchor.name = 'rider-anchor';
  riderAnchor.position.set(0, 0.12, -0.5);
  riderAnchor.rotation.x = 0.18; // lean forward, into the sail
  const procRider = buildProcRider();
  riderAnchor.add(procRider);
  g.add(riderAnchor);

  g.userData = {
    variantId: v.id,
    sailMat,
    boardMat,
    riderAnchor,
    procRider,
  };
  return g;
}

/**
 * Dispose a built glider group (geometries + materials). The shared
 * sail env-map is a module singleton and is NOT disposed here. A
 * character GLB attached to the rider anchor (flagged
 * hubGliderExternal by the scene) is NOT disposed here either —
 * its attach handle's dispose() owns it.
 */
export function disposeHubGlider(group) {
  if (!group) return;
  const stack = [group];
  while (stack.length) {
    const o = stack.pop();
    if (o.userData && o.userData.hubGliderExternal) continue;
    if (o.isMesh) {
      if (o.geometry) o.geometry.dispose();
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        if (m && typeof m.dispose === 'function') m.dispose();
      }
    }
    if (o.children) {
      for (const c of o.children) stack.push(c);
    }
  }
}
