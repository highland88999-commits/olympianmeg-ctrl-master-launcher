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
import { attachGlbFighter } from '../../lib/kombat/glb-fighter.js';
import { watchContextLoss } from '../../lib/webgl-support.js';
import {
  classifyKit, chooseSpecial, specialUsable, inBand, healAmountFor,
  statusDamageMul, statusSpeedMul, KIND_FX, BUFF_SECONDS, DEBUFF_SECONDS,
} from '../../lib/kombat/specials.js';
import { resolvePose } from '../../lib/kombat/pose-state.js';
import { temperamentFor, composeAiProfile, bloodlust } from '../../lib/kombat/temperament.js';
import { applyFloorClamp, solveFloorY } from '../../lib/kombat/floor.js';
import { duelFraming } from '../../lib/kombat/framing.js';
import { buildArena } from './arenas.js';
import { recordSoulArrival } from '../../lib/land-of-the-dead/souls.js';
import {
  MAX_HEALTH, ROUND_TIME, ROUNDS_TO_WIN, FINISH_HIM_SECONDS,
  COMBO_WINDOW, BLOCK_REDUCTION, ARENA_HALF_WIDTH, MIN_SEPARATION,
  DIFFICULTY, ATTACKS, SPECIAL_STARTUP, SPECIAL_ACTIVE, SPECIAL_RECOVERY,
  SPECIAL_RANGE_BONUS, WARD_SECONDS, COMBO_MULT, INPUT_BUFFER_SECONDS,
  calcDamage, calcBlockedDamage, walkSpeed,
  buildSpecialKit, specialIndexForAction, pickReadySpecial, cooldownFraction,
} from '../../lib/kombat/rules.js';

const ACTIONABLE = new Set(['idle', 'walk']);
const _floorBox = new THREE.Box3(); // shared floor-law measure (engine.js + brawl.js pattern)

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
  // STEP 5 — ALL SPECIALS LIVE: the full kit, always. A legacy
  // equip-2 selection (specialIdxs) is accepted for config compat
  // and no longer restricts the kit — old flows field every special.
  void specialIdxs;
  const { specials, cooldowns } = buildSpecialKit(data);
  // STEP 6 — specials carry logic: classify the kit once (kind +
  // range band per special) for execution and the AI policy.
  const specKinds = classifyKit(specials, fighterId);
  // STEP 6 — GLB SWAP: attach the fighter's real Tripo model under
  // the rig root. The procedural body stands in until the model
  // arrives, and stays forever if the load fails or no glbUrl exists.
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
    // Per-fighter combat temperament (lib/kombat/temperament.js):
    // attached to every fighter; only the AI consumes it — player
    // input handling never reads it.
    temperament: temperamentFor(fighterId),
    isPlayer,
    x, facing, // facing: +1 (toward +X) | -1
    health: MAX_HEALTH, rounds: 0,
    state: 'idle', stateT: 0, poseT: Math.random() * 10, walkT: Math.random() * 10,
    moveDir: 0, blockHeld: false,
    vel: 0, // knockback velocity along X
    dashT: 0, dashDir: 1, dashCd: 0,
    attack: null, // { kind:'light'|'heavy'|'special', phase, t, didHit, spec, specIdx, specKind }
    hitstunT: 0,
    specials, cooldowns, specKinds,
    wardT: 0, buffT: 0, debuffT: 0,
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

  // CONTEXT-LOSS RESILIENCE (2026-10-14, client_errors id 75 —
  // Merlin's own iPhone dropped this canvas's context mid-session):
  // while the context is lost the simulation FREEZES (it never plays
  // out blind behind a black canvas); three re-initializes on
  // webglcontextrestored, and if the context stays gone past the
  // grace window the page is told (onContextLost) so it can offer a
  // recoverable arena reload instead of a dead screen.
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
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 120);
  camera.position.set(0, 2.35, 8.8);
  // STEP 6 — framing state (set by resize() from lib/kombat/framing):
  // portrait viewports widen + pull back + shift the fight band up
  // above the pad row; landscape keeps the classic framing.
  const camBase = new THREE.Vector3(0, 2.35, 8.8);
  const camLookBase = new THREE.Vector3(0, 1.35, 0);

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
  // The CPU's concrete decision profile: difficulty x ITS fighter's
  // temperament, composed once (both are constant for the match).
  const cpuProfile = composeAiProfile(diff, cpu.temperament);

  // input (player)
  const input = { move: 0, block: false };
  const pressed = [];
  // INPUT BUFFER: the latest player press that arrived while the
  // fighter was briefly non-actionable, held for INPUT_BUFFER_SECONDS
  // and executed at the first legal frame (see rules.js). One slot —
  // the newest intent replaces the oldest.
  let bufferedPress = null; // { action, at }

  // ROUND-1 MODEL GATE (2026-10-14): a fighter's GLB used to swap
  // in whenever its parse finished — mid round 1 on a phone, so
  // round 1 fought as procedural puppets and round 2 as the real
  // models (Merlin's playtest). The match now holds in a 'summoning'
  // phase until BOTH models have settled (loaded OR failed), capped
  // at GLB_GATE_MS so a stalled network can never hang the game: on
  // timeout or failure the procedural bodies fight on — the fallback
  // law, unchanged. Fighters without a GLB never gate.
  const GLB_GATE_MS = 6000;
  const glbHandles = [player.glb, cpu.glb].filter(Boolean);
  let summoning = glbHandles.length > 0;
  let startRequested = false;
  let gateTimer = 0;

  // match flow
  let phase = summoning ? 'summoning' : 'intro'; // summoning | intro | fight | roundEnd | preFinish | finishHim | fatality | koEnd | done
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
    const k = `${p.p1}|${p.p2}|${p.time}|${p.round}|${p.p1Rounds}|${p.p2Rounds}|${p.phase}|${p.spcds.map((v) => v.toFixed(1)).join(',')}`;
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
    // The delay is the DEFENDER's own: difficulty base x its temperament.
    const foe = f.isPlayer ? cpu : player;
    if (!foe.isPlayer && foe.ai) {
      foe.ai.reactArmed = true;
      foe.ai.reactT = (diff.reactionMs * foe.temperament.reactionMul) / 1000;
    }
    if (f.isPlayer) sfx.whiff();
    return true;
  }

  // Attempt a special, reporting WHY it did not fire so the player
  // input path can tell a momentary state-block (bufferable — the
  // fighter is in hitstun / mid-attack / dashing and the press was
  // honest) from a real denial (on cooldown, condition gate, wrong
  // phase — never buffered, never queued behind the player's back).
  // Returns: 'fired' | 'state' | 'cooldown' | 'denied' | 'phase' | 'nospec'.
  function attemptSpecial(f, idx) {
    if (phase !== 'fight') return 'phase';
    if (!ACTIONABLE.has(f.state)) return 'state';
    if (f.hitstunT > 0) return 'state';
    const spec = f.specials[idx];
    if (!spec) return 'nospec';
    if (f.cooldowns[idx] > 0) return 'cooldown';
    const kind = f.specKinds[idx].kind;
    // STEP 6 — condition gates (shared with the AI policy): a heal
    // at full health, a ward while already warded, a buff while
    // already buffed are DENIED — no cooldown burned, honest blip.
    const foe0 = f.isPlayer ? cpu : player;
    const gate = specialUsable(spec, kind, f, foe0);
    if (!gate.ok) {
      if (f.isPlayer) { sfx.block(); H('onSpecialDenied', idx, gate.reason); }
      return 'denied';
    }
    f.attack = { kind: 'special', phase: 'startup', t: 0, didHit: false, spec, specIdx: idx, specKind: kind };
    setPoseState(f, 'special');
    // The cooldown is NOT committed here: it starts when the move
    // RESOLVES (fighterUpdate, startup -> active). Committing at press
    // time meant a fighter hit out of the 0.35s startup lost the move
    // AND burned the full cooldown — the pad shaded, nothing fired.
    const foe = f.isPlayer ? cpu : player;
    if (!foe.isPlayer && foe.ai) {
      foe.ai.reactArmed = true;
      foe.ai.reactT = (diff.reactionMs * foe.temperament.reactionMul) / 1000;
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

  // Dispatch ONE player press (the same mapping the pad path has
  // always used) and classify the outcome for the input buffer:
  // bufferable == the press failed ONLY because the fighter is
  // momentarily non-actionable (hitstun / mid-attack / dashing).
  // Inside the fight phase, tryAttack/tryDash can fail for no other
  // reason; specials report their own reason via attemptSpecial, and
  // real denials (cooldown / condition gate) are never buffered.
  function attemptPress(a) {
    if (a === 'light' || a === 'heavy') {
      const fired = tryAttack(player, a);
      return { fired, bufferable: !fired };
    }
    if (a === 'dash' || a === 'dashIn' || a === 'dashBack') {
      const dir = a === 'dashIn' ? player.facing
        : a === 'dashBack' ? -player.facing
        : (player.moveDir !== 0 ? Math.sign(player.moveDir) : 0);
      const fired = tryDash(player, dir);
      return { fired, bufferable: !fired };
    }
    const si = specialIndexForAction(a);
    if (si >= 0) {
      const r = attemptSpecial(player, si);
      return { fired: r === 'fired', bufferable: r === 'state' };
    }
    return { fired: false, bufferable: false };
  }

  function attackTiming(f) {
    const a = f.attack;
    if (!a) return null;
    if (a.kind === 'special') {
      return { startup: SPECIAL_STARTUP, active: SPECIAL_ACTIVE, recovery: SPECIAL_RECOVERY };
    }
    return ATTACKS[a.kind];
  }

  // STEP 6 — projectiles: traveling special attacks. An orb spawns
  // at the attacker's hand when a projectile-kind special goes
  // active and flies straight; contact resolves through landHit, so
  // blocking/ward/combo rules stay identical to melee.
  const projectiles = [];
  const projGeo = new THREE.SphereGeometry(0.16, 12, 10);
  function spawnProjectile(att, spec) {
    const mat = new THREE.MeshBasicMaterial({ color: KIND_FX.projectile.color });
    const mesh = new THREE.Mesh(projGeo, mat);
    mesh.position.set(att.x + att.facing * 0.75, 1.3, 0);
    scene.add(mesh);
    projectiles.push({ mesh, owner: att, spec, dir: att.facing, speed: 10.5, life: 1.8 });
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
      p.mesh.position.x += p.dir * p.speed * dt;
      const target = p.owner === player ? cpu : player;
      const dx = target.x - p.mesh.position.x;
      const crossed = (p.dir > 0 && dx <= 0.3 && dx > -0.6) || (p.dir < 0 && dx >= -0.3 && dx < 0.6);
      if (crossed && target.state !== 'ko') {
        landHit(p.owner, target, { base: p.spec.damage, knockback: 1.1, hitstun: 0.55, heavyFx: true });
        scene.remove(p.mesh);
        p.mesh.material.dispose();
        projectiles.splice(i, 1);
      } else if (p.life <= 0 || Math.abs(p.mesh.position.x) > ARENA_HALF_WIDTH + 1.5) {
        scene.remove(p.mesh);
        p.mesh.material.dispose();
        projectiles.splice(i, 1);
      }
    }
  }

  // The shared damage landing: combo chain, ward halving, status
  // multipliers, block/chip, hitstun, knockback, KO.
  function landHit(att, def, { base, knockback, hitstun, heavyFx, ignoreBlock = false, applyDebuff = false }) {
    const blocking = !ignoreBlock && def.blockHeld && ACTIONABLE.has(def.state) && def.hitstunT <= 0
      && (def.x < att.x ? 1 : -1) === def.facing;

    let dmg = calcDamage(base, att.data.stats.power, def.data.stats.toughness);
    // combo: chaining hits within the window multiplies damage
    att.chain.count = att.chain.t < COMBO_WINDOW ? att.chain.count + 1 : 1;
    att.chain.t = 0;
    dmg = Math.round(dmg * (COMBO_MULT[Math.min(3, att.chain.count)] || 1));
    if (att.chain.count >= 2) H('onCombo', att.isPlayer ? 0 : 1, att.chain.count);
    dmg = Math.max(1, Math.round(dmg * statusDamageMul(att, def)));
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
      if (applyDebuff) def.debuffT = DEBUFF_SECONDS;
      // getting hit breaks your combo chain
      def.chain.count = 0;
      bursts.spawn(mid, heavyFx ? 0xff7722 : 0xffcc44, heavyFx ? 34 : 22, heavyFx ? 6 : 4.5, 0.6, 0.14);
      if (applyDebuff) bursts.spawn(chestOf(def), KIND_FX.debuff.color, 16, 2.5, 0.5, 0.11);
      if (heavyFx) sfx.heavy(); else sfx.hit();
    }

    hitstopT = 0.06;
    zoomPulse = 1;
    sendHud(true);

    if (def.health <= 0 && !blocking) onKnockout(att, def);
  }

  function resolveHit(att, def) {
    const a = att.attack;
    let base, range, knockback, hitstun, heavyFx;
    let ignoreBlock = false, applyDebuff = false;
    if (a.kind === 'special') {
      const spec = a.spec;
      const kind = a.specKind || 'strike';
      // STEP 6 — per-kind execution (lib/kombat/specials.js). Self
      // kinds resolve on the user and never touch the opponent;
      // offensive kinds share landHit with kind-correct bands.
      if (kind === 'ward' || kind === 'heal' || kind === 'buff') {
        if (kind === 'ward') {
          att.wardT = WARD_SECONDS;
          bursts.spawn(chestOf(att), KIND_FX.ward.color, 22, 3, 0.7, 0.12);
          sfx.block();
        } else if (kind === 'heal') {
          att.health = Math.min(MAX_HEALTH, att.health + healAmountFor(spec));
          bursts.spawn(chestOf(att), KIND_FX.heal.color, 22, 2.5, 0.8, 0.12, 3);
          sfx.special();
        } else {
          att.buffT = BUFF_SECONDS;
          bursts.spawn(chestOf(att), KIND_FX.buff.color, 22, 3.5, 0.7, 0.12);
          sfx.special();
        }
        att.attack = null;
        setPoseState(att, 'idle');
        sendHud(true);
        return;
      }
      if (kind === 'projectile') {
        spawnProjectile(att, spec);
        sfx.special();
        return; // damage lands (or not) when the orb arrives — honest travel
      }
      if (kind === 'movement') {
        // close the distance NOW, then strike from arrival range
        const gap = 1.3;
        const target = def.x - att.facing * gap;
        bursts.spawn(chestOf(att), KIND_FX.movement.color, 14, 3, 0.4, 0.1);
        att.x = Math.max(-ARENA_HALF_WIDTH, Math.min(ARENA_HALF_WIDTH, target));
        bursts.spawn(chestOf(att), KIND_FX.movement.color, 14, 3, 0.4, 0.1);
      }
      base = spec.damage;
      hitstun = 0.6; heavyFx = true;
      // the classified band rules the reach (incl. data overrides)
      range = att.specKinds[a.specIdx] ? att.specKinds[a.specIdx].band[1] : 2.0 + SPECIAL_RANGE_BONUS;
      if (kind === 'grab') { knockback = 1.7; ignoreBlock = true; }
      else if (kind === 'debuff') { knockback = 1.0; applyDebuff = true; }
      else { knockback = 1.2; }
    } else {
      const t = ATTACKS[a.kind];
      base = t.base; range = t.range; knockback = t.knockback; hitstun = t.hitstun;
      heavyFx = a.kind === 'heavy';
    }

    const dist = Math.abs(att.x - def.x);
    const facingFoe = (att.x < def.x ? 1 : -1) === att.facing;
    if (dist > range + 0.35 || !facingFoe) return; // whiff — honest, per kind band

    landHit(att, def, { base, knockback, hitstun, heavyFx, ignoreBlock, applyDebuff });
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
    // STEP 6 — FINISH HIM renders ONCE: only the dedicated overlay
    // (onFinishHim) carries it now. Announcing it here too stacked a
    // second, offset copy of the text over the overlay (Merlin's
    // playtest recording, 2026-10-14).
    H('onFinishHim', true, FINISH_HIM_SECONDS, winner.isPlayer);
    sfx.announce();
    // CPU winners sometimes perform their own fatality — scaled by
    // difficulty (rare on easy, common on hard) and by the winner's
    // own brutality. Pure chance, never reads the player's inputs.
    if (!winner.isPlayer) {
      const p = Math.min(0.95, (diff.fatalityChance ?? 0) * winner.temperament.fatalityMul);
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
    // The Land of the Dead (Merlin, Nov 16 ~04:17): a fatality is a
    // death — the loser arrives there too, additive only. A KO alone
    // is NOT a death (the loser staggers back up for FINISH HIM), so
    // onKnockout is deliberately not wired. Guarded by fatalityDone
    // + phase, so this fires once per match. The loser's own fighter
    // dying is a user death; a CPU fighter is a creature.
    recordSoulArrival({
      kind: loser.isPlayer ? 'user' : 'creature',
      name: loser.data.name,
      origin: 'kombat',
      diedAt: Date.now(),
    });
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
    bufferedPress = null; // a held press never survives a round reset
    for (const [f, x, face] of [[player, -2.2, 1], [cpu, 2.2, -1]]) {
      f.x = x; f.facing = face; f.health = MAX_HEALTH;
      f.vel = 0; f.attack = null; f.hitstunT = 0;
      f.blockHeld = false; f.moveDir = 0;
      f.cooldowns = f.specials.map(() => 0); f.wardT = 0;
      f.buffT = 0; f.debuffT = 0;
      f.chain.count = 0; f.chain.t = 0;
      f.wobble = false; f.dashT = 0; f.dashCd = 0;
      setPoseState(f, 'idle');
      f.rig.position.set(x, 0, 0);
      f.rig.rotation.z = 0;
    }
    clearProjectiles();
    timeLeft = ROUND_TIME;
    announcedFight = false;
  }

  // The match proper begins here — immediately when no GLB gate
  // applies, or the moment the gate lifts (see liftGate below).
  function beginMatch() {
    ac(); // unlock audio on the user's tap
    phase = 'intro'; phaseT = 1.8; round = 1;
    resetRoundPositions();
    H('onAnnounce', 'ROUND 1', `${player.data.name} vs ${cpu.data.name}`);
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
      // Nobody called start() (never happens from the page, which
      // starts the engine on mount): fall back to the classic
      // construction-time intro so the arena never sits dead.
      phase = 'intro'; phaseT = 1.8;
      H('onAnnounce', 'ROUND 1', `${player.data.name} vs ${cpu.data.name}`);
      sendHud(true);
    }
  }

  // ---------------- AI ----------------
  function aiThink() {
    const f = cpu, foe = player;
    const t = f.temperament;
    const dist = Math.abs(f.x - foe.x);
    const toward = foe.x > f.x ? 1 : -1;
    const inRange = dist <= 2.2;
    // Temperament x difficulty, heated by bloodlust when the foe is
    // nearly finished and by a live combo chain (ferocity presses).
    let prof = bloodlust(cpuProfile, t, foe.health / MAX_HEALTH);
    if (f.chain.count > 0 && f.chain.t < COMBO_WINDOW) {
      prof = { ...prof, aggression: Math.min(0.97, prof.aggression + t.ferocity * 0.15) };
    }

    if (inRange) {
      const r = Math.random();
      if (r < prof.aggression) {
        // attack: maybe a special, else heavy/light — the AI picks
        // from the SAME full kit the player holds (Step 5 parity),
        // and since Step 6 the pick is LOGIC, not uniform-random:
        // chooseSpecial weighs kind, range band, both health totals
        // and live status effects (lib/kombat/specials.js).
        let acted = false;
        if (Math.random() < prof.specialChance) {
          const idx = chooseSpecial(f.specials, f.specKinds, f.cooldowns, {
            dist, selfHealth: f.health, foeHealth: foe.health,
            selfWardT: f.wardT, selfBuffT: f.buffT, foeDebuffT: foe.debuffT,
          }, Math.random);
          if (idx >= 0) acted = trySpecial(f, idx);
        }
        if (!acted) {
          if (Math.random() < prof.heavyChance) tryAttack(f, 'heavy');
          else tryAttack(f, 'light');
        }
        if (Math.random() < prof.retreatChance) f.ai.retreatT = 0.45;
      } else if (r < prof.aggression + 0.18) {
        f.ai.blockUntil = elapsed + 0.35 + Math.random() * 0.3;
      } else {
        f.ai.retreatT = 0.4;
      }
      f.ai.moveDir = 0;
    } else {
      // approach; from range, logic may still fire — a projectile, a
      // buff, a heal, or a dash-in special beats walking into range
      let acted = false;
      if (Math.random() < prof.specialChance) {
        const idx = chooseSpecial(f.specials, f.specKinds, f.cooldowns, {
          dist, selfHealth: f.health, foeHealth: foe.health,
          selfWardT: f.wardT, selfBuffT: f.buffT, foeDebuffT: foe.debuffT,
        }, Math.random);
        if (idx >= 0) acted = trySpecial(f, idx);
      }
      f.ai.moveDir = acted ? 0 : toward;
      // dash in from far — or, for a pressure fighter already inside
      // its pressure range, dash the last gap instead of strolling
      if (!acted && (dist > 4.2 || (dist > 3 && dist <= t.pressureRange)) && Math.random() < prof.dashChance) tryDash(f, toward);
      // cautious approach — a vicious fighter barely guards while closing
      if (dist < 3.2 && Math.random() < 0.3 * (1 - t.fury)) f.ai.blockUntil = elapsed + 0.25;
    }
  }

  function aiUpdate(dt) {
    const f = cpu, a = f.ai;
    if (!a || phase !== 'fight') { f.moveDir = 0; f.blockHeld = false; return; }
    a.thinkT -= dt;
    // ferocity: while a combo chain is live, the next decision
    // comes sooner — pressure fighters keep swinging.
    if (f.chain.count > 0 && f.chain.t < COMBO_WINDOW) {
      a.thinkT -= dt * f.temperament.ferocity * 1.5;
    }
    if (a.thinkT <= 0) {
      aiThink();
      a.thinkT = (cpuProfile.thinkMs / 1000) * (0.7 + Math.random() * 0.6);
    }
    // delayed reaction to the player's visible attack — fair, difficulty-scaled
    if (a.reactArmed) {
      a.reactT -= dt;
      if (a.reactT <= 0) {
        a.reactArmed = false;
        const dist = Math.abs(f.x - player.x);
        const playerAttacking = player.attack && player.attack.phase !== 'recovery';
        if (playerAttacking && dist < 2.9 && Math.random() < cpuProfile.blockChance) {
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
    for (let i = 0; i < f.cooldowns.length; i++) if (f.cooldowns[i] > 0) f.cooldowns[i] = Math.max(0, f.cooldowns[i] - dt);
    if (f.wardT > 0) f.wardT -= dt;
    if (f.buffT > 0) f.buffT -= dt;
    if (f.debuffT > 0) f.debuffT -= dt;
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
        if (!a.didHit) {
          a.didHit = true;
          // COOLDOWN COMMITS AT RESOLUTION, not at press: a special
          // interrupted during startup (the attack object destroyed by
          // an incoming hit) never reaches this line, so it never
          // burns its cooldown. A special that resolves — hit, chip,
          // or honest whiff — always pays. Same rule for player + AI:
          // both resolve through this one transition.
          if (a.kind === 'special' && a.specIdx >= 0) f.cooldowns[a.specIdx] = a.spec.cooldown;
          resolveHit(f, foe);
        }
      } else if (a.phase === 'active' && a.t >= timing.startup + timing.active) {
        a.phase = 'recovery';
      } else if (a.phase === 'recovery' && a.t >= timing.startup + timing.active + timing.recovery) {
        f.attack = null;
        if (ACTIONABLE.has(f.state) || f.state === 'punch' || f.state === 'kick' || f.state === 'special') {
          setPoseState(f, 'idle');
        }
      }
    }

    // movement (status effects bend speed: buff hastes, curse slows)
    const canMove = ACTIONABLE.has(f.state) && f.hitstunT <= 0 && !f.blockHeld && phase === 'fight';
    if (canMove && f.moveDir !== 0) {
      f.x += f.moveDir * f.speed * statusSpeedMul(f) * dt;
      if (f.state === 'idle') setPoseState(f, 'walk');
    } else if (f.state === 'walk' && (f.moveDir === 0 || !canMove)) {
      setPoseState(f, 'idle');
    }

    f.x = Math.max(-ARENA_HALF_WIDTH, Math.min(ARENA_HALF_WIDTH, f.x));

    // pose — one shared resolver for both engines (downed-state law:
    // 'ko' pose iff the fighter is actually downed)
    const pose = resolvePose({
      state: f.state, alive: f.state !== 'ko',
      blockHeld: f.blockHeld, actionable: ACTIONABLE.has(f.state),
    });
    if (f.glb && f.glb.isReady()) {
      // STEP 6 — the real model, posed by the code pose driver
      const timing = f.attack ? attackTiming(f) : null;
      f.glb.update(pose, dt, elapsed, {
        moveDir: f.moveDir,
        specKind: f.attack?.specKind,
        actionT: f.attack ? f.attack.t : null,
        actionDur: timing ? timing.startup + timing.active + timing.recovery : null,
      });
    } else {
      poseRig(f.rig, pose, pose === 'walk' || pose === 'idle' ? f.walkT : f.poseT);
    }
    updateEffects(f.rig, dt);

    // dizzy wobble (finish-him loser)
    f.rig.rotation.z = f.wobble ? Math.sin(f.walkT * 3.2) * 0.09 : 0;

    f.rig.position.x = f.x;
    // FLOOR LAW (shared update path): the GLB body is floor-safe by
    // construction (driver lift/fall math) and gets the root clamp;
    // the procedural body gets the geometric clamp — its posed box
    // is measured and the root solved so its lowest point rests ON
    // the plane in every pose.
    if (f.glb && f.glb.isReady()) {
      applyFloorClamp(f.rig);
    } else {
      _floorBox.setFromObject(f.rig);
      if (Number.isFinite(_floorBox.min.y)) {
        f.rig.position.y = solveFloorY(f.rig.position.y, _floorBox.min.y, 0);
      }
    }
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
    // STEP 6 — framing vs pads: at phone aspects the fighters play
    // in the clear band above the pad row, never under a pad.
    const fr = duelFraming(w / h, ARENA_HALF_WIDTH);
    camera.fov = fr.fovY;
    if (fr.shiftUpFrac > 0) camera.setViewOffset(w, h, 0, Math.round(fr.shiftUpFrac * h), w, h);
    else camera.clearViewOffset();
    camera.updateProjectionMatrix();
    camBase.set(0, fr.camY, fr.camZ);
    camLookBase.set(0, fr.lookY, 0);
  }
  window.addEventListener('resize', resize);
  resize();

  const camLook = new THREE.Vector3(0, 1.35, 0);
  const camTmp = new THREE.Vector3();
  const lookTmp = new THREE.Vector3();

  function frame() {
    if (disposed) return;
    raf = requestAnimationFrame(frame);
    // Context lost: freeze the whole simulation (timers included)
    // rather than playing out blind; the loop stays alive so a
    // restore resumes mid-match exactly where it froze. Past the
    // grace window, tell the page once so it can offer a reload.
    if (contextLost) {
      if (!contextLossReported && performance.now() - contextLostAt > 3500) {
        contextLossReported = true;
        H('onContextLost', true);
      }
      return;
    }
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
    if (phase === 'summoning') {
      // Models still loading: fighters idle in place, camera and
      // render stay live behind the page's SUMMONING veil; no
      // timers run and no input is consumed (presses are discarded
      // by the input branch below, as in every non-fight phase).
    } else if (phase === 'intro') {
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
      // INPUT BUFFERING — the buffered intent is the OLDEST honest
      // press, so it gets the first legal frame before any fresh tap.
      // It is dropped the moment it fires, stops being bufferable
      // (e.g. its special's condition gate denies it at the legal
      // frame — the denial feedback fires then), or ages out.
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
      for (const a of pressed.splice(0)) {
        if (a === 'fatality' && pendingWinner === player) doFatality(player, cpu);
      }
      player.moveDir = 0; player.blockHeld = false;
      cpu.moveDir = 0; cpu.blockHeld = false;
    } else {
      pressed.length = 0;
      bufferedPress = null;
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
    updateProjectiles(dt);
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
      camTmp.set(THREE.MathUtils.clamp(midX * 0.35, -1.4, 1.4), camBase.y, camBase.z - zoomPulse * 1.3);
      lookTmp.set(THREE.MathUtils.clamp(midX * 0.3, -1.2, 1.2), camLookBase.y, 0);
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
      if (['light', 'heavy', 'dash', 'dashIn', 'dashBack', 'sp1', 'sp2', 'sp3', 'sp4', 'sp5', 'sp6', 'fatality'].includes(action)) pressed.push(action);
    },
    start() {
      // While the model gate holds, remember the request — the
      // match begins the moment both GLBs settle (liftGate), never
      // on procedural bodies when real models exist.
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
    // Hold ROUND 1 until both models settle (or the cap expires);
    // beginMatch does the announcing when the gate lifts.
    H('onSummoning', true);
    gateTimer = setTimeout(liftGate, GLB_GATE_MS);
    Promise.allSettled(glbHandles.map((h) => h.ready)).then(liftGate);
  } else {
    // announce ROUND 1 as soon as the loop starts (engine.start re-announces anyway)
    H('onAnnounce', 'ROUND 1', `${player.data.name} vs ${cpu.data.name}`);
    phaseT = 1.8;
  }

  return engine;
}
