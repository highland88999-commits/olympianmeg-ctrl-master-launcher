'use client';

// ENYO — arena first-person shooter vs AI bots. All procedural, zero assets,
// zero network. Desktop: click to lock the mouse, WASD + mouse, click to
// fire. Mobile: left stick moves, right side drags to look, FIRE button.

import { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { guardCanvasContext } from '../../lib/scene-context-guard.js';
import { firstConnectedPad, isButtonPressed, GAMEPAD_BUTTONS } from '../../lib/gamepad.js';
import {
  WEAPONS,
  WEAPON_KEYS,
  weaponByKey,
  fireInterval,
  damageAt,
  applySpread,
  mulberry32,
  createBot,
  botThink,
  resolveBotShot,
  damageBot,
  markBotAttacked,
  BOT_HP,
  BOT_SKILLS,
  SKILL_KEYS,
  skillByKey,
  hasLineOfSight,
} from '@/lib/enyo-bots';
import { MAPS, mapByKey, buildObstacles, buildSpawns, OBSTACLE_STYLE } from '@/lib/enyo/maps';
import { buildEnyoDressing } from '@/lib/enyo/cgi';
import BackpackHud from '@/components/backpack/BackpackHud';
import { fx, unlockFx, setFxEnabled, isFxEnabled } from '@/lib/fx';
import { AresBackdrop, AresButton, AresIcon, AresPanel, ARES } from '@/components/ares/ares-chrome';
import { recordSoulArrival } from '../../lib/land-of-the-dead/souls.js';

const TITLE = 'ENYO';
const EYE = 1.65;
const PLAYER_R = 0.45;
const WALK = 6;
const SPRINT = 9;
const JUMP_V = 7;
const GRAVITY = -20;
const RESPAWN_DELAY = 3;
const TDM_TARGET = 30;
const FFA_TARGET = 20;
const MATCH_SECONDS = 600;




// Circle (x,z,r) vs AABB push-out. Mutates pos. Returns true if pushed.
function collideCircle(pos, r, obstacles) {
  let pushed = false;
  for (const o of obstacles) {
    const hx = o.w / 2;
    const hz = o.d / 2;
    const cx = Math.max(o.x - hx, Math.min(pos.x, o.x + hx));
    const cz = Math.max(o.z - hz, Math.min(pos.z, o.z + hz));
    let dx = pos.x - cx;
    let dz = pos.z - cz;
    let d = Math.hypot(dx, dz);
    if (d < r) {
      if (d < 1e-6) {
        // Center inside the box: push along the smallest penetration axis.
        const px = hx + r - Math.abs(pos.x - o.x);
        const pz = hz + r - Math.abs(pos.z - o.z);
        if (px < pz) pos.x += pos.x >= o.x ? px : -px;
        else pos.z += pos.z >= o.z ? pz : -pz;
      } else {
        const push = (r - d) / d;
        pos.x += dx * push;
        pos.z += dz * push;
      }
      pushed = true;
    }
  }
  // Arena bounds.
  const B = 56;
  pos.x = Math.max(-B, Math.min(B, pos.x));
  pos.z = Math.max(-B, Math.min(B, pos.z));
  return pushed;
}

// ---------------------------------------------------------------------------
// Procedural audio — tiny synth, no assets. Created on first user gesture.
// ---------------------------------------------------------------------------

function createAudio() {
  let ctx = null;
  // Mute is global now (lib/fx "Sound & vibration" setting): the local synth
  // only covers reload clicks; every combat event routes through fx pairs.
  function ensure() {
    if (!ctx) {
      try {
        ctx = new (window.AudioContext || window.webkitAudioContext)();
      } catch {
        ctx = null;
      }
    }
    if (ctx && ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  function noiseBurst(dur, freq, gain) {
    const ac = ensure();
    if (!ac || !isFxEnabled()) return;
    const n = Math.floor(ac.sampleRate * dur);
    const buf = ac.createBuffer(1, n, ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = ac.createBufferSource();
    src.buffer = buf;
    const f = ac.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = freq;
    const g = ac.createGain();
    g.gain.value = gain;
    src.connect(f).connect(g).connect(ac.destination);
    src.start();
  }
  function blip(freq, dur, gain, slideTo) {
    const ac = ensure();
    if (!ac || !isFxEnabled()) return;
    const o = ac.createOscillator();
    o.type = 'square';
    o.frequency.setValueAtTime(freq, ac.currentTime);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, ac.currentTime + dur);
    const g = ac.createGain();
    g.gain.setValueAtTime(gain, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + dur);
    o.connect(g).connect(ac.destination);
    o.start();
    o.stop(ac.currentTime + dur);
  }
  return {
    ensure,
    shot(kind) {
      if (kind === 'marksman') noiseBurst(0.28, 900, 0.5);
      else if (kind === 'smg') noiseBurst(0.09, 2400, 0.32);
      else noiseBurst(0.14, 1600, 0.4);
    },
    hit() {
      blip(880, 0.07, 0.25);
    },
    kill() {
      blip(660, 0.09, 0.3, 990);
    },
    hurt() {
      blip(180, 0.18, 0.35, 90);
    },
    reload() {
      blip(420, 0.06, 0.2);
      setTimeout(() => blip(560, 0.06, 0.2), 140);
    },
    toggleMute() {
      // The mute button now drives the launcher-wide "Sound & vibration"
      // setting (lib/fx); the page reflects it via isFxEnabled().
      setFxEnabled(!isFxEnabled());
      return !isFxEnabled();
    },
  };
}

// Ground texture: tinted noise, generated per map.
function makeGroundTexture(base) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = base;
  g.fillRect(0, 0, 256, 256);
  const rng = mulberry32(99);
  for (let i = 0; i < 2600; i++) {
    const v = rng();
    g.fillStyle = v < 0.5 ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.05)';
    g.fillRect(rng() * 256, rng() * 256, 1 + rng() * 3, 1 + rng() * 3);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(14, 14);
  return tex;
}


// ---------------------------------------------------------------------------
// Engine — raw three.js FPS. Created on deploy, destroyed on exit.
// ---------------------------------------------------------------------------

// Closest approach of ray (origin + t*dir) to a vertical segment.
// Returns t along the ray, or Infinity on miss.
function rayHitBot(origin, dir, bx, bz, radius) {
  // Solve in 2D (xz) for the cylinder, then check height.
  const ox = origin.x - bx;
  const oz = origin.z - bz;
  const a = dir.x * dir.x + dir.z * dir.z;
  if (a < 1e-8) {
    // Looking straight up/down: check horizontal distance.
    const d = Math.hypot(ox, oz);
    if (d > radius) return Infinity;
    const t = (0.95 - origin.y) / dir.y;
    return t > 0 ? t : Infinity;
  }
  const b = 2 * (ox * dir.x + oz * dir.z);
  const c = ox * ox + oz * oz - radius * radius;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return Infinity;
  const sq = Math.sqrt(disc);
  let t = (-b - sq) / (2 * a);
  if (t < 0) t = (-b + sq) / (2 * a);
  if (t < 0) return Infinity;
  const y = origin.y + dir.y * t;
  if (y < -0.1 || y > 2.0) return Infinity;
  return t;
}

// Tactical soldier — plate carrier, combat helmet, pack, knee pads.
// Procedural, team-colored trim preserved, health-bar hook unchanged.
function makeBotMesh(team) {
  const g = new THREE.Group();
  const trim = team === 'blue' ? 0x3b82f6 : 0xef4444;
  const armor = new THREE.MeshStandardMaterial({ color: 0x2b303c, roughness: 0.55, metalness: 0.55 });
  const cloth = new THREE.MeshStandardMaterial({ color: 0x23262e, roughness: 0.9, metalness: 0.1 });
  const skin = new THREE.MeshStandardMaterial({ color: 0x8a6f5c, roughness: 0.8, metalness: 0 });
  const trimMat = new THREE.MeshStandardMaterial({ color: trim, emissive: trim, emissiveIntensity: 1.1, roughness: 0.4 });

  // Legs: thighs, knee pads, shins, boots.
  const thighGeo = new THREE.BoxGeometry(0.22, 0.42, 0.24);
  const kneeGeo = new THREE.BoxGeometry(0.22, 0.16, 0.09);
  const shinGeo = new THREE.BoxGeometry(0.18, 0.4, 0.2);
  const bootGeo = new THREE.BoxGeometry(0.2, 0.14, 0.34);
  for (const s of [-1, 1]) {
    const thigh = new THREE.Mesh(thighGeo, cloth);
    thigh.position.set(s * 0.16, 0.62, 0);
    const knee = new THREE.Mesh(kneeGeo, armor);
    knee.position.set(s * 0.16, 0.42, 0.1);
    const shin = new THREE.Mesh(shinGeo, cloth);
    shin.position.set(s * 0.16, 0.22, 0);
    const boot = new THREE.Mesh(bootGeo, armor);
    boot.position.set(s * 0.16, 0.07, 0.06);
    g.add(thigh, knee, shin, boot);
  }

  // Torso: plate-carrier vest, front plate, trim belt, chest-rig pouches.
  const vest = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.62, 0.4), armor);
  vest.position.y = 1.05;
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.06), cloth);
  plate.position.set(0, 1.08, 0.21);
  const belt = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.12, 0.42), trimMat);
  belt.position.y = 0.78;
  g.add(vest, plate, belt);
  for (const s of [-1, 0, 1]) {
    const pouch = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.15, 0.08), cloth);
    pouch.position.set(s * 0.15, 0.98, 0.24);
    g.add(pouch);
  }

  // Backpack with trim stripe.
  const pack = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.5, 0.22), cloth);
  pack.position.set(0, 1.1, -0.3);
  const packStripe = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.06, 0.24), trimMat);
  packStripe.position.set(0, 1.28, -0.3);
  g.add(pack, packStripe);

  // Arms, shoulder pads with trim caps.
  const armGeo = new THREE.BoxGeometry(0.16, 0.5, 0.18);
  const padGeo = new THREE.SphereGeometry(0.17, 10, 8);
  for (const s of [-1, 1]) {
    const arm = new THREE.Mesh(armGeo, cloth);
    arm.position.set(s * 0.38, 1.05, 0);
    const pad = new THREE.Mesh(padGeo, armor);
    pad.position.set(s * 0.38, 1.32, 0);
    pad.scale.y = 0.8;
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.04, 0.2), trimMat);
    cap.position.set(s * 0.38, 1.44, 0);
    g.add(arm, pad, cap);
  }

  // Head: face, combat helmet, brim, visor goggles, NVG rail.
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 14, 10), skin);
  head.position.y = 1.62;
  const helmet = new THREE.Mesh(
    new THREE.SphereGeometry(0.26, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), armor);
  helmet.position.y = 1.66;
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.29, 0.05, 14), armor);
  brim.position.y = 1.66;
  const visor = new THREE.Mesh(
    new THREE.BoxGeometry(0.3, 0.1, 0.1),
    new THREE.MeshStandardMaterial({ color: 0x050505, emissive: trim, emissiveIntensity: 1.4 })
  );
  visor.position.set(0, 1.62, 0.18);
  const nvg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.06, 0.16), trimMat);
  nvg.position.set(0, 1.8, 0.16);
  g.add(head, helmet, brim, visor, nvg);

  // Floating health bar (sprite, always faces camera).
  const hc = document.createElement('canvas');
  hc.width = 64;
  hc.height = 10;
  const htex = new THREE.CanvasTexture(hc);
  const hb = new THREE.Sprite(new THREE.SpriteMaterial({ map: htex, depthWrite: false, transparent: true }));
  hb.scale.set(1.0, 0.16, 1);
  hb.position.y = 2.2;
  g.add(hb);
  g.userData.health = { canvas: hc, tex: htex };
  paintHealthBar(g, 1);
  return g;
}

function paintHealthBar(mesh, frac) {
  const { canvas, tex } = mesh.userData.health;
  const g = canvas.getContext('2d');
  g.clearRect(0, 0, 64, 10);
  g.fillStyle = 'rgba(0,0,0,0.55)';
  g.fillRect(0, 0, 64, 10);
  g.fillStyle = frac > 0.5 ? '#4ade80' : frac > 0.25 ? '#ffd700' : '#f87171';
  g.fillRect(2, 2, 60 * Math.max(0, frac), 6);
  // Return-fire tell: a bot that is shooting back at its attacker gets a
  // red frame on its health bar, so incoming fire reads as retaliation.
  if (mesh.userData.healthAlert) {
    g.strokeStyle = '#ef4444';
    g.lineWidth = 2;
    g.strokeRect(1, 1, 62, 8);
  }
  tex.needsUpdate = true;
}

// First-person weapon viewmodel — detailed military-grade procedural builds.
// Gold Omega brand decal — canvas-drawn metallic gold Ω, engraved-medallion look.
// Shared texture; strategic placement per weapon (receiver side, stock, scope).
let _omegaTex = null;
function omegaTexture() {
  if (_omegaTex) return _omegaTex;
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const x = c.getContext('2d');
  x.clearRect(0, 0, 128, 128);
  const grad = x.createLinearGradient(0, 18, 0, 112);
  grad.addColorStop(0, '#fff3c4');
  grad.addColorStop(0.45, '#ffd700');
  grad.addColorStop(0.75, '#c9962e');
  grad.addColorStop(1, '#8a5a14');
  x.fillStyle = grad;
  x.font = '900 88px Georgia, "Times New Roman", serif';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.shadowColor = 'rgba(255, 200, 60, 0.8)';
  x.shadowBlur = 8;
  x.fillText('Ω', 64, 68);
  x.shadowBlur = 0;
  x.strokeStyle = '#e8b93c';
  x.lineWidth = 3;
  x.beginPath();
  x.arc(64, 64, 57, 0, Math.PI * 2);
  x.stroke();
  _omegaTex = new THREE.CanvasTexture(c);
  _omegaTex.anisotropy = 4;
  return _omegaTex;
}
function omegaDecal(size) {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(size, size),
    new THREE.MeshStandardMaterial({
      map: omegaTexture(),
      transparent: true,
      opacity: 0.95,
      metalness: 0.9,
      roughness: 0.25,
      emissive: 0x664400,
      emissiveIntensity: 0.25,
      polygonOffset: true,
      polygonOffsetFactor: -1,
    })
  );
  // Faces -X (left side of the weapon, visible in first-person view).
  m.rotation.y = -Math.PI / 2;
  return m;
}

// First-person weapon viewmodel — detailed military-grade procedural builds.
// Per-weapon silhouette with rails, grips, mags, sights. Same muzzleZ outputs
// so ballistics/tracers are untouched.
function makeViewmodel(weaponKey) {
  const g = new THREE.Group();
  const dark = new THREE.MeshStandardMaterial({ color: 0x1c1f26, roughness: 0.5, metalness: 0.6 });
  const poly = new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 0.7, metalness: 0.3 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x3a3f47, roughness: 0.35, metalness: 0.8 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xd4a017, roughness: 0.3, metalness: 0.9 });
  const M = (geo, mat, x, y, z) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    return m;
  };
  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  const cylZ = (r1, r2, len, seg) => {
    const geo = new THREE.CylinderGeometry(r1, r2, len, seg || 12);
    geo.rotateX(Math.PI / 2);
    return geo;
  };

  let muzzleZ = -0.5;

  if (weaponKey === 'rifle') {
    // --- receiver ---
    g.add(M(box(0.09, 0.14, 0.42), dark, 0, 0, 0.02));
    // --- top Picatinny rail + ridges ---
    g.add(M(box(0.045, 0.025, 0.5), steel, 0, 0.085, -0.02));
    for (let i = 0; i < 9; i++) {
      g.add(M(box(0.05, 0.015, 0.02), steel, 0, 0.1, -0.24 + i * 0.055));
    }
    // --- handguard (octagonal) ---
    g.add(M(new THREE.CylinderGeometry(0.055, 0.055, 0.3, 8).rotateX(Math.PI / 2), poly, 0, 0.01, -0.32));
    // --- barrel + muzzle brake ---
    g.add(M(cylZ(0.022, 0.022, 0.16), steel, 0, 0.01, -0.52));
    g.add(M(box(0.06, 0.06, 0.1), dark, 0, 0.01, -0.6));
    g.add(M(box(0.07, 0.02, 0.06), poly, 0, 0.01, -0.6));
    // --- front post + rear peep sights ---
    g.add(M(box(0.015, 0.05, 0.015), dark, 0, 0.125, -0.42));
    g.add(M(box(0.05, 0.05, 0.02), dark, 0, 0.12, 0.16));
    // --- charging handle ---
    g.add(M(box(0.07, 0.02, 0.04), steel, 0, 0.08, 0.22));
    // --- ejection port (right side) ---
    g.add(M(box(0.005, 0.05, 0.12), poly, 0.046, 0.01, 0.0));
    // --- curved 30-round magazine (3 segments) ---
    const mag1 = M(box(0.055, 0.1, 0.09), poly, 0, -0.11, -0.02); mag1.rotation.x = 0.15;
    const mag2 = M(box(0.055, 0.1, 0.09), poly, 0, -0.19, 0.0); mag2.rotation.x = 0.3;
    const mag3 = M(box(0.055, 0.09, 0.09), poly, 0, -0.26, 0.03); mag3.rotation.x = 0.45;
    g.add(mag1, mag2, mag3);
    // --- pistol grip + trigger guard + trigger ---
    const grip = M(box(0.06, 0.16, 0.08), poly, 0, -0.13, 0.14); grip.rotation.x = 0.35;
    g.add(grip);
    g.add(M(box(0.02, 0.02, 0.12), dark, 0, -0.085, 0.06));
    g.add(M(box(0.015, 0.05, 0.02), steel, 0, -0.07, 0.05));
    // --- foregrip ---
    const fg = M(box(0.05, 0.14, 0.06), poly, 0, -0.11, -0.3); fg.rotation.x = -0.1;
    g.add(fg);
    // --- telescoping stock: buffer tube, body, buttpad, gold buttplate pin ---
    g.add(M(cylZ(0.025, 0.025, 0.18), steel, 0, 0.0, 0.3));
    g.add(M(box(0.07, 0.12, 0.22), poly, 0, -0.01, 0.38));
    g.add(M(box(0.075, 0.14, 0.03), dark, 0, -0.01, 0.49));
    g.add(M(box(0.075, 0.02, 0.02), gold, 0, 0.045, 0.38));
    // --- gold Omega: receiver left (manufacturer mark) + stock ---
    const d1 = omegaDecal(0.085); d1.position.set(-0.0465, 0.0, 0.02); g.add(d1);
    const d2 = omegaDecal(0.05); d2.position.set(-0.0365, -0.01, 0.38); g.add(d2);
    muzzleZ = -0.62;
  } else if (weaponKey === 'smg') {
    // --- receiver ---
    g.add(M(box(0.08, 0.12, 0.34), dark, 0, 0, 0.05));
    // --- top rail ---
    g.add(M(box(0.04, 0.02, 0.36), steel, 0, 0.07, 0.03));
    for (let i = 0; i < 7; i++) {
      g.add(M(box(0.045, 0.012, 0.018), steel, 0, 0.082, -0.12 + i * 0.05));
    }
    // --- red-dot sight: tube + glowing lens ---
    g.add(M(cylZ(0.03, 0.03, 0.1), dark, 0, 0.115, 0.02));
    g.add(M(cylZ(0.024, 0.024, 0.005), new THREE.MeshBasicMaterial({ color: 0xff2222 }), 0, 0.115, 0.068));
    g.add(M(box(0.02, 0.04, 0.06), dark, 0, 0.09, 0.02));
    // --- suppressor ---
    g.add(M(cylZ(0.035, 0.035, 0.22), dark, 0, 0.0, -0.28));
    g.add(M(new THREE.TorusGeometry(0.035, 0.008, 8, 16), steel, 0, 0.0, -0.2));
    g.add(M(new THREE.TorusGeometry(0.035, 0.008, 8, 16), steel, 0, 0.0, -0.34));
    // --- extended stick magazine ---
    const smag = M(box(0.05, 0.26, 0.07), poly, 0, -0.18, 0.02); smag.rotation.x = 0.12;
    g.add(smag);
    g.add(M(box(0.055, 0.03, 0.075), dark, 0, -0.305, 0.035));
    // --- grip + trigger ---
    const sgrip = M(box(0.055, 0.14, 0.07), poly, 0, -0.12, 0.16); sgrip.rotation.x = 0.3;
    g.add(sgrip);
    g.add(M(box(0.015, 0.02, 0.1), dark, 0, -0.07, 0.1));
    // --- vertical foregrip ---
    g.add(M(box(0.045, 0.12, 0.05), poly, 0, -0.1, -0.12));
    // --- wire stock: two rods + buttplate ---
    g.add(M(cylZ(0.012, 0.012, 0.2), steel, -0.025, 0.01, 0.3));
    g.add(M(cylZ(0.012, 0.012, 0.2), steel, 0.025, 0.01, 0.3));
    g.add(M(box(0.08, 0.13, 0.025), poly, 0, 0.0, 0.4));
    g.add(M(box(0.02, 0.02, 0.02), gold, 0, 0.05, 0.4));
    // --- gold Omega: receiver left + mag well ---
    const d1 = omegaDecal(0.075); d1.position.set(-0.0415, 0.0, 0.05); g.add(d1);
    const d2 = omegaDecal(0.045); d2.position.set(-0.0265, -0.14, 0.02); d2.rotation.y = -Math.PI / 2; g.add(d2);
    muzzleZ = -0.47;
  } else {
    // --- sniper: receiver ---
    g.add(M(box(0.09, 0.13, 0.4), dark, 0, 0, 0.1));
    // --- heavy barrel + fluting rings + muzzle brake ---
    g.add(M(cylZ(0.02, 0.02, 0.75), steel, 0, 0.01, -0.475));
    for (const rz of [-0.3, -0.45, -0.6]) {
      g.add(M(new THREE.TorusGeometry(0.021, 0.006, 8, 16), dark, 0, 0.01, rz));
    }
    g.add(M(cylZ(0.035, 0.035, 0.12), dark, 0, 0.01, -0.87));
    g.add(M(box(0.075, 0.02, 0.08), poly, 0, 0.01, -0.87));
    // --- scope: mounts, tube, objective bell, ocular, turrets, sunshade ---
    g.add(M(box(0.03, 0.05, 0.04), steel, 0, 0.1, -0.05));
    g.add(M(box(0.03, 0.05, 0.04), steel, 0, 0.1, 0.15));
    g.add(M(cylZ(0.04, 0.04, 0.3), dark, 0, 0.145, 0.05));
    g.add(M(cylZ(0.055, 0.045, 0.1), dark, 0, 0.145, -0.14));
    g.add(M(cylZ(0.035, 0.04, 0.08), poly, 0, 0.145, 0.23));
    g.add(M(cylZ(0.05, 0.05, 0.015), new THREE.MeshBasicMaterial({ color: 0x1a2a3a }), 0, 0.145, 0.272));
    g.add(M(box(0.03, 0.04, 0.03), steel, 0, 0.2, 0.05)); // elevation turret
    const wt = M(cylZ(0.02, 0.02, 0.03), steel, 0.055, 0.145, 0.05); wt.rotation.z = Math.PI / 2; g.add(wt); // windage
    g.add(M(box(0.025, 0.02, 0.025), gold, 0, 0.222, 0.05)); // gold turret cap
    // --- bolt handle (right side) ---
    const bolt = M(cylZ(0.012, 0.012, 0.06), steel, 0.07, 0.03, 0.12); bolt.rotation.z = Math.PI / 2;
    g.add(bolt);
    g.add(M(new THREE.SphereGeometry(0.02, 10, 8), poly, 0.105, 0.03, 0.12));
    // --- bipod: two angled legs + feet ---
    for (const s of [-1, 1]) {
      const leg = M(box(0.03, 0.22, 0.03), steel, s * 0.06, -0.14, -0.5);
      leg.rotation.z = s * 0.35;
      g.add(leg);
      g.add(M(box(0.05, 0.03, 0.08), poly, s * 0.1, -0.245, -0.5));
    }
    // --- precision stock: body, cheek riser, buttpad ---
    g.add(M(box(0.075, 0.11, 0.3), poly, 0, -0.02, 0.36));
    g.add(M(box(0.06, 0.05, 0.16), dark, 0, 0.055, 0.36));
    g.add(M(box(0.08, 0.13, 0.03), dark, 0, -0.02, 0.51));
    // --- magazine ---
    g.add(M(box(0.06, 0.1, 0.1), poly, 0, -0.11, 0.05));
    // --- trigger ---
    g.add(M(box(0.015, 0.05, 0.02), steel, 0, -0.075, 0.14));
    // --- gold Omega: receiver left + scope tube left ---
    const d1 = omegaDecal(0.085); d1.position.set(-0.0465, 0.0, 0.1); g.add(d1);
    const d2 = omegaDecal(0.055); d2.position.set(-0.0415, 0.145, 0.05); g.add(d2);
    muzzleZ = -0.92;
  }

  // Muzzle flash quad + light (localized glow only).
  const flashTex = (() => {
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 64;
    const x = c.getContext('2d');
    const gr = x.createRadialGradient(32, 32, 2, 32, 32, 30);
    gr.addColorStop(0, 'rgba(255,240,200,1)');
    gr.addColorStop(0.4, 'rgba(255,180,80,0.8)');
    gr.addColorStop(1, 'rgba(255,120,20,0)');
    x.fillStyle = gr;
    x.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  })();
  const flash = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: flashTex, transparent: true, depthWrite: false, opacity: 0 })
  );
  flash.scale.set(0.45, 0.45, 1);
  flash.position.set(0, 0.02, muzzleZ);
  const flashLight = new THREE.PointLight(0xffc873, 0, 7);
  flashLight.position.set(0, 0.1, muzzleZ);
  g.add(flash, flashLight);

  g.position.set(0.28, -0.26, -0.5);
  g.userData = { flash, flashLight, muzzleZ, flashT: 0 };
  return g;
}
function createEngine(canvas, cfg, cb) {
  const rng = mulberry32((Math.random() * 1e9) | 0);
  const map = mapByKey(cfg.mapKey);
  const reduced = !!cfg.reduced;
  const isTouch = !!cfg.isTouch;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  // Context-loss guard (fleet rollout 2026-10-15): transient losses heal
  // in place; a loss that stays gone surfaces the FEED LOST fallback,
  // and loop() below freezes while the context is lost.
  const contextGuard = guardCanvasContext(canvas, { label: 'ENYO' });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(map.sky);
  scene.fog = new THREE.Fog(map.fog, map.fogNear, map.fogFar);

  const camera = new THREE.PerspectiveCamera(75, 1, 0.05, 400);
  camera.rotation.order = 'YXZ';
  scene.add(camera);

  // Light.
  scene.add(new THREE.HemisphereLight(map.hemiSky, map.hemiGround, 0.9));
  const sun = new THREE.DirectionalLight(map.sun, 1.6);
  sun.position.set(30, 50, 20);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -60;
  sun.shadow.camera.right = 60;
  sun.shadow.camera.top = 60;
  sun.shadow.camera.bottom = -60;
  scene.add(sun);

  // Ground.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(240, 240),
    new THREE.MeshStandardMaterial({ map: makeGroundTexture(map.ground), roughness: 1 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // Obstacles: logic AABBs + meshes.
  const obstacles = buildObstacles(map.key, map.seed);
  const wallMeshes = [];
  const styleCache = {};
  const matFor = (c) => {
    if (!styleCache[c]) {
      const s = OBSTACLE_STYLE[c] || OBSTACLE_STYLE.crate;
      styleCache[c] = new THREE.MeshStandardMaterial({
        color: s.color,
        roughness: s.rough,
        metalness: s.metal || 0,
        emissive: s.emissive || 0x000000,
        emissiveIntensity: s.emissiveI || 0,
      });
    }
    return styleCache[c];
  };
  for (const o of obstacles) {
    let mesh;
    if (o.c === 'rock') {
      mesh = new THREE.Mesh(new THREE.DodecahedronGeometry(0.5, 0), matFor(o.c));
      mesh.scale.set(o.w, o.h, o.d);
      mesh.rotation.y = rng() * Math.PI;
    } else {
      mesh = new THREE.Mesh(new THREE.BoxGeometry(o.w, o.h, o.d), matFor(o.c));
    }
    mesh.position.set(o.x, o.h / 2, o.z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    wallMeshes.push(mesh);
    // Neon strips on depot pylons / containers (localized glow).
    if (map.neon && (o.c === 'neonPylon' || o.c === 'containerA' || o.c === 'containerB')) {
      const strip = new THREE.Mesh(
        new THREE.BoxGeometry(Math.min(o.w, 0.3), 0.12, Math.min(o.d, 0.3)),
        new THREE.MeshStandardMaterial({
          color: 0x0a0a0a,
          emissive: o.c === 'containerB' ? 0xff2fb3 : 0x00e5ff,
          emissiveIntensity: 2.2,
        })
      );
      strip.position.set(o.x, o.h + 0.1, o.z);
      scene.add(strip);
    }
  }

  // War dressing (2026-11-15 CGI upgrade): the goddess monument,
  // banners, racks, shields, braziers, smoke, embers, ravens — visual
  // only, anchored to the obstacles above, no new colliders.
  const dressing = buildEnyoDressing(scene, map, obstacles, map.seed);

  const spawns = buildSpawns();
  const mode = cfg.mode; // 'tdm' | 'ffa'
  const playerTeam = mode === 'tdm' ? 'blue' : 'you';
  const diffKey = cfg.diffKey || 'regular';

  // Patrol waypoints for wandering bots: a ring plus mid-map, filtered so no
  // point sits inside a tall obstacle.
  const waypoints = [];
  {
    const cand = [{ x: 0, z: 0 }];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      cand.push({ x: Math.cos(a) * 30, z: Math.sin(a) * 30 });
    }
    for (const p of cand) {
      let clear = Math.abs(p.x) < 52 && Math.abs(p.z) < 52;
      for (const o of obstacles) {
        if (o.h > 1.4 && Math.abs(p.x - o.x) < o.w / 2 + 1.5 && Math.abs(p.z - o.z) < o.d / 2 + 1.5) {
          clear = false;
          break;
        }
      }
      if (clear) waypoints.push(p);
    }
    if (waypoints.length === 0) waypoints.push({ x: 0, z: 0 });
  }

  // --- player state ---------------------------------------------------------
  const player = {
    pos: new THREE.Vector3(0, EYE, 46),
    vel: new THREE.Vector3(),
    vy: 0,
    grounded: true,
    yaw: 0, // face north (-z), toward the enemy side
    pitch: 0,
    hp: 100,
    alive: true,
    respawnT: 0,
    protectT: 0,
    kills: 0,
    deaths: 0,
    shots: 0,
    hits: 0,
    weaponKey: 'rifle',
    mag: WEAPONS.rifle.magSize,
    reserve: WEAPONS.rifle.reserveAmmo,
    reloading: false,
    reloadT: 0,
    switchT: 0,
    firing: false,
    triggerHeld: false,
    shake: 0,
    bobT: 0,
  };

  // --- bots -----------------------------------------------------------------
  const bots = [];
  const botMeshes = new Map();
  const mkBot = (id, team, spawn) => {
    const b = createBot(id, team, spawn, diffKey);
    const mesh = makeBotMesh(team);
    mesh.position.set(spawn.x, 0, spawn.z);
    scene.add(mesh);
    bots.push(b);
    botMeshes.set(id, mesh);
  };
  if (mode === 'tdm') {
    mkBot(0, 'blue', spawns.blue[1]);
    mkBot(1, 'blue', spawns.blue[2]);
    mkBot(2, 'red', spawns.red[0]);
    mkBot(3, 'red', spawns.red[1]);
    mkBot(4, 'red', spawns.red[2]);
  } else {
    const all = [...spawns.blue, ...spawns.red];
    for (let i = 0; i < 5; i++) mkBot(i, 'red', all[i % all.length]);
  }

  // --- scores / timer ---------------------------------------------------------
  let blueScore = 0;
  let redScore = 0;
  let timeLeft = MATCH_SECONDS;
  let over = false;
  let result = null;

  // --- viewmodel --------------------------------------------------------------
  let vm = makeViewmodel(player.weaponKey);
  camera.add(vm);

  // --- tracers / impacts ------------------------------------------------------
  // Tracer streaks: a short THICK mesh streak, not a 1px line — the old
  // THREE.Line at 0.09s was nearly invisible on a phone. Ballistics
  // are untouched: the streak spans the full path instantly and only
  // shows where the shot went; damage still lands in fire().
  const fx = [];
  function addTracer(from, to, color = 0xffe08a) {
    const dir = new THREE.Vector3().subVectors(to, from);
    const len = Math.max(dir.length(), 0.1);
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.07, 0.07, len),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95 })
    );
    mesh.position.copy(from).addScaledVector(dir, 0.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir.normalize());
    scene.add(mesh);
    fx.push({ obj: mesh, t: 0, life: 0.32, kind: 'streak' });
  }
  function addImpact(p, color = 0xffcc88) {
    const s = new THREE.Mesh(
      new THREE.SphereGeometry(0.09, 8, 6),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1 })
    );
    s.position.copy(p);
    scene.add(s);
    fx.push({ obj: s, t: 0, life: 0.25, kind: 'pop' });
  }
  // Takedown burst: a small scatter of pops where a combatant falls, so a
  // kill reads at a glance instead of the figure just vanishing.
  function addDeathBurst(p, color = 0xff8888) {
    for (let i = 0; i < 6; i++) {
      const q = p.clone();
      q.x += (rng() - 0.5) * 1.1;
      q.y += rng() * 1.2;
      q.z += (rng() - 0.5) * 1.1;
      addImpact(q, color);
    }
  }

  const audio = createAudio();
  const raycaster = new THREE.Raycaster();
  const tmpDir = new THREE.Vector3();

  // --- input ------------------------------------------------------------------
  const keys = new Set();
  let pointerLocked = false;
  let paused = false;

  function onKeyDown(e) {
    const k = e.key.toLowerCase();
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
    keys.add(k);
    if (k === 'r') startReload();
    if (k === '1') switchWeapon('rifle');
    if (k === '2') switchWeapon('smg');
    if (k === '3') switchWeapon('marksman');
  }
  function onKeyUp(e) {
    keys.delete(e.key.toLowerCase());
  }
  function onMouseMove(e) {
    if (!pointerLocked || paused || over) return;
    player.yaw -= e.movementX * 0.0022;
    player.pitch -= e.movementY * 0.0022;
    player.pitch = Math.max(-1.45, Math.min(1.45, player.pitch));
  }
  function onMouseDown(e) {
    if (e.button !== 0) return;
    if (!pointerLocked && !isTouch) {
      canvas.requestPointerLock?.();
      return;
    }
    if (paused || over) return;
    const w = weaponByKey(player.weaponKey);
    if (w.auto) {
      player.firing = true;
    } else {
      tryFire(); // semi: one shot per click
    }
    player.triggerHeld = true;
  }
  function onMouseUp(e) {
    if (e.button !== 0) return;
    player.firing = false;
    player.triggerHeld = false;
  }
  function onLockChange() {
    pointerLocked = document.pointerLockElement === canvas;
    if (!pointerLocked && !isTouch && !over && started) {
      paused = true;
      cb.paused(true);
    } else if (pointerLocked) {
      paused = false;
      cb.paused(false);
    }
  }

  // Touch controls.
  const touches = new Map(); // id -> {role, ox, oy, x, y}
  const joy = { active: false, id: null, ox: 0, oy: 0, dx: 0, dy: 0 };
  function touchPos(t) {
    const r = canvas.getBoundingClientRect();
    return { x: t.clientX - r.left, y: t.clientY - r.top, w: r.width, h: r.height };
  }
  function onTouchStart(e) {
    if (paused || over) return;
    for (const t of e.changedTouches) {
      const p = touchPos(t);
      if (p.x < p.w * 0.45 && p.y > p.h * 0.45 && !joy.active) {
        joy.active = true;
        joy.id = t.identifier;
        joy.ox = p.x;
        joy.oy = p.y;
        joy.dx = 0;
        joy.dy = 0;
        touches.set(t.identifier, { role: 'joy' });
      } else if (![...touches.values()].some((v) => v.role === 'look')) {
        touches.set(t.identifier, { role: 'look', x: p.x, y: p.y });
      }
    }
    if (e.cancelable) e.preventDefault();
    cb.touchUI(true);
  }
  function onTouchMove(e) {
    for (const t of e.changedTouches) {
      const info = touches.get(t.identifier);
      if (!info) continue;
      const p = touchPos(t);
      if (info.role === 'joy') {
        let dx = p.x - joy.ox;
        let dy = p.y - joy.oy;
        const d = Math.hypot(dx, dy);
        const max = 60;
        if (d > max) {
          dx = (dx / d) * max;
          dy = (dy / d) * max;
        }
        joy.dx = dx / max;
        joy.dy = dy / max;
      } else if (info.role === 'look') {
        player.yaw -= (p.x - info.x) * 0.0048;
        player.pitch -= (p.y - info.y) * 0.0048;
        player.pitch = Math.max(-1.45, Math.min(1.45, player.pitch));
        info.x = p.x;
        info.y = p.y;
      }
    }
    if (e.cancelable) e.preventDefault();
  }
  function onTouchEnd(e) {
    for (const t of e.changedTouches) {
      const info = touches.get(t.identifier);
      if (info && info.role === 'joy') {
        joy.active = false;
        joy.id = null;
        joy.dx = 0;
        joy.dy = 0;
      }
      touches.delete(t.identifier);
    }
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);
  document.addEventListener('pointerlockchange', onLockChange);
  canvas.addEventListener('touchstart', onTouchStart, { passive: false });
  canvas.addEventListener('touchmove', onTouchMove, { passive: false });
  canvas.addEventListener('touchend', onTouchEnd);
  canvas.addEventListener('touchcancel', onTouchEnd);

  // --- weapons ----------------------------------------------------------------
  function switchWeapon(key) {
    if (!WEAPON_KEYS.includes(key) || key === player.weaponKey || player.reloading) return;
    player.weaponKey = key;
    const w = weaponByKey(key);
    player.mag = w.magSize;
    player.reserve = w.reserveAmmo;
    player.switchT = 0.35;
    player.firing = false;
    camera.remove(vm);
    vm = makeViewmodel(key);
    camera.add(vm);
    cb.hud(snapshotHud());
  }
  function startReload() {
    const w = weaponByKey(player.weaponKey);
    if (player.reloading || player.mag >= w.magSize || player.reserve <= 0 || !player.alive) return;
    player.reloading = true;
    player.reloadT = w.reloadTime;
    player.firing = false;
    audio.reload();
  }
  function finishReload() {
    const w = weaponByKey(player.weaponKey);
    const need = w.magSize - player.mag;
    const take = Math.min(need, player.reserve);
    player.mag += take;
    player.reserve -= take;
    player.reloading = false;
    cb.hud(snapshotHud());
  }

  function muzzleWorld() {
    const v = new THREE.Vector3(0, 0.02, vm.userData.muzzleZ);
    return vm.localToWorld(v);
  }

  function tryFire() {
    if (!player.alive || over || paused) return;
    const w = weaponByKey(player.weaponKey);
    if (player.reloading || player.switchT > 0) return;
    if (player.mag <= 0) {
      audio.ensure();
      startReload();
      return;
    }
    player.mag -= 1;
    player.shots += 1;
    audio.ensure();
    fx.shoot(player.weaponKey); // central FX: light zap + tick, throttled for automatics

    const moving =
      keys.has('w') || keys.has('a') || keys.has('s') || keys.has('d') || joy.active;
    const spread = w.spreadDeg + (moving ? w.moveSpreadDeg : 0);
    camera.getWorldDirection(tmpDir);
    const dir = applySpread({ x: tmpDir.x, y: tmpDir.y, z: tmpDir.z }, spread, rng);
    const origin = camera.position.clone();

    // Walls first.
    raycaster.set(origin, new THREE.Vector3(dir.x, dir.y, dir.z));
    raycaster.far = 200;
    const wallHits = raycaster.intersectObjects(wallMeshes, false);
    const wallDist = wallHits.length ? wallHits[0].distance : Infinity;
    const wallPoint = wallHits.length ? wallHits[0].point : null;

    // Bots.
    let bestT = wallDist;
    let bestBot = null;
    for (const b of bots) {
      if (!b.alive) continue;
      const t = rayHitBot(origin, dir, b.pos.x, b.pos.z, 0.55);
      if (t < bestT) {
        bestT = t;
        bestBot = b;
      }
    }

    const from = muzzleWorld();
    if (bestBot) {
      const dmg = damageAt(w, bestT);
      player.hits += 1;
      const killed = damageBot(bestBot, dmg);
      // Return fire: a bot you shoot answers back at you (lib/enyo-bots).
      if (!killed) markBotAttacked(bestBot, 'player');
      paintHealthBar(botMeshes.get(bestBot.id), bestBot.hp / BOT_HP);
      const to = new THREE.Vector3(
        bestBot.pos.x, 1.1, bestBot.pos.z
      );
      addTracer(from, to);
      addImpact(to, 0xff8888);
      cb.hitmarker(killed);
      if (killed) {
        player.kills += 1;
        addDeathBurst(to);
        if (mode === 'tdm') {
          if (bestBot.team === 'red') blueScore += 1;
          else redScore += 1;
        }
        audio.kill();
        cb.feed(`You eliminated ${bestBot.name}`);
        const mesh = botMeshes.get(bestBot.id);
        if (mesh) mesh.visible = false;
      } else {
        audio.hit();
      }
    } else {
      const to = wallPoint || origin.clone().add(new THREE.Vector3(dir.x, dir.y, dir.z).multiplyScalar(120));
      addTracer(from, to);
      if (wallPoint) addImpact(wallPoint);
    }

    // Recoil + shake (shake off under reduced motion).
    player.pitch = Math.min(1.45, player.pitch + w.recoilKick);
    player.yaw += (rng() - 0.5) * w.recoilKick * 0.6;
    if (!reduced) player.shake = Math.min(1, player.shake + 0.25);
    vm.userData.flashT = 0.06;
    vm.userData.flash.material.opacity = 1;
    vm.userData.flashLight.intensity = 9;
    vm.position.z = -0.44; // kick back

    cb.hud(snapshotHud());
    checkWin();
  }

  // --- bot combat ---------------------------------------------------------------
  function botFireAt(bot, target, dist) {
    const w = weaponByKey(bot.weaponKey);
    // True line of sight: tall obstacles block the shot entirely.
    if (!hasLineOfSight({ x: bot.pos.x, z: bot.pos.z }, { x: target.pos.x, z: target.pos.z }, obstacles)) return;
    const res = resolveBotShot(dist, w, rng, bot.skillKey);
    if (!res.hit) {
      // Tracer whizzing past — feedback without damage.
      const from = new THREE.Vector3(bot.pos.x, 1.4, bot.pos.z);
      const to = new THREE.Vector3(target.pos.x, 1.2 + (rng() - 0.5), target.pos.z);
      addTracer(from, to, 0xff6666);
      return;
    }
    if (target.id === 'player') {
      if (!player.alive || player.protectT > 0) return;
      // Return fire you can see: hits draw the same red tracer as misses,
      // so a bot answering your shots always shows where it fired from.
      addTracer(
        new THREE.Vector3(bot.pos.x, 1.4, bot.pos.z),
        new THREE.Vector3(target.pos.x, 1.2, target.pos.z),
        0xff6666
      );
      player.hp -= res.damage;
      fx.hit(); // central FX: dull thud + medium buzz for damage taken
      if (!reduced) player.shake = Math.min(1, player.shake + 0.5);
      const ang = Math.atan2(bot.pos.x - player.pos.x, bot.pos.z - player.pos.z);
      cb.damageDir(ang - player.yaw);
      if (player.hp <= 0) {
        player.hp = 0;
        player.alive = false;
        fx.death(); // central FX: descending tone + long rumble
        player.deaths += 1;
        player.respawnT = RESPAWN_DELAY;
        // The Land of the Dead (Merlin, Nov 16 ~04:17): the player's
        // death arrives there too — additive only, the respawn above
        // is untouched. Guarded by `player.alive` at the top of this
        // block, so this fires once per death.
        recordSoulArrival({ kind: 'user', origin: 'enyo', diedAt: Date.now() });
        if (mode === 'tdm') redScore += 1;
        bot.kills += 1;
        cb.feed(`${bot.name} eliminated you`);
        checkWin();
      }
      cb.hud(snapshotHud());
    } else {
      const tb = bots.find((b) => b.id === target.id);
      if (!tb || !tb.alive) return;
      const killed = damageBot(tb, res.damage);
      // Bot-on-bot return fire: a surviving victim answers its attacker.
      if (!killed) markBotAttacked(tb, bot.id);
      paintHealthBar(botMeshes.get(tb.id), tb.hp / BOT_HP);
      const from = new THREE.Vector3(bot.pos.x, 1.4, bot.pos.z);
      const to = new THREE.Vector3(tb.pos.x, 1.1, tb.pos.z);
      addTracer(from, to, 0xffaa66);
      if (killed) {
        bot.kills += 1;
        addDeathBurst(to);
        if (mode === 'tdm') {
          if (tb.team === 'red') blueScore += 1;
          else redScore += 1;
        }
        cb.feed(`${bot.name} eliminated ${tb.name}`);
        const mesh = botMeshes.get(tb.id);
        if (mesh) mesh.visible = false;
        checkWin();
      }
    }
  }

  function respawnBot(b) {
    const pool = b.team === 'blue' ? spawns.blue : spawns.red;
    const s = pool[b.id % pool.length];
    b.pos.x = s.x + (rng() - 0.5) * 4;
    b.pos.z = s.z + (rng() - 0.5) * 4;
    b.hp = BOT_HP;
    b.targetId = null;
    b.retaliateId = null;
    b.retaliateT = 0;
    const mesh = botMeshes.get(b.id);
    mesh.position.set(b.pos.x, 0, b.pos.z);
    mesh.visible = true;
    mesh.userData.healthAlert = false;
    paintHealthBar(mesh, 1);
  }

  function respawnPlayer() {
    const pool = mode === 'tdm' ? spawns.blue : [...spawns.blue, ...spawns.red];
    const s = pool[(rng() * pool.length) | 0];
    player.pos.set(s.x, EYE, s.z);
    player.vel.set(0, 0, 0);
    player.vy = 0;
    player.hp = 100;
    player.alive = true;
    player.protectT = 2;
    const w = weaponByKey(player.weaponKey);
    player.mag = w.magSize;
    player.reserve = w.reserveAmmo;
    player.reloading = false;
    cb.hud(snapshotHud());
  }

  // --- win / lose ---------------------------------------------------------------
  function checkWin() {
    if (over) return;
    const target = mode === 'tdm' ? TDM_TARGET : FFA_TARGET;
    if (mode === 'tdm') {
      if (blueScore >= target) return endGame(true, `Victory — first to ${target}`);
      if (redScore >= target) return endGame(false, `Defeat — enemy reached ${target}`);
    } else {
      if (player.kills >= target) return endGame(true, `Victory — first to ${target} kills`);
      const leader = bots.reduce((a, b) => (b.kills > a.kills ? b : a), bots[0]);
      if (leader.kills >= target) return endGame(false, `${leader.name} reached ${target} kills`);
    }
  }

  function endGame(won, reason) {
    over = true;
    result = { won, reason };
    if (won) fx.gameWin(); // central FX: full match-win fanfare
    else fx.menuClose(); // defeat: a soft settle, no buzz-shame
    document.exitPointerLock?.();
    const acc = player.shots ? Math.round((player.hits / player.shots) * 100) : 0;
    cb.gameOver({
      won,
      reason,
      kills: player.kills,
      deaths: player.deaths,
      accuracy: acc,
      blueScore,
      redScore,
      mode,
    });
  }

  // --- HUD snapshot ---------------------------------------------------------------
  function snapshotHud() {
    const w = weaponByKey(player.weaponKey);
    return {
      hp: Math.ceil(player.hp),
      alive: player.alive,
      respawnIn: Math.ceil(player.respawnT),
      protected: player.protectT > 0,
      mag: player.mag,
      reserve: player.reserve,
      reloading: player.reloading,
      lowAmmo: player.alive && !player.reloading && player.mag > 0 && player.mag <= Math.ceil(w.magSize * 0.25),
      weaponKey: player.weaponKey,
      weaponName: w.name,
      blueScore,
      redScore,
      kills: player.kills,
      deaths: player.deaths,
      timeLeft: Math.ceil(timeLeft),
      mode,
      target: mode === 'tdm' ? TDM_TARGET : FFA_TARGET,
    };
  }

  // --- main loop --------------------------------------------------------------------
  let raf = 0;
  let lastT = 0;
  let hudT = 0;
  // Gamepad FIRE state: held = FIRE button held, released on
  // pause/over/death/disconnect so firing can never stick.
  let gpConfirmHeld = false;
  let started = false;
  const clock = { t: 0 };

  function resize() {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();

  const combatantCache = [];
  function loop(t) {
    if (!started) return;
    raf = requestAnimationFrame(loop);
    if (contextGuard.isLost()) return; // frozen while the context is gone
    const dt = Math.min(0.05, (t - lastT) / 1000 || 0.016);
    lastT = t;
    // Gamepad: ✕/A (CONFIRM) held = FIRE button held — rising edge
    // presses it, falling edge releases it, exactly like the touch
    // FIRE button (semi fires once on press; autos fire while held).
    // The else branch releases on pause/over/death/disconnect.
    if (player.alive && !paused && !over && typeof navigator !== 'undefined' && typeof navigator.getGamepads === 'function') {
      const pad = firstConnectedPad(navigator.getGamepads());
      const held = pad ? isButtonPressed(pad.buttons[GAMEPAD_BUTTONS.CONFIRM]) : false;
      if (held !== gpConfirmHeld) {
        gpConfirmHeld = held;
        api.setFiring(held);
      }
    } else if (gpConfirmHeld) {
      gpConfirmHeld = false;
      api.setFiring(false);
    }
    if (paused || over) return;
    clock.t += dt;
    dressing.update(dt, clock.t);

    // Timer.
    timeLeft -= dt;
    if (timeLeft <= 0) {
      timeLeft = 0;
      if (mode === 'tdm') endGame(blueScore >= redScore, 'Time up');
      else {
        const leader = bots.reduce((a, b) => (b.kills > a.kills ? b : a), bots[0]);
        endGame(player.kills >= leader.kills, 'Time up');
      }
      return;
    }

    // --- player movement ------------------------------------------------------
    if (player.alive) {
      if (player.protectT > 0) player.protectT -= dt;
      let ix = 0;
      let iz = 0;
      if (keys.has('w') || keys.has('arrowup')) iz -= 1;
      if (keys.has('s') || keys.has('arrowdown')) iz += 1;
      if (keys.has('a') || keys.has('arrowleft')) ix -= 1;
      if (keys.has('d') || keys.has('arrowright')) ix += 1;
      if (joy.active) {
        ix += joy.dx;
        iz += joy.dy;
      }
      const sprinting = (keys.has('shift') || (joy.active && Math.hypot(joy.dx, joy.dy) > 0.92)) && iz < 0;
      const speed = sprinting ? SPRINT : WALK;
      // Camera-relative movement: forward = (-sin yaw, -cos yaw), right = (cos yaw, -sin yaw).
      const fx = -Math.sin(player.yaw);
      const fz = -Math.cos(player.yaw);
      const rx = Math.cos(player.yaw);
      const rz = -Math.sin(player.yaw);
      player.vel.x = (fx * -iz + rx * ix) * speed;
      player.vel.z = (fz * -iz + rz * ix) * speed;

      if ((keys.has(' ') || touchJump) && player.grounded) {
        player.vy = JUMP_V;
        player.grounded = false;
      }
      player.vy += GRAVITY * dt;
      let ny = player.pos.y + player.vy * dt;
      if (ny <= EYE) {
        ny = EYE;
        player.vy = 0;
        player.grounded = true;
      }
      player.pos.x += player.vel.x * dt;
      player.pos.z += player.vel.z * dt;
      player.pos.y = ny;
      collideCircle(player.pos, PLAYER_R, obstacles);

      // Head bob (skip under reduced motion).
      const movingAmt = Math.hypot(player.vel.x, player.vel.z);
      if (!reduced && movingAmt > 1 && player.grounded) player.bobT += dt * movingAmt * 1.4;

      // Firing (auto).
      const w = weaponByKey(player.weaponKey);
      if (player.switchT > 0) player.switchT -= dt;
      if (player.reloading) {
        player.reloadT -= dt;
        if (player.reloadT <= 0) finishReload();
      } else if (player.firing && w.auto && player.switchT <= 0) {
        player.fireT = (player.fireT || 0) - dt;
        if (player.fireT <= 0) {
          player.fireT = fireInterval(w);
          tryFire();
        }
      }

      // Camera.
      const bobY = !reduced ? Math.sin(player.bobT) * 0.035 : 0;
      const bobX = !reduced ? Math.cos(player.bobT * 0.5) * 0.02 : 0;
      player.shake = Math.max(0, player.shake - dt * 4);
      const shX = reduced ? 0 : (rng() - 0.5) * 0.05 * player.shake;
      const shY = reduced ? 0 : (rng() - 0.5) * 0.05 * player.shake;
      camera.position.set(
        player.pos.x + bobX + shX,
        player.pos.y + bobY + shY,
        player.pos.z
      );
      camera.rotation.set(player.pitch, player.yaw, 0);

      // Viewmodel sway + reload dip + muzzle flash decay.
      vm.position.z += (-0.5 - vm.position.z) * Math.min(1, dt * 10);
      if (player.reloading) {
        vm.rotation.x = -0.5 * Math.sin((1 - player.reloadT / w.reloadTime) * Math.PI);
      } else {
        vm.rotation.x *= 0.9;
      }
      if (vm.userData.flashT > 0) {
        vm.userData.flashT -= dt;
        if (vm.userData.flashT <= 0) {
          vm.userData.flash.material.opacity = 0;
          vm.userData.flashLight.intensity = 0;
        }
      }
    } else {
      // Dead: countdown to respawn.
      player.respawnT -= dt;
      if (player.respawnT <= 0) respawnPlayer();
    }

    // --- bots -----------------------------------------------------------------
    combatantCache.length = 0;
    combatantCache.push({
      id: 'player', team: playerTeam, pos: { x: player.pos.x, z: player.pos.z }, dead: !player.alive,
    });
    for (const b of bots) {
      combatantCache.push({ id: b.id, team: b.team, pos: { x: b.pos.x, z: b.pos.z }, dead: !b.alive });
    }
    for (const b of bots) {
      const mesh = botMeshes.get(b.id);
      if (!b.alive) {
        if (b.respawnT > 0) {
          b.respawnT -= dt;
          if (b.respawnT <= 0) {
            b.alive = true;
            respawnBot(b);
          }
        }
        continue;
      }
      const intents = botThink(b, combatantCache, dt, rng, { obstacles, waypoints });
      let mvx = 0;
      let mvz = 0;
      for (const it of intents) {
        if (it.type === 'move') {
          mvx = it.dx;
          mvz = it.dz;
        } else if (it.type === 'face') {
          b.yaw = it.yaw;
        } else if (it.type === 'fire') {
          const target = combatantCache.find((c) => c.id === it.targetId);
          if (target && !target.dead) botFireAt(b, target, it.dist);
        }
      }
      b.pos.x += mvx * dt;
      b.pos.z += mvz * dt;
      collideCircle(b.pos, 0.5, obstacles);
      mesh.position.set(b.pos.x, 0, b.pos.z);
      mesh.rotation.y = b.yaw;
      // Return-fire tell: repaint the health bar only when the bot's
      // retaliation state flips, so the red frame tracks it exactly.
      const alerting = b.retaliateT > 0 && b.retaliateId != null;
      if (mesh.userData.healthAlert !== alerting) {
        mesh.userData.healthAlert = alerting;
        paintHealthBar(mesh, b.hp / BOT_HP);
      }
      // Simple walk bob.
      mesh.position.y = Math.abs(Math.sin(clock.t * 9)) * 0.05;
    }

    // --- fx ---------------------------------------------------------------------
    for (let i = fx.length - 1; i >= 0; i--) {
      const f = fx[i];
      f.t += dt;
      const k = f.t / f.life;
      if (k >= 1) {
        scene.remove(f.obj);
        f.obj.geometry?.dispose();
        f.obj.material?.dispose();
        fx.splice(i, 1);
        continue;
      }
      if (f.kind === 'fade') f.obj.material.opacity = 0.9 * (1 - k);
      else if (f.kind === 'streak') f.obj.material.opacity = 0.95 * (1 - k);
      else {
        f.obj.scale.setScalar(1 + k * 3);
        f.obj.material.opacity = 1 - k;
      }
    }

    // --- HUD sync ---------------------------------------------------------------
    hudT += dt;
    if (hudT > 0.15) {
      hudT = 0;
      cb.hud(snapshotHud());
    }

    renderer.render(scene, camera);
  }

  let touchJump = false;

  const api = {
    start() {
      started = true;
      paused = false;
      gpConfirmHeld = false;
      lastT = performance.now();
      cb.hud(snapshotHud());
      if (!isTouch) {
        try {
          canvas.requestPointerLock?.();
        } catch {
          /* drag-look fallback */
        }
      }
      raf = requestAnimationFrame(loop);
    },
    resume() {
      // Re-lock the pointer after Esc (desktop).
      paused = false;
      cb.paused(false);
      lastT = performance.now();
      try {
        canvas.requestPointerLock?.();
      } catch {
        /* ignored */
      }
    },
    setFiring(v) {
      player.firing = v;
      if (v) {
        const w = weaponByKey(player.weaponKey);
        if (!w.auto) tryFire();
        else player.fireT = 0;
      }
    },
    jump() {
      touchJump = true;
      setTimeout(() => {
        touchJump = false;
      }, 120);
    },
    reload() {
      startReload();
    },
    cycleWeapon() {
      const i = WEAPON_KEYS.indexOf(player.weaponKey);
      switchWeapon(WEAPON_KEYS[(i + 1) % WEAPON_KEYS.length]);
    },
    switchWeapon,
    toggleMute() {
      return audio.toggleMute();
    },
    resize,
    destroy() {
      contextGuard.dispose();
      started = false;
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('mousemove', onMouseMove);
      canvas.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
      document.removeEventListener('pointerlockchange', onLockChange);
      canvas.removeEventListener('touchstart', onTouchStart);
      canvas.removeEventListener('touchmove', onTouchMove);
      canvas.removeEventListener('touchend', onTouchEnd);
      canvas.removeEventListener('touchcancel', onTouchEnd);
      window.removeEventListener('resize', resize);
      document.exitPointerLock?.();
      scene.traverse((o) => {
        o.geometry?.dispose?.();
        if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose?.());
      });
      renderer.dispose();
    },
  };
  return api;
}

// ---------------------------------------------------------------------------
// Page shell: menu, HUD, overlays, mobile controls.
// ---------------------------------------------------------------------------

function fmtTime(s) {
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${String(r).padStart(2, '0')}`;
}

function StatBar({ label, value }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-16 text-[10px] uppercase tracking-widest text-neutral-400">{label}</span>
      <div className="flex-1 h-1.5 bg-white/10 rounded-lg overflow-hidden">
        <div className="h-full bg-amber-400 rounded-lg" style={{ width: `${Math.round(value * 100)}%` }} />
      </div>
    </div>
  );
}

function WeaponCard({ w, selected, onPick }) {
  return (
    <button
      onClick={onPick}
      className={`text-left p-3 rounded-lg border transition-colors w-full ${
        selected ? 'border-amber-400/80 bg-amber-400/10' : 'border-white/15 bg-white/5 hover:bg-white/10'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-bold text-neutral-100">{w.name}</div>
        {selected && <AresIcon name="check" className="h-4 w-4 shrink-0" style={{ color: ARES.goldSoft }} />}
      </div>
      <div className="text-[11px] text-neutral-400 mt-0.5 mb-2">{w.desc}</div>
      <div className="space-y-1">
        <StatBar label="Damage" value={w.damage / 90} />
        <StatBar label="Fire rate" value={w.rpm / 900} />
        <StatBar label="Range" value={w.falloffFar / 120} />
        <StatBar label="Magazine" value={w.magSize / 40} />
      </div>
      <div className="text-[10px] text-neutral-500 mt-2 tracking-wider">
        {w.magSize} PER MAG · {w.auto ? 'FULL AUTO' : 'SEMI AUTO'} · PRESS {w.key === 'rifle' ? '1' : w.key === 'smg' ? '2' : '3'}
      </div>
    </button>
  );
}

export default function EnyoPage() {
  const canvasRef = useRef(null);
  const engineRef = useRef(null);
  const feedId = useRef(0);

  const [phase, setPhase] = useState('menu');
  const [mapKey, setMapKey] = useState('plaza');
  const [mode, setMode] = useState('tdm');
  const [diffKey, setDiffKey] = useState('regular');
  const [hud, setHud] = useState(null);
  const [feed, setFeed] = useState([]);
  const [hitmark, setHitmark] = useState(null);
  const [dmgDir, setDmgDir] = useState(null);
  const [paused, setPaused] = useState(false);
  const [isTouch, setIsTouch] = useState(false);
  const [muted, setMuted] = useState(false);
  const [result, setResult] = useState(null);
  const [reduced, setReduced] = useState(false);
  const [joy, setJoy] = useState({ active: false, dx: 0, dy: 0 });

  useEffect(() => {
    document.title = TITLE;
    try {
      setReduced(!!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
      setIsTouch('ontouchstart' in window || navigator.maxTouchPoints > 0);
      setMuted(!isFxEnabled()); // mute button reflects the global FX setting
    } catch {
      /* defaults */
    }
    // FX system: unlock sound+haptics on the first gesture (deep links may
    // land here without passing through the hub).
    const unlock = () => unlockFx();
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => {
      engineRef.current?.destroy();
      engineRef.current = null;
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  const destroyEngine = useCallback(() => {
    engineRef.current?.destroy();
    engineRef.current = null;
  }, []);

  const deploy = useCallback(() => {
    fx.tap(); // menu confirm: deploying into the arena
    destroyEngine();
    setFeed([]);
    setResult(null);
    setHitmark(null);
    setDmgDir(null);
    setPaused(false);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const touch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    setIsTouch(touch);
    let joyT = 0;
    const engine = createEngine(
      canvas,
      { mapKey, mode, diffKey, reduced, isTouch: touch },
      {
        hud: (h) => setHud(h),
        feed: (msg) => {
          feedId.current += 1;
          const id = feedId.current;
          setFeed((f) => [...f.slice(-4), { id, msg }]);
        },
        hitmarker: (killed) => {
          setHitmark({ n: Date.now(), killed });
        },
        damageDir: (rel) => {
          const id = Date.now();
          setDmgDir({ rel, id });
          setTimeout(() => {
            setDmgDir((d) => (d && d.id === id ? null : d));
          }, 900);
        },
        paused: (p) => setPaused(p),
        touchUI: () => setIsTouch(true),
        joy: (j) => {
          const now = performance.now();
          if (now - joyT > 90 || j.active !== joy.active) {
            joyT = now;
            setJoy({ active: j.active, dx: j.dx, dy: j.dy });
          }
        },
        gameOver: (r) => {
          setResult(r);
          setPhase('over');
        },
      }
    );
    engineRef.current = engine;
    setPhase('playing');
    // Let the canvas mount before starting.
    requestAnimationFrame(() => engine.start());
  }, [mapKey, mode, diffKey, reduced, destroyEngine, joy.active]);

  const exitToMenu = useCallback(() => {
    fx.menuClose();
    destroyEngine();
    setPhase('menu');
    setHud(null);
  }, [destroyEngine]);

  const toggleMute = useCallback(() => {
    const m = engineRef.current?.toggleMute();
    setMuted(!!m);
  }, []);

  const dmgDeg = dmgDir ? 180 - (dmgDir.rel * 180) / Math.PI : 0;

  return (
    <div className="fixed inset-0 overflow-hidden bg-black select-none text-neutral-100">
      {/* ARES interior art: page backdrop behind menus/HUD (never over gameplay) */}
      <AresBackdrop src="/images/enyo/enyo-bg.webp" strength={0.35} />
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full block" style={{ touchAction: 'none' }} />

      {/* ================= MENU ================= */}
      {phase === 'menu' && (
        <div className="absolute inset-0 overflow-y-auto bg-gradient-to-b from-[#0b0e1a] via-[#101424] to-black/95">
          {/* ARES interior art behind the menu */}
          <img
            src="/images/enyo/enyo-bg.webp"
            alt=""
            aria-hidden="true"
            draggable={false}
            className="pointer-events-none absolute inset-0 h-full min-h-[100dvh] w-full object-cover opacity-40"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 min-h-[100dvh]"
            style={{ background: 'linear-gradient(180deg, rgba(4,6,12,0.45) 0%, rgba(4,6,12,0.9) 100%)' }}
          />
          <div className="relative max-w-3xl mx-auto px-5 pt-10">
            <div className="text-[11px] tracking-[0.4em] uppercase text-red-400/90">Goddess of war</div>
            <h1 className="text-5xl font-black tracking-widest mt-1">ARENA SHOOTER</h1>
            <p className="text-neutral-400 mt-2 text-sm max-w-xl">
              Arena shooter against AI combatants who shoot back — wound one and it
              turns on you. Pick an arena and a way to fight, then deploy.
              Everything here is generated live — no downloads, no accounts.
            </p>

            <h2 className="text-xs tracking-[0.3em] uppercase text-neutral-400 mt-8 mb-3">Arena</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {MAPS.map((m) => (
                <button
                  key={m.key}
                  onClick={() => setMapKey(m.key)}
                  className={`text-left p-4 rounded-[10px] border transition-colors ${
                    mapKey === m.key ? 'border-amber-400/80 bg-amber-400/10' : 'border-white/15 bg-white/5 hover:bg-white/10'
                  }`}
                >
                  <div
                    className="h-14 rounded-lg mb-3 relative"
                    style={{ background: `linear-gradient(135deg, #${m.sky.toString(16).padStart(6, '0')}, #${m.fog.toString(16).padStart(6, '0')})` }}
                  >
                    {mapKey === m.key && (
                      <span className="absolute top-1.5 right-1.5 rounded-full bg-black/60 p-1" style={{ color: ARES.goldSoft }}>
                        <AresIcon name="check" className="h-3.5 w-3.5" />
                      </span>
                    )}
                  </div>
                  <div className="font-bold">{m.name}</div>
                  <div className="text-[11px] text-neutral-400 mt-1">{m.desc}</div>
                </button>
              ))}
            </div>

            <h2 className="text-xs tracking-[0.3em] uppercase text-neutral-400 mt-8 mb-3">Battle type</h2>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setMode('tdm')}
                className={`p-4 rounded-[10px] border text-left transition-colors ${
                  mode === 'tdm' ? 'border-amber-400/80 bg-amber-400/10' : 'border-white/15 bg-white/5 hover:bg-white/10'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="font-bold flex items-center gap-2">
                    <AresIcon name="users" className="h-4 w-4" style={{ color: ARES.goldSoft }} />
                    Team battle
                  </div>
                  {mode === 'tdm' && <AresIcon name="check" className="h-4 w-4 shrink-0" style={{ color: ARES.goldSoft }} />}
                </div>
                <div className="text-[11px] text-neutral-400 mt-1">You + 2 allies vs 3 enemies. First team to 30 wins.</div>
              </button>
              <button
                onClick={() => setMode('ffa')}
                className={`p-4 rounded-[10px] border text-left transition-colors ${
                  mode === 'ffa' ? 'border-amber-400/80 bg-amber-400/10' : 'border-white/15 bg-white/5 hover:bg-white/10'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="font-bold flex items-center gap-2">
                    <AresIcon name="crosshair" className="h-4 w-4" style={{ color: ARES.goldSoft }} />
                    Free for all
                  </div>
                  {mode === 'ffa' && <AresIcon name="check" className="h-4 w-4 shrink-0" style={{ color: ARES.goldSoft }} />}
                </div>
                <div className="text-[11px] text-neutral-400 mt-1">You vs 5 rivals. First to 20 kills wins.</div>
              </button>
            </div>

            <h2 className="text-xs tracking-[0.3em] uppercase text-neutral-400 mt-8 mb-3">Bot skill</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {SKILL_KEYS.map((k) => {
                const sk = skillByKey(k);
                return (
                  <button
                    key={k}
                    onClick={() => setDiffKey(k)}
                    className={`text-left p-4 rounded-[10px] border transition-colors ${
                      diffKey === k ? 'border-amber-400/80 bg-amber-400/10' : 'border-white/15 bg-white/5 hover:bg-white/10'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-bold flex items-center gap-2">
                        <AresIcon name="flame" className="h-4 w-4" style={{ color: ARES.goldSoft }} />
                        {sk.name}
                      </div>
                      {diffKey === k && <AresIcon name="check" className="h-4 w-4 shrink-0" style={{ color: ARES.goldSoft }} />}
                    </div>
                    <div className="text-[11px] text-neutral-400 mt-1">{sk.desc}</div>
                  </button>
                );
              })}
            </div>

            <h2 className="text-xs tracking-[0.3em] uppercase text-neutral-400 mt-8 mb-3">Arsenal</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {WEAPON_KEYS.map((k) => (
                <div key={k} className="pointer-events-none opacity-90">
                  <WeaponCard w={{ ...weaponByKey(k), key: k }} selected={false} onPick={() => {}} />
                </div>
              ))}
            </div>
            <p className="text-[11px] text-neutral-500 mt-2">You carry all three — swap mid-fight with 1 / 2 / 3.</p>

            <h2 className="text-xs tracking-[0.3em] uppercase text-neutral-400 mt-8 mb-3">Controls</h2>
            <div className="text-[12px] text-neutral-400 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1">
              <div><span className="text-neutral-200 font-bold">Mouse</span> — look (click the arena to lock)</div>
              <div><span className="text-neutral-200 font-bold">WASD</span> — move · <span className="text-neutral-200 font-bold">Shift</span> — sprint</div>
              <div><span className="text-neutral-200 font-bold">Click</span> — fire · <span className="text-neutral-200 font-bold">R</span> — reload</div>
              <div><span className="text-neutral-200 font-bold">Space</span> — jump · <span className="text-neutral-200 font-bold">1/2/3</span> — swap weapon</div>
              <div><span className="text-neutral-200 font-bold">Touch</span> — left stick moves, drag right side to look, FIRE button shoots</div>
              <div className="sm:col-span-2"><span className="text-neutral-200 font-bold">Esc</span> — pause (your backpack sits on the pause screen)</div>
            </div>

            <AresButton icon="rocket" tone="crimson" onClick={deploy} className="mt-10 w-full text-lg">
              DEPLOY
            </AresButton>
            <div className="mt-3 flex justify-center">
              <BackpackHud
                realm="enyo" docked
                realmLabel="Enyo"
                displayNote="The pack rides along — Enyo keeps its own arsenal."
              />
            </div>
            <p className="text-center text-[11px] text-neutral-600 mt-3 tracking-wider">
              Bots are procedural combatants — armored figures, not people.
            </p>
            <div aria-hidden="true" className="player-clear" />
          </div>
        </div>
      )}

      {/* ================= HUD ================= */}
      {(phase === 'playing' || phase === 'over') && hud && (
        <>
          {/* reticle */}
          {phase === 'playing' && !paused && (
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
              <div className="w-[44px] h-[44px] relative" style={{ filter: 'drop-shadow(0 0 6px rgba(255,200,90,0.9))' }}>
                <div className="absolute rounded-full" style={{ inset: 6, border: '2px solid rgba(255,210,120,0.9)' }} />
                <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[4px] h-[4px] rounded-full" style={{ background: '#ffd878' }} />
                <div className="absolute left-1/2 top-0 -translate-x-1/2 w-[2px] h-[9px]" style={{ background: 'rgba(255,210,120,0.9)' }} />
                <div className="absolute left-1/2 bottom-0 -translate-x-1/2 w-[2px] h-[9px]" style={{ background: 'rgba(255,210,120,0.9)' }} />
                <div className="absolute top-1/2 left-0 -translate-y-1/2 h-[2px] w-[9px]" style={{ background: 'rgba(255,210,120,0.9)' }} />
                <div className="absolute top-1/2 right-0 -translate-y-1/2 h-[2px] w-[9px]" style={{ background: 'rgba(255,210,120,0.9)' }} />
              </div>
              {/* hitmarker */}
              {hitmark && (
                <div key={hitmark.n} className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
                  <div className={`text-2xl font-black ${hitmark.killed ? 'text-red-500' : 'text-white'}`}>✕</div>
                </div>
              )}
            </div>
          )}

          {/* damage direction indicator */}
          {dmgDir && phase === 'playing' && (
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
              <div className="w-[120px] h-[120px] relative" style={{ transform: `rotate(${dmgDeg}deg)` }}>
                <div className="absolute left-1/2 top-0 -translate-x-1/2 w-10 h-3 rounded-full bg-red-500/80 blur-[1px]" />
              </div>
            </div>
          )}

          {/* low-health vignette */}
          {hud.hp <= 35 && hud.alive && !reduced && (
            <div
              className="absolute inset-0 pointer-events-none"
              style={{ background: 'radial-gradient(ellipse at center, transparent 55%, rgba(220,38,38,0.45) 100%)' }}
            />
          )}

          {/* top bar: score + timer */}
          <div className="absolute left-0 right-0 flex justify-center pt-3 pointer-events-none" style={{ top: 'calc(env(safe-area-inset-top, 0px) + 54px)' }}>
            <div className="flex items-center gap-4 px-5 py-2 rounded-full bg-black/55 backdrop-blur-sm border border-white/10">
              {hud.mode === 'tdm' ? (
                <>
                  <span className="text-blue-400 font-black text-lg">{hud.blueScore}</span>
                  <span className="text-[10px] tracking-[0.25em] text-neutral-400 uppercase">You</span>
                  <span className="text-neutral-200 font-bold tabular-nums">{fmtTime(hud.timeLeft)}</span>
                  <span className="text-[10px] tracking-[0.25em] text-neutral-400 uppercase">Enemy</span>
                  <span className="text-red-400 font-black text-lg">{hud.redScore}</span>
                </>
              ) : (
                <>
                  <span className="text-[10px] tracking-[0.25em] text-neutral-400 uppercase">Kills</span>
                  <span className="text-amber-400 font-black text-lg tabular-nums">
                    {hud.kills}/{hud.target}
                  </span>
                  <span className="text-neutral-200 font-bold tabular-nums">{fmtTime(hud.timeLeft)}</span>
                </>
              )}
            </div>
          </div>

          {/* kill feed */}
          <div className="absolute right-3 flex flex-col items-end gap-1 pointer-events-none max-w-[46vw]" style={{ top: 'calc(env(safe-area-inset-top, 0px) + 60px)' }}>
            {feed.map((f) => (
              <div key={f.id} className="text-[11px] px-2.5 py-1 rounded-lg bg-black/55 border border-white/10 text-neutral-300">
                {f.msg}
              </div>
            ))}
          </div>

          {/* health */}
          <div className="absolute left-4 bottom-[max(1.25rem,env(safe-area-inset-bottom))] pointer-events-none">
            <div className="text-[10px] tracking-[0.3em] uppercase text-neutral-400 mb-1">Health</div>
            <div className="w-44 sm:w-56 h-3 rounded-lg bg-white/10 overflow-hidden">
              <div
                className={`h-full rounded-lg transition-all ${hud.hp > 50 ? 'bg-emerald-400' : hud.hp > 25 ? 'bg-amber-400' : 'bg-red-500'}`}
                style={{ width: `${Math.max(0, hud.hp)}%` }}
              />
            </div>
            <div className="text-[11px] text-neutral-400 mt-1 tabular-nums">
              K {hud.kills} · D {hud.deaths}
            </div>
            {hud.protected && (
              <div className="text-[10px] tracking-widest uppercase text-sky-300 mt-1">Spawn shield</div>
            )}
          </div>

          {/* ammo + weapons */}
          <div className="absolute right-4 bottom-[max(1.25rem,env(safe-area-inset-bottom))] text-right pointer-events-none">
            <div className="text-[10px] tracking-[0.3em] uppercase text-neutral-400">{hud.weaponName}</div>
            <div className="text-3xl font-black tabular-nums">
              {hud.reloading ? <span className="text-amber-400 text-xl">RELOADING</span> : (
                <>
                  <span className={hud.mag === 0 ? 'text-red-400' : 'text-white'}>{hud.mag}</span>
                  <span className="text-neutral-500 text-xl"> / {hud.reserve}</span>
                </>
              )}
            </div>
            {hud.lowAmmo && (
              <div className="text-[11px] text-amber-400 font-bold mt-1">
                {isTouch ? 'LOW AMMO — TAP RELOAD' : 'LOW AMMO — PRESS R'}
              </div>
            )}
            <div className="flex gap-1.5 justify-end mt-1.5">
              {WEAPON_KEYS.map((k, i) => (
                <div
                  key={k}
                  className={`px-2 py-1 rounded-lg text-[10px] font-bold border ${
                    hud.weaponKey === k ? 'border-amber-400/80 text-amber-300 bg-amber-400/10' : 'border-white/15 text-neutral-500'
                  }`}
                >
                  {i + 1}
                </div>
              ))}
            </div>
          </div>

          {/* mute + backpack: the pack rides along — Enyo keeps its own arsenal */}
          <div className="absolute top-3 left-3 flex items-start gap-2">
            <button
              onClick={toggleMute}
              className="px-3 py-2 rounded-lg bg-black/55 border border-white/10 text-[11px] tracking-widest uppercase text-neutral-300 inline-flex items-center gap-2"
              aria-label={muted ? 'Unmute sound' : 'Mute sound'}
            >
              <AresIcon name={muted ? 'mute' : 'sound'} className="h-3.5 w-3.5" />
              {muted ? 'Muted' : 'Sound on'}
            </button>
            <BackpackHud
              realm="enyo" docked
              realmLabel="Enyo"
              displayNote="The pack rides along — Enyo keeps its own arsenal."
            />
          </div>

          {/* respawn overlay */}
          {!hud.alive && phase === 'playing' && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none bg-black/40">
              <div className="text-center">
                <div className="text-red-500 font-black text-3xl tracking-widest">TAKEN DOWN</div>
                <div className="text-neutral-300 mt-2">Back in {hud.respawnIn}…</div>
              </div>
            </div>
          )}

          {/* mobile controls */}
          {isTouch && phase === 'playing' && !paused && (
            <>
              {/* joystick visual */}
              <div className="absolute left-6 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] w-28 h-28 rounded-full border-2 border-white/25 bg-white/5 pointer-events-none">
                <div
                  className="absolute w-12 h-12 rounded-full bg-white/30 left-1/2 top-1/2"
                  style={{
                    transform: `translate(calc(-50% + ${joy.dx * 32}px), calc(-50% + ${joy.dy * 32}px))`,
                  }}
                />
              </div>
              <div className="absolute right-5 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] flex flex-col items-end gap-3">
                <button
                  className="w-20 h-20 rounded-full bg-red-600/80 border-2 border-red-400/60 text-white font-black text-sm active:bg-red-500"
                  onTouchStart={(e) => { e.preventDefault(); engineRef.current?.setFiring(true); }}
                  onTouchEnd={(e) => { e.preventDefault(); engineRef.current?.setFiring(false); }}
                  aria-label="Fire"
                >
                  FIRE
                </button>
                <div className="flex gap-2">
                  <button
                    className="w-14 h-14 rounded-full bg-white/10 border border-white/30 text-[10px] font-bold"
                    onTouchStart={(e) => { e.preventDefault(); engineRef.current?.jump(); }}
                    aria-label="Jump"
                  >
                    JUMP
                  </button>
                  <button
                    className="w-14 h-14 rounded-full bg-white/10 border border-white/30 text-[10px] font-bold"
                    onTouchStart={(e) => { e.preventDefault(); engineRef.current?.reload(); }}
                    aria-label="Reload"
                  >
                    RELOAD
                  </button>
                  <button
                    className="w-14 h-14 rounded-full bg-white/10 border border-white/30 text-[10px] font-bold"
                    onTouchStart={(e) => { e.preventDefault(); engineRef.current?.cycleWeapon(); }}
                    aria-label="Swap weapon"
                  >
                    SWAP
                  </button>
                </div>
              </div>
            </>
          )}
        </>
      )}

      {/* ================= PAUSED ================= */}
      {phase === 'playing' && paused && (
        <div
          className="absolute inset-0 bg-black/70 flex items-center justify-center"
          onClick={() => engineRef.current?.resume()}
        >
          <div className="text-center">
            <div className="mx-auto mb-3 flex justify-center" style={{ color: ARES.goldSoft }}>
              <AresIcon name="play" className="h-10 w-10" />
            </div>
            <div className="text-2xl font-black tracking-widest">PAUSED</div>
            <div className="text-neutral-400 mt-2 text-sm">Click to jump back in</div>
            {/* Backpack on the pause screen: opening it must not resume,
                so its clicks stop here instead of bubbling to the overlay. */}
            <div className="mt-5 flex justify-center" onClick={(e) => e.stopPropagation()}>
              <BackpackHud
                realm="enyo" docked
                realmLabel="Enyo"
                displayNote="The pack rides along — Enyo keeps its own arsenal."
              />
            </div>
          </div>
        </div>
      )}

      {/* ================= GAME OVER ================= */}
      {phase === 'over' && result && (
        <div className="absolute inset-0 bg-black/80 flex items-center justify-center p-5 overflow-y-auto overflow-hidden">
          <img
            src="/images/enyo/enyo-bg.webp"
            alt=""
            aria-hidden="true"
            draggable={false}
            className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-35"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
            style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.9) 100%)' }}
          />
          <AresPanel className="relative max-w-md w-full p-8 text-center my-8">
            <div className="mx-auto mb-4 flex justify-center" style={{ color: result.won ? ARES.goldSoft : '#f87171' }}>
              <AresIcon name={result.won ? 'trophy' : 'skull'} className="h-12 w-12" />
            </div>
            <div className={`text-5xl font-black tracking-widest ${result.won ? 'text-amber-400' : 'text-red-500'}`}>
              {result.won ? 'VICTORY' : 'DEFEAT'}
            </div>
            <div className="text-neutral-400 mt-2">{result.reason}</div>
            {result.mode === 'tdm' && (
              <div className="mt-4 text-xl font-bold tabular-nums">
                <span className="text-blue-400">{result.blueScore}</span>
                <span className="text-neutral-500 mx-2">—</span>
                <span className="text-red-400">{result.redScore}</span>
              </div>
            )}
            <div className="grid grid-cols-3 gap-3 mt-6">
              <div className="p-3 rounded-lg bg-white/5 border border-white/10">
                <div className="text-2xl font-black tabular-nums">{result.kills}</div>
                <div className="text-[10px] tracking-widest uppercase text-neutral-500">Kills</div>
              </div>
              <div className="p-3 rounded-lg bg-white/5 border border-white/10">
                <div className="text-2xl font-black tabular-nums">{result.deaths}</div>
                <div className="text-[10px] tracking-widest uppercase text-neutral-500">Deaths</div>
              </div>
              <div className="p-3 rounded-lg bg-white/5 border border-white/10">
                <div className="text-2xl font-black tabular-nums">{result.accuracy}%</div>
                <div className="text-[10px] tracking-widest uppercase text-neutral-500">Accuracy</div>
              </div>
            </div>
            <AresButton icon="rotate" tone="gold" onClick={deploy} className="mt-8 w-full">
              PLAY AGAIN
            </AresButton>
            <AresButton icon="grid" tone="ghost" onClick={exitToMenu} className="mt-3 w-full">
              CHANGE ARENA
            </AresButton>
          </AresPanel>
        </div>
      )}
    </div>
  );
}
