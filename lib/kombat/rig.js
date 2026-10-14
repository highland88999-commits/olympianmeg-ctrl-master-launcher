/**
 * KOMBAT ARENA — procedural fighter rig.
 *
 * One flexible rig + per-character parameter sets (see lib/kombat/visuals.js).
 * "Lifelike" here means distinct silhouettes, signature colors, weapons,
 * proportions and effects — NOT 40 bespoke sculpted models.
 *
 * ------------------------------------------------------------------
 * PARAMS SCHEMA (passed to buildFighterRig)
 * ------------------------------------------------------------------
 * {
 *   body: 'humanoid'|'bulky'|'small'|'dino'|'blob'|'giant',
 *   height: number,            // scale multiplier (Yoda ~0.55, Hulk ~1.35, T-Rex ~1.6)
 *   bulk: number,              // width / mass multiplier
 *   colors: { skin, suit, accent, eyes },   // hex numbers or CSS strings
 *   head: { type: 'bare'|'helmet'|'mask'|'hood'|'cap'|'crown', color, detail },
 *       // detail: optional string/array driving extra geometry:
 *       //   'stripes' (torso bands), 'dreadlocks', 'jaw' (dino jaw),
 *       //   'balloon', 'visor', 'crown-spikes', 'spikes', 'visor-red', 'stubble'
 *   attachments: [ { type, side: 'left'|'right'|'back'|'head', color } ],
 *       // types: claw-glove, gloves, machete, knife, chainsaw, lightsaber (blade color
 *       //   comes from `accent` unless color given), katana, buster-sword,
 *       //   masamune, claws, proton-pack, ghost-trap, baseball-bat, mallet,
 *       //   carrot, anvil, shield, hammer, blaster, staff
 *   effects: [ { type: 'glow'|'electricity'|'particles'|'slime'|'fire', color } ],
 *   stance: { armSpread, crouch }   // optional pose tuning
 * }
 *
 * buildFighterRig returns a THREE.Group with:
 *   group.userData.parts   — { head, torso, armL, armR, legL, legR }
 *   group.userData.joints  — { neck, spine, shoulderL/R, elbowL/R, hipL/R, kneeL/R, jaw?, tail? }
 *   group.userData.mounts  — { weaponL, weaponR, back }  (weapon attach points)
 *   group.userData.anchors — { root, head, chest, handL, handR, weaponR } (effect anchors)
 *   group.userData.fx      — [ { type, update(dt, t) } ]  (active effect instances)
 *   group.userData.params  — the normalized params
 *
 * Poly budget: modest box/sphere/cylinder counts per fighter — two fighters +
 * arena must run on mobile Safari. Materials: MeshStandardMaterial only.
 */

import * as THREE from 'three';

const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

function mat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color(color ?? 0x888888),
    roughness: opts.roughness ?? 0.75,
    metalness: opts.metalness ?? 0.05,
    emissive: new THREE.Color(opts.emissive ?? 0x000000),
    emissiveIntensity: opts.emissiveIntensity ?? 1,
    transparent: opts.transparent ?? false,
    opacity: opts.opacity ?? 1,
  });
}

function mesh(geo, material) {
  const m = new THREE.Mesh(geo, material);
  m.castShadow = false;
  m.receiveShadow = false;
  return m;
}

const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const sph = (r, w = 12, h = 10) => new THREE.SphereGeometry(r, w, h);
const cyl = (rt, rb, h, s = 10) => new THREE.CylinderGeometry(rt, rb, h, s);

// ------------------------------------------------------------------
// Heads
// ------------------------------------------------------------------

function buildHead(params, M) {
  const g = new THREE.Group();
  const cfg = params.head || { type: 'bare' };
  const skinM = mat(params.colors.skin);
  const headM = mat(cfg.color ?? params.colors.skin);
  const eyeM = mat(params.colors.eyes ?? 0xffee66, { emissive: params.colors.eyes ?? 0xffee66, emissiveIntensity: 1.6 });

  const scale = params.body === 'dino' ? 1.5 : 1;
  const skull = mesh(sph(0.16 * scale), skinM);
  skull.name = 'skull';
  g.add(skull);

  // eyes
  for (const sx of [-1, 1]) {
    const eye = mesh(sph(0.028 * scale, 8, 6), eyeM);
    eye.position.set(0.06 * sx * scale, 0.03 * scale, 0.13 * scale);
    g.add(eye);
  }

  const detail = Array.isArray(cfg.detail) ? cfg.detail : [cfg.detail].filter(Boolean);

  switch (cfg.type) {
    case 'helmet': {
      const helm = mesh(sph(0.185 * scale, 12, 10), headM);
      helm.position.y = 0.02;
      g.add(helm);
      // face opening: dark front plate
      const face = mesh(sph(0.15 * scale, 12, 10), mat(0x0a0a0c, { roughness: 0.4 }));
      face.position.set(0, -0.01, 0.06 * scale);
      g.add(face);
      if (detail.includes('vader')) {
        // triangular breathing grille + dome ridge
        const ridge = mesh(box(0.05, 0.16, 0.05), headM);
        ridge.position.set(0, 0.1, 0.15 * scale);
        ridge.rotation.x = 0.3;
        g.add(ridge);
      }
      break;
    }
    case 'mask': {
      const m = mesh(box(0.22 * scale, 0.24 * scale, 0.06), headM);
      m.position.set(0, 0.01, 0.13 * scale);
      g.add(m);
      // mask eye holes (dark inset)
      for (const sx of [-1, 1]) {
        const hole = mesh(box(0.045, 0.035, 0.02), mat(0x111111));
        hole.position.set(0.055 * sx, 0.04, 0.165 * scale);
        g.add(hole);
      }
      if (detail.includes('jason')) {
        // red chevron stripes on hockey mask
        for (const sx of [-1, 1]) {
          const stripe = mesh(box(0.02, 0.12, 0.015), mat(0xb02020));
          stripe.position.set(0.075 * sx, -0.02, 0.165 * scale);
          stripe.rotation.z = sx * 0.4;
          g.add(stripe);
        }
      }
      break;
    }
    case 'hood': {
      const hood = mesh(new THREE.ConeGeometry(0.21 * scale, 0.3 * scale, 12), headM);
      hood.position.y = 0.08;
      g.add(hood);
      break;
    }
    case 'cap': {
      const cap = mesh(sph(0.17 * scale, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2.2), headM);
      cap.position.y = 0.05;
      g.add(cap);
      const brim = mesh(box(0.2, 0.02, 0.12), headM);
      brim.position.set(0, 0.09, 0.2 * scale);
      g.add(brim);
      if (detail.includes('fedora')) {
        const brim2 = mesh(cyl(0.2 * scale, 0.2 * scale, 0.02, 14), headM);
        brim2.position.y = 0.1;
        g.add(brim2);
        const top = mesh(cyl(0.11 * scale, 0.12 * scale, 0.12, 12), headM);
        top.position.y = 0.16;
        g.add(top);
        g.remove(brim);
      }
      break;
    }
    case 'crown': {
      const band = mesh(cyl(0.17 * scale, 0.18 * scale, 0.07, 12), headM);
      band.position.y = 0.12;
      g.add(band);
      if (detail.includes('spikes')) {
        for (let i = 0; i < 7; i++) {
          const a = (i / 7) * Math.PI * 2;
          const spike = mesh(new THREE.ConeGeometry(0.025, 0.09, 6), mat(params.colors.accent ?? 0xffcc33, { emissive: params.colors.accent ?? 0xffcc33, emissiveIntensity: 0.4 }));
          spike.position.set(Math.cos(a) * 0.16 * scale, 0.2, Math.sin(a) * 0.16 * scale);
          g.add(spike);
        }
      }
      break;
    }
    default:
      break; // bare
  }

  if (detail.includes('dreadlocks')) {
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const d = mesh(cyl(0.022, 0.016, 0.22, 6), mat(0x1a1410));
      d.position.set(Math.cos(a) * 0.15 * scale, -0.1, Math.sin(a) * 0.15 * scale);
      d.rotation.z = Math.cos(a) * 0.35;
      d.rotation.x = -Math.sin(a) * 0.35;
      g.add(d);
    }
  }
  if (detail.includes('visor')) {
    const visor = mesh(box(0.2 * scale, 0.05, 0.03), mat(detail.includes('visor-red') ? 0xff2222 : 0x22ccff, { emissive: detail.includes('visor-red') ? 0xff2222 : 0x22ccff, emissiveIntensity: 2 }));
    visor.position.set(0, 0.03, 0.155 * scale);
    g.add(visor);
  }
  if (detail.includes('jaw')) {
    // xenomorph-style elongated cranium + jaw
    const cranium = mesh(sph(0.13 * scale), skinM);
    cranium.scale.set(1, 1.5, 1.4);
    cranium.position.set(0, 0.08, -0.08 * scale);
    g.add(cranium);
  }
  if (detail.includes('rabbit-ears')) {
    for (const sx of [-1, 1]) {
      const ear = mesh(cyl(0.03, 0.045, 0.34, 8), skinM);
      ear.position.set(0.08 * sx, 0.32, 0);
      ear.rotation.z = sx * -0.12;
      g.add(ear);
      const inner = mesh(cyl(0.014, 0.02, 0.26, 6), mat(0xf0b8c8));
      inner.position.set(0.08 * sx, 0.3, 0.035);
      inner.rotation.z = sx * -0.12;
      g.add(inner);
    }
  }
  if (detail.includes('clown')) {
    // pennywise: white face paint handled via skin color; red nose + hair puffs
    const nose = mesh(sph(0.035, 8, 6), mat(0xd02020, { emissive: 0xd02020, emissiveIntensity: 0.8 }));
    nose.position.set(0, -0.02, 0.16 * scale);
    g.add(nose);
    for (const sx of [-1, 1]) {
      const puff = mesh(sph(0.07, 8, 6), mat(0xd04010));
      puff.position.set(0.19 * sx, 0.08, 0);
      g.add(puff);
    }
  }

  return g;
}

// ------------------------------------------------------------------
// Attachments (weapons & gear)
// ------------------------------------------------------------------

function buildAttachment(def, M) {
  const g = new THREE.Group();
  const c = def.color ?? 0x999999;
  const metal = mat(c, { metalness: 0.7, roughness: 0.35 });
  const dark = mat(0x2a2a2e, { roughness: 0.6 });

  switch (def.type) {
    case 'claw-glove': {
      g.add(mesh(box(0.09, 0.07, 0.12), mat(0x6b4a2f)));
      for (let i = 0; i < 4; i++) {
        const blade = mesh(cyl(0.008, 0.001, 0.3, 6), metal);
        blade.position.set(-0.045 + i * 0.03, 0.02, 0.2);
        blade.rotation.x = Math.PI / 2 - 0.15;
        g.add(blade);
      }
      break;
    }
    case 'gloves': {
      g.add(mesh(box(0.1, 0.08, 0.13), mat(c, { roughness: 0.6 })));
      break;
    }
    case 'machete': {
      const blade = mesh(box(0.05, 0.012, 0.55), metal);
      blade.position.z = 0.35; g.add(blade);
      const grip = mesh(box(0.04, 0.04, 0.14), dark);
      grip.position.z = -0.02; g.add(grip);
      break;
    }
    case 'knife': {
      const blade = mesh(box(0.03, 0.01, 0.2), metal);
      blade.position.z = 0.14; g.add(blade);
      g.add(mesh(box(0.035, 0.035, 0.1), dark));
      break;
    }
    case 'katana': {
      const blade = mesh(box(0.025, 0.008, 0.75), metal);
      blade.position.z = 0.45; g.add(blade);
      const guard = mesh(cyl(0.05, 0.05, 0.015, 12), mat(0x8a6d2f, { metalness: 0.8, roughness: 0.3 }));
      guard.rotation.x = Math.PI / 2; guard.position.z = 0.06; g.add(guard);
      const grip = mesh(cyl(0.02, 0.02, 0.2, 8), dark);
      grip.rotation.x = Math.PI / 2; grip.position.z = -0.05; g.add(grip);
      break;
    }
    case 'buster-sword': {
      const blade = mesh(box(0.16, 0.02, 1.05), metal);
      blade.position.z = 0.6; g.add(blade);
      const tip = mesh(new THREE.ConeGeometry(0.08, 0.16, 4), metal);
      tip.rotation.x = Math.PI / 2; tip.rotation.y = Math.PI / 4;
      tip.position.z = 1.2; g.add(tip);
      const grip = mesh(cyl(0.025, 0.025, 0.24, 8), dark);
      grip.rotation.x = Math.PI / 2; grip.position.z = -0.04; g.add(grip);
      break;
    }
    case 'masamune': {
      const blade = mesh(box(0.018, 0.006, 1.35), mat(c, { metalness: 0.9, roughness: 0.2 }));
      blade.position.z = 0.75; g.add(blade);
      const grip = mesh(cyl(0.018, 0.018, 0.22, 8), dark);
      grip.rotation.x = Math.PI / 2; g.add(grip);
      break;
    }
    case 'chainsaw': {
      const body = mesh(box(0.12, 0.14, 0.3), mat(c, { roughness: 0.5 }));
      g.add(body);
      const bar = mesh(box(0.03, 0.02, 0.6), metal);
      bar.position.z = 0.42; g.add(bar);
      for (let i = 0; i < 8; i++) {
        const tooth = mesh(box(0.035, 0.035, 0.03), dark);
        tooth.position.set(0, 0.03, 0.2 + i * 0.06);
        g.add(tooth);
      }
      break;
    }
    case 'lightsaber': {
      const hilt = mesh(cyl(0.02, 0.02, 0.16, 8), metal);
      hilt.rotation.x = Math.PI / 2; g.add(hilt);
      const bladeM = mat(c, { emissive: c, emissiveIntensity: 3 });
      const blade = mesh(cyl(0.014, 0.014, 0.85, 8), bladeM);
      blade.rotation.x = Math.PI / 2; blade.position.z = 0.5;
      blade.name = 'energy-blade';
      g.add(blade);
      g.userData.energyBlade = blade;
      break;
    }
    case 'claws': {
      for (let i = 0; i < 3; i++) {
        const claw = mesh(new THREE.ConeGeometry(0.012, 0.16, 6), metal);
        claw.position.set(-0.03 + i * 0.03, 0.02, 0.12);
        claw.rotation.x = Math.PI / 2;
        g.add(claw);
      }
      break;
    }
    case 'proton-pack': {
      const packBody = mesh(box(0.34, 0.44, 0.2), mat(0x8a8f96, { metalness: 0.4, roughness: 0.5 }));
      packBody.position.y = 0.1; g.add(packBody);
      const wand = mesh(cyl(0.025, 0.025, 0.3, 8), dark);
      wand.rotation.x = Math.PI / 2; wand.position.set(0, -0.2, 0.2); g.add(wand);
      for (let i = 0; i < 3; i++) {
        const light = mesh(sph(0.02, 6, 5), mat([0xff2222, 0x22ff44, 0xeeeeee][i], { emissive: [0xff2222, 0x22ff44, 0xeeeeee][i], emissiveIntensity: 2 }));
        light.position.set(-0.08 + i * 0.08, 0.32, 0.11);
        g.add(light);
      }
      break;
    }
    case 'ghost-trap': {
      const trap = mesh(box(0.22, 0.1, 0.14), mat(0x3a3a3e));
      g.add(trap);
      const stripe = mesh(box(0.225, 0.03, 0.145), mat(0xd8b020, { emissive: 0xd8b020, emissiveIntensity: 0.6 }));
      g.add(stripe);
      break;
    }
    case 'baseball-bat': {
      const bat = mesh(cyl(0.02, 0.035, 0.7, 8), mat(0xa8763e));
      bat.rotation.x = Math.PI / 2; bat.position.z = 0.35; g.add(bat);
      break;
    }
    case 'mallet': {
      const handle = mesh(cyl(0.02, 0.02, 0.4, 8), mat(0x7a5a34));
      handle.rotation.x = Math.PI / 2; handle.position.z = 0.1; g.add(handle);
      const headM = mesh(cyl(0.09, 0.09, 0.22, 10), mat(c, { roughness: 0.6 }));
      headM.rotation.z = Math.PI / 2; headM.position.z = 0.35; g.add(headM);
      break;
    }
    case 'hammer': {
      const handle = mesh(cyl(0.018, 0.022, 0.5, 8), dark);
      handle.rotation.x = Math.PI / 2; handle.position.z = 0.15; g.add(handle);
      const headM = mesh(box(0.2, 0.08, 0.08), metal);
      headM.position.z = 0.42; g.add(headM);
      break;
    }
    case 'anvil': {
      const top = mesh(box(0.3, 0.12, 0.18), metal); g.add(top);
      const horn = mesh(new THREE.ConeGeometry(0.06, 0.22, 8), metal);
      horn.rotation.z = -Math.PI / 2; horn.position.x = 0.25; g.add(horn);
      const base = mesh(box(0.2, 0.16, 0.14), dark); base.position.y = -0.14; g.add(base);
      break;
    }
    case 'carrot': {
      const body = mesh(new THREE.ConeGeometry(0.04, 0.3, 8), mat(0xe8722a));
      body.rotation.x = Math.PI; body.position.z = 0.15; g.add(body);
      const greens = mesh(new THREE.ConeGeometry(0.035, 0.1, 6), mat(0x3da53d));
      greens.position.z = 0.33; g.add(greens);
      break;
    }
    case 'shield': {
      const s = mesh(cyl(0.22, 0.22, 0.03, 16), metal);
      s.rotation.x = Math.PI / 2; g.add(s);
      const boss = mesh(sph(0.06, 8, 6), dark); boss.position.z = 0.04; g.add(boss);
      break;
    }
    case 'blaster': {
      const body = mesh(box(0.07, 0.09, 0.24), dark); g.add(body);
      const barrel = mesh(cyl(0.02, 0.02, 0.16, 8), metal);
      barrel.rotation.x = Math.PI / 2; barrel.position.z = 0.18; g.add(barrel);
      const tip = mesh(sph(0.025, 6, 5), mat(c, { emissive: c, emissiveIntensity: 2 }));
      tip.position.z = 0.26; g.add(tip);
      break;
    }
    case 'staff': {
      const shaft = mesh(cyl(0.018, 0.018, 1.2, 8), mat(c));
      shaft.rotation.x = Math.PI / 2; g.add(shaft);
      const orb = mesh(sph(0.045, 8, 6), mat(c, { emissive: c, emissiveIntensity: 1.5 }));
      orb.position.z = 0.62; g.add(orb);
      break;
    }
    default:
      break;
  }
  return g;
}

// ------------------------------------------------------------------
// Effects
// ------------------------------------------------------------------

function buildEffect(def, anchor) {
  const color = def.color ?? 0x66ccff;
  const holder = new THREE.Group();
  holder.position.copy(anchor);
  const fx = { type: def.type, color, group: holder, update: null };
  const t0 = Math.random() * 10;

  if (def.type === 'glow') {
    const sprite = mesh(sph(0.3, 10, 8), mat(color, {
      emissive: color, emissiveIntensity: 2, transparent: true, opacity: 0.35,
    }));
    holder.add(sprite);
    fx.update = (dt, t) => {
      const s = 1 + Math.sin(t * 3 + t0) * 0.12;
      sprite.scale.setScalar(s);
      sprite.material.opacity = 0.28 + Math.sin(t * 3 + t0) * 0.1;
    };
  } else if (def.type === 'electricity') {
    const segs = 5;
    const lines = [];
    for (let i = 0; i < segs; i++) {
      const pts = [];
      let p = V3(0, -0.5, 0);
      for (let j = 0; j <= 6; j++) {
        pts.push(p.clone());
        p = p.clone().add(V3((Math.random() - 0.5) * 0.25, 0.22, (Math.random() - 0.5) * 0.25));
      }
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 })
      );
      holder.add(line);
      lines.push(line);
    }
    fx.update = (dt, t) => {
      for (const l of lines) {
        l.visible = Math.sin(t * 30 + t0 + l.id) > -0.4;
        l.material.opacity = 0.5 + Math.random() * 0.5;
      }
    };
  } else if (def.type === 'particles' || def.type === 'fire') {
    const N = 40;
    const pos = new Float32Array(N * 3);
    const vel = [];
    for (let i = 0; i < N; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 0.4;
      pos[i * 3 + 1] = Math.random() * 1.2;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 0.4;
      vel.push(V3((Math.random() - 0.5) * 0.3, def.type === 'fire' ? 0.6 + Math.random() * 0.8 : (Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.3));
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const points = new THREE.Points(geo, new THREE.PointsMaterial({
      color, size: def.type === 'fire' ? 0.06 : 0.045, transparent: true, opacity: 0.85,
      depthWrite: false,
    }));
    holder.add(points);
    fx.update = (dt) => {
      const p = geo.attributes.position.array;
      for (let i = 0; i < N; i++) {
        p[i * 3] += vel[i].x * dt;
        p[i * 3 + 1] += vel[i].y * dt;
        p[i * 3 + 2] += vel[i].z * dt;
        if (p[i * 3 + 1] > 1.6 || p[i * 3 + 1] < -0.6) {
          p[i * 3] = (Math.random() - 0.5) * 0.4;
          p[i * 3 + 1] = def.type === 'fire' ? -0.4 : Math.random() * 1.2;
          p[i * 3 + 2] = (Math.random() - 0.5) * 0.4;
        }
      }
      geo.attributes.position.needsUpdate = true;
    };
  } else if (def.type === 'slime') {
    const drops = [];
    for (let i = 0; i < 8; i++) {
      const d = mesh(sph(0.05 + Math.random() * 0.04, 8, 6), mat(color, { transparent: true, opacity: 0.7, roughness: 0.2 }));
      d.position.set((Math.random() - 0.5) * 0.5, Math.random() * 1.2, (Math.random() - 0.5) * 0.4);
      holder.add(d);
      drops.push(d);
    }
    fx.update = (dt, t) => {
      for (const d of drops) {
        d.position.y -= dt * (0.3 + (d.id % 5) * 0.08);
        if (d.position.y < -0.6) d.position.y = 1.1;
        d.scale.y = 1 + Math.sin(t * 4 + d.id) * 0.25;
      }
    };
  }
  return fx;
}

// ------------------------------------------------------------------
// Rig builder
// ------------------------------------------------------------------

const BODY_DEFAULTS = {
  humanoid: { torsoW: 0.42, torsoH: 0.62, torsoD: 0.26, hipY: 0.95, legL: 0.85, armL: 0.62, headR: 1.0 },
  bulky:    { torsoW: 0.72, torsoH: 0.72, torsoD: 0.44, hipY: 1.0,  legL: 0.85, armL: 0.72, headR: 0.9 },
  small:    { torsoW: 0.32, torsoH: 0.44, torsoD: 0.22, hipY: 0.62, legL: 0.52, armL: 0.44, headR: 1.25 },
  giant:    { torsoW: 0.62, torsoH: 0.78, torsoD: 0.42, hipY: 1.05, legL: 0.9,  armL: 0.68, headR: 1.1 },
  dino:     { torsoW: 0.5,  torsoH: 0.55, torsoD: 0.9,  hipY: 1.1,  legL: 0.95, armL: 0.22, headR: 1.6 },
  blob:     { torsoW: 0.8,  torsoH: 0.85, torsoD: 0.8,  hipY: 0.55, legL: 0.0,  armL: 0.0,  headR: 0.9 },
};

function normalizeParams(params = {}) {
  return {
    body: params.body || 'humanoid',
    height: params.height ?? 1.0,
    bulk: params.bulk ?? 1.0,
    colors: {
      skin: params.colors?.skin ?? 0xc9a180,
      suit: params.colors?.suit ?? 0x333944,
      accent: params.colors?.accent ?? 0xffcc33,
      eyes: params.colors?.eyes ?? 0x222222,
    },
    head: params.head || { type: 'bare' },
    attachments: params.attachments || [],
    effects: params.effects || [],
    stance: { armSpread: params.stance?.armSpread ?? 0.25, crouch: params.stance?.crouch ?? 0 },
  };
}

function limbSegment(len, r, material) {
  // segment whose pivot is at the TOP (for shoulders/hips), extends down -Y
  const g = new THREE.Group();
  const m = mesh(cyl(r, r * 0.8, len, 8), material);
  m.position.y = -len / 2;
  g.add(m);
  return { group: g, mesh: m, len };
}

export function buildFighterRig(rawParams = {}) {
  const params = normalizeParams(rawParams);
  const D = BODY_DEFAULTS[params.body] || BODY_DEFAULTS.humanoid;
  const H = params.height;
  const B = params.bulk;

  const rig = new THREE.Group();
  rig.name = 'fighter-rig';

  const skinM = mat(params.colors.skin);
  const suitM = mat(params.colors.suit);
  const accentM = mat(params.colors.accent, { emissive: params.colors.accent, emissiveIntensity: 0.35 });

  const parts = {};
  const joints = {};
  const anchors = {};
  const mounts = {};

  const root = new THREE.Group();
  root.name = 'root';
  rig.add(root);
  joints.root = root;
  anchors.root = V3(0, 1.2 * H, 0);

  const detail = Array.isArray(params.head.detail) ? params.head.detail : [params.head?.detail].filter(Boolean);

  if (params.body === 'blob') {
    // ---- BLOB: amorphous body, no legs, stubby arms ----
    const bodyG = new THREE.Group();
    bodyG.position.y = 0.62 * H;
    root.add(bodyG);
    parts.torso = bodyG;
    const bodyMesh = mesh(sph(0.5 * B, 14, 12), mat(params.colors.skin, { transparent: true, opacity: 0.92, roughness: 0.25 }));
    bodyMesh.scale.set(1.05 * B, 0.95, 1.05 * B);
    bodyMesh.name = 'blob-body';
    bodyG.add(bodyMesh);
    parts.torsoMesh = bodyMesh;
    joints.spine = bodyG;

    // face
    const headG = new THREE.Group();
    headG.position.set(0, 0.3, 0.32);
    bodyG.add(headG);
    parts.head = headG;
    joints.neck = headG;
    for (const sx of [-1, 1]) {
      const eye = mesh(sph(0.09, 8, 6), mat(0xffffff));
      eye.position.set(0.16 * sx, 0.1, 0.1);
      headG.add(eye);
      const pupil = mesh(sph(0.04, 6, 5), mat(0x111111));
      pupil.position.set(0.16 * sx, 0.1, 0.17);
      headG.add(pupil);
    }
    const mouth = mesh(new THREE.TorusGeometry(0.14, 0.045, 8, 14, Math.PI), mat(0x2a1215));
    mouth.position.set(0, -0.1, 0.18);
    mouth.rotation.x = Math.PI;
    headG.add(mouth);

    // stubby arms
    for (const side of ['L', 'R']) {
      const s = side === 'L' ? -1 : 1;
      const sh = new THREE.Group();
      sh.position.set(0.45 * B * s, 0.05, 0);
      bodyG.add(sh);
      const arm = mesh(cyl(0.09, 0.07, 0.4, 8), skinM);
      arm.position.y = -0.2;
      sh.add(arm);
      joints['shoulder' + side] = sh;
      parts['arm' + side] = sh;
      anchors['hand' + side] = V3(0.6 * B * s * H, 0.5 * H, 0);
    }
    parts.legL = parts.legR = null;
    anchors.chest = V3(0, 0.9 * H, 0.3);
    anchors.head = V3(0, 1.1 * H, 0.3);
  } else if (params.body === 'dino') {
    // ---- DINO: horizontal torso, big head + jaw, tail, tiny arms ----
    const hipG = new THREE.Group();
    hipG.position.y = D.hipY * H;
    root.add(hipG);
    joints.root = hipG;

    const torsoG = new THREE.Group();
    torsoG.rotation.x = Math.PI / 2 - 0.25; // horizontal
    hipG.add(torsoG);
    parts.torso = torsoG;
    joints.spine = torsoG;

    const bodyMesh = mesh(cyl(0.28 * B, 0.34 * B, D.torsoD * H, 10), suitM);
    bodyMesh.rotation.x = Math.PI / 2;
    bodyMesh.position.z = 0.3 * H;
    torsoG.add(bodyMesh);
    parts.torsoMesh = bodyMesh;

    // neck + head
    const neck = new THREE.Group();
    neck.position.set(0, 0.15 * H, 0.75 * H);
    neck.rotation.x = -0.6;
    torsoG.add(neck);
    joints.neck = neck;

    const headG = buildHead({ ...params, colors: params.colors }, { mat });
    headG.scale.setScalar(1.35);
    neck.add(headG);
    parts.head = headG;
    anchors.head = V3(0, 1.55 * H, 0.9 * H);

    // jaw
    const jaw = new THREE.Group();
    jaw.position.set(0, -0.12, 0.1);
    headG.add(jaw);
    const jawMesh = mesh(box(0.2, 0.08, 0.34), skinM);
    jawMesh.position.z = 0.14;
    jaw.add(jawMesh);
    joints.jaw = jaw;
    // teeth
    for (let i = 0; i < 5; i++) {
      const tooth = mesh(new THREE.ConeGeometry(0.015, 0.05, 5), mat(0xf5f0e0));
      tooth.position.set(-0.07 + i * 0.035, -0.03, 0.24);
      tooth.rotation.x = Math.PI;
      jaw.add(tooth);
    }

    // tail (segmented, animated)
    let tailParent = torsoG;
    const tailSegs = [];
    for (let i = 0; i < 4; i++) {
      const seg = new THREE.Group();
      seg.position.set(0, i === 0 ? -0.05 : 0, i === 0 ? -0.15 * H : -0.32 * H);
      const m = mesh(new THREE.ConeGeometry((0.16 - i * 0.035) * B, 0.36 * H, 8), suitM);
      m.rotation.x = -Math.PI / 2;
      m.position.z = -0.16 * H;
      seg.add(m);
      tailParent.add(seg);
      tailParent = seg;
      tailSegs.push(seg);
    }
    joints.tail = tailSegs;

    // tiny arms
    for (const side of ['L', 'R']) {
      const s = side === 'L' ? -1 : 1;
      const sh = new THREE.Group();
      sh.position.set(0.22 * B * s, 0.05, 0.45 * H);
      torsoG.add(sh);
      const { group } = limbSegment(0.22 * H, 0.05, skinM);
      sh.add(group);
      const claw = mesh(new THREE.ConeGeometry(0.02, 0.08, 6), mat(0xe8e0cc));
      claw.position.y = -0.24 * H;
      claw.rotation.x = Math.PI;
      group.add(claw);
      joints['shoulder' + side] = sh;
      joints['elbow' + side] = group;
      parts['arm' + side] = sh;
    }

    // big legs
    for (const side of ['L', 'R']) {
      const s = side === 'L' ? -1 : 1;
      const hip = new THREE.Group();
      hip.position.set(0.2 * B * s, -0.05, -0.1 * H);
      hipG.add(hip);
      const thigh = limbSegment(0.5 * H, 0.14 * B, suitM);
      hip.add(thigh.group);
      const knee = new THREE.Group();
      knee.position.y = -0.5 * H;
      thigh.group.add(knee);
      const shin = limbSegment(0.45 * H, 0.09 * B, skinM);
      knee.add(shin.group);
      const foot = mesh(box(0.16 * B, 0.08, 0.4 * B), mat(0x3a352c));
      foot.position.set(0, -0.48 * H, 0.12);
      shin.group.add(foot);
      joints['hip' + side] = hip;
      joints['knee' + side] = knee;
      parts['leg' + side] = hip;
    }
    anchors.chest = V3(0, 1.35 * H, 0.4 * H);
    anchors.handL = anchors.handR = V3(0, 1.2 * H, 0.8 * H);
  } else {
    // ---- BIPEDS: humanoid / bulky / small / giant ----
    const w = D.torsoW * B;
    const torsoH = D.torsoH * H;

    const hipG = new THREE.Group();
    hipG.position.y = D.hipY * H;
    root.add(hipG);
    joints.root = hipG;

    const spine = new THREE.Group();
    hipG.add(spine);
    joints.spine = spine;

    // torso: stacked segments (allows 'stripes' detail for e.g. Freddy's sweater)
    const torsoG = new THREE.Group();
    spine.add(torsoG);
    parts.torso = torsoG;
    const segN = detail.includes('stripes') ? 6 : 1;
    for (let i = 0; i < segN; i++) {
      const tm = detail.includes('stripes')
        ? mat(i % 2 === 0 ? params.colors.suit : (params.colors.accent ?? 0x2a6b2a))
        : suitM;
      const seg = mesh(box(w * (1 - i * 0.03), torsoH / segN + 0.01, D.torsoD * B), tm);
      seg.position.y = torsoH / 2 - (i + 0.5) * (torsoH / segN);
      torsoG.add(seg);
    }
    if (params.body === 'giant') {
      // round belly overlay
      const belly = mesh(sph(0.32 * B, 12, 10), suitM);
      belly.position.y = torsoH * 0.35;
      belly.scale.set(1, 0.9, 0.85);
      torsoG.add(belly);
    }
    if (detail.includes('jacket')) {
      const jacket = mesh(box(w * 1.06, torsoH * 0.55, D.torsoD * B * 1.08), mat(params.colors.accent));
      jacket.position.y = torsoH * 0.28;
      torsoG.add(jacket);
    }

    // belt / waist accent
    const belt = mesh(box(w * 1.02, 0.07 * H, D.torsoD * B * 1.04), accentM);
    belt.position.y = 0.01;
    torsoG.add(belt);

    // neck + head
    const neck = new THREE.Group();
    neck.position.y = torsoH + 0.06 * H;
    spine.add(neck);
    joints.neck = neck;
    const headG = buildHead(params, { mat });
    headG.scale.setScalar(D.headR * (params.body === 'small' ? 1 : 1));
    neck.add(headG);
    parts.head = headG;
    anchors.head = V3(0, (D.hipY * H) + torsoH + 0.3 * H, 0);

    // arms
    const armLen = D.armL * H;
    for (const side of ['L', 'R']) {
      const s = side === 'L' ? -1 : 1;
      const shoulder = new THREE.Group();
      shoulder.position.set((w / 2 + 0.07 * B) * s, torsoH * 0.88, 0);
      spine.add(shoulder);
      const upper = limbSegment(armLen * 0.55, 0.075 * B * (params.body === 'bulky' ? 1.7 : 1), suitM);
      shoulder.add(upper.group);
      const elbow = new THREE.Group();
      elbow.position.y = -armLen * 0.55;
      upper.group.add(elbow);
      const fore = limbSegment(armLen * 0.45, 0.06 * B * (params.body === 'bulky' ? 1.6 : 1), skinM);
      elbow.add(fore.group);
      const hand = mesh(sph(0.07 * B, 8, 6), skinM);
      hand.position.y = -armLen * 0.45 - 0.05;
      fore.group.add(hand);
      const wMount = new THREE.Group();
      wMount.position.copy(hand.position);
      fore.group.add(wMount);
      mounts['weapon' + side] = wMount;

      joints['shoulder' + side] = shoulder;
      joints['elbow' + side] = elbow;
      parts['arm' + side] = shoulder;
      parts['forearm' + side] = fore.group;
      anchors['hand' + side] = V3((w / 2 + 0.15 * B) * s * 1, D.hipY * H + torsoH * 0.4, 0);
    }

    // legs
    const legLen = D.legL * H;
    for (const side of ['L', 'R']) {
      const s = side === 'L' ? -1 : 1;
      const hip = new THREE.Group();
      hip.position.set(0.13 * B * s, 0, 0);
      hipG.add(hip);
      const thigh = limbSegment(legLen * 0.52, 0.1 * B * (params.body === 'bulky' ? 1.6 : 1), suitM);
      hip.add(thigh.group);
      const knee = new THREE.Group();
      knee.position.y = -legLen * 0.52;
      thigh.group.add(knee);
      const shin = limbSegment(legLen * 0.48, 0.075 * B * (params.body === 'bulky' ? 1.5 : 1), skinM);
      knee.add(shin.group);
      const foot = mesh(box(0.13 * B, 0.07, 0.26 * B), mat(0x2e2a26));
      foot.position.set(0, -legLen * 0.48 - 0.03, 0.07);
      shin.group.add(foot);
      joints['hip' + side] = hip;
      joints['knee' + side] = knee;
      parts['leg' + side] = hip;
    }

    mounts.back = new THREE.Group();
    mounts.back.position.set(0, torsoH * 0.6, -D.torsoD * B * 0.6);
    spine.add(mounts.back);
    anchors.chest = V3(0, D.hipY * H + torsoH * 0.55, 0.15);
  }

  // shared: back mount for dino/blob too
  if (!mounts.back) {
    mounts.back = new THREE.Group();
    mounts.back.position.set(0, 1.0 * H, -0.35 * B);
    root.add(mounts.back);
  }
  if (!mounts.weaponL) {
    for (const side of ['L', 'R']) {
      const m = new THREE.Group();
      m.position.copy(anchors['hand' + side] || V3(0, 1, 0));
      root.add(m);
      mounts['weapon' + side] = m;
    }
  }
  anchors.weaponR = mounts.weaponR ? mounts.weaponR.position.clone() : V3(0, 1, 0);

  // ---- attachments ----
  for (const def of params.attachments) {
    const att = buildAttachment(def, { mat });
    const side = def.side || 'right';
    let mount = null;
    if (side === 'back') mount = mounts.back;
    else if (side === 'head') mount = parts.head;
    else if (side === 'left') mount = mounts.weaponL;
    else mount = mounts.weaponR;
    if (def.type === 'proton-pack') mount = mounts.back;
    if (mount) {
      att.position.set(0, 0, 0);
      if (side === 'head') att.position.y = 0.25;
      mount.add(att);
    }
  }

  // ---- balloon detail (pennywise) ----
  if (detail.includes('balloon')) {
    const string = mesh(cyl(0.005, 0.005, 0.7, 5), mat(0xdddddd));
    string.position.set(0.5, 1.9 * H, 0.1);
    root.add(string);
    const balloon = mesh(sph(0.16, 12, 10), mat(0xd02020, { emissive: 0xd02020, emissiveIntensity: 0.5 }));
    balloon.scale.y = 1.25;
    balloon.position.set(0.5, 2.35 * H, 0.1);
    root.add(balloon);
    rig.userData.balloon = balloon;
  }

  // ---- effects ----
  const fx = [];
  for (const def of params.effects) {
    let anchor = anchors.chest || V3(0, 1.2 * H, 0);
    if (def.anchor === 'head') anchor = anchors.head || anchor;
    if (def.anchor === 'hand') anchor = anchors.handR || anchor;
    if (def.anchor === 'handL') anchor = anchors.handL || anchor;
    const inst = buildEffect(def, anchor);
    root.add(inst.group);
    fx.push(inst);
  }

  // stance tuning
  const spread = params.stance.armSpread;
  if (joints.shoulderL) joints.shoulderL.rotation.z = spread;
  if (joints.shoulderR) joints.shoulderR.rotation.z = -spread;
  if (params.stance.crouch && joints.root) joints.root.position.y -= params.stance.crouch * 0.25 * H;

  rig.scale.setScalar(1);
  rig.userData = {
    ...rig.userData,
    parts, joints, mounts, anchors, fx,
    params,
    clock: 0,
    facing: 1,
  };
  // STEP 6 (downed-state law): capture the bind transform of every
  // joint a pose may displace WITHOUT the pose switch resetting it
  // (today: the root joint's rotation/position and the blob torso's
  // scale). poseRig restores these at entry, making every pose a
  // total function — a 'ko' can no longer leak its on-the-back root
  // rotation into the next round's intro/idle.
  if (joints.root) {
    rig.userData.bindRoot = {
      px: joints.root.position.x, py: joints.root.position.y, pz: joints.root.position.z,
      rx: joints.root.rotation.x, ry: joints.root.rotation.y, rz: joints.root.rotation.z,
    };
  }
  if (parts.torsoMesh) {
    const s = parts.torsoMesh.scale;
    rig.userData.bindTorsoScale = { x: s.x, y: s.y, z: s.z };
  }
  return rig;
}

// ------------------------------------------------------------------
// Poses
// ------------------------------------------------------------------

const POSES = {
  idle:   { desc: 'relaxed bounce' },
  walk:   { desc: 'stride cycle' },
  punch:  { desc: 'right cross' },
  kick:   { desc: 'right roundhouse' },
  block:  { desc: 'guard up' },
  hit:    { desc: 'recoil' },
  ko:     { desc: 'knocked out, on the ground' },
  win:    { desc: 'victory arms up' },
  special:{ desc: 'signature charge' },
};

export function poseRig(rig, pose = 'idle', t = 0) {
  const J = rig.userData.joints;
  const P = rig.userData.params;
  const H = P.height;
  if (!J || !POSES[pose]) pose = 'idle';

  // Totality restore (Step 6, downed-state law): undo any root
  // displacement / torso scaling a previous pose left behind BEFORE
  // applying the new one. Poses that move the root (ko, hit, win,
  // special) re-apply their own offsets below.
  const bindRoot = rig.userData.bindRoot;
  if (bindRoot && J.root) {
    J.root.position.set(bindRoot.px, bindRoot.py, bindRoot.pz);
    J.root.rotation.set(bindRoot.rx, bindRoot.ry, bindRoot.rz);
  }
  const bindTorso = rig.userData.bindTorsoScale;
  if (bindTorso && rig.userData.parts.torsoMesh) {
    rig.userData.parts.torsoMesh.scale.set(bindTorso.x, bindTorso.y, bindTorso.z);
  }

  const set = (j, x = 0, y = 0, z = 0) => { if (j) j.rotation.set(x, y, z); };
  const dino = P.body === 'dino';
  const blob = P.body === 'blob';
  const bob = Math.sin(t * 2.2) * 0.03;

  switch (pose) {
    case 'idle': {
      if (dino) {
        set(J.neck, -0.6 + Math.sin(t * 1.4) * 0.05, 0, 0);
        if (J.tail) J.tail.forEach((s, i) => set(s, 0, Math.sin(t * 1.8 + i * 0.7) * 0.25, 0));
        if (J.jaw) J.jaw.rotation.x = Math.max(0, Math.sin(t * 0.7)) * 0.3;
      } else if (blob) {
        if (rig.userData.parts.torsoMesh) {
          const s = 1 + Math.sin(t * 2.5) * 0.04;
          rig.userData.parts.torsoMesh.scale.set(1.05 * P.bulk / s, 0.95 * s, 1.05 * P.bulk / s);
        }
        set(J.shoulderL, 0.3, 0, 0.4);
        set(J.shoulderR, 0.3, 0, -0.4);
      } else {
        set(J.spine, 0.06 + bob * 0.4, 0, 0);
        set(J.shoulderL, 0.15 + bob, 0, 0.3);
        set(J.shoulderR, 0.15 - bob, 0, -0.3);
        set(J.elbowL, -0.5, 0, 0);
        set(J.elbowR, -0.5, 0, 0);
        set(J.hipL, -0.05, 0, 0.04);
        set(J.hipR, -0.05, 0, -0.04);
        set(J.kneeL, 0.1, 0, 0);
        set(J.kneeR, 0.1, 0, 0);
        set(J.neck, 0, Math.sin(t * 0.8) * 0.08, 0);
      }
      break;
    }
    case 'walk': {
      const s = Math.sin(t * 7);
      const c = Math.cos(t * 7);
      if (dino) {
        set(J.hipL, s * 0.5, 0, 0); set(J.hipR, -s * 0.5, 0, 0);
        set(J.kneeL, Math.max(0, -c) * 0.8, 0, 0); set(J.kneeR, Math.max(0, c) * 0.8, 0, 0);
        if (J.tail) J.tail.forEach((sg, i) => set(sg, 0, s * 0.2 * (i + 1) * 0.4, 0));
      } else if (!blob) {
        set(J.hipL, s * 0.55, 0, 0); set(J.hipR, -s * 0.55, 0, 0);
        set(J.kneeL, Math.max(0, -c) * 0.9, 0, 0); set(J.kneeR, Math.max(0, c) * 0.9, 0, 0);
        set(J.shoulderL, -s * 0.5, 0, 0.2); set(J.shoulderR, s * 0.5, 0, -0.2);
        set(J.elbowL, -0.7, 0, 0); set(J.elbowR, -0.7, 0, 0);
        set(J.spine, 0.1, s * 0.06, 0);
      } else {
        if (rig.userData.parts.torsoMesh) {
          rig.userData.parts.torsoMesh.scale.y = 0.95 + Math.abs(s) * 0.08;
        }
      }
      break;
    }
    case 'punch': {
      const k = Math.min(1, (t % 1) * 4); // quick extend
      const ext = k < 0.5 ? k * 2 : Math.max(0, 2 - k * 2);
      if (!dino && !blob) {
        set(J.spine, 0.15, -0.4 * ext, 0);
        set(J.shoulderR, -1.5 * ext, 0, -0.15);
        set(J.elbowR, -0.1, 0, 0);
        set(J.shoulderL, 0.4, 0, 0.5);
        set(J.elbowL, -1.4, 0, 0);
        set(J.hipL, 0.15, 0, 0); set(J.hipR, -0.15, 0, 0);
      } else if (dino) {
        set(J.neck, -0.6 - 0.4 * ext, 0, 0); // headbutt lunge
        if (J.jaw) J.jaw.rotation.x = 0.5 * ext;
      } else {
        set(J.shoulderR, -1.2 * ext, 0, -0.3);
      }
      break;
    }
    case 'kick': {
      const k = Math.min(1, (t % 1.2) * 3.2);
      const ext = k < 0.5 ? k * 2 : Math.max(0, 2 - k * 2);
      if (!dino && !blob) {
        set(J.hipR, -1.6 * ext, 0, -0.2);
        set(J.kneeR, 0.2, 0, 0);
        set(J.spine, 0.2, 0.4 * ext, -0.15 * ext);
        set(J.shoulderL, 0.6 * ext, 0, 0.8);
        set(J.shoulderR, 0.4, 0, -0.6);
        set(J.hipL, 0.05, 0, 0);
      } else if (dino) {
        if (J.tail) J.tail.forEach((sg, i) => set(sg, 0, -0.5 * ext * (1 - i * 0.15), 0)); // tail swipe
      }
      break;
    }
    case 'block': {
      if (!dino && !blob) {
        set(J.shoulderL, -1.1, 0.3, 0.55);
        set(J.shoulderR, -1.1, -0.3, -0.55);
        set(J.elbowL, -1.2, 0, 0);
        set(J.elbowR, -1.2, 0, 0);
        set(J.spine, 0.25, 0, 0);
        set(J.kneeL, 0.35, 0, 0); set(J.kneeR, 0.35, 0, 0);
      } else if (dino) {
        set(J.neck, -0.3, 0, 0);
        if (J.jaw) J.jaw.rotation.x = 0;
      } else {
        if (rig.userData.parts.torsoMesh) rig.userData.parts.torsoMesh.scale.set(0.95 * P.bulk, 0.85, 0.95 * P.bulk);
      }
      break;
    }
    case 'hit': {
      const k = Math.min(1, (t % 0.8) * 2.5);
      const rec = k < 0.5 ? k * 2 : Math.max(0, 2 - k * 2);
      if (!dino && !blob) {
        set(J.spine, -0.35 * rec, 0, 0);
        set(J.neck, -0.4 * rec, 0, 0);
        set(J.shoulderL, -0.6 * rec, 0, 0.7);
        set(J.shoulderR, -0.6 * rec, 0, -0.7);
        if (J.root) J.root.position.z = -0.2 * rec;
      } else if (dino) {
        set(J.neck, -0.6 - 0.35 * rec, 0, 0);
        if (J.jaw) J.jaw.rotation.x = 0.4 * rec;
      } else {
        if (rig.userData.parts.torsoMesh) rig.userData.parts.torsoMesh.scale.x = 1.05 * P.bulk * (1 + 0.1 * rec);
      }
      break;
    }
    case 'ko': {
      // fall: rotate root flat, drop to ground
      if (J.root) {
        J.root.rotation.x = -Math.PI / 2 + 0.15;
        J.root.position.y = 0.25 * H;
      }
      if (!dino && !blob) {
        set(J.shoulderL, 0.4, 0, 1.2);
        set(J.shoulderR, 0.3, 0, -1.1);
        set(J.hipL, 0.2, 0, 0.2);
        set(J.hipR, -0.15, 0, -0.25);
        set(J.kneeL, 0.4, 0, 0); set(J.kneeR, 0.3, 0, 0);
        set(J.neck, 0.3, 0.4, 0);
      }
      break;
    }
    case 'win': {
      const pump = Math.sin(t * 5) * 0.15;
      if (!dino && !blob) {
        set(J.shoulderL, Math.PI - 0.25 + pump, 0, 0.35);
        set(J.shoulderR, Math.PI - 0.25 - pump, 0, -0.35);
        set(J.elbowL, -0.2, 0, 0); set(J.elbowR, -0.2, 0, 0);
        set(J.spine, -0.12, 0, 0);
        if (J.root) J.root.position.y = Math.abs(Math.sin(t * 5)) * 0.12 * H;
      } else if (dino) {
        set(J.neck, -1.1, 0, 0); // roar skyward
        if (J.jaw) J.jaw.rotation.x = 0.7;
        if (J.tail) J.tail.forEach((sg, i) => set(sg, 0.1 * i, Math.sin(t * 4 + i) * 0.3, 0));
      } else {
        if (rig.userData.parts.torsoMesh) {
          const s = 1 + Math.abs(Math.sin(t * 5)) * 0.12;
          rig.userData.parts.torsoMesh.scale.set(1.05 * P.bulk / s, 0.95 * s, 1.05 * P.bulk / s);
        }
      }
      break;
    }
    case 'special': {
      const charge = 0.5 + 0.5 * Math.sin(t * 6);
      if (!dino && !blob) {
        set(J.spine, 0.3, 0, 0);
        set(J.shoulderL, -0.6, 0, 1.1);
        set(J.shoulderR, -0.6, 0, -1.1);
        set(J.elbowL, -0.9, 0, 0); set(J.elbowR, -0.9, 0, 0);
        set(J.hipL, 0.4, 0, 0.15); set(J.hipR, 0.4, 0, -0.15);
        set(J.kneeL, 0.7, 0, 0); set(J.kneeR, 0.7, 0, 0);
        if (J.root) J.root.position.y = -0.15 * H + charge * 0.05 * H;
      } else if (dino) {
        set(J.neck, -0.6 - 0.3 * charge, 0, 0);
        if (J.jaw) J.jaw.rotation.x = 0.6 * charge;
        if (J.tail) J.tail.forEach((sg) => set(sg, -0.15 * charge, 0, 0));
      }
      // flare attached energy blades / glow fx on charge
      for (const f of rig.userData.fx || []) {
        if (f.group) f.group.scale.setScalar(1 + charge * 0.6);
      }
      break;
    }
    default:
      break;
  }

  if (rig.userData.balloon) {
    rig.userData.balloon.position.y += Math.sin(t * 1.5) * 0.002;
  }
}

// ------------------------------------------------------------------
// Effects tick
// ------------------------------------------------------------------

export function updateEffects(rig, dt) {
  if (!rig || !rig.userData) return;
  rig.userData.clock = (rig.userData.clock || 0) + dt;
  const t = rig.userData.clock;
  for (const f of rig.userData.fx || []) {
    if (typeof f.update === 'function') {
      try { f.update(dt, t); } catch (e) { /* effect failed: keep game running */ }
    }
  }
}

export const RIG_POSES = Object.keys(POSES);
export const BODY_VARIANTS = Object.keys(BODY_DEFAULTS);
