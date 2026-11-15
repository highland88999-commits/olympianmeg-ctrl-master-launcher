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
  assert.equal(registryKeys.length, 213); // 181 at this test's writing; Hades seats: →198; nether-realms homes: →210 (Nov 12, 2026); Earth 4 seat: →211 (Nov 14, 2026); Moon + Sun Base seats: →213 (Nov 14, 2026). The point stands: agent-forge is NOT in the registry.
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
