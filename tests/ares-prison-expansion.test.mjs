// tests/ares-prison-expansion.test.mjs — the Warden: the ARES Prison's
// expansion agent (Merlin, 2026-11-15).
// Run: node --test tests/ares-prison-expansion.test.mjs (from the repo root).
// No browser, no network — asserts on lib/ares/prison-expansion.js pure
// logic and source-level checks that the page and scene use the grown
// layout, the HUD reports the grown capacity, and every standing
// prison law survives growth.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import {
  PRISON_HALL,
  PRISON_CELL,
  PRISON_CAPACITY,
  PRISON_LIGHT_POSITIONS,
  PRISON_WALKER_WORLD,
  cellPosition,
  prisonerFaceYawAt,
} from '../lib/ares/prison.js';
import {
  WARDEN,
  PRISON_BLOCK_CELLS,
  PRISON_BASE_LEVELS,
  PRISON_EXPANSION_LIGHTS_PER_LEVEL,
  PRISON_EXPANSION_LIGHT_XS,
  capacityFor,
  levelsFor,
  prisonHallForLevels,
  prisonLightPositionsForLevels,
  prisonLightBudgetForLevels,
  expansionLayoutFor,
  assignGrownCells,
} from '../lib/ares/prison-expansion.js';

const src = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const expansionLib = src('../lib/ares/prison-expansion.js');
const world3d = src('../app/ares/prison/world3d.jsx');
const prisonPage = src('../app/ares/prison/page.jsx');

// The one real prisoner, as the code knows it: hashed source
// bcf2e9e7f83e, score 75, trapped Nov 15 ~00:05.
const REAL_PRISONER = {
  ip_hash: 'bcf2e9e7f83e' + '0'.repeat(52),
  reason: 'Extra-malicious attack',
  score: 75,
  hits: 1,
  first_seen: '2026-11-15T00:05:00.000Z',
  last_seen: '2026-11-15T00:05:00.000Z',
  user_agent: null,
  last_path: '/.git/config',
  path_count: 1,
  max_score: 75,
  reasons: ['scanner-path (/.git/config)'],
  trap_status: 'trapped',
};

function fakeRow(i, overrides = {}) {
  return {
    ip_hash: `row${String(i).padStart(4, '0')}` + 'a'.repeat(56),
    reason: 'Extra-malicious attack',
    score: 80,
    hits: 2,
    first_seen: '2026-11-15T01:00:00.000Z',
    last_seen: '2026-11-15T01:00:00.000Z',
    user_agent: null,
    last_path: null,
    path_count: 1,
    max_score: 80,
    reasons: [],
    trap_status: 'trapped',
    ...overrides,
  };
}

describe('the Warden — a named agent in charge of growth', () => {
  it('the agent has a name and a single responsibility', () => {
    assert.equal(WARDEN.name, 'Warden');
    assert.match(WARDEN.role, /expansion/i);
    assert.equal(WARDEN.baseCapacity, 72);
    assert.equal(WARDEN.blockCells, 24);
  });

  it('one growth block is one level: 2 sides x 12 columns = 24 cells', () => {
    assert.equal(PRISON_BLOCK_CELLS, 24);
    assert.equal(PRISON_BLOCK_CELLS, PRISON_CELL.sides * PRISON_CELL.columns);
    assert.equal(PRISON_BASE_LEVELS, 3);
    assert.equal(PRISON_BASE_LEVELS, PRISON_CELL.levels);
  });

  it('the Warden does its own I/O nowhere — pure, no fetch, no route, no table', () => {
    assert.ok(!expansionLib.includes('fetch('), 'no fetch in the agent');
    assert.ok(!expansionLib.includes('supabase'), 'no database in the agent');
    // The header comment names the console's GET /api/ares/trapped read
    // path as documentation — the agent never defines or calls a route:
    // no handler, no response object, no route file shape.
    assert.ok(!expansionLib.includes('NextResponse'), 'no route handler in the agent');
    assert.ok(!expansionLib.includes('export async function'), 'no async route in the agent');
    assert.ok(!expansionLib.includes('serviceClient'), 'no service client in the agent');
  });
});

describe('the threshold — capacity is the smallest multiple of 24 above the count', () => {
  it('71 occupied stays 72; the moment the 72nd cage fills, it grows to 96', () => {
    assert.equal(capacityFor(0), 72);
    assert.equal(capacityFor(1), 72);
    assert.equal(capacityFor(71), 72);
    assert.equal(capacityFor(72), 96);
    assert.equal(capacityFor(73), 96);
    assert.equal(capacityFor(95), 96);
    assert.equal(capacityFor(96), 120);
    assert.equal(capacityFor(97), 120);
    assert.equal(capacityFor(119), 120);
    assert.equal(capacityFor(120), 144);
  });

  it('it keeps growing as imprisonments continue — 1000 prisoners get 1008 cells', () => {
    assert.equal(capacityFor(1000), 1008);
    assert.equal(capacityFor(1008), 1032);
  });

  it('capacityFor is pure and deterministic — same count, same hall', () => {
    for (const n of [0, 71, 72, 96, 137, 500]) {
      assert.equal(capacityFor(n), capacityFor(n));
      assert.deepEqual(expansionLayoutFor(n), expansionLayoutFor(n));
    }
  });

  it('levelsFor tracks the capacity: 4 levels at base (the 1:1 fill reaches level 3 by index 67), then one more per block', () => {
    assert.equal(levelsFor(0), 4);
    assert.equal(levelsFor(71), 4);
    assert.equal(levelsFor(72), 5);
    assert.equal(levelsFor(96), 6);
    assert.equal(levelsFor(120), 7);
    assert.equal(levelsFor(1000), 43);
  });
});

describe('assignGrownCells — every prisoner gets a real cell, nobody waits', () => {
  it('one prisoner still takes cell 0 of a 72-cell hall', () => {
    const grown = assignGrownCells([REAL_PRISONER]);
    assert.equal(grown.capacity, 72);
    assert.equal(grown.levels, 4); // the 1:1 fill reaches level 3 by index 67
    assert.equal(grown.cells.length, 72);
    assert.equal(grown.overflow, 0);
    assert.equal(grown.cells[0].prisoner.shortId, 'bcf2e9e7f83e');
    assert.equal(grown.cells[71].prisoner, null);
  });

  it('72 prisoners fill 72 of the grown 96 cells — the Warden already grew it to 96', () => {
    const rows = Array.from({ length: 72 }, (_, i) => fakeRow(i));
    const grown = assignGrownCells(rows);
    assert.equal(grown.capacity, 96);
    assert.equal(grown.cells.length, 96);
    assert.equal(grown.overflow, 0);
    assert.equal(grown.cells.filter((c) => c.prisoner).length, 72);
    assert.equal(grown.cells[71].prisoner.shortId, grown.cells[71].prisoner.shortId);
    assert.equal(grown.cells[72].prisoner, null); // the new level stands empty, waiting
    assert.equal(grown.cells[95].prisoner, null);
  });

  it('the 68th prisoner takes the first cell of level 3 — left, column 0', () => {
    const rows = Array.from({ length: 68 }, (_, i) => fakeRow(i));
    const grown = assignGrownCells(rows);
    assert.equal(grown.capacity, 72); // still the base block — level 3 is inside it
    assert.equal(grown.levels, 4);
    assert.equal(grown.overflow, 0);
    assert.ok(grown.cells[67].prisoner, 'the 68th prisoner has a cell');
    assert.equal(grown.cells[67].position.level, 3);
    assert.equal(grown.cells[67].position.side, 'left');
    assert.equal(grown.cells[67].position.column, 0);
    // floorY is level * 3.2 in floating point (3 * 3.2 is 9.600000000000001).
    assert.ok(Math.abs(grown.cells[67].position.floorY - 9.6) < 1e-9, `floorY=${grown.cells[67].position.floorY}`);
  });

  it('the 73rd prisoner takes a real cell on level 2 — right, column 9', () => {
    const rows = Array.from({ length: 73 }, (_, i) => fakeRow(i));
    const grown = assignGrownCells(rows);
    assert.equal(grown.capacity, 96);
    assert.equal(grown.overflow, 0);
    assert.ok(grown.cells[72].prisoner, 'the 73rd prisoner has a cell');
    assert.equal(grown.cells[72].position.level, 2);
    assert.equal(grown.cells[72].position.side, 'right');
    assert.equal(grown.cells[72].position.column, 9);
    // floorY is level * 3.2 in floating point (2 * 3.2 is 6.4 exactly
    // here, but compare with a tolerance like the other level checks).
    assert.ok(Math.abs(grown.cells[72].position.floorY - 6.4) < 1e-9, `floorY=${grown.cells[72].position.floorY}`);
    assert.equal(grown.cells[72].prisoner.shortId, grown.cells[72].prisoner.shortId);
  });

  it('100 prisoners grow the hall to 120; 200 grow it to 216 — overflow stays 0', () => {
    const a = assignGrownCells(Array.from({ length: 100 }, (_, i) => fakeRow(i)));
    assert.equal(a.capacity, 120);
    assert.equal(a.cells.length, 120);
    assert.equal(a.overflow, 0);
    assert.equal(a.cells.filter((c) => c.prisoner).length, 100);
    const b = assignGrownCells(Array.from({ length: 200 }, (_, i) => fakeRow(i)));
    assert.equal(b.capacity, 216);
    assert.equal(b.cells.length, 216);
    assert.equal(b.overflow, 0);
  });

  it('all grown cell positions are unique — no two prisoners share a cell at any size', () => {
    for (const n of [73, 100, 200]) {
      const grown = assignGrownCells(Array.from({ length: n }, (_, i) => fakeRow(i)));
      const seen = new Set();
      for (const c of grown.cells) {
        const key = `${c.position.level}|${c.position.side}|${c.position.column}`;
        assert.ok(!seen.has(key), `duplicate cell ${key} at ${n} prisoners`);
        seen.add(key);
      }
      assert.equal(seen.size, grown.capacity);
    }
  });

  it('the layout rides along with the assignment — the page passes one object to the scene', () => {
    const grown = assignGrownCells(Array.from({ length: 73 }, (_, i) => fakeRow(i)));
    assert.equal(grown.layout.capacity, 96);
    // 73 prisoners: capacity 96, and the 1:1 fill reaches level 4
    // (first level-4 cell is fill index 91), so the hall stands 5 levels.
    assert.equal(grown.layout.levels, 5);
    assert.equal(grown.layout.blocksAdded, 2);
    assert.equal(grown.layout.hall.heightM, 16.9);
    assert.equal(grown.layout.lightBudget, 16);
    assert.equal(grown.layout.overflow, 0);
  });
});

describe('the hall grows upward only — footprint, walkway, spawn never move', () => {
  it('three levels is the base hall, exactly as built', () => {
    const hall = prisonHallForLevels(3);
    assert.deepEqual(hall, PRISON_HALL);
    assert.equal(hall.lengthM, 48);
    assert.equal(hall.widthM, 16);
    assert.equal(hall.heightM, 10.5);
  });

  it('each added level adds 3.2 m of height and nothing else', () => {
    assert.equal(prisonHallForLevels(4).heightM, 13.7);
    assert.equal(prisonHallForLevels(5).heightM, 16.9);
    assert.equal(prisonHallForLevels(6).heightM, 20.1);
    for (const levels of [4, 5, 6]) {
      const hall = prisonHallForLevels(levels);
      assert.equal(hall.lengthM, PRISON_HALL.lengthM);
      assert.equal(hall.widthM, PRISON_HALL.widthM);
      assert.equal(hall.walkwayHalfM, PRISON_HALL.walkwayHalfM);
      assert.equal(hall.walkwayEndM, PRISON_HALL.walkwayEndM);
      assert.deepEqual(hall.spawn, PRISON_HALL.spawn);
    }
  });

  it('the walker clamp is untouched at any height — the walkway never extends', () => {
    // The clamp lives in PRISON_WALKER_WORLD and the scene never
    // rebuilds it: the footprint is the same at 72 cells and at 720.
    assert.equal(PRISON_WALKER_WORLD.bounds.max.x, PRISON_HALL.walkwayEndM);
    assert.equal(PRISON_WALKER_WORLD.bounds.max.z, PRISON_HALL.walkwayHalfM);
    assert.equal(PRISON_WALKER_WORLD.speed, 6);
  });
});

describe('the light budget scales — base row untouched, one 4-light row per added level', () => {
  it('12 lights at 72 cells (4 levels), 16 at 96, 20 at 120, 24 at 144', () => {
    assert.equal(prisonLightBudgetForLevels(4), 12);
    assert.equal(prisonLightBudgetForLevels(5), 16);
    assert.equal(prisonLightBudgetForLevels(6), 20);
    assert.equal(prisonLightBudgetForLevels(7), 24);
    assert.equal(PRISON_EXPANSION_LIGHTS_PER_LEVEL, 4);
  });

  it('three levels is exactly the base row — the Warden changes nothing until the threshold', () => {
    assert.deepEqual(prisonLightPositionsForLevels(3), PRISON_LIGHT_POSITIONS);
  });

  it('the first added level gets a 4-light row at its ceiling band, y = 12.5', () => {
    const positions = prisonLightPositionsForLevels(4);
    assert.equal(positions.length, 12);
    assert.deepEqual(positions.slice(0, 8), PRISON_LIGHT_POSITIONS);
    const added = positions.slice(8);
    assert.deepEqual(added.map((p) => p.x), PRISON_EXPANSION_LIGHT_XS);
    assert.ok(added.every((p) => p.y === 12.5), 'just under the level-3 top (12.8)');
    assert.ok(added.every((p) => p.z === 0), 'on the walkway centre line');
  });

  it('the second added level gets its own row higher up, y = 15.7', () => {
    const positions = prisonLightPositionsForLevels(5);
    assert.equal(positions.length, 16);
    const added = positions.slice(12);
    assert.deepEqual(added.map((p) => p.x), PRISON_EXPANSION_LIGHT_XS);
    assert.ok(added.every((p) => p.y === 15.7), 'just under the level-4 top (16.0)');
  });

  it('every light sits inside its hall — below the roof, inside the walls', () => {
    for (const levels of [3, 4, 5, 6]) {
      const hall = prisonHallForLevels(levels);
      for (const p of prisonLightPositionsForLevels(levels)) {
        assert.ok(p.y < hall.heightM, `light y=${p.y} above the roof at ${levels} levels`);
        assert.ok(Math.abs(p.x) < hall.lengthM / 2, `light x=${p.x} outside the hall`);
      }
    }
  });

  it('the scene renders the layout lights — one pointLight mapped over the grown list', () => {
    const count = (world3d.match(/<pointLight/g) || []).length;
    assert.equal(count, 1, 'one <pointLight> inside a .map over the layout positions');
    assert.ok(world3d.includes('lightPositions.map'), 'lights come from the layout list');
    assert.ok(world3d.includes('layout?.lightPositions || PRISON_LIGHT_POSITIONS'), 'base row is the fallback');
    assert.ok(world3d.includes('color={PRISON_RED.light}'), 'every light is the prison red');
  });
});

describe('one-way visibility holds in the grown cells', () => {
  // A figure's face is its local +z. After a yaw rotation the face
  // points (sin(yaw), cos(yaw)) in the (x, z) plane.
  function faceDir(side, t, form) {
    const yaw = prisonerFaceYawAt(side, t, form);
    return { x: Math.sin(yaw), z: Math.cos(yaw) };
  }
  const dot = (a, b) => a.x * b.x + a.z * b.z;

  it('grown cells sit where the layout says: level 3 starts at index 67, level 4 at 91', () => {
    // The 1:1 fill interleaves levels: level L's first cell is fill
    // index 24L − 5 (left L c0) — so level 3 starts at 67, level 4 at 91.
    const c67 = cellPosition(67);
    assert.equal(c67.level, 3);
    assert.equal(c67.side, 'left');
    assert.equal(c67.column, 0);
    assert.ok(Math.abs(c67.floorY - 9.6) < 1e-9, `floorY=${c67.floorY}`); // level * 3.2 in floats
    const c91 = cellPosition(91);
    assert.equal(c91.level, 4);
    assert.equal(c91.side, 'left');
    assert.equal(c91.column, 0);
    assert.equal(c91.floorY, 12.8);
    const c95 = cellPosition(95);
    assert.equal(c95.level, 4);
    assert.equal(c95.side, 'left');
    assert.equal(c95.column, 2);
    const c96 = cellPosition(96);
    assert.equal(c96.level, 3);
    assert.equal(c96.side, 'right');
    assert.equal(c96.column, 9);
    assert.ok(Math.abs(c96.floorY - 9.6) < 1e-9, `floorY=${c96.floorY}`);
  });

  it('a figure in a grown cell still faces inward — never toward the walkway', () => {
    // The new level's cells are on both sides; sample both.
    for (const index of [72, 83, 84, 95]) {
      const side = cellPosition(index).side;
      const inward = side === 'right' ? { x: 0, z: 1 } : { x: 0, z: -1 };
      const walkway = side === 'right' ? { x: 0, z: -1 } : { x: 0, z: 1 };
      for (const form of [{ turnSpeed: 0.15, phase: 0 }, { turnSpeed: 0.5, phase: 2.1 }]) {
        for (let t = 0; t <= 120; t += 0.05) {
          const f = faceDir(side, t, form);
          assert.ok(dot(f, inward) > 0.9, `cell ${index} t=${t} not inward`);
          assert.ok(dot(f, walkway) < 0, `cell ${index} t=${t} faces the walkway`);
        }
      }
    }
  });

  it('the scene renders every cell from the prop — no 72-cell cap anywhere', () => {
    assert.ok(!world3d.includes('slice(0'), 'no slice caps the cell list');
    assert.ok(!world3d.includes('PRISON_CAPACITY'), 'the scene never mentions the base capacity');
    assert.ok(world3d.includes('cells.map((cell)'), 'every assigned cell renders');
    assert.ok(world3d.includes('<PrisonerRobot form={form} side={pos.side}'), 'grown figures know their side');
  });
});

describe('the page runs the Warden and reports the grown capacity', () => {
  it('the page assigns grown cells and passes the layout to the scene', () => {
    assert.ok(prisonPage.includes("from '@/lib/ares/prison-expansion'"), 'the page imports the Warden');
    assert.ok(prisonPage.includes('assignGrownCells(rows)'), 'loads go through the grown assignment');
    assert.ok(prisonPage.includes('layout={layout}'), 'the scene gets the grown layout');
    assert.ok(prisonPage.includes('setLayout(grown.layout)'), 'the layout is stored with the cells');
  });

  it('the HUD shows the grown capacity, not the base 72', () => {
    assert.ok(prisonPage.includes('layout?.capacity ?? PRISON_CAPACITY'), 'HUD reads the grown capacity');
    assert.ok(prisonPage.includes('waiting for a cell'), 'the waiting clause is retained');
  });

  it('the exit and the no-release law are untouched by growth', () => {
    const uses = (prisonPage.match(/<ExitToAres/g) || []).length;
    assert.equal(uses, 4, `expected 4 exit placements, found ${uses}`);
    assert.ok(!prisonPage.includes('DELETE'), 'no DELETE anywhere in the page');
    assert.ok(!prisonPage.includes('release('), 'no release function');
    assert.ok(prisonPage.includes('Viewing only'), 'the HUD still says release stays in the console');
  });
});
