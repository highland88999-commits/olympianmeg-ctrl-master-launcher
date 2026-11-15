// tests/luge/test-luge-sled-cgi.mjs
// Headless tests for the procedural CGI bobsleds (lib/luge/sled-cgi.js):
// the luge sleds ARE the bobsleds — each sled gets a real 3D hull wearing
// its OG Luge-Refuge livery (base colour + signature motif, seeded).
// Run: node tests/luge/test-luge-sled-cgi.mjs (from the repo root).
// No browser, no network.
import { readFileSync } from 'node:fs';
import {
  sledMotifFor,
  sledSeed,
  makeSledLiveryTexture,
  makeSledHullGeometry,
  SLED_HULL_DIMS,
} from '../../lib/luge/sled-cgi.js';
import { LUGE_SLEDS } from '../../lib/luge_data.js';

let passed = 0;
let failed = 0;
function t(name, cond) {
  if (cond) { passed++; }
  else { failed++; console.error(`FAIL: ${name}`); }
}

// --- OG motif mapping: the documented liveries land on the right motif ---
t("Neon Phantom wears its neon-pink eyes", sledMotifFor({ name: 'Neon Phantom' }) === 'eyes');
t('Street Samurai wears its red runes', sledMotifFor({ name: 'Street Samurai' }) === 'runes');
t('Rift Marauder wears its violet vortex', sledMotifFor({ name: 'Rift Marauder' }) === 'vortex');
t('Chrono Phantom echoes (chrono beats phantom)', sledMotifFor({ name: 'Chrono Phantom' }) === 'echoes');
t('Cyber Zeus throws lightning', sledMotifFor({ name: 'Cyber Zeus' }) === 'lightning');
t('Quantum Leviathan wears scales', sledMotifFor({ name: 'Quantum Leviathan' }) === 'scales');
t('Mega Hermes wears wings', sledMotifFor({ name: 'Mega Hermes' }) === 'wings');
t('Multiversal Odin wears the eye', sledMotifFor({ name: 'Multiversal Odin' }) === 'eye');
t('Abyss Sovereign wears tentacles', sledMotifFor({ name: 'Abyss Sovereign' }) === 'tentacles');
t('Standard Racer wears stripes', sledMotifFor({ name: 'Standard Racer' }) === 'stripes');
t('Urban Glider wears fin plates', sledMotifFor({ name: 'Urban Glider' }) === 'fins');
t("Merlin's Apex wears gold runes", sledMotifFor({ name: "Merlin's Apex" }) === 'runes');
t('every sled in the garage maps to a motif',
  LUGE_SLEDS.every((s) => typeof sledMotifFor(s) === 'string' && sledMotifFor(s).length > 0));
t('motif lookup is null-safe', sledMotifFor(null) === 'stripes');
t('motif lookup is name-based, not id-based (no invented sleds)',
  sledMotifFor({ id: 'p999', name: 'Neon Phantom' }) === 'eyes');

// --- seeds are stable per sled, distinct across sleds ---
t('seed is deterministic', sledSeed({ id: 'p1' }) === sledSeed({ id: 'p1' }));
t('seeds differ across sleds',
  new Set(LUGE_SLEDS.map((s) => sledSeed(s))).size === LUGE_SLEDS.length);

// --- procedural hull geometry: same footprint as the old 3 x 1 x 6 box ---
const geo = makeSledHullGeometry();
geo.computeBoundingBox();
const bb = geo.boundingBox;
const size = {
  x: bb.max.x - bb.min.x,
  y: bb.max.y - bb.min.y,
  z: bb.max.z - bb.min.z,
};
t('hull is real geometry (has vertices)', geo.attributes.position.count > 100);
t('hull has UVs for the livery texture', !!geo.attributes.uv);
t('hull UVs are normalised to 0..1', (() => {
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    if (uv.getX(i) < -0.01 || uv.getX(i) > 1.01 || uv.getY(i) < -0.01 || uv.getY(i) > 1.01) return false;
  }
  return true;
})());
t(`hull width matches the old box (${SLED_HULL_DIMS.width})`, Math.abs(size.x - SLED_HULL_DIMS.width) < 0.05);
t(`hull height is ~${SLED_HULL_DIMS.height}`, Math.abs(size.y - SLED_HULL_DIMS.height) < 0.1);
t(`hull length is ~${SLED_HULL_DIMS.length}`, Math.abs(size.z - SLED_HULL_DIMS.length) < 0.3);
t('hull is centred on the sled origin', Math.abs(bb.min.x + bb.max.x) < 0.05 && Math.abs(bb.min.z + bb.max.z) < 0.05);
t('hull nose points at local -Z (travel direction)', bb.min.z < -2.9 && bb.max.z > 2.9);

// --- livery texture is procedural (null headlessly — no document) ---
t('livery texture returns null with no document (headless-safe)',
  makeSledLiveryTexture(LUGE_SLEDS[0]) === null);

// --- the page actually wires the CGI sleds ---
const page = readFileSync(new URL('../../app/luge/page.tsx', import.meta.url), 'utf8');
t('page: builds the procedural hull geometry', page.includes('makeSledHullGeometry()'));
t('page: builds the seeded livery texture', page.includes('makeSledLiveryTexture(sled)'));
t('page: renders the hull geometry (not the flat box)', page.includes('<mesh geometry={hullGeo}'));
t('page: no flat box hull remains', !page.includes('<boxGeometry args={[3, 1, 6]}'));
t('page: keeps the OG hull wrap as the deck inlay', page.includes('Cockpit deck inlay'));
t('page: adds carbon runner blades', page.includes('Carbon runner blades'));
t('page: adds rear fins in the sled accent', page.includes('Rear fins'));
t('page: rider mount still uses the same footprint (physics untouched)',
  page.includes('LUGE_RIDER_MOUNT'));
const dataSrc = readFileSync(new URL('../../lib/luge_data.js', import.meta.url), 'utf8');
t('luge_data: sled stats untouched (sandResist tiers still defined)',
  /sandResist: 0\.75/.test(dataSrc) && /boostGain: 2\.0/.test(dataSrc));

console.log(`\nsled-cgi: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
