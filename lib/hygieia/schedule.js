// lib/hygieia/schedule.js — HYGIEIA reminder schedule math.
//
// Pure functions, zero network, zero side effects: next-fire computation,
// plain-English schedule descriptions, and form validation for the
// reminders CRUD. Tested headless in tests/hygieia.test.mjs.
//
// Conventions shared with the Supabase schema (supabase/hygieia.sql):
//   - remind_time is a "HH:MM" or "HH:MM:SS" 24-hour wall-clock string.
//   - days (weekly only) are smallint[] of JS getDay() numbers: 0=Sunday … 6=Saturday.
//   - A 'once' reminder has no stored date column: it means "the next time
//     this clock time rolls around" — today if it hasn't passed, tomorrow if
//     it has. The UI never claims a calendar date the schema can't store.
//   - Notification DELIVERY is a stub (lib/hygieia/notify.ts). These
//     functions only answer "when should this show in the app".

/** Parse "HH:MM" / "HH:MM:SS" into { hours, minutes } or null. */
export function parseRemindTime(value) {
  if (typeof value !== 'string') return null;
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(value.trim());
  if (!m) return null;
  const hours = Number(m[1]);
  const minutes = Number(m[2]);
  if (hours > 23 || minutes > 59) return null;
  return { hours, minutes };
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Normalise a weekly days array to sorted unique 0..6 ints. */
export function normaliseDays(days) {
  if (!Array.isArray(days)) return [];
  const out = [];
  for (const d of days) {
    const n = Number(d);
    if (Number.isInteger(n) && n >= 0 && n <= 6 && !out.includes(n)) out.push(n);
  }
  return out.sort((a, b) => a - b);
}

/** A Date at today's date with the given hours/minutes, in local time. */
function atTime(base, hours, minutes) {
  const d = new Date(base);
  d.setHours(hours, minutes, 0, 0);
  return d;
}

/**
 * The next Date this reminder fires, in local time — or null when it never
 * fires (disabled, bad time, weekly with no days).
 *
 * @param {object} reminder { schedule_type: 'once'|'daily'|'weekly', remind_time, days, enabled }
 * @param {Date} [now] — injectable clock for tests; defaults to now.
 */
export function nextFire(reminder, now = new Date()) {
  if (!reminder || reminder.enabled === false) return null;
  const t = parseRemindTime(reminder.remind_time);
  if (!t) return null;

  const type = reminder.schedule_type;
  if (type === 'once' || type === 'daily') {
    const today = atTime(now, t.hours, t.minutes);
    // Strictly future: if the time already passed (or is exactly now), it
    // rolls to tomorrow. A reminder never claims "now" as its next fire.
    return today.getTime() > now.getTime() ? today : atTime(new Date(now.getTime() + 86400000), t.hours, t.minutes);
  }

  if (type === 'weekly') {
    const days = normaliseDays(reminder.days);
    if (days.length === 0) return null;
    const nowDay = now.getDay();
    let best = null;
    for (const day of days) {
      // Offset in days to the next occurrence of `day`, 0..6.
      let offset = (day - nowDay + 7) % 7;
      const candidate = new Date(now);
      candidate.setDate(now.getDate() + offset);
      const at = atTime(candidate, t.hours, t.minutes);
      // Same-day time already passed → next week.
      const fire = at.getTime() > now.getTime() ? at : new Date(at.getTime() + 7 * 86400000);
      if (!best || fire.getTime() < best.getTime()) best = fire;
    }
    return best;
  }

  return null;
}

/** Plain-English 12-hour clock: "8:00 AM". */
export function prettyTime(remindTime) {
  const t = parseRemindTime(remindTime);
  if (!t) return 'an unknown time';
  const suffix = t.hours >= 12 ? 'PM' : 'AM';
  const h12 = t.hours % 12 === 0 ? 12 : t.hours % 12;
  return `${h12}:${String(t.minutes).padStart(2, '0')} ${suffix}`;
}

/** Plain-English schedule description. Never promises delivery channels. */
export function formatSchedule(reminder) {
  if (!reminder) return 'No schedule';
  const when = prettyTime(reminder.remind_time);
  switch (reminder.schedule_type) {
    case 'once':
      return `Once — next at ${when}`;
    case 'daily':
      return `Every day at ${when}`;
    case 'weekly': {
      const days = normaliseDays(reminder.days);
      if (days.length === 0) return `Weekly — pick days, at ${when}`;
      const names = days.map((d) => DAY_SHORT[d]).join(', ');
      return `Weekly on ${names} at ${when}`;
    }
    default:
      return 'No schedule';
  }
}

/** Short "due next" line, e.g. "Fires Tuesday at 6:30 PM". */
export function nextFireLabel(reminder, now = new Date()) {
  const fire = nextFire(reminder, now);
  if (!fire) return reminder && reminder.enabled === false ? 'Turned off' : 'No upcoming time';
  const dayName = fire.toDateString() === now.toDateString()
    ? 'today'
    : DAY_NAMES[fire.getDay()];
  return `Fires ${dayName} at ${prettyTime(reminder.remind_time)}`;
}

/**
 * Is this reminder due right now, for the in-app "due now" list?
 * A reminder is due when it is enabled, its schedule covers today, and the
 * current time is within `windowMinutes` AFTER its scheduled time.
 * (Before the time: not yet. Long after: missed, shown via next-fire.)
 *
 * @param {object} reminder
 * @param {Date} [now]
 * @param {number} [windowMinutes=15]
 */
export function isDue(reminder, now = new Date(), windowMinutes = 15) {
  if (!reminder || reminder.enabled === false) return false;
  const t = parseRemindTime(reminder.remind_time);
  if (!t) return false;
  const type = reminder.schedule_type;
  if (type !== 'once' && type !== 'daily' && type !== 'weekly') return false;
  if (type === 'weekly') {
    const days = normaliseDays(reminder.days);
    if (!days.includes(now.getDay())) return false;
  }
  const scheduled = atTime(now, t.hours, t.minutes);
  const diffMs = now.getTime() - scheduled.getTime();
  return diffMs >= 0 && diffMs <= windowMinutes * 60000;
}

/**
 * Validate raw form input before it touches Supabase.
 * Returns { ok, errors: string[], clean } where clean is the DB-shaped row
 * (title, schedule_type, remind_time, days|null, enabled).
 */
export function validateReminder(input) {
  const errors = [];
  const src = input || {};

  const title = typeof src.title === 'string' ? src.title.trim() : '';
  if (!title) errors.push('Give the reminder a title.');
  else if (title.length > 120) errors.push('Title must be 120 characters or less.');

  const schedule_type = src.schedule_type;
  if (!['once', 'daily', 'weekly'].includes(schedule_type)) {
    errors.push('Pick a schedule: once, daily, or weekly.');
  }

  const t = parseRemindTime(src.remind_time);
  if (!t) errors.push('Pick a valid time.');

  let days = null;
  if (schedule_type === 'weekly') {
    days = normaliseDays(src.days);
    if (days.length === 0) errors.push('Pick at least one day for a weekly reminder.');
  }

  const enabled = src.enabled !== false;

  if (errors.length > 0) return { ok: false, errors, clean: null };

  return {
    ok: true,
    errors: [],
    clean: {
      title,
      schedule_type,
      remind_time: `${String(t.hours).padStart(2, '0')}:${String(t.minutes).padStart(2, '0')}:00`,
      days,
      enabled,
    },
  };
}

/** Column list the UI selects — mirrors supabase/hygieia.sql. */
export const REMINDER_COLUMNS = 'id,title,schedule_type,remind_time,days,enabled,created_at';
