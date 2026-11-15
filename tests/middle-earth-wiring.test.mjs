// tests/middle-earth-wiring.test.mjs
// MIDDLE-EARTH — OPERATOR WIRING (Nov 14): placedCreatureExtras
// live in the zone beside the firsts (BUILD 1), with the life
// line on the figure tag's second line (BUILD 2); orcs / Saruman
// report theirs on the strike toast in page.jsx — the pure
// helpers are tested here, no DOM. Tap is still strike.
//
// Run: node --test tests/middle-earth-wiring.test.mjs (repo root)

// --- fake canvas: every 2d-context method is a no-op (same stub
// as app/middle-earth/tests/builders.test.mjs) --------------------
const fakeCtx = new Proxy(
  {
    canvas: null,
    createLinearGradient: () => ({ addColorStop: () => {} }),
    createRadialGradient: () => ({ addColorStop: () => {} }),
    createPattern: () => ({}),
    getImageData: () => ({ data: [] }),
    measureText: () => ({ width: 100 }),
  },
  {
    get(target, prop) {
      if (prop in target) return target[prop];
      return () => {};
    },
    set(target, prop, value) {
      target[prop] = value;
      return true;
    },
  }
);
const fakeCanvas = {
  width: 0,
  height: 0,
  getContext: () => fakeCtx,
  style: {},
  addEventListener: () => {},
  removeEventListener: () => {},
};
globalThis.document = {
  createElement: (tag) => (tag === 'canvas' ? fakeCanvas : { style: {} }),
};
globalThis.window = globalThis;

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const THREE = await import('three');
const T = await import('../app/middle-earth/textures.js');
const { buildZone } = await import('../app/middle-earth/zone.js');
const DATA = await import('../app/middle-earth/data.js');
const { buildFigure } = await import('../app/middle-earth/characters.js');
const { PLAYABLE } = await import('../app/middle-earth/characters.js');
const { createOrc, damageOrc } = await import('../app/middle-earth/orcs.js');
const { createSaruman, stepBoss, damageBoss, BOSS_POS } = await import('../app/middle-earth/boss.js');
const OP = await import('../app/middle-earth/operators.js');

const T0 = Date.UTC(2026, 10, 14, 12, 0, 0);

describe('BUILD 1 — placed extras live in the zone', () => {
  it('every pod: first + second copy in characters, ≥ 100 m apart', () => {
    for (const id of DATA.POD_ORDER) {
      const z = buildZone(THREE, DATA.PODS[id], T, { freeRoam: true });
      try {
        for (const first of OP.placedCreatures(id)) {
          const a = z.characters.find((c) => c.id === first.id);
          const b = z.characters.find((c) => c.id === `${first.id}-second`);
          assert.ok(a, `${id}/${first.id} first present`);
          assert.ok(b, `${id}/${first.id}-second present`);
          assert.equal(b.operatorExtra, true, `${id}/${first.id}-second flagged`);
          assert.equal(b.name, a.name, `${id}/${first.id} same name`);
          const d = Math.hypot(b.x - a.x, b.z - a.z);
          assert.ok(d >= 100, `${id}/${first.id} spread ${d.toFixed(1)} m`);
        }
      } finally {
        z.dispose();
      }
    }
  });

  it('extras are figures in the scene, not just list entries', () => {
    const z = buildZone(THREE, DATA.PODS.rivendell, T, { freeRoam: true });
    try {
      let found = 0;
      z.group.traverse((o) => { if (o.name === 'figure:eagle-second') found += 1; });
      assert.equal(found, 1, 'eagle-second figure in the scene');
    } finally {
      z.dispose();
    }
  });

  it('twin rule holds: extras never duplicate a hero seat', () => {
    // Extras are creatures only (placedCreatureExtras filters
    // creature:true), so no extra id can ever be a hero seat —
    // checked live, with a hero player in the pod, for every pod.
    // (A hero-model NPC seat is legitimate when the player is NOT
    // that hero — only the player's own seat stands empty.)
    const heroKeys = Object.keys(PLAYABLE);
    for (const id of DATA.POD_ORDER) {
      const creatureIds = OP.placedCreatures(id).map((c) => c.id);
      const plain = buildZone(THREE, DATA.PODS[id], T, { freeRoam: true });
      const asHero = buildZone(THREE, DATA.PODS[id], T, { freeRoam: true, playerKey: 'wizard' });
      try {
        const extrasPlain = plain.characters.filter((c) => c.operatorExtra);
        const extrasHero = asHero.characters.filter((c) => c.operatorExtra);
        assert.equal(extrasPlain.length, OP.placedCreatures(id).length, `${id} extras count`);
        assert.deepEqual(
          extrasHero.map((c) => c.id).sort(),
          extrasPlain.map((c) => c.id).sort(),
          `${id} extras identical with a hero player`,
        );
        for (const c of [...plain.characters, ...asHero.characters]) {
          if (!c.operatorExtra) continue;
          const base = c.id.replace(/-second$/, '');
          assert.ok(creatureIds.includes(base), `${id} extra ${c.id} is a creature copy`);
          assert.ok(!heroKeys.includes(base), `${id} extra ${c.id} is not a hero`);
        }
        assert.ok(!asHero.characters.find((c) => c.id === 'wizard'), `${id} wizard seat empty for a wizard player`);
        assert.ok(!asHero.characters.find((c) => c.id === 'wizard-second'), 'no wizard-second anywhere');
      } finally {
        plain.dispose();
        asHero.dispose();
      }
    }
  });

  it('Saruman is not doubled and orcs are untouched by the extras', () => {
    const z = buildZone(THREE, DATA.PODS.rohan, T, { freeRoam: true, gateOpen: true });
    try {
      assert.equal(z.hunt.boss.state, 'ready', 'one Saruman, ready');
      assert.ok(!z.characters.find((c) => /saruman/i.test(c.id)), 'no Saruman in characters');
      assert.ok(z.hunt.records.length >= 10, 'orc field untouched');
    } finally {
      z.dispose();
    }
  });
});

describe('BUILD 2 — life lines (pure helpers the page toasts / tags)', () => {
  it('a creature figure with a lifeLine wears a two-line tag; without, one line', () => {
    const ground = () => 0;
    const line = OP.placedCreatureLifeFor({ name: 'A Great Eagle' }).line;
    const withLine = buildFigure(THREE, {
      id: 'eagle', model: 'eagle', name: 'A Great Eagle', at: [0, 0],
      height: 2.6, creature: true, lifeLine: line,
    }, ground);
    const plain = buildFigure(THREE, {
      id: 'ranger', model: 'ranger', name: 'A Ranger of the North',
      at: [0, 0], height: 1.85,
    }, ground);
    try {
      const tagOf = (fig) => {
        let s = null;
        fig.group.traverse((o) => { if (o.isSprite) s = o; });
        return s;
      };
      assert.ok(tagOf(withLine), 'two-line tag exists');
      assert.equal(tagOf(withLine).scale.y, 0.625, 'two-line tag is taller');
      assert.equal(tagOf(plain).scale.y, 0.375, 'single-line tag unchanged');
    } finally {
      withLine.dispose();
      plain.dispose();
    }
  });

  it('orc: live line names patrol/hunt; dead line is Remains with the respawn clock', () => {
    const orc = createOrc({ id: 1, x: 10, z: 20, kind: 'warrior', campId: 0, rove: false }, 0);
    assert.match(OP.orcLifeFor(orc, T0).line, /Orc Warrior · Patrolling/);
    const loot = damageOrc(orc, 999, () => 0.5);
    assert.ok(Array.isArray(loot), 'killing blow returns loot');
    assert.equal(orc.state, 'dead');
    // deadAt is the zone clock (seconds) the page reads off the
    // hunt record after markDead — the line only needs it non-null.
    assert.equal(
      OP.orcLifeFor(orc, T0, { deadAt: 12.5, respawnS: 45 }).line,
      'Remains — Orc Warrior — returns on the respawn clock',
    );
  });

  it('placed creature: ambient line, never a hunt or a death', () => {
    assert.equal(
      OP.placedCreatureLifeFor({ name: 'A Great Eagle' }).line,
      'A Great Eagle · Ambient · no hunt, no death in code',
    );
  });

  it('boss: dormant names the gate, combat names phase + HP, dead is Remains', () => {
    const dormant = createSaruman(BOSS_POS.x, BOSS_POS.z, false);
    assert.equal(
      OP.bossLifeFor(dormant, T0, { totalKills: 0 }).line,
      'Saruman · Dormant · gate opens at 30 orc kills',
    );
    const boss = createSaruman(BOSS_POS.x, BOSS_POS.z, true);
    stepBoss(boss, 0.016, { x: BOSS_POS.x, z: BOSS_POS.z, alive: true, quiet: 1 });
    assert.equal(boss.state, 'combat', 'woken by approach');
    assert.equal(
      OP.bossLifeFor(boss, T0, { totalKills: 30 }).line,
      'Saruman · Combat · phase 1 · 600/600 HP',
    );
    const events = damageBoss(boss, 9999);
    assert.ok(events.some((e) => e.type === 'died'));
    assert.equal(
      OP.bossLifeFor(boss, T0, { totalKills: 30 }).line,
      'Remains — Saruman — the campaign is complete',
    );
  });
});
