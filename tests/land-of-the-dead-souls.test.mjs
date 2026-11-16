// tests/land-of-the-dead-souls.test.mjs — Land of the Dead souls
// (Merlin, Nov 16 ~04:02, worker D).
// Run: node --test tests/land-of-the-dead-souls.test.mjs

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import {
  DEATH_KINDS,
  SOUL_KIND_STYLE,
  createWanderingSoul,
  isWellFormedSoul,
  seedSouls,
  recordSoulArrival,
  readSoulArrivals,
  soulPlacement,
  WanderingSoulField,
} from '../lib/land-of-the-dead/souls.js';

function collectText(node, out = []) {
  if (node == null) return out;
  if (typeof node === 'string' || typeof node === 'number') { out.push(String(node)); return out; }
  if (Array.isArray(node)) { for (const c of node) collectText(c, out); return out; }
  if (typeof node === 'object') {
    if (node.props && node.props.children !== undefined) collectText(node.props.children, out);
  }
  return out;
}

describe('createWanderingSoul maps each death kind', () => {
  for (const kind of DEATH_KINDS) {
    it(`kind '${kind}' gets its own label, colour and garment`, () => {
      const soul = createWanderingSoul({ kind, name: 'Test', origin: 'hollow-earth', diedAt: 1700000000000 });
      assert.equal(soul.kind, kind);
      assert.equal(soul.label, SOUL_KIND_STYLE[kind].label);
      assert.equal(soul.color, SOUL_KIND_STYLE[kind].color);
      assert.equal(soul.opacity, SOUL_KIND_STYLE[kind].opacity);
      assert.equal(soul.garment, SOUL_KIND_STYLE[kind].garment);
      assert.equal(soul.state, 'wandering');
    });
  }

  it('kinds have distinct colours (the field can tell them apart)', () => {
    const colours = new Set(DEATH_KINDS.map((k) => SOUL_KIND_STYLE[k].color));
    assert.ok(colours.size >= 4, `expected >= 4 distinct colours, got ${colours.size}`);
  });

  it('an unknown kind keeps its kind and falls back to the creature style, never throws', () => {
    const soul = createWanderingSoul({ kind: 'wraith', name: 'W', origin: 'x', diedAt: 1700000000000 });
    assert.equal(soul.kind, 'wraith');
    assert.equal(soul.color, SOUL_KIND_STYLE.creature.color);
    assert.equal(soul.label, SOUL_KIND_STYLE.creature.label);
  });

  it('a missing name falls back per kind', () => {
    assert.equal(createWanderingSoul({ kind: 'monster', origin: 'x', diedAt: 1 }).name, 'Fallen monster');
    assert.equal(createWanderingSoul({ kind: 'user', origin: 'x', diedAt: 1 }).name, 'A fallen traveller');
    assert.equal(createWanderingSoul({ kind: 'demogorgon', origin: 'x', diedAt: 1 }).name, 'Demogorgon');
    assert.equal(createWanderingSoul({ kind: 'boss', origin: 'x', diedAt: 1 }).name, 'A fallen boss');
  });

  it('a missing record / missing diedAt never throws and still yields a soul', () => {
    const a = createWanderingSoul(null);
    assert.ok(isWellFormedSoul(a));
    const b = createWanderingSoul({ kind: 'monster', name: 'M', origin: 'x' });
    assert.ok(Number.isFinite(b.diedAt) && b.diedAt > 0);
    assert.ok(b.diedAt <= Date.now());
  });
});

describe('arrivals carry origin + diedAt', () => {
  it('createWanderingSoul keeps the death record provenance', () => {
    const soul = createWanderingSoul({ kind: 'monster', name: 'Stormwing', origin: 'jupiter-2', diedAt: 1700000000000 });
    assert.equal(soul.origin, 'jupiter-2');
    assert.equal(soul.diedAt, 1700000000000);
    assert.equal(soul.name, 'Stormwing');
    assert.ok(soul.id.includes('jupiter-2'));
    assert.ok(soul.id.includes('1700000000000'));
  });

  it('recordSoulArrival returns the soul with origin + diedAt (node: no localStorage, no throw)', () => {
    const soul = recordSoulArrival({ kind: 'user', origin: 'hawkins', diedAt: 1700000001000 });
    assert.equal(soul.origin, 'hawkins');
    assert.equal(soul.diedAt, 1700000001000);
    assert.ok(isWellFormedSoul(soul));
    assert.deepEqual(readSoulArrivals(), []);
  });

  it('two arrivals of the same kind from different origins stay distinct', () => {
    const a = createWanderingSoul({ kind: 'monster', name: 'Volta', origin: 'hollow-earth', diedAt: 1700000002000 });
    const b = createWanderingSoul({ kind: 'monster', name: 'Volta', origin: 'jupiter-2', diedAt: 1700000002000 });
    assert.notEqual(a.id, b.id);
  });
});

describe('seedSouls returns well-formed records', () => {
  it('twelve souls, all well-formed, unique ids, died in the past', () => {
    const seeds = seedSouls();
    assert.equal(seeds.length, 12);
    for (const s of seeds) assert.ok(isWellFormedSoul(s), `malformed seed: ${JSON.stringify(s)}`);
    assert.equal(new Set(seeds.map((s) => s.id)).size, 12);
    for (const s of seeds) {
      assert.ok(s.diedAt <= Date.now());
      assert.ok(s.diedAt > Date.now() - 90 * 24 * 60 * 60 * 1000, 'seed died within the 90-day nether sojourn');
    }
  });

  it('the seed spans the wired origins and kinds', () => {
    const seeds = seedSouls();
    const origins = new Set(seeds.map((s) => s.origin));
    for (const o of ['hollow-earth', 'jupiter-2', 'hawkins']) assert.ok(origins.has(o), `seed missing origin ${o}`);
    const kinds = new Set(seeds.map((s) => s.kind));
    for (const k of ['monster', 'user', 'creature']) assert.ok(kinds.has(k), `seed missing kind ${k}`);
  });

  it('seedSouls is a fresh array each call (callers may mutate their copy)', () => {
    const a = seedSouls();
    const b = seedSouls();
    assert.notEqual(a, b);
    assert.notEqual(a[0], b[0]);
    // Same souls, modulo the 1 ms of wall clock between the calls
    // (diedAt/arrivedAt/id all derive from Date.now()).
    const strip = (s) => s.map(({ id, diedAt, arrivedAt, ...rest }) => rest);
    assert.deepEqual(strip(a), strip(b));
  });
});

describe('soulPlacement is deterministic', () => {
  it('same soul, same placement; placement stays inside the field', () => {
    const soul = createWanderingSoul({ kind: 'monster', name: 'M', origin: 'x', diedAt: 1700000000000 });
    const p1 = soulPlacement(soul, 0);
    const p2 = soulPlacement(soul, 0);
    assert.deepEqual(p1, p2);
    assert.ok(p1.x >= 6 && p1.x <= 94);
    assert.ok(p1.y >= 12 && p1.y <= 88);
    assert.ok(p1.scale >= 0.7 && p1.scale <= 1.3);
  });
});

describe('WanderingSoulField renders the field from a souls array', () => {
  it('renders every soul name and its origin', () => {
    const souls = seedSouls().slice(0, 3);
    const html = renderToStaticMarkup(React.createElement(WanderingSoulField, { souls }));
    for (const s of souls) {
      assert.ok(html.includes(s.name), `field html missing ${s.name}`);
      assert.ok(html.includes(s.origin), `field html missing origin ${s.origin}`);
    }
    assert.ok(html.includes('data-soul-count="3"'));
  });

  it('renders a translucent cone + head per soul (polygon + circle each)', () => {
    const souls = seedSouls().slice(0, 4);
    const html = renderToStaticMarkup(React.createElement(WanderingSoulField, { souls }));
    assert.equal((html.match(/<polygon/g) || []).length, 4);
    assert.equal((html.match(/<circle/g) || []).length, 4);
    assert.ok(html.includes('lotd-drift'));
  });

  it('an empty field states honestly instead of rendering nothing', () => {
    const el = WanderingSoulField({ souls: [] });
    const text = collectText(el).join(' ');
    assert.ok(text.includes('No souls wander here yet.'));
    const html = renderToStaticMarkup(React.createElement(WanderingSoulField, { souls: [] }));
    assert.ok(html.includes('data-soul-count="0"'));
    assert.ok(!html.includes('<svg'));
  });

  it('a non-array souls prop renders the empty state, never throws', () => {
    const html = renderToStaticMarkup(React.createElement(WanderingSoulField, { souls: null }));
    assert.ok(html.includes('No souls wander here yet.'));
  });
});
