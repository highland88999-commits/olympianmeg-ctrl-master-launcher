// lib/earth4/life-clock.js
// EARTH 4 — THE REAL CLOCK (Merlin, Nov 14 ~17:05): TIME is the actual
// clock on each user's phone. Not server time, not game time. Every
// operator reads the device clock through here, so the same world
// runs on every phone and changes only as the clock moves.
//
// Two frames, kept apart on purpose:
//   * DAILY activity reads the device's LOCAL hour (the walker's own
//     morning is their morning, wherever they stand).
//   * SEASON boundaries read UTC months, so two phones agree on which
//     month it is even across a timezone line.
// A `now` can be injected (tests, and the scene's refresh) — the
// default is the device clock, `new Date()`.

/** The device's now, as milliseconds since the epoch. */
export function nowMs(now = new Date()) {
  return now instanceof Date ? now.getTime() : Number(now);
}

/** The device's local hour as a decimal (0–24, e.g. 13.5 = 13:30). */
export function localHour(now = new Date()) {
  const d = now instanceof Date ? now : new Date(now);
  return d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;
}

/** The UTC month (1–12) the device clock reads. */
export function utcMonth(now = new Date()) {
  const d = now instanceof Date ? now : new Date(now);
  return d.getUTCMonth() + 1;
}

/** The UTC year the device clock reads. */
export function utcYear(now = new Date()) {
  const d = now instanceof Date ? now : new Date(now);
  return d.getUTCFullYear();
}

/**
 * True when `month` (1–12, UTC) falls in the breeding season.
 * `mask` is a 12-bit month mask in the NORTHERN frame (bit 0 =
 * January). A southern-hemisphere cell reads the same season six
 * months later — summer in Sydney is December, not June.
 */
export function inSeasonMask(mask, lat, month) {
  const m = Number(mask) || 0;
  if (!m) return false;
  const check = lat < 0 ? ((month + 5) % 12) + 1 : month;
  return (m & (1 << (check - 1))) !== 0;
}

/**
 * The next 1st-of-a-month at or after `fromMs` whose month is in
 * season for the cell's latitude. Year-round masks land on the next
 * 1st after `fromMs`. Pure UTC — every phone agrees on the date.
 */
export function nextSeasonStartMs(mask, lat, fromMs) {
  const from = new Date(fromMs);
  const y0 = from.getUTCFullYear();
  const m0 = from.getUTCMonth() + 1;
  for (let i = 0; i <= 12; i++) {
    const total = (m0 - 1) + i;
    const year = y0 + Math.floor(total / 12);
    const month = (total % 12) + 1;
    if (!inSeasonMask(mask, lat, month)) continue;
    const start = Date.UTC(year, month - 1, 1);
    if (start >= fromMs) return start;
  }
  return Date.UTC(y0 + 1, m0 - 1, 1);
}
