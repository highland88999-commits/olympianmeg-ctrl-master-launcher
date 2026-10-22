// tests/kombat-temperament.test.mjs — headless tests for per-fighter
// combat temperament (lib/kombat/temperament.js, Merlin's order:
// the fighters fight FAST, VICIOUS and BRUTAL).
// Run: node tests/kombat-temperament.test.mjs (from the repo root).
// No browser, no network — asserts on the pure derivation, its
// composition with DIFFICULTY, and source-level pins that both
// engines consume temperament through the one shared AI path
// (Slimer + B.O.B. included — rigless by design, never branched).
import { readFileSync } from 'node:fs';
import { FIGHTERS, getFighter } from '../lib/kombat/roster.js';
import { getLoadout } from '../lib/kombat/loadouts.js';
import { DIFFICULTY } from '../lib/kombat/rules.js';
import {
  temperamentFor, deriveTemperament, composeAiProfile, bloodlust,
  temperamentBars, temperamentKind, resolveKombatId, allTemperaments,
} from '../lib/kombat/temperament.js';

let passed = 0;
let failed = 0;
function t(name, cond) {
  if (cond) { passed++; }
  else { failed++; console.error(`FAIL: ${name}`); }
}
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const median = (arr) => { const s = [...arr].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
const inRange = (v, lo, hi) => Number.isFinite(v) && v >= lo && v <= hi;

const all = allTemperaments();

// --- every fighter resolves a sane temperament -------------------
t('roster has 43 fighters', FIGHTERS.length === 43);
t('allTemperaments covers the roster', all.length === 43);
const FIELDS_01 = ['pace', 'fury', 'savagery', 'ferocity', 'brutality', 'finisherPressure'];
for (const f of FIGHTERS) {
  const tp = temperamentFor(f.id);
  t(`${f.id}: id round-trips`, tp.id === f.id);
  for (const k of FIELDS_01) t(`${f.id}: ${k} in [0,1]`, inRange(tp[k], 0, 1));
  t(`${f.id}: attackSpeed in [0.75,1.4]`, inRange(tp.attackSpeed, 0.75, 1.4));
  t(`${f.id}: aggressionMul in [0.7,1.4]`, inRange(tp.aggressionMul, 0.7, 1.4));
  t(`${f.id}: specialMul in [0.65,1.45]`, inRange(tp.specialMul, 0.65, 1.45));
  t(`${f.id}: heavyMul in [0.65,1.55]`, inRange(tp.heavyMul, 0.65, 1.55));
  t(`${f.id}: retreatMul in [0.45,1.3]`, inRange(tp.retreatMul, 0.45, 1.3));
  t(`${f.id}: dashMul in [0.55,2.05]`, inRange(tp.dashMul, 0.55, 2.05));
  t(`${f.id}: blockMul in [0.75,1.15]`, inRange(tp.blockMul, 0.75, 1.15));
  t(`${f.id}: reactionMul in [0.65,1.2]`, inRange(tp.reactionMul, 0.65, 1.2));
  t(`${f.id}: fatalityMul in [0.45,2.05]`, inRange(tp.fatalityMul, 0.45, 2.05));
  t(`${f.id}: pressureRange in [2.4,4.4]`, inRange(tp.pressureRange, 2.4, 4.4));
  t(`${f.id}: ferocity is fury`, tp.ferocity === tp.fury);
  t(`${f.id}: brutality is savagery`, tp.brutality === tp.savagery);
}

// --- determinism ---------------------------------------------------
for (const f of FIGHTERS) {
  t(`${f.id}: deterministic`, eq(temperamentFor(f.id), temperamentFor(f.id)));
  t(`${f.id}: pure derive`, eq(
    deriveTemperament(getFighter(f.id), getLoadout(f.id)),
    deriveTemperament(getFighter(f.id), getLoadout(f.id)),
  ));
}
t('temperament is frozen', Object.isFrozen(temperamentFor('hulk')));

// --- kinds (independent expectation from the bridge records) -------
const CREATURES = ['xenomorph', 't-rex', 'raptor-swift', 'raptor-claw', 'raptor-fang'];
const RIGLESS = ['slimer', 'bob-blob'];
for (const f of FIGHTERS) {
  const want = CREATURES.includes(f.id) ? 'creature' : RIGLESS.includes(f.id) ? 'rigless' : 'humanoid';
  t(`${f.id}: kind ${want}`, temperamentFor(f.id).kind === want);
  t(`${f.id}: kind agrees with bridge`, temperamentKind(getLoadout(f.id)) === want);
}
t('36 humanoids / 5 creatures / 2 rigless',
  all.filter((x) => x.kind === 'humanoid').length === 36 &&
  all.filter((x) => x.kind === 'creature').length === 5 &&
  all.filter((x) => x.kind === 'rigless').length === 2);

// --- dual id namespaces: key through the bridge, never by name -----
t('characterId resolves to kombatId', resolveKombatId('q017-t-800-terminator') === 't-800');
t('t-800 same temperament via both ids', eq(temperamentFor('q017-t-800-terminator'), temperamentFor('t-800')));
t('q041-b-o-b resolves to bob-blob', resolveKombatId('q041-b-o-b') === 'bob-blob'
  && temperamentFor('q041-b-o-b').kind === 'rigless');
t('q022-swift-raptor resolves to raptor-swift', resolveKombatId('q022-swift-raptor') === 'raptor-swift'
  && temperamentFor('q022-swift-raptor').kind === 'creature');
t('unknown id -> null resolution', resolveKombatId('not-a-fighter') === null);
const fallback = temperamentFor('not-a-fighter');
t('unknown id -> sane default temperament', fallback.id === null
  && inRange(fallback.attackSpeed, 0.75, 1.4) && inRange(fallback.aggressionMul, 0.7, 1.4));

// --- skews: creatures brutal, speedsters fast, roster hot ----------
const creatures = all.filter((x) => x.kind === 'creature');
const humanoids = all.filter((x) => x.kind === 'humanoid');
t('creature brutality median beats humanoid median',
  median(creatures.map((x) => x.brutality)) > median(humanoids.map((x) => x.brutality)));
t('t-rex brutality >= 0.9', temperamentFor('t-rex').brutality >= 0.9);
t('xenomorph brutality above humanoid median',
  temperamentFor('xenomorph').brutality > median(humanoids.map((x) => x.brutality)));
t('chucky faster than jason', temperamentFor('chucky').attackSpeed > temperamentFor('jason-voorhees').attackSpeed);
t('tasmanian-devil faster than stay-puft',
  temperamentFor('tasmanian-devil').attackSpeed > temperamentFor('stay-puft').attackSpeed);
const topSpeed = [...FIGHTERS].sort((a, b) => b.stats.speed - a.stats.speed).slice(0, 3);
t('top-3 speed stats all strike at/above the roster median tempo',
  topSpeed.every((f) => temperamentFor(f.id).attackSpeed >= median(all.map((x) => x.attackSpeed))));
const fastest = all.reduce((a, b) => (b.pace > a.pace ? b : a));
const slowest = all.reduce((a, b) => (b.pace < a.pace ? b : a));
t('fastest fighter reacts quicker than the slowest', fastest.reactionMul < slowest.reactionMul);
// Merlin's baseline: the roster as a whole leans FAST + VICIOUS.
t('roster median aggressionMul > 1 (vicious baseline)', median(all.map((x) => x.aggressionMul)) > 1);
t('roster median attackSpeed > 1 (fast baseline)', median(all.map((x) => x.attackSpeed)) > 1);

// --- signature reads ------------------------------------------------
const jason = temperamentFor('jason-voorhees');
t('jason: slowest hands are still deliberate (attackSpeed < 1)', jason.attackSpeed < 1);
t('jason: barely retreats (retreatMul <= 0.55)', jason.retreatMul <= 0.55);
t('jason: fury pinned high (>= 0.95)', jason.fury >= 0.95);
t('hulk: fury >= 0.95', temperamentFor('hulk').fury >= 0.95);
t('slimer: gentler than the humanoid median', temperamentFor('slimer').brutality < median(humanoids.map((x) => x.brutality)));
t('bob-blob: gentle (brutality < 0.45)', temperamentFor('bob-blob').brutality < 0.45);
t('slimer + bob-blob still get full temperaments',
  inRange(temperamentFor('slimer').aggressionMul, 0.7, 1.4)
  && inRange(temperamentFor('bob-blob').pressureRange, 2.4, 4.4));

// --- composition with difficulty ------------------------------------
for (const tier of Object.keys(DIFFICULTY)) {
  const diff = DIFFICULTY[tier];
  for (const f of FIGHTERS) {
    const tp = temperamentFor(f.id);
    const prof = composeAiProfile(diff, tp);
    for (const k of ['aggression', 'specialChance', 'heavyChance', 'retreatChance', 'dashChance', 'blockChance', 'fatalityChance']) {
      t(`${tier}/${f.id}: ${k} in [0,0.97]`, inRange(prof[k], 0, 0.97));
    }
    t(`${tier}/${f.id}: thinkMs scaled by attackSpeed only`,
      prof.thinkMs === diff.thinkMs / tp.attackSpeed
      && inRange(prof.thinkMs, diff.thinkMs / 1.4, diff.thinkMs / 0.75));
  }
}
for (const f of FIGHTERS) {
  const tp = temperamentFor(f.id);
  const e = composeAiProfile(DIFFICULTY.easy, tp);
  const n = composeAiProfile(DIFFICULTY.normal, tp);
  const h = composeAiProfile(DIFFICULTY.hard, tp);
  t(`${f.id}: difficulty still scales aggression (easy <= normal <= hard)`,
    e.aggression <= n.aggression && n.aggression <= h.aggression);
  t(`${f.id}: difficulty still scales tempo (easy thinkMs >= hard thinkMs)`,
    e.thinkMs >= h.thinkMs);
}

// --- bloodlust -------------------------------------------------------
{
  const tp = temperamentFor('t-rex');
  const base = composeAiProfile(DIFFICULTY.normal, tp);
  t('bloodlust: healthy foe -> profile untouched', bloodlust(base, tp, 1) === base);
  t('bloodlust: 0.36 foe -> profile untouched', bloodlust(base, tp, 0.36) === base);
  const hot = bloodlust(base, tp, 0.1);
  t('bloodlust: wounded foe -> aggression up', hot.aggression > base.aggression);
  t('bloodlust: wounded foe -> heavies up', hot.heavyChance > base.heavyChance);
  t('bloodlust: wounded foe -> retreat down', hot.retreatChance < base.retreatChance);
  t('bloodlust: stays clamped', hot.aggression <= 0.97 && hot.heavyChance <= 0.97);
  const gentle = temperamentFor('bob-blob');
  const gBase = composeAiProfile(DIFFICULTY.normal, gentle);
  const gHot = bloodlust(gBase, gentle, 0.1);
  t('bloodlust: a gentle fighter barely heats up',
    (gHot.aggression - gBase.aggression) < (hot.aggression - base.aggression));
}

// --- select-screen bars are the same numbers -------------------------
for (const f of FIGHTERS) {
  const tp = temperamentFor(f.id);
  const bars = temperamentBars(f.id);
  t(`${f.id}: bars in 1..10`, [bars.speed, bars.fury, bars.brutality].every((v) => Number.isInteger(v) && v >= 1 && v <= 10));
  t(`${f.id}: bars derive from the sim intensities`,
    bars.speed === Math.round(1 + tp.pace * 9)
    && bars.fury === Math.round(1 + tp.fury * 9)
    && bars.brutality === Math.round(1 + tp.savagery * 9));
}

// --- wiring pins: both engines consume the one shared AI path --------
const engineSrc = readFileSync(new URL('../app/kombat/engine.js', import.meta.url), 'utf8');
const brawlSrc = readFileSync(new URL('../app/kombat/brawl.js', import.meta.url), 'utf8');
const pageSrc = readFileSync(new URL('../app/kombat/page.jsx', import.meta.url), 'utf8');
for (const [name, src] of [['engine', engineSrc], ['brawl', brawlSrc]]) {
  t(`${name}: imports temperament`, src.includes("from '../../lib/kombat/temperament.js'"));
  t(`${name}: attaches temperament per fighter`, src.includes('temperamentFor(fighterId)'));
  t(`${name}: composes difficulty x temperament`, src.includes('composeAiProfile('));
  t(`${name}: bloodlust wired`, src.includes('bloodlust('));
  t(`${name}: reaction armed with the defender's reactionMul`, src.includes('temperament.reactionMul'));
  t(`${name}: fatality scaled by winner brutality`, src.includes('temperament.fatalityMul'));
  t(`${name}: no rig-based temperament branch (slimer/b.o.b. share the path)`,
    !/temperament[^;]{0,80}rigless/.test(src) && !/rigless[^;]{0,80}temperament/.test(src));
  t(`${name}: AI no longer rolls raw diff.aggression`, !src.includes('diff.aggression'));
  t(`${name}: AI no longer rolls raw diff.blockChance`, !src.includes('diff.blockChance'));
}
t('page: temperament bars on the select screens',
  pageSrc.includes('temperamentBars(highlight.id)')
  && (pageSrc.match(/TEMPERAMENT — HOW THEY FIGHT/g) || []).length === 2);

console.log(`kombat-temperament: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
