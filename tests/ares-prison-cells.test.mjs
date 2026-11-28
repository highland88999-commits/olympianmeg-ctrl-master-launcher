// tests/ares-prison-cells.test.mjs — the ARES Prison cells redesign
// (Merlin, Nov 27, 2026): TRON Ares red cells; each occupied cell's
// screen plays one of the 3 cell videos (one load each, many instances,
// alternating, back-to-back loop); prisoners are CGI reflective hovering
// robots; sound is one stream only, with a mute orb; the world is
// ever-expanding with in-range showing; new prisoners alternate sides
// 1:1 after the first six; a walk-through door goes back to the hub.
// Run: node --test tests/ares-prison-cells.test.mjs (from the repo root).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, statSync, readFileSync } from 'fs';
import {
  PRISON_RED,
  PRISON_CELL,
  PRISON_HALL,
  PRISON_IN_RANGE_M,
  cellPosition,
  cellInDistanceRange,
  cellHasScreen,
  prisonHubDoorFor,
  walkerInDoorTrigger,
} from '../lib/ares/prison.js';
import { capacityFor, levelsFor } from '../lib/ares/prison-expansion.js';
import {
  PRISON_CELL_VIDEOS,
  PRISON_SCREEN_W,
  PRISON_SCREEN_H,
  cellVideoIndex,
  nextVideoIndex,
  audioVideoIndex,
  videoContainFit,
  createCellVideoPool,
} from '../lib/ares/prison-video.js';

const src = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const world3d = src('../app/ares/prison/world3d.jsx');
const prisonPage = src('../app/ares/prison/page.jsx');

// --- fakes: a video element + a texture, enough for the pool -----------
function fakeVideo(src) {
  const listeners = new Map();
  const v = {
    src,
    muted: true,
    loop: false,
    playsInline: false,
    preload: '',
    paused: true,
    currentTime: 0,
    videoWidth: src.includes('marvel') ? 720 : 1280,
    videoHeight: src.includes('marvel') ? 1280 : 720,
    playCalls: 0,
    pauseCalls: 0,
    play() { this.paused = false; this.playCalls += 1; return Promise.resolve(); },
    pause() { this.paused = true; this.pauseCalls += 1; },
    addEventListener(type, fn) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(fn);
    },
    removeEventListener() {},
    fire(type) { for (const fn of listeners.get(type) || []) fn(); },
  };
  return v;
}
function fakeTexture(video) {
  const repeat = { x: 1, y: 1, set(rx, ry) { this.x = rx; this.y = ry; } };
  const offset = { x: 0, y: 0, set(ox, oy) { this.x = ox; this.y = oy; } };
  return { video, repeat, offset };
}
function makePool() {
  let created = 0;
  const pool = createCellVideoPool({
    createVideo: (src) => { created += 1; return fakeVideo(src); },
    createTexture: (video) => fakeTexture(video),
  });
  return { pool, created: () => created };
}
function fakeMaterial() {
  return { map: null, needsUpdate: false };
}

describe('TRON Ares red (Merlin, Nov 27)', () => {
  it('the prison red is the film red — blood-red neon, not the old blue', () => {
    assert.equal(PRISON_RED.light, 0xFF2D20);
    assert.equal(PRISON_RED.flame, '#FF3524');
    assert.equal(PRISON_RED.core, '#FFE0DB');
    assert.equal(PRISON_RED.deep, '#2E0A07');
  });
  it('the scene and the page are red, with no blue left', () => {
    assert.ok(world3d.includes('PRISON_RED'), 'scene reads the prison red');
    assert.ok(!world3d.includes('PRISON_BLUE'), 'no blue constant in the scene');
    assert.ok(!/sky-|blue-600|#6fb1ff|#d6e9ff|#0a1a33|#8fb4e8/.test(prisonPage), 'no blue in the page');
    assert.ok(world3d.includes('color={PRISON_RED.light}'), 'lights are the prison red');
  });
});

describe('the 3 cell videos are on disk', () => {
  it('all three ship in public/videos/ares-prison/', () => {
    for (const v of PRISON_CELL_VIDEOS) {
      const url = new URL(`../public${v.src}`, import.meta.url);
      assert.ok(existsSync(url), `missing ${v.src}`);
      assert.ok(statSync(url).size > 1_000_000, `${v.src} is suspiciously small`);
    }
  });
  it('the list is exactly the 3 Merlin sent: earth, sky, marvel-christmas', () => {
    assert.equal(PRISON_CELL_VIDEOS.length, 3);
    assert.deepEqual(
      PRISON_CELL_VIDEOS.map((v) => v.src),
      [
        '/videos/ares-prison/volcanic-storm-earth.mp4',
        '/videos/ares-prison/volcanic-storm-sky.mp4',
        '/videos/ares-prison/marvel-christmas.mp4',
      ],
    );
    assert.equal(PRISON_CELL_VIDEOS[0].durationS, 10);
    assert.equal(PRISON_CELL_VIDEOS[1].durationS, 10);
    assert.ok(Math.abs(PRISON_CELL_VIDEOS[2].durationS - 25.33) < 0.01);
    assert.equal(audioVideoIndex(), 2, 'only the marvel cut carries audio');
  });
});

describe('alternation + back-to-back loop', () => {
  it('cell i starts at video (i % 3) — neighbours show different videos', () => {
    assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 7].map(cellVideoIndex), [0, 1, 2, 0, 1, 2, 0, 1]);
  });
  it('the loop cycles 0 → 1 → 2 → 0, forever', () => {
    assert.equal(nextVideoIndex(0), 1);
    assert.equal(nextVideoIndex(1), 2);
    assert.equal(nextVideoIndex(2), 0);
  });
  it('a 9:16 video on the 16:9 screen gets pillarbox bars, never a stretch', () => {
    const square = videoContainFit(PRISON_SCREEN_W, PRISON_SCREEN_H, 1280, 720);
    // 16:9 on 16:9 fills the screen — up to a 1-ulp float wobble
    // (1280/720 vs 2.2/1.2375 differ in the last bit).
    assert.ok(Math.abs(square.repeat[0] - 1) < 1e-9, `repeat.x=${square.repeat[0]}`);
    assert.ok(Math.abs(square.repeat[1] - 1) < 1e-9, `repeat.y=${square.repeat[1]}`);
    assert.ok(Math.abs(square.offset[0]) < 1e-9 && Math.abs(square.offset[1]) < 1e-9);
    const tall = videoContainFit(PRISON_SCREEN_W, PRISON_SCREEN_H, 720, 1280);
    assert.ok(Math.abs(tall.repeat[0] - 0.316) < 0.01, `repeat.x=${tall.repeat[0]}`);
    assert.equal(tall.repeat[1], 1);
    assert.ok(Math.abs(tall.offset[0] - 0.342) < 0.01, `offset.x=${tall.offset[0]}`);
    assert.equal(tall.offset[1], 0);
  });
});

describe('one load, multiple instances', () => {
  it('72 screens share exactly 3 video elements and 3 textures', () => {
    const { pool, created } = makePool();
    assert.equal(pool.videoCount, 3);
    assert.equal(created(), 3, 'one element per video, created once');
    const mats = [];
    for (let i = 0; i < 72; i += 1) {
      const mat = fakeMaterial();
      const start = pool.registerScreen(i, mat);
      assert.equal(start, i % 3, `cell ${i} starts at video ${i % 3}`);
      mats.push(mat);
    }
    assert.equal(pool.screenCount, 72);
    assert.equal(created(), 3, 'registering screens creates no new loads');
    for (let i = 0; i < 72; i += 1) {
      assert.ok(pool.textures.includes(mats[i].map), `cell ${i} shares a pool texture`);
      assert.equal(pool.screenVideoIndex(i), i % 3);
    }
    pool.dispose();
  });
  it("a video's 'ended' advances only its screens and rewinds it", () => {
    const { pool } = makePool();
    for (let i = 0; i < 6; i += 1) pool.registerScreen(i, fakeMaterial());
    // Video 0 ends: screens 0 and 3 advance to 1; video 0 rewinds.
    pool.videos[0].currentTime = 10;
    pool.fireEnded(0);
    assert.equal(pool.videos[0].currentTime, 0, 'ended video rewinds to 0');
    assert.equal(pool.screenVideoIndex(0), 1);
    assert.equal(pool.screenVideoIndex(3), 1);
    assert.equal(pool.screenVideoIndex(1), 1, 'screens on video 1 stay put');
    assert.equal(pool.screenVideoIndex(2), 2);
    // The loop keeps going: 1 → 2, 2 → 0.
    pool.fireEnded(1);
    assert.equal(pool.screenVideoIndex(0), 2);
    assert.equal(pool.screenVideoIndex(1), 2);
    pool.fireEnded(2);
    assert.equal(pool.screenVideoIndex(0), 0, 'back to the start, looping');
    assert.equal(pool.screenVideoIndex(2), 0);
    pool.dispose();
  });
  it('the real ended listener drives the same advance', () => {
    const { pool } = makePool();
    pool.registerScreen(0, fakeMaterial());
    pool.videos[0].fire('ended');
    assert.equal(pool.screenVideoIndex(0), 1);
    pool.dispose();
  });
  it('the 9:16 texture is pillarboxed on loadedmetadata', () => {
    const { pool } = makePool();
    pool.videos.forEach((v) => v.fire('loadedmetadata'));
    const tex = pool.textures[2];
    assert.ok(Math.abs(tex.repeat.x - 0.316) < 0.01, `marvel repeat.x=${tex.repeat.x}`);
    assert.equal(tex.repeat.y, 1);
    // The 16:9 videos fill the screen up to a 1-ulp float wobble
    // (1280/720 vs 2.2/1.2375 differ in the last bit, so the fit lands
    // on either side of the branch — repeat 0.9999999999999999 either way).
    assert.ok(Math.abs(pool.textures[0].repeat.x - 1) < 1e-9, `16:9 repeat.x=${pool.textures[0].repeat.x}`);
    assert.ok(Math.abs(pool.textures[0].repeat.y - 1) < 1e-9, `16:9 repeat.y=${pool.textures[0].repeat.y}`);
    pool.dispose();
  });
});

describe('in-range playback gate (the billboard rule)', () => {
  it('a video plays only while a visible screen shows it; pause keeps its time', () => {
    const { pool } = makePool();
    for (let i = 0; i < 6; i += 1) pool.registerScreen(i, fakeMaterial());
    pool.refreshPlayback(new Set([0]));
    assert.equal(pool.videos[0].paused, false, 'video 0 plays — cell 0 is in view');
    assert.equal(pool.videos[1].paused, true);
    assert.equal(pool.videos[2].paused, true);
    pool.videos[0].currentTime = 5;
    pool.refreshPlayback(new Set([1]));
    assert.equal(pool.videos[0].paused, true, 'video 0 pauses when no screen shows it');
    assert.equal(pool.videos[0].currentTime, 5, 'pause keeps currentTime — resume, never restart');
    assert.equal(pool.videos[1].paused, false);
    pool.refreshPlayback(new Set());
    assert.ok(pool.videos.every((v) => v.paused), 'nothing in view, nothing plays');
    pool.dispose();
  });
  it('the distance half: within 12 m is in range, beyond is not', () => {
    const cell = { x: 0, z: -5.2, floorY: 0 };
    assert.equal(cellInDistanceRange(cell, { x: 0, y: 2.4, z: 0 }), true);
    assert.equal(cellInDistanceRange(cell, { x: 12, y: 2.4, z: 0 }), false);
    const high = { x: 0, z: -5.2, floorY: 32 }; // a far-future level
    assert.equal(cellInDistanceRange(high, { x: 0, y: 2.4, z: 0 }), false);
    assert.equal(PRISON_IN_RANGE_M, 12);
  });
});

describe('sound — one source, the mute orb', () => {
  it('only the audio video may ever sound, and only once unlocked and unmuted', () => {
    const { pool } = makePool();
    // Before any gesture: everything muted, even with sound ON.
    assert.equal(pool.videos[2].muted, true, 'starts muted — iOS needs a gesture');
    pool.setMuted(false);
    assert.equal(pool.videos[2].muted, true, 'still muted until the first tap');
    pool.unlockAudio();
    assert.equal(pool.videos[2].muted, false, 'default is sound ON after the first tap');
    assert.equal(pool.videos[0].muted, true, 'the silent videos never sound');
    assert.equal(pool.videos[1].muted, true);
    pool.setMuted(true);
    assert.equal(pool.videos[2].muted, true, 'mute silences the one stream');
    assert.equal(pool.muted, true);
    pool.setMuted(false);
    assert.equal(pool.videos[2].muted, false, 'unmute brings it back');
    pool.dispose();
  });
  it('the page wires the mute orb: a plain circle, default sound ON', () => {
    assert.ok(prisonPage.includes("const [muted, setMuted] = useState(false)"), 'default sound ON');
    assert.ok(prisonPage.includes("aria-label={muted ? 'Unmute prison sound' : 'Mute prison sound'}"), 'mute orb labelled');
    assert.ok(prisonPage.includes('🔇') && prisonPage.includes('🔊'), 'muted vs sounding is obvious');
    assert.ok(prisonPage.includes('rounded-full'), 'the orb is a plain circle');
    assert.ok(prisonPage.includes('muted={muted}'), 'the orb drives the scene');
  });
});

describe('only occupied cells get the character and the screen', () => {
  it('cellHasScreen is true only for occupied cells', () => {
    assert.equal(cellHasScreen({ prisoner: { kind: 'wisp' } }), true);
    assert.equal(cellHasScreen({ prisoner: null }), false);
    assert.equal(cellHasScreen(null), false);
  });
  it('the scene renders the robot and the screen only when a prisoner is there', () => {
    assert.ok(world3d.includes('{form && ('), 'occupied-only gates exist');
    assert.ok(world3d.includes('<PrisonerRobot'), 'the robot renders for occupied cells');
    assert.ok(world3d.includes('<CellScreen'), 'the screen renders for occupied cells');
    const cellBlock = world3d.slice(world3d.indexOf('function PrisonCell'), world3d.indexOf('// --- the whole hall'));
    assert.ok(cellBlock.indexOf('{form && (') < cellBlock.indexOf('<PrisonerRobot'), 'the robot sits inside the occupied gate');
    assert.ok(cellBlock.indexOf('{form && (') < cellBlock.indexOf('<CellScreen'), 'the screen sits inside the occupied gate');
  });
});

describe('the robot (CGI, reflective, hovering)', () => {
  it('the scene builds one robot, not six scanner bodies', () => {
    assert.ok(world3d.includes('function PrisonerRobot'), 'one robot component');
    assert.ok(!world3d.includes('function FigureBody'), 'the six scanner bodies are gone');
    assert.ok(!world3d.includes("form.kind === 'snooper'"), 'no kind branches in the scene');
    assert.ok(world3d.includes('PRISON_ROBOT_HOVER_M'), 'the robot hovers above the floor');
    assert.ok(world3d.includes('torusGeometry'), 'a hover ring under the body');
    assert.ok(world3d.includes('capsuleGeometry'), 'a capsule body');
    assert.ok(world3d.includes('envMap'), 'reflective metal via an env map');
    assert.ok(world3d.includes('prisonerFaceYawAt(side, t, form)'), 'still faces INTO the cell');
  });
});

describe('ever-expanding growth (no cap)', () => {
  it('capacity is unbounded: the smallest multiple of 24 above the count', () => {
    assert.equal(capacityFor(71), 72);
    assert.equal(capacityFor(72), 96);
    assert.equal(capacityFor(10000), 10008);
    // The 1:1 fill reaches level 3 by index 67, so the hall stands
    // 4 storeys at base (72 cells), 5 at 96, 418 at 10008.
    assert.equal(levelsFor(0), 4);
    assert.equal(levelsFor(71), 4);
    assert.equal(levelsFor(72), 5);
    assert.equal(levelsFor(10000), 418);
    assert.equal(capacityFor(1000000), 1000008, 'a million prisoners still grows');
  });
});

describe('fill order — first six, then alternate 1:1 (Merlin, Nov 27)', () => {
  it('prisoners 1–6 fill the left side, level 0, columns 0–5', () => {
    for (let i = 0; i < 6; i += 1) {
      const c = cellPosition(i);
      assert.equal(c.side, 'left', `cell ${i}`);
      assert.equal(c.level, 0, `cell ${i}`);
      assert.equal(c.column, i, `cell ${i}`);
    }
  });
  it('after the first six, every new prisoner alternates sides one by one', () => {
    const expected = [
      // [index, side, level, column]
      [6, 'right', 0, 0], [7, 'left', 0, 6], [8, 'right', 0, 1], [9, 'left', 0, 7],
      [10, 'right', 0, 2], [11, 'left', 0, 8], [12, 'right', 0, 3], [13, 'left', 0, 9],
      [14, 'right', 0, 4], [15, 'left', 0, 10], [16, 'right', 0, 5], [17, 'left', 0, 11],
      [18, 'right', 0, 6], [19, 'left', 1, 0], [20, 'right', 0, 7], [21, 'left', 1, 1],
      [22, 'right', 0, 8], [23, 'left', 1, 2], [24, 'right', 0, 9], [25, 'left', 1, 3],
      [26, 'right', 0, 10], [27, 'left', 1, 4], [28, 'right', 0, 11], [29, 'left', 1, 5],
      [30, 'right', 1, 0], [31, 'left', 1, 6],
    ];
    for (const [i, side, level, column] of expected) {
      const c = cellPosition(i);
      assert.equal(c.side, side, `cell ${i} side`);
      assert.equal(c.level, level, `cell ${i} level`);
      assert.equal(c.column, column, `cell ${i} column`);
    }
  });
  it('the first 72 fill positions span levels 0–3, no duplicates', () => {
    // The 1:1 fill order interleaves levels: level 3's first cell is
    // fill index 67 (left L3 c0), so the first 72 positions reach
    // level 3 — the hall stands 4 storeys (see levelsFor). The 72
    // positions are still unique: 24 + 24 + 21 + 3 = 72.
    const seen = new Set();
    let maxLevel = -1;
    let level3 = 0;
    for (let i = 0; i < 72; i += 1) {
      const c = cellPosition(i);
      const key = `${c.level}|${c.side}|${c.column}`;
      assert.ok(!seen.has(key), `duplicate ${key}`);
      seen.add(key);
      maxLevel = Math.max(maxLevel, c.level);
      if (c.level === 3) level3 += 1;
    }
    assert.equal(seen.size, 72);
    assert.equal(maxLevel, 3);
    assert.equal(level3, 3); // fill indices 67, 69, 71
  });
});

describe('the walk-through door back to the hub', () => {
  it('the door stands in the entrance end wall, behind the spawn', () => {
    const door = prisonHubDoorFor(PRISON_HALL);
    assert.equal(door.x, -24);
    assert.equal(door.z, 0);
    assert.equal(door.label, 'HUB →');
    assert.equal(door.triggerX, -22.8, 'inside the |x| ≤ 23 walker clamp');
  });
  it('the trigger fires only inside the doorway', () => {
    assert.equal(walkerInDoorTrigger({ x: -23, z: 0 }), true);
    assert.equal(walkerInDoorTrigger({ x: -21, z: 0 }), false, 'spawn is not the trigger');
    assert.equal(walkerInDoorTrigger({ x: -23, z: 2 }), false, 'too far sideways');
    assert.equal(walkerInDoorTrigger(null), false);
  });
  it('the scene renders the door and navigates home through it', () => {
    assert.ok(world3d.includes('prisonHubDoorFor'), 'door spec comes from the lib');
    assert.ok(world3d.includes('{door.label}'), 'the door is labelled HUB →');
    assert.ok(world3d.includes('walkerInDoorTrigger'), 'the trigger is the lib rule');
    assert.ok(world3d.includes('onExitToHub'), 'the door calls back to the page');
    assert.ok(prisonPage.includes('handleExitToHub'), 'the page owns the navigation');
    assert.ok(prisonPage.includes("router.push('/')"), 'the door goes to the hub');
    assert.ok(prisonPage.includes('← Exit to ARES'), 'the button exit stays intact');
  });
});

describe('in-range showing is wired (the billboard gate, reused)', () => {
  it('the scene culls by frustum + distance and gates playback on it', () => {
    assert.ok(world3d.includes('PrisonRangeGate'), 'a range gate runs every frame');
    assert.ok(world3d.includes('intersectsSphere'), 'the frustum test, as GodTower does it');
    assert.ok(world3d.includes('cellInDistanceRange'), 'the distance cap, as the lib defines it');
    assert.ok(world3d.includes('group.visible = inRange'), 'out-of-range cells are hidden');
    assert.ok(world3d.includes('pool.refreshPlayback(visibleScreens)'), 'video plays only for visible screens');
    assert.ok(world3d.includes('PRISON_IN_RANGE_M') || world3d.includes('cellInDistanceRange'), 'the range constant is the lib one');
  });
});
