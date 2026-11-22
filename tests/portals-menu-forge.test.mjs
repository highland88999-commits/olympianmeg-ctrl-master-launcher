// Portals program menu (2026-10-28, Merlin): the Agent Forge + FINTRAC
// footer cards that sat over the scrolling rows are gone. Agent Forge now
// lives as a normal row under ATHENA (owner-only, registry untouched);
// the FINTRAC entry leaves this placement entirely (Concourse tile,
// Portal Room chrome, and the wizard step keep it).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GOD_MENUS, AGENT_FORGE_MENU, godMenuFor } from '../lib/god-menus.js';

const registryText = readFileSync('lib/i18n/satellites.ts', 'utf8');
const registryKeys = [...registryText.matchAll(/\{ key: "([^"]+)", route: "([^"]+)", pos: "([^"]+)", section: "([^"]+)", constellation: "([^"]+)" \}/g)]
  .map((m) => m[1]);
const page = readFileSync('app/page.jsx', 'utf8');
const menu = readFileSync('components/SatelliteMenu.jsx', 'utf8');
const search = readFileSync('lib/menu-search.js', 'utf8');

test('registry untouched: still 213, no agent-forge', () => {
  assert.equal(registryKeys.length, 220); // Job Board seat: 216→217, Nov 21, 2026 (pins were stale at 215 — registry was already 216 before this seat); Red Moon seat: 214→215, Nov 17, 2026; Housing seat: 217→218; Social Assistance seat: 218→219; Business Services seat: 219→220 (four-program merge), Nov 21, 2026; 181 at this test's writing; Hades seats: →198; nether-realms homes: →210 (Nov 12, 2026); Earth 4 seat: →211 (Nov 14, 2026); Moon + Sun Base seats: →213 (Nov 14, 2026); Jupiter 2 + Mars 2 seats: →215 (Nov 15, 2026); Ghost Rider seat: →216 (Nov 15, 2026); Weapons Forge seat removed: →215 (Nov 15, 2026); Land of the Dead seat added: 215→216 (Nov 16, 2026); ARES seat removed: 216→215 (Nov 16, 2026); Land of the Dead seat removed: 215→214 (Nov 16, 2026, floor drop only); Portal Room seat removed: 214→213 (Nov 16, 2026, portal menu merge); Keepsake seat: 213→214, Nov 17, 2026. The point stands: agent-forge is NOT in the registry.
  assert.equal(registryKeys.includes('agent-forge'), false);
});

test('agent-forge has one home: ATHENA, beside the other AI programs', () => {
  assert.equal(AGENT_FORGE_MENU.route, '/agent-forge');
  assert.equal(AGENT_FORGE_MENU.pos, 'ATHENA');
  assert.equal(AGENT_FORGE_MENU.title, 'Agent Forge');
  assert.equal(AGENT_FORGE_MENU.subtitle, 'Personal AI & Brain Sync');
  assert.equal(godMenuFor('agent-forge')?.god, 'ATHENA');
  const athena = GOD_MENUS.find((m) => m.god === 'ATHENA');
  assert.ok(athena.satellites.includes('human-ai'), 'ATHENA still holds human-ai');
  assert.ok(athena.satellites.includes('agent-forge'));
});

test('program menu: both footer cards gone, list owns the full height', () => {
  assert.equal(page.includes('FintracExplanationMenuButton'), false);
  assert.equal(page.includes("launchPocketUniverse('/agent-forge'"), false);
  assert.equal(page.includes('Personal AI &amp; Brain Sync'), false);
  assert.match(page, /<SatelliteMenu/);
  assert.match(page, /className="fixed inset-0 z-\[40000\] ui-element"/);
  assert.match(page, /t\('ui\.disconnect'\)/);
});

test('agent-forge row appears for the owner only (satIndex gate)', () => {
  assert.match(page, /isOwnerEmail\(session\.user\.email\)/);
  assert.match(page, /if \(isOwner\) \{\s*map\.set\(AGENT_FORGE_MENU\.key/);
});

test('menu row and search wear the shared display copy, never an echoed key', () => {
  assert.match(menu, /AGENT_FORGE_MENU/);
  assert.match(menu, /key === AGENT_FORGE_MENU\.key/);
  assert.match(search, /AGENT_FORGE_MENU/);
});
