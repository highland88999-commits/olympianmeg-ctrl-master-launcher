// lib/jupiter2/meshes.js — builders for Jupiter 2.
//
// The oblivion lever is still primitives + emissive materials.
// The speeder is NOT (Merlin, Nov 16 ~01:11): it is the real Star
// Wars landspeeder GLB (public/models/star-wars/landspeeder.glb,
// already rideable on Tatooine) — the procedural wedge it replaces
// was deleted, not kept as a fallback. A missing GLB leaves an
// empty holder, never a placeholder (the creatures' law, Nov 15).
// Each builder returns a THREE.Group the scene poses and animates;
// userData carries the animatable parts so the scene's driver can
// move them per frame.
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

/* ------------------------------------------------------------------
 * THE SPEEDER — the real Star Wars landspeeder GLB (Merlin,
 * Nov 16 ~01:11: "use the Star Wars speeder here.. swap out for
 * the speeder placeholder we have here please"). The loader is
 * the house pattern from app/star-wars/landmarks.js
 * (attachGlbModel): dynamic GLTFLoader + MeshoptDecoder import —
 * the file is meshopt-compressed + WebP, so the decoder is
 * required — async, best-effort, never throws; a missing GLB
 * leaves the slot empty, never a placeholder.
 *
 * FIT — measured from the decoded GLB with the repo's own three
 * (node + GLTFLoader + MeshoptDecoder, /tmp/measure-speeder.mjs):
 * native bounds (node scale already applied) x 0.6674, y 0.2352,
 * z 0.9772 m, base at y = 0, centred on x/z; z-slice widths show
 * the nose tapering at +Z (band +0.37..+0.49 narrows to 0.125
 * half-width while the rest of the hull holds ~0.33) — the same
 * reading landmarks.js records as yawFix: Math.PI.
 *
 * The fit keeps the placeholder's footprint and ride, not the
 * Star Wars 5.6 m fit: length 4.4 m (the old wedge: nose tip
 * -2.6 to fin tail +1.8), base at y 0.27 (the old runners' bottom
 * — the hover clearance), nose turned half a turn so it faces the
 * group's -Z forward, which is the heading the scene's sphere
 * basis drives. Fitted: 4.4 long x 3.01 wide x 1.06 tall, top at
 * 1.33 above the group origin — below the 2.2 m mounted eye
 * (lib/jupiter2/speeder.js SPEEDER_MOUNTED_EYE_M), so the camera
 * cannot clip the model. The width is the model's own: the real
 * landspeeder is a wide flat craft (Star Wars fits it 5.6 long
 * x 3.82 wide); only the length was matched to the old wedge.
 *
 * The glow under the old wedge is gone with it; the exhaust is
 * the landspeeder's BLUE ENGINE FLAME from app/star-wars/zone.js
 * (two additive cones out the rear, +Z local), scaled from the
 * Star Wars numbers by the 4.4/5.6 fit ratio and driven the same
 * way: dark parked, lit only while driving, length growing with
 * speed, width flickering. userData: { kind, glbUrl, glowMat
 * (the outer flame material — the scene brightens it at speed,
 * as it did the old underglow), flame: { group, outer, inner,
 * phase } }.
 * ------------------------------------------------------------------ */
export const LANDSPEEDER_GLB_URL = '/models/star-wars/landspeeder.glb';
/** Decoded native size (m) of the landspeeder GLB, measured — see above. */
export const LANDSPEEDER_NATIVE_SIZE_M = { x: 0.6674, y: 0.2352, z: 0.9772 };
/** Fitted length (m): the placeholder wedge's footprint. */
export const LANDSPEEDER_FIT_LENGTH_M = 4.4;
/** Hover clearance (m): the placeholder runners' bottom. */
export const LANDSPEEDER_BASE_Y_M = 0.27;
/** The GLB nose tapers at +Z; Jupiter 2 forward is -Z. */
export const LANDSPEEDER_YAW_FIX = Math.PI;
/** Star Wars fits this same GLB to 5.6 m; the flame scales by this ratio. */
export const LANDSPEEDER_SW_FIT_M = 5.6;

/** Uniform scale that fits the GLB's long axis to LANDSPEEDER_FIT_LENGTH_M. */
export function landspeederFitScale(native = LANDSPEEDER_NATIVE_SIZE_M) {
  return LANDSPEEDER_FIT_LENGTH_M / Math.max(native.x, native.z, 1e-6);
}

/** Fitted dimensions (m) for a native size: { scale, length, width, height, baseY, topY }. */
export function landspeederFittedSize(native = LANDSPEEDER_NATIVE_SIZE_M) {
  const scale = landspeederFitScale(native);
  return {
    scale,
    length: native.z * scale,
    width: native.x * scale,
    height: native.y * scale,
    baseY: LANDSPEEDER_BASE_Y_M,
    topY: LANDSPEEDER_BASE_Y_M + native.y * scale,
  };
}

/**
 * The blue engine flame (app/star-wars/zone.js): two additive
 * cones out the rear (+Z local — the craft drives toward -Z),
 * each cone's geometry translated so its base sits at the mesh
 * origin and its tip points +Z after rotation.x = PI/2. The
 * sizes/positions are the Star Wars numbers times the fit ratio
 * (LANDSPEEDER_FIT_LENGTH_M / LANDSPEEDER_SW_FIT_M). Starts dark:
 * the scene shows it only while driving.
 */
export function buildLandspeederFlame() {
  const k = LANDSPEEDER_FIT_LENGTH_M / LANDSPEEDER_SW_FIT_M;
  const group = new THREE.Group();
  group.name = 'exhaust-flame';
  group.userData.keepVisible = true;
  const outerGeo = new THREE.ConeGeometry(0.38 * k, 1.7 * k, 10);
  outerGeo.translate(0, 0.85 * k, 0);
  const outerMat = new THREE.MeshBasicMaterial({
    color: 0x2a7bff, transparent: true, opacity: 0.75,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  });
  const outer = new THREE.Mesh(outerGeo, outerMat);
  outer.rotation.x = Math.PI / 2;
  outer.position.set(0, 0.95 * k, 2.4 * k);
  const innerGeo = new THREE.ConeGeometry(0.2 * k, 1.1 * k, 10);
  innerGeo.translate(0, 0.55 * k, 0);
  const innerMat = new THREE.MeshBasicMaterial({
    color: 0xbfe6ff, transparent: true, opacity: 0.9,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  });
  const inner = new THREE.Mesh(innerGeo, innerMat);
  inner.rotation.x = Math.PI / 2;
  inner.position.set(0, 0.95 * k, 2.5 * k);
  group.add(outer);
  group.add(inner);
  group.visible = false;
  return { group, outer, inner, phase: 0 };
}

export function buildSpeeder() {
  const g = new THREE.Group();
  // The GLB slot: turned half a turn so the model's +Z nose faces
  // the group's -Z forward (the heading the scene drives).
  const slot = new THREE.Group();
  slot.name = 'glb:landspeeder';
  slot.rotation.y = LANDSPEEDER_YAW_FIX;
  g.add(slot);
  const flame = buildLandspeederFlame();
  g.add(flame.group);
  g.userData = { kind: 'speeder', glbUrl: LANDSPEEDER_GLB_URL, glowMat: flame.outer.material, flame };
  if (typeof window === 'undefined') return g;
  (async () => {
    try {
      const [{ GLTFLoader }, { MeshoptDecoder }] = await Promise.all([
        import('three/examples/jsm/loaders/GLTFLoader.js'),
        import('three/examples/jsm/libs/meshopt_decoder.module.js'),
      ]);
      const loader = new GLTFLoader();
      loader.setMeshoptDecoder(MeshoptDecoder);
      const gltf = await loader.loadAsync(LANDSPEEDER_GLB_URL);
      const model = gltf.scene;
      const box = new THREE.Box3().setFromObject(model);
      const size = new THREE.Vector3();
      box.getSize(size);
      const center = new THREE.Vector3();
      box.getCenter(center);
      const fit = landspeederFitScale({ x: size.x, y: size.y, z: size.z });
      model.scale.setScalar(fit);
      model.position.set(-center.x * fit, -box.min.y * fit + LANDSPEEDER_BASE_Y_M, -center.z * fit);
      model.traverse((o) => {
        if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; }
      });
      slot.add(model);
      g.userData.glbLoaded = true;
    } catch (e) {
      // The slot stays empty — by design, never a placeholder.
    }
  })();
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
    // fog: false — the beacon's job is to read through the storm
    // from the deck (~120 m, past fogFar 64): fogged, it renders
    // as fog colour and the green never reaches the walker. The
    // sun glow, the sky wash and the engine flames already wear it.
    fog: false,
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
