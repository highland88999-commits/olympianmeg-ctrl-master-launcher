// KOMBAT ARENA — fight engine.
// 2.5D side-view fighter: two procedural rigs on an X-axis plane inside a
// procedural arena. Best-of-3 rounds, 60s timer, FINISH HIM / fatality flow,
// difficulty-scaled AI with no input reading.
//
// Pure game logic constants live in lib/kombat/rules.js (headless-testable);
// this file owns three.js, animation, AI and round flow.

import * as THREE from 'three';
import { buildFighterRig, poseRig, updateEffects } from '../../lib/kombat/rig.js';
import { getFighter } from '../../lib/kombat/roster.js';
import { VISUALS } from '../../lib/kombat/visuals.js';
import { buildArena } from './arenas.js';
import {
  MAX_HEALTH, ROUND_TIME, ROUNDS_TO_WIN, FINISH_HIM_SECONDS,
  COMBO_WINDOW, BLOCK_REDUCTION, ARENA_HALF_WIDTH, MIN_SEPARATION,
  DIFFICULTY, ATTACKS, SPECIAL_STARTUP, SPECIAL_ACTIVE, SPECIAL_RECOVERY,
  SPECIAL_RANGE_BONUS, WARD_SECONDS, COMBO_MULT,
  calcDamage, calcBlockedDamage, walkSpeed,
} from '../../lib/kombat/rules.js';

const ACTIONABLE = new Set(['idle', 'walk']);

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
// particle bursts
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
// fighter entity
// ------------------------------------------------------------------
function makeFighter(scene, fighterId, x, facing, specialIdxs, isPlayer, diff) {
  const data = getFighter(fighterId);
  if (!data) throw new Error(`kombat: unknown fighter id "${fighterId}"`);
  const params = VISUALS[fighterId];
  if (!params) throw new Error(`kombat: missing VISUALS params for "${fighterId}"`);
  const rig = buildFighterRig(params);
  rig.position.set(x, 0, 0);
  scene.add(rig);
  const specials = specialIdxs.map((i) => data.specials[i]).filter(Boolean);
  while (specials.length < 2) specials.push(data.specials[specials.length % data.specials.length]);
  return {
    data, rig, params,
    id: fighterId,
    isPlayer,
    x, facing, // facing: +1 (toward +X) | -1
    health: MAX_HEALTH, rounds: 0,
    state: 'idle', stateT: 0, poseT: Math.random() * 10, walkT: Math.random() * 10,
    moveDir: 0, blockHeld: false,
    vel: 0, // knockback velocity along X
    dashT: 0, dashDir: 1, dashCd: 0,
    attack: null, // { kind:'light'|'heavy'|'special', phase, t, didHit, spec, specIdx }
    hitstunT: 0,
    specials, cooldowns: [0, 0],
    wardT: 0,
    chain: { count: 0, t: 0 },
    wobble: false,
    speed: walkSpeed(data.stats.speed, isPlayer ? 1 : (diff?.speedMul ?? 1)),
    ai: isPlayer ? null : { thinkT: 0.4, moveDir: 0, blockUntil: 0, reactArmed: false, reactT: 0, retreatT: 0 },
  };
}

function setPoseState(f, state) {
  if (f.state === state) return;
  f.state = state;
  f.stateT = 0;
  f.poseT = 0;
}

function faceEachOther(a, b) {
  const dir = b.x >= a.x ? 1 : -1;
  a.facing = dir;
  b.facing = -dir;
  a.rig.rotation.y = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
  b.rig.rotation.y = dir > 0 ? -Math.PI / 2 : Math.PI / 2;
}

// ------------------------------------------------------------------
// engine
// ------------------------------------------------------------------
export function createKombatEngine(canvas, config) {
  const {
    playerId, cpuId, difficulty = 'normal',
    playerSpecials = [0, 1], cpuSpecials = [0, 1],
    arena = 0, hooks = {},
  } = config;
  const diff = DIFFICULTY[difficulty] || DIFFICULTY.normal;
  const H = (name, ...args) => { try { hooks[name]?.(...args); } catch { /* hook errors stay out of the loop */ } };

  // renderer / scene / camera
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 120);
  camera.position.set(0, 2.35, 8.8);

  scene.add(new THREE.HemisphereLight(0xbfd0ff, 0x201510, 0.85));
  const key = new THREE.DirectionalLight(0xffffff, 1.1);
  key.position.set(4, 8, 6);
  scene.add(key);

  const stage = buildArena(arena);
  scene.add(stage.group);
  scene.fog = new THREE.Fog(stage.fog.color, stage.fog.near, stage.fog.far);
  scene.background = new THREE.Color(stage.bg);

  const bursts = makeBurstPool(scene);
  const player = makeFighter(scene, playerId, -2.2, 1, playerSpecials, true, diff);
  const cpu = makeFighter(scene, cpuId, 2.2, -1, cpuSpecials, false, diff);

  // input (player)
  const input = { move: 0, block: false };
  const pressed = [];

  // match flow
  let phase = 'intro'; // intro | fight | roundEnd | preFinish | finishHim | fatality | koEnd | done
  let phaseT = 0;
  let round = 1;
  let timeLeft = ROUND_TIME;
  let timescale = 1;
  let slowmoT = 0;
  let hitstopT = 0;
  let zoomPulse = 0;
  let pendingWinner = null, pendingLoser = null;
  let fatalityDone = false;
  let announcedFight = false;
  let cpuFatalityAt = -1; // time within finishHim window when CPU performs fatality
  let drawReplay = false;
  let disposed = false;
  let lastHudSent = 0;
  let lastHudKey = '';

  const chestOf = (f) => new THREE.Vector3(f.x, 1.25, 0);

  function hudPayload() {
    return {
      p1: player.health / MAX_HEALTH, p2: cpu.health / MAX_HEALTH,
      p1Name: player.data.name, p2Name: cpu.data.name,
      time: Math.max(0, Math.ceil(timeLeft)),
      round, p1Rounds: player.rounds, p2Rounds: cpu.rounds,
      sp1cd: player.cooldowns[0] > 0 ? player.cooldowns[0] / Math.max(0.01, player.specials[0].cooldown) : 0,
      sp2cd: player.cooldowns[1] > 0 ? player.cooldowns[1] / Math.max(0.01, player.specials[1].cooldown) : 0,
      phase,
    };
  }
  function sendHud(force = false) {
    const now = performance.now();
    const p = hudPayload();
    const k = `${p.p1}|${p.p2}|${p.time}|${p.round}|${p.p1Rounds}|${p.p2Rounds}|${p.phase}|${p.sp1cd.toFixed(1)}|${p.sp2cd.toFixed(1)}`;
    if (force || k !== lastHudKey || now - lastHudSent > 250) {
      lastHudKey = k; lastHudSent = now;
      H('onHud', p);
    }
  }

  function slowmo(dur) { slowmoT = Math.max(slowmoT, dur); }

  // ---------------- attacks ----------------
  function tryAttack(f, kind) {
    if (phase !== 'fight') return false;
    if (!ACTIONABLE.has(f.state)) return false;
    if (f.hitstunT > 0) return false;
    const atk = ATTACKS[kind];
    f.attack = { kind, phase: 'startup', t: 0, didHit: false, spec: null, specIdx: -1 };
    setPoseState(f, atk.pose);
    // The CPU only ever learns about this after its reaction delay — no input reading.
    const foe = f.isPlayer ? cpu : player;
    if (!foe.isPlayer && foe.ai) {
      foe.ai.reactArmed = true;
      foe.ai.reactT = diff.reactionMs / 1000;
    }
    if (f.isPlayer) sfx.whiff();
    return true;
  }

  function trySpecial(f, idx) {
    if (phase !== 'fight') return false;
    if (!ACTIONABLE.has(f.state)) return false;
    if (f.hitstunT > 0) return false;
    const spec = f.specials[idx];
    if (!spec || f.cooldowns[idx] > 0) return false;
    f.attack = { kind: 'special', phase: 'startup', t: 0, didHit: false, spec, specIdx: idx };
    setPoseState(f, 'special');
    f.cooldowns[idx] = spec.cooldown;
    const foe = f.isPlayer ? cpu : player;
    if (!foe.isPlayer && foe.ai) {
      foe.ai.reactArmed = true;
      foe.ai.reactT = diff.reactionMs / 1000;
    }
    if (f.isPlayer) sfx.special();
    H('onSpecialUsed', f.isPlayer ? 0 : 1, idx);
    return true;
  }

  function tryDash(f, dir) {
    if (phase !== 'fight') return false;
    if (!ACTIONABLE.has(f.state)) return false;
    if (f.dashCd > 0) return false;
    const d = dir !== 0 ? Math.sign(dir) : f.facing;
    f.dashDir = d;
    f.dashT = 0.22;
    f.dashCd = 0.8;
    setPoseState(f, 'dash');
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

  function resolveHit(att, def) {
    const a = att.attack;
    let base, range, knockback, hitstun, heavyFx;
    if (a.kind === 'special') {
      const spec = a.spec;
      if (spec.damage <= 0) {
        // utility special: defensive ward (halves incoming damage for a while)
        att.wardT = WARD_SECONDS;
        bursts.spawn(chestOf(att), 0x66ccff, 20, 3, 0.7, 0.12);
        sfx.block();
        att.attack = null;
        setPoseState(att, 'idle');
        return;
      }
      base = spec.damage;
      range = 2.0 + SPECIAL_RANGE_BONUS;
      knockback = 1.2; hitstun = 0.6; heavyFx = true;
    } else {
      const t = ATTACKS[a.kind];
      base = t.base; range = t.range; knockback = t.knockback; hitstun = t.hitstun;
      heavyFx = a.kind === 'heavy';
    }

    const dist = Math.abs(att.x - def.x);
    const facingFoe = (att.x < def.x ? 1 : -1) === att.facing;
    if (dist > range + 0.35 || !facingFoe) return; // whiff

    const blocking = def.blockHeld && ACTIONABLE.has(def.state) && def.hitstunT <= 0
      && (def.x < att.x ? 1 : -1) === def.facing;

    let dmg = calcDamage(base, att.data.stats.power, def.data.stats.toughness);
    // combo: chaining hits within the window multiplies damage
    att.chain.count = att.chain.t < COMBO_WINDOW ? att.chain.count + 1 : 1;
    att.chain.t = 0;
    dmg = Math.round(dmg * (COMBO_MULT[Math.min(3, att.chain.count)] || 1));
    if (att.chain.count >= 2) H('onCombo', att.isPlayer ? 0 : 1, att.chain.count);
    if (def.wardT > 0) dmg = Math.max(1, Math.round(dmg * 0.5));

    const dir = def.x >= att.x ? 1 : -1;
    const mid = new THREE.Vector3((att.x + def.x) / 2, 1.25, 0.2);

    if (blocking) {
      const chip = calcBlockedDamage(dmg);
      def.health = Math.max(1, def.health - chip); // chip never KOs
      def.vel = knockback * 0.3 * dir;
      bursts.spawn(mid, 0x88aaff, 12, 2.5, 0.4, 0.1);
      sfx.block();
    } else {
      def.health = Math.max(0, def.health - dmg);
      def.hitstunT = hitstun;
      def.vel = knockback * dir;
      def.attack = null; // getting hit interrupts your own attack
      setPoseState(def, 'hit');
      def.blockHeld = false;
      // getting hit breaks your combo chain
      def.chain.count = 0;
      bursts.spawn(mid, heavyFx ? 0xff7722 : 0xffcc44, heavyFx ? 34 : 22, heavyFx ? 6 : 4.5, 0.6, 0.14);
      if (heavyFx) sfx.heavy(); else sfx.hit();
    }

    hitstopT = 0.06;
    zoomPulse = 1;
    sendHud(true);

    if (def.health <= 0 && !blocking) onKnockout(att, def);
  }

  function onKnockout(winner, loser) {
    loser.health = 0;
    loser.vel = 0;
    loser.blockHeld = false;
    loser.attack = null; // a KO'd fighter throws no more punches
    setPoseState(loser, 'ko');
    winner.rounds += 1;
    winner.attack = null;
    if (ACTIONABLE.has(winner.state)) setPoseState(winner, 'idle');
    sfx.ko();
    slowmo(1.3);
    sendHud(true);
    if (winner.rounds >= ROUNDS_TO_WIN) {
      pendingWinner = winner; pendingLoser = loser;
      phase = 'preFinish'; phaseT = 1.7;
      H('onAnnounce', 'K.O.!', '');
    } else {
      phase = 'roundEnd'; phaseT = 2.3;
      H('onAnnounce', 'K.O.!', `${winner.data.name} takes the round`);
    }
  }

  function startFinishHim() {
    const winner = pendingWinner, loser = pendingLoser;
    // loser staggers back up, dazed
    loser.health = 1;
    loser.wobble = true;
    setPoseState(loser, 'dizzy');
    setPoseState(winner, 'idle');
    phase = 'finishHim'; phaseT = FINISH_HIM_SECONDS;
    fatalityDone = false;
    H('onAnnounce', 'FINISH HIM!', '');
    H('onFinishHim', true, FINISH_HIM_SECONDS, winner.isPlayer);
    sfx.announce();
    // CPU winners sometimes perform their own fatality — scaled by
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
    const lp = chestOf(loser);
    bursts.spawn(lp, accent, 60, 7, 1.1, 0.18, 4);
    setTimeout(() => { if (!disposed) bursts.spawn(lp, 0xffffff, 40, 5, 0.9, 0.14, 5); }, 450);
    setTimeout(() => { if (!disposed) bursts.spawn(chestOf(winner), accent, 30, 4, 0.8, 0.13, 4); }, 900);
    sendHud(true);
  }

  function endMatch(winner, { fatality }) {
    const loser = winner === player ? cpu : player;
    setPoseState(winner, 'win');
    if (!fatality) setPoseState(loser, 'ko');
    phase = 'done';
    const flawless = winner.rounds === ROUNDS_TO_WIN && loser.rounds === 0;
    if (fatality) H('onAnnounce', 'FATALITY!', winner.data.fatality.name);
    else if (flawless) { H('onAnnounce', 'FLAWLESS VICTORY', ''); sfx.announce(); }
    else { H('onAnnounce', `${winner.data.name.toUpperCase()} WINS`, ''); sfx.announce(); }
    H('onMatchEnd', {
      winnerId: winner.id, winnerName: winner.data.name,
      isPlayer: winner.isPlayer, flawless, fatality,
      p1Rounds: player.rounds, p2Rounds: cpu.rounds,
    });
    sendHud(true);
  }

  function resetRoundPositions() {
    for (const [f, x, face] of [[player, -2.2, 1], [cpu, 2.2, -1]]) {
      f.x = x; f.facing = face; f.health = MAX_HEALTH;
      f.vel = 0; f.attack = null; f.hitstunT = 0;
      f.blockHeld = false; f.moveDir = 0;
      f.cooldowns = [0, 0]; f.wardT = 0;
      f.chain.count = 0; f.chain.t = 0;
      f.wobble = false; f.dashT = 0; f.dashCd = 0;
      setPoseState(f, 'idle');
      f.rig.position.set(x, 0, 0);
      f.rig.rotation.z = 0;
    }
    timeLeft = ROUND_TIME;
    announcedFight = false;
  }

  // ---------------- AI ----------------
  function aiThink() {
    const f = cpu, foe = player;
    const dist = Math.abs(f.x - foe.x);
    const toward = foe.x > f.x ? 1 : -1;
    const inRange = dist <= 2.2;

    if (inRange) {
      const r = Math.random();
      if (r < diff.aggression) {
        // attack: maybe a special, else heavy/light
        const readyIdx = f.specials.findIndex((s, i) => f.cooldowns[i] <= 0 && s.damage > 0);
        const wardIdx = f.specials.findIndex((s, i) => f.cooldowns[i] <= 0 && s.damage <= 0);
        if (readyIdx >= 0 && Math.random() < diff.specialChance) trySpecial(f, readyIdx);
        else if (wardIdx >= 0 && f.health < 45 && Math.random() < 0.5) trySpecial(f, wardIdx);
        else if (Math.random() < diff.heavyChance) tryAttack(f, 'heavy');
        else tryAttack(f, 'light');
        if (Math.random() < diff.retreatChance) f.ai.retreatT = 0.45;
      } else if (r < diff.aggression + 0.18) {
        f.ai.blockUntil = elapsed + 0.35 + Math.random() * 0.3;
      } else {
        f.ai.retreatT = 0.4;
      }
      f.ai.moveDir = 0;
    } else {
      // approach; sometimes dash in from far
      f.ai.moveDir = toward;
      if (dist > 4.2 && Math.random() < diff.dashChance) tryDash(f, toward);
      if (dist < 3.2 && Math.random() < 0.3) f.ai.blockUntil = elapsed + 0.25; // cautious approach
    }
  }

  function aiUpdate(dt) {
    const f = cpu, a = f.ai;
    if (!a || phase !== 'fight') { f.moveDir = 0; f.blockHeld = false; return; }
    a.thinkT -= dt;
    if (a.thinkT <= 0) {
      aiThink();
      a.thinkT = (diff.thinkMs / 1000) * (0.7 + Math.random() * 0.6);
    }
    // delayed reaction to the player's visible attack — fair, difficulty-scaled
    if (a.reactArmed) {
      a.reactT -= dt;
      if (a.reactT <= 0) {
        a.reactArmed = false;
        const dist = Math.abs(f.x - player.x);
        const playerAttacking = player.attack && player.attack.phase !== 'recovery';
        if (playerAttacking && dist < 2.9 && Math.random() < diff.blockChance) {
          a.blockUntil = elapsed + 0.4 + Math.random() * 0.35;
        }
      }
    }
    if (a.retreatT > 0) {
      a.retreatT -= dt;
      f.moveDir = player.x > f.x ? -1 : 1;
    } else if (ACTIONABLE.has(f.state) && f.hitstunT <= 0) {
      f.moveDir = a.moveDir;
    } else {
      f.moveDir = 0;
    }
    f.blockHeld = elapsed < a.blockUntil && ACTIONABLE.has(f.state);
  }

  // ---------------- per-fighter update ----------------
  function fighterUpdate(f, foe, dt) {
    f.stateT += dt;
    f.poseT += dt;
    f.walkT += dt;
    if (f.chain.t < COMBO_WINDOW) f.chain.t += dt; else f.chain.count = 0;
    for (let i = 0; i < 2; i++) if (f.cooldowns[i] > 0) f.cooldowns[i] = Math.max(0, f.cooldowns[i] - dt);
    if (f.wardT > 0) f.wardT -= dt;
    if (f.dashCd > 0) f.dashCd -= dt;
    if (f.hitstunT > 0) {
      f.hitstunT -= dt;
      if (f.hitstunT <= 0 && f.state === 'hit' && phase === 'fight') setPoseState(f, 'idle');
    }

    // knockback drift
    if (Math.abs(f.vel) > 0.01) {
      f.x += f.vel * dt;
      f.vel *= Math.max(0, 1 - 6 * dt);
    }

    // dash
    if (f.state === 'dash') {
      f.x += f.dashDir * 9 * dt;
      if (f.stateT >= 0.22) setPoseState(f, 'idle');
    }

    // attacks
    if (f.attack) {
      const a = f.attack;
      const timing = attackTiming(f);
      a.t += dt;
      if (a.phase === 'startup' && a.t >= timing.startup) {
        a.phase = 'active';
        if (!a.didHit) { a.didHit = true; resolveHit(f, foe); }
      } else if (a.phase === 'active' && a.t >= timing.startup + timing.active) {
        a.phase = 'recovery';
      } else if (a.phase === 'recovery' && a.t >= timing.startup + timing.active + timing.recovery) {
        f.attack = null;
        if (ACTIONABLE.has(f.state) || f.state === 'punch' || f.state === 'kick' || f.state === 'special') {
          setPoseState(f, 'idle');
        }
      }
    }

    // movement
    const canMove = ACTIONABLE.has(f.state) && f.hitstunT <= 0 && !f.blockHeld && phase === 'fight';
    if (canMove && f.moveDir !== 0) {
      f.x += f.moveDir * f.speed * dt;
      if (f.state === 'idle') setPoseState(f, 'walk');
    } else if (f.state === 'walk' && (f.moveDir === 0 || !canMove)) {
      setPoseState(f, 'idle');
    }

    f.x = Math.max(-ARENA_HALF_WIDTH, Math.min(ARENA_HALF_WIDTH, f.x));

    // pose
    let pose = 'idle';
    if (f.state === 'walk') pose = 'walk';
    else if (f.state === 'punch') pose = 'punch';
    else if (f.state === 'kick') pose = 'kick';
    else if (f.state === 'special') pose = 'special';
    else if (f.state === 'hit' || f.state === 'dizzy') pose = 'hit';
    else if (f.state === 'ko') pose = 'ko';
    else if (f.state === 'win') pose = 'win';
    else if (f.state === 'dash') pose = 'walk';
    else if (f.state === 'block' || (f.blockHeld && ACTIONABLE.has(f.state))) pose = 'block';
    poseRig(f.rig, pose, pose === 'walk' || pose === 'idle' ? f.walkT : f.poseT);
    updateEffects(f.rig, dt);

    // dizzy wobble (finish-him loser)
    f.rig.rotation.z = f.wobble ? Math.sin(f.walkT * 3.2) * 0.09 : 0;

    f.rig.position.x = f.x;
  }

  // ---------------- main loop ----------------
  const clock = new THREE.Clock();
  let elapsed = 0;
  let raf = 0;

  function resize() {
    const w = canvas.clientWidth || canvas.parentElement?.clientWidth || 360;
    const h = canvas.clientHeight || canvas.parentElement?.clientHeight || 480;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();

  const camBase = new THREE.Vector3(0, 2.35, 8.8);
  const camLook = new THREE.Vector3(0, 1.35, 0);
  const camTmp = new THREE.Vector3();
  const lookTmp = new THREE.Vector3();

  function frame() {
    if (disposed) return;
    raf = requestAnimationFrame(frame);
    let rawDt = Math.min(0.05, clock.getDelta());
    elapsed += rawDt;

    // timescale: hitstop > slow-mo > normal
    let ts = 1;
    if (hitstopT > 0) { hitstopT -= rawDt; ts = 0.05; }
    else if (slowmoT > 0) { slowmoT -= rawDt; ts = 0.18; }
    timescale = ts;
    const dt = rawDt * ts;

    phaseT -= rawDt;

    // phase flow
    if (phase === 'intro') {
      if (!announcedFight && phaseT <= 0.9) {
        announcedFight = true;
        H('onAnnounce', 'FIGHT!', '');
        sfx.announce();
      }
      if (phaseT <= 0) { phase = 'fight'; sendHud(true); }
    } else if (phase === 'fight') {
      timeLeft -= rawDt;
      if (timeLeft <= 0) {
        timeLeft = 0;
        const w = player.health > cpu.health ? player : cpu.health > player.health ? cpu : null;
        if (!w) {
          H('onAnnounce', 'DRAW', 'round replayed');
          phase = 'roundEnd'; phaseT = 1.6;
          pendingWinner = null;
          drawReplay = true;
        } else {
          const loser = w === player ? cpu : player;
          onKnockout(w, loser);
        }
      }
    } else if (phase === 'roundEnd') {
      if (phaseT <= 0) {
        if (!drawReplay) round += 1; // a draw replays the same round
        drawReplay = false;
        resetRoundPositions();
        phase = 'intro'; phaseT = 1.8;
        H('onAnnounce', `ROUND ${round}`, '');
        sendHud(true);
      }
    } else if (phase === 'preFinish') {
      if (phaseT <= 0) startFinishHim();
    } else if (phase === 'finishHim') {
      if (cpuFatalityAt > 0 && (FINISH_HIM_SECONDS - phaseT) >= cpuFatalityAt) {
        cpuFatalityAt = -1;
        doFatality(pendingWinner, pendingLoser);
      } else if (phaseT <= 0) {
        // window expired: normal KO
        const winner = pendingWinner, loser = pendingLoser;
        loser.wobble = false;
        setPoseState(loser, 'ko');
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

    // player input -> fighter
    if (phase === 'fight') {
      player.moveDir = player.blockHeld ? 0 : input.move;
      player.blockHeld = input.block && ACTIONABLE.has(player.state);
      for (const a of pressed.splice(0)) {
        if (a === 'light') tryAttack(player, 'light');
        else if (a === 'heavy') tryAttack(player, 'heavy');
        else if (a === 'dash') tryDash(player, player.moveDir !== 0 ? Math.sign(player.moveDir) : 0);
        else if (a === 'sp1') trySpecial(player, 0);
        else if (a === 'sp2') trySpecial(player, 1);
      }
    } else if (phase === 'finishHim') {
      for (const a of pressed.splice(0)) {
        if (a === 'fatality' && pendingWinner === player) doFatality(player, cpu);
      }
      player.moveDir = 0; player.blockHeld = false;
      cpu.moveDir = 0; cpu.blockHeld = false;
    } else {
      pressed.length = 0;
      player.moveDir = 0; cpu.moveDir = 0;
    }

    aiUpdate(dt);

    // separation
    faceEachOther(player, cpu);
    const dx = cpu.x - player.x;
    if (Math.abs(dx) < MIN_SEPARATION) {
      const push = (MIN_SEPARATION - Math.abs(dx)) / 2;
      const s = dx >= 0 ? 1 : -1;
      const pCan = player.state !== 'ko' && player.state !== 'dizzy';
      const cCan = cpu.state !== 'ko' && cpu.state !== 'dizzy';
      if (pCan) player.x -= push * s;
      if (cCan) cpu.x += push * s;
    }

    fighterUpdate(player, cpu, dt);
    fighterUpdate(cpu, player, dt);
    stage.update(dt, elapsed);
    bursts.update(dt);

    // camera: track midpoint, punch in on hits, cinematic swing for fatality
    zoomPulse = Math.max(0, zoomPulse - rawDt * 2.2);
    const midX = (player.x + cpu.x) / 2;
    if (phase === 'fatality') {
      const w = pendingWinner || player;
      camTmp.set(w.x * 0.6 + 2.6 * w.facing, 1.75, 4.6);
      lookTmp.set((w.x + (pendingLoser?.x ?? w.x)) / 2, 1.05, 0);
      camera.position.lerp(camTmp, 1 - Math.pow(0.001, rawDt));
      camLook.lerp(lookTmp, 1 - Math.pow(0.001, rawDt));
    } else {
      camTmp.set(THREE.MathUtils.clamp(midX * 0.35, -1.4, 1.4), 2.35, 8.8 - zoomPulse * 1.3);
      lookTmp.set(THREE.MathUtils.clamp(midX * 0.3, -1.2, 1.2), 1.35, 0);
      const k = 1 - Math.pow(0.0001, rawDt);
      camera.position.lerp(camTmp, k);
      camLook.lerp(lookTmp, k);
      if (phase === 'finishHim') {
        camera.position.x += Math.sin(elapsed * 40) * 0.012; // handheld tension
      }
    }
    camera.lookAt(camLook);

    sendHud();
    renderer.render(scene, camera);
  }

  // ---------------- public API ----------------
  const engine = {
    setMove(v) { input.move = Math.max(-1, Math.min(1, v || 0)); },
    setBlock(b) { input.block = !!b; },
    press(action) {
      if (['light', 'heavy', 'dash', 'sp1', 'sp2', 'fatality'].includes(action)) pressed.push(action);
    },
    start() {
      ac(); // unlock audio on the user's tap
      phase = 'intro'; phaseT = 1.8; round = 1;
      resetRoundPositions();
      H('onAnnounce', 'ROUND 1', `${player.data.name} vs ${cpu.data.name}`);
      sendHud(true);
      if (!raf) frame();
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      raf = 0;
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

  // announce ROUND 1 as soon as the loop starts (engine.start re-announces anyway)
  frame();
  H('onAnnounce', 'ROUND 1', `${player.data.name} vs ${cpu.data.name}`);
  phaseT = 1.8;

  return engine;
}
