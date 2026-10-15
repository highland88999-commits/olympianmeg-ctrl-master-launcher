// KOMBAT ARENA — BRAWL MODE engine.
// True-3D free-for-all: 2/4/8/16 fighters move freely on a ground plane
// inside the themed arenas. Every fighter for themselves — the player
// attacks whoever they want (attacks snap-face the nearest enemy in range).
// Best-of 3/5/7 rounds, 75s timer, difficulty-scaled AI with no input
// reading and no gang-up bias (each CPU targets its NEAREST opponent).
//
// Pure brawl rules live in lib/kombat/brawl-rules.js (headless-testable);
// this file owns three.js, animation, AI and round flow.

import * as THREE from 'three';
import { buildFighterRig, poseRig, updateEffects } from '../../lib/kombat/rig.js';
import { getFighter } from '../../lib/kombat/roster.js';
import { VISUALS } from '../../lib/kombat/visuals.js';
import { attachGlbFighter } from '../../lib/kombat/glb-fighter.js';
import { watchContextLoss } from '../../lib/webgl-support.js';
import {
  classifyKit, chooseSpecial, specialUsable, healAmountFor,
  statusDamageMul, statusSpeedMul, KIND_FX, BUFF_SECONDS, DEBUFF_SECONDS,
} from '../../lib/kombat/specials.js';
import { resolvePose } from '../../lib/kombat/pose-state.js';
import { applyFloorClamp, stepVertical, solveFloorY } from '../../lib/kombat/floor.js';
import { brawlFraming } from '../../lib/kombat/framing.js';
import { buildBrawlArena, clampToArena, brawlSpawns, createBrawlCamera } from './arena3d.js';
import {
  MAX_HEALTH, COMBO_WINDOW, BLOCK_REDUCTION, FINISH_HIM_SECONDS,
  DIFFICULTY, ATTACKS, SPECIAL_STARTUP, SPECIAL_ACTIVE, SPECIAL_RECOVERY,
  SPECIAL_RANGE_BONUS, WARD_SECONDS, COMBO_MULT, INPUT_BUFFER_SECONDS,
  calcDamage, calcBlockedDamage, walkSpeed,
  buildSpecialKit, specialIndexForAction, pickReadySpecial, cooldownFraction,
} from '../../lib/kombat/rules.js';
import {
  BRAWL_ROUND_TIME, BRAWL_MIN_SEPARATION, MULTI_KO_WINDOW,
  brawlWinsNeeded, brawlRoundWinner, multiKoLabel, pickFinishHimVictim,
} from '../../lib/kombat/brawl-rules.js';

const ACTIONABLE = new Set(['idle', 'walk']);
const _floorBox = new THREE.Box3(); // shared floor-law measure

// jump tuning: apex ~1.2 units, airtime ~0.65s — snappy on a phone
const JUMP_V = 7.2;
const GRAVITY = 22;

// ------------------------------------------------------------------
// tiny WebAudio bleeps (no audio files); context resumes on user gesture
// ------------------------------------------------------------------
let audioCtx = null;
function ac() {
  if (!audioCtx) {
    try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return null; }
  }
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}
function blip(freq, dur = 0.08, type = 'square', vol = 0.12, slideTo = null) {
  const ctx = ac();
  if (!ctx) return;
  try {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, ctx.currentTime);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + dur);
    g.gain.setValueAtTime(vol, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + dur + 0.02);
  } catch { /* audio is decoration */ }
}
const sfx = {
  hit: () => blip(150, 0.09, 'square', 0.14, 90),
  heavy: () => blip(95, 0.16, 'sawtooth', 0.16, 55),
  block: () => blip(240, 0.06, 'triangle', 0.1),
  whiff: () => blip(600, 0.05, 'sine', 0.05, 300),
  special: () => blip(300, 0.25, 'sawtooth', 0.12, 900),
  announce: () => { blip(520, 0.12, 'square', 0.1); setTimeout(() => blip(780, 0.18, 'square', 0.1), 130); },
  ko: () => blip(220, 0.5, 'sawtooth', 0.14, 50),
  fatality: () => { blip(70, 0.6, 'sawtooth', 0.18, 40); setTimeout(() => blip(140, 0.4, 'square', 0.1, 60), 200); },
};

// ------------------------------------------------------------------
// particle bursts (shared pool — 16 fighters must stay mobile-safe)
// ------------------------------------------------------------------
function makeBurstPool(scene, max = 8) {
  const pool = [];
  function spawn(pos, color, count = 26, speed = 4.5, life = 0.6, size = 0.14, up = 2) {
    let b = pool.find((x) => !x.alive);
    if (!b) {
      if (pool.length >= max) return;
      const geo = new THREE.BufferGeometry();
      const p = new Float32Array(64 * 3);
      geo.setAttribute('position', new THREE.BufferAttribute(p, 3));
      const mat = new THREE.PointsMaterial({ size, transparent: true, opacity: 1, depthWrite: false });
      const points = new THREE.Points(geo, mat);
      points.frustumCulled = false;
      scene.add(points);
      b = { points, geo, mat, vel: new Float32Array(64 * 3), alive: false, t: 0, life: 1, n: 0 };
      pool.push(b);
    }
    const n = Math.min(count, 64);
    const arr = b.geo.attributes.position.array;
    for (let i = 0; i < n; i++) {
      arr[i * 3] = pos.x; arr[i * 3 + 1] = pos.y; arr[i * 3 + 2] = pos.z;
      const a = Math.random() * Math.PI * 2;
      const r = speed * (0.4 + Math.random() * 0.8);
      b.vel[i * 3] = Math.cos(a) * r;
      b.vel[i * 3 + 1] = Math.random() * up + 1;
      b.vel[i * 3 + 2] = Math.sin(a) * r * 0.6;
    }
    b.n = n; b.t = 0; b.life = life; b.alive = true;
    b.mat.color.set(color);
    b.mat.opacity = 1;
    b.geo.attributes.position.needsUpdate = true;
    b.geo.setDrawRange(0, n);
  }
  function update(dt) {
    for (const b of pool) {
      if (!b.alive) continue;
      b.t += dt;
      const k = b.t / b.life;
      if (k >= 1) { b.alive = false; b.points.visible = false; continue; }
      b.points.visible = true;
      const arr = b.geo.attributes.position.array;
      for (let i = 0; i < b.n; i++) {
        arr[i * 3] += b.vel[i * 3] * dt;
        arr[i * 3 + 1] += b.vel[i * 3 + 1] * dt;
        arr[i * 3 + 2] += b.vel[i * 3 + 2] * dt;
        b.vel[i * 3 + 1] -= 7 * dt;
      }
      b.geo.attributes.position.needsUpdate = true;
      b.mat.opacity = 1 - k;
    }
  }
  function dispose() {
    for (const b of pool) {
      scene.remove(b.points);
      b.geo.dispose(); b.mat.dispose();
    }
    pool.length = 0;
  }
  return { spawn, update, dispose };
}

// ------------------------------------------------------------------
// fighter entity (3D)
// ------------------------------------------------------------------
function makeBrawlFighter(scene, fighterId, x, z, specialIdxs, isPlayer, diff) {
  const data = getFighter(fighterId);
  if (!data) throw new Error(`kombat: unknown fighter id "${fighterId}"`);
  const params = VISUALS[fighterId];
  if (!params) throw new Error(`kombat: missing VISUALS params for "${fighterId}"`);
  const rig = buildFighterRig(params);
  rig.position.set(x, 0, z);
  scene.add(rig);
  // STEP 5 — ALL SPECIALS LIVE: the full kit, always (see engine.js).
  void specialIdxs;
  const { specials, cooldowns } = buildSpecialKit(data);
  // STEP 6 — specials logic (kinds/bands) + GLB swap, as the duel.
  const specKinds = classifyKit(specials, fighterId);
  rig.updateMatrixWorld(true);
  const procBox = new THREE.Box3().setFromObject(rig);
  const procSize = procBox.getSize(new THREE.Vector3());
  const glb = attachGlbFighter({ kombatId: fighterId, procSize });
  if (glb) {
    rig.add(glb.group);
    glb.ready.then((ok) => {
      if (!ok) return;
      for (const child of rig.children) {
        if (child !== glb.group) child.visible = false;
      }
    });
  }
  return {
    data, rig, params, glb,
    id: fighterId,
    isPlayer,
    pos: new THREE.Vector3(x, 0, z),
    yaw: Math.atan2(-x, -z), // face the arena center
    vel: new THREE.Vector3(),
    y: 0, vy: 0, grounded: true, // jump state
    health: MAX_HEALTH, alive: true, rounds: 0,
    state: 'idle', stateT: 0, poseT: Math.random() * 10, walkT: Math.random() * 10,
    moveX: 0, moveZ: 0, blockHeld: false,
    dashT: 0, dashDir: new THREE.Vector3(1, 0, 0), dashCd: 0,
    attack: null,
    hitstunT: 0,
    wobble: false, // finish-him victim: dizzy sway
    specials, cooldowns, specKinds,
    wardT: 0, buffT: 0, debuffT: 0,
    chain: { count: 0, t: 0 },
    speed: walkSpeed(data.stats.speed, isPlayer ? 1 : (diff?.speedMul ?? 1)),
    ai: isPlayer ? null : {
      thinkT: 0.3 + Math.random() * 0.4,
      targetIdx: -1, blockUntil: 0,
      reactArmed: false, reactT: 0, reactFrom: null,
      strafeDir: Math.random() < 0.5 ? 1 : -1, strafeT: 0,
    },
  };
}

function setPoseState(f, state) {
  if (f.state === state) return;
  f.state = state;
  f.stateT = 0;
  f.poseT = 0;
}

const _fwd = new THREE.Vector3();
function forwardOf(f, out) {
  out = out || _fwd;
  out.set(Math.sin(f.yaw), 0, Math.cos(f.yaw));
  return out;
}

function faceTowards(f, x, z) {
  f.yaw = Math.atan2(x - f.pos.x, z - f.pos.z);
}

function distXZ(a, b) {
  const dx = a.pos.x - b.pos.x;
  const dz = a.pos.z - b.pos.z;
  return Math.hypot(dx, dz);
}

/** Nearest living opponent within maxRange (Infinity = any). */
function nearestEnemy(f, fighters, maxRange = Infinity) {
  let best = null, bestD = maxRange;
  for (const o of fighters) {
    if (o === f || !o.alive) continue;
    const d = distXZ(f, o);
    if (d < bestD) { bestD = d; best = o; }
  }
  return best;
}

// ------------------------------------------------------------------
// engine
// ------------------------------------------------------------------
export function createBrawlEngine(canvas, config) {
  const {
    playerId, cpuIds = [], difficulty = 'normal',
    playerSpecials = [0, 1], cpuSpecials = [],
    arena = 0, bestOf = 3, hooks = {},
  } = config;
  const diff = DIFFICULTY[difficulty] || DIFFICULTY.normal;
  const winsNeeded = brawlWinsNeeded(bestOf);
  const H = (name, ...args) => { try { hooks[name]?.(...args); } catch { /* hook errors stay out of the loop */ } };

  // renderer / scene / camera — pixel ratio capped for 16-fighter mobile safety
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));

  // CONTEXT-LOSS RESILIENCE (2026-10-14, duel parity — client_errors
  // id 75): freeze the simulation while the GL context is lost,
  // resume on restore, and past the grace window tell the page
  // (onContextLost) so it can offer a recoverable arena reload.
  let contextLost = false;
  let contextLostAt = 0;
  let contextLossReported = false;
  const unwatchContext = watchContextLoss(canvas, {
    onLost() {
      contextLost = true;
      contextLostAt = performance.now();
      contextLossReported = false;
    },
    onRestored() {
      contextLost = false;
      contextLossReported = false;
      H('onContextLost', false);
    },
  });
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 140);

  scene.add(new THREE.HemisphereLight(0xbfd0ff, 0x201510, 0.85));
  const key = new THREE.DirectionalLight(0xffffff, 1.1);
  key.position.set(4, 8, 6);
  scene.add(key);

  const stage = buildBrawlArena(arena);
  scene.add(stage.group);
  scene.fog = new THREE.Fog(stage.fog.color, stage.fog.near, stage.fog.far);
  scene.background = new THREE.Color(stage.bg);
  const brawlCam = createBrawlCamera(camera);

  const bursts = makeBurstPool(scene);

  // target indicator ring (shows who the player's attacks will hit)
  const targetRing = new THREE.Mesh(
    new THREE.RingGeometry(0.55, 0.72, 32),
    new THREE.MeshBasicMaterial({ color: 0xffb84d, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false })
  );
  targetRing.rotation.x = -Math.PI / 2;
  targetRing.position.y = 0.07;
  targetRing.visible = false;
  scene.add(targetRing);

  // fighters
  const fighters = [];
  const totalCount = 1 + cpuIds.length;
  const spawns = brawlSpawns(totalCount, arena);
  const player = makeBrawlFighter(scene, playerId, spawns[0].x, spawns[0].z, playerSpecials, true, diff);
  fighters.push(player);
  cpuIds.forEach((cid, i) => {
    const sIdx = cpuSpecials[i] || [0, 1];
    fighters.push(makeBrawlFighter(scene, cid, spawns[i + 1].x, spawns[i + 1].z, sIdx, false, diff));
  });

  // input (player)
  const input = { mx: 0, mz: 0, block: false };
  const pressed = [];
  // INPUT BUFFER: the latest player press that arrived while the
  // fighter was briefly non-actionable, held for INPUT_BUFFER_SECONDS
  // and executed at the first legal frame (see rules.js). One slot —
  // the newest intent replaces the oldest. Duel parity.
  let bufferedPress = null; // { action, at }

  // ROUND-1 MODEL GATE (2026-10-14, duel parity): hold the match
  // in a 'summoning' phase until EVERY fighter's GLB has settled
  // (loaded OR failed), capped at GLB_GATE_MS so a stalled network
  // can never hang the game; on timeout or failure the procedural
  // bodies fight on — the fallback law, unchanged.
  const GLB_GATE_MS = 6000;
  const glbHandles = fighters.map((f) => f.glb).filter(Boolean);
  let summoning = glbHandles.length > 0;
  let startRequested = false;
  let gateTimer = 0;

  // match flow
  let phase = summoning ? 'summoning' : 'intro'; // summoning | intro | fight | roundEnd | preFinish | finishHim | fatality | koEnd | done
  let phaseT = 0;
  let round = 1;
  let timeLeft = BRAWL_ROUND_TIME;
  let slowmoT = 0;
  let hitstopT = 0;
  let disposed = false;
  let lastHudSent = 0;
  let lastHudKey = '';
  let announcedFight = false;
  let koChain = { count: 0, t: 0 }; // multi-KO callout tracking
  let elapsed = 0;
  const _v1 = new THREE.Vector3();
  const _v2 = new THREE.Vector3();

  function aliveCount() {
    let n = 0;
    for (const f of fighters) if (f.alive) n += 1;
    return n;
  }

  function hudPayload() {
    const target = nearestEnemy(player, fighters, 4.5);
    return {
      hp: player.alive ? player.health / MAX_HEALTH : 0,
      alive: aliveCount(),
      total: fighters.length,
      time: Math.max(0, Math.ceil(timeLeft)),
      round, bestOf, winsNeeded,
      playerRounds: player.rounds,
      playerName: player.data.name,
      targetName: target ? target.data.name : '',
      eliminated: !player.alive,
      // per-special cooldown fractions for the Powers pad (all live)
      spcds: player.specials.map((s, i) => cooldownFraction(s, player.cooldowns[i])),
      sp1cd: cooldownFraction(player.specials[0], player.cooldowns[0]),
      sp2cd: cooldownFraction(player.specials[1], player.cooldowns[1]),
      phase,
    };
  }
  function sendHud(force = false) {
    const now = performance.now();
    const p = hudPayload();
    const k = `${p.hp}|${p.alive}|${p.time}|${p.round}|${p.playerRounds}|${p.phase}|${p.targetName}|${p.spcds.map((v) => v.toFixed(1)).join(',')}`;
    if (force || k !== lastHudKey || now - lastHudSent > 250) {
      lastHudKey = k; lastHudSent = now;
      H('onHud', p);
    }
  }

  function slowmo(dur) { slowmoT = Math.max(slowmoT, dur); }

  // ---------------- attacks ----------------
  /** Snap-face the nearest enemy in range, then start the attack. */
  function tryAttack(f, kind, snapRange) {
    if (phase !== 'fight') return false;
    if (!f.alive || !ACTIONABLE.has(f.state)) return false;
    if (f.hitstunT > 0) return false;
    const tgt = nearestEnemy(f, fighters, snapRange);
    if (tgt) faceTowards(f, tgt.pos.x, tgt.pos.z);
    const atk = ATTACKS[kind];
    f.attack = { kind, phase: 'startup', t: 0, didHit: false, spec: null, specIdx: -1 };
    setPoseState(f, atk.pose);
    // Every nearby enemy may notice the visible attack after its own
    // difficulty-scaled delay — nobody reads inputs.
    for (const o of fighters) {
      if (o === f || !o.alive || !o.ai) continue;
      if (distXZ(f, o) < 4.2) {
        o.ai.reactArmed = true;
        o.ai.reactT = diff.reactionMs / 1000;
        o.ai.reactFrom = f;
      }
    }
    if (f.isPlayer) sfx.whiff();
    return true;
  }

  // Attempt a special, reporting WHY it did not fire so the player
  // input path can tell a momentary state-block (bufferable) from a
  // real denial (never buffered). Duel parity.
  // Returns: 'fired' | 'state' | 'cooldown' | 'denied' | 'phase' | 'nospec'.
  function attemptSpecial(f, idx) {
    if (phase !== 'fight') return 'phase';
    if (!f.alive || !ACTIONABLE.has(f.state)) return 'state';
    if (f.hitstunT > 0) return 'state';
    const spec = f.specials[idx];
    if (!spec) return 'nospec';
    if (f.cooldowns[idx] > 0) return 'cooldown';
    const kind = f.specKinds[idx].kind;
    // STEP 6 — condition gates, shared with the duel + AI policy.
    const gate = specialUsable(spec, kind, f, null);
    if (!gate.ok) {
      if (f.isPlayer) { sfx.block(); H('onSpecialDenied', idx, gate.reason); }
      return 'denied';
    }
    // ranged kinds snap-face over a longer leash than melee kinds
    const snap = kind === 'projectile' || kind === 'movement' ? 9 : 2.0 + SPECIAL_RANGE_BONUS + 1.2;
    const tgt = nearestEnemy(f, fighters, snap);
    if (tgt) faceTowards(f, tgt.pos.x, tgt.pos.z);
    f.attack = { kind: 'special', phase: 'startup', t: 0, didHit: false, spec, specIdx: idx, specKind: kind };
    setPoseState(f, 'special');
    // The cooldown is NOT committed here: it starts when the move
    // RESOLVES (fighterUpdate, startup -> active) — an interrupted
    // special never burns its cooldown. Duel parity.
    for (const o of fighters) {
      if (o === f || !o.alive || !o.ai) continue;
      if (distXZ(f, o) < 4.2) {
        o.ai.reactArmed = true;
        o.ai.reactT = diff.reactionMs / 1000;
        o.ai.reactFrom = f;
      }
    }
    if (f.isPlayer) sfx.special();
    H('onSpecialUsed', f.isPlayer ? 0 : 1, idx);
    return 'fired';
  }

  // Bool view for the AI call sites (the AI only decides from
  // actionable states, so the distinction never matters to it).
  function trySpecial(f, idx) {
    return attemptSpecial(f, idx) === 'fired';
  }

  // Dispatch ONE player press (the same mapping the pad path has
  // always used) and classify the outcome for the input buffer:
  // bufferable == the press failed ONLY because the fighter is
  // momentarily non-actionable. Duel parity with engine.js.
  function attemptPress(a) {
    if (a === 'light' || a === 'heavy') {
      const fired = tryAttack(player, a, ATTACKS[a].range + 1.2);
      return { fired, bufferable: !fired };
    }
    if (a === 'dash') {
      const fired = tryDash(player, input.mx, input.mz);
      return { fired, bufferable: !fired };
    }
    if (a === 'jump') {
      const fired = tryJump(player);
      return { fired, bufferable: !fired };
    }
    const si = specialIndexForAction(a);
    if (si >= 0) {
      const r = attemptSpecial(player, si);
      return { fired: r === 'fired', bufferable: r === 'state' };
    }
    return { fired: false, bufferable: false };
  }

  function tryDash(f, dx, dz) {
    if (phase !== 'fight') return false;
    if (!f.alive || !ACTIONABLE.has(f.state)) return false;
    if (f.dashCd > 0) return false;
    let ddx = dx, ddz = dz;
    if (Math.hypot(ddx, ddz) < 0.01) {
      forwardOf(f, _v1);
      ddx = _v1.x; ddz = _v1.z;
    }
    const l = Math.hypot(ddx, ddz) || 1;
    f.dashDir.set(ddx / l, 0, ddz / l);
    f.dashT = 0.22;
    f.dashCd = 0.8;
    setPoseState(f, 'dash');
    return true;
  }

  /** Hop straight up; XZ steering stays live so you can jump TOWARD a target. */
  function tryJump(f) {
    if (phase !== 'fight') return false;
    if (!f.alive || !f.grounded) return false;
    if (!ACTIONABLE.has(f.state)) return false;
    if (f.hitstunT > 0) return false;
    f.vy = JUMP_V;
    f.grounded = false;
    return true;
  }

  function attackTiming(f) {
    const a = f.attack;
    if (!a) return null;
    if (a.kind === 'special') {
      return { startup: SPECIAL_STARTUP, active: SPECIAL_ACTIVE, recovery: SPECIAL_RECOVERY };
    }
    return ATTACKS[a.kind];
  }

  // STEP 6 — projectiles (brawl): an orb flies along the attacker's
  // facing; the first living enemy within contact radius takes the
  // hit through landHit, exactly like the duel engine.
  const projectiles = [];
  const projGeo = new THREE.SphereGeometry(0.17, 12, 10);
  function spawnProjectile(att, spec) {
    forwardOf(att, _v1);
    const mat = new THREE.MeshBasicMaterial({ color: KIND_FX.projectile.color });
    const mesh = new THREE.Mesh(projGeo, mat);
    mesh.position.set(att.pos.x + _v1.x * 0.8, 1.3, att.pos.z + _v1.z * 0.8);
    scene.add(mesh);
    projectiles.push({
      mesh, owner: att, spec, life: 2.2,
      dirX: _v1.x, dirZ: _v1.z, speed: 10.5,
    });
    bursts.spawn(mesh.position, KIND_FX.projectile.color, 10, 2.5, 0.35, 0.1);
  }
  function clearProjectiles() {
    for (const p of projectiles) {
      scene.remove(p.mesh);
      p.mesh.material.dispose();
    }
    projectiles.length = 0;
  }
  function updateProjectiles(dt) {
    for (let i = projectiles.length - 1; i >= 0; i--) {
      const p = projectiles[i];
      p.life -= dt;
      p.mesh.position.x += p.dirX * p.speed * dt;
      p.mesh.position.z += p.dirZ * p.speed * dt;
      let consumed = p.life <= 0;
      if (!consumed) {
        for (const o of fighters) {
          if (o === p.owner || !o.alive) continue;
          const dx = o.pos.x - p.mesh.position.x;
          const dz = o.pos.z - p.mesh.position.z;
          if (dx * dx + dz * dz < 0.55 * 0.55 && o.y < 1.1) {
            landHit(p.owner, o, { base: p.spec.damage, knockback: 1.1, hitstun: 0.55, heavyFx: true });
            consumed = true;
            break;
          }
        }
      }
      if (consumed) {
        scene.remove(p.mesh);
        p.mesh.material.dispose();
        projectiles.splice(i, 1);
      }
    }
  }

  // The shared damage landing (combo, ward, status multipliers,
  // block/chip, hitstun, knockback, KO) — mirrors the duel engine.
  function landHit(att, def, { base, knockback, hitstun, heavyFx, ignoreBlock = false, applyDebuff = false }) {
    const dx = def.pos.x - att.pos.x;
    const dz = def.pos.z - att.pos.z;
    const dist = Math.hypot(dx, dz);
    // defender blocks only while facing the attacker
    forwardOf(def, _v2);
    const toAtt = dist > 0.001 ? -1 / dist : 0;
    const dotBlock = (dx * _v2.x + dz * _v2.z) * toAtt;
    const blocking = !ignoreBlock && def.blockHeld && ACTIONABLE.has(def.state) && def.hitstunT <= 0 && dotBlock > 0.35;

    let dmg = calcDamage(base, att.data.stats.power, def.data.stats.toughness);
    att.chain.count = att.chain.t < COMBO_WINDOW ? att.chain.count + 1 : 1;
    att.chain.t = 0;
    dmg = Math.round(dmg * (COMBO_MULT[Math.min(3, att.chain.count)] || 1));
    if (att.chain.count >= 2) H('onCombo', att.isPlayer ? 0 : 1, att.chain.count);
    dmg = Math.max(1, Math.round(dmg * statusDamageMul(att, def)));
    if (def.wardT > 0) dmg = Math.max(1, Math.round(dmg * 0.5));

    const kl = dist > 0.001 ? 1 / dist : 0;
    const kx = dx * kl, kz = dz * kl;
    _v1.set((att.pos.x + def.pos.x) / 2, 1.25, (att.pos.z + def.pos.z) / 2);

    if (blocking) {
      const chip = calcBlockedDamage(dmg);
      def.health = Math.max(1, def.health - chip); // chip never KOs
      def.vel.x += kx * knockback * 0.3;
      def.vel.z += kz * knockback * 0.3;
      bursts.spawn(_v1, 0x88aaff, 12, 2.5, 0.4, 0.1);
      sfx.block();
    } else {
      def.health = Math.max(0, def.health - dmg);
      def.hitstunT = hitstun;
      def.vel.x += kx * knockback;
      def.vel.z += kz * knockback;
      def.attack = null; // getting hit interrupts your own attack
      setPoseState(def, 'hit');
      def.blockHeld = false;
      if (applyDebuff) def.debuffT = DEBUFF_SECONDS;
      def.chain.count = 0;
      bursts.spawn(_v1, heavyFx ? 0xff7722 : 0xffcc44, heavyFx ? 30 : 20, heavyFx ? 6 : 4.5, 0.6, 0.14);
      if (applyDebuff) {
        _v2.set(def.pos.x, 1.25, def.pos.z);
        bursts.spawn(_v2, KIND_FX.debuff.color, 16, 2.5, 0.5, 0.11);
      }
      if (heavyFx) sfx.heavy(); else sfx.hit();
    }

    hitstopT = 0.05;
    sendHud(true);

    if (def.health <= 0 && !blocking) onKnockout(att, def);
  }

  function resolveHit(att, def) {
    const a = att.attack;
    let base, range, knockback, hitstun, heavyFx;
    let ignoreBlock = false, applyDebuff = false;
    if (a.kind === 'special') {
      // self kinds and projectiles resolve before this is called
      const kind = a.specKind || 'strike';
      base = a.spec.damage;
      hitstun = 0.6; heavyFx = true;
      range = att.specKinds[a.specIdx] ? att.specKinds[a.specIdx].band[1] : 2.0 + SPECIAL_RANGE_BONUS;
      if (kind === 'grab') { knockback = 1.7; ignoreBlock = true; }
      else if (kind === 'debuff') { knockback = 1.0; applyDebuff = true; }
      else { knockback = 1.2; }
    } else {
      const t = ATTACKS[a.kind];
      base = t.base; range = t.range; knockback = t.knockback; hitstun = t.hitstun;
      heavyFx = a.kind === 'heavy';
    }

    const dx = def.pos.x - att.pos.x;
    const dz = def.pos.z - att.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist > range + 0.35) return; // whiff — honest, per kind band
    // attacker must be roughly facing the defender
    forwardOf(att, _v1);
    const dotFace = (dx * _v1.x + dz * _v1.z) / (dist || 1);
    if (dotFace < 0.2) return;

    landHit(att, def, { base, knockback, hitstun, heavyFx, ignoreBlock, applyDebuff });
  }

  function onKnockout(att, def) {
    def.health = 0;
    def.alive = false;
    def.vel.set(0, 0, 0);
    def.y = 0; def.vy = 0; def.grounded = true; // KO'd fighters stay on the ground
    def.blockHeld = false;
    def.attack = null; // a KO'd fighter throws no more punches
    setPoseState(def, 'ko');
    sfx.ko();
    slowmo(0.45);
    _v1.set(def.pos.x, 1.2, def.pos.z);
    bursts.spawn(_v1, 0xff4444, 30, 5, 0.7, 0.15, 3);

    // multi-KO callouts
    if (koChain.t < MULTI_KO_WINDOW) koChain.count += 1;
    else koChain.count = 1;
    koChain.t = 0;
    const label = multiKoLabel(koChain.count);
    if (label) {
      H('onAnnounce', label, `${def.data.name} is out`);
      sfx.announce();
    }
    sendHud(true);

    // Round scoring only while the round is live — in-flight attacks that
    // land during roundEnd/done must not score twice.
    if (phase !== 'fight') return;

    const remaining = aliveCount();
    if (remaining <= 1) {
      // round over — decide winner from who is left standing (or health on
      // the freak double-KO), then score it
      const order = fighters.map((f) => ({ idx: fighters.indexOf(f), alive: f.alive, health: f.health }));
      const tmp = {
        fighters: order.map((o) => ({ idx: o.idx, alive: o.alive, health: o.health, rounds: fighters[o.idx].rounds })),
      };
      const w = brawlRoundWinner(tmp);
      if (w === 'draw') {
        H('onAnnounce', 'DRAW', 'round replayed');
        phase = 'roundEnd'; phaseT = 2.2;
        pendingReset = true;
      } else {
        const winner = fighters[w];
        winner.rounds += 1;
        if (winner.rounds >= winsNeeded) {
          // MATCH DECIDED — don't end on the KO. The last fighter beaten
          // staggers back up for FINISH HIM (see startFinishHim).
          pendingWinner = winner;
          pendingLoser = def;
          H('onAnnounce', 'K.O.!', '');
          sfx.ko();
          phase = 'preFinish'; phaseT = 1.7;
        } else {
          H('onAnnounce', `${winner.data.name.toUpperCase()} TAKES ROUND ${round}`, '');
          sfx.announce();
          round += 1;
          phase = 'roundEnd'; phaseT = 2.4;
          pendingReset = true;
        }
      }
      sendHud(true);
    }
  }

  let pendingReset = false;
  let pendingWinner = null; // FINISH HIM: decided champion, waiting on the window
  let pendingLoser = null; // FINISH HIM: the victim, dizzy at 1 HP
  let fatalityDone = false;
  let cpuFatalityAt = -1; // time within the window when a CPU champion performs its fatality

  function resetRoundPositions() {
    bufferedPress = null; // a held press never survives a round reset
    const spawns = brawlSpawns(fighters.length, arena);
    fighters.forEach((f, i) => {
      f.pos.set(spawns[i].x, 0, spawns[i].z);
      f.y = 0; f.vy = 0; f.grounded = true;
      f.yaw = Math.atan2(-spawns[i].x, -spawns[i].z);
      f.health = MAX_HEALTH;
      f.alive = true;
      f.vel.set(0, 0, 0);
      f.attack = null; f.hitstunT = 0;
      f.blockHeld = false; f.moveX = 0; f.moveZ = 0;
      f.wobble = false;
      f.cooldowns = f.specials.map(() => 0); f.wardT = 0;
      f.buffT = 0; f.debuffT = 0;
      f.chain.count = 0; f.chain.t = 0;
      f.dashT = 0; f.dashCd = 0;
      if (f.ai) { f.ai.thinkT = 0.4; f.ai.blockUntil = 0; f.ai.reactArmed = false; f.ai.targetIdx = -1; }
      setPoseState(f, 'idle');
      f.rig.position.set(f.pos.x, 0, f.pos.z);
      f.rig.rotation.y = f.yaw;
      f.rig.rotation.z = 0;
    });
    clearProjectiles();
    timeLeft = BRAWL_ROUND_TIME;
    announcedFight = false;
    koChain.count = 0; koChain.t = 99;
    targetRing.visible = false;
  }

  function endMatch(champion, { fatality } = { fatality: false }) {
    setPoseState(champion, 'win');
    for (const f of fighters) {
      if (f !== champion && f.alive) { setPoseState(f, 'idle'); }
    }
    phase = 'done';
    if (fatality) {
      H('onAnnounce', 'FATALITY!', champion.data.fatality.name);
    } else {
      const label = champion.isPlayer ? 'YOU ARE THE BRAWL KING' : `${champion.data.name.toUpperCase()} IS THE BRAWL KING`;
      H('onAnnounce', label, `Best of ${bestOf} · Round ${round}`);
    }
    sfx.announce();
    H('onMatchEnd', {
      championId: champion.id,
      championName: champion.data.name,
      isPlayer: champion.isPlayer,
      playerRounds: player.rounds,
      bestOf,
      round,
      fatality: !!fatality,
    });
    sendHud(true);
  }

  // ---------------- FINISH HIM ----------------
  // The match is decided but the show isn't over: the victim staggers back
  // up, dizzy at 1 HP, and the champion gets FINISH_HIM_SECONDS to perform
  // their fatality. Mirrors the duel flow (app/kombat/engine.js).
  function startFinishHim() {
    const winner = pendingWinner, loser = pendingLoser;
    if (!winner || !loser) { endMatch(winner || fighters[0], { fatality: false }); return; }
    // loser staggers back up, dazed
    loser.health = 1;
    loser.alive = true;
    loser.wobble = true;
    loser.vel.set(0, 0, 0);
    loser.attack = null;
    loser.blockHeld = false;
    setPoseState(loser, 'dizzy');
    setPoseState(winner, 'idle');
    phase = 'finishHim'; phaseT = FINISH_HIM_SECONDS;
    fatalityDone = false;
    // STEP 6 — single render: only the onFinishHim overlay carries
    // FINISH HIM (see engine.js — the announce doubled it).
    H('onFinishHim', true, FINISH_HIM_SECONDS, winner.isPlayer);
    sfx.announce();
    // CPU champions sometimes perform their own fatality — scaled by
    // difficulty (rare on easy, common on hard). Pure chance, never
    // reads the player's inputs.
    if (!winner.isPlayer) {
      const p = diff.fatalityChance ?? 0;
      cpuFatalityAt = Math.random() < p ? 1 + Math.random() * (FINISH_HIM_SECONDS - 1.6) : -1;
    } else {
      cpuFatalityAt = -1;
    }
    sendHud(true);
  }

  function doFatality(winner, loser) {
    if (fatalityDone || phase !== 'finishHim') return;
    fatalityDone = true;
    phase = 'fatality'; phaseT = 3.6;
    loser.wobble = false;
    setPoseState(loser, 'ko');
    setPoseState(winner, 'win');
    H('onFinishHim', false, 0, false);
    H('onFatality', winner.data.fatality.name, winner.data.fatality.description);
    sfx.fatality();
    const accent = winner.params?.colors?.accent ?? 0xff2222;
    const lp = new THREE.Vector3(loser.pos.x, 1.25, loser.pos.z);
    bursts.spawn(lp, accent, 60, 7, 1.1, 0.18, 4);
    setTimeout(() => { if (!disposed) bursts.spawn(lp, 0xffffff, 40, 5, 0.9, 0.14, 5); }, 450);
    setTimeout(() => {
      if (!disposed) bursts.spawn(new THREE.Vector3(winner.pos.x, 1.25, winner.pos.z), accent, 30, 4, 0.8, 0.13, 4);
    }, 900);
    sendHud(true);
  }

  // ---------------- AI ----------------
  function aiThink(f) {
    const a = f.ai;
    // No gang-up bias: every CPU simply targets its NEAREST living opponent.
    const foe = nearestEnemy(f, fighters);
    a.targetIdx = foe ? fighters.indexOf(foe) : -1;
    if (!foe) { f.moveX = 0; f.moveZ = 0; return; }
    faceTowards(f, foe.pos.x, foe.pos.z);
    const d = distXZ(f, foe);
    const dx = (foe.pos.x - f.pos.x) / (d || 1);
    const dz = (foe.pos.z - f.pos.z) / (d || 1);

    if (d > 2.6) {
      // from range, logic may fire first — projectile, buff, heal or
      // a dash-in special (Step 6 AI policy, lib/kombat/specials.js)
      if (Math.random() < diff.specialChance) {
        const idx = chooseSpecial(f.specials, f.specKinds, f.cooldowns, {
          dist: d, selfHealth: f.health, foeHealth: foe.health,
          selfWardT: f.wardT, selfBuffT: f.buffT, foeDebuffT: foe.debuffT,
        }, Math.random);
        if (idx >= 0 && trySpecial(f, idx)) { f.moveX = 0; f.moveZ = 0; return; }
      }
      // approach with a wandering strafe so brawls don't conga-line
      a.strafeT -= diff.thinkMs / 1000;
      if (a.strafeT <= 0) {
        a.strafeDir = Math.random() < 0.5 ? 1 : -1;
        a.strafeT = 0.6 + Math.random() * 1.2;
      }
      f.moveX = dx * 0.92 + -dz * 0.45 * a.strafeDir;
      f.moveZ = dz * 0.92 + dx * 0.45 * a.strafeDir;
      const l = Math.hypot(f.moveX, f.moveZ) || 1;
      f.moveX /= l; f.moveZ /= l;
      if (d > 5 && Math.random() < diff.dashChance) tryDash(f, dx, dz);
      if (d > 3.5 && Math.random() < 0.05) tryJump(f); // hop while closing in
      if (d < 3.4 && Math.random() < 0.25) a.blockUntil = elapsed + 0.25; // cautious approach
    } else {
      const r = Math.random();
      if (r < diff.aggression) {
        // same full kit as the player (Step 5 parity), picked by
        // LOGIC since Step 6 — kind, band, health, status (specials.js)
        let acted = false;
        if (Math.random() < diff.specialChance) {
          const idx = chooseSpecial(f.specials, f.specKinds, f.cooldowns, {
            dist: d, selfHealth: f.health, foeHealth: foe.health,
            selfWardT: f.wardT, selfBuffT: f.buffT, foeDebuffT: foe.debuffT,
          }, Math.random);
          if (idx >= 0) acted = trySpecial(f, idx);
        }
        if (!acted) {
          if (Math.random() < diff.heavyChance) tryAttack(f, 'heavy', ATTACKS.heavy.range + 1.2);
          else tryAttack(f, 'light', ATTACKS.light.range + 1.2);
        }
        if (Math.random() < diff.retreatChance) {
          f.moveX = -dx; f.moveZ = -dz; // back off after attacking
        } else { f.moveX = 0; f.moveZ = 0; }
      } else if (r < diff.aggression + 0.18) {
        a.blockUntil = elapsed + 0.35 + Math.random() * 0.3;
        f.moveX = 0; f.moveZ = 0;
      } else {
        // circle the target
        f.moveX = -dz * a.strafeDir;
        f.moveZ = dx * a.strafeDir;
      }
    }
  }

  function aiUpdate(f, dt) {
    const a = f.ai;
    if (!a || !f.alive) { f.moveX = 0; f.moveZ = 0; f.blockHeld = false; return; }
    if (phase !== 'fight') { f.moveX = 0; f.moveZ = 0; f.blockHeld = false; return; }
    a.thinkT -= dt;
    if (a.thinkT <= 0) {
      aiThink(f);
      a.thinkT = (diff.thinkMs / 1000) * (0.7 + Math.random() * 0.6);
    }
    // delayed reaction to a NEARBY visible attack — fair, difficulty-scaled
    if (a.reactArmed) {
      a.reactT -= dt;
      if (a.reactT <= 0) {
        a.reactArmed = false;
        const from = a.reactFrom;
        if (from && from.alive && from.attack && from.attack.phase !== 'recovery') {
          const d = distXZ(f, from);
          if (d < 3.0 && Math.random() < diff.blockChance) {
            a.blockUntil = elapsed + 0.4 + Math.random() * 0.35;
          }
        }
        a.reactFrom = null;
      }
    }
    f.blockHeld = elapsed < a.blockUntil && ACTIONABLE.has(f.state) && f.hitstunT <= 0;
    if (f.blockHeld) { f.moveX = 0; f.moveZ = 0; }
  }

  // ---------------- per-fighter update ----------------
  function fighterUpdate(f, dt) {
    f.stateT += dt;
    f.poseT += dt;
    f.walkT += dt;
    if (f.chain.t < COMBO_WINDOW) f.chain.t += dt; else f.chain.count = 0;
    for (let i = 0; i < f.cooldowns.length; i++) if (f.cooldowns[i] > 0) f.cooldowns[i] = Math.max(0, f.cooldowns[i] - dt);
    if (f.wardT > 0) f.wardT -= dt;
    if (f.buffT > 0) f.buffT -= dt;
    if (f.debuffT > 0) f.debuffT -= dt;
    if (f.dashCd > 0) f.dashCd -= dt;
    if (f.hitstunT > 0) {
      f.hitstunT -= dt;
      if (f.hitstunT <= 0 && f.state === 'hit' && phase === 'fight' && f.alive) setPoseState(f, 'idle');
    }

    // knockback drift
    if (f.vel.lengthSq() > 0.0001) {
      f.pos.addScaledVector(f.vel, dt);
      f.vel.multiplyScalar(Math.max(0, 1 - 6 * dt));
    }

    // jump physics — through the shared floor-law stepper: gravity
    // integrates, the plane catches, nothing ever crosses below it
    if (!f.grounded) {
      const sv = stepVertical(f.y, f.vy, GRAVITY, dt);
      f.y = sv.y; f.vy = sv.vy; f.grounded = sv.grounded;
    }

    // dash
    if (f.state === 'dash') {
      f.pos.addScaledVector(f.dashDir, 9 * dt);
      if (f.stateT >= 0.22) setPoseState(f, 'idle');
    }

    // attacks
    if (f.attack) {
      const a = f.attack;
      const timing = attackTiming(f);
      a.t += dt;
      if (a.phase === 'startup' && a.t >= timing.startup) {
        a.phase = 'active';
        if (!a.didHit) {
          a.didHit = true;
          // COOLDOWN COMMITS AT RESOLUTION, not at press — an
          // interrupted special never burns its cooldown; a resolved
          // one (hit, chip, or honest whiff) always pays. Player + AI
          // share this one transition. Duel parity (engine.js).
          if (a.kind === 'special' && a.specIdx >= 0) f.cooldowns[a.specIdx] = a.spec.cooldown;

          const skind = a.kind === 'special' ? (a.specKind || 'strike') : null;
          if (skind === 'ward' || skind === 'heal' || skind === 'buff') {
            // STEP 6 — self kinds resolve on the user, in kind color
            _v1.set(f.pos.x, 1.25, f.pos.z);
            if (skind === 'ward') {
              f.wardT = WARD_SECONDS;
              bursts.spawn(_v1, KIND_FX.ward.color, 20, 3, 0.7, 0.12);
              sfx.block();
            } else if (skind === 'heal') {
              f.health = Math.min(MAX_HEALTH, f.health + healAmountFor(a.spec));
              bursts.spawn(_v1, KIND_FX.heal.color, 20, 2.5, 0.8, 0.12, 3);
              sfx.special();
            } else {
              f.buffT = BUFF_SECONDS;
              bursts.spawn(_v1, KIND_FX.buff.color, 20, 3.5, 0.7, 0.12);
              sfx.special();
            }
            f.attack = null;
            setPoseState(f, 'idle');
            sendHud(true);
          } else if (skind === 'projectile') {
            spawnProjectile(f, a.spec);
            sfx.special();
          } else {
            if (skind === 'movement') {
              // dash to the nearest enemy, then strike from arrival
              const tgt0 = nearestEnemy(f, fighters, 9);
              if (tgt0) {
                faceTowards(f, tgt0.pos.x, tgt0.pos.z);
                const dx = tgt0.pos.x - f.pos.x, dz = tgt0.pos.z - f.pos.z;
                const d = Math.hypot(dx, dz) || 1;
                const stop = Math.max(0, d - 1.3);
                _v1.set(f.pos.x, 1.25, f.pos.z);
                bursts.spawn(_v1, KIND_FX.movement.color, 12, 3, 0.4, 0.1);
                f.pos.x += (dx / d) * stop;
                f.pos.z += (dz / d) * stop;
                clampToArena(f.pos, arena);
                _v1.set(f.pos.x, 1.25, f.pos.z);
                bursts.spawn(_v1, KIND_FX.movement.color, 12, 3, 0.4, 0.1);
              }
            }
            // single-target: nearest enemy inside range + facing cone
            const reach = a.kind === 'special' ? 2.0 + SPECIAL_RANGE_BONUS + 0.35 : ATTACKS[a.kind].range + 0.35;
            const tgt = nearestEnemy(f, fighters, reach);
            if (tgt) {
              const dx = tgt.pos.x - f.pos.x, dz = tgt.pos.z - f.pos.z;
              const d = Math.hypot(dx, dz) || 1;
              forwardOf(f, _v1);
              if ((dx * _v1.x + dz * _v1.z) / d > 0.2) resolveHit(f, tgt);
            }
          }
        }
      } else if (a.phase === 'active' && a.t >= timing.startup + timing.active) {
        a.phase = 'recovery';
      } else if (a.phase === 'recovery' && a.t >= timing.startup + timing.active + timing.recovery) {
        f.attack = null;
        if (f.state === 'punch' || f.state === 'kick' || f.state === 'special') setPoseState(f, 'idle');
      }
    }

    // movement
    const canMove = f.alive && ACTIONABLE.has(f.state) && f.hitstunT <= 0 && !f.blockHeld && phase === 'fight';
    const ml = Math.hypot(f.moveX, f.moveZ);
    if (canMove && ml > 0.05) {
      const nx = f.moveX / Math.max(1, ml), nz = f.moveZ / Math.max(1, ml);
      const airMul = f.grounded ? 1 : 0.85; // slight air-control penalty
      f.pos.x += nx * f.speed * statusSpeedMul(f) * airMul * dt;
      f.pos.z += nz * f.speed * statusSpeedMul(f) * airMul * dt;
      // face travel direction (AI already faces its target; don't override mid-think)
      if (f.isPlayer || !f.ai || f.ai.targetIdx < 0) {
        const want = Math.atan2(nx, nz);
        let dYaw = want - f.yaw;
        while (dYaw > Math.PI) dYaw -= Math.PI * 2;
        while (dYaw < -Math.PI) dYaw += Math.PI * 2;
        f.yaw += dYaw * Math.min(1, 12 * dt);
      }
      if (f.state === 'idle') setPoseState(f, 'walk');
    } else if (f.state === 'walk') {
      setPoseState(f, 'idle');
    }

    clampToArena(f.pos, arena);

    // pose — the shared resolver (downed-state law: 'ko' iff downed)
    const pose = resolvePose({
      state: f.state, alive: f.alive, grounded: f.grounded,
      blockHeld: f.blockHeld, actionable: ACTIONABLE.has(f.state),
    });
    if (f.glb && f.glb.isReady()) {
      // STEP 6 — the real model, posed by the code pose driver
      forwardOf(f, _v1);
      const moveDot = (f.moveX * _v1.x + f.moveZ * _v1.z) >= 0 ? 1 : -1;
      const timing = f.attack ? attackTiming(f) : null;
      f.glb.update(pose, dt, elapsed, {
        moveDir: moveDot,
        specKind: f.attack?.specKind,
        actionT: f.attack ? f.attack.t : null,
        actionDur: timing ? timing.startup + timing.active + timing.recovery : null,
      });
    } else {
      poseRig(f.rig, pose, pose === 'walk' || pose === 'idle' ? f.walkT : f.poseT);
    }
    updateEffects(f.rig, dt);

    f.rig.position.set(f.pos.x, f.y, f.pos.z);
    // FLOOR LAW (shared update path): GLB bodies are floor-safe by
    // construction + root clamp; procedural bodies get the geometric
    // clamp (posed box measured, root solved onto the plane).
    if (f.glb && f.glb.isReady()) {
      applyFloorClamp(f.rig);
    } else {
      _floorBox.setFromObject(f.rig);
      if (Number.isFinite(_floorBox.min.y)) {
        f.rig.position.y = solveFloorY(f.rig.position.y, _floorBox.min.y, f.y);
      }
    }
    f.rig.rotation.y = f.yaw;
    // dizzy wobble (finish-him victim) — mirrors the duel engine
    f.rig.rotation.z = f.wobble ? Math.sin(f.walkT * 3.2) * 0.09 : 0;
  }

  // ---------------- main loop ----------------
  const clock = new THREE.Clock();
  let raf = 0;

  function resize() {
    const w = canvas.clientWidth || canvas.parentElement?.clientWidth || 360;
    const h = canvas.clientHeight || canvas.parentElement?.clientHeight || 480;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // STEP 6 — framing vs pads: shift the fight band up at phone
    // aspects so brawlers never play under the pad row.
    const fr = brawlFraming(w / h);
    if (fr.shiftUpFrac > 0) camera.setViewOffset(w, h, 0, Math.round(fr.shiftUpFrac * h), w, h);
    else camera.clearViewOffset();
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();
  brawlCam.snap(player.pos);

  const _pts = [];
  function frame() {
    if (disposed) return;
    raf = requestAnimationFrame(frame);
    // Context lost: freeze the simulation (duel parity); the loop
    // stays alive so a restore resumes where it froze. Past the
    // grace window, tell the page once so it can offer a reload.
    if (contextLost) {
      if (!contextLossReported && performance.now() - contextLostAt > 3500) {
        contextLossReported = true;
        H('onContextLost', true);
      }
      return;
    }
    const rawDt = Math.min(0.05, clock.getDelta());
    elapsed += rawDt;
    koChain.t += rawDt;

    let ts = 1;
    if (hitstopT > 0) { hitstopT -= rawDt; ts = 0.05; }
    else if (slowmoT > 0) { slowmoT -= rawDt; ts = 0.25; }
    const dt = rawDt * ts;

    phaseT -= rawDt;

    // phase flow
    if (phase === 'summoning') {
      // Models still loading: fighters idle in place behind the
      // page's SUMMONING veil; no timers run and presses are
      // discarded by the input branch below, as in any non-fight
      // phase.
    } else if (phase === 'intro') {
      if (!announcedFight && phaseT <= 0.9) {
        announcedFight = true;
        H('onAnnounce', round === 1 ? 'BRAWL!' : `ROUND ${round}`, `${fighters.length} fighters enter`);
        sfx.announce();
      }
      if (phaseT <= 0) { phase = 'fight'; sendHud(true); }
    } else if (phase === 'fight') {
      timeLeft -= rawDt;
      if (timeLeft <= 0 && aliveCount() > 1) {
        timeLeft = 0;
        // timeout: highest health takes the round
        const tmp = {
          fighters: fighters.map((f, i) => ({ idx: i, alive: f.alive, health: f.health, rounds: f.rounds })),
        };
        const w = brawlRoundWinner(tmp);
        if (w === 'draw') {
          H('onAnnounce', 'DRAW', 'round replayed');
        } else {
          const winner = fighters[w];
          winner.rounds += 1;
          if (winner.rounds >= winsNeeded) {
            // MATCH DECIDED on time — the toughest rival still standing gets
            // the FINISH HIM treatment (see pickFinishHimVictim).
            pendingWinner = winner;
            const vIdx = pickFinishHimVictim(
              fighters.map((f, i) => ({ idx: i, alive: f.alive, health: f.health })),
              w
            );
            pendingLoser = vIdx >= 0 ? fighters[vIdx] : null;
            H('onAnnounce', 'TIME!', '');
            sfx.ko();
            phase = 'preFinish'; phaseT = 1.7;
            sendHud(true);
          } else {
            H('onAnnounce', 'TIME!', `${winner.data.name} takes round ${round}`);
            sfx.announce();
          }
        }
        if (phase !== 'done' && phase !== 'preFinish') {
          phase = 'roundEnd'; phaseT = 2.2;
          pendingReset = true; // draw and timeout both replay/reset the round
          if (w !== 'draw') round += 1;
          sendHud(true);
        }
      }
    } else if (phase === 'roundEnd') {
      if (phaseT <= 0) {
        if (pendingReset) {
          resetRoundPositions();
          pendingReset = false;
        }
        phase = 'intro'; phaseT = 1.8;
        sendHud(true);
      }
    } else if (phase === 'preFinish') {
      if (phaseT <= 0) startFinishHim();
    } else if (phase === 'finishHim') {
      if (cpuFatalityAt > 0 && (FINISH_HIM_SECONDS - phaseT) >= cpuFatalityAt) {
        cpuFatalityAt = -1;
        doFatality(pendingWinner, pendingLoser);
      } else if (phaseT <= 0) {
        // window expired: plain KO, no fatality
        const winner = pendingWinner, loser = pendingLoser;
        if (loser) { loser.wobble = false; setPoseState(loser, 'ko'); }
        H('onFinishHim', false, 0, false);
        H('onAnnounce', 'FINISH!', '');
        sfx.ko();
        phase = 'koEnd'; phaseT = 2.0;
        sendHud(true);
      } else {
        H('onFinishHim', true, Math.ceil(phaseT), pendingWinner?.isPlayer ?? false);
      }
    } else if (phase === 'fatality') {
      if (phaseT <= 0) endMatch(pendingWinner, { fatality: true });
    } else if (phase === 'koEnd') {
      if (phaseT <= 0) endMatch(pendingWinner, { fatality: false });
    }

    // player input
    if (phase === 'fight' && player.alive) {
      player.moveX = player.blockHeld ? 0 : input.mx;
      player.moveZ = player.blockHeld ? 0 : input.mz;
      player.blockHeld = input.block && ACTIONABLE.has(player.state);
      // INPUT BUFFERING — the buffered intent is the OLDEST honest
      // press, so it gets the first legal frame before any fresh tap.
      // Dropped when it fires, stops being bufferable, or ages out.
      // Duel parity (engine.js).
      if (bufferedPress) {
        if (elapsed - bufferedPress.at > INPUT_BUFFER_SECONDS) {
          bufferedPress = null;
        } else {
          const r = attemptPress(bufferedPress.action);
          if (r.fired || !r.bufferable) bufferedPress = null;
        }
      }
      for (const a of pressed.splice(0)) {
        const r = attemptPress(a);
        if (!r.fired && r.bufferable) bufferedPress = { action: a, at: elapsed };
      }
    } else if (phase === 'finishHim') {
      // Only the champion's player may act — a single FATALITY press.
      // Everyone else is frozen; the victim is dizzy.
      for (const a of pressed.splice(0)) {
        if (a === 'fatality' && pendingWinner === player) doFatality(player, pendingLoser);
      }
      player.moveX = 0; player.moveZ = 0; player.blockHeld = false;
    } else {
      pressed.length = 0;
      bufferedPress = null;
      player.moveX = 0; player.moveZ = 0;
      if (phase !== 'fight') player.blockHeld = false;
    }

    for (const f of fighters) {
      if (!f.isPlayer) aiUpdate(f, dt);
    }

    // pairwise separation (n <= 16 -> <= 120 pairs, cheap)
    for (let i = 0; i < fighters.length; i++) {
      const a = fighters[i];
      if (!a.alive) continue;
      for (let j = i + 1; j < fighters.length; j++) {
        const b = fighters[j];
        if (!b.alive) continue;
        if (a.state === 'dizzy' || b.state === 'dizzy') continue; // finish-him victim holds still
        if (a.y > 0.35 || b.y > 0.35) continue; // airborne fighters leap OVER bodies
        const dx = b.pos.x - a.pos.x;
        const dz = b.pos.z - a.pos.z;
        const d = Math.hypot(dx, dz);
        if (d < BRAWL_MIN_SEPARATION && d > 0.0001) {
          const push = (BRAWL_MIN_SEPARATION - d) / 2;
          const nx = dx / d, nz = dz / d;
          a.pos.x -= nx * push; a.pos.z -= nz * push;
          b.pos.x += nx * push; b.pos.z += nz * push;
          clampToArena(a.pos, arena);
          clampToArena(b.pos, arena);
        }
      }
    }

    for (const f of fighters) fighterUpdate(f, dt);
    updateProjectiles(dt);
    stage.update(dt, elapsed);
    bursts.update(dt);

    // target indicator: who the player's attacks will hit
    if (phase === 'fight' && player.alive) {
      const tgt = nearestEnemy(player, fighters, 4.5);
      if (tgt) {
        targetRing.visible = true;
        targetRing.position.set(tgt.pos.x, 0.07, tgt.pos.z);
        const s = 1 + Math.sin(elapsed * 6) * 0.08;
        targetRing.scale.set(s, s, 1);
      } else {
        targetRing.visible = false;
      }
    } else {
      targetRing.visible = false;
    }

    // camera
    _pts.length = 0;
    for (const f of fighters) if (f.alive) _pts.push(f.pos);
    brawlCam.update(player.alive ? player.pos : null, _pts, rawDt);

    sendHud();
    renderer.render(scene, camera);
  }

  // The match proper begins here — immediately when no GLB gate
  // applies, or the moment the gate lifts (see liftGate below).
  function beginMatch() {
    ac();
    phase = 'intro'; phaseT = 1.8; round = 1;
    resetRoundPositions();
    H('onAnnounce', 'BRAWL!', `${fighters.length} fighters · best of ${bestOf}`);
    sendHud(true);
    if (!raf) frame();
  }

  function liftGate() {
    if (!summoning) return;
    summoning = false;
    if (gateTimer) { clearTimeout(gateTimer); gateTimer = 0; }
    H('onSummoning', false);
    if (startRequested) {
      startRequested = false;
      beginMatch();
    } else if (phase === 'summoning') {
      phase = 'intro'; phaseT = 1.8;
      H('onAnnounce', 'BRAWL!', `${fighters.length} fighters · best of ${bestOf}`);
      sendHud(true);
    }
  }

  // ---------------- public API ----------------
  const engine = {
    /** x: right+, y: down+ (screen space); engine maps to world XZ. */
    setMove(x, y) {
      input.mx = Math.max(-1, Math.min(1, x || 0));
      input.mz = Math.max(-1, Math.min(1, y || 0));
    },
    setBlock(b) { input.block = !!b; },
    press(action) {
      if (['light', 'heavy', 'dash', 'sp1', 'sp2', 'sp3', 'sp4', 'sp5', 'sp6', 'jump', 'fatality'].includes(action)) pressed.push(action);
    },
    start() {
      // While the model gate holds, remember the request — the
      // match begins the moment every GLB settles (liftGate).
      if (summoning) { startRequested = true; ac(); return; }
      beginMatch();
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      raf = 0;
      if (gateTimer) { clearTimeout(gateTimer); gateTimer = 0; }
      unwatchContext();
      window.removeEventListener('resize', resize);
      bursts.dispose();
      scene.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
      });
      renderer.dispose();
    },
    get phase() { return phase; },
  };

  frame();
  if (summoning) {
    // Hold the BRAWL! announce until every model settles (or the
    // cap expires); beginMatch does the announcing at gate lift.
    H('onSummoning', true);
    gateTimer = setTimeout(liftGate, GLB_GATE_MS);
    Promise.allSettled(glbHandles.map((h) => h.ready)).then(liftGate);
  } else {
    H('onAnnounce', 'BRAWL!', `${fighters.length} fighters · best of ${bestOf}`);
    phaseT = 1.8;
  }

  return engine;
}
