// tests/profile-persistence.test.js — Profile persistence durability audit.
// Run: node tests/profile-persistence.test.js (from the repo root).
// No browser, no network — runs lib/profiles/patch.js + lib/profiles/ensure.js
// against an in-memory fake supabase client, plus source-level regression
// guards on the edit page.
//
// Merlin's rule under test: "once a user saves an edit, it must STAY until
// they change it themselves." Covers:
//   1. Defaults clobbering — ensureProfiles() must never update existing rows.
//   2. Partial-update wipes — saving one field must not clear others; the
//      server applies sparse updates (only sent fields).
//   3. Stale-cache re-saves — check-then-set races (username claim, ensure)
//      degrade to 409 / retry, never 500 or lost data.
//   4. Optimistic UI without rollback — the edit page must not apply local
//      state before the save confirms.

import { register } from 'node:module';
import { readFileSync } from 'node:fs';

register(new URL('./test-loader.mjs', import.meta.url));

const { patchProfile } = await import('../lib/profiles/patch.js');
const { ensureProfiles, isUniqueViolation } = await import('../lib/profiles/ensure.js');
const { validateProfileUpdate } = await import('../lib/profiles/validation.js');

let passed = 0;
let failed = 0;
function t(name, cond) {
  if (cond) { passed++; }
  else { failed++; console.error(`FAIL: ${name}`); }
}
function eq(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

// ---------------------------------------------------------------------------
// In-memory supabase-js stand-in. Supports exactly the query chains used by
// lib/profiles/patch.js and lib/profiles/ensure.js.
// ---------------------------------------------------------------------------
const PGRST116 = { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' };

class FakeQuery {
  constructor(client, table) {
    this.client = client;
    this.table = table;
    this.filters = [];
    this.op = null;
    this.selectCols = null;
    this.singleMode = null;
  }
  select(cols) {
    if (this.op && (this.op.kind === 'update' || this.op.kind === 'insert')) {
      this.selectCols = cols;
      return this;
    }
    this.op = { kind: 'select', cols };
    return this;
  }
  eq(k, v) { this.filters.push([k, v]); return this; }
  insert(row) { this.op = { kind: 'insert', row: { ...row } }; return this; }
  update(patch) { this.op = { kind: 'update', patch: { ...patch } }; return this; }
  single() { this.singleMode = 'single'; return this; }
  maybeSingle() { this.singleMode = 'maybeSingle'; return this; }
  then(resolve, reject) { this._run().then(resolve, reject); }
  _project(row, cols) {
    if (!cols || cols.trim() === '*') return { ...row };
    const out = {};
    for (const c of cols.split(',').map((s) => s.trim()).filter(Boolean)) out[c] = row[c];
    return out;
  }
  _match(row) { return this.filters.every(([k, v]) => row[k] === v); }
  async _run() {
    const table = this.client.tables[this.table] || (this.client.tables[this.table] = []);
    const fail = this.client.failNext;
    if (fail && fail.on === this.op?.kind) {
      this.client.failNext = null;
      throw fail.error;
    }
    if (this.op.kind === 'select') {
      const rows = table.filter((r) => this._match(r)).map((r) => this._project(r, this.op.cols));
      if (this.singleMode === 'single') {
        if (rows.length !== 1) return { data: null, error: { ...PGRST116 } };
        return { data: rows[0], error: null };
      }
      if (this.singleMode === 'maybeSingle') {
        if (rows.length > 1) return { data: null, error: { ...PGRST116 } };
        return { data: rows[0] || null, error: null };
      }
      return { data: rows, error: null };
    }
    if (this.op.kind === 'insert') {
      const row = { id: `id-${table.length + 1}`, ...this.op.row };
      table.push(row);
      this.client.inserts.push({ table: this.table, row: { ...row } });
      const data = this._project(row, this.selectCols);
      return { data, error: null };
    }
    if (this.op.kind === 'update') {
      const rows = table.filter((r) => this._match(r));
      this.client.updates.push({
        table: this.table,
        patch: { ...this.op.patch },
        filters: this.filters.map(([k, v]) => ({ [k]: v })),
      });
      for (const r of rows) Object.assign(r, this.op.patch);
      if (this.singleMode === 'single') {
        if (rows.length !== 1) return { data: null, error: { ...PGRST116 } };
        return { data: this._project(rows[0], this.selectCols), error: null };
      }
      return { data: rows.map((r) => this._project(r, this.selectCols || '*')), error: null };
    }
    throw new Error(`FakeQuery: unsupported op ${JSON.stringify(this.op)}`);
  }
}

function makeClient() {
  const client = {
    tables: { user_profiles: [] },
    updates: [], // every update() call, in order
    inserts: [],
    failNext: null, // { on: 'insert'|'update', error } — throw once
    from(table) { return new FakeQuery(client, table); },
  };
  return client;
}

function uniqueViolation() {
  return { code: '23505', message: 'duplicate key value violates unique constraint "user_profiles_username_key"' };
}

const USER = { id: 'user-1', email: 'merlin@example.com', user_metadata: {} };

function seedRow(over = {}) {
  return {
    id: 'row-personal-1',
    user_id: USER.id,
    type: 'personal',
    username: 'merlin',
    display_name: 'Merlin',
    bio: 'Original bio',
    avatar_url: 'https://cdn.example/avatars/a.png',
    profile_video_url: null,
    cover_url: 'https://cdn.example/covers/c.jpg',
    cover_kind: 'image',
    website_urls: ['https://merlin.example/'],
    background_video: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...over,
  };
}

// ensure() spy used by patchProfile tests: idempotently inserts both rows.
async function fakeEnsure(user, admin) {
  for (const type of ['personal', 'business']) {
    const exists = admin.tables.user_profiles.some((r) => r.user_id === user.id && r.type === type);
    if (!exists) {
      admin.tables.user_profiles.push(seedRow({
        id: `row-${type}-new`, type, username: `${user.id}-${type}`,
        bio: '', display_name: '', avatar_url: null, cover_url: null,
        website_urls: [],
      }));
    }
  }
}

// ---------------------------------------------------------------------------
// 1. Sparse validation: only sent fields survive.
// ---------------------------------------------------------------------------
{
  const r = validateProfileUpdate({ bio: 'hi' });
  t('validation is sparse: {bio} -> only bio', r.ok && eq(Object.keys(r.value), ['bio']));
  const r2 = validateProfileUpdate({ display_name: 'X', avatar_url: '' });
  t('validation sparse keeps exactly the sent keys',
    r2.ok && eq(Object.keys(r2.value).sort(), ['avatar_url', 'display_name']));
  const r3 = validateProfileUpdate({});
  t('validation of empty body is ok with empty value', r3.ok && eq(r3.value, {}));
}

// ---------------------------------------------------------------------------
// 2. patchProfile: saving one field never wipes the others.
// ---------------------------------------------------------------------------
{
  const client = makeClient();
  const before = seedRow();
  client.tables.user_profiles.push({ ...before });

  const res = await patchProfile({
    admin: client, user: USER, body: { type: 'personal', bio: 'New bio' }, ensure: fakeEnsure,
  });
  t('save bio returns 200', res.status === 200 && res.json.ok === true);
  t('update payload contains ONLY the sent field',
    client.updates.length === 1 && eq(Object.keys(client.updates[0].patch), ['bio']));

  const after = client.tables.user_profiles[0];
  t('saved bio persisted', after.bio === 'New bio');
  const { bio: _b1, ...beforeRest } = before;
  const { bio: _b2, ...afterRest } = after;
  t('every other field byte-identical after save', eq(beforeRest, afterRest));

  // save -> reload -> intact
  const reload = client.tables.user_profiles.find((r) => r.user_id === USER.id && r.type === 'personal');
  t('reload after save: all fields intact',
    reload.bio === 'New bio' && reload.avatar_url === before.avatar_url
    && reload.cover_url === before.cover_url && eq(reload.website_urls, before.website_urls)
    && reload.display_name === before.display_name && reload.username === before.username);
}

{
  // field A -> field B untouched, twice over
  const client = makeClient();
  client.tables.user_profiles.push(seedRow());
  await patchProfile({
    admin: client, user: USER, body: { type: 'personal', display_name: 'New Name' }, ensure: fakeEnsure,
  });
  const after = client.tables.user_profiles[0];
  t('save display_name leaves avatar_url untouched', after.avatar_url === 'https://cdn.example/avatars/a.png');
  t('save display_name leaves cover_url untouched', after.cover_url === 'https://cdn.example/covers/c.jpg');
  t('save display_name leaves website_urls untouched', eq(after.website_urls, ['https://merlin.example/']));
  t('save display_name leaves bio untouched', after.bio === 'Original bio');
}

{
  // missing row: ensure runs, save succeeds (never a 500 / lost edit)
  const client = makeClient();
  const res = await patchProfile({
    admin: client, user: USER, body: { type: 'personal', bio: 'first save' }, ensure: fakeEnsure,
  });
  t('save with no pre-existing row returns 200 (ensure ran)', res.status === 200);
  t('missing row was created with the saved field',
    client.tables.user_profiles.some((r) => r.type === 'personal' && r.bio === 'first save'));
}

{
  t('bad type -> 400', (await patchProfile({ admin: makeClient(), user: USER, body: { type: 'x' }, ensure: fakeEnsure })).status === 400);
  t('null body -> 400', (await patchProfile({ admin: makeClient(), user: USER, body: null, ensure: fakeEnsure })).status === 400);
}

// ---------------------------------------------------------------------------
// 3. Username races degrade to 409, never 500.
// ---------------------------------------------------------------------------
{
  const client = makeClient();
  client.tables.user_profiles.push(seedRow()); // user-1 / merlin
  client.tables.user_profiles.push(seedRow({ id: 'row-other', user_id: 'user-2', username: 'taken-name', type: 'personal' }));
  const res = await patchProfile({
    admin: client, user: USER, body: { type: 'personal', username: 'taken-name' }, ensure: fakeEnsure,
  });
  t('username clash -> 409', res.status === 409 && /taken/i.test(res.json.error));
  t('clash writes nothing', client.updates.length === 0);
  t('other user row untouched by clash',
    client.tables.user_profiles.find((r) => r.user_id === 'user-2').username === 'taken-name');
}

{
  // check-then-set race: clash check sees the name free, the update loses
  // the race -> unique_violation -> must be a 409, not a thrown 500.
  const client = makeClient();
  client.tables.user_profiles.push(seedRow());
  client.failNext = { on: 'update', error: uniqueViolation() };
  const res = await patchProfile({
    admin: client, user: USER, body: { type: 'personal', username: 'fresh-name' }, ensure: fakeEnsure,
  });
  t('username race lost -> 409 not 500', res.status === 409 && /taken/i.test(res.json.error));
}

{
  // username-only change: both rows renamed, no empty update, profile returned
  const client = makeClient();
  client.tables.user_profiles.push(seedRow());
  client.tables.user_profiles.push(seedRow({ id: 'row-biz-1', type: 'business', username: 'merlin-biz' }));
  const res = await patchProfile({
    admin: client, user: USER, body: { type: 'personal', username: 'nova-1' }, ensure: fakeEnsure,
  });
  t('username-only change returns 200', res.status === 200 && res.json.ok === true);
  const names = client.tables.user_profiles.filter((r) => r.user_id === USER.id).map((r) => r.username);
  t('both personal+business rows share the new username', names.every((n) => n === 'nova-1'));
}

{
  t('isUniqueViolation: pg code 23505', isUniqueViolation({ code: '23505' }) === true);
  t('isUniqueViolation: message match', isUniqueViolation({ message: 'duplicate key value violates unique constraint' }) === true);
  t('isUniqueViolation: empty object false', isUniqueViolation({}) === false);
  t('isUniqueViolation: null false', isUniqueViolation(null) === false);
}

// ---------------------------------------------------------------------------
// 4. ensureProfiles: defaults must NEVER clobber existing user data.
// ---------------------------------------------------------------------------
{
  const client = makeClient();
  const existing = seedRow({ bio: 'Do not touch', display_name: 'Custom Name', avatar_url: 'https://cdn.example/keep.png' });
  client.tables.user_profiles.push({ ...existing });

  const out = await ensureProfiles(USER, client);
  t('ensure returns both profiles', !!(out.personal && out.business));
  t('ensure performs ZERO updates on existing rows', client.updates.length === 0);
  const personal = client.tables.user_profiles.find((r) => r.type === 'personal');
  t('existing personal row byte-identical after ensure', eq(personal, existing));
  const business = client.tables.user_profiles.find((r) => r.type === 'business');
  t('missing business row created', !!business && business.user_id === USER.id);
  t('business username derived, not empty', typeof business.username === 'string' && business.username.length >= 2);
}

{
  // concurrent-ensure race: first insert hits unique_violation -> retry wins
  const client = makeClient();
  client.failNext = { on: 'insert', error: uniqueViolation() };
  const out = await ensureProfiles({ id: 'user-9', email: 'nova@example.com', user_metadata: {} }, client);
  t('ensure survives insert race (retry)', !!(out.personal && out.business));
  const rows = client.tables.user_profiles.filter((r) => r.user_id === 'user-9');
  t('exactly one row per type after race', rows.length === 2);
  t('usernames distinct after race retry', rows[0].username !== rows[1].username);
}

// ---------------------------------------------------------------------------
// 5. Source-level regression guards on the edit page + route wiring.
// ---------------------------------------------------------------------------
const editPageUrl = new URL('../app/u/[username]/edit/page.jsx', import.meta.url);
const editSrc = readFileSync(editPageUrl, 'utf8');
const routeSrc = readFileSync(new URL('../app/api/profiles/me/route.js', import.meta.url), 'utf8');

{
  // handleMedia must not setCoverKind() before the PATCH confirms.
  const start = editSrc.indexOf('async function handleMedia');
  const end = editSrc.indexOf('async function addArt', start);
  const fn = editSrc.slice(start, end === -1 ? undefined : end);
  const throwAt = fn.indexOf("if (!res.ok) throw");
  const setAt = fn.indexOf('setCoverKind(');
  t('handleMedia source: setCoverKind only after save confirms',
    throwAt !== -1 && setAt !== -1 && setAt > throwAt);
}

{
  // saveProfile must not echo cover_kind (stale tab state could clobber it).
  const start = editSrc.indexOf('async function saveProfile');
  const end = editSrc.indexOf('async function saveBackgroundVideo', start);
  const fn = editSrc.slice(start, end === -1 ? undefined : end);
  const bodyStart = fn.indexOf('JSON.stringify({');
  const bodyEnd = fn.indexOf('}),', bodyStart);
  const payload = fn.slice(bodyStart, bodyEnd);
  t('saveProfile source: details PATCH does not send cover_kind', !/cover_kind/.test(payload));
  t('saveProfile source: details PATCH still sends the edited fields',
    /display_name/.test(payload) && /bio/.test(payload) && /website_urls/.test(payload));
}

{
  t('route PATCH delegates to patchProfile', /patchProfile\s*\(/.test(routeSrc));
  t('route PATCH no longer inlines its own update logic', !/validateProfileUpdate\s*\(/.test(routeSrc));
}

// ---------------------------------------------------------------------------
console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
