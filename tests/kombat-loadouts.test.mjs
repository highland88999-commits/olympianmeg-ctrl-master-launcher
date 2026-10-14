// tests/kombat-loadouts.test.mjs — headless tests for the Kombat data
// bridge (lib/kombat/loadouts.js, wiring plan Step 1).
// Run: node tests/kombat-loadouts.test.mjs (from the repo root).
// No browser, no network — asserts on lib/kombat/loadouts.js joined
// against lib/kombat/roster.js (game data), lib/kombat/visuals.js
// (procedural visual spec) and lib/characters/roster.js (published
// previews).
//
// The bridge is GENERATED from the character accuracy record
// (~/workspace/tripo-figures/character_loadouts.json) + live sprint
// state by build_kombat_loadouts.py. The fingerprint sets below are
// that record's signature: if the accuracy record changes, regenerate
// the bridge and update the fingerprints here — a silent drift between
// the accuracy record and the game data is exactly what this suite
// exists to catch.
import { existsSync } from 'node:fs';
import { FIGHTERS } from '../lib/kombat/roster.js';
import { VISUALS, FIGHTER_IDS } from '../lib/kombat/visuals.js';
import {
  LOADOUTS, LOADOUT_COUNT, LOADOUT_BY_ID, getLoadout, hasLoadout, padShapeName,
} from '../lib/kombat/loadouts.js';
import { CHARACTERS } from '../lib/characters/roster.js';

let passed = 0;
let failed = 0;
function t(name, cond) {
  if (cond) { passed++; }
  else { failed++; console.error(`FAIL: ${name}`); }
}
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const sorted = (arr) => [...arr].sort();

// --- accuracy-record fingerprints (character_loadouts.json, 2026-10-13) ---
const DUAL_WIELDERS = sorted([
  'deadpool', 'iron-man', 'pennywise', 'predator', 't-1000', 'tifa-lockhart', 'wolverine',
]);
const WEAPONLESS = sorted([
  'bob-blob', 'emperor-palpatine', 'hulk', 'missing-link', 'neo', 'samara-morgan', 'slimer', 'stay-puft',
]);
const CREATURES = sorted(['raptor-claw', 'raptor-fang', 'raptor-swift', 't-rex', 'xenomorph']);
const RIG_NONE = sorted(['bob-blob', 'slimer']);
// Sprint availability snapshot at bridge generation (run_state truth —
// regenerate the bridge + this list when the sprint advances).
const AVAILABLE_IDS = sorted([
  'q001-freddy-krueger', 'q002-jason-voorhees', 'q003-michael-myers', 'q004-leatherface',
  'q005-pennywise', 'q006-ghostface', 'q007-chucky', 'q008-pinhead', 'q009-candyman',
  'q010-samara-morgan', 'q011-xenomorph', 'q012-predator', 'q013-darth-vader',
  'q014-luke-skywalker', 'q015-yoda', 'q016-emperor-palpatine', 'q017-t-800-terminator',
  'q018-t-1000', 'q019-ellen-ripley', 'q020-neo', 'q021-t-rex', 'q022-swift-raptor',
  'q023-claw-raptor', 'q024-fang-raptor', 'q025-peter-venkman', 'q026-ray-stantz',
  'q027-egon-spengler', 'q028-winston-zeddemore', 'q029-slimer', 'q030-stay-puft',
  'q031-bugs-bunny', 'q032-tasmanian-devil', 'q033-hulk', 'q034-deadpool',
  'q035-wolverine', 'q036-thanos',
]);
// Step 4 hosting snapshot: every available fighter's optimized GLB was
// uploaded to the public Supabase Storage bucket 'fighter-models' and
// verified live (HEAD 200 + glTF magic) — the bridge's glbUrl must equal
// the bucket URL for exactly these fighters and stay null for the rest.
// Regenerate the bridge + this list when hosting changes.
const GLB_URL_BASE = 'https://pjslctbyigtapvblbjao.supabase.co/storage/v1/object/public/fighter-models';
const glbUrlFor = (characterId) => `${GLB_URL_BASE}/${characterId}.glb`;
const HOSTED_IDS = sorted([
  'q001-freddy-krueger', 'q002-jason-voorhees', 'q003-michael-myers', 'q004-leatherface',
  'q005-pennywise', 'q006-ghostface', 'q007-chucky', 'q008-pinhead', 'q009-candyman',
  'q010-samara-morgan', 'q011-xenomorph', 'q012-predator', 'q013-darth-vader',
  'q014-luke-skywalker', 'q015-yoda', 'q016-emperor-palpatine', 'q017-t-800-terminator',
  'q018-t-1000', 'q019-ellen-ripley', 'q020-neo', 'q021-t-rex', 'q022-swift-raptor',
  'q023-claw-raptor', 'q024-fang-raptor', 'q025-peter-venkman', 'q026-ray-stantz',
  'q027-egon-spengler', 'q028-winston-zeddemore', 'q029-slimer', 'q030-stay-puft',
  'q031-bugs-bunny', 'q032-tasmanian-devil', 'q033-hulk', 'q034-deadpool',
  'q035-wolverine', 'q036-thanos',
]);
// Dual-wield audit — the tracked gap set is EMPTY. Step 2 fixed
// Pennywise (claw-glove pair), Predator (claws pair, plasma caster
// kept) and T-1000 (knife pair); Step 3 closed the last two with the
// rig extensions they needed — a left-hand effect anchor (Iron Man's
// twin repulsors) and a plain glove attachment type (Tifa's fighting
// gloves). All seven dual-wielders are asserted exactly in the
// canonical-pair block below. The set stays as a tripwire: if a
// dual-wielder ever loses its pair, the suite goes red until a human
// updates the audit on purpose.
const KNOWN_VISUAL_GAPS = {};

// --- coverage: one record per roster fighter -------------------------------
t('bridge carries all 43 fighters', LOADOUTS.length === 43 && LOADOUT_COUNT === 43);
t('kombatIds are unique', new Set(LOADOUTS.map((l) => l.kombatId)).size === 43);
t('bridge ids == roster ids', eq(sorted(LOADOUTS.map((l) => l.kombatId)), sorted(FIGHTERS.map((f) => f.id))));
t('bridge ids == visuals ids', eq(sorted(LOADOUTS.map((l) => l.kombatId)), sorted(FIGHTER_IDS)));
t('characterIds are unique sprint ids',
  new Set(LOADOUTS.map((l) => l.characterId)).size === 43
  && LOADOUTS.every((l) => /^q\d{3}-[a-z0-9]+(-[a-z0-9]+)*$/.test(l.characterId)));
t('records sorted by queue number',
  LOADOUTS.every((l, i) => i === 0 || LOADOUTS[i - 1].queueNumber < l.queueNumber));
t('LOADOUT_BY_ID indexes every record', LOADOUT_BY_ID.size === 43);

// --- per-record shape + roster parity --------------------------------------
const rosterById = new Map(FIGHTERS.map((f) => [f.id, f]));
for (const l of LOADOUTS) {
  const r = rosterById.get(l.kombatId);
  t(`${l.kombatId} name matches roster`, l.name === r.name);
  t(`${l.kombatId} powers == roster specials (ordered)`,
    eq(l.powers, r.specials.map((s) => s.name)));
  t(`${l.kombatId} fatality == roster fatality`, l.fatality === r.fatality.name);
  t(`${l.kombatId} powers count is 5 or 6`, l.powers.length === 5 || l.powers.length === 6);
  t(`${l.kombatId} movement style recorded`,
    typeof l.movementStyle === 'string' && l.movementStyle.length >= 20);
  t(`${l.kombatId} motion class in domain`,
    ['humanoid', 'creature', 'floater', 'other'].includes(l.motionClass));
  t(`${l.kombatId} rig class in domain`,
    ['humanoid', 'creature', 'none'].includes(l.rigClass));
  t(`${l.kombatId} glbUrl is its Step 4 hosted URL or null`,
    l.glbUrl === (HOSTED_IDS.includes(l.characterId) ? glbUrlFor(l.characterId) : null));
  if (l.weapon === null) {
    t(`${l.kombatId} weaponless is a fingerprint fighter`, WEAPONLESS.includes(l.kombatId));
  } else {
    t(`${l.kombatId} weapon has name/hand/carry`,
      ['name', 'hand', 'carry'].every((k) => typeof l.weapon[k] === 'string' && l.weapon[k].length > 0));
  }
}

// --- accuracy fingerprints ---------------------------------------------------
t('dual-wield set matches the accuracy record',
  eq(sorted(LOADOUTS.filter((l) => l.dualWield).map((l) => l.kombatId)), DUAL_WIELDERS));
t('weaponless set matches the accuracy record',
  eq(sorted(LOADOUTS.filter((l) => l.weapon === null).map((l) => l.kombatId)), WEAPONLESS));
t('creature set matches the accuracy record',
  eq(sorted(LOADOUTS.filter((l) => l.motionClass === 'creature').map((l) => l.kombatId)), CREATURES));
t('rig-skipped set matches the accuracy record',
  eq(sorted(LOADOUTS.filter((l) => l.rigClass === 'none').map((l) => l.kombatId)), RIG_NONE));
t('weapon spot check: Deadpool twin katanas',
  getLoadout('deadpool').weapon.name === 'Twin katanas + dual pistols'
  && getLoadout('deadpool').weapon.hand === 'one katana per hand');
t('weapon spot check: Wolverine claws both fists',
  getLoadout('wolverine').weapon.name.startsWith('Adamantium claws')
  && getLoadout('wolverine').weapon.hand === 'both fists');
t('weapon spot check: Candyman hook is the RIGHT hand (accuracy audit)',
  getLoadout('candyman').weapon.hand === 'right hand');
t('weapon spot check: Chucky grips ONE knife (no false dual-wield)',
  getLoadout('chucky').dualWield === false
  && getLoadout('chucky').weapon.hand === 'both hands (single knife)');

// --- availability + previews --------------------------------------------------
t('available set matches the sprint snapshot',
  eq(sorted(LOADOUTS.filter((l) => l.available).map((l) => l.characterId)), AVAILABLE_IDS));
t('hosted GLB set matches the Step 4 hosting snapshot',
  eq(sorted(LOADOUTS.filter((l) => l.glbUrl !== null).map((l) => l.characterId)), HOSTED_IDS));
t('hosted GLBs are a subset of available fighters',
  LOADOUTS.every((l) => l.glbUrl === null || l.available === true));
const publishedById = new Map(CHARACTERS.map((c) => [c.id, c]));
for (const l of LOADOUTS) {
  if (l.preview !== null) {
    t(`${l.kombatId} preview is its published characters-roster path`,
      publishedById.get(l.characterId)?.preview === l.preview);
    t(`${l.kombatId} preview file exists in public/`,
      existsSync(new URL(`../public${l.preview}`, import.meta.url)));
    t(`${l.kombatId} preview implies published + available`,
      publishedById.has(l.characterId) && l.available === true);
  }
}
for (const c of CHARACTERS) {
  const l = LOADOUTS.find((x) => x.characterId === c.id);
  t(`${c.id} published character is available in the bridge`, !!l && l.available === true);
}

// --- dual-wield visual audit (procedural spec) --------------------------------
function bothSidesTypes(visual) {
  const byType = new Map();
  for (const a of visual?.attachments || []) {
    if (!byType.has(a.type)) byType.set(a.type, new Set());
    byType.get(a.type).add(a.side);
  }
  return [...byType.entries()]
    .filter(([, sides]) => sides.has('right') && sides.has('left'))
    .map(([type]) => type);
}
function bothHandsEffectTypes(visual) {
  const byType = new Map();
  for (const e of visual?.effects || []) {
    if (!e.anchor) continue;
    if (!byType.has(e.type)) byType.set(e.type, new Set());
    byType.get(e.type).add(e.anchor);
  }
  return [...byType.entries()]
    .filter(([, anchors]) => anchors.has('hand') && anchors.has('handL'))
    .map(([type]) => type);
}
const auditGaps = [];
for (const id of DUAL_WIELDERS) {
  const pairTypes = [...bothSidesTypes(VISUALS[id]), ...bothHandsEffectTypes(VISUALS[id])];
  if (pairTypes.length === 0) auditGaps.push(id);
  else t(`${id} visual spec wields its pair on both sides (${pairTypes.join('+')})`, true);
}
t('dual-wield visual gaps are exactly the tracked set',
  eq(sorted(auditGaps), sorted(Object.keys(KNOWN_VISUAL_GAPS))));
for (const id of auditGaps) {
  console.log(`AUDIT CATCH (tracked): ${id} — ${KNOWN_VISUAL_GAPS[id]}`);
}
// The canonical pair, asserted exactly (Merlin's dual-wield clause):
{
  const dp = VISUALS['deadpool'].attachments;
  t('Deadpool carries exactly two katanas',
    dp.filter((a) => a.type === 'katana').length === 2);
  t('Deadpool katanas are one per hand',
    eq(sorted(dp.filter((a) => a.type === 'katana').map((a) => a.side)), ['left', 'right']));
  t('Deadpool no longer carries the stray knife',
    !dp.some((a) => a.type === 'knife'));
  const wv = VISUALS['wolverine'].attachments;
  t('Wolverine carries exactly two claw sets, one per side',
    wv.filter((a) => a.type === 'claws').length === 2
    && eq(sorted(wv.map((a) => a.side)), ['left', 'right']));
  // Step 2 fixes — the pairs the Step 1 audit tracked as gaps:
  const pw = VISUALS['pennywise'].attachments;
  t('Pennywise wears his razor-claw gloves on BOTH hands',
    pw.filter((a) => a.type === 'claw-glove').length === 2
    && eq(sorted(pw.filter((a) => a.type === 'claw-glove').map((a) => a.side)), ['left', 'right']));
  const pr = VISUALS['predator'].attachments;
  t('Predator wrist blades ride BOTH gauntlets, plasma caster kept',
    pr.filter((a) => a.type === 'claws').length === 2
    && eq(sorted(pr.filter((a) => a.type === 'claws').map((a) => a.side)), ['left', 'right'])
    && pr.some((a) => a.type === 'blaster' && a.side === 'right'));
  const t1 = VISUALS['t-1000'].attachments;
  t('T-1000 morphs blade arms on BOTH sides (one knife per arm)',
    t1.filter((a) => a.type === 'knife').length === 2
    && eq(sorted(t1.filter((a) => a.type === 'knife').map((a) => a.side)), ['left', 'right']));
  // Step 3 fixes — the last two gaps, closed by their rig extensions:
  const im = VISUALS['iron-man'].effects;
  t('Iron Man fires twin repulsors — exactly two glows, one per hand anchor',
    im.filter((e) => e.type === 'glow').length === 2
    && eq(sorted(im.filter((e) => e.type === 'glow').map((e) => e.anchor)), ['hand', 'handL']));
  const tf = VISUALS['tifa-lockhart'].attachments;
  t('Tifa wears her fighting gloves on BOTH hands',
    tf.filter((a) => a.type === 'gloves').length === 2
    && eq(sorted(tf.filter((a) => a.type === 'gloves').map((a) => a.side)), ['left', 'right']));
}
t('Chucky visual spec does not fake a dual-wield',
  bothSidesTypes(VISUALS['chucky']).length === 0);

// --- pad shape law -------------------------------------------------------------
for (const l of LOADOUTS) {
  t(`${l.kombatId} powers pad sides = powers + fatality`,
    l.powersPadSides === l.powers.length + 1);
  t(`${l.kombatId} powers pad shape has a name`, padShapeName(l.powersPadSides) !== null);
}
t('Bugs Bunny + Deadpool (6 specials) get heptagons',
  getLoadout('bugs-bunny').powersPadSides === 7 && getLoadout('deadpool').powersPadSides === 7);
t('five-special fighters get hexagons',
  LOADOUTS.filter((l) => l.powers.length === 5).every((l) => l.powersPadSides === 6));
t('padShapeName covers the shape law',
  padShapeName(3) === 'triangle' && padShapeName(4) === 'square'
  && padShapeName(5) === 'pentagon' && padShapeName(6) === 'hexagon'
  && padShapeName(7) === 'heptagon' && padShapeName(8) === 'octagon'
  && padShapeName(2) === null && padShapeName('6') === null);

// --- motion class vs procedural body cross-check ------------------------------
for (const id of CREATURES.filter((c) => c !== 'xenomorph')) {
  t(`${id} creature motion class rides a dino body`, VISUALS[id].body === 'dino');
}
// Xenomorph is the standing exception: a creature by rig/motion class
// whose procedural silhouette is an upright humanoid body (by design in
// visuals.js). The Step 6 pose driver keys off motionClass, not body.
t('xenomorph creature class on its humanoid silhouette (documented exception)',
  getLoadout('xenomorph').motionClass === 'creature' && VISUALS['xenomorph'].body === 'humanoid');
t('Slimer + B.O.B. are blob bodies', VISUALS['slimer'].body === 'blob' && VISUALS['bob-blob'].body === 'blob');

// --- helpers -------------------------------------------------------------------
t('getLoadout finds Freddy', getLoadout('freddy-krueger')?.characterId === 'q001-freddy-krueger');
t('getLoadout unknown -> null', getLoadout('q999-nobody') === null && getLoadout('nobody') === null);
t('getLoadout non-string -> null', getLoadout(42) === null && getLoadout(null) === null);
t('hasLoadout true/false/non-string',
  hasLoadout('hulk') === true && hasLoadout('nobody') === false && hasLoadout(undefined) === false);

console.log(`\nkombat-loadouts: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
