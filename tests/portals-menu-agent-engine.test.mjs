// Agent Engine's menu home (2026-10-28, Merlin): ATHENA, owner-only row;
// merlins-agent (his master agent inside the engine) stays unhomed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GOD_MENUS, AGENT_ENGINE_MENU, godMenuFor } from '../lib/god-menus.js';

const registryText = readFileSync('lib/i18n/satellites.ts', 'utf8');
const registry = [...registryText.matchAll(/\{ key: "([^"]+)", route: "([^"]+)", pos: "([^"]+)", section: "([^"]+)", constellation: "([^"]+)" \}/g)]
  .map((m) => ({ key: m[1], route: m[2], pos: m[3], section: m[4], constellation: m[5] }));
const page = readFileSync('app/page.jsx', 'utf8');
const menu = readFileSync('components/SatelliteMenu.jsx', 'utf8');
const search = readFileSync('lib/menu-search.js', 'utf8');

test('registry: agent-engine is ATHENA / AI PROGRAMS; merlins-agent is its ?agent=merlin view', () => {
  const engine = registry.find((e) => e.key === 'agent-engine');
  assert.equal(engine.route, '/agent-engine');
  assert.equal(engine.pos, 'ATHENA');
  assert.equal(engine.section, 'AI PROGRAMS');
  const merlin = registry.find((e) => e.key === 'merlins-agent');
  assert.equal(merlin.route, '/agent-engine?agent=merlin');
});

test('agent-engine has one home: ATHENA, beside agent-forge', () => {
  assert.equal(AGENT_ENGINE_MENU.route, '/agent-engine');
  assert.equal(AGENT_ENGINE_MENU.pos, 'ATHENA');
  assert.equal(AGENT_ENGINE_MENU.title, 'Agent Engine');
  assert.equal(godMenuFor('agent-engine')?.god, 'ATHENA');
  const athena = GOD_MENUS.find((m) => m.god === 'ATHENA');
  assert.ok(athena.satellites.includes('agent-engine'));
  assert.ok(athena.satellites.includes('agent-forge'));
  assert.ok(athena.satellites.length <= 24, 'menu size still sane');
});

test('merlins-agent stays out of every menu', () => {
  assert.equal(godMenuFor('merlins-agent'), null);
});

test('row is owner-only: non-owners never get the entry in satIndex', () => {
  assert.match(page, /if \(!isOwner\) map\.delete\(AGENT_ENGINE_MENU\.key\);/);
});

test('menu row and search wear the shared display copy', () => {
  assert.match(menu, /AGENT_ENGINE_MENU/);
  assert.match(search, /AGENT_ENGINE_MENU/);
});
