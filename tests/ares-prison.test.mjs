// tests/ares-prison.test.mjs — the ARES Prison (Merlin, 2026-11-15).
// Run: node --test tests/ares-prison.test.mjs (from the repo root).
// No browser, no network — asserts on lib/ares/prison.js pure logic,
// the shared walker bounds, and source-level checks that the prison
// page gates like /ares, reads the console's trapped path, shows only
// truncated hashed ids, and adds NO release path.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import {
  PRISON_HALL,
  PRISON_CELL,
  PRISON_CAPACITY,
  PRISON_LIGHT_BUDGET,
  PRISON_LIGHT_POSITIONS,
  PRISON_WALK_SPEED,
  PRISON_WALKER_WORLD,
  PRISON_FACE_SWAY_RAD,
  PRISON_ONE_WAY,
  shortPrisonerId,
  fnv1a,
  classifyScanner,
  prisonerForm,
  prisonerFacingYaw,
  prisonerFaceYawAt,
  oneWayPaneYaw,
  mergePrisonerRows,
  cellPosition,
  assignCells,
} from '../lib/ares/prison.js';
import { abyssPageHtml } from '../lib/ares/tarpit.js';
import { createWalker, stepWalker } from '../lib/world/walk-controls.js';

const src = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const prisonLib = src('../lib/ares/prison.js');
const world3d = src('../app/ares/prison/world3d.jsx');
const prisonPage = src('../app/ares/prison/page.jsx');

// The one real prisoner, as the code knows it: hashed source
// bcf2e9e7f83e, score 75 (scanner UA + scanner path /.git/config),
// trapped Nov 15 ~00:05. Only facts on record are in this fixture —
// the UA itself is not recorded anywhere I can read, so it stays null.
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

describe('cell block layout — stacked and in rows', () => {
  it('capacity is 72 cells: 2 sides x 3 levels x 12 columns', () => {
    assert.equal(PRISON_CAPACITY, 72);
    assert.equal(PRISON_CELL.sides * PRISON_CELL.levels * PRISON_CELL.columns, 72);
  });

  it('cell 0 is ground level, left block, first column, by the entrance', () => {
    const c = cellPosition(0);
    assert.equal(c.level, 0);
    assert.equal(c.side, 'left');
    assert.equal(c.column, 0);
    assert.equal(c.floorY, 0);
    assert.equal(c.x, -18.7);
    assert.equal(c.z, -5.2);
  });

  it('cell 71 is the top level, right block, last column', () => {
    const c = cellPosition(71);
    assert.equal(c.level, 2);
    assert.equal(c.side, 'right');
    assert.equal(c.column, 11);
    assert.equal(c.floorY, 6.4);
    assert.equal(c.x, 18.7);
    assert.equal(c.z, 5.2);
  });

  it('all 72 cell positions are unique — no two prisoners share a cell', () => {
    const seen = new Set();
    for (let i = 0; i < PRISON_CAPACITY; i += 1) {
      const c = cellPosition(i);
      const key = `${c.level}|${c.side}|${c.column}`;
      assert.ok(!seen.has(key), `duplicate cell ${key}`);
      seen.add(key);
    }
    assert.equal(seen.size, 72);
  });

  it('the row is centred in the hall and neighbours do not overlap', () => {
    const first = cellPosition(0);
    const last = cellPosition(11);
    assert.equal(first.x, -last.x); // symmetric about the hall centre
    const pitch = PRISON_CELL.widthM + PRISON_CELL.gapM; // 3.4
    assert.equal(last.x - first.x, 11 * pitch);
    assert.ok(pitch > PRISON_CELL.widthM, 'gap between neighbours');
    // Levels stack without overlap: level floors 3.2 apart.
    assert.equal(cellPosition(24).floorY - cellPosition(0).floorY, PRISON_CELL.heightM);
    // Cells fit inside the hall walls.
    assert.ok(Math.abs(last.x) + PRISON_CELL.widthM / 2 < PRISON_HALL.lengthM / 2);
    assert.ok(Math.abs(cellPosition(0).z) + PRISON_CELL.depthM / 2 < PRISON_HALL.widthM / 2);
  });
});

describe('assignCells — prisoners take cells in order, empties stay empty', () => {
  it('the first prisoner takes cell 0; empty cells are null, never hidden', () => {
    const { cells, overflow } = assignCells([REAL_PRISONER]);
    assert.equal(cells.length, 72);
    assert.equal(overflow, 0);
    assert.equal(cells[0].prisoner.shortId, 'bcf2e9e7f83e');
    assert.equal(cells[0].position.index, 0);
    assert.equal(cells[1].prisoner, null);
    assert.equal(cells[71].prisoner, null);
  });

  it('72 prisoners fill every cell; the 73rd waits, visibly counted', () => {
    const rows = Array.from({ length: 100 }, (_, i) => fakeRow(i));
    const { cells, overflow } = assignCells(rows);
    assert.equal(cells.filter((c) => c.prisoner).length, 72);
    assert.equal(overflow, 28);
    assert.equal(cells[71].prisoner.shortId, shortPrisonerId(rows[71].ip_hash));
  });

  it('no prisoners means 72 empty, visible cells', () => {
    const { cells, overflow } = assignCells([]);
    assert.equal(cells.length, 72);
    assert.ok(cells.every((c) => c.prisoner === null));
    assert.equal(overflow, 0);
  });
});

describe('form derivation — deterministic, same prisoner same form', () => {
  it('prisonerForm is a pure function of hash + signature', () => {
    const a = prisonerForm(REAL_PRISONER);
    const b = prisonerForm(REAL_PRISONER);
    assert.deepEqual(a, b);
    assert.equal(a.seed, fnv1a(REAL_PRISONER.ip_hash));
  });

  it('different prisoners get different seeds', () => {
    const a = prisonerForm(fakeRow(1));
    const b = prisonerForm(fakeRow(2));
    assert.notEqual(a.seed, b.seed);
  });

  it('the real prisoner reads as a snooper from its /.git/config path', () => {
    const form = prisonerForm(REAL_PRISONER);
    assert.equal(form.kind, 'snooper');
    assert.equal(form.label, 'Secret hunter');
    assert.equal(form.shortId, 'bcf2e9e7f83e');
    assert.equal(form.score, 75);
    assert.equal(form.hits, 1);
    assert.ok(form.heightM >= 1.3 && form.heightM <= 1.6);
  });

  it('classification reads the UA families lib/ares/heuristics.js scores', () => {
    const cases = [
      [{ userAgent: 'sqlmap/1.7', lastPath: null, reasons: [] }, 'snooper'],
      [{ userAgent: 'masscan/1.3', lastPath: null, reasons: [] }, 'sweeper'],
      [{ userAgent: 'gobuster/3.1', lastPath: null, reasons: [] }, 'knocker'],
      [{ userAgent: 'hydra/9.0', lastPath: null, reasons: [] }, 'rammer'],
      [{ userAgent: 'curl/8.0', lastPath: null, reasons: [] }, 'script'],
      [{ userAgent: null, lastPath: '/.env', reasons: [] }, 'snooper'],
      [{ userAgent: null, lastPath: '/api/mobile/v1/auth', reasons: [] }, 'script'],
      [{ userAgent: null, lastPath: null, reasons: ['honeypot_hit'] }, 'snooper'],
      [{ userAgent: null, lastPath: null, reasons: [] }, 'wisp'],
      [{ userAgent: '', lastPath: '', reasons: [] }, 'wisp'],
    ];
    for (const [sig, kind] of cases) {
      assert.equal(classifyScanner(sig), kind, JSON.stringify(sig));
    }
  });

  it('a prisoner with no signature at all gets the given form, never dropped', () => {
    const form = prisonerForm(fakeRow(9, { user_agent: null, last_path: null, reasons: [] }));
    assert.equal(form.kind, 'wisp');
    assert.equal(form.label, 'Wisp (form given)');
    assert.ok(form.heightM > 0);
  });
});

describe('mergePrisonerRows — trapped + sources join on the hash', () => {
  it('enriches a trapped row with its source signature', () => {
    const merged = mergePrisonerRows([REAL_PRISONER], [{
      ip_hash: REAL_PRISONER.ip_hash,
      user_agent: 'masscan/1.3',
      last_path: '/.git/config',
      path_count: 4,
      max_score: 75,
      reasons: ['scanner-path (/.git/config)'],
      trap_status: 'trapped',
    }]);
    assert.equal(merged.length, 1);
    assert.equal(merged[0].user_agent, 'masscan/1.3');
    assert.equal(merged[0].last_path, '/.git/config');
    assert.equal(merged[0].score, 75);
  });

  it('a trapped row with no source row keeps nulls and still gets a form', () => {
    const merged = mergePrisonerRows([fakeRow(3)], []);
    assert.equal(merged[0].user_agent, null);
    assert.equal(classifyScanner(merged[0]), 'wisp');
  });
});

describe('privacy — only truncated hashed ids, never a raw IP or full hash', () => {
  it('shortPrisonerId shows 12 characters, the console rule', () => {
    assert.equal(shortPrisonerId(REAL_PRISONER.ip_hash), 'bcf2e9e7f83e');
    assert.equal(shortPrisonerId(REAL_PRISONER.ip_hash).length, 12);
  });

  it('the scene renders shortId only — no ip_hash, no raw IP anywhere', () => {
    assert.ok(!world3d.includes('ip_hash'), 'world3d must never touch ip_hash');
    assert.ok(world3d.includes('form.shortId'), 'labels render the short id');
    assert.ok(!prisonLib.includes('req.ip') && !prisonLib.includes('x-forwarded-for'));
  });

  it('no Mortal Kombat strings in the new files', () => {
    for (const [name, text] of [['prison.js', prisonLib], ['world3d.jsx', world3d], ['page.jsx', prisonPage]]) {
      assert.ok(!/mortal\s*kombat|sub-zero|scorpion|raiden|liu\s*kang/i.test(text), name);
    }
  });
});

describe('blue lights — the budget is 8 real lights, the rest emissive', () => {
  it('exactly 8 light positions, matching the budget constant', () => {
    assert.equal(PRISON_LIGHT_BUDGET, 8);
    assert.equal(PRISON_LIGHT_POSITIONS.length, PRISON_LIGHT_BUDGET);
  });

  it('the scene renders one pointLight element mapped over the layout positions', () => {
    const count = (world3d.match(/<pointLight/g) || []).length;
    assert.equal(count, 1, 'one <pointLight> inside a .map over the layout light positions');
    assert.ok(world3d.includes('lightPositions.map'), 'lights come from the layout list');
    assert.ok(world3d.includes('layout?.lightPositions || PRISON_LIGHT_POSITIONS'), 'the base row is the fallback before the first load');
    assert.ok(world3d.includes('color={PRISON_BLUE.light}'), 'lights are the prison blue');
  });
});

describe('walker — the shared system, clamped to the walkway', () => {
  it('walking forward down the hall stops at the end wall', () => {
    const w = createWalker({ x: PRISON_HALL.spawn.x, z: 0, yaw: PRISON_HALL.spawn.yaw });
    for (let i = 0; i < 600; i += 1) stepWalker(w, { fwd: 1 }, 0.016, PRISON_WALKER_WORLD);
    assert.ok(Math.abs(w.pos.x - PRISON_HALL.walkwayEndM) < 0.01, `x=${w.pos.x}`);
    assert.ok(Math.abs(w.pos.z) < 0.01);
  });

  it('strafing sideways stops at the cell bars — cells are unreachable', () => {
    const w = createWalker({ x: 0, z: 0, yaw: PRISON_HALL.spawn.yaw });
    for (let i = 0; i < 600; i += 1) stepWalker(w, { strafe: 1 }, 0.016, PRISON_WALKER_WORLD);
    assert.ok(Math.abs(w.pos.z - PRISON_HALL.walkwayHalfM) < 0.01, `z=${w.pos.z}`);
  });

  it('the hall pace is 6 m/s — a viewing pace, not the open-world 10', () => {
    assert.equal(PRISON_WALK_SPEED, 6);
    assert.equal(PRISON_WALKER_WORLD.speed, 6);
  });
});

describe('access — the prison gates exactly like /ares, and adds no release', () => {
  it('the page runs the keeper gate, then the pin wall, then the trapped read', () => {
    assert.ok(prisonPage.includes("fetch('/api/ares/gate'"), 'keeper gate');
    assert.ok(prisonPage.includes("fetch('/api/molly/gate'"), 'pin wall');
    assert.ok(prisonPage.includes("sessionStorage.getItem('ares-unlocked')"), 'tab-only pin state');
    assert.ok(prisonPage.includes("authedFetch('/api/ares/trapped')"), 'console read path');
    assert.ok(prisonPage.includes('authorization: `Bearer ${token}`'), 'Bearer token on the read');
    assert.ok(prisonPage.includes('setGate(\'locked\')'), 'fail closed');
  });

  it('there is NO release path in the prison — no DELETE, no release call', () => {
    assert.ok(!prisonPage.includes('DELETE'), 'no DELETE anywhere in the page');
    assert.ok(!prisonPage.includes('release('), 'no release function');
    assert.ok(!world3d.includes('DELETE') && !world3d.includes('release('));
    assert.ok(prisonPage.includes('Viewing only'), 'the HUD says release stays in the console');
  });

  it('the console links to the prison next to the trapped list', () => {
    const attackSources = src('../components/ares/AttackSources.jsx');
    assert.ok(attackSources.includes('href="/ares/prison"'), 'Walk the prison link');
    assert.ok(attackSources.includes('Viewing only'), 'the link says viewing only');
  });

  it('labels are constant screen size — no distanceFactor prop anywhere in the scene', () => {
    // Match the JSX prop (distanceFactor=), not the header comment
    // that names the lesson.
    assert.ok(!/distanceFactor\s*=/.test(world3d), 'the Medusa lesson: no 1/distance labels');
    assert.ok(world3d.includes('<Html center'), 'labels use plain Html');
  });
});

describe('one-way visibility — the keeper sees them, they never see the keeper', () => {
  // A figure's face is its local +z. After a yaw rotation the face
  // points (sin(yaw), cos(yaw)) in the (x, z) plane. For a left cell
  // the walkway is at +z and inward is -z; for a right cell it is the
  // reverse.
  function faceDir(side, t, form) {
    const yaw = prisonerFaceYawAt(side, t, form);
    return { x: Math.sin(yaw), z: Math.cos(yaw) };
  }
  function inwardDir(side) {
    return side === 'right' ? { x: 0, z: 1 } : { x: 0, z: -1 };
  }
  function walkwayDir(side) {
    return side === 'right' ? { x: 0, z: -1 } : { x: 0, z: 1 };
  }
  const dot = (a, b) => a.x * b.x + a.z * b.z;

  it('prisonerFacingYaw points into the cell: PI for left, 0 for right', () => {
    assert.equal(prisonerFacingYaw('left'), Math.PI);
    assert.equal(prisonerFacingYaw('right'), 0);
  });

  it('the face stays pointed inward for two minutes of idle, both sides', () => {
    // Turn speeds span the seeded range; phases span the circle.
    const forms = [
      { turnSpeed: 0.15, phase: 0 },
      { turnSpeed: 0.5, phase: 2.1 },
      { turnSpeed: 0.3, phase: Math.PI },
      { turnSpeed: 0.42, phase: 5.7 },
    ];
    for (const side of ['left', 'right']) {
      for (const form of forms) {
        for (let t = 0; t <= 120; t += 0.05) {
          const f = faceDir(side, t, form);
          // Mostly inward (sway is only ~20 deg off straight in).
          assert.ok(dot(f, inwardDir(side)) > 0.9, `${side} t=${t} dot=${dot(f, inwardDir(side))}`);
          // Never a component toward the walkway at all.
          assert.ok(dot(f, walkwayDir(side)) < 0, `${side} t=${t} faces the walkway`);
        }
      }
    }
  });

  it('the idle motion is a sway, not a spin — the yaw never wraps around', () => {
    const form = { turnSpeed: 0.5, phase: 1.3 };
    for (const side of ['left', 'right']) {
      let min = Infinity;
      let max = -Infinity;
      for (let t = 0; t <= 120; t += 0.05) {
        const yaw = prisonerFaceYawAt(side, t, form);
        min = Math.min(min, yaw);
        max = Math.max(max, yaw);
      }
      // Range is the sway band, twice the sway amplitude — never 2*PI.
      assert.ok(max - min <= 2 * PRISON_FACE_SWAY_RAD + 0.001, `${side} range=${max - min}`);
      assert.ok(max - min < Math.PI, `${side} turned more than half a circle`);
    }
  });

  it('the sway amplitude is small — the face can never reach the aisle', () => {
    assert.ok(PRISON_FACE_SWAY_RAD > 0 && PRISON_FACE_SWAY_RAD < Math.PI / 2);
    assert.equal(PRISON_FACE_SWAY_RAD, 0.35);
  });

  it('the scene sways the figure by the law — no spin, no look-at, no tracking', () => {
    assert.ok(world3d.includes('prisonerFaceYawAt(side, t, form)'), 'figure yaw comes from the law');
    assert.ok(!world3d.includes('form.phase + t * form.turnSpeed'), 'the old full spin is gone');
    assert.ok(!world3d.includes('lookAt'), 'no look-at toward the camera');
    // The figures themselves never read the camera: scope the check to
    // FigureBody (the camera rig legitimately sets the keeper's own
    // camera.position at line ~87 — that is the keeper, not a figure).
    const figureBody = world3d.slice(world3d.indexOf('function FigureBody'), world3d.indexOf('// --- one cell'));
    assert.ok(!figureBody.includes('camera'), 'figures never read the camera');
    assert.ok(world3d.includes('<FigureBody form={form} side={pos.side}'), 'figures know their cell side');
  });
});

describe('one-way glass — clear from the aisle, a mirror from inside', () => {
  it('the outer pane faces the walkway and the inner pane faces the cell', () => {
    assert.equal(oneWayPaneYaw('left', 'outer'), 0);
    assert.equal(oneWayPaneYaw('left', 'inner'), Math.PI);
    assert.equal(oneWayPaneYaw('right', 'outer'), Math.PI);
    assert.equal(oneWayPaneYaw('right', 'inner'), 0);
  });

  it('the glass is near-clear and the mirror is a real mirror finish', () => {
    assert.ok(PRISON_ONE_WAY.outer.opacity <= 0.1, 'keeper sees through, barely dimmed');
    assert.equal(PRISON_ONE_WAY.outer.opacity, 0.08);
    assert.ok(PRISON_ONE_WAY.inner.metalness >= 0.8, 'mirror metalness');
    assert.ok(PRISON_ONE_WAY.inner.roughness <= 0.2, 'mirror roughness');
    assert.ok(!('transparent' in PRISON_ONE_WAY.inner), 'the inner pane is opaque');
  });

  it('the scene renders both panes, FrontSide only, glass outside and mirror inside', () => {
    assert.ok(world3d.includes("oneWayPaneYaw(pos.side, 'outer')"), 'outer pane yaw from the law');
    assert.ok(world3d.includes("oneWayPaneYaw(pos.side, 'inner')"), 'inner pane yaw from the law');
    assert.ok(world3d.includes('PRISON_ONE_WAY.outer.opacity'), 'glass opacity from the spec');
    assert.ok(world3d.includes('PRISON_ONE_WAY.inner.metalness'), 'mirror finish from the spec');
    const frontSide = (world3d.match(/THREE\.FrontSide/g) || []).length;
    assert.ok(frontSide >= 2, `both panes are FrontSide only (found ${frontSide})`);
    // Exactly one transparent material in the scene: the outer glass.
    const transparent = (world3d.match(/transparent/g) || []).length;
    assert.equal(transparent, 1, 'only the outer pane is transparent');
    assert.ok(world3d.includes("import * as THREE from 'three'"), 'THREE is imported for FrontSide');
  });
});

describe('entry and exit — the portal lives in ARES, and the keeper can always leave', () => {
  it('the entry lives in the console: one link to /ares/prison, right under the trapped list', () => {
    const attackSources = src('../components/ares/AttackSources.jsx');
    const links = (attackSources.match(/href="\/ares\/prison"/g) || []).length;
    assert.equal(links, 1, 'exactly one portal into the prison');
    assert.ok(attackSources.includes('Walk the prison'), 'the link names the prison');
    // The trapped list closes before the link opens: the portal sits
    // next to the trapped list, not buried elsewhere in the console.
    assert.ok(
      attackSources.indexOf('</ul>') < attackSources.indexOf('href="/ares/prison"'),
      'the link follows the trapped list',
    );
    // No other page in the console opens the prison — the portal lives
    // in ARES and nowhere else.
    assert.ok(!attackSources.includes('href="/ares/prison/"'), 'no trailing-slash duplicate');
  });

  it('the exit is one shared button: "← Exit to ARES", back to the console', () => {
    assert.ok(prisonPage.includes('function ExitToAres()'), 'one shared exit component');
    assert.ok(prisonPage.includes('href="/ares"'), 'the exit goes to /ares');
    assert.ok(prisonPage.includes('← Exit to ARES'), 'the label says where it goes');
    // Big enough to tap on a phone: py-3 (12px) around text-sm.
    assert.ok(prisonPage.includes('px-5 py-3'), 'tap-sized, not a small text link');
  });

  it('every pre-hall state has a way out — no dead end while loading, locked, or offline', () => {
    // Each early return must carry the exit within a short window of
    // its own text: the keeper is never stuck on a bare loading screen.
    const windows = [
      ['cloud-offline', prisonPage.indexOf('Cloud features are offline')],
      ['gate-checking', prisonPage.indexOf('Approaching the prison')],
      ['pin-checking', prisonPage.indexOf('Approaching the prison', prisonPage.indexOf('Approaching the prison') + 1)],
    ];
    for (const [name, idx] of windows) {
      assert.ok(idx >= 0, `${name} screen exists`);
      const window = prisonPage.slice(idx, idx + 600);
      assert.ok(window.includes('<ExitToAres'), `${name} screen has no exit button`);
    }
    // The locked screen and the pin wall already had their own way
    // out ("Back to the console"); they still do.
    assert.ok(prisonPage.includes('Back to the console'), 'locked/pin states keep their exit');
  });

  it('the hall exit is unconditional — it renders while data loads and even if the load fails', () => {
    // Four uses of the shared exit: cloud-offline, gate-checking,
    // pin-checking, and the hall itself.
    const uses = (prisonPage.match(/<ExitToAres/g) || []).length;
    assert.equal(uses, 4, `expected 4 exit placements, found ${uses}`);
    // The hall's exit is the last one in the file, after the HUD —
    // it sits in the main return, outside any {loading && ...} or
    // {touchUI && ...} gate, so it is there during loading too.
    assert.ok(
      prisonPage.lastIndexOf('<ExitToAres') > prisonPage.lastIndexOf('Viewing only'),
      'the hall exit follows the HUD in the main return',
    );
    const hallExit = prisonPage.slice(prisonPage.lastIndexOf('<ExitToAres'));
    assert.ok(!hallExit.slice(0, 200).includes('loading'), 'the hall exit is not gated on loading');
  });
});

describe('sandbox — the maze shows the bot nothing of the keeper or the prison', () => {
  // Words that would betray observation. "ares" is NOT in the list:
  // the maze lives under /api/ares/abyss and every link carries that
  // path — it is the address the bot arrived at, not a watcher marker.
  const WATCHER_MARKERS = /\bkeeper\b|\bprison\b|\bwatcher\b|\bwatching\b|\bwatch\b|\bobserver\b|\bobserved\b|\bone-way\b|\bcell\b/i;

  it('the index and every sampled maze page carry no keeper/prison/watcher word', () => {
    const pages = ['', 'vault', 'keys', 'logs', 'mobile-api', 'archive', 'git-config', 'search?q=test', 'shard-1001'];
    for (const p of pages) {
      const html = abyssPageHtml(p);
      assert.ok(html.length > 100, `page ${p || 'index'} renders`);
      assert.ok(!WATCHER_MARKERS.test(html), `page ${p || 'index'} betrays the watcher`);
    }
  });

  it('the maze pages are still only fake rows and onward maze links', () => {
    const html = abyssPageHtml('keys');
    assert.ok(html.includes('fake'), 'still fake content');
    assert.ok(html.includes('/api/ares/abyss/'), 'links stay inside the maze');
    assert.ok(!html.includes('olympusverse.com'), 'no link to the real site');
  });
});
