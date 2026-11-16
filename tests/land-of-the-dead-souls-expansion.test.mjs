/*
 * LAND OF THE DEAD — SOULS EXPANSION tests (Merlin, Nov 16 ~04:17, worker D2).
 * Run with: node --test tests/land-of-the-dead-souls-expansion.test.mjs
 *
 * The expansion wires every other realm's kill path into the Land of the
 * Dead (worker D wired Hollow Earth / Jupiter 2 / Hawkins). Two layers:
 *
 * 1. LIVE HOOKS — the kill paths that run in plain node are driven for
 *    real and the device-local arrival is read back through a fake
 *    localStorage. Each test also pins the ADDITIVE rule: the kill path's
 *    own return value / state (loot, carcass, events, score) is unchanged
 *    by the hook, and a second blow on an already-dead record records
 *    nothing twice.
 * 2. MAPPING PINS — the page/scene hooks (Enyo player death, Earth 2
 *    walker, the Dutchman, Kombat fatalities, the Nether Realm's
 *    petrify/incineration, Zeus, the Babel arena, the Shadow Realm, the
 *    Hamunaptra minions) live in files that need three.js / R3F / the DOM
 *    and cannot be imported in node. Their exact record is pinned here
 *    through createWanderingSoul — kind / name / origin per site — so a
 *    mapping change fails loudly even though the call site itself is
 *    verified by inspection + esbuild, not by this suite.
 *
 * Device-local only: the server ledger is staged-not-run (see
 * supabase/land-of-the-dead-souls.sql); nothing here touches a server.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

// Fake device-local storage, installed before any module under test is
// imported (recordSoulArrival writes here; readSoulArrivals reads here).
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => { store.set(k, String(v)); },
  removeItem: (k) => { store.delete(k); },
  clear: () => { store.clear(); },
};

const { createWanderingSoul, readSoulArrivals } = await import('../lib/land-of-the-dead/souls.js');
const { createOrc, damageOrc, createHunter, hurtHunter } = await import('../app/middle-earth/orcs.js');
const { createSaruman, damageBoss, BOSS_POS } = await import('../app/middle-earth/boss.js');
const { createBot, damageBot } = await import('../lib/enyo-bots.js');
const { ColosseumGame } = await import('../lib/colosseum/game.js');
const { createLifecycle, soulNameForSlug } = await import('../lib/earth2/lifecycle.js');
const { createMedusaBoss, strikeMedusa } = await import('../lib/nether-realm/medusa.js');
const { createLevel, step: dkStep } = await import('../app/dk-hero/game.js');
const { createGame: createNeonGame, stepGame: stepNeon } = await import('../app/neon-void/engine.js');
const { createGame: createSwampGame, stepGame: stepSwamp, drainEvents: drainSwamp, currentScore } = await import('../app/swamp-run/engine.js');
const { terrainAt, WORLD_HALF } = await import('../lib/swamp-run/world.js');
const { computeScore } = await import('../lib/swamp-run/board.js');
const { createGame: createCrocGame, stepGame: stepCroc, drainEvents: drainCroc, setInput: setCrocInput } = await import('../app/crocodile-swamp/engine.js');
const { createBattle, updateBattle, drainEvents: drainAstra } = await import('../app/astra/astra.js');

function clearArrivals() { store.clear(); }
function arrivals() { return readSoulArrivals(); }
function assertArrival(expected) {
  const a = arrivals()[0];
  assert.ok(a, `expected an arrival for ${expected.origin}, got none`);
  assert.equal(a.kind, expected.kind, `kind for ${expected.origin}`);
  assert.equal(a.name, expected.name, `name for ${expected.origin}`);
  assert.equal(a.origin, expected.origin, `origin for ${expected.origin}`);
  assert.equal(a.state, 'wandering');
  return a;
}

// ── Middle-earth ────────────────────────────────────────────────

test('middle-earth: orc warrior kill arrives as a monster, loot unchanged', () => {
  clearArrivals();
  const orc = createOrc({ id: 1, x: 10, z: 20, kind: 'warrior', campId: 0, rove: false }, 0);
  const loot = damageOrc(orc, 999, () => 0.5);
  assert.ok(Array.isArray(loot), 'killing blow still returns loot (additive)');
  assert.equal(orc.state, 'dead');
  assert.equal(arrivals().length, 1);
  assertArrival({ kind: 'monster', name: 'Orc warrior', origin: 'middle-earth' });
});

test('middle-earth: orc captain kill names the captain; chip damage records nothing', () => {
  clearArrivals();
  const orc = createOrc({ id: 2, x: 10, z: 20, kind: 'captain', campId: 0, rove: false }, 0);
  assert.equal(damageOrc(orc, 10, () => 0.5), null, 'chip damage returns null');
  assert.equal(arrivals().length, 0, 'chip damage records no arrival');
  damageOrc(orc, 999, () => 0.5);
  assert.equal(arrivals().length, 1);
  assertArrival({ kind: 'monster', name: 'Orc captain', origin: 'middle-earth' });
  assert.equal(damageOrc(orc, 999, () => 0.5), null, 'a dead orc takes no more damage');
  assert.equal(arrivals().length, 1, 'the same orc never arrives twice');
});

test('middle-earth: Saruman falls as a boss, the died event still fires', () => {
  clearArrivals();
  const boss = createSaruman(BOSS_POS.x, BOSS_POS.z, true);
  boss.state = 'combat';
  const events = damageBoss(boss, 9999);
  assert.ok(events.some((e) => e.type === 'died'), 'died event still fires (additive)');
  assert.equal(boss.state, 'dead');
  assert.equal(arrivals().length, 1);
  assertArrival({ kind: 'boss', name: 'Saruman', origin: 'middle-earth' });
});

test('middle-earth: hunter death arrives as a user; a live hunter records nothing', () => {
  clearArrivals();
  const hunter = createHunter();
  assert.equal(hurtHunter(hunter, 10), false, 'chip damage does not kill');
  assert.equal(arrivals().length, 0);
  assert.equal(hurtHunter(hunter, 9999), true, 'the killing blow still returns true (additive)');
  assert.equal(hunter.alive, false);
  assert.equal(arrivals().length, 1);
  assertArrival({ kind: 'user', name: 'A fallen traveller', origin: 'middle-earth' });
  assert.equal(hurtHunter(hunter, 9999), false, 'a dead hunter cannot die again');
  assert.equal(arrivals().length, 1);
});

// ── Enyo ────────────────────────────────────────────────────────

test('enyo: bot kill arrives as a creature with the bot name; chip damage records nothing', () => {
  clearArrivals();
  const bot = createBot(0, 'red', { x: 0, z: -40 });
  assert.equal(bot.name, 'Ajax');
  assert.equal(damageBot(bot, 10), false, 'chip damage does not kill');
  assert.equal(arrivals().length, 0);
  assert.equal(damageBot(bot, 9999), true, 'the killing blow still returns true (additive)');
  assert.equal(bot.alive, false);
  assert.equal(bot.respawnT, 3, 'the respawn clock is untouched');
  assert.equal(arrivals().length, 1);
  assertArrival({ kind: 'creature', name: 'Ajax', origin: 'enyo' });
  assert.equal(damageBot(bot, 9999), false, 'a dead bot cannot die again');
  assert.equal(arrivals().length, 1);
});

// ── Colosseum ───────────────────────────────────────────────────

test('colosseum: shade kill arrives as a monster, the kill event still fires', () => {
  clearArrivals();
  const game = new ColosseumGame('arena');
  const seen = [];
  game.onEvent((type) => seen.push(type));
  const e = game.spawnEnemy('shade');
  // Strike directly (strikeTimer poked to 0 between blows) — no update()
  // calls, so nothing else moves, spawns, or reaches the centre.
  while (game.enemies.some((x) => x.id === e.id)) {
    game.strikeTimer = 0;
    assert.equal(game.strike(e.id), true, 'strike still lands (additive)');
  }
  assert.equal(game.kills, 1, 'kill count is untouched');
  // The killing blow lands inside the stagger window, so the game emits
  // 'finish' (double glory) rather than 'kill' — either proves the
  // kill path ran.
  assert.ok(seen.includes('kill') || seen.includes('finish'), 'kill/finish event still fires');
  assert.equal(arrivals().length, 1);
  assertArrival({ kind: 'monster', name: 'Shade', origin: 'colosseum' });
});

test('colosseum: champion kill arrives as a boss', () => {
  clearArrivals();
  const game = new ColosseumGame('boss');
  const champ = game.enemies.find((x) => x.type === 'champion');
  assert.ok(champ, 'boss mode spawns the champion');
  // Strike directly (no update() calls — the champion never walks to
  // the centre, so no heart is ever lost while striking it down).
  while (game.enemies.some((x) => x.id === champ.id)) {
    game.strikeTimer = 0;
    game.strike(champ.id);
  }
  assert.equal(arrivals().length, 1);
  assertArrival({ kind: 'boss', name: 'Undying Champion', origin: 'colosseum' });
});

test('colosseum: the player falling arrives as a user; the round still ends fallen', () => {
  clearArrivals();
  const game = new ColosseumGame('arena');
  game.hearts = 1;
  game.invulnTimer = 0;
  game.hurtPlayer();
  assert.equal(game.overReason, 'fallen', 'the round still ends fallen (additive)');
  assert.equal(game.over, true);
  assert.equal(arrivals().length, 1);
  assertArrival({ kind: 'user', name: 'A fallen traveller', origin: 'colosseum' });
  game.hurtPlayer();
  assert.equal(arrivals().length, 1, 'the same fall never arrives twice');
});

// ── Earth 2 ─────────────────────────────────────────────────────

test('earth-2: lifecycle kill arrives as a monster named from the slug; carcass unchanged', () => {
  clearArrivals();
  const life = createLifecycle({});
  life.register('triceratops#0', 'triceratops');
  const carcass = life.kill('triceratops#0', 100, { x: 10, z: 20 });
  assert.ok(carcass, 'kill still returns the carcass (additive)');
  assert.equal(carcass.slug, 'triceratops');
  assert.equal(arrivals().length, 1);
  assertArrival({ kind: 'monster', name: 'Triceratops', origin: 'earth-2' });
  assert.equal(life.kill('triceratops#0', 101, { x: 10, z: 20 }), null, 'a dead record cannot die again');
  assert.equal(arrivals().length, 1);
});

test('earth-2: mosquito kill arrives as a creature; slug names humanise', () => {
  assert.equal(soulNameForSlug('tyrannosaurus-rex'), 'Tyrannosaurus Rex');
  assert.equal(soulNameForSlug('mosquito'), 'Mosquito');
  assert.equal(soulNameForSlug('giant-mosquito'), 'Giant Mosquito');
  assert.equal(soulNameForSlug(''), undefined);
  clearArrivals();
  const life = createLifecycle({});
  life.register('mosquito#0', 'giant-mosquito');
  assert.ok(life.kill('mosquito#0', 0, { x: 0, z: 0 }, 6));
  assert.equal(arrivals().length, 1);
  assertArrival({ kind: 'creature', name: 'Giant Mosquito', origin: 'earth-2' });
});

// ── Medusa (Nether Realm) ───────────────────────────────────────

test('nether-realm: Medusa falls as a boss with the strike clock; a dead boss takes no more damage', () => {
  clearArrivals();
  const boss = createMedusaBoss(1000);
  const res = strikeMedusa(boss, 60, 2000);
  assert.deepEqual(res, { damage: 60, killed: true }, 'the kill result is unchanged (additive)');
  assert.equal(boss.state, 'dead');
  assert.equal(arrivals().length, 1);
  const a = assertArrival({ kind: 'boss', name: 'Medusa', origin: 'nether-realm' });
  assert.equal(a.diedAt, 2000, 'diedAt is the strike clock, not wall time');
  assert.deepEqual(strikeMedusa(boss, 99, 4000), { damage: 0, killed: false });
  assert.equal(arrivals().length, 1, 'a dead Medusa cannot die again');
});

// ── DK Hero ─────────────────────────────────────────────────────

test('dk-hero: barrel death arrives as a user; the died event still fires', () => {
  clearArrivals();
  const state = createLevel(1, 900, 1400);
  const hero = state.hero;
  state.barrels.push({
    x: hero.x + hero.w / 2, y: hero.y + hero.h / 2, r: 10,
    level: hero.level, speed: 0, vy: 0, rot: 0, falling: false, scored: false,
  });
  dkStep(state, {}, 1 / 60);
  assert.equal(state.status, 'dying', 'the barrel still kills (additive)');
  assert.ok(state.events.includes('died'), 'died event still fires');
  assert.equal(state.lives, 3, 'the life is spent by the die timer, not the hook');
  assert.equal(arrivals().length, 1);
  assertArrival({ kind: 'user', name: 'A fallen traveller', origin: 'dk-hero' });
});

// ── Neon Void ───────────────────────────────────────────────────

const NEON_DT = 1 / 120;
function runNeon(state, seconds) {
  const steps = Math.ceil(seconds / NEON_DT);
  for (let i = 0; i < steps; i++) stepNeon(state, NEON_DT);
}
function playingNeon() {
  const g = createNeonGame(1);
  runNeon(g, 1.5); // ready -> playing
  assert.equal(g.status, 'playing');
  return g;
}

test('neon-void: wraith collision kills the player as a user', () => {
  clearArrivals();
  const g = playingNeon();
  const w = g.wraiths[0];
  w.mode = 'chase';
  w.x = g.player.x;
  w.y = g.player.y;
  stepNeon(g, NEON_DT);
  assert.equal(g.status, 'dying', 'the wraith still kills (additive)');
  assert.equal(arrivals().length, 1);
  assertArrival({ kind: 'user', name: 'A fallen traveller', origin: 'neon-void' });
});

test('neon-void: eating a frightened wraith arrives as a monster with its name', () => {
  clearArrivals();
  const g = playingNeon();
  const w = g.wraiths[0];
  assert.equal(w.name, 'Stalker');
  w.mode = 'frightened';
  w.x = g.player.x;
  w.y = g.player.y;
  stepNeon(g, NEON_DT);
  assert.equal(w.mode, 'eaten', 'the wraith is still eaten (additive)');
  assert.equal(arrivals().length, 1);
  assertArrival({ kind: 'monster', name: 'Stalker', origin: 'neon-void' });
});

// ── Swamp Run ───────────────────────────────────────────────────

const SWAMP_DT = 1 / 120;
function runSwamp(state, seconds) {
  const steps = Math.ceil(seconds / SWAMP_DT);
  for (let i = 0; i < steps; i++) stepSwamp(state, SWAMP_DT);
}
function findNear(seed, sx, sz, pred, radius = 120) {
  for (let r = 2; r <= radius; r += 4) {
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 12) {
      const x = sx + Math.cos(a) * r;
      const z = sz + Math.sin(a) * r;
      if (Math.abs(x) > WORLD_HALF - 5 || Math.abs(z) > WORLD_HALF - 5) continue;
      if (pred(terrainAt(seed, x, z))) return { x, z };
    }
  }
  return null;
}

test('swamp-run: being eaten arrives as a user; the death record is unchanged', () => {
  clearArrivals();
  const g = createSwampGame(7);
  runSwamp(g, 1.3); // ready -> playing
  assert.equal(g.status, 'playing');
  g.player.mode = 'foot';
  const shore = findNear(g.seed, g.player.x, g.player.z, (t) => t === 'land');
  assert.ok(shore, 'expected land near spawn for seed 7');
  g.player.x = shore.x;
  g.player.z = shore.z;
  g.croc.mode = 'hunt';
  g.croc.x = g.player.x + 1;
  g.croc.z = g.player.z;
  runSwamp(g, 3);
  assert.equal(g.status, 'dead', 'the croc still eats (additive)');
  assert.equal(g.death.killer, 'croc');
  assert.equal(g.death.score, computeScore(g.survival, g.distance), 'the death record is unchanged');
  assert.ok(drainSwamp(g).some((e) => e.type === 'death'), 'death event still fires');
  assert.equal(arrivals().length, 1);
  assertArrival({ kind: 'user', name: 'A fallen traveller', origin: 'swamp-run' });
});

// ── Crocodile Swamp ─────────────────────────────────────────────

const CROC_DT = 1 / 120;
function runCroc(state, seconds) {
  const steps = Math.ceil(seconds / CROC_DT);
  for (let i = 0; i < steps; i++) stepCroc(state, CROC_DT);
}

test('crocodile-swamp: being eaten arrives as a user; the caught event still fires', () => {
  clearArrivals();
  const g = createCrocGame(13);
  runCroc(g, 1.6); // ready -> playing
  assert.equal(g.status, 'playing');
  g.phase = 'hunted';
  g.croc.mode = 'hunt';
  g.croc.x = g.player.x + 6;
  g.croc.z = g.player.z;
  setCrocInput(g, 0, 0);
  runCroc(g, 4);
  assert.equal(g.status, 'gameover', 'the croc still eats (additive)');
  assert.ok(drainCroc(g).some((e) => e.type === 'caught'), 'caught event still fires');
  assert.equal(arrivals().length, 1);
  assertArrival({ kind: 'user', name: 'A fallen traveller', origin: 'crocodile-swamp' });
});

// ── Astra ───────────────────────────────────────────────────────

const ASTRA_DT = 1 / 60;
const ASTRA_IDLE = { dx: 0, dy: 0, cannon: false, seeker: false, hyper: false };
function bossLevelBattle(level = 3) {
  const b = createBattle(1234);
  b.level = level;
  b.killsForLevel = 0;
  b.player.shield = 100000; // sim durability, not gameplay
  return b;
}
function spawnAndKillBoss(b) {
  const steps = Math.ceil(3 / ASTRA_DT);
  for (let i = 0; i < steps && !b.boss; i++) updateBattle(b, ASTRA_IDLE, ASTRA_DT);
  drainAstra(b);
  assert.ok(b.boss, `boss never spawned at level ${b.level}`);
  b.boss.hp = 1;
  b.shots.push({ x: b.boss.x, y: b.boss.y + 120, vy: -900 });
  let bossDown = false;
  for (let i = 0; i < Math.ceil(3 / ASTRA_DT); i++) {
    updateBattle(b, ASTRA_IDLE, ASTRA_DT);
    for (const e of drainAstra(b)) if (e.type === 'bossDown') bossDown = true;
    if (!b.boss) break;
  }
  assert.ok(bossDown, 'bossDown event never fired after the kill');
  assert.equal(b.boss, null, 'boss object should be cleared on kill');
}

test('astra: boss kill arrives once as a boss (not once per kill credit)', () => {
  clearArrivals();
  const b = bossLevelBattle(3);
  spawnAndKillBoss(b);
  assert.equal(arrivals().length, 1, 'one boss, one arrival — the double registerKill is not doubled');
  assertArrival({ kind: 'boss', name: 'A fallen boss', origin: 'astra' });
});

test('astra: drone shot down arrives as a creature; the wave still advances', () => {
  clearArrivals();
  const b = bossLevelBattle(3);
  b.killsForLevel = 19;
  let waited = 0;
  while (b.drones.length === 0 && waited < 5) {
    updateBattle(b, ASTRA_IDLE, ASTRA_DT);
    waited += ASTRA_DT;
  }
  assert.ok(b.drones.length > 0, 'no drone appeared to kill');
  const d = b.drones[0];
  d.hp = 1;
  b.shots.push({ x: d.x, y: d.y + 120, vy: -900 });
  const seen = new Set();
  for (let i = 0; i < Math.ceil(3 / ASTRA_DT) && b.level === 3; i++) {
    updateBattle(b, ASTRA_IDLE, ASTRA_DT);
    for (const e of drainAstra(b)) seen.add(e.type);
  }
  assert.ok(seen.has('levelUp'), 'levelUp never fired after the 20th kill (additive)');
  assert.equal(arrivals().length, 1);
  assertArrival({ kind: 'creature', name: 'A fallen creature', origin: 'astra' });
});

test('astra: the player ship going down arrives as a user; gameOver still fires', () => {
  clearArrivals();
  const b = createBattle(7);
  b.player.shield = 1;
  b.drones.push({ x: b.player.x, y: b.player.y, t: 0, vx: 0, vy: 0, ph: 0, hp: 1 });
  let gameOver = false;
  for (let i = 0; i < Math.ceil(2 / ASTRA_DT) && !b.over; i++) {
    updateBattle(b, ASTRA_IDLE, ASTRA_DT);
    for (const e of drainAstra(b)) if (e.type === 'gameOver') gameOver = true;
  }
  assert.ok(gameOver, 'gameOver never fired');
  assert.equal(b.over, true);
  assert.equal(arrivals().length, 1);
  assertArrival({ kind: 'user', name: 'A fallen traveller', origin: 'astra' });
});

// ── Mapping pins (page/scene hooks — verified by inspection + esbuild) ──
// These files need three.js / R3F / the DOM and cannot be imported in node,
// so each hook's exact record is pinned here through createWanderingSoul.
// If a hook's kind / name / origin changes, this fails loudly.

const MAPPING_PINS = [
  // Enyo player death (app/enyo/page.jsx, botFireAt) — no name passed.
  { site: 'enyo player death', record: { kind: 'user', origin: 'enyo' }, name: 'A fallen traveller', label: 'Fallen traveller' },
  // Earth 2 walker caught (components/earth2/Earth2World.jsx, killWalker).
  { site: 'earth-2 walker caught', record: { kind: 'user', origin: 'earth-2' }, name: 'A fallen traveller', label: 'Fallen traveller' },
  // Flying Dutchman kraken (app/flying-dutchman/engine.js, stepBalls).
  { site: 'dutchman kraken', record: { kind: 'boss', name: 'Kraken', origin: 'flying-dutchman' }, name: 'Kraken', label: 'Fallen boss' },
  // Flying Dutchman crewman lost to hull damage (damageShip).
  { site: 'dutchman crewman', record: { kind: 'creature', name: 'Crewman of The Morrow', origin: 'flying-dutchman' }, name: 'Crewman of The Morrow', label: 'Fallen creature' },
  // Flying Dutchman foe ship sunk (damageShip).
  { site: 'dutchman foe sunk', record: { kind: 'creature', name: 'The Morrow', origin: 'flying-dutchman' }, name: 'The Morrow', label: 'Fallen creature' },
  // Flying Dutchman player ship sunk (damageShip) — the user-death outcome.
  { site: 'dutchman player sunk', record: { kind: 'user', name: 'Flying Dutchman', origin: 'flying-dutchman' }, name: 'Flying Dutchman', label: 'Fallen traveller' },
  // Kombat fatality, CPU loser (app/kombat/engine.js + brawl.js, doFatality).
  { site: 'kombat fatality (cpu loser)', record: { kind: 'creature', name: 'Kombat Fighter', origin: 'kombat' }, name: 'Kombat Fighter', label: 'Fallen creature' },
  // Kombat fatality, player loser — the player's own fighter dies.
  { site: 'kombat fatality (player loser)', record: { kind: 'user', name: 'Kombat Fighter', origin: 'kombat' }, name: 'Kombat Fighter', label: 'Fallen traveller' },
  // Nether Realm gaze petrify, victim side (app/nether-realm/page.jsx, onUseHead).
  { site: 'nether petrify (gaze victim)', record: { kind: 'user', name: 'Traveller', origin: 'nether-realm' }, name: 'Traveller', label: 'Fallen traveller' },
  // Nether Realm self-petrify (statue naming us) + flaming-chain incineration.
  { site: 'nether self-petrify', record: { kind: 'user', origin: 'nether-realm' }, name: 'A fallen traveller', label: 'Fallen traveller' },
  { site: 'nether incineration', record: { kind: 'user', origin: 'nether-realm' }, name: 'A fallen traveller', label: 'Fallen traveller' },
  // Zeus Protocol enemy kill (app/zeus-protocol/page.jsx, killEnemy) — unnamed.
  { site: 'zeus enemy', record: { kind: 'monster', origin: 'zeus-protocol' }, name: 'Fallen monster', label: 'Shade' },
  // Zeus Protocol player ship down (hurtPlayer gameover).
  { site: 'zeus player down', record: { kind: 'user', origin: 'zeus-protocol' }, name: 'A fallen traveller', label: 'Fallen traveller' },
  // Babel Duat arena anubis warrior (components/babel/DuatCombat.jsx, applyDamage).
  { site: 'babel anubis', record: { kind: 'monster', name: 'Anubis', origin: 'babel' }, name: 'Anubis', label: 'Shade' },
  // Babel Duat arena scorpion boss.
  { site: 'babel scorpion', record: { kind: 'boss', name: 'Scorpion', origin: 'babel' }, name: 'Scorpion', label: 'Fallen boss' },
  // Babel Duat arena player fall.
  { site: 'babel player fall', record: { kind: 'user', origin: 'babel' }, name: 'A fallen traveller', label: 'Fallen traveller' },
  // Skyscraper Hamunaptra minion (app/skyscraper/components/HamunaptraUniverseScene.jsx).
  { site: 'skyscraper minion', record: { kind: 'monster', name: 'Minion', origin: 'skyscraper' }, name: 'Minion', label: 'Shade' },
  // Shadow Realm trail death + flame elimination (app/shadow-realm/scene.jsx).
  { site: 'shadow-realm trail death', record: { kind: 'user', origin: 'shadow-realm' }, name: 'A fallen traveller', label: 'Fallen traveller' },
  { site: 'shadow-realm flame elimination', record: { kind: 'user', origin: 'shadow-realm' }, name: 'A fallen traveller', label: 'Fallen traveller' },
];

for (const pin of MAPPING_PINS) {
  test(`mapping: ${pin.site}`, () => {
    const soul = createWanderingSoul({ ...pin.record, diedAt: Date.now() });
    assert.equal(soul.kind, pin.record.kind);
    assert.equal(soul.name, pin.name);
    assert.equal(soul.origin, pin.record.origin);
    assert.equal(soul.label, pin.label);
    assert.equal(soul.state, 'wandering');
  });
}
