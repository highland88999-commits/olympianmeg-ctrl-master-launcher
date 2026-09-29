// tests/renewal-plan.test.mjs — Headless tests for the Renewal Plan data
// (lib/renewal-plan.js) and its module-route integrity.
// Run: node tests/renewal-plan.test.mjs (from the repo root). No browser,
// no network.
//
// Covers: exactly 8 nodes in order with ids node-1..node-8; Merlin's titles
// and descriptions VERBATIM (never rewritten); every node carries its
// original catbox demo video; every "built" node deep-links to a launcher
// module route that actually exists on disk under app/ (no invented
// routes); the prototype node (4) has no module but keeps its honest
// original-prototype link; the future node (8) has neither module nor
// original link and is marked future; helper functions behave.

import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  PLAN_TITLE,
  PLAN_SUBTITLE,
  PLAN_ROUTE,
  RENEWAL_PLAN_NODES,
  getNode,
  isBuilt,
  nodeAnchor,
  builtNodes,
} from '../lib/renewal-plan.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_DIR = path.join(__dirname, '..', 'app');

let passed = 0;
function check(name, fn) {
  fn();
  passed++;
  console.log('ok -', name);
}

// --- Merlin's verbatim copy (source: renewalTimeline array, Gemini history) ---
const VERBATIM = [
  ['OUTDOOR AIR PURIFIERS',
   'Air purifiers that utilize tensegrity technology and filter pollutants out of the air and push out clean air.',
   'https://files.catbox.moe/dwurko.mp4', 'https://air-filter-model.vercel.app', '/aetheris', 'built'],
  ['PURIFIER INSTALLATION TRACKING SYSTEM',
   'A system designed to track aetheris model installations and maintenance data.',
   'https://files.catbox.moe/nfbuhd.mp4', 'https://olympus-aetheris.vercel.app', '/olympus-aetheris', 'built'],
  ['AETHERIS BUSINESS MODEL',
   'The detailed spec analysis of Aetheris.',
   'https://files.catbox.moe/ssl22k.mp4', 'https://aetheris-business-model.vercel.app', '/aetheris', 'built'],
  ['AURA GENESIS',
   'A car that uses wind turbine, solar panel and electric recycling technologies along with wind streaming tunnels built dynamically into the vehicle to allow less resistance, light weight travel with no combustion engine present.',
   'https://files.catbox.moe/gibhfj.mp4', 'https://aura-genesis.vercel.app', null, 'prototype'],
  ['LAND/WATER WASTE EXTRACTION',
   'Extraction for Smelting and Repurposing through Mordor Facility.',
   'https://files.catbox.moe/9c64ot.mp4', 'https://waste-extraction.vercel.app', '/waste-extraction', 'built'],
  ['MORDOR',
   'A smelting facility that refines waste into a reusable Karbonite material, to be formed into various products, starting with the foundation for Atlantis.',
   'https://files.catbox.moe/xt9bwl.mp4', 'https://mordor-smelting.vercel.app', '/mordor-smelting', 'built'],
  ['ATLANTIS',
   'A 40 Billion Kilogram floating island with a storm dome, housing a floating forest, residential and commercial facilities to act as a tourist hotspot.',
   'https://files.catbox.moe/fudw8l.mp4', 'https://atlantis-pi.vercel.app', '/atlantis', 'built'],
  ['BEYOND THE GODS',
   'A space resource mining program made to mine extraterrestrial resources for the purpose of growing international economies and finding stronger and replenishing resources.',
   'https://files.catbox.moe/nn50cs.mp4', null, null, 'future'],
];

check('plan header constants', () => {
  assert.equal(PLAN_TITLE, 'OLYMPUS MEET THE GODS RENEWAL PLAN');
  assert.equal(PLAN_SUBTITLE, 'RENEWAL PLAN TIMELINE (ZIG-ZAG)');
  assert.equal(PLAN_ROUTE, '/renewal-plan');
});

check('exactly 8 nodes, ids node-1..node-8, indexes 1..8', () => {
  assert.equal(RENEWAL_PLAN_NODES.length, 8);
  RENEWAL_PLAN_NODES.forEach((n, i) => {
    assert.equal(n.id, `node-${i + 1}`);
    assert.equal(n.index, i + 1);
  });
});

check('titles and descriptions are verbatim', () => {
  RENEWAL_PLAN_NODES.forEach((n, i) => {
    assert.equal(n.title, VERBATIM[i][0], `title mismatch at ${n.id}`);
    assert.equal(n.description, VERBATIM[i][1], `description mismatch at ${n.id}`);
  });
});

check('every node carries its original catbox demo video', () => {
  RENEWAL_PLAN_NODES.forEach((n, i) => {
    assert.equal(n.video, VERBATIM[i][2], `video mismatch at ${n.id}`);
    assert.match(n.video, /^https:\/\/files\.catbox\.moe\/[a-z0-9]+\.mp4$/);
  });
});

check('original links and statuses match the source', () => {
  RENEWAL_PLAN_NODES.forEach((n, i) => {
    assert.equal(n.originalLink, VERBATIM[i][3], `originalLink mismatch at ${n.id}`);
    assert.equal(n.status, VERBATIM[i][5], `status mismatch at ${n.id}`);
    if (n.originalLink) assert.ok(n.originalLink.startsWith('https://'));
  });
});

check('built nodes deep-link to real launcher module routes on disk', () => {
  RENEWAL_PLAN_NODES.forEach((n, i) => {
    assert.equal(n.module, VERBATIM[i][4], `module mismatch at ${n.id}`);
    if (n.status === 'built') {
      assert.ok(n.module, `${n.id} is built but has no module route`);
      const dir = path.join(APP_DIR, n.module.replace(/^\//, ''));
      assert.ok(existsSync(dir), `${n.id} module route ${n.module} missing on disk`);
      assert.ok(existsSync(path.join(dir, 'page.jsx')), `${n.id} module route ${n.module} has no page.jsx`);
    }
  });
});

check('prototype node keeps honest original link, no invented module', () => {
  const n = getNode('node-4');
  assert.equal(n.status, 'prototype');
  assert.equal(n.module, null);
  assert.equal(n.originalLink, 'https://aura-genesis.vercel.app');
  assert.ok(!existsSync(path.join(APP_DIR, 'aura-genesis')));
});

check('future node invents nothing', () => {
  const n = getNode('node-8');
  assert.equal(n.status, 'future');
  assert.equal(n.module, null);
  assert.equal(n.originalLink, null);
});

check('helpers behave', () => {
  assert.equal(getNode('node-3').title, 'AETHERIS BUSINESS MODEL');
  assert.equal(getNode('nope'), null);
  assert.equal(nodeAnchor(getNode('node-5')), '#node-5');
  assert.ok(isBuilt(getNode('node-1')));
  assert.ok(!isBuilt(getNode('node-4')));
  assert.ok(!isBuilt(getNode('node-8')));
  const built = builtNodes().map((n) => n.id);
  assert.deepEqual(built, ['node-1', 'node-2', 'node-3', 'node-5', 'node-6', 'node-7']);
});

console.log(`\n${passed} renewal-plan tests passed`);
