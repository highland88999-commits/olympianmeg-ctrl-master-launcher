// lib/jupiter2/meshes.js — procedural builders for Jupiter 2.
//
// The speeder and the oblivion lever are still primitives +
// emissive materials: no Tripo, no GLB, no download. Each builder
// returns a THREE.Group the scene poses and animates; userData
// carries the animatable parts so the scene's driver can move
// them per frame.
//
// The creatures are NOT here anymore (Merlin, Nov 15 ~14:44): the
// lightning monsters and demobats are real GLBs now — the
// Monsterverse lightning seats (lib/jupiter2/models.js, loaded by
// app/hollow-earth/model-loader.js) and the Hawkins demobats
// (lib/hawkins/loader.js). The old procedural builders
// (buildLightningMonster, buildDemobat) were deleted, not kept as
// fallbacks — a missing GLB leaves an empty holder, never a
// placeholder. See lib/jupiter2/models.js for the roster.

import * as THREE from 'three';
import { LEVER_GREEN, LEVER_BEACON_HEIGHT } from './lever.js';

function std(color, opts = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0.15, ...opts });
}

/**
 * The speeder: a low sleek hull with a nose cone, a cockpit
 * canopy, twin rear fins and a cyan underglow. userData.glowMat
 * is the underglow material (the scene brightens it at speed).
 */
export function buildSpeeder() {
  const g = new THREE.Group();
  const hull = std('#c8ccd4', { roughness: 0.3, metalness: 0.85 });
  const dark = std('#23262e', { roughness: 0.5, metalness: 0.6 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.32, 3.2), hull);
  body.position.y = 0.55;
  g.add(body);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.1, 4), hull);
  nose.rotation.x = Math.PI / 2;
  nose.rotation.y = Math.PI / 4;
  nose.position.set(0, 0.55, -2.05);
  nose.scale.set(1, 1, 0.6);
  g.add(nose);
  const canopy = new THREE.Mesh(
    new THREE.SphereGeometry(0.42, 12, 10),
    new THREE.MeshStandardMaterial({ color: '#7fd8ff', roughness: 0.1, metalness: 0.4, emissive: '#1a5a7a', emissiveIntensity: 0.6 }),
  );
  canopy.scale.set(1, 0.55, 1.4);
  canopy.position.set(0, 0.78, -0.4);
  g.add(canopy);
  for (const s of [-1, 1]) {
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.7, 0.9), dark);
    fin.position.set(s * 0.55, 0.8, 1.35);
    fin.rotation.z = -s * 0.25;
    g.add(fin);
    const runner = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.1, 2.6), dark);
    runner.position.set(s * 0.45, 0.32, 0);
    g.add(runner);
  }
  const glowMat = new THREE.MeshBasicMaterial({ color: '#39c8ff', transparent: true, opacity: 0.85 });
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 2.6), glowMat);
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = 0.28;
  g.add(glow);
  g.userData = { kind: 'speeder', glowMat };
  return g;
}

/**
 * The oblivion lever: a stone pedestal, the lever arm itself, a
 * glowing green orb, and the tall green beacon column that reads
 * through the storm from spawn (emissive + light + height — the
 * spec's "seen through the storm"). userData: { orbMat, beaconMat,
 * arm } for the scene's pulse + pull animation.
 */
export function buildOblivionLever() {
  const g = new THREE.Group();
  const stone = std('#3a3a42', { roughness: 0.9, metalness: 0.1 });
  const base = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.4, 0.5, 12), stone);
  base.position.y = 0.25;
  g.add(base);
  const column = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.7, 1.6, 10), stone);
  column.position.y = 1.3;
  g.add(column);
  // The lever arm — starts upright, the scene tilts it on pull.
  const arm = new THREE.Group();
  arm.position.set(0, 2.1, 0);
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.5, 8), std('#222226', { metalness: 0.8, roughness: 0.35 }));
  rod.position.y = 0.75;
  arm.add(rod);
  const orbMat = new THREE.MeshBasicMaterial({ color: LEVER_GREEN });
  const orb = new THREE.Mesh(new THREE.SphereGeometry(0.28, 14, 12), orbMat);
  orb.position.y = 1.6;
  arm.add(orb);
  g.add(arm);
  // Green beacon: a tall translucent column + a point light, so
  // the lever reads at range through rain and fog.
  const beaconMat = new THREE.MeshBasicMaterial({
    color: LEVER_GREEN, transparent: true, opacity: 0.16,
    depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
  });
  const beacon = new THREE.Mesh(
    new THREE.CylinderGeometry(0.9, 1.4, LEVER_BEACON_HEIGHT, 12, 1, true),
    beaconMat,
  );
  beacon.position.y = LEVER_BEACON_HEIGHT / 2;
  g.add(beacon);
  const light = new THREE.PointLight(LEVER_GREEN, 30, 40, 1.6);
  light.position.y = 3;
  g.add(light);
  g.userData = { kind: 'oblivion-lever', orbMat, beaconMat, arm, light };
  return g;
}

/**
 * The mountain past the drop (Merlin, Nov 16 ~00:02): a rock mass
 * on the sub-level shelf, ~19 m across at the base and ~18 m high,
 * with a dark cave mouth on its south face (the side facing the
 * drop, so the walker coming down sees the mouth ahead). The cone
 * is scenery — the walkable ground is the shelf floor through the
 * passage (lib/jupiter2/planet.js), and the group is posed with
 * +Y along the local surface normal by the scene. userData.mouth
 * is the mouth's local offset (the scene puts the beacon label
 * there); the group origin sits at the mountain's base centre.
 */
export function buildMountain() {
  const g = new THREE.Group();
  const rock = std('#4a3423', { roughness: 0.95, metalness: 0.05 });
  const darkRock = std('#2e2015', { roughness: 1, metalness: 0.05 });
  const cone = new THREE.Mesh(new THREE.ConeGeometry(19, 18, 24), rock);
  cone.position.y = 9;
  g.add(cone);
  // Broken boulders around the base — the mountain reads as rock,
  // not a smooth cone, from the deck.
  const boulderGeo = new THREE.DodecahedronGeometry(1.6, 0);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + 0.35;
    const b = new THREE.Mesh(boulderGeo, i % 2 ? rock : darkRock);
    const rr = 17 + (i % 3) * 2;
    b.position.set(Math.cos(a) * rr, 0.8, Math.sin(a) * rr);
    b.rotation.set(i * 0.7, i * 1.3, i * 0.4);
    b.scale.setScalar(0.7 + (i % 3) * 0.5);
    g.add(b);
  }
  // The cave: a real tunnel through the mountain's south face,
  // on local +Z (the scene points +Z at the drop, so the mouth
  // faces back toward the walker coming down). Two stone walls,
  // a roof slab, a dark back wall behind the lever's place, and a
  // doorway frame at the mouth — the lever stands at the tunnel's
  // far end (local z ≈ +4.4), visible from the mouth through the
  // dark throat. The cone rises behind and around the tunnel; the
  // tunnel is the way in, not a decal on the cone.
  const cave = new THREE.Group();
  const caveStone = std('#241a10', { roughness: 1 });
  const caveDark = new THREE.MeshBasicMaterial({ color: '#000000', side: THREE.DoubleSide });
  // Tunnel walls: z +4 → +18 (mouth at +18), 5 m high, 0.8 thick.
  for (const s of [-1, 1]) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(0.8, 5, 14), caveStone);
    wall.position.set(s * 3.4, 2.5, 11);
    cave.add(wall);
  }
  const roof = new THREE.Mesh(new THREE.BoxGeometry(7.6, 0.8, 14), caveStone);
  roof.position.set(0, 5.4, 11);
  cave.add(roof);
  // Dark back wall behind the lever's place (local z +3.5).
  const back = new THREE.Mesh(new THREE.PlaneGeometry(7.6, 5.8), caveDark);
  back.position.set(0, 2.9, 3.5);
  cave.add(back);
  // Dark throat floor so the tunnel reads as a hole from outside.
  const throat = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 14), caveDark);
  throat.rotation.x = -Math.PI / 2;
  throat.position.set(0, 0.06, 11);
  cave.add(throat);
  // Doorway frame at the mouth (z +18): two jambs + a lintel.
  for (const s of [-1, 1]) {
    const jamb = new THREE.Mesh(new THREE.BoxGeometry(0.9, 5.0, 1.2), caveStone);
    jamb.position.set(s * 3.2, 2.5, 18);
    cave.add(jamb);
  }
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(7.4, 1.0, 1.2), caveStone);
  lintel.position.set(0, 5.2, 18);
  cave.add(lintel);
  g.add(cave);
  g.userData = { kind: 'mountain', mouthLocal: { x: 0, y: 2.5, z: 18 } };
  return g;
}
