// tests/achievements-wiring.test.mjs
// Achievements wiring (Merlin, 2026-11-18 — "Fix it all"): every game page
// that CAN grant its achievements calls grantAchievement() on the win/result
// event and mounts the AchievementBanner. The Notifications panel already
// worked (it reads GET /api/achievements?mine=1); the break was that the
// 78 game achievements were never granted — grantAchievement() had zero
// imports anywhere.
//
// This test pins the wiring statically: for each game it asserts the page
// source (a) imports grantAchievement from '@/lib/achievements/award',
// (b) mounts <AchievementBanner, and (c) calls award('<key>') for every
// key the game can honestly grant. It also pins the DELIBERATELY UNWIRED
// keys — achievements whose trigger describes a mechanic the game does not
// have — by asserting no page awards them, so a future well-meaning wire
// of a dishonest grant fails loudly instead of shipping silently.
//
// Wired: 63 of 78 game keys. Unwired (15), each with its reason:
//   air-hockey-table-king — the page has no PvP path at all (opponent is
//     always the AI); granting it for an AI win would be dishonest.
//   arachnid-weaver-dawn-bringer — endless survival until death; there is
//     no night duration and no dawn.
//   astra-iron-hull — no patrol-completion event exists; runs end on death.
//   dk-hero-siege-breaker — levels advance forever; there is no final level.
//   guillotine-dead-center / guillotine-master-executioner — the machine
//     has no aim or accuracy at all; the blade just drops onto the log.
//   hawkins-party-up — the hunt is single-player only; no multiplayer/co-op.
//   hive-perfect-harmony — no puzzle and no optimal-moves concept; the hive
//     is a free-form pulse toy with a meter.
//   ice-monster-first-blood — a trust game, not a boss fight; no damage
//     mechanic exists.
//   omega-pinball-multiball-master — no multiball mechanic in the physics.
//   omega-pinball-grand-champion — the game posts no scores and has no
//     leaderboard.
//   rogers-arena-first-show / rogers-arena-hat-trick /
//     rogers-arena-game-night-mvp — no playable game exists: arena viewer
//     + Live scoreboard tab + Tickets tab. No goals, no concert
//     completion, no win.
//   zeus-protocol-god-of-thunder — no difficulty selection, no campaign
//     end; levels advance endlessly.
//
// Also pinned: neon-racer-star-surfer IS wired but UNEARNABLE as shipped
// (shards spawn one per 2.2–3.8 s over a 90 s mission, max ~41 of the 100
// needed) — wired anyway, flagged; do NOT change spawn rates here.
// And Vecna: the Hawkins page already records kills server-side
// (onFatality → POST /api/hawkins/vecna-kill → record_vecna_kill RPC);
// milestoneForKillNumber() is redundant with the DB function, left alone.
//
// Run: node tests/achievements-wiring.test.mjs (from the repo root).

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ACHIEVEMENTS, CLIENT_GRANTABLE } from '../lib/achievements/catalog.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// Game slug -> page file (relative to repo root). chess/battleship/luge
// are .tsx; the rest are .jsx.
const GAME_PAGES = {
  chess: 'app/chess/page.tsx',
  basketball: 'app/basketball/page.jsx',
  colosseum: 'app/colosseum/page.jsx',
  battleship: 'app/battleship/page.tsx',
  luge: 'app/luge/page.tsx',
  'raptor-rush': 'app/raptor-rush/page.jsx',
  'shadow-realm': 'app/shadow-realm/page.jsx',
  'air-hockey': 'app/air-hockey/page.jsx',
  kombat: 'app/kombat/page.jsx',
  enyo: 'app/enyo/page.jsx',
  'omega-pinball': 'app/omega-pinball/page.jsx',
  starblood: 'app/starblood/page.jsx',
  astra: 'app/astra/page.jsx',
  'zeus-protocol': 'app/zeus-protocol/page.jsx',
  'neon-racer': 'app/neon-racer/page.jsx',
  excalibur: 'app/excalibur/page.jsx',
  'zeus-v-hades': 'app/zeus-v-hades/page.jsx',
  guillotine: 'app/guillotine/page.jsx',
  'arachnid-weaver': 'app/arachnid-weaver/page.jsx',
  hawkins: 'app/hawkins/page.jsx',
  'dk-hero': 'app/dk-hero/page.jsx',
  'ice-dragon': 'app/ice-dragon/page.jsx',
  'ice-monster': 'app/ice-monster/page.jsx',
  'rogers-arena': 'app/rogers-arena/page.jsx',
  hive: 'app/hive/page.jsx',
  'orbital-ascent': 'app/orbital-ascent/page.jsx',
};

// Game slug -> keys this game honestly grants (suffixes; full key is
// `<game>-<suffix>`). Empty array = deliberately unwired, see header.
const WIRED_KEYS = {
  chess: ['first-blood', 'tactician', 'sector-champion'],
  basketball: ['first-bucket', 'sharpshooter', 'court-king'],
  colosseum: ['first-victory', 'undefeated', 'arena-champion'],
  battleship: ['first-sinking', 'fleet-destroyer', 'admiral'],
  luge: ['first-run', 'ice-bullet', 'pack-leader'],
  'raptor-rush': ['first-feast', 'apex-predator', 'alpha'],
  'shadow-realm': ['first-ride', 'neon-survivor', 'grid-lord'],
  'air-hockey': ['first-goal', 'shutout'],
  kombat: ['first-ko', 'finish-him', 'flawless-victory'],
  enyo: ['first-frag', 'rampage', 'untouchable'],
  'omega-pinball': ['silver-ball'],
  starblood: ['first-pair', 'clear-board', 'perfect-recall'],
  astra: ['first-kill', 'ace'],
  'zeus-protocol': ['first-strike', 'wave-breaker'],
  'neon-racer': ['first-flight', 'wormrider', 'star-surfer'],
  excalibur: ['worthy', 'stone-shaker', 'high-king'],
  'zeus-v-hades': ['first-soul', 'soul-surge', 'godslayer'],
  guillotine: ['first-drop'],
  'arachnid-weaver': ['first-night', 'web-dodger'],
  hawkins: ['first-clue', 'gatekeeper'],
  'dk-hero': ['top-of-the-tower', 'barrel-dodger'],
  'ice-dragon': ['first-wake', 'sky-rider', 'glacier-king'],
  'ice-monster': ['monster-slayer', 'flawless-hunt'],
  'rogers-arena': [],
  hive: ['first-pulse', 'hive-mind'],
  'orbital-ascent': ['first-boost', 'high-flyer', 'summit'],
};

// Keys that must NEVER be granted from a page (see header for why each).
const UNWIRED_KEYS = [
  'air-hockey-table-king',
  'arachnid-weaver-dawn-bringer',
  'astra-iron-hull',
  'dk-hero-siege-breaker',
  'guillotine-dead-center',
  'guillotine-master-executioner',
  'hawkins-party-up',
  'hive-perfect-harmony',
  'ice-monster-first-blood',
  'omega-pinball-grand-champion',
  'omega-pinball-multiball-master',
  'rogers-arena-first-show',
  'rogers-arena-game-night-mvp',
  'rogers-arena-hat-trick',
  'zeus-protocol-god-of-thunder',
];

function pageSource(game) {
  const rel = GAME_PAGES[game];
  assert.ok(existsSync(join(ROOT, rel)), `page file missing for ${game}: ${rel}`);
  return readFileSync(join(ROOT, rel), 'utf8');
}

function awardCallPresent(src, key) {
  return (
    src.includes(`award('${key}')`) ||
    src.includes(`award("${key}")`) ||
    src.includes(`grantAchievement('${key}'`) ||
    src.includes(`grantAchievement("${key}"`)
  );
}

describe('achievements wiring: every wirable game grants on win', () => {
  it('covers all 26 games in the catalog', () => {
    const games = new Set(
      Object.values(ACHIEVEMENTS).map((d) => d.game).filter(Boolean),
    );
    assert.equal(games.size, 26);
    assert.deepEqual(Object.keys(GAME_PAGES).sort(), [...games].sort());
    assert.deepEqual(Object.keys(WIRED_KEYS).sort(), [...games].sort());
  });

  it('wires exactly 63 keys; the other 15 are the documented unwired set', () => {
    const wired = Object.entries(WIRED_KEYS).flatMap(([g, suffixes]) =>
      suffixes.map((s) => `${g}-${s}`),
    );
    assert.equal(wired.length, 63);
    assert.equal(UNWIRED_KEYS.length, 15);
    const gameKeys = Object.keys(ACHIEVEMENTS).filter((k) =>
      Object.keys(GAME_PAGES).some((g) => k.startsWith(`${g}-`)),
    );
    assert.equal(gameKeys.length, 78);
    assert.deepEqual(
      [...wired, ...UNWIRED_KEYS].sort(),
      [...gameKeys].sort(),
    );
  });

  for (const game of Object.keys(GAME_PAGES)) {
    it(`${game}: imports grant, mounts the banner, awards its keys`, () => {
      const src = pageSource(game);
      const keys = WIRED_KEYS[game];
      if (keys.length === 0) {
        // Deliberately unwired: no grant calls at all.
        assert.ok(
          !src.includes('grantAchievement'),
          `${game} must not grant anything (no playable game)`,
        );
        return;
      }
      assert.ok(
        src.includes("from '@/lib/achievements/award'") ||
          src.includes('from "@/lib/achievements/award"'),
        `${game} must import grantAchievement`,
      );
      assert.ok(
        src.includes('<AchievementBanner'),
        `${game} must mount AchievementBanner`,
      );
      for (const suffix of keys) {
        const key = `${game}-${suffix}`;
        assert.ok(awardCallPresent(src, key), `${game} must award ${key}`);
        assert.ok(ACHIEVEMENTS[key], `${key} must exist in the catalog`);
        assert.ok(
          CLIENT_GRANTABLE.includes(key),
          `${key} must be client-grantable`,
        );
      }
    });
  }

  it('no page awards any deliberately-unwired key', () => {
    const allSrc = Object.keys(GAME_PAGES)
      .map((g) => pageSource(g))
      .join('\n');
    for (const key of UNWIRED_KEYS) {
      assert.ok(
        !awardCallPresent(allSrc, key),
        `${key} must not be awarded anywhere (see header)`,
      );
    }
  });

  it('Vecna kills are recorded server-side from the Hawkins page', () => {
    const src = pageSource('hawkins');
    assert.ok(
      src.includes('/api/hawkins/vecna-kill'),
      'hawkins page must POST the Vecna kill route on fatality',
    );
    assert.ok(
      src.includes('onFatality'),
      'hawkins page must have a fatality handler',
    );
  });

  it('the grant route and award helper exist', () => {
    assert.ok(
      existsSync(join(ROOT, 'app/api/achievements/grant/route.js')),
      'grant route must exist',
    );
    assert.ok(
      existsSync(join(ROOT, 'lib/achievements/award.js')),
      'award helper must exist',
    );
    assert.ok(
      existsSync(join(ROOT, 'components/achievements/AchievementBanner.jsx')),
      'AchievementBanner must exist',
    );
  });
});
