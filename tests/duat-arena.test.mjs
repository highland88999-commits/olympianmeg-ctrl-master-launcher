// Headless tests for lib/babel/duat-arena.js — run with: node tests/duat-arena.test.mjs
import {
  WAVE_TOTAL,
  WEAPONS,
  REWARD_SURVIVOR_BARS,
  REWARD_CONSOLATION_BARS,
  enemyStatsForWave,
  bossStatsForWave,
  applyPlayerMemory,
  loadMemory,
  saveMemory,
  recordMatch,
  rewardForMatch,
  playersStub,
} from '../lib/babel/duat-arena.js';

let passed = 0;
let failed = 0;
function ok(name, cond) {
  if (cond) { passed++; }
  else { failed++; console.error('FAIL:', name); }
}
function near(a, b, eps = 1e-6) { return Math.abs(a - b) <= eps; }

// --- in-memory localStorage stub (module only touches storage when present) ---
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear(),
};

// --- WAVE_TOTAL ---
ok('wave total is 10', WAVE_TOTAL === 10);

// --- enemyStatsForWave: wave-1 base values ---
const w1 = enemyStatsForWave(1);
ok('wave 1 count is 5', w1.count === 5);
ok('wave 1 hp is 30', w1.hp === 30);
ok('wave 1 damage is 8', w1.damage === 8);
ok('wave 1 speed is 4.2', near(w1.speed, 4.2));
ok('wave 1 attackRange is 2.2', near(w1.attackRange, 2.2));
ok('wave 1 attackCd is 1400', w1.attackCd === 1400);

// --- enemyStatsForWave: wave 10 strictly harder on every axis ---
const w10 = enemyStatsForWave(10);
ok('wave 10 count > wave 1', w10.count > w1.count);
ok('wave 10 hp > wave 1', w10.hp > w1.hp);
ok('wave 10 damage > wave 1', w10.damage > w1.damage);
ok('wave 10 speed > wave 1', w10.speed > w1.speed);
ok('wave 10 hp formula spot-check', w10.hp === Math.round(30 * (1 + 0.15 * 9) * (1 + 0.02 * Math.pow(9, 1.5))));
ok('wave 10 damage formula spot-check', w10.damage === Math.round(8 * (1 + 0.10 * 9)));

// --- enemyStatsForWave: count caps at 23 ---
ok('count caps at 23', enemyStatsForWave(10).count === 23);
ok('speed capped at 5.4', enemyStatsForWave(10).speed <= 5.4);

// --- difficulty is monotonic across all waves ---
let mono = true;
for (let w = 2; w <= WAVE_TOTAL; w++) {
  const a = enemyStatsForWave(w - 1);
  const b = enemyStatsForWave(w);
  if (!(b.hp >= a.hp && b.damage >= a.damage && b.speed >= a.speed && b.count >= a.count)) mono = false;
}
ok('enemy stats monotonic wave-over-wave (1..10)', mono);

// --- bossStatsForWave ---
const b1 = bossStatsForWave(1);
ok('boss wave 1 hp is 320', b1.hp === 320);
ok('boss wave 1 damage is 18', b1.damage === 18);
ok('boss wave 1 speed is 3.0', near(b1.speed, 3.0));
ok('boss wave 1 attackRange is 4.0', near(b1.attackRange, 4.0));
const b10 = bossStatsForWave(10);
ok('boss wave 10 hp = 1040', b10.hp === 1040);
ok('boss wave 10 damage > wave 1', b10.damage > b1.damage);
ok('boss hp monotonic across waves', Array.from({ length: 9 }, (_, i) => bossStatsForWave(i + 1).hp <= bossStatsForWave(i + 2).hp).every(Boolean));

// --- applyPlayerMemory ---
const bumped = applyPlayerMemory({ hp: 100, damage: 10, speed: 5 }, { maxWaveReached: 0 });
ok('memory: wave 0 gives no bump', near(bumped.hp, 100) && near(bumped.damage, 10) && near(bumped.speed, 5));
const fresh = applyPlayerMemory({ hp: 100, damage: 10, speed: 5 }, { maxWaveReached: 3 });
ok('memory: wave 3 is the on-ramp, no bump', fresh.hp === 100);
const vet = applyPlayerMemory({ hp: 100, damage: 10, speed: 5 }, { maxWaveReached: 8 });
ok('memory: wave 8 gives +10%', vet.hp === 110 && vet.damage === 11 && near(vet.speed, 5.5));
const legend = applyPlayerMemory({ hp: 100, damage: 10, speed: 5 }, { maxWaveReached: 100 });
ok('memory: bump caps at +15%', legend.hp === 115 && legend.damage === 12 && near(legend.speed, 5.75));
ok('memory: missing memory object is safe', applyPlayerMemory({ hp: 100, damage: 10, speed: 5 }, null).hp === 100);

// --- rewards ledger ---
ok('survivor reward constant is 0.5', REWARD_SURVIVOR_BARS === 0.5);
ok('consolation reward constant is 0.1', REWARD_CONSOLATION_BARS === 0.1);
ok('victory + survived = 0.5', rewardForMatch({ victory: true, survived: true }) === 0.5);
ok('victory + defeated = 0.1', rewardForMatch({ victory: true, survived: false }) === 0.1);
ok('defeat + survived = 0', rewardForMatch({ victory: false, survived: true }) === 0);
ok('defeat + defeated = 0', rewardForMatch({ victory: false, survived: false }) === 0);

// --- WEAPONS table ---
ok('sword is melee with arc + cooldown', WEAPONS.sword.kind === 'melee' && WEAPONS.sword.damage === 25 && WEAPONS.sword.range === 3.6 && WEAPONS.sword.arcDeg === 100 && WEAPONS.sword.cooldownMs === 500);
ok('blaster is hitscan', WEAPONS.blaster.kind === 'hitscan' && WEAPONS.blaster.damage === 15 && WEAPONS.blaster.range === 42 && WEAPONS.blaster.cooldownMs === 260);
ok('bow is projectile with speed', WEAPONS.bow.kind === 'projectile' && WEAPONS.bow.damage === 20 && WEAPONS.bow.range === 34 && WEAPONS.bow.speed === 34 && WEAPONS.bow.cooldownMs === 800);
ok('staff is aoe projectile', WEAPONS.staff.kind === 'projectile' && WEAPONS.staff.aoe === 3 && WEAPONS.staff.damage === 12 && WEAPONS.staff.range === 30 && WEAPONS.staff.speed === 22 && WEAPONS.staff.cooldownMs === 420);

// --- memory: loadMemory defaults on empty storage ---
store.clear();
let m = loadMemory();
ok('empty storage returns defaults', m.matchesEntered === 0 && m.maxWaveReached === 0 && m.totalKills === 0 && m.goldBars === 0 && m.lastPlayedAt === null);

// --- memory: corrupt storage returns defaults, never throws ---
store.set('babel-duat-arena-memory', 'not-json{{{{');
m = loadMemory();
ok('corrupt storage returns defaults', m.matchesEntered === 0 && m.maxWaveReached === 0 && m.totalKills === 0);
store.set('babel-duat-arena-memory', JSON.stringify([1, 2, 3]));
m = loadMemory();
ok('non-object storage returns defaults', m.matchesEntered === 0);

// --- memory: saveMemory round-trips ---
saveMemory({ matchesEntered: 2, maxWaveReached: 5, totalKills: 40, goldBars: 1.5, lastPlayedAt: 123 });
m = loadMemory();
ok('saved memory round-trips', m.matchesEntered === 2 && m.maxWaveReached === 5 && m.totalKills === 40 && near(m.goldBars, 1.5) && m.lastPlayedAt === 123);

// --- memory: recordMatch accumulates + ratchets + persists ---
store.clear();
let r = recordMatch(loadMemory(), { victory: true, waveReached: 4, kills: 18, barsEarned: 0.5 });
ok('recordMatch: one match entered', r.matchesEntered === 1);
ok('recordMatch: kills accumulate', r.totalKills === 18);
ok('recordMatch: bars accumulate', near(r.goldBars, 0.5));
ok('recordMatch: maxWaveReached set', r.maxWaveReached === 4);
ok('recordMatch: lastPlayedAt stamped', typeof r.lastPlayedAt === 'number');
r = recordMatch(r, { victory: false, waveReached: 2, kills: 7, barsEarned: 0 });
ok('recordMatch: kills keep accumulating', r.totalKills === 25);
ok('recordMatch: maxWaveReached never decreases', r.maxWaveReached === 4);
ok('recordMatch: zero bars add nothing', near(r.goldBars, 0.5));
ok('recordMatch: two matches entered', r.matchesEntered === 2);
const reloaded = loadMemory();
ok('recordMatch: persisted to storage', reloaded.totalKills === 25 && reloaded.maxWaveReached === 4 && reloaded.matchesEntered === 2);

// --- memory: never throws without localStorage (SSR) ---
delete globalThis.localStorage;
let threw = false;
try {
  loadMemory(); saveMemory({ matchesEntered: 1 }); recordMatch(null, { victory: true, waveReached: 1, kills: 1, barsEarned: 0 });
} catch { threw = true; }
ok('memory APIs never throw without localStorage', !threw);
ok('loadMemory defaults without localStorage', loadMemory().maxWaveReached === 0);

// --- playersStub ---
const stub = playersStub();
ok('playersStub disabled with empty peers', stub.enabled === false && Array.isArray(stub.peers) && stub.peers.length === 0);

console.log(`duat-arena: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
