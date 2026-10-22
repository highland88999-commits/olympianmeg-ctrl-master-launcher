// tests/journal.test.mjs
// Journal (Merlin, 2026-10-22) — a per-user journal in the UTILITIES
// menu: searchable entries, a horizontal carousel, automatic database
// timestamps, newest -> oldest by default with user-flippable order,
// and a horizontal/vertical layout toggle.
// - registry pins: journal lives in satellites.ts + the UTILITIES god
//   menu (claimed exactly once), titles in all 31 locales
// - API contract pins: q/order params, explicit user scoping on every
//   query, created_at NEVER taken from the request, setup-pending
//   honesty until supabase/journal.sql is run
// - SQL pins: table shape, (user_id, created_at desc) index, RLS on,
//   four owner-only policies
// - page wiring pins: search input, both toggle switches, carousel
//   snap classes, vertical list, persisted view preferences
// - pure-logic tests for lib/journal/entries.js
//
// Run: node --test tests/journal.test.mjs   (from the repo root)

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { GOD_MENUS, allGodMenuSatellites, godMenuFor } from '../lib/god-menus.js';
import {
  normalizeOrder,
  normalizeLayout,
  sortEntries,
  escapeIlikeTerm,
  buildSearchOrFilter,
  sanitizeEntryInput,
  isMissingTableError,
  formatEntryTimestamp,
  entryWasEdited,
} from '../lib/journal/entries.js';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..');
const read = (p) => readFileSync(join(repo, p), 'utf8');

const satSrc = read('lib/i18n/satellites.ts');
const routeSrc = read('app/api/journal/route.js');
const pageSrc = read('app/journal/page.jsx');
const cardSrc = read('components/journal/JournalEntryCard.jsx');
const switchSrc = read('components/journal/ToggleSwitch.jsx');
const sqlSrc = read('supabase/journal.sql');

describe('registry: journal sits in the UTILITIES satellite + menu', () => {
  it('satellites.ts registers journal at /journal under UTILITIES/ARES', () => {
    assert.ok(
      satSrc.includes(
        '{ key: "journal", route: "/journal", pos: "UTILITIES", section: "UTILITIES", constellation: "ARES" }'
      )
    );
  });

  it('the UTILITIES god menu claims journal, exactly once app-wide', () => {
    const menu = GOD_MENUS.find((m) => m.god === 'UTILITIES');
    assert.ok(menu, 'UTILITIES menu exists');
    assert.ok(menu.satellites.includes('journal'));
    assert.equal(allGodMenuSatellites().filter((k) => k === 'journal').length, 1);
    assert.equal(godMenuFor('journal')?.god, 'UTILITIES');
  });

  it('journal keeps its everyday-tools neighbours', () => {
    const menu = GOD_MENUS.find((m) => m.god === 'UTILITIES');
    for (const k of ['notepad', 'calculator', 'calendar']) {
      assert.ok(menu.satellites.includes(k), k);
    }
  });

  it('all 31 locale files carry a journal title + the shared subtitle', () => {
    const files = readdirSync(join(repo, 'lib/i18n/locales')).filter((f) => f.endsWith('.json'));
    assert.equal(files.length, 31);
    for (const f of files) {
      const dict = JSON.parse(read(`lib/i18n/locales/${f}`));
      assert.ok(dict['sat.journal.title'] && dict['sat.journal.title'].trim(), `${f} title`);
      assert.equal(
        dict['sat.journal.subtitle'],
        'Your private diary, every entry timestamped',
        `${f} subtitle`
      );
    }
    const en = JSON.parse(read('lib/i18n/locales/en.json'));
    assert.equal(en['sat.journal.title'], 'Journal');
  });
});

describe('SQL: journal_entries migration (queued, never executed by tests)', () => {
  it('declares the table with the specced columns', () => {
    assert.ok(sqlSrc.includes('create table if not exists public.journal_entries'));
    for (const col of ['id', 'user_id', 'title', 'body', 'created_at', 'updated_at']) {
      assert.ok(new RegExp(`\\b${col}\\b`).test(sqlSrc), col);
    }
    assert.ok(sqlSrc.includes('body       text        not null'));
    assert.ok(sqlSrc.includes('created_at timestamptz not null default now()'));
    assert.ok(sqlSrc.includes('updated_at timestamptz not null default now()'));
  });

  it('indexes (user_id, created_at desc) — the newest-first read', () => {
    assert.ok(sqlSrc.includes('on public.journal_entries (user_id, created_at desc)'));
  });

  it('enables RLS with four owner-only policies', () => {
    assert.ok(sqlSrc.includes('alter table public.journal_entries enable row level security'));
    for (const verb of ['select', 'insert', 'update', 'delete']) {
      assert.ok(sqlSrc.includes(`on public.journal_entries for ${verb}`), verb);
    }
    assert.ok((sqlSrc.match(/auth\.uid\(\) = user_id/g) || []).length >= 4);
  });

  it('is honestly queued for Merlin\u2019s green light, not auto-run', () => {
    assert.ok(sqlSrc.includes('DO NOT RUN DIRECTLY'));
    assert.ok(sqlSrc.includes('green light'));
  });
});

describe('API contract: app/api/journal/route.js', () => {
  it('mirrors the ui-state auth + service pattern', () => {
    assert.ok(routeSrc.includes("from '@/lib/economy/auth'"));
    assert.ok(routeSrc.includes('getUserFromRequest'));
    assert.ok(routeSrc.includes("from '@/lib/economy/supabase'"));
    assert.ok(routeSrc.includes('getServiceClient'));
    assert.ok(routeSrc.includes('noCache(') && routeSrc.includes('apiGuard('));
  });

  it('exposes GET, POST, PATCH and DELETE', () => {
    for (const m of ['GET', 'POST', 'PATCH', 'DELETE']) {
      assert.ok(routeSrc.includes(`export const ${m} =`), m);
    }
  });

  it('GET reads the q and order params, order normalised, default desc', () => {
    assert.ok(routeSrc.includes("params.get('q')"));
    assert.ok(routeSrc.includes("params.get('order')"));
    assert.ok(routeSrc.includes('normalizeOrder('));
    assert.ok(routeSrc.includes(".order('created_at', { ascending: order === 'asc' })"));
  });

  it('search goes through the escaped title+body or-filter', () => {
    assert.ok(routeSrc.includes('buildSearchOrFilter('));
    assert.ok(routeSrc.includes('.or(orFilter)'));
  });

  it('every query is explicitly scoped to the caller', () => {
    const eqCount = (routeSrc.match(/\.eq\('user_id', user\.id\)/g) || []).length;
    assert.ok(eqCount >= 3, `GET/PATCH/DELETE scoped (found ${eqCount})`);
    assert.ok(routeSrc.includes('insert({ user_id: user.id, title: clean.value.title, body: clean.value.body })'));
    assert.ok(routeSrc.includes(".eq('id', id)"));
  });

  it('created_at is never read from the request — the DB stamps it', () => {
    assert.ok(!/insert\([^)]*created_at/.test(routeSrc));
    assert.ok(!routeSrc.includes('payload.created_at'));
    assert.ok(!routeSrc.includes('clean.value.created_at'));
  });

  it('PATCH bumps updated_at server-side', () => {
    assert.ok(routeSrc.includes('updated_at: new Date().toISOString()'));
  });

  it('degrades honestly while the table is absent', () => {
    assert.ok(routeSrc.includes('setupRequired: true'));
    assert.ok(routeSrc.includes('isMissingTableError('));
    assert.ok(routeSrc.includes('status: 503'));
  });
});

describe('page wiring: search, toggles, carousel, list', () => {
  it('has a live search input bound to state', () => {
    assert.ok(pageSrc.includes('type="search"'));
    assert.ok(pageSrc.includes('value={query}'));
    assert.ok(pageSrc.includes('setDebouncedQuery'));
    assert.ok(pageSrc.includes('encodeURIComponent(q)'));
  });

  it('has exactly two toggle switches: order and layout', () => {
    assert.equal((pageSrc.match(/<ToggleSwitch/g) || []).length, 2);
    assert.ok(pageSrc.includes('offLabel="Newest first"') && pageSrc.includes('onLabel="Oldest first"'));
    assert.ok(pageSrc.includes('offLabel="Carousel"') && pageSrc.includes('onLabel="List"'));
    assert.ok(pageSrc.includes('checked={order === "asc"}'));
    assert.ok(pageSrc.includes('checked={layout === "vertical"}'));
    assert.ok(switchSrc.includes('role="switch"') && switchSrc.includes('aria-checked'));
  });

  it('persists both preferences on-device', () => {
    assert.ok(pageSrc.includes('olympus:journal:prefs:v1'));
    assert.ok(pageSrc.includes('localStorage.setItem(PREFS_KEY'));
    assert.ok(pageSrc.includes('localStorage.getItem(PREFS_KEY'));
  });

  it('the carousel is a snap scroller with arrows and dots', () => {
    assert.ok(pageSrc.includes('snap-x snap-mandatory'));
    assert.ok(pageSrc.includes('snap-center'));
    assert.ok(pageSrc.includes('scrollByCard'));
    assert.ok(pageSrc.includes('scrollToIndex'));
    assert.ok(pageSrc.includes('shrink-0'));
  });

  it('the vertical layout is a stacked list', () => {
    assert.ok(pageSrc.includes('aria-label="Entries list"'));
    assert.ok(pageSrc.includes('flex flex-col gap-4'));
  });

  it('cards show the automatic timestamp and carry edit + delete', () => {
    assert.ok(cardSrc.includes('formatEntryTimestamp(entry.created_at)'));
    assert.ok(cardSrc.includes('window.confirm'));
    assert.ok(cardSrc.includes('onSave(') && cardSrc.includes('onDelete('));
  });

  it('shows the honest setup-pending state, never a fake save', () => {
    assert.ok(pageSrc.includes('Database setup pending'));
    assert.ok(pageSrc.includes('data.setupRequired'));
  });
});

describe('pure logic: lib/journal/entries.js', () => {
  const rows = [
    { id: 'b', title: 'Second', body: 'two', created_at: '2026-10-02T10:00:00Z', updated_at: '2026-10-02T10:00:00Z' },
    { id: 'a', title: 'First', body: 'one', created_at: '2026-10-01T10:00:00Z', updated_at: '2026-10-01T10:00:00Z' },
    { id: 'c', title: 'Third', body: 'three', created_at: '2026-10-03T10:00:00Z', updated_at: '2026-10-03T10:00:00Z' },
  ];

  it('normalizeOrder defaults to desc (newest first)', () => {
    assert.equal(normalizeOrder(undefined), 'desc');
    assert.equal(normalizeOrder('sideways'), 'desc');
    assert.equal(normalizeOrder('asc'), 'asc');
    assert.equal(normalizeOrder('desc'), 'desc');
  });

  it('normalizeLayout defaults to horizontal (the carousel)', () => {
    assert.equal(normalizeLayout(undefined), 'horizontal');
    assert.equal(normalizeLayout('grid'), 'horizontal');
    assert.equal(normalizeLayout('vertical'), 'vertical');
  });

  it('sortEntries orders newest -> oldest by default without mutating', () => {
    const before = rows.map((r) => r.id).join(',');
    assert.deepEqual(sortEntries(rows).map((r) => r.id), ['c', 'b', 'a']);
    assert.deepEqual(sortEntries(rows, 'desc').map((r) => r.id), ['c', 'b', 'a']);
    assert.equal(rows.map((r) => r.id).join(','), before);
  });

  it('sortEntries flips to oldest -> newest on asc', () => {
    assert.deepEqual(sortEntries(rows, 'asc').map((r) => r.id), ['a', 'b', 'c']);
  });

  it('escapeIlikeTerm neutralises pattern wildcards', () => {
    assert.equal(escapeIlikeTerm('50%_off\\'), '50\\%\\_off\\\\');
    assert.equal(escapeIlikeTerm('plain'), 'plain');
    assert.equal(escapeIlikeTerm(null), '');
  });

  it('buildSearchOrFilter: blank -> null, text -> quoted title+body ilike', () => {
    assert.equal(buildSearchOrFilter(''), null);
    assert.equal(buildSearchOrFilter('   '), null);
    assert.equal(buildSearchOrFilter(null), null);
    assert.equal(
      buildSearchOrFilter('rainy day'),
      'title.ilike."%rainy day%",body.ilike."%rainy day%"'
    );
    // commas + quotes in the query cannot break the filter grammar
    const f = buildSearchOrFilter('a,"b');
    assert.ok(!f.includes('"b'));
    assert.ok(f.startsWith('title.ilike."%'));
  });

  it('sanitizeEntryInput requires a body and trims the title', () => {
    assert.equal(sanitizeEntryInput(null).ok, false);
    assert.equal(sanitizeEntryInput({ body: '   ' }).ok, false);
    assert.equal(sanitizeEntryInput({ body: 42 }).ok, false);
    const clean = sanitizeEntryInput({ title: '  Hello  ', body: 'Dear journal' });
    assert.equal(clean.ok, true);
    assert.equal(clean.value.title, 'Hello');
    assert.equal(clean.value.body, 'Dear journal');
    assert.equal(sanitizeEntryInput({ body: 'x' }).value.title, null);
  });

  it('sanitizeEntryInput IGNORES any client-supplied timestamps', () => {
    const clean = sanitizeEntryInput({
      body: 'hi',
      created_at: '1970-01-01T00:00:00Z',
      updated_at: '1970-01-01T00:00:00Z',
    });
    assert.equal(clean.ok, true);
    assert.ok(!('created_at' in clean.value));
    assert.ok(!('updated_at' in clean.value));
  });

  it('sanitizeEntryInput partial mode edits only what is present', () => {
    const only = sanitizeEntryInput({ body: 'new text' }, { partial: true });
    assert.equal(only.ok, true);
    assert.ok(!('title' in only.value));
    assert.equal(sanitizeEntryInput({}, { partial: true }).ok, false);
    assert.equal(sanitizeEntryInput({ body: ' ' }, { partial: true }).ok, false);
  });

  it('isMissingTableError recognises the absent-table shapes only', () => {
    assert.equal(isMissingTableError(null), false);
    assert.equal(isMissingTableError({ code: '42P01' }), true);
    assert.equal(isMissingTableError({ code: 'PGRST205' }), true);
    assert.equal(isMissingTableError({ message: 'relation "journal_entries" does not exist' }), true);
    assert.equal(isMissingTableError({ code: '23505', message: 'duplicate key' }), false);
  });

  it('formatEntryTimestamp renders a readable stamp, empty on junk', () => {
    const s = formatEntryTimestamp('2026-10-22T13:32:00Z');
    assert.ok(s.includes('2026') && s.length > 8);
    assert.equal(formatEntryTimestamp('not-a-date'), '');
  });

  it('entryWasEdited compares the two stamps', () => {
    assert.equal(entryWasEdited(rows[0]), false);
    assert.equal(
      entryWasEdited({ created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-02T00:00:00Z' }),
      true
    );
    assert.equal(entryWasEdited(null), false);
  });
});
