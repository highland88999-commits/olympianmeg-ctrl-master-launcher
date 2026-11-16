// tests/jupiter2-elemental-orbs.test.mjs — Jupiter 2 elemental orbs +
// speeder blaster + shields (Merlin, Nov 16 ~01:16, round 2 workstream 7).
// Run: node --test tests/jupiter2-elemental-orbs.test.mjs

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  ORB_ELEMENTS, elementForKind, orbFor,
  ORB_COLLECT_RADIUS_M, ORB_DESPAWN_MS, ORB_MAX_LIVE,
  createOrbDrop, orbExpired, pruneOrbs, collectOrbs,
  createWallet, totalOrbs, addOrb, spendOrbs,
  SHIELD_TIERS, SHIELD_RECHARGE_COST, shieldTierFor, buyShieldTier,
  absorbDamage,
  BLASTER_TIERS, BLASTER_CONE_DEG, blasterTierFor, blasterReady, buyBlasterTier,
  applyBlasterHit, strikeWalkerWithShield, burnTickWithShield,
  ORB_STORAGE_KEY, createProgress, loadProgress, saveProgress,
} from '../lib/jupiter2/elemental-orbs.js';
import { createVictimState, WALKER_MAX_HP } from '../lib/lightning-aura.js';

function memStore() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
  };
}

describe('power type → orb mapping (read from code)', () => {
  it('lightning monsters drop storm orbs (white-yellow)', () => {
    assert.equal(elementForKind('lightning-monster', 0), 'storm');
    assert.equal(elementForKind('lightning-monster', 1), 'storm');
    assert.equal(orbFor('storm').color, '#ffe14d');
    assert.equal(orbFor('storm').kind, 'lightning-monster');
  });
  it('dragons drop dragon orbs (red — Stormwing slot 3, Aureline slot 4)', () => {
    assert.equal(elementForKind('dragon', 0), 'dragon');
    assert.equal(elementForKind('dragon', 1), 'dragon');
    // A lightning-monster slot whose model IS a dragon reads dragon too.
    assert.equal(elementForKind('lightning-monster', 3), 'dragon');
    assert.equal(elementForKind('lightning-monster', 4), 'dragon');
    assert.equal(orbFor('dragon').color, '#ff1e1e');
  });
  it('demobats drop demobat orbs (yellow)', () => {
    assert.equal(elementForKind('demobat', 0), 'demobat');
    assert.equal(orbFor('demobat').core, '#fff9c4');
  });
  it('unknown kinds drop nothing', () => {
    assert.equal(elementForKind('wumpus', 0), null);
    assert.equal(orbFor('wumpus'), null);
    assert.equal(createOrbDrop({ kind: 'wumpus', index: 0, position: { x: 1, y: 2, z: 3 } }), null);
  });
  it('all three orb elements exist', () => {
    assert.deepEqual(Object.keys(ORB_ELEMENTS).sort(), ['demobat', 'dragon', 'storm']);
  });
});

describe('drops: creation, despawn, cap', () => {
  it('a drop carries its element, death point and time', () => {
    const orb = createOrbDrop({ kind: 'dragon', index: 0, position: { x: 10, y: 88, z: -4 }, nowMs: 5000 });
    assert.equal(orb.element, 'dragon');
    assert.equal(orb.x, 10);
    assert.equal(orb.z, -4);
    assert.equal(orb.droppedAtMs, 5000);
    assert.match(orb.id, /^orb-dragon-0-5000$/);
  });
  it('orbs expire after the 120 s despawn window', () => {
    assert.equal(ORB_DESPAWN_MS, 120000);
    const orb = createOrbDrop({ kind: 'lightning-monster', index: 0, position: { x: 0, y: 0, z: 0 }, nowMs: 1000 });
    assert.equal(orbExpired(orb, 1000 + 119999), false);
    assert.equal(orbExpired(orb, 1000 + 120001), true);
  });
  it('prune drops the expired and enforces the 32-live cap, oldest first', () => {
    assert.equal(ORB_MAX_LIVE, 32);
    const orbs = Array.from({ length: 35 }, (_, i) => createOrbDrop({
      kind: 'lightning-monster', index: i % 7, position: { x: i, y: 0, z: 0 }, nowMs: 1000 + i,
    }));
    const kept = pruneOrbs(orbs, 2000);
    assert.equal(kept.length, 32);
    assert.equal(kept[0].droppedAtMs, 1003); // the three oldest went
    assert.equal(kept[31].droppedAtMs, 1034);
  });
});

describe('collection: walk-over, segment-safe', () => {
  it('collect radius is 3.0 m', () => {
    assert.equal(ORB_COLLECT_RADIUS_M, 3.0);
  });
  it('walking onto an orb collects it', () => {
    const orb = createOrbDrop({ kind: 'lightning-monster', index: 0, position: { x: 5, y: 0, z: 0 }, nowMs: 0 });
    const { collected, remaining } = collectOrbs([orb], { x: 4, y: 0, z: 0 }, { x: 5, y: 0, z: 0 });
    assert.equal(collected.length, 1);
    assert.equal(remaining.length, 0);
  });
  it('a speeder pass at 28 m/s cannot step over an orb (segment check)', () => {
    // 14 m in one 500 ms tick, orb dead centre of the path.
    const orb = createOrbDrop({ kind: 'dragon', index: 0, position: { x: 7, y: 0, z: 0 }, nowMs: 0 });
    const { collected } = collectOrbs([orb], { x: 0, y: 0, z: 0 }, { x: 14, y: 0, z: 0 });
    assert.equal(collected.length, 1);
  });
  it('an orb off the path is not collected', () => {
    const orb = createOrbDrop({ kind: 'demobat', index: 0, position: { x: 7, y: 0, z: 10 }, nowMs: 0 });
    const { collected, remaining } = collectOrbs([orb], { x: 0, y: 0, z: 0 }, { x: 14, y: 0, z: 0 });
    assert.equal(collected.length, 0);
    assert.equal(remaining.length, 1);
  });
  it('standing still on an orb collects it', () => {
    const orb = createOrbDrop({ kind: 'lightning-monster', index: 0, position: { x: 1, y: 0, z: 0 }, nowMs: 0 });
    const { collected } = collectOrbs([orb], { x: 1, y: 0, z: 0 }, { x: 1, y: 0, z: 0 });
    assert.equal(collected.length, 1);
  });
});

describe('wallet', () => {
  it('adds per element and totals across the mix', () => {
    let w = createWallet();
    w = addOrb(w, 'storm');
    w = addOrb(w, 'dragon');
    w = addOrb(w, 'dragon');
    assert.equal(totalOrbs(w), 3);
    assert.equal(w.dragon, 2);
    assert.equal(addOrb(w, 'wumpus').dragon, 2); // unknown ignored
  });
  it('spends in fixed order storm → dragon → demobat', () => {
    const w = spendOrbs({ storm: 2, dragon: 3, demobat: 4 }, 4);
    assert.deepEqual(w, { storm: 0, dragon: 1, demobat: 4 });
  });
  it('spending more than held returns null and leaves the wallet alone', () => {
    const w = { storm: 1, dragon: 0, demobat: 0 };
    assert.equal(spendOrbs(w, 2), null);
    assert.deepEqual(w, { storm: 1, dragon: 0, demobat: 0 });
  });
});

describe('shields', () => {
  it('tiers are 0 / 25 / 50 / 100 absorb at 0 / 5 / 10 / 15 orbs', () => {
    assert.deepEqual(SHIELD_TIERS.map((t) => t.max), [0, 25, 50, 100]);
    assert.deepEqual(SHIELD_TIERS.map((t) => t.cost), [0, 5, 10, 15]);
    assert.equal(SHIELD_RECHARGE_COST, 2);
    assert.equal(shieldTierFor(9).tier, 3); // clamped
    assert.equal(shieldTierFor(-1).tier, 0);
  });
  it('buying a tier spends the orbs and reports need-orbs when short', () => {
    const rich = { storm: 10, dragon: 0, demobat: 0 };
    const bought = buyShieldTier(rich, 0, 2);
    assert.equal(bought.ok, true);
    assert.equal(bought.tier, 2);
    assert.equal(totalOrbs(bought.wallet), 0);
    const poor = buyShieldTier({ storm: 4, dragon: 0, demobat: 0 }, 0, 1);
    assert.equal(poor.ok, false);
    assert.equal(poor.reason, 'need-orbs');
    const owned = buyShieldTier(rich, 2, 2);
    assert.equal(owned.ok, false);
    assert.equal(owned.reason, 'already-owned');
  });
  it('shield absorbs first, the rest hits HP (Hollow Earth law)', () => {
    assert.deepEqual(absorbDamage(50, 8), { absorbed: 8, remaining: 0, shield: 42, shieldBroken: false });
    assert.deepEqual(absorbDamage(5, 8), { absorbed: 5, remaining: 3, shield: 0, shieldBroken: true });
    assert.deepEqual(absorbDamage(0, 8), { absorbed: 0, remaining: 8, shield: 0, shieldBroken: false });
  });
  it('a strike with a shield up eats the shield, not HP, and still lights the burn', () => {
    const walker = createVictimState(WALKER_MAX_HP);
    const res = strikeWalkerWithShield(walker, 50, 1000);
    assert.equal(res.walker.hp, 100);
    assert.equal(res.shield, 42);
    assert.equal(res.walker.burnRemainingS, 3);
    assert.equal(res.absorbed, 8);
  });
  it('a strike with a broken-through shield loses only the overflow HP', () => {
    const walker = createVictimState(WALKER_MAX_HP);
    const res = strikeWalkerWithShield(walker, 5, 1000);
    assert.equal(res.walker.hp, 97); // 8 hit − 5 shield = 3 through
    assert.equal(res.shield, 0);
    assert.equal(res.shieldBroken, true);
  });
  it('burn ticks route through the shield too', () => {
    const walker = { ...createVictimState(WALKER_MAX_HP), burnDps: 6, burnRemainingS: 3 };
    const res = burnTickWithShield(walker, 10, 0.5); // 3 burn dmg vs 10 shield
    assert.equal(res.walker.hp, 100);
    assert.equal(res.shield, 7);
    assert.equal(res.walker.burnRemainingS, 2.5);
    const res2 = burnTickWithShield(res.walker, res.shield, 0.5); // 3 more vs 7
    assert.equal(res2.walker.hp, 100);
    assert.equal(res2.shield, 4);
  });
  it('burn ticks with no shield left eat HP like the plain law', () => {
    const walker = { ...createVictimState(WALKER_MAX_HP), burnDps: 6, burnRemainingS: 3 };
    const res = burnTickWithShield(walker, 0, 0.5);
    assert.equal(res.walker.hp, 97);
    assert.equal(res.walker.burnRemainingS, 2.5);
  });
  it('no burn running passes through untouched', () => {
    const walker = createVictimState(WALKER_MAX_HP);
    const res = burnTickWithShield(walker, 25, 0.5);
    assert.equal(res.walker, walker);
    assert.equal(res.shield, 25);
  });
});

describe('blaster', () => {
  it('tiers: 34/45/60/80 dmg, 500/450/400/350 ms, 60/70/80/90 m, 0/5/10/15 orbs', () => {
    assert.deepEqual(BLASTER_TIERS.map((t) => t.dmg), [34, 45, 60, 80]);
    assert.deepEqual(BLASTER_TIERS.map((t) => t.cooldownMs), [500, 450, 400, 350]);
    assert.deepEqual(BLASTER_TIERS.map((t) => t.rangeM), [60, 70, 80, 90]);
    assert.deepEqual(BLASTER_TIERS.map((t) => t.cost), [0, 5, 10, 15]);
    assert.equal(BLASTER_CONE_DEG, 35);
  });
  it('stock blaster kills a 100 HP monster in 3 shots; tier 2 in 2', () => {
    assert.equal(Math.ceil(100 / blasterTierFor(0).dmg), 3);
    assert.equal(Math.ceil(100 / blasterTierFor(2).dmg), 2);
    assert.equal(Math.ceil(100 / blasterTierFor(3).dmg), 2);
  });
  it('cooldown gates the fire rate per tier', () => {
    assert.equal(blasterReady(null, 1000, 0), true);
    assert.equal(blasterReady(1000, 1499, 0), false);
    assert.equal(blasterReady(1000, 1500, 0), true);
    assert.equal(blasterReady(1000, 1400, 3), true); // tier 3: 350 ms
  });
  it('buying a blaster tier spends orbs and refuses when short or owned', () => {
    const bought = buyBlasterTier({ storm: 0, dragon: 0, demobat: 15 }, 0, 3);
    assert.equal(bought.ok, true);
    assert.equal(bought.tier, 3);
    assert.equal(totalOrbs(bought.wallet), 0);
    assert.equal(buyBlasterTier({ storm: 4, dragon: 0, demobat: 0 }, 0, 1).reason, 'need-orbs');
    assert.equal(buyBlasterTier({ storm: 99, dragon: 0, demobat: 0 }, 1, 1).reason, 'already-owned');
  });
  it('a blaster hit drops HP and reports the kill at 0', () => {
    assert.deepEqual(applyBlasterHit({ hp: 100 }, 34), { hp: 66, killed: false });
    assert.deepEqual(applyBlasterHit({ hp: 30 }, 34), { hp: 0, killed: true });
    assert.deepEqual(applyBlasterHit({ hp: 0 }, 34), { hp: 0, killed: true });
  });
});

describe('persistence (device-local localStorage)', () => {
  it('round-trips wallet + tiers + shield charge', () => {
    const store = memStore();
    const p = { orbs: { storm: 3, dragon: 2, demobat: 1 }, shieldTier: 2, blasterTier: 1, shield: 40 };
    assert.equal(saveProgress(p, store), true);
    assert.equal(store.getItem(ORB_STORAGE_KEY) != null, true);
    assert.deepEqual(loadProgress(store), p);
  });
  it('a missing save loads fresh progress', () => {
    assert.deepEqual(loadProgress(memStore()), createProgress());
  });
  it('a corrupt save loads fresh progress instead of throwing', () => {
    const store = memStore();
    store.setItem(ORB_STORAGE_KEY, '{not json');
    assert.deepEqual(loadProgress(store), createProgress());
  });
  it('partial saves clamp into range (tiers clamped, shield capped at the tier max)', () => {
    const store = memStore();
    store.setItem(ORB_STORAGE_KEY, JSON.stringify({
      orbs: { storm: 5 }, shieldTier: 99, blasterTier: -2, shield: 999,
    }));
    const loaded = loadProgress(store);
    assert.equal(loaded.shieldTier, 3);
    assert.equal(loaded.blasterTier, 0);
    assert.equal(loaded.shield, 100); // capped at tier-3 max
    assert.equal(loaded.orbs.storm, 5);
    assert.equal(loaded.orbs.dragon, 0);
  });
});

// ── Scene wiring (static pins — the behaviour itself lives in the
// pure module above; these assert the scene actually hooks it up) ──
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sceneSrc = fs.readFileSync(path.join(__dirname, '..', 'components/jupiter2/Jupiter2Scene.jsx'), 'utf8');
const operatorsSrc = fs.readFileSync(path.join(__dirname, '..', 'lib/jupiter2/operators.js'), 'utf8');

describe('scene wiring', () => {
  it('the operator death law accepts a user kill', () => {
    assert.match(operatorsSrc, /'user-kill'/);
  });
  it('the brain tick records user kills and drops an orb only for them', () => {
    assert.match(sceneSrc, /cause: userKill \? 'user-kill' : 'predation'/);
    assert.match(sceneSrc, /createOrbDrop\(\{ kind: c\.kind, index: c\.index, position: pos, nowMs: now \}\)/);
  });
  it('walker strikes and burn ticks route through the shield first', () => {
    assert.match(sceneSrc, /strikeWalkerWithShield\(brain\.walker, shieldRef\.current\.current, now\)/);
    assert.match(sceneSrc, /burnTickWithShield\(brain\.walker, shieldRef\.current\.current, 0\.5\)/);
  });
  it('the tick collects orbs on the walker path and prunes the expired', () => {
    assert.match(sceneSrc, /collectOrbs\(orbsRef\.current, prevFeetRef\.current, feetPos\)/);
    assert.match(sceneSrc, /pruneOrbs\(remaining, now\)/);
  });
  it('fireBlaster exists, no-ops on foot, and is exposed for the SHOOT orb via shootRef', () => {
    assert.match(sceneSrc, /const fireBlaster = \(\) => \{/);
    assert.match(sceneSrc, /if \(!sp\.summoned \|\| !sp\.mounted\) return \{ ok: false, reason: 'on-foot' \}/);
    assert.match(sceneSrc, /shootRef = null/);
    assert.match(sceneSrc, /if \(shootRef\) shootRef\.current = fireBlaster;/);
    assert.match(sceneSrc, /else if \(k === 'f'\) fireWeapon\(\);/);
    assert.match(sceneSrc, /const fireWeapon = \(\) => \{/);
    assert.match(sceneSrc, /return \(sp\.summoned && sp\.mounted\) \? fireBlaster\(\) : fireOnFoot\(\);/);
  });
  it('no second SHOOT orb is created here — workstream 1 owns the orb', () => {
    assert.doesNotMatch(sceneSrc, /ariaLabel="Shoot"/);
    assert.doesNotMatch(sceneSrc, /ariaLabel="Fire"/);
  });
  it('the trade panel, TRADE orb and orb tally are mounted in the scene', () => {
    assert.match(sceneSrc, /aria-label="Deck trade — elemental orbs"/);
    assert.match(sceneSrc, /ariaLabel="Open the deck trade/);
    assert.match(sceneSrc, /<OrbLabel>ORBS<\/OrbLabel>/);
    assert.match(sceneSrc, /orbs=\{orbsUi\} blasterRef=\{blasterRef\}/);
  });
  it('dropped orbs and the blaster bolt render inside the canvas', () => {
    assert.match(sceneSrc, /<ElementalOrbField orbs=\{orbs\} \/>/);
    assert.match(sceneSrc, /<BlasterBolt blasterRef=\{blasterRef\} \/>/);
  });
  it('progress persists to device-local storage, with no SQL anywhere in this work', () => {
    assert.match(sceneSrc, /loadProgress\(\)/);
    assert.match(sceneSrc, /saveProgress\(\{/);
    assert.equal(fs.existsSync(path.join(__dirname, '..', 'supabase', 'jupiter2-elemental-orbs.sql')), false);
  });
});

describe('operator death law accepts the user kill', () => {
  it('a user-kill moves death earlier, like predation and duels', async () => {
    const { deathFor } = await import('../lib/jupiter2/operators.js');
    const birthMs = Date.UTC(2026, 0, 1);
    const kill = { generation: 0, cause: 'user-kill', diedAtMs: birthMs + 1000, killerId: 'user' };
    const death = deathFor('lightning-monster', birthMs, kill);
    assert.equal(death.dies, true);
    assert.equal(death.cause, 'user-kill');
    assert.equal(death.deathMs, birthMs + 1000);
    assert.equal(death.killerId, 'user');
    assert.equal(death.byAge, false);
  });
});
