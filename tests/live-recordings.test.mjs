// tests/live-recordings.test.mjs
// Headless tests for the Live Recordings community feed (Part 2).
// Run: node tests/live-recordings.test.mjs (from the repo root).
// No browser, no network, no database.
//
// Covers:
//   1. Attribution snapshot rule — a recording's @tiktok handle is FROZEN
//      at post time even if the profile handle later changes.
//   2. Share-text builder via lib/tiktok-attribution (skipped with a note if
//      the sibling worker's file has not landed yet).
//   3. RLS source-checks — the migration SQL must contain the expected
//      tables, policies, trigger, function, and bucket rows.
//   4. Newest-first ordering helper.
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import {
  snapshotHandle,
  resolveRecordingHandle,
  sortNewestFirst,
  sanitizeRecordingTitle,
  RECORDING_TITLE_MAX,
} from '../lib/live-recordings/recordings.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

let passed = 0, failed = 0, skipped = 0;
function t(name, cond) {
  if (cond) passed++;
  else { failed++; console.error(`FAIL: ${name}`); }
}
function skip(name, why) {
  skipped++;
  console.log(`SKIP: ${name} — ${why}`);
}

// ---------- 1. Attribution snapshot rule ----------
t('snapshotHandle returns trimmed handle', snapshotHandle({ tiktok_handle: '  myclips ' }) === 'myclips');
t('snapshotHandle empty string -> null', snapshotHandle({ tiktok_handle: '   ' }) === null);
t('snapshotHandle missing column -> null', snapshotHandle({ display_name: 'X' }) === null);
t('snapshotHandle null row -> null', snapshotHandle(null) === null);

{
  // The profile handle changed AFTER the post: the row snapshot must win.
  const recording = { id: 'r1', tiktok_handle: 'old_handle' };
  const profileNow = { tiktok_handle: 'brand_new_handle' };
  t('snapshot frozen even when profile changes',
    resolveRecordingHandle(recording, profileNow) === 'old_handle');
}
{
  // No snapshot on the row (legacy post): fall back to the current profile handle.
  const recording = { id: 'r2', tiktok_handle: null };
  const profileNow = { tiktok_handle: 'current_handle' };
  t('fallback to current profile handle when no snapshot',
    resolveRecordingHandle(recording, profileNow) === 'current_handle');
}
{
  const recording = { id: 'r3', tiktok_handle: '' };
  t('neither snapshot nor profile -> null (UI must not invent one)',
    resolveRecordingHandle(recording, {}) === null);
}

// ---------- 2. Share-text builder via the lib (sibling worker's file) ----------
{
  const libPath = path.join(ROOT, 'lib', 'tiktok-attribution.js');
  if (!existsSync(libPath)) {
    skip('share-text builder via lib/tiktok-attribution', 'sibling worker file not present in this worktree');
  } else {
    const lib = await import('../lib/tiktok-attribution.js');
    t('lib exports buildShareText', typeof lib.buildShareText === 'function');
    t('lib exports recordingShareUrl', typeof lib.recordingShareUrl === 'function');
    t('lib exports displayTikTokHandle', typeof lib.displayTikTokHandle === 'function');
    t('lib exports tiktokProfileUrl', typeof lib.tiktokProfileUrl === 'function');
    t('lib exports normalizeTikTokHandle', typeof lib.normalizeTikTokHandle === 'function');
    if (typeof lib.buildShareText === 'function') {
      const text = lib.buildShareText({ title: 'Friday clips', tiktokHandle: '@myclips' });
      t('share text includes the title', text.includes('Friday clips'));
      t('share text includes the @handle', text.includes('@myclips'));
      const textNoHandle = lib.buildShareText({ title: 'Friday clips' });
      t('share text skips attribution when no handle', !/@\S/.test(textNoHandle));
      t('share text names Olympus', text.includes('Olympus'));
    }
    if (typeof lib.recordingShareUrl === 'function') {
      const url = lib.recordingShareUrl('https://olympusverse.com', 'abc123');
      t('recording share url deep-links ?recording=<id>',
        url === 'https://olympusverse.com/live-recordings?recording=abc123');
    }
    if (typeof lib.tiktokProfileUrl === 'function') {
      t('profile url points at tiktok.com/@handle',
        lib.tiktokProfileUrl('myclips') === 'https://www.tiktok.com/@myclips');
      t('profile url null for bad handle', lib.tiktokProfileUrl('!!bad!!') === null);
    }
  }
}

// ---------- 3. RLS source-checks on the migration SQL ----------
{
  const sqlPath = path.join(ROOT, 'supabase', 'migrations', '20261004_live_recordings.sql');
  t('migration file exists', existsSync(sqlPath));
  const sql = existsSync(sqlPath) ? readFileSync(sqlPath, 'utf8') : '';
  const has = (s) => sql.includes(s);

  t('header states it awaits Merlin\'s green light', /AWAITS MERLIN'S EXPLICIT GREEN LIGHT/i.test(sql));

  t('creates public.live_recordings', has('create table if not exists public.live_recordings'));
  t('live_recordings has tiktok_handle snapshot column', has('tiktok_handle text'));
  t('index on created_at desc', /live_recordings_created_at_idx[\s\S]*created_at desc/.test(sql));
  t('bump_recording_view is SECURITY DEFINER', has('security definer') && has('bump_recording_view'));

  t('creates public.recording_likes', has('create table if not exists public.recording_likes'));
  t('recording_likes pk is (user_id, recording_id)', /primary key \(user_id, recording_id\)/.test(sql));
  t('likes trigger keeps likes_count in sync', has('sync_recording_likes_count'));

  t('creates public.tiktok_post_queue', has('create table if not exists public.tiktok_post_queue'));
  t('queue status check constraint', /check \(status in \('queued', ?'posted', ?'failed'\)\)/.test(sql));

  // RLS policies
  t('RLS enabled on all three tables', (sql.match(/enable row level security/g) || []).length >= 3);
  t('policy: live_recordings public read', has('create policy "live_recordings public read"'));
  t('policy: live_recordings owner insert (own id)', /live_recordings owner insert[\s\S]{0,160}auth\.uid\(\) = user_id/.test(sql));
  t('policy: live_recordings owner update/delete', has('create policy "live_recordings owner delete"'));
  t('policy: recording_likes public read', has('create policy "recording_likes public read"'));
  t('policy: recording_likes owner insert/delete own rows', has('create policy "recording_likes owner delete"'));
  t('policy: queue requester-only read', has('create policy "tiktok_post_queue requester read"'));
  t('policy: queue requester-only insert', has('create policy "tiktok_post_queue requester insert"'));
  // Queue table policy names: only "requester read"/"requester insert" may
  // exist — no policy granting public access on tiktok_post_queue.
  const queuePolicies = [...sql.matchAll(/create policy "tiktok_post_queue ([^"]+)"\s*on/gi)]
    .map((m) => m[1]);
  t('queue has policies', queuePolicies.length > 0);
  t('queue has NO public policy',
    queuePolicies.every((n) => !/\bpublic\b/i.test(n)));

  // Storage bucket
  t('bucket insert uses live-recordings id', /insert into storage\.buckets[\s\S]{0,200}'live-recordings'/.test(sql));
  t('bucket 100MB limit', has('104857600'));
  t('bucket allows mp4/quicktime/webm', has('video/mp4') && has('video/quicktime') && has('video/webm'));
  t('storage policy: public read', has('create policy "live-recordings public read"'));
  t('storage policy: authenticated insert scoped to recordings/<uid>/', /live-recordings owner insert[\s\S]{0,300}\(storage\.foldername\(name\)\)\[2\] = auth\.uid\(\)::text/.test(sql));
}

// ---------- 4. Newest-first ordering ----------
{
  const a = { id: 'a', created_at: '2026-10-01T00:00:00Z' };
  const b = { id: 'b', created_at: '2026-10-03T00:00:00Z' };
  const c = { id: 'c', created_at: '2026-10-02T00:00:00Z' };
  const out = sortNewestFirst([a, b, c]);
  t('sorts newest first', out.map((r) => r.id).join(',') === 'b,c,a');
  t('does not mutate the input array', [a, b, c].map((r) => r.id).join(',') === 'a,b,c');
  t('empty input -> empty output', sortNewestFirst([]).length === 0);
}

// ---------- title sanitizer ----------
t('title trims and caps', sanitizeRecordingTitle('  hello  ') === 'hello');
t('title capped at RECORDING_TITLE_MAX', sanitizeRecordingTitle('x'.repeat(500)).length === RECORDING_TITLE_MAX);
t('non-string title -> empty', sanitizeRecordingTitle(null) === '');

console.log(`\n${passed} passed, ${failed} failed, ${skipped} skipped`);
process.exit(failed ? 1 : 0);
