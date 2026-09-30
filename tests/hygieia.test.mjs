// tests/hygieia.test.mjs — Headless tests for the HYGIEIA pocket universe.
// Run: node tests/hygieia.test.mjs (from the repo root). No browser, no network.
import { readFileSync } from 'fs';
import {
  parseRemindTime,
  normaliseDays,
  nextFire,
  prettyTime,
  formatSchedule,
  nextFireLabel,
  isDue,
  validateReminder,
  REMINDER_COLUMNS,
} from '../lib/hygieia/schedule.js';
import { scheduleLocalReminder, NOTIFICATION_NOTE } from '../lib/hygieia/notify.ts';
import { PARKED_IDEAS } from '../lib/hygieia/notes.ts';

let passed = 0, failed = 0;
function t(name, cond) {
  if (cond) { passed++; }
  else { failed++; console.error(`FAIL: ${name}`); }
}
function sameMinute(a, b) {
  return a && b &&
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate() &&
    a.getHours() === b.getHours() &&
    a.getMinutes() === b.getMinutes();
}
function at(dayOffset, h, m) {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  d.setHours(h, m, 0, 0);
  return d;
}

// --- parseRemindTime ---------------------------------------------------------
t('parse HH:MM', JSON.stringify(parseRemindTime('08:30')) === JSON.stringify({ hours: 8, minutes: 30 }));
t('parse HH:MM:SS drops seconds', JSON.stringify(parseRemindTime('18:05:00')) === JSON.stringify({ hours: 18, minutes: 5 }));
t('reject 25:00', parseRemindTime('25:00') === null);
t('reject garbage', parseRemindTime('nope') === null);
t('reject non-string', parseRemindTime(null) === null);

// --- normaliseDays -----------------------------------------------------------
t('normalise dedupes + sorts', JSON.stringify(normaliseDays([5, 1, 5, 0])) === '[0,1,5]');
t('normalise drops out-of-range', JSON.stringify(normaliseDays([-1, 7, 3])) === '[3]');
t('normalise non-array -> []', normaliseDays(null).length === 0);

// --- nextFire: daily ---------------------------------------------------------
t('daily fires later today when time is ahead',
  sameMinute(nextFire({ schedule_type: 'daily', remind_time: '23:59:00', enabled: true }, at(0, 10, 0)), at(0, 23, 59)));
t('daily rolls to tomorrow when time passed',
  sameMinute(nextFire({ schedule_type: 'daily', remind_time: '06:00:00', enabled: true }, at(0, 10, 0)), at(1, 6, 0)));
t('daily at exactly now rolls forward (never claims "now")',
  nextFire({ schedule_type: 'daily', remind_time: '10:00', enabled: true }, at(0, 10, 0)).getTime() > at(0, 10, 0).getTime());

// --- nextFire: once -----------------------------------------------------------
t('once behaves like daily (no date column exists)',
  sameMinute(nextFire({ schedule_type: 'once', remind_time: '23:59', enabled: true }, at(0, 10, 0)), at(0, 23, 59)));
t('once rolls to tomorrow when passed',
  sameMinute(nextFire({ schedule_type: 'once', remind_time: '06:00', enabled: true }, at(0, 10, 0)), at(1, 6, 0)));

// --- nextFire: weekly ----------------------------------------------------------
const tuesday = (() => { const d = new Date(); const off = (2 - d.getDay() + 7) % 7; return at(off, 10, 0); })();
const tuesdayDay = tuesday.getDay();
t('weekly picks the nearest upcoming chosen day',
  (() => {
    const days = [(tuesdayDay + 1) % 7, (tuesdayDay + 3) % 7];
    const f = nextFire({ schedule_type: 'weekly', remind_time: '09:00', days, enabled: true }, tuesday);
    return f && f.getDay() === (tuesdayDay + 1) % 7;
  })());
t('weekly same-day time passed -> next week',
  (() => {
    const f = nextFire({ schedule_type: 'weekly', remind_time: '09:00', days: [tuesdayDay], enabled: true }, tuesday);
    const expect = new Date(tuesday); expect.setDate(expect.getDate() + 7); expect.setHours(9, 0, 0, 0);
    return f && sameMinute(f, expect);
  })());
t('weekly with no days -> null',
  nextFire({ schedule_type: 'weekly', remind_time: '09:00', days: [], enabled: true }, tuesday) === null);
t('weekly with null days -> null',
  nextFire({ schedule_type: 'weekly', remind_time: '09:00', days: null, enabled: true }, tuesday) === null);

// --- nextFire: edge cases -------------------------------------------------------
t('disabled -> null', nextFire({ schedule_type: 'daily', remind_time: '10:00', enabled: false }, at(0, 9, 0)) === null);
t('bad time -> null', nextFire({ schedule_type: 'daily', remind_time: 'xx', enabled: true }, at(0, 9, 0)) === null);
t('unknown type -> null', nextFire({ schedule_type: 'monthly', remind_time: '10:00', enabled: true }, at(0, 9, 0)) === null);

// --- formatting ------------------------------------------------------------------
t('prettyTime 12h', prettyTime('08:05') === '8:05 AM' && prettyTime('18:30') === '6:30 PM' && prettyTime('00:00') === '12:00 AM');
t('formatSchedule daily', formatSchedule({ schedule_type: 'daily', remind_time: '08:00' }) === 'Every day at 8:00 AM');
t('formatSchedule once', formatSchedule({ schedule_type: 'once', remind_time: '21:15' }) === 'Once — next at 9:15 PM');
t('formatSchedule weekly days', formatSchedule({ schedule_type: 'weekly', remind_time: '18:30', days: [1, 3, 5] }) === 'Weekly on Mon, Wed, Fri at 6:30 PM');
t('formatSchedule weekly no days is honest', formatSchedule({ schedule_type: 'weekly', remind_time: '18:30', days: [] }).includes('pick days'));
t('nextFireLabel uses "today"', nextFireLabel({ schedule_type: 'daily', remind_time: '23:59', enabled: true }, at(0, 10, 0)) === 'Fires today at 11:59 PM');
t('nextFireLabel names the day when not today', /Fires (Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday) at/.test(nextFireLabel({ schedule_type: 'daily', remind_time: '06:00', enabled: true }, at(0, 10, 0))));
t('nextFireLabel disabled -> Turned off', nextFireLabel({ schedule_type: 'daily', remind_time: '06:00', enabled: false }, at(0, 10, 0)) === 'Turned off');

// --- isDue (in-app "due now" math) ------------------------------------------------
t('isDue true 5 min after time', isDue({ schedule_type: 'daily', remind_time: '10:00', enabled: true }, at(0, 10, 5)));
t('isDue false before time', !isDue({ schedule_type: 'daily', remind_time: '10:00', enabled: true }, at(0, 9, 59)));
t('isDue false 16 min after (window=15)', !isDue({ schedule_type: 'daily', remind_time: '10:00', enabled: true }, at(0, 10, 16)));
t('isDue false when disabled', !isDue({ schedule_type: 'daily', remind_time: '10:00', enabled: false }, at(0, 10, 5)));
t('isDue weekly respects day',
  isDue({ schedule_type: 'weekly', remind_time: '10:00', days: [tuesdayDay], enabled: true }, new Date(tuesday.getTime() + 5 * 60000)) &&
  !isDue({ schedule_type: 'weekly', remind_time: '10:00', days: [(tuesdayDay + 1) % 7], enabled: true }, new Date(tuesday.getTime() + 5 * 60000)));

// --- validateReminder --------------------------------------------------------------
const good = validateReminder({ title: '  Walk  ', schedule_type: 'weekly', remind_time: '18:30', days: [5, 1, 1], enabled: true });
t('validate ok', good.ok && good.errors.length === 0);
t('validate trims title + normalises days', good.clean.title === 'Walk' && JSON.stringify(good.clean.days) === '[1,5]');
t('validate stores HH:MM:SS', good.clean.remind_time === '18:30:00');
t('validate daily nulls days', validateReminder({ title: 'x', schedule_type: 'daily', remind_time: '08:00' }).clean.days === null);
t('validate rejects empty title', !validateReminder({ title: '  ', schedule_type: 'daily', remind_time: '08:00' }).ok);
t('validate rejects 121-char title', !validateReminder({ title: 'x'.repeat(121), schedule_type: 'daily', remind_time: '08:00' }).ok);
t('validate accepts 120-char title', validateReminder({ title: 'x'.repeat(120), schedule_type: 'daily', remind_time: '08:00' }).ok);
t('validate rejects bad type', !validateReminder({ title: 'x', schedule_type: 'hourly', remind_time: '08:00' }).ok);
t('validate rejects bad time', !validateReminder({ title: 'x', schedule_type: 'daily', remind_time: '8pm' }).ok);
t('validate rejects weekly with no days', !validateReminder({ title: 'x', schedule_type: 'weekly', remind_time: '08:00', days: [] }).ok);
t('REMINDER_COLUMNS mirrors the SQL table',
  REMINDER_COLUMNS === 'id,title,schedule_type,remind_time,days,enabled,created_at');

// --- notify.ts: documented stub, no fake scheduling ---------------------------------
t('scheduleLocalReminder declines honestly', (() => {
  const r = scheduleLocalReminder({ title: 'x', schedule_type: 'daily', remind_time: '08:00' });
  return r.scheduled === false && typeof r.reason === 'string' && r.reason.length > 0;
})());
t('stub reason = the in-app honest line', scheduleLocalReminder({ title: 'x', schedule_type: 'daily', remind_time: '08:00' }).reason === NOTIFICATION_NOTE);
t('NOTIFICATION_NOTE is the exact required sentence',
  NOTIFICATION_NOTE === 'Reminders show in-app for now — phone notifications come with the mobile app.');
const notifySrc = readFileSync('lib/hygieia/notify.ts', 'utf8');
t('notify.ts marked STUB ONLY', /STUB ONLY/i.test(notifySrc));
t('notify.ts carries the exact honest line', notifySrc.includes('Reminders show in-app for now — phone notifications come with the mobile app.'));
t('notify.ts never claims delivery works',
  !/sends? (a |the )?push|dispatch(es)? push|enqueue|FCM|APNs|OneSignal/i.test(notifySrc));

// --- notes.ts: parked idea recorded, never built --------------------------------------
t('parked idea recorded verbatim',
  PARKED_IDEAS.length === 1 &&
  PARKED_IDEAS[0] === 'PARKED by Merlin 2026-09-29: step-to-credit currency. No currency of any kind until he calls it.');
t('parked note carries Merlin + date', /PARKED by Merlin 2026-09-29/.test(PARKED_IDEAS[0]));

// --- no currency anywhere in the module ------------------------------------------------
const pageSrc = readFileSync('app/hygieia/page.jsx', 'utf8');
const scheduleSrc = readFileSync('lib/hygieia/schedule.js', 'utf8');
const notesSrc = readFileSync('lib/hygieia/notes.ts', 'utf8');
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}
const currencyRe = /\b(token|tokens|currency|credits|wallet|exchange|mint|minting|coin|coins)\b/i;
t('page.jsx has no currency language', !currencyRe.test(stripComments(pageSrc)));
t('schedule.js has no currency language', !currencyRe.test(stripComments(scheduleSrc)));
const PARKED_LINE = 'PARKED by Merlin 2026-09-29: step-to-credit currency. No currency of any kind until he calls it.';
t('notes.ts holds the parked line twice (comment + exported value), nothing else currency-flavoured',
  notesSrc.split(PARKED_LINE).length - 1 === 2 &&
  !currencyRe.test(stripComments(notesSrc).replaceAll(PARKED_LINE, '')));

// --- supabase/hygieia.sql: idempotent, owner-only, no user_steps redefinition -------------
const sql = readFileSync('supabase/hygieia.sql', 'utf8');
t('SQL queued header present', /QUEUED — DO NOT RUN DIRECTLY/.test(sql));
t('SQL creates reminder_items idempotently', /create table if not exists public\.reminder_items/.test(sql));
t('SQL never redefines user_steps', !/create table[^;]*user_steps/i.test(sql));
t('SQL names the user_steps dependency', /supabase\/steps\.sql/.test(sql));
t('SQL schema matches the spec columns',
  ['id uuid primary key default gen_random_uuid()',
   'user_id uuid not null references auth.users',
   "schedule_type text not null check (schedule_type in ('once', 'daily', 'weekly'))",
   'remind_time time',
   'days smallint[]',
   'enabled boolean not null default true',
   'created_at timestamptz not null default now()'
  ].every((frag) => sql.replace(/\s+/g, ' ').includes(frag.replace(/\s+/g, ' '))));
t('SQL enables RLS', /alter table public\.reminder_items enable row level security/i.test(sql));
t('SQL has owner-only policies for select/insert/update/delete',
  ['for select', 'for insert', 'for update', 'for delete'].every((op) => new RegExp(`on public\\.reminder_items ${op}`).test(sql)) &&
  (sql.match(/auth\.uid\(\) = user_id/g) || []).length >= 4);
t('SQL policies are drop-if-exists (re-runnable)',
  (sql.match(/drop policy if exists/g) || []).length === 4);
t('SQL grants no anon writes', !/\bto anon\b/i.test(sql));

// --- registration: satellites.ts + god-menus + locales ----------------------------------
const regSrc = readFileSync('lib/i18n/satellites.ts', 'utf8');
t('satellites.ts registers hygieia',
  regSrc.includes('{ key: "hygieia", route: "/hygieia", pos: "HESTIA", section: "THERAPY", constellation: "MEDUSA" }'));
const godSrc = readFileSync('lib/god-menus.js', 'utf8');
t('hygieia lives in the HESTIA god menu', /god: 'HESTIA'[\s\S]*?'hygieia'/.test(godSrc));
for (const code of ['en', 'el', 'es', 'fr', 'de', 'pt', 'it']) {
  const loc = JSON.parse(readFileSync(`lib/i18n/locales/${code}.json`, 'utf8'));
  t(`${code}: sat.hygieia.title present`, loc['sat.hygieia.title'] === 'Hygieia');
  t(`${code}: sat.hygieia.subtitle present`, typeof loc['sat.hygieia.subtitle'] === 'string' && loc['sat.hygieia.subtitle'].length > 0);
}

// --- page honesty + layout conventions ----------------------------------------------------
t('page renders the exact in-app notification line via NOTIFICATION_NOTE',
  pageSrc.includes('{NOTIFICATION_NOTE}') && pageSrc.includes("from '@/lib/hygieia/notify'"));
t('page has Safari bottom-bar clearance', /safe-area-inset-bottom/.test(pageSrc));
t('page uses PageBack', pageSrc.includes('PageBack'));
t('page marks future metrics as coming later', /coming later/i.test(pageSrc));
t('page never labels anything AI or automatic',
  !/\bAI\b/.test(pageSrc) && !/artificial intelligence/i.test(pageSrc) && !/\bautomatic(ally)?\b/i.test(pageSrc));
t('page has no external URLs', !/https?:\/\/(?!olympusverse|nexus-phi-taupe)/i.test(pageSrc));

// --- summary --------------------------------------------------------------------------------
console.log(`\nhygieia: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
