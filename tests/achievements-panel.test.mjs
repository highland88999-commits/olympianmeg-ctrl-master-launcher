// tests/achievements-panel.test.mjs
// Notifications panel ACHIEVEMENTS wiring (2026-10-26): the panel shows
// the viewer's OWN earned achievements from the central record (GET
// /api/achievements), newest first, each linked to the program where it
// was earned (or the /achievements ledger when the program has no route).
// Nothing here is hardcoded panel copy — these are the mapping rules the
// panel renders from live API rows.
//
// Run: node --test tests/achievements-panel.test.mjs   (from the repo root)

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { ACHIEVEMENTS } from '../lib/achievements/catalog.js';
import {
  GAME_TITLES,
  MILESTONE_TITLES,
  achievementLinkForKey,
  panelAchievements,
} from '../lib/achievements/panel.js';

const ME = 'user-me-1234';
const OTHER = 'user-other-5678';

function ach(key, title, user, awardedAt, description) {
  return {
    user_id: user,
    key,
    title,
    metadata: description ? { description } : {},
    awarded_at: awardedAt,
  };
}

describe('panelAchievements: viewer-only, newest first', () => {
  it('drops other accounts and signed-out viewers see nothing', () => {
    const mine = ach('chess-first-blood', 'First Blood', ME, '2026-10-20T10:00:00Z', 'Won chess.');
    const theirs = ach('enyo-first-frag', 'First Frag', OTHER, '2026-10-26T10:00:00Z', 'Frag.');
    const rows = panelAchievements({ achievements: [mine, theirs], myUserId: ME });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].key, 'chess-first-blood');
    assert.equal(panelAchievements({ achievements: [mine, theirs], myUserId: null }).length, 0);
    assert.equal(panelAchievements({ achievements: [mine, theirs] }).length, 0);
  });

  it('sorts milestones and achievements together, newest first', () => {
    const rows = panelAchievements({
      milestones: [
        { user_id: ME, milestone: 'first', kill_number: 1, awarded_at: '2026-10-25T09:00:00Z' },
      ],
      achievements: [
        ach('redwater-core-diver', 'Core Diver', ME, '2026-10-24T09:00:00Z', 'Core.'),
        ach('chess-first-blood', 'First Blood', ME, '2026-10-26T09:00:00Z', 'Chess.'),
      ],
      myUserId: ME,
    });
    assert.deepEqual(
      rows.map((r) => r.key),
      ['chess-first-blood', 'vecna-first', 'redwater-core-diver'],
    );
  });

  it('maps Vecna milestones to Hawkins titles and links', () => {
    const rows = panelAchievements({
      milestones: [
        { user_id: ME, milestone: '100th', kill_number: 100, awarded_at: '2026-10-25T09:00:00Z' },
      ],
      myUserId: ME,
    });
    assert.equal(rows[0].title, MILESTONE_TITLES['100th']);
    assert.equal(rows[0].href, '/hawkins');
    assert.equal(rows[0].where, 'Hawkins: Hunt For Vecna');
    assert.equal(rows[0].description, 'Vecna #100 sealed');
  });

  it('passes descriptions through and tolerates missing metadata', () => {
    const rows = panelAchievements({
      achievements: [ach('enyo-first-frag', 'First Frag', ME, '2026-10-26T09:00:00Z')],
      myUserId: ME,
    });
    assert.equal(rows[0].description, '');
    assert.equal(rows[0].where, 'Enyo');
    assert.equal(rows[0].href, '/enyo');
  });
});

describe('achievementLinkForKey: every earned achievement links somewhere real', () => {
  it('links game achievements to their program route with the game title', () => {
    assert.deepEqual(achievementLinkForKey('chess-first-blood'), {
      href: '/chess',
      where: 'Quantum Chess',
    });
    assert.deepEqual(achievementLinkForKey('basketball-first-bucket'), {
      href: '/basketball',
      where: 'Streetball',
    });
    assert.deepEqual(achievementLinkForKey('hawkins-first-clue'), {
      href: '/hawkins',
      where: 'Hawkins: Hunt For Vecna',
    });
  });

  it('links non-game achievements to their programs', () => {
    assert.deepEqual(achievementLinkForKey('calendar-first-entry'), {
      href: '/calendar',
      where: 'Calendar',
    });
    assert.deepEqual(achievementLinkForKey('calculator-first-use'), {
      href: '/calculator',
      where: 'Calculator',
    });
    assert.deepEqual(achievementLinkForKey('cloud-phone-pioneer'), {
      href: '/cloud-phone',
      where: 'Cloud Phone',
    });
    assert.deepEqual(achievementLinkForKey('olympian-scholar'), {
      href: '/education',
      where: 'Olympian Education',
    });
  });

  it('links Redwater to the ledger (no Redwater route exists) and never dead-links unknowns', () => {
    assert.deepEqual(achievementLinkForKey('redwater-core-diver'), {
      href: '/achievements',
      where: 'Redwater',
    });
    assert.deepEqual(achievementLinkForKey('no-such-key'), {
      href: '/achievements',
      where: 'Olympus',
    });
  });

  it('every catalog key resolves to a non-empty link and where', () => {
    for (const key of Object.keys(ACHIEVEMENTS)) {
      const link = achievementLinkForKey(key);
      assert.ok(link.href.startsWith('/'), `${key} href`);
      assert.ok(link.where.length > 0, `${key} where`);
    }
  });

  it('every game slug in the catalog has a display title', () => {
    const games = new Set(
      Object.values(ACHIEVEMENTS).map((d) => d.game).filter(Boolean),
    );
    assert.equal(games.size, 26);
    for (const game of games) {
      assert.ok(GAME_TITLES[game], `missing title for ${game}`);
    }
  });
});
