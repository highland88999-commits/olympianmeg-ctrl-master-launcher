// lib/seasonal/seasons.js
//
// Date-driven seasonal decoration engine for the launcher hub.
// getSeason(date) -> season id or null. The hub renders decorations purely
// from the calendar date — seasons rotate yearly forever with no deploys
// needed on swap days.
//
// Fixed windows use month/day ranges (inclusive). Variable-date holidays
// (Easter via Gregorian computus; Lunar New Year, Holi, Diwali via lookup
// tables for 2026-2045) are checked with a small window around the day.
// When windows overlap, SEASON_ORDER decides — fixed civic holidays win
// over the variable ones, Christmas wins over everything.

export const SEASONS = {
  halloween:    { badge: '🎃', nameKey: 'season.halloween' },
  remembrance:  { badge: '🌺', nameKey: 'season.remembrance' },
  thanksgiving: { badge: '🦃', nameKey: 'season.thanksgiving' },
  christmas:    { badge: '🎄', nameKey: 'season.christmas' },
  newyear:      { badge: '🎆', nameKey: 'season.newyear' },
  valentines:   { badge: '💝', nameKey: 'season.valentines' },
  stpatricks:   { badge: '☘️', nameKey: 'season.stpatricks' },
  easter:       { badge: '🐣', nameKey: 'season.easter' },
  holi:         { badge: '🎨', nameKey: 'season.holi' },
  lunarnewyear: { badge: '🏮', nameKey: 'season.lunarnewyear' },
  canadaday:    { badge: '🍁', nameKey: 'season.canadaday' },
  independence: { badge: '🎇', nameKey: 'season.independence' },
  diwali:       { badge: '🪔', nameKey: 'season.diwali' },
  starwars:     { badge: '⚔️', nameKey: 'season.starwars' },
};

// First match in this order wins when windows overlap.
const SEASON_ORDER = [
  'christmas', 'newyear', 'remembrance', 'halloween', 'thanksgiving',
  'easter', 'holi', 'lunarnewyear', 'valentines', 'stpatricks',
  'diwali', 'canadaday', 'independence', 'starwars',
];

// [startMonth, startDay, endMonth, endDay] — months are 1-based.
// inWindow() compares calendar days in local time, so a window like
// starwars [5,4,5,6] is exactly May 4 00:00 -> May 6 23:59:59 local.
const FIXED_WINDOWS = {
  halloween:    [[10, 1, 10, 31]],
  remembrance:  [[11, 1, 11, 11]],
  thanksgiving: [[11, 12, 11, 21]],
  christmas:    [[11, 22, 12, 31]],
  newyear:      [[1, 1, 1, 7]],
  valentines:   [[2, 8, 2, 14]],
  stpatricks:   [[3, 10, 3, 17]],
  canadaday:    [[6, 24, 7, 1]],
  independence: [[6, 28, 7, 4]],
  starwars:     [[5, 4, 5, 6]], // May the 4th / Revenge of the 5th / Return of the 6th
};

/**
 * Which Star Wars day is active: 4 (Jedi), 5 (Sith), or 6 (celebration).
 * Returns null outside the 72-hour window. Each day gets its own flavor.
 */
export function starwarsDay(date = new Date()) {
  if (getSeason(date) !== 'starwars') return null;
  return date.getDate(); // 4, 5, or 6
}

// Lunisolar lookup tables: year -> [month, day]. 2026-2028 anchors verified;
// later years follow the standard cycle (approximate ±1 day far out).
const LUNAR_NEW_YEAR = {
  2026: [2, 17], 2027: [2, 6], 2028: [1, 26], 2029: [2, 13], 2030: [2, 3],
  2031: [1, 23], 2032: [2, 11], 2033: [1, 31], 2034: [2, 19], 2035: [2, 8],
  2036: [1, 28], 2037: [2, 15], 2038: [2, 4], 2039: [1, 24], 2040: [2, 12],
  2041: [2, 1], 2042: [1, 22], 2043: [2, 10], 2044: [1, 30], 2045: [2, 17],
};
const HOLI = {
  2026: [3, 4], 2027: [3, 20], 2028: [3, 11], 2029: [2, 28], 2030: [3, 17],
  2031: [3, 6], 2032: [3, 24], 2033: [3, 13], 2034: [3, 3], 2035: [3, 22],
  2036: [3, 10], 2037: [3, 29], 2038: [3, 18], 2039: [3, 7], 2040: [3, 25],
  2041: [3, 15], 2042: [3, 5], 2043: [3, 23], 2044: [3, 12], 2045: [3, 2],
};
const DIWALI = {
  2026: [11, 8], 2027: [10, 29], 2028: [10, 18], 2029: [11, 6], 2030: [10, 27],
  2031: [11, 16], 2032: [11, 5], 2033: [10, 25], 2034: [11, 14], 2035: [11, 4],
  2036: [10, 24], 2037: [11, 13], 2038: [11, 2], 2039: [10, 22], 2040: [11, 10],
  2041: [10, 30], 2042: [10, 20], 2043: [11, 8], 2044: [10, 28], 2045: [11, 17],
};

/** Easter Sunday for a Gregorian year — Anonymous/Computus algorithm. */
export function easterSunday(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 3=Mar, 4=Apr
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

function dayOfYear(d) {
  return Math.floor((d - new Date(d.getFullYear(), 0, 1)) / 86400000);
}

function inWindow(d, [sm, sd, em, ed]) {
  const dNum = dayOfYear(d);
  const sNum = dayOfYear(new Date(d.getFullYear(), sm - 1, sd));
  const eNum = dayOfYear(new Date(d.getFullYear(), em - 1, ed));
  return dNum >= sNum && dNum <= eNum;
}

function nearDate(d, [m, day], radiusDays) {
  const target = new Date(d.getFullYear(), m - 1, day);
  return Math.abs(dayOfYear(d) - dayOfYear(target)) <= radiusDays;
}

/**
 * The active season id for a date, or null when the hub should be clean.
 * Pass a Date (defaults to now). Pure function — safe for tests.
 */
export function getSeason(date = new Date()) {
  const y = date.getFullYear();
  const matches = new Set();

  for (const [id, windows] of Object.entries(FIXED_WINDOWS)) {
    if (windows.some((w) => inWindow(date, w))) matches.add(id);
  }

  const easter = easterSunday(y);
  if (Math.abs(dayOfYear(date) - dayOfYear(easter)) <= 3) matches.add('easter');
  if (LUNAR_NEW_YEAR[y] && nearDate(date, LUNAR_NEW_YEAR[y], 3)) matches.add('lunarnewyear');
  if (HOLI[y] && nearDate(date, HOLI[y], 2)) matches.add('holi');
  if (DIWALI[y] && nearDate(date, DIWALI[y], 3)) matches.add('diwali');

  for (const id of SEASON_ORDER) {
    if (matches.has(id)) return id;
  }
  return null;
}

/** True while Merlin's perfected Christmas tree should stand in the hub. */
export function treeVisible(date = new Date()) {
  const s = getSeason(date);
  if (s === 'christmas') return true;
  if (s === 'newyear') return true; // through Twelfth Night (Jan 6)
  if (s !== null) return false;
  // Jan 8+ : tree is gone even without another season
  const m = date.getMonth() + 1;
  const d = date.getDate();
  return m === 1 && d <= 6;
}

export function seasonBadge(seasonId) {
  return SEASONS[seasonId] || null;
}
