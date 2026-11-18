// tests/egg-hatch.test.mjs
// THE SHARED EGG HATCH (Merlin, 2026-11-14): the baby-dino egg /
// dino selection function lives in the BACKPACK — in EVERY realm
// the backpack lives in, not just Earth 2. Hatching used to be
// wired only into Earth2World.jsx, so in Middle-earth and Hollow
// Earth an egg showed as a plain row. The law lives in
// lib/earth2/hatch.js now, the BackpackHud mounts it by default,
// and Earth 2 delegates to it.
//
// Run: node --test tests/egg-hatch.test.mjs   (from repo root)

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  EGG_VIABLE_MS,
  RAISE_CAP_FREE,
  RAISE_CAP_LANDOWNER,
  DINO_STATE_PACK,
  isEggItem,
  isDinoItem,
  dinoIdOf,
  makeEggItem,
  makeDinoItem,
} from '../lib/earth2/breeding.js';
import {
  deleteEggRecord,
  hatchPrecheck,
  hatchEggRecord,
  isLandownerFor,
} from '../lib/earth2/hatch.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const readSource = (rel) => readFileSync(join(__dirname, '..', rel), 'utf8');

const NOW = 1_793_000_000_000; // fixed clock for the tests
const EMAIL = 'merlin@example.com';
const CLAIMS = [
  { parcel_id: 'E2-0719', owner_email: EMAIL },
  { parcel_id: 'E2-0619', owner_email: EMAIL },
];
const OWNERS_MAP = new Map([
  ['E2-0619', { parcel_id: 'E2-0619', owner_email: EMAIL }],
]);

function freshEgg(stolenAtMs = NOW - 60_000) {
  return makeEggItem('stegosaurus', stolenAtMs);
}

function raisedDino(species, bornAtMs = NOW - 1000) {
  return makeDinoItem(species, bornAtMs, { state: DINO_STATE_PACK, travel: false });
}

describe('hatchPrecheck — the cold / cap gate (same law in every realm)', () => {
  it('a fresh egg with room under the cap passes', () => {
    assert.deepEqual(
      hatchPrecheck(freshEgg(), { items: [], isLandowner: false, nowMs: NOW }),
      { ok: true },
    );
  });

  it('a non-egg is not a hatchable tap — silent, no reason', () => {
    const pre = hatchPrecheck({ id: 'rock', kind: 'material', name: 'Rock', qty: 1 }, { items: [], nowMs: NOW });
    assert.equal(pre.ok, false);
    assert.equal(pre.reason, null);
  });

  it('a cold egg (stolen over 24 h ago) refuses with the exact cold words', () => {
    const pre = hatchPrecheck(freshEgg(NOW - EGG_VIABLE_MS - 1), { items: [], isLandowner: false, nowMs: NOW });
    assert.equal(pre.ok, false);
    assert.equal(pre.reason, '🥚 This egg has gone cold — it won\'t hatch.');
  });

  it('an egg stolen exactly 24 h ago is still viable (the line is "over 24 h")', () => {
    const pre = hatchPrecheck(freshEgg(NOW - EGG_VIABLE_MS), { items: [], isLandowner: false, nowMs: NOW });
    assert.equal(pre.ok, true);
  });

  it('a landless user at the 1-dino cap refuses with the exact free words', () => {
    const items = [raisedDino('triceratops')];
    const pre = hatchPrecheck(freshEgg(), { items, isLandowner: false, nowMs: NOW });
    assert.equal(pre.ok, false);
    assert.equal(
      pre.reason,
      `🥚 You already raise ${RAISE_CAP_FREE} dino — that's the most without land. Buy a parcel to raise up to ${RAISE_CAP_LANDOWNER}.`,
    );
  });

  it('a land owner with 3 dinos still has room; with 4 the cap refuses', () => {
    const three = [raisedDino('triceratops'), raisedDino('velociraptor'), raisedDino('stegosaurus')];
    assert.equal(hatchPrecheck(freshEgg(), { items: three, isLandowner: true, nowMs: NOW }).ok, true);
    const four = [...three, raisedDino('gallimimus')];
    const pre = hatchPrecheck(freshEgg(), { items: four, isLandowner: true, nowMs: NOW });
    assert.equal(pre.ok, false);
    assert.equal(pre.reason, `🥚 You already raise ${RAISE_CAP_LANDOWNER} dinos — that's the most any land owner can raise.`);
  });

  it('a live ally with no item still counts toward the cap (no record-gap cheat)', () => {
    const pre = hatchPrecheck(freshEgg(), {
      items: [],
      isLandowner: false,
      liveDinoIds: ['dino-triceratops-123'],
      nowMs: NOW,
    });
    assert.equal(pre.ok, false);
  });
});

describe('hatchEggRecord — the mint (baby into the backpack, never a spawn)', () => {
  it('removes the egg by identity and mints the dino in the pack', () => {
    const egg = freshEgg();
    const weapon = { id: 'sword-1', kind: 'weapon', name: 'Sword', qty: 1, meta: {} };
    const items = hatchEggRecord([weapon, egg], egg, 'triceratops', {
      email: EMAIL, owners: OWNERS_MAP, claims: CLAIMS, nowMs: NOW,
    });
    assert.equal(items.length, 2);
    assert.ok(items.some((it) => it.id === 'sword-1'), 'unrelated items survive the hatch');
    assert.ok(!items.some((it) => isEggItem(it)), 'the egg leaves the pack');
    const dino = items.find(isDinoItem);
    assert.ok(dino, 'a dino item is minted');
    assert.equal(dino.meta.species, 'triceratops');
    assert.equal(dino.meta.state, DINO_STATE_PACK, 'hatches INTO the backpack');
    assert.equal(dino.meta.travel, false, 'a fresh hatch never travels');
    assert.equal(dino.meta.bornAt, NOW);
    assert.equal(dino.meta.dinoId, `dino-triceratops-${NOW}`);
    assert.equal(dinoIdOf(dino), `dino-triceratops-${NOW}`);
  });

  it('the home parcel hint is the first owned parcel, sorted — null when landless', () => {
    const egg = freshEgg();
    const items = hatchEggRecord([egg], egg, 'velociraptor', {
      email: EMAIL, owners: OWNERS_MAP, claims: CLAIMS, nowMs: NOW,
    });
    assert.equal(items.find(isDinoItem).meta.homeParcelId, 'E2-0619');
    const landlessEgg = freshEgg();
    const landless = hatchEggRecord([landlessEgg], landlessEgg, 'velociraptor', {
      email: 'stranger@example.com', owners: OWNERS_MAP, claims: CLAIMS, nowMs: NOW,
    });
    assert.equal(landless.find(isDinoItem).meta.homeParcelId, null);
  });

  it('when the record moved since the tap, the egg still leaves exactly once (key fallback)', () => {
    const egg = freshEgg(NOW - 5000);
    // A copy with the same key but a different object identity —
    // what the record holds when it refreshed between tap and pick.
    const sameKeyEgg = makeEggItem('stegosaurus', NOW - 5000);
    assert.notEqual(sameKeyEgg, egg);
    const items = hatchEggRecord([sameKeyEgg], egg, 'stegosaurus', {
      email: EMAIL, owners: OWNERS_MAP, claims: CLAIMS, nowMs: NOW,
    });
    assert.equal(items.filter(isEggItem).length, 0, 'no egg survives its own hatch');
    assert.equal(items.filter(isDinoItem).length, 1, 'exactly one dino hatches');
  });

  it('the hatch notice uses the picker label — never the registry slug', () => {
    // The picker id for the king is 'tyrannosaurus' while the
    // registry slug is 'tyrannosaurus-rex': a registry lookup
    // would name it wrong. Both hatch call sites (the shared
    // hook and Earth 2's picker) announce dino.label — the
    // label the user just tapped — so the notice always reads
    // the species they chose.
    const hook = readSource('components/backpack/useEggHatch.jsx');
    const e2 = readSource('components/earth2/Earth2World.jsx');
    assert.ok(hook.includes('A baby ${dino.label} hatches'), 'shared hook announces the picked label');
    assert.ok(e2.includes('A baby ${dino.label} hatches'), 'Earth 2 announces the picked label');
    const menu = readSource('components/earth2/DinoSelectionMenu.jsx');
    assert.ok(menu.includes("id: 'tyrannosaurus', label: 'Tyrannosaurus'"), 'the picker names it Tyrannosaurus');
  });
});

describe('isLandownerFor — titles leg OR claims leg, either suffices', () => {
  it('a titles Map row with a matching email (case-insensitive) counts', () => {
    assert.equal(isLandownerFor('MERLIN@EXAMPLE.COM', OWNERS_MAP, []), true);
  });

  it('a device-local claim counts with no titles at all', () => {
    assert.equal(isLandownerFor(EMAIL, null, CLAIMS), true);
    assert.equal(isLandownerFor(EMAIL, {}, CLAIMS), true);
  });

  it('a stranger with neither leg does not count; an empty email never counts', () => {
    assert.equal(isLandownerFor('stranger@example.com', OWNERS_MAP, CLAIMS), false);
    assert.equal(isLandownerFor('', OWNERS_MAP, CLAIMS), false);
    assert.equal(isLandownerFor(EMAIL, null, []), false);
  });
});

describe('wiring — the hatch lives in the backpack, in every realm', () => {
  it('BackpackHud hatches by default: the egg row is tappable with no onEggHatch passed', () => {
    const hud = readSource('components/backpack/BackpackHud.jsx');
    assert.ok(hud.includes("import useEggHatch from '@/components/backpack/useEggHatch'"), 'HUD imports the shared hatch hook');
    assert.ok(hud.includes('const hatchEgg = onEggHatch || eggHatch.hatch'), 'the realm override wins, the shared hook is the default');
    assert.ok(hud.includes('() => hatchEgg(it)'), 'the egg row taps the resolved hatch');
    assert.ok(hud.includes('{!onEggHatch && eggHatch.picker}'), 'the shared picker renders when no realm passed its own');
    assert.ok(hud.includes('{!onEggHatch && eggHatch.toast}'), 'the shared fallback toast renders when no realm passed its own');
    assert.ok(!hud.includes('the egg as a plain row'), 'the plain-row fallback for eggs is gone');
  });

  it('Earth 2 delegates its hatch to the shared law (same gate, same mint)', () => {
    const e2 = readSource('components/earth2/Earth2World.jsx');
    assert.ok(e2.includes('hatchPrecheck(eggItem, {'), 'hatchEggRef gates through hatchPrecheck');
    assert.ok(e2.includes('isLandownerFor(myEmail, ownersByParcel, claims || [])'), 'the titles leg survives the delegation');
    assert.ok(e2.includes('hatchEggRecord(r.items || [], egg, dino.id, {'), 'the picker mints through hatchEggRecord');
    assert.ok(!e2.includes('eggIsCold(eggItem.meta'), 'no inline cold check left in the scene');
    assert.ok(!e2.includes('canHatchMore(rec.items'), 'no inline cap check left in the scene');
  });

  it('Middle-earth and Hollow Earth mount the same BackpackHud — no per-realm hatch wiring needed', () => {
    for (const page of ['app/middle-earth/page.jsx', 'app/hollow-earth/page.jsx']) {
      const src = readSource(page);
      assert.ok(src.includes("import BackpackHud from '@/components/backpack/BackpackHud'"), `${page} mounts the shared HUD`);
      assert.ok(src.includes('<BackpackHud'), `${page} renders the HUD`);
    }
  });

  it('dino selection (summon / recall — who spawns with the user) already works in all three dino realms', () => {
    const e2 = readSource('components/earth2/Earth2World.jsx');
    assert.ok(e2.includes('onDinoSummon='), 'Earth 2 passes summon to the HUD');
    assert.ok(e2.includes('onDinoRecall='), 'Earth 2 passes recall to the HUD');
    for (const page of ['app/middle-earth/page.jsx', 'app/hollow-earth/page.jsx']) {
      const src = readSource(page);
      assert.ok(src.includes('onDinoSummon='), `${page} passes summon to the HUD`);
      assert.ok(src.includes('onDinoRecall='), `${page} passes recall to the HUD`);
      assert.ok(src.includes('dinoApiRef.current = { summon:'), `${page} wires summon/recall through its dino api`);
    }
  });
});

describe('deleteEggRecord — clearing a cold egg (Merlin, 2026-11-17)', () => {
  // Stored items carry a uid (sanitizeBackpackRecord stamps one);
  // the helper mirrors that so the identity/uid paths are real.
  function storedEgg(species, stolenAtMs, uid) {
    return { ...makeEggItem(species, stolenAtMs), uid };
  }
  const coldAt = NOW - EGG_VIABLE_MS - 1000;
  const warmAt = NOW - 60_000;

  it('removes the cold egg by identity and leaves everything else alone', () => {
    const cold = storedEgg('stegosaurus', coldAt, 'egg-cold-1');
    const warm = storedEgg('triceratops', warmAt, 'egg-warm-1');
    const weapon = { id: 'sword-1', kind: 'weapon', name: 'Sword', qty: 1, meta: {}, uid: 'w-1' };
    const dino = raisedDino('brachiosaurus');
    const items = deleteEggRecord([weapon, cold, warm, dino], cold, { nowMs: NOW });
    assert.equal(items.length, 3);
    assert.ok(!items.some((it) => it === cold), 'the cold egg leaves');
    assert.ok(items.some((it) => it === warm), 'the viable egg survives');
    assert.ok(items.some((it) => it === weapon), 'unrelated items survive');
    assert.ok(items.some((it) => it === dino), 'a hatched dino survives');
  });

  it('two cold eggs of one species: only the tapped one leaves', () => {
    const first = storedEgg('stegosaurus', coldAt, 'egg-cold-1');
    const second = storedEgg('stegosaurus', coldAt, 'egg-cold-2');
    const items = deleteEggRecord([first, second], first, { nowMs: NOW });
    assert.equal(items.length, 1);
    assert.equal(items[0], second);
  });

  it('a viable egg is never deleted — the cold guard refuses it', () => {
    const warm = storedEgg('triceratops', warmAt, 'egg-warm-1');
    const items = deleteEggRecord([warm], warm, { nowMs: NOW });
    assert.equal(items.length, 1);
    assert.equal(items[0], warm);
  });

  it('an egg stolen exactly 24 h ago is still viable and never deleted', () => {
    const edge = storedEgg('triceratops', NOW - EGG_VIABLE_MS, 'egg-edge-1');
    assert.equal(deleteEggRecord([edge], edge, { nowMs: NOW }).length, 1);
  });

  it('a non-egg is never deleted', () => {
    const rock = { id: 'rock', kind: 'material', name: 'Rock', qty: 1, meta: {}, uid: 'r-1' };
    assert.equal(deleteEggRecord([rock], rock, { nowMs: NOW }).length, 1);
    assert.equal(deleteEggRecord([rock], null, { nowMs: NOW }).length, 1);
  });

  it('when the record moved since the tap, the uid removes it', () => {
    const stored = storedEgg('stegosaurus', coldAt, 'egg-cold-9');
    // The tap holds a different object with the same uid — the
    // record refreshed between the tap and the confirm.
    const tapped = { ...makeEggItem('stegosaurus', coldAt - 5000), uid: 'egg-cold-9' };
    assert.notEqual(tapped, stored);
    const items = deleteEggRecord([stored], tapped, { nowMs: NOW });
    assert.equal(items.length, 0, 'the uid fallback removes the stored egg');
  });

  it('when even the uid moved, the (id, species, stolenAt) key removes it', () => {
    const stored = storedEgg('stegosaurus', coldAt, 'egg-cold-7');
    const tapped = makeEggItem('stegosaurus', coldAt); // no uid at all
    const items = deleteEggRecord([stored], tapped, { nowMs: NOW });
    assert.equal(items.length, 0, 'the key fallback removes the stored egg');
  });

  it('an egg with no stolen moment counts as cold and deletes', () => {
    const noTime = { ...makeEggItem('stegosaurus', Date.now()), uid: 'egg-notime-1' };
    delete noTime.meta.stolenAt;
    assert.equal(deleteEggRecord([noTime], noTime, { nowMs: NOW }).length, 0);
  });
});

describe('wiring — the cold-egg delete lives on the cold row only', () => {
  it('BackpackHud shows a delete button on cold eggs and never on viable ones', () => {
    const hud = readSource('components/backpack/BackpackHud.jsx');
    assert.ok(hud.includes("import { dinoStateOf, eggIsCold, isEggItem } from '@/lib/earth2/breeding'"), 'HUD imports the cold check');
    assert.ok(hud.includes("import { deleteEggRecord } from '@/lib/earth2/hatch'"), 'HUD imports the delete');
    assert.ok(hud.includes('const isColdEgg = isEgg && eggIsCold(it.meta, Date.now())'), 'cold is decided per row, live');
    assert.ok(hud.includes('{isColdEgg && ('), 'the button renders only on a cold egg row');
    assert.ok(hud.includes("aria-label={deleteArmedUid === it.uid ? `Confirm delete of cold ${it.name}` : `Delete cold ${it.name}`}"), 'the button names the egg it deletes');
    assert.ok(hud.includes("'Delete?'"), 'the armed state reads as a question, not a done deed');
  });

  it('the delete is two taps: arm, then confirm — never one stray tap', () => {
    const hud = readSource('components/backpack/BackpackHud.jsx');
    assert.ok(hud.includes('const [deleteArmedUid, setDeleteArmedUid] = useState(null)'), 'an armed uid is tracked');
    assert.ok(hud.includes('setTimeout(() => setDeleteArmedUid(null), 5000)'), 'the arm expires after 5 s');
    assert.ok(hud.includes('deleteEggRecord(rec.items || [], eggItem)'), 'the confirm deletes through the record');
    assert.ok(hud.includes('updateBackpack((rec) => ({ ...rec, items: deleteEggRecord'), 'the delete goes through updateBackpack (device copy now, account copy on flush)');
  });

  it('a cold egg row says it has gone cold instead of promising a hatch', () => {
    const hud = readSource('components/backpack/BackpackHud.jsx');
    assert.ok(hud.includes("' · gone cold 🥚'"), 'cold rows read as gone cold');
    assert.ok(hud.includes("' · tap to hatch 🐣'"), 'viable rows still promise the hatch');
  });

  it('the delete lives in lib/earth2/hatch.js next to the hatch law', () => {
    const hatch = readSource('lib/earth2/hatch.js');
    assert.ok(hatch.includes('export function deleteEggRecord'), 'deleteEggRecord is exported from the hatch law');
    assert.ok(hatch.includes('if (!eggIsCold(eggItem.meta, now)) return list'), 'the cold guard is inside the delete');
  });
});
