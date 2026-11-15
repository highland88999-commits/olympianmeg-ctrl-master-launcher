// lib/afterlife/realm-life-line.js
// REALM LIFE LINE (Nov 14, 2026) — the shared one-line life summary
// for the 24 afterlife realms' realm-info overlays.
//
// What it shows, honestly:
//   · the SOUL CENSUS — populationFor() run over the realm's REAL
//     spawner output (makeWorld() with its default seed, the exact
//     seed the realm's world3d uses, so the 18 creatures counted
//     here are the 18 rendered in the world): how many of the
//     realm's drifting kind are alive, and the three region discs
//     they drift across. No number is invented.
//   · ONE drifting soul's life line — humanoidLifeLineFor(
//     humanoidLifeFor(...)) for a single real spawner cell, picked
//     by DAY (days since the realms' founding, modulo the 18
//     cells), so the soul shown changes daily. The line carries
//     the humanoid shape — stage · activity · garment (wear) ·
//     unarmed — the garment data-only (the cone is the garment),
//     the weapon verified absent. The overlay says so: "One Shade
//     today: ...". It is one soul, not the whole population — the
//     census line beside it is the whole population.
//   · the dead do not eat or hunt and guardians are eternal
//     singletons (see lib/afterlife/operators.js) — nothing here
//     changes any death law, diet, population minimum or behaviour
//     rule. Wiring only: the operators already computed all of this.
//
// The component (components/RealmLifeLine.jsx) renders this inside
// the per-realm overlay HUD block, so the line fades with the
// overlay on any tap and returns with the ⓘ Info button — that is
// the intended behaviour, not a bug.
//
// Pure: no DOM, no React — node tests drive this module directly.

import {
  speciesFor,
  populationFor,
  FOUNDING_MS,
  DAY_MS,
} from './operators.js';
import {
  humanoidLifeFor,
  humanoidLifeLineFor,
} from './humanoid-operators.js';
import { makeWorld as makeNetherRealm } from '../nether-realm/world.js';
import { makeWorld as makeHelheim } from '../helheim/world.js';
import { makeWorld as makeYomi } from '../yomi/world.js';
import { makeWorld as makeHell } from '../hell/world.js';
import { makeWorld as makeNaraka } from '../naraka/world.js';
import { makeWorld as makeDiyu } from '../diyu/world.js';
import { makeWorld as makeAnnwn } from '../annwn/world.js';
import { makeWorld as makeKur } from '../kur/world.js';
import { makeWorld as makeNav } from '../nav/world.js';
import { makeWorld as makeOrun } from '../orun/world.js';
import { makeWorld as makeDuat } from '../duat/world.js';
import { makeWorld as makeMictlan } from '../mictlan/world.js';
import { makeWorld as makeXibalba } from '../xibalba/world.js';
import { makeWorld as makeTlalocan } from '../tlalocan/world.js';
import { makeWorld as makeMayaSky } from '../maya-sky/world.js';
import { makeWorld as makeVyraj } from '../vyraj/world.js';
import { makeWorld as makeTiangong } from '../tiangong/world.js';
import { makeWorld as makeHeaven } from '../heaven/world.js';
import { makeWorld as makeSvarga } from '../svarga/world.js';
import { makeWorld as makeTakamagahara } from '../takamagahara/world.js';
import { makeWorld as makeTirNaNog } from '../tir-na-nog/world.js';
import { makeWorld as makeElysium } from '../elysium/world.js';
import { makeWorld as makeValhalla } from '../valhalla/world.js';
import { makeWorld as makeAaru } from '../aaru/world.js';

// One spawner per realm. The default seed of each makeWorld() is the
// seed that realm's world3d renders (1337 everywhere except hell
// 1338, naraka 1339, diyu 1340), so calling it bare reproduces the
// live scene's 18 creatures exactly.
const WORLDS = {
  'nether-realm': makeNetherRealm,
  helheim: makeHelheim,
  yomi: makeYomi,
  hell: makeHell,
  naraka: makeNaraka,
  diyu: makeDiyu,
  annwn: makeAnnwn,
  kur: makeKur,
  nav: makeNav,
  orun: makeOrun,
  duat: makeDuat,
  mictlan: makeMictlan,
  xibalba: makeXibalba,
  tlalocan: makeTlalocan,
  'maya-sky': makeMayaSky,
  vyraj: makeVyraj,
  tiangong: makeTiangong,
  heaven: makeHeaven,
  svarga: makeSvarga,
  takamagahara: makeTakamagahara,
  'tir-na-nog': makeTirNaNog,
  elysium: makeElysium,
  valhalla: makeValhalla,
  aaru: makeAaru,
};

/**
 * The realm's life-line data at the device clock, or null for an
 * unknown realm / a realm with no spawner output.
 *
 * Returns { realmKey, kind, kindPlural, line, census, censusLine,
 * cellId, dayIndex, text } where `line` is one seeded soul's
 * humanoidLifeLineFor, `census` is the populationFor() audit over the real
 * spawner output, and `text` is the exact string the overlay shows.
 */
export function realmLifeLine(realmKey, now = Date.now()) {
  const rec = speciesFor(realmKey);
  const makeWorld = WORLDS[realmKey];
  if (!rec || typeof makeWorld !== 'function') return null;
  const t = now instanceof Date ? now.getTime() : Number(now);
  const creatures = makeWorld()[rec.varName] || [];
  if (!creatures.length) return null;

  const census = populationFor(realmKey, creatures, t);

  // One soul, seeded by day: the day count since the realms'
  // founding picks the spawner cell, so the soul shown changes
  // daily and is the same soul all day on every device.
  const dayIndex = Math.max(0, Math.floor((t - FOUNDING_MS) / DAY_MS));
  const cell = creatures[dayIndex % creatures.length];
  const life = humanoidLifeFor(realmKey, rec.kind, cell.id, t, { x: cell.x, z: cell.z });
  const line = humanoidLifeLineFor(life);
  if (!line) return null;

  const areaNames = (census.areas || []).map((key) => {
    const a = rec.areas.find((x) => x.key === key);
    return a ? a.name : key;
  });
  const censusLine = `${census.alive} of ${census.total} ${rec.kindPlural} drifting across ${areaNames.join(' · ') || 'these fields'}`;
  return {
    realmKey,
    kind: rec.kind,
    kindPlural: rec.kindPlural,
    line,
    census,
    censusLine,
    cellId: cell.id,
    dayIndex,
    text: `${censusLine} — One ${rec.kind} today: ${line}`,
  };
}
