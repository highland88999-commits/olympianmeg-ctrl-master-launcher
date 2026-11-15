// lib/jupiter2/meshes.js — procedural builders for Jupiter 2.
//
// Everything is primitives + emissive materials: no Tripo, no GLB,
// no download. Each builder returns a THREE.Group the scene poses
// and animates; userData carries the animatable parts (limbs,
// wings, glow) so the scene's driver can move them per frame.

import * as THREE from 'three';
import { LEVER_GREEN, LEVER_BEACON_HEIGHT } from './lever.js';

function std(color, opts = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0.15, ...opts });
}

/**
 * Lightning monster: a jagged storm-creature — a hunched dark
 * body, a crackling emissive core in the chest, horn spikes, and
 * glowing eyes. userData.glow is the core mesh (the scene pulses
 * it with the lightning); userData.eyes is the eye material.
 */
export function buildLightningMonster(scale = 1) {
  const g = new THREE.Group();
  const bodyMat = std('#1d1626', { roughness: 0.55, metalness: 0.35 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(1.05, 14, 12), bodyMat);
  body.scale.set(1, 1.25, 0.9);
  body.position.y = 1.35;
  g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.55, 12, 10), bodyMat);
  head.position.set(0, 2.75, 0.25);
  g.add(head);
  // Horn spikes.
  for (const s of [-1, 1]) {
    const horn = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.9, 6), std('#3a2a55'));
    horn.position.set(s * 0.4, 3.2, 0.2);
    horn.rotation.z = -s * 0.5;
    g.add(horn);
  }
  // Crackling emissive core — the storm charge it feeds on.
  const coreMat = new THREE.MeshBasicMaterial({ color: '#bfe9ff' });
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 10), coreMat);
  core.position.set(0, 1.5, 0.85);
  g.add(core);
  // Glowing eyes.
  const eyeMat = new THREE.MeshBasicMaterial({ color: '#8fd8ff' });
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 8), eyeMat);
    eye.position.set(s * 0.2, 2.85, 0.72);
    g.add(eye);
  }
  // Jagged back spikes (lightning caught mid-shape).
  for (let i = 0; i < 4; i++) {
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.7, 5), std('#2c2140'));
    spike.position.set(0, 2.1 - i * 0.32, -0.85 - i * 0.05);
    spike.rotation.x = -0.7;
    g.add(spike);
  }
  // Stumpy legs.
  for (const s of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 0.7, 8), bodyMat);
    leg.position.set(s * 0.45, 0.35, 0);
    g.add(leg);
  }
  g.scale.setScalar(scale);
  g.userData = { kind: 'lightning-monster', glow: core, glowMat: coreMat, eyeMat };
  return g;
}

/**
 * Demobat: a leathery air creature — a small dark body, two big
 * membrane wings on pivots (the scene flaps them), a horned head
 * and red glowing eyes. userData.wings holds the two wing pivots.
 */
export function buildDemobat(scale = 1) {
  const g = new THREE.Group();
  const skin = std('#241a20', { roughness: 0.6, metalness: 0.2 });
  const membrane = new THREE.MeshStandardMaterial({
    color: '#4a2438', roughness: 0.5, metalness: 0.1, side: THREE.DoubleSide,
  });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.42, 10, 8), skin);
  body.scale.set(1, 0.8, 1.5);
  g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 8), skin);
  head.position.set(0, 0.18, 0.6);
  g.add(head);
  for (const s of [-1, 1]) {
    const horn = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.35, 5), std('#5a3040'));
    horn.position.set(s * 0.16, 0.42, 0.55);
    horn.rotation.z = -s * 0.4;
    g.add(horn);
    const eye = new THREE.Mesh(
      new THREE.SphereGeometry(0.05, 8, 8),
      new THREE.MeshBasicMaterial({ color: '#ff4444' }),
    );
    eye.position.set(s * 0.1, 0.22, 0.82);
    g.add(eye);
  }
  const wings = [];
  for (const s of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(s * 0.3, 0.1, 0);
    const wing = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 0.95, 1, 1), membrane);
    wing.position.set(s * 0.95, 0.1, -0.1);
    wing.rotation.x = -0.25;
    pivot.add(wing);
    // Wing finger spar.
    const spar = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.9, 5), skin);
    spar.rotation.z = Math.PI / 2;
    spar.position.set(s * 0.95, 0.1, -0.1);
    pivot.add(spar);
    g.add(pivot);
    wings.push(pivot);
  }
  g.scale.setScalar(scale);
  g.userData = { kind: 'demobat', wings };
  return g;
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
