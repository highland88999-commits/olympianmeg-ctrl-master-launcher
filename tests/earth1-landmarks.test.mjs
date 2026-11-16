// tests/earth1-landmarks.test.mjs — Earth 1 has NO landmarks
// anymore (Merlin, 2026-11-15: "Earth 1 should not have landmarks
// anymore"). The landmark system is removed entirely — spawns,
// entry/UI list, markers, and the scatter/placement anchors that
// existed only to serve landmarks — and click-to-spawn replaces
// landmark spawning.
//
// Pins: no landmarkSpawns export anywhere; no landmark list in
// the entry or the console; no landmark marker in the scene; the
// boost pads (which were anchored 6 per landmark) re-anchored on
// a seeded grid — same count 150, same trigger/cooldown/boost.
//
// Run: node tests/earth1-landmarks.test.mjs (from the repo root).
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as roam from '../lib/earth/roam.js';
import {
  PAD_TRIGGER_RADIUS_M,
  PAD_COOLDOWN_MS,
  PAD_BOOST_MS,
  PAD_BOOST_MULT,
  allBoostPads,
} from '../lib/earth/boost-pads.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

let passed = 0;
let failed = 0;
function t(name, cond) {
  if (cond) passed++;
  else { failed++; console.error(`FAIL: ${name}`); }
}
function eq(name, a, b) {
  t(name, a === b);
}

// --- No landmark spawn export ---
{
  t('roam.js exports no landmarkSpawns', !('landmarkSpawns' in roam));
  const roamSrc = read('lib/earth/roam.js');
  // The name survives only in the removal comment — no definition.
  t('roam.js defines no landmarkSpawns',
    !roamSrc.includes('export function landmarkSpawns') && !roamSrc.includes('function landmarkSpawns'));
  t('roam.js keeps stepRoam (pure lib, test-pinned)', 'stepRoam' in roam);
  t('roam.js keeps destinationPoint', 'destinationPoint' in roam);
}

// --- No landmark entry in the UI ---
{
  const page = read('app/page.jsx');
  t('page never imports landmarkSpawns', !page.includes('landmarkSpawns'));
  // 'earthSpawns' survives only in a removal comment — the live
  // list and the prop that carried it are gone.
  t('page never builds a landmark spawn list', !page.includes('spawns={earthSpawns}'));
  t('page never picks a landmark spawn', !page.includes('pickSpawn('));
  const consoleSrc = read('components/EarthConsole.jsx');
  t('console never lists landmarks', !consoleSrc.includes('>Walk at a landmark<'));
  t('console never takes a spawns prop',
    consoleSrc.includes('export default function EarthConsole({ focus, phase, onReturn, onStreet, onAscend })'));
  const menu = read('components/EarthVehicleSelect.jsx');
  t('entry menu never lists landmarks', !menu.includes('landmarkSpawns') && !menu.includes('Walk at a landmark'));
}

// --- No landmark marker in the scene ---
{
  const nexus = read('components/NexusEarth.jsx');
  t('NexusEarth mounts no landmark marker', !nexus.includes('Landmark') && !nexus.includes('landmark'));
  const boost = read('lib/earth/boost-pads.js');
  t('boost pads import no landmark list', !boost.includes('landmarkSpawns'));
  const pads = read('components/EarthBoostPads.jsx');
  t('pad component reads no landmark list', !pads.includes('landmarkSpawns'));
}

// --- The pads re-anchored: 150, deterministic, same mechanics ---
{
  const all = allBoostPads();
  eq('re-anchored pads: still 150', all.length, 150);
  const again = allBoostPads();
  eq('re-anchored pads: memoized', again, all);
  const ids = new Set(all.map((p) => p.id));
  eq('re-anchored pad ids are unique', ids.size, 150);
  t('every pad id is a grid id', all.every((p) => /^grid-\d+-\d+$/.test(p.id)));
  t('no pad carries a landmark anchor', all.every((p) => p.landmarkId === undefined));
  eq('trigger radius unchanged at 6 m', PAD_TRIGGER_RADIUS_M, 6);
  eq('cooldown unchanged at 20 s', PAD_COOLDOWN_MS, 20000);
  eq('boost unchanged at 4 s', PAD_BOOST_MS, 4000);
  eq('boost mult unchanged at ×1.5', PAD_BOOST_MULT, 1.5);
}

console.log(`earth1-landmarks: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
