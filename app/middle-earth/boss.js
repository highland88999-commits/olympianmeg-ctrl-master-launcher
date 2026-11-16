/*
 * MIDDLE-EARTH — SARUMAN, the campaign finale.
 *
 * Merlin's order ends the hunt here: "kill Saruman". He stands at
 * the foot of Orthanc in the Isengard vale (Rohan pod, south-west
 * edge — Orthanc at (-215, 175), the boss arena on its court).
 *
 * DESIGN CALL — why Isengard lives inside Rohan's pod rather than
 * a seventh boss pod: Saruman's theatre IS Rohan (the vale watches
 * the plains he is burning), one pod less to load and roam, and the
 * player can walk up to the white figure long before they may
 * fight him — the gate reads on approach, which a separate locked
 * pod could never show. The engine cost of a seventh pod bought
 * nothing the vale doesn't already give.
 *
 * THE GATE: the encounter stays DORMANT until the campaign total
 * reaches SARUMAN_GATE_KILLS (data.js — 30 orc kills, an evening's
 * hunt across the pods). Dormant Saruman is a labelled figure, not
 * a target: blade and bow pass over him (the page checks state).
 * Once the gate is met, approaching within 26 m wakes him.
 *
 * THE FIGHT (pure state machine, scene renders it):
 *   HP 600. Staff blasts are TELEGRAPHED — a circle blooms at the
 *   player's feet (position snapshotted at cast), 1.1 s to move,
 *   then the burst: 22 damage inside 3.2 m.
 *   Phase 1 (>66%): a blast every 3.2 s.
 *   Phase 2 (33-66%): every 2.4 s, and the VOICE — within 14 m the
 *   player's stride slows to 0.55 (that voice, working on the legs).
 *   Phase 3 (<33%): every 1.8 s, twin blasts, the Voice widens to 18 m.
 * Death completes the campaign (campaign.js): a completion record
 * and a named staff into the backpack.
 */
import { attachFigureModel } from './characters.js';
import { recordSoulArrival } from '../../lib/land-of-the-dead/souls.js';

export const BOSS_POS = { x: -207, z: 168 }; // Orthanc court, before the tower
export const BOSS_MAX_HP = 600;
export const BOSS_WAKE_DIST = 26;
export const BLAST = { dmg: 22, radius: 3.2, telegraph: 1.1 };

export function bossPhase(hp) {
  if (hp <= 0) return 0;
  const f = hp / BOSS_MAX_HP;
  return f > 0.66 ? 1 : f > 0.33 ? 2 : 3;
}

const PHASE_CAST = { 1: 3.2, 2: 2.4, 3: 1.8 };
const PHASE_AURA = { 1: 0, 2: 14, 3: 18 };

export function createSaruman(x, z, gateOpen) {
  return {
    isBoss: true,
    x: x != null ? x : BOSS_POS.x,
    z: z != null ? z : BOSS_POS.z,
    yaw: 0.78 + Math.PI, // faces out of the vale, toward the plains
    hp: BOSS_MAX_HP, maxHp: BOSS_MAX_HP,
    state: gateOpen ? 'ready' : 'dormant', // dormant | ready | combat | dead
    stats: { scale: 1.1 },
    castT: 1.2,
    pending: [], // telegraphed blasts: { x, z, t }
    flashT: 0, deathT: 0,
  };
}

/* The Voice of Saruman: stride factor for a player at dist. */
export function bossSlowFactor(boss, dist) {
  if (!boss || boss.state !== 'combat') return 1;
  const aura = PHASE_AURA[bossPhase(boss.hp)] || 0;
  return aura > 0 && dist <= aura ? 0.55 : 1;
}

/**
 * Advance the boss. player = { x, z, alive }.
 * Events: {type:'telegraph', x, z, r} | {type:'burst', x, z, r} |
 * {type:'hitPlayer', dmg} | {type:'phase', phase} | {type:'died'}.
 */
export function stepBoss(boss, dt, player) {
  const events = [];
  if (boss.state === 'dead') { boss.deathT += dt; return events; }
  if (boss.flashT > 0) boss.flashT -= dt;
  const dist = Math.hypot(player.x - boss.x, player.z - boss.z);
  if (boss.state === 'ready' && player.alive && dist <= BOSS_WAKE_DIST) {
    boss.state = 'combat';
    boss.castT = 1.2;
    events.push({ type: 'woke' });
  }
  if (boss.state !== 'combat') return events;
  boss.yaw = Math.atan2(player.x - boss.x, player.z - boss.z);

  const phase = bossPhase(boss.hp);
  boss.castT -= dt;
  if (boss.castT <= 0 && player.alive) {
    boss.castT = PHASE_CAST[phase];
    boss.pending.push({ x: player.x, z: player.z, t: BLAST.telegraph });
    events.push({ type: 'telegraph', x: player.x, z: player.z, r: BLAST.radius });
    if (phase === 3) {
      // the twin blast lands on the player's flank
      boss.pending.push({ x: player.x + 3.4, z: player.z + 1.2, t: BLAST.telegraph + 0.25 });
      events.push({ type: 'telegraph', x: player.x + 3.4, z: player.z + 1.2, r: BLAST.radius });
    }
  }
  for (let i = boss.pending.length - 1; i >= 0; i--) {
    const p = boss.pending[i];
    p.t -= dt;
    if (p.t > 0) continue;
    boss.pending.splice(i, 1);
    events.push({ type: 'burst', x: p.x, z: p.z, r: BLAST.radius });
    if (player.alive && Math.hypot(player.x - p.x, player.z - p.z) <= BLAST.radius) {
      events.push({ type: 'hitPlayer', dmg: BLAST.dmg });
    }
  }
  return events;
}

/** Damage the boss (blade/bow route here from the page). */
export function damageBoss(boss, dmg) {
  if (!boss || boss.state !== 'combat') return [];
  const before = bossPhase(boss.hp);
  boss.hp -= dmg;
  boss.flashT = 0.18;
  const events = [];
  if (boss.hp <= 0) {
    boss.hp = 0;
    boss.state = 'dead';
    boss.deathT = 0;
    boss.pending = [];
    // The Land of the Dead (Merlin, Nov 16 ~04:17): Saruman's fall
    // arrives there too — additive only, the campaign completion
    // the page drives off the 'died' event is untouched.
    recordSoulArrival({ kind: 'boss', name: 'Saruman', origin: 'middle-earth', diedAt: Date.now() });
    events.push({ type: 'died' });
    return events;
  }
  const after = bossPhase(boss.hp);
  if (after !== before) events.push({ type: 'phase', phase: after });
  return events;
}

/* ---------------- scene layer ----------------
 * A tall white figure: floor-length robe, white hair and beard,
 * a black staff crowned with a cold light. The foundry's
 * white-wizard file is his true model — when it lands at the
 * registry path the procedural figure yields to it. */

export function buildSarumanFigure(R) {
  const g = new R.Group();
  g.name = 'saruman';
  const body = new R.Group();
  g.add(body);
  const robe = new R.MeshStandardMaterial({ color: 0xe9e6da, flatShading: true, roughness: 0.9 });
  const pale = new R.MeshStandardMaterial({ color: 0xd9c9a8, flatShading: true, roughness: 1 });
  const black = new R.MeshStandardMaterial({ color: 0x1c1c20, flatShading: true, roughness: 0.6, metalness: 0.3 });

  const skirt = new R.Mesh(new R.CylinderGeometry(0.42, 0.78, 1.5, 10), robe);
  skirt.position.y = 0.75;
  body.add(skirt);
  const torso = new R.Mesh(new R.CylinderGeometry(0.34, 0.44, 0.62, 10), robe);
  torso.position.y = 1.8;
  body.add(torso);
  const head = new R.Mesh(new R.SphereGeometry(0.21, 10, 8), pale);
  head.position.y = 2.32;
  body.add(head);
  const hair = new R.Mesh(new R.CylinderGeometry(0.23, 0.3, 0.5, 8), robe);
  hair.position.y = 2.28;
  body.add(hair);
  const beard = new R.Mesh(new R.BoxGeometry(0.2, 0.52, 0.1), robe);
  beard.position.set(0, 1.98, 0.16);
  body.add(beard);
  for (const side of [-1, 1]) {
    const arm = new R.Mesh(new R.CylinderGeometry(0.07, 0.09, 0.78, 6), robe);
    arm.position.set(side * 0.44, 1.72, 0.02);
    arm.rotation.z = side * 0.18;
    body.add(arm);
  }
  /* the staff, in his right hand: black shaft, cold crown */
  const staff = new R.Group();
  staff.position.set(-0.5, 0, 0.14);
  const shaft = new R.Mesh(new R.CylinderGeometry(0.035, 0.035, 2.6, 6), black);
  shaft.position.y = 1.3;
  staff.add(shaft);
  const crown = new R.Mesh(new R.OctahedronGeometry(0.13),
    new R.MeshStandardMaterial({ color: 0xbfd8ff, emissive: 0x8fb8ff, emissiveIntensity: 1.6, flatShading: true }));
  crown.position.y = 2.68;
  crown.userData.pulse = true;
  staff.add(crown);
  body.add(staff);

  const shadow = new R.Mesh(
    new R.CircleGeometry(0.7, 20),
    new R.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.32, depthWrite: false })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.03;
  g.add(shadow);

  g.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });

  const slot = new R.Group();
  slot.name = 'saruman-model-slot';
  body.add(slot);
  attachFigureModel(R, slot, 'white-wizard', 1.95, () => { body.children.forEach((c) => { if (c !== slot) c.visible = false; }); });

  function update(t, dt, boss) {
    if (boss.state === 'dead') {
      const k = Math.min(1, boss.deathT / 0.9);
      g.rotation.x = -k * (Math.PI / 2) * 0.9;
      if (boss.deathT > 1.8) {
        const fade = Math.max(0, 1 - (boss.deathT - 1.8) / 1.2);
        g.traverse((o) => { if (o.isMesh && o.material) { o.material.transparent = fade < 1; o.material.opacity = fade; } });
      }
      return;
    }
    body.position.y = Math.sin(t * 0.9) * 0.012;
    if (boss.flashT > 0) {
      const f = Math.min(1, boss.flashT / 0.18);
      robe.emissive.setRGB(0.4 * f, 0.1 * f, 0.1 * f);
    } else {
      robe.emissive.setRGB(0, 0, 0);
    }
    if (boss.state === 'combat') staff.rotation.x = Math.sin(t * 2.4) * 0.06;
  }
  return { group: g, update };
}
