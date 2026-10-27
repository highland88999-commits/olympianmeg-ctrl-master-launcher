// lib/earth/jet-flame.js — the blue jet-engine exhaust feel.
//
// The Tatooine speeder's blue flame, mirrored for Earth vehicles
// (app/star-wars/zone.js): two additive cones out the back —
// outer blue 0x2a7bff, inner pale 0xbfe6ff — visible only while
// actually driving, length growing with speed, width flickering.
// Cheap on phones: two static cone meshes, no particles, no
// textures, scale animated per frame.
//
// Earth orientation differs from Star Wars: Earth vehicles align
// +Z along heading (EarthSupercar's basis), so the exhaust sits
// at -Z (the rear) and the cones point backward (-Z). Star Wars
// vehicles drive toward -Z, so their cones sit at +Z — same
// recipe, mirrored axis.
//
// buildJetFlame(vehicleLengthM) returns { group, outer, inner,
// phase } in display units (UPM-scaled); animateJetFlame(flame,
// { driving, speedRatio, time }) applies the SW visibility /
// flicker / length law. A non-finite frame time never NaNs the
// scale (the SW belt-and-braces fallback, kept).

import * as THREE from 'three';
import { DISPLAY_UNITS_PER_METRE } from './placements.js';

const UPM = DISPLAY_UNITS_PER_METRE;

export function buildJetFlame(vehicleLengthM) {
  const len = (Number.isFinite(vehicleLengthM) && vehicleLengthM > 0
    ? vehicleLengthM : 4.6) * UPM;
  const group = new THREE.Group();
  group.name = 'earth-jet-flame';
  group.visible = false;

  const outerGeo = new THREE.ConeGeometry(0.38 * UPM, 1.7 * UPM, 10);
  outerGeo.translate(0, 0.85 * UPM, 0);
  const outer = new THREE.Mesh(outerGeo, new THREE.MeshBasicMaterial({
    color: 0x2a7bff, transparent: true, opacity: 0.75,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  }));
  // Cone points +Y by default; lay it along -Z (rear) and park it
  // just behind the vehicle's rear bumper.
  outer.rotation.x = -Math.PI / 2;
  outer.position.set(0, 0.5 * UPM, -(len / 2 + 0.1 * UPM));

  const innerGeo = new THREE.ConeGeometry(0.2 * UPM, 1.1 * UPM, 10);
  innerGeo.translate(0, 0.55 * UPM, 0);
  const inner = new THREE.Mesh(innerGeo, new THREE.MeshBasicMaterial({
    color: 0xbfe6ff, transparent: true, opacity: 0.9,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  }));
  inner.rotation.x = -Math.PI / 2;
  inner.position.set(0, 0.5 * UPM, -(len / 2 + 0.2 * UPM));

  group.add(outer);
  group.add(inner);
  return { group, outer, inner, phase: Math.random() * Math.PI * 2 };
}

export function animateJetFlame(flame, { driving, speedRatio, time }) {
  if (!flame || !flame.group) return;
  flame.group.visible = !!driving;
  if (!driving) return;
  const tt = Number.isFinite(time) ? time : 0;
  const ratio = Math.max(0, Math.min(1, Number.isFinite(speedRatio) ? speedRatio : 0));
  const flick = 0.85 + 0.25 * Math.sin(tt * 29 + flame.phase)
    + 0.12 * Math.sin(tt * 47 + flame.phase * 1.3);
  const w = Math.max(0.4, flick);
  flame.outer.scale.set(w, (0.7 + 0.6 * ratio) * flick, w);
  flame.inner.scale.set(w, (0.6 + 0.5 * ratio) * flick, w);
}
