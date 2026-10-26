// lib/achievements/panel.js
// Notifications-panel wiring for earned achievements.
//
// The panel's ACHIEVEMENTS section reads the SAME central record the
// achievements ledger page reads (GET /api/achievements, user_achievements
// + vecna_slayer_milestones) — nothing is hardcoded. This module is the
// pure mapping: viewer-only rows, newest first, each with the program
// where it was earned and the link tapping it follows.
//
// Link rule: the program where it was earned when that program has a
// real route, else the /achievements ledger. Redwater has no route of
// its own (the journey lives on hub Earth), so its achievement links to
// the ledger. Game display titles come from
// lib/achievements/game-achievement-manifest.json (gameTitle per game).

import { getAchievement } from './catalog.js';

// Display title per game slug (source: game-achievement-manifest.json).
export const GAME_TITLES = {
  'air-hockey': 'Air Hockey',
  'arachnid-weaver': 'Arachnid Weaver',
  astra: 'Astra',
  basketball: 'Streetball',
  battleship: 'Battleship',
  chess: 'Quantum Chess',
  colosseum: 'Colosseum',
  'dk-hero': 'DK Hero',
  enyo: 'Enyo',
  excalibur: 'Excalibur',
  guillotine: 'Guillotine',
  hawkins: 'Hawkins: Hunt For Vecna',
  hive: 'Hive',
  'ice-dragon': 'Ice Dragon',
  'ice-monster': 'Ice Monster',
  kombat: 'Kombat',
  luge: 'Luge',
  'neon-racer': 'Neon Racer',
  'omega-pinball': 'Omega Pinball',
  'orbital-ascent': 'Orbital Ascent',
  'raptor-rush': 'Raptor Rush',
  'rogers-arena': 'Rogers Arena',
  'shadow-realm': 'Shadow Realm',
  starblood: 'Starblood',
  'zeus-protocol': 'Zeus Protocol',
  'zeus-v-hades': 'Zeus v Hades',
};

// Achievements whose earning program is not a game slug in the catalog.
const SPECIAL_LINKS = {
  'calendar-first-entry': { href: '/calendar', where: 'Calendar' },
  'calendar-tenth-entry': { href: '/calendar', where: 'Calendar' },
  'calculator-first-use': { href: '/calculator', where: 'Calculator' },
  'cloud-phone-pioneer': { href: '/cloud-phone', where: 'Cloud Phone' },
  'olympian-scholar': { href: '/education', where: 'Olympian Education' },
  // Redwater has no dedicated route — the journey lives on hub Earth.
  'redwater-core-diver': { href: '/achievements', where: 'Redwater' },
};

// Same titles as the /achievements ledger page (app/achievements/page.jsx).
export const MILESTONE_TITLES = {
  first: '1st Vecna Slayer',
  '100th': '100th Vecna Slayer',
  '1000th': '1000th Vecna Slayer',
  't-1000': 'Vecna Slayer T-1000',
};

/**
 * Where tapping an achievement goes + where it was earned, by key.
 * Unknown keys fall back to the ledger — never a dead link.
 */
export function achievementLinkForKey(key) {
  if (SPECIAL_LINKS[key]) return SPECIAL_LINKS[key];
  const def = getAchievement(key);
  if (def && def.game) {
    return { href: `/${def.game}`, where: GAME_TITLES[def.game] || def.game };
  }
  return { href: '/achievements', where: 'Olympus' };
}

/**
 * Build the panel's ACHIEVEMENTS rows from a GET /api/achievements payload.
 * Viewer-only (rows belonging to anyone else are dropped) and newest first.
 * With no viewer id (signed out) nothing is shown — the panel never shows
 * another account's achievements.
 */
export function panelAchievements({ milestones = [], achievements = [], myUserId = null } = {}) {
  const rows = [];
  for (const m of milestones || []) {
    if (!myUserId || m.user_id !== myUserId) continue;
    rows.push({
      id: `vecna-${m.milestone}-${m.kill_number}`,
      key: `vecna-${m.milestone}`,
      title: MILESTONE_TITLES[m.milestone] || m.milestone,
      description: `Vecna #${m.kill_number} sealed`,
      where: 'Hawkins: Hunt For Vecna',
      href: '/hawkins',
      awardedAt: m.awarded_at,
    });
  }
  for (const a of achievements || []) {
    if (!myUserId || a.user_id !== myUserId) continue;
    const link = achievementLinkForKey(a.key);
    rows.push({
      id: `ach-${a.key}-${a.user_id}`,
      key: a.key,
      title: a.title,
      description: (a.metadata && a.metadata.description) || '',
      where: link.where,
      href: link.href,
      awardedAt: a.awarded_at,
    });
  }
  rows.sort((x, y) => new Date(y.awardedAt) - new Date(x.awardedAt));
  return rows;
}
