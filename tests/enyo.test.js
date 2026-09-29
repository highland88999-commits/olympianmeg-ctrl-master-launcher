// tests/enyo.test.js — Headless tests for the ENYO arena shooter.
// Run: node tests/enyo.test.js (from the repo root).
// No browser, no network — asserts on lib/enyo-bots.js logic plus
// source-level checks (module registration, no telemetry).
import { readFileSync } from 'fs';
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
  BOT_HP,
  BOT_RESPAWN_DELAY,
  BOT_SEEK_RANGE,
  BOT_SKILLS,
  SKILL_KEYS,
  skillByKey,
  hasLineOfSight,
  nearestVisibleEnemy,
} from '../lib/enyo-bots.js';

let passed = 0;
let failed = 0;
function t(name, cond) {
  if (cond) {
    passed++;
  } else {
    failed++;
    console.error('FAIL:', name);
  }
}
const approx = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

// --- weapons ----------------------------------------------------------------
t('3 weapons', WEAPON_KEYS.length === 3);
t(
  'weapon keys',
  ['rifle', 'smg', 'marksman'].every((k) => WEAPON_KEYS.includes(k))
);
for (const k of WEAPON_KEYS) {
  const w = WEAPONS[k];
  t(`${k}: sane stats`, w.damage > 0 && w.rpm > 0 && w.magSize > 0 && w.reserveAmmo > 0 && w.reloadTime > 0);
  t(`${k}: falloff ordered`, w.falloffNear < w.falloffFar && w.falloffMin > 0 && w.falloffMin < 1);
  t(`${k}: spread sane`, w.spreadDeg >= 0 && w.spreadDeg < 10);
}
t('weaponByKey fallback', weaponByKey('nope').key === 'rifle');
t('fireInterval rifle ~0.1s', approx(fireInterval(WEAPONS.rifle), 0.1));
t('fireInterval smg faster than rifle', fireInterval(WEAPONS.smg) < fireInterval(WEAPONS.rifle));
t('marksman slowest', fireInterval(WEAPONS.marksman) > fireInterval(WEAPONS.rifle));
t('marksman hits hardest', WEAPONS.marksman.damage > WEAPONS.rifle.damage && WEAPONS.rifle.damage > WEAPONS.smg.damage);

// --- damage falloff ------------------------------------------------------------
const rifle = WEAPONS.rifle;
t('falloff: full up close', damageAt(rifle, 5) === rifle.damage);
t('falloff: full at near edge', damageAt(rifle, rifle.falloffNear) === rifle.damage);
t('falloff: decreases with distance', damageAt(rifle, 40) < damageAt(rifle, 20));
t('falloff: clamps at floor', approx(damageAt(rifle, 500), rifle.damage * rifle.falloffMin));
t('falloff: monotonic', (() => {
  let prev = Infinity;
  for (let d = 0; d <= 120; d += 5) {
    const v = damageAt(rifle, d);
    if (v > prev + 1e-9) return false;
    prev = v;
  }
  return true;
})());

// --- spread ----------------------------------------------------------------------
{
  const rng = mulberry32(7);
  const d = applySpread({ x: 0, y: 0, z: -1 }, 2, rng);
  t('spread: normalized', approx(Math.hypot(d.x, d.y, d.z), 1, 1e-6));
  t('spread: roughly forward', d.z < -0.9);
  const d0 = applySpread({ x: 0, y: 0, z: -1 }, 0, mulberry32(7));
  t('spread: zero spread is identity', approx(d0.x, 0) && approx(d0.y, 0) && approx(d0.z, -1));
}

// --- bot AI -------------------------------------------------------------------------
{
  const rng = mulberry32(42);
  const bot = createBot(2, 'red', { x: 0, z: -40 });
  t('bot: full hp on spawn', bot.hp === BOT_HP && bot.alive);

  // Far enemy -> seek (move toward).
  const far = [{ id: 'p', team: 'blue', pos: { x: 0, z: 40 }, dead: false }];
  const intentsFar = botThink(bot, far, 0.016, rng);
  t('bot far: seeks', bot.state === 'seek' && intentsFar.some((i) => i.type === 'move'));

  // Mid-range enemy -> strafe.
  bot.pos = { x: 0, z: 0 };
  const mid = [{ id: 'p', team: 'blue', pos: { x: 0, z: 15 }, dead: false }];
  const intentsMid = botThink(bot, mid, 0.016, rng);
  t('bot mid: strafes', bot.state === 'strafe' && intentsMid.some((i) => i.type === 'move'));

  // Point blank -> fallback.
  const near = [{ id: 'p', team: 'blue', pos: { x: 0, z: 3 }, dead: false }];
  botThink(bot, near, 0.016, rng);
  t('bot close: falls back', bot.state === 'fallback');

  // Fires within a few seconds at mid range.
  let fired = false;
  for (let i = 0; i < 400 && !fired; i++) {
    const ins = botThink(bot, mid, 0.05, rng);
    if (ins.some((x) => x.type === 'fire')) fired = true;
  }
  t('bot: fires at mid range', fired);

  // Ignores teammates, targets nearest enemy.
  const mixed = [
    { id: 'mate', team: 'red', pos: { x: 1, z: 1 }, dead: false },
    { id: 'e1', team: 'blue', pos: { x: 0, z: 20 }, dead: false },
    { id: 'e2', team: 'blue', pos: { x: 0, z: 10 }, dead: false },
  ];
  let sawFire = null;
  for (let i = 0; i < 400 && !sawFire; i++) {
    const ins = botThink(bot, mixed, 0.05, rng);
    const f = ins.find((x) => x.type === 'fire');
    if (f) sawFire = f;
  }
  t('bot: fires at nearest enemy only', sawFire && sawFire.targetId === 'e2');

  // Death + respawn.
  const killed = damageBot(bot, 9999);
  t('bot: lethal damage kills', killed && !bot.alive && bot.respawnT === BOT_RESPAWN_DELAY);
  let respawned = false;
  for (let i = 0; i < 300 && !respawned; i++) {
    const ins = botThink(bot, mid, 0.05, rng);
    if (ins.some((x) => x.type === 'respawned')) respawned = true;
  }
  t('bot: respawns after delay', respawned && bot.alive && bot.hp === BOT_HP);

  // Non-lethal damage doesn't kill.
  const b2 = createBot(3, 'blue', { x: 0, z: 0 });
  t('bot: chip damage survives', damageBot(b2, 10) === false && b2.alive && b2.hp === BOT_HP - 10);
}

// --- bot shot resolution ---------------------------------------------------------------
{
  const rng = mulberry32(1234);
  const w = WEAPONS.rifle;
  let closeHits = 0;
  let farHits = 0;
  const N = 2000;
  for (let i = 0; i < N; i++) if (resolveBotShot(8, w, rng).hit) closeHits++;
  for (let i = 0; i < N; i++) if (resolveBotShot(60, w, rng).hit) farHits++;
  t('bot shots: hit chance falls with distance', closeHits > farHits);
  t('bot shots: close range hits sometimes', closeHits > N * 0.2);
  t('bot shots: long range rarely hits', farHits < N * 0.5);
}

// --- bot skill / difficulty ---------------------------------------------------
t('3 skill levels', SKILL_KEYS.length === 3 && ['recruit', 'regular', 'veteran'].every((k) => SKILL_KEYS.includes(k)));
t('skillByKey fallback', skillByKey('nope').key === 'regular');
for (const k of SKILL_KEYS) {
  const s = BOT_SKILLS[k];
  t(`${k}: sane skill stats`, s.speedMul > 0 && s.reactionMul > 0 && s.accuracyMul > 0 && s.name && s.desc);
}
t('skill: recruit slower than veteran', BOT_SKILLS.recruit.speedMul < BOT_SKILLS.veteran.speedMul);
t('skill: recruit reacts slower than veteran', BOT_SKILLS.recruit.reactionMul > BOT_SKILLS.veteran.reactionMul);
t('skill: recruit less accurate than veteran', BOT_SKILLS.recruit.accuracyMul < BOT_SKILLS.veteran.accuracyMul);
{
  const rb = createBot(0, 'red', { x: 0, z: 0 }, 'recruit');
  const vb = createBot(1, 'red', { x: 0, z: 0 }, 'veteran');
  const nb = createBot(2, 'red', { x: 0, z: 0 });
  t('createBot: stores skill', rb.skillKey === 'recruit' && vb.skillKey === 'veteran');
  t('createBot: default skill regular', nb.skillKey === 'regular');
  t('createBot: speed scales with skill', rb.speed < nb.speed && nb.speed < vb.speed);
}
{
  const rng = mulberry32(99);
  const w = WEAPONS.rifle;
  let recHits = 0;
  let vetHits = 0;
  const N = 3000;
  for (let i = 0; i < N; i++) if (resolveBotShot(20, w, rng, 'recruit').hit) recHits++;
  for (let i = 0; i < N; i++) if (resolveBotShot(20, w, rng, 'veteran').hit) vetHits++;
  t('skill: veterans out-shoot recruits', vetHits > recHits);
  t('skill: default equals regular', (() => {
    const a = mulberry32(5);
    const b = mulberry32(5);
    let da = 0;
    let db = 0;
    for (let i = 0; i < 500; i++) {
      if (resolveBotShot(20, w, a).hit) da++;
      if (resolveBotShot(20, w, b, 'regular').hit) db++;
    }
    return da === db;
  })());
}

// --- line of sight -------------------------------------------------------------
{
  const wall = { x: 0, z: 10, w: 6, d: 2, h: 3 }; // tall wall between a and b
  const lowCrate = { x: 0, z: 10, w: 6, d: 2, h: 1.2 }; // low rubble: no block
  const a = { x: 0, z: 0 };
  const b = { x: 0, z: 20 };
  t('los: clear path', hasLineOfSight(a, b, []));
  t('los: tall wall blocks', !hasLineOfSight(a, b, [wall]));
  t('los: low crate does not block', hasLineOfSight(a, b, [lowCrate]));
  t('los: wall beside the path does not block', hasLineOfSight(a, b, [{ x: 10, z: 10, w: 6, d: 2, h: 3 }]));
  t('los: diagonal blocked', !hasLineOfSight({ x: -8, z: 0 }, { x: 8, z: 20 }, [wall]));
}

// --- LOS-aware engagement + waypoint wander -------------------------------------
{
  const rng = mulberry32(7);
  const wall = { x: 0, z: 10, w: 30, d: 2, h: 3 };
  const obs = [wall];
  const wps = [
    { x: -20, z: 0 },
    { x: 20, z: 0 },
  ];
  const bot = createBot(0, 'red', { x: 0, z: 0 });
  const hidden = [{ id: 'p', team: 'blue', pos: { x: 0, z: 20 }, dead: false }];
  const seen = nearestVisibleEnemy(bot, hidden, obs);
  t('los: hidden enemy not targeted', seen === null);
  // With the wall up and waypoints given, the bot wanders instead of firing.
  let firedHidden = false;
  for (let i = 0; i < 120; i++) {
    const ins = botThink(bot, hidden, 0.05, rng, { obstacles: obs, waypoints: wps });
    if (ins.some((x) => x.type === 'fire')) firedHidden = true;
    // apply movement so the bot actually walks its circuit
    const mv = ins.find((x) => x.type === 'move');
    if (mv) {
      bot.pos.x += mv.dx * 0.05;
      bot.pos.z += mv.dz * 0.05;
    }
  }
  t('los: no fire through the wall', !firedHidden);
  t('wander: moves toward waypoints while blind', Math.abs(bot.pos.x) > 1);
  // Wall removed: same enemy is engaged.
  const bot2 = createBot(1, 'red', { x: 0, z: 0 });
  const seen2 = nearestVisibleEnemy(bot2, hidden, []);
  t('los: visible enemy targeted', seen2 && seen2.target.id === 'p');
  let firedSeen = false;
  for (let i = 0; i < 400 && !firedSeen; i++) {
    const ins = botThink(bot2, hidden, 0.05, rng, { obstacles: [], waypoints: wps });
    if (ins.some((x) => x.type === 'fire')) firedSeen = true;
  }
  t('los: fires once line of sight opens', firedSeen);
  // Reaction delay: a fresh bot does not fire on its very first tick.
  const bot3 = createBot(2, 'red', { x: 0, z: 0 });
  const first = botThink(bot3, [{ id: 'p', team: 'blue', pos: { x: 0, z: 15 }, dead: false }], 0.016, rng);
  t('reaction: no instant fire on acquire', !first.some((x) => x.type === 'fire'));
}

// --- source-level checks ------------------------------------------------------------------
{
  const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '');
  const lib = strip(readFileSync('lib/enyo-bots.js', 'utf8'));
  t('lib: no telemetry/fetch', !/fetch\(|telemetry|phone|supabase|https?:\/\//i.test(lib));
  t('lib: no three import', !/from 'three'|require\(['"]three/.test(lib));

  const page = strip(readFileSync('app/enyo/page.jsx', 'utf8'));
  t('page: use client', page.includes("'use client'"));
  t('page: pointer lock', /requestPointerLock/.test(page));
  t('page: three maps', /Ruined Plaza/.test(page) && /Neon Depot/.test(page) && /Dust Hollow/.test(page));
  t('page: wasd + mobile', /wasd/i.test(page) && /touch/i.test(page));
  t('page: reduced motion', /prefers-reduced-motion/.test(page));
  t('page: no telemetry/fetch', !/fetch\(|central_telemetry|phone.?home|supabase|https?:\/\//i.test(page));
  t('page: no external assets', !/['"`]\S+\.(mp4|mov|glb|fbx|gltf)\b|https?:\/\/[^'"`\s]*\.(mp4|mov|glb|fbx)/i.test(page));
  t('page: bots not human-like', /armored figure|procedural combatant/i.test(page));
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
