// tests/kombat-controller.test.mjs — headless tests for wiring plan
// Step 5: Merlin's controller in Kombat, all specials live.
// Run: node tests/kombat-controller.test.mjs (from the repo root).
// No browser, no network — asserts on the pure control system
// (lib/controls/*), the Kombat pad configuration (lib/kombat/pads.js)
// joined against the data bridge (lib/kombat/loadouts.js) and the
// roster (lib/kombat/roster.js), the shared kit helpers the engines
// consume (lib/kombat/rules.js), and settings persistence
// (lib/controls/settings.js).
//
// The laws under test are Merlin's (2026-10-13):
//   SHAPE LAW — a pad's sides equal its control count, per pad.
//   CONTINUOUS CONTACT — one unbroken touch glides across wedges;
//     only lifting disengages; the center is NEUTRAL.
//   ALL SPECIALS LIVE — the full kit (5, or 6 for Bugs Bunny and
//     Deadpool) + the Fatality wedge; the AI draws from the same kit.
//   STABILITY — the last-chosen settings are restored verbatim and
//     never change on their own.

import { FIGHTERS, getFighter } from '../lib/kombat/roster.js';
import { LOADOUTS, getLoadout, padShapeName } from '../lib/kombat/loadouts.js';
import { duelPads, brawlPads, powersControls, padSides } from '../lib/kombat/pads.js';
import {
  buildSpecialKit, specialIndexForAction, readySpecialIndexes,
  pickReadySpecial, cooldownFraction, SPECIAL_ACTIONS,
} from '../lib/kombat/rules.js';
import {
  shapeNameFor, wedgeIndexForAngle, wedgeCenterAngle, polygonPoints,
  labelPosition,
} from '../lib/controls/shapes.js';
import { createPadGesture } from '../lib/controls/gesture.js';
import {
  CONTROLLER_SETTINGS_KEY, DEFAULT_CONTROLLER_SETTINGS,
  sanitizeControllerSettings, loadControllerSettings, saveControllerSettings,
} from '../lib/controls/settings.js';
import { resolvePadPlacement } from '../lib/controls/layout.js';

let passed = 0;
let failed = 0;
function t(name, cond) {
  if (cond) { passed++; }
  else { failed++; console.error(`FAIL: ${name}`); }
}
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ==================================================================
// 1. SHAPE LAW — derived from the loadout, for every fighter
// ==================================================================
for (const f of FIGHTERS) {
  const lo = getLoadout(f.id);
  t(`${f.id}: has a bridge loadout`, !!lo);
  if (!lo) continue;
  for (const [mode, pads] of [['duel', duelPads(f.id)], ['brawl', brawlPads(f.id)]]) {
    for (const pad of pads) {
      t(`${f.id}/${mode}/${pad.id}: sides == control count`,
        padSides(pad) === pad.controls.length);
      t(`${f.id}/${mode}/${pad.id}: shape name exists`,
        shapeNameFor(pad.controls.length) !== null);
    }
    const powers = pads.find((p) => p.id === 'powers');
    t(`${f.id}/${mode}: powers sides == bridge powersPadSides`,
      powers.controls.length === lo.powersPadSides);
    t(`${f.id}/${mode}: powers sides == specials + fatality`,
      powers.controls.length === f.specials.length + 1);
    t(`${f.id}/${mode}: bridge shape name agrees`,
      padShapeName(lo.powersPadSides) === shapeNameFor(powers.controls.length));
    // labels are the fighter's REAL special names, in roster order
    const spWedges = powers.controls.filter((c) => c.specialIndex != null);
    t(`${f.id}/${mode}: special wedge labels == bridge powers`,
      eq(spWedges.map((c) => c.label), lo.powers));
    t(`${f.id}/${mode}: special wedge keys are sp1..spN`,
      eq(spWedges.map((c) => c.key), f.specials.map((_, i) => `sp${i + 1}`)));
    // exactly one Fatality wedge, at the bottom position
    const fat = powers.controls.filter((c) => c.fatality);
    t(`${f.id}/${mode}: exactly one fatality wedge`, fat.length === 1);
    t(`${f.id}/${mode}: fatality label names the fatality`,
      fat[0].label.includes(lo.fatality));
    t(`${f.id}/${mode}: fatality sits at the bottom wedge`,
      powers.controls.indexOf(fat[0]) === Math.floor(powers.controls.length / 2));
  }
}
// the two 6-special fighters wear heptagons; everyone else hexagons
t('bugs-bunny: heptagon', shapeNameFor(powersControls('bugs-bunny').length) === 'heptagon');
t('deadpool: heptagon', shapeNameFor(powersControls('deadpool').length) === 'heptagon');
t('freddy-krueger: hexagon', shapeNameFor(powersControls('freddy-krueger').length) === 'hexagon');

// Kombat's fixed group shapes (control map)
{
  const d = duelPads('freddy-krueger');
  const mv = d.find((p) => p.id === 'movement');
  const cb = d.find((p) => p.id === 'combat');
  t('duel movement is a square', mv.controls.length === 4 && shapeNameFor(4) === 'square');
  t('duel movement groups advance/retreat/dash-in/dash-back',
    eq(mv.controls.map((c) => c.key), ['dashIn', 'advance', 'dashBack', 'retreat']));
  t('duel combat is a triangle', cb.controls.length === 3 && shapeNameFor(3) === 'triangle');
  t('duel combat groups punch/kick/block-hold',
    eq(cb.controls.map((c) => c.key), ['punch', 'kick', 'block'])
    && cb.controls.find((c) => c.key === 'block').kind === 'hold');
  const b = brawlPads('freddy-krueger');
  const bmv = b.find((p) => p.id === 'movement');
  const bcb = b.find((p) => p.id === 'combat');
  t('brawl movement is an octagon', bmv.controls.length === 8 && shapeNameFor(8) === 'octagon');
  t('brawl movement is a full analog vector surface', bmv.analogVector === true);
  t('brawl combat is a pentagon', bcb.controls.length === 5 && shapeNameFor(5) === 'pentagon');
  t('brawl combat groups punch/kick/block/jump/dash',
    eq(bcb.controls.map((c) => c.key), ['punch', 'kick', 'block', 'jump', 'dash']));
}

// ==================================================================
// 2. GEOMETRY — wedge math is consistent round-trip
// ==================================================================
for (let sides = 3; sides <= 8; sides++) {
  t(`polygon has ${sides} vertices`, polygonPoints(sides, 10).length === sides);
  for (let i = 0; i < sides; i++) {
    t(`sides=${sides} wedge ${i} center angle maps back to itself`,
      wedgeIndexForAngle(wedgeCenterAngle(i, sides), sides) === i);
  }
}
{
  // square: Advance is the RIGHT wedge (index 1, clockwise from top)
  t('square: angle 0 (right) is wedge 1', wedgeIndexForAngle(0, 4) === 1);
  t('square: angle -90deg (up) is wedge 0', wedgeIndexForAngle(-Math.PI / 2, 4) === 0);
  // labels ring externally with sensible anchors
  t('label right -> start anchor', labelPosition(1, 4, 50).anchor === 'start');
  t('label left -> end anchor', labelPosition(3, 4, 50).anchor === 'end');
  t('label top -> middle anchor', labelPosition(0, 4, 50).anchor === 'middle');
}

// ==================================================================
// 3. CONTINUOUS-CONTACT gesture state machine
// ==================================================================
{
  const g = createPadGesture({ sides: 6 });
  // engage in the NEUTRAL center: no wedge, tilt 0
  let evs = g.down(1, 0, 0);
  t('engage fires on contact', evs.some((e) => e.type === 'engage'));
  t('center is neutral — no wedgeOn', !evs.some((e) => e.type === 'wedgeOn'));
  t('center tilt is 0', g.tilt === 0 && g.wedge === -1);
  // slide UP into wedge 0 without lifting
  evs = g.move(1, 0, -0.8);
  t('slide into wedge 0 fires wedgeOn', evs.some((e) => e.type === 'wedgeOn' && e.index === 0));
  t('still engaged after slide (finger never lifted)', g.engaged);
  // tilt is analog: magnitude follows distance from center
  const tiltEv = evs.find((e) => e.type === 'tilt');
  t('tilt tracks distance (0.8)', Math.abs(tiltEv.tilt - 0.8) < 1e-9);
  // slide clockwise into wedge 1: off 0, on 1, NO release between
  evs = g.move(1, 0.7, -0.4);
  t('crossing a boundary fires wedgeOff for the old wedge',
    evs.some((e) => e.type === 'wedgeOff' && e.index === 0));
  t('crossing a boundary fires wedgeOn for the new wedge',
    evs.some((e) => e.type === 'wedgeOn' && e.index === 1));
  t('crossing a boundary never releases', !evs.some((e) => e.type === 'release'));
  // slide back to center: neutral again, still engaged
  evs = g.move(1, 0.05, 0.05);
  t('returning to center fires wedgeOff', evs.some((e) => e.type === 'wedgeOff'));
  t('returning to center zeroes the tilt readout', g.tilt === 0);
  t('still engaged in the center', g.engaged);
  // a second finger cannot hijack the pad
  evs = g.down(2, 0.9, 0);
  t('second pointer is ignored while engaged', evs.length === 0 && g.pointerId === 1);
  // lift: the ONLY release
  evs = g.up(1);
  t('lift fires release', evs.some((e) => e.type === 'release'));
  t('lift disengages', !g.engaged && g.wedge === -1);
  // lifting from inside a wedge releases the wedge first
  const g2 = createPadGesture({ sides: 4 });
  g2.down(7, 0.9, 0); // Advance wedge
  const upEvs = g2.up(7);
  t('lift from a wedge fires wedgeOff before release',
    upEvs.findIndex((e) => e.type === 'wedgeOff') < upEvs.findIndex((e) => e.type === 'release'));
  // movement square: right is Advance, analog tilt clamps at the rim
  const g3 = createPadGesture({ sides: 4 });
  const dEvs = g3.down(1, 3, 0); // way past the rim
  const dTilt = dEvs.find((e) => e.type === 'tilt');
  t('tilt clamps at 1 past the rim', dTilt.tilt === 1);
  t('vector points right for Advance', dTilt.vector.x === 1 && Math.abs(dTilt.vector.y) < 1e-9);
  // vector direction: brawl compass SE is down-right
  const g4 = createPadGesture({ sides: 8 });
  const se = g4.down(1, 0.5, 0.5).find((e) => e.type === 'tilt');
  t('octagon SE tilt vector is down-right',
    se.vector.x > 0.4 && se.vector.y > 0.4 && se.index === 3);
}

// ==================================================================
// 4. SETTINGS — persistence round-trip + the stability rule
// ==================================================================
function fakeStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    _map: m,
  };
}
{
  const st = fakeStorage();
  t('empty storage -> Signature defaults',
    eq(loadControllerSettings(st), { ...DEFAULT_CONTROLLER_SETTINGS, custom: {} }));
  const mine = {
    layout: 'custom',
    padScale: 1.15,
    borderOpacity: 0.4,
    labels: false,
    desktopMode: 'mousepad',
    cameraSensitivity: 1.6,
    invertY: true,
    custom: { movement: { x: 18, y: 78, scale: 1.1 }, powers: { x: 84, y: 40, scale: 0.9 } },
  };
  t('save reports success', saveControllerSettings(mine, st) === true);
  t('saved under the controller settings key', st._map.has(CONTROLLER_SETTINGS_KEY));
  const back = loadControllerSettings(st);
  t('round-trip restores the last choice verbatim', eq(back, mine));
  // stability: loading twice never mutates the stored choice
  t('re-load is identical (never changes on its own)', eq(loadControllerSettings(st), mine));
  // corruption falls back to defaults, loudly but safely
  st.setItem(CONTROLLER_SETTINGS_KEY, '{not json');
  t('corrupt storage -> defaults', loadControllerSettings(st).layout === 'signature');
  // sanitizing clamps wild values instead of breaking the pad
  const wild = sanitizeControllerSettings({
    layout: 'diagonal', padScale: 9, borderOpacity: -2, cameraSensitivity: 0,
    custom: { movement: { x: 250, y: -5, scale: 9 }, junk: 'x' },
  });
  t('unknown layout -> signature', wild.layout === 'signature');
  t('padScale clamps to 1.3', wild.padScale === 1.3);
  t('borderOpacity clamps to 0.15', wild.borderOpacity === 0.15);
  t('cameraSensitivity clamps to 0.4', wild.cameraSensitivity === 0.4);
  t('custom positions clamp into the layer',
    wild.custom.movement.x === 98 && wild.custom.movement.y === 2 && wild.custom.movement.scale === 1.6);
  t('junk custom entries are dropped', !('junk' in wild.custom));
}

// layout resolution: variations of the arrangement, never a redesign
{
  const base = { ...DEFAULT_CONTROLLER_SETTINGS, custom: {} };
  const mvPad = duelPads('freddy-krueger').find((p) => p.id === 'movement');
  const sig = resolvePadPlacement(base, mvPad);
  t('signature: movement pad anchored left', sig.style.left === 34 && sig.custom === false);
  const mir = resolvePadPlacement({ ...base, layout: 'mirrored' }, mvPad);
  t('mirrored: movement pad swaps to the right', mir.style.right === 34);
  const ghost = resolvePadPlacement({ ...base, layout: 'ghost' }, mvPad);
  t('ghost: smaller + fainter at rest', ghost.size < sig.size && ghost.idleOpacity < sig.idleOpacity);
  const low = resolvePadPlacement({ ...base, layout: 'low' }, mvPad);
  t('low: hugs the bottom edge', low.style.bottom < sig.style.bottom);
  const customSettings = { ...base, layout: 'custom', custom: { movement: { x: 20, y: 70, scale: 1 } } };
  const cus = resolvePadPlacement(customSettings, mvPad);
  t('custom: saved placement wins', cus.custom === true && cus.style.leftPct === 20 && cus.style.topPct === 70);
  t('resolution never mutates the settings',
    eq(customSettings.custom, { movement: { x: 20, y: 70, scale: 1 } }));
}

// ==================================================================
// 5. ENGINE KIT — all specials live, damage/cooldown wiring, parity
// ==================================================================
for (const f of FIGHTERS) {
  const kit = buildSpecialKit(f);
  t(`${f.id}: kit fields every special`, kit.specials.length === f.specials.length);
  t(`${f.id}: one cooldown slot per special, all ready`,
    kit.cooldowns.length === kit.specials.length && kit.cooldowns.every((c) => c === 0));
  t(`${f.id}: kit carries the roster damage/cooldown verbatim`,
    kit.specials.every((s, i) => s.damage === f.specials[i].damage && s.cooldown === f.specials[i].cooldown && s.name === f.specials[i].name));
}
t('press actions cover the largest kit (6)',
  SPECIAL_ACTIONS.length === 6 && getFighter('bugs-bunny').specials.length === 6);
t('specialIndexForAction maps sp1..sp6',
  eq(['sp1', 'sp2', 'sp3', 'sp4', 'sp5', 'sp6'].map(specialIndexForAction), [0, 1, 2, 3, 4, 5]));
t('non-special actions are not specials',
  specialIndexForAction('dash') === -1 && specialIndexForAction('fatality') === -1);
{
  const freddy = getFighter('freddy-krueger');
  const kit = buildSpecialKit(freddy);
  // cooldown gating: a special on cooldown is not ready
  const cds = kit.cooldowns.slice();
  cds[0] = 2; cds[2] = 5;
  const ready = readySpecialIndexes(kit.specials, cds);
  t('ready indexes skip specials on cooldown', !ready.includes(0) && !ready.includes(2) && ready.length === 3);
  // wards (damage 0) are not damaging picks — Jason's Undying
  const jason = getFighter('jason-voorhees');
  const jkit = buildSpecialKit(jason);
  const wardIdx = jkit.specials.findIndex((s) => s.damage <= 0);
  t('ward special exists in the kit', wardIdx >= 0);
  t('damaging picker never picks the ward',
    !readySpecialIndexes(jkit.specials, jkit.cooldowns).includes(wardIdx));
  t('non-damaging picker finds only the ward',
    eq(readySpecialIndexes(jkit.specials, jkit.cooldowns, { damaging: false }), [wardIdx]));
  // AI parity: the picker draws ONLY from the kit the player holds,
  // and every ready damaging special is reachable
  const seen = new Set();
  for (let k = 0; k < 200; k++) {
    const pick = pickReadySpecial(jkit.specials, jkit.cooldowns, () => k / 200);
    if (pick >= 0) seen.add(pick);
  }
  t('AI picker reaches every ready damaging special',
    eq([...seen].sort((a, b) => a - b), readySpecialIndexes(jkit.specials, jkit.cooldowns)));
  t('AI picker returns -1 when all damaging specials are on cooldown',
    pickReadySpecial(jkit.specials, jkit.specials.map((s) => (s.damage > 0 ? 3 : 0))) === -1);
  // cooldown fraction wiring (HUD -> pad wedge shade)
  t('cooldownFraction: fresh special is fully shaded',
    cooldownFraction({ cooldown: 4 }, 4) === 1);
  t('cooldownFraction: half-way is 0.5', cooldownFraction({ cooldown: 4 }, 2) === 0.5);
  t('cooldownFraction: ready is 0', cooldownFraction({ cooldown: 4 }, 0) === 0);
}

console.log(`\nkombat-controller: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
