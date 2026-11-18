// lib/earth2/hatch.js
// THE SHARED EGG HATCH (Merlin, 2026-11-14): the baby-dino egg /
// dino selection function lives in the BACKPACK — in EVERY realm
// the backpack lives in, not just Earth 2. Hatching used to be
// wired only into Earth2World.jsx (its hatchEggRef + species
// picker), so in Middle-earth and Hollow Earth an egg in the
// pack showed as a plain row with no tap-to-hatch and no picker.
// The law lives here now, once, and every realm uses it — the
// BackpackHud mounts it by default, Earth 2 delegates to it.
//
// The law, unchanged (Merlin, 2026-11-14):
//   · tap the egg in the backpack and it hatches RIGHT AWAY —
//     no wait, no timer. Hatching is user-caused.
//   · the species picker still opens: the user chooses what
//     hatches (Merlin, 2026-11-03 — dino selection).
//   · the baby hatches INTO the backpack (state 'pack', travel
//     false) — no spawn until the user summons it.
//   · a cold egg (stolen over 24 h ago) won't hatch.
//   · the raise cap still applies: 1 dino for anyone, 4 for a
//     land owner (titles Map/array/object OR device-local
//     claims — either leg suffices).
//
// Pure throughout: no React, no three.js, no DOM, no clock
// beyond an injectable nowMs — the scenes and the HUD own the
// rendering and the notices; this module only decides and
// rewrites the record.

import {
  DINO_STATE_PACK,
  canHatchMore,
  canRaiseDino,
  dinoIdFor,
  eggIsCold,
  homeParcelFor,
  isEggItem,
  makeDinoItem,
  raiseCapRefusal,
} from './breeding.js';
import { addDinoItem } from '../backpack/backpack.js';

/** True when this user owns Earth 2 land. owners: the titles
 *  list — a Map (parcelId → row), an array of rows, or a plain
 *  object keyed by parcel; claims: the device-local claims
 *  (same shapes). Either leg suffices. */
export function isLandownerFor(email, owners, claims) {
  return canRaiseDino(owners, email) || canRaiseDino(claims || [], email);
}

/** The pre-hatch gate: { ok: true }, or { ok: false, reason }
 *  with the exact plain words the scene shows. A non-egg
 *  returns ok:false with a null reason — the caller stays
 *  silent (it was never a hatchable tap). */
export function hatchPrecheck(eggItem, { items, isLandowner, liveDinoIds, nowMs } = {}) {
  if (!eggItem || !isEggItem(eggItem)) return { ok: false, reason: null };
  const now = nowMs == null ? Date.now() : Number(nowMs);
  if (eggIsCold(eggItem.meta, now)) {
    return { ok: false, reason: '🥚 This egg has gone cold — it won\'t hatch.' };
  }
  const landowner = !!isLandowner;
  const { ok, cap, raised } = canHatchMore(items || [], landowner, liveDinoIds || []);
  if (!ok) {
    return { ok: false, reason: `🥚 ${raiseCapRefusal(raised, cap, landowner)}` };
  }
  return { ok: true };
}

/** The egg's key for the fallback removal: id + species +
 *  stolen moment. Two eggs of one species stolen in the same
 *  millisecond would share a key — the identity removal runs
 *  first, so the key only fires when the record moved since
 *  the tap and the object no longer matches. */
function eggKeyOf(eggItem) {
  const m = (eggItem && eggItem.meta) || {};
  return [
    eggItem ? eggItem.id : '',
    m.species || '',
    m.stolenAt == null ? '' : String(m.stolenAt),
  ].join('|');
}

/** Hatch one egg into a raised dino, in the backpack record.
 *  Pure: takes an items array, returns the new items array.
 *  The egg leaves by identity; if the record moved since the
 *  tap and the object no longer matches, the (id, species,
 *  stolenAt) key removes it instead, so the egg can never
 *  hatch twice or survive its own hatch. The baby mints with
 *  state 'pack' and travel false — the backpack IS home
 *  (Merlin, 2026-11-14); no spawn here, the baby waits in
 *  the pack until the user taps it to summon. homeParcelId
 *  is kept on the record as a hint for the Earth 2 home
 *  copies (null when landless). The hatch NOTICE uses the
 *  picker's label (dino.label) — the registry slug for a
 *  species can differ from its raiseable id ('tyrannosaurus'
 *  in the picker is 'tyrannosaurus-rex' in the registry), so
 *  the registry name is never the notice text. */
export function hatchEggRecord(items, eggItem, species, { email, owners, claims, nowMs } = {}) {
  const list = Array.isArray(items) ? items : [];
  const bornAt = nowMs == null ? Date.now() : Number(nowMs);
  const dinoId = dinoIdFor(species, bornAt);
  const homeParcelId = homeParcelFor(owners, claims || [], email || '');
  const dinoItem = makeDinoItem(species, bornAt, {
    dinoId,
    state: DINO_STATE_PACK,
    homeParcelId,
    travel: false,
  });
  let withoutEgg = list.filter((it) => it !== eggItem);
  if (withoutEgg.length === list.length) {
    const key = eggKeyOf(eggItem);
    withoutEgg = list.filter((it) => eggKeyOf(it) !== key);
  }
  const next = addDinoItem({ items: withoutEgg }, dinoItem);
  return next.items;
}

/** Delete one COLD egg from the backpack record (Merlin,
 *  2026-11-17): a cold egg will never hatch and today there is
 *  no way to clear it — it sits in the pack forever. The
 *  BackpackHud offers a delete button on cold eggs only, with a
 *  tap-to-arm confirm. Pure: takes an items array, returns the
 *  new items array. A viable egg is never deleted by this
 *  function (the cold guard), and only the one egg leaves —
 *  the identity removal runs first; if the record moved since
 *  the tap, the uid, then the (id, species, stolenAt) key,
 *  removes it instead. A cold unhatched egg has no home copy
 *  (copies are raised dinos only) and no nest reference, so
 *  removing the item removes everything. */
export function deleteEggRecord(items, eggItem, { nowMs } = {}) {
  const list = Array.isArray(items) ? items : [];
  if (!eggItem || !isEggItem(eggItem)) return list;
  const now = nowMs == null ? Date.now() : Number(nowMs);
  if (!eggIsCold(eggItem.meta, now)) return list;
  let without = list.filter((it) => it !== eggItem);
  if (without.length === list.length && eggItem.uid) {
    without = list.filter((it) => it.uid !== eggItem.uid);
  }
  if (without.length === list.length) {
    const key = eggKeyOf(eggItem);
    without = list.filter((it) => eggKeyOf(it) !== key);
  }
  return without;
}
