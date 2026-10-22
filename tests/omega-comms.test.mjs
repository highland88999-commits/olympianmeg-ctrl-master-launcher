// tests/omega-comms.test.mjs — Omega Comms (the Communications
// Array ported from Merlin's Communications-Array repo): the pure
// core helpers, plus source pins on the wiring — the page renders
// the panel, the SQL stages (but does not run) the five tables, and
// no external media endpoint survives the port.
// Run: node tests/omega-comms.test.mjs (from the repo root).
import assert from 'node:assert';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  OMEGA_COMMS_REPO_ID,
  COMMS_TABLES,
  COMMS_TABS,
  MAX_MESSAGE_LENGTH,
  sanitizeLabel,
  validateMessageText,
  buildEnvStamp,
  buildMessageRow,
  isConversationMessage,
  deriveContacts,
  unreadMessageIds,
  flattenSquadMemberships,
  usernameMapFromProfiles,
  normalizeUsername,
  isMissingTableError,
  applyRealtimeEvent,
} from '../lib/omega-comms/core.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

let passed = 0;
function check(name, fn) {
  fn();
  passed++;
  console.log('ok -', name);
}

check('namespace + tables + tabs mirror the source feeds', () => {
  assert.equal(OMEGA_COMMS_REPO_ID, 'olympus');
  assert.deepEqual(COMMS_TABLES, {
    global: 'global_chat',
    p2p: 'p2p_chat',
    squads: 'squads',
    squadMembers: 'squad_members',
    squadChat: 'squad_chat',
  });
  assert.deepEqual(COMMS_TABS.map((t) => t.id), ['global', 'p2p', 'squads']);
  assert.deepEqual(COMMS_TABS.map((t) => t.label), ['GLOBAL', 'DIRECT', 'SQUAD']);
});

check('validateMessageText trims, rejects empty and over-long', () => {
  assert.deepEqual(validateMessageText('  hello  '), { ok: true, text: 'hello' });
  assert.equal(validateMessageText('   ').ok, false);
  assert.equal(validateMessageText('').ok, false);
  assert.equal(validateMessageText(null).ok, false);
  assert.equal(validateMessageText('x'.repeat(MAX_MESSAGE_LENGTH)).ok, true);
  assert.deepEqual(validateMessageText('x'.repeat(MAX_MESSAGE_LENGTH + 1)), { ok: false, reason: 'too-long' });
});

check('sanitizeLabel strips control characters and caps length', () => {
  assert.equal(sanitizeLabel('  ab\ncd\u0007  '), 'abcd');
  assert.equal(sanitizeLabel('y'.repeat(100), 10).length, 10);
  assert.equal(sanitizeLabel(null), '');
});

check('buildEnvStamp sanitizes and falls back to Olympus identity', () => {
  assert.deepEqual(buildEnvStamp({ title: 'Omega Comms', hostname: 'olympusverse.com' }), {
    app_name: 'Omega Comms',
    origin_url: 'olympusverse.com',
  });
  assert.deepEqual(buildEnvStamp({}), { app_name: 'Olympus', origin_url: 'olympusverse.com' });
  assert.equal(buildEnvStamp({ title: 'bad\ntitle', hostname: '' }).app_name, 'badtitle');
});

check('buildMessageRow carries the envelope; invalid input yields null', () => {
  const row = buildMessageRow({
    senderId: 'u1',
    receiverId: 'u2',
    text: ' hi ',
    env: { app_name: 'Olympus', origin_url: 'olympusverse.com' },
  });
  assert.deepEqual(row, {
    repo_id: 'olympus',
    sender_id: 'u1',
    receiver_id: 'u2',
    message: 'hi',
    app_name: 'Olympus',
    origin_url: 'olympusverse.com',
  });
  assert.equal(buildMessageRow({ senderId: 'u1', text: '  ' }), null);
  assert.equal(buildMessageRow({ text: 'hi' }), null);
  const squadRow = buildMessageRow({ senderId: 'u1', squadId: 's1', text: 'yo' });
  assert.equal(squadRow.squad_id, 's1');
  assert.equal('receiver_id' in squadRow, false);
});

check('isConversationMessage matches both directions only', () => {
  const rec = { sender_id: 'a', receiver_id: 'b' };
  assert.equal(isConversationMessage(rec, 'a', 'b'), true);
  assert.equal(isConversationMessage(rec, 'b', 'a'), true);
  assert.equal(isConversationMessage(rec, 'a', 'c'), false);
  assert.equal(isConversationMessage(null, 'a', 'b'), false);
  assert.equal(isConversationMessage({ sender_id: 'a' }, 'a', 'b'), false);
});

check('deriveContacts: unique other parties, newest conversation first', () => {
  const rows = [
    { sender_id: 'me', receiver_id: 'x' },
    { sender_id: 'y', receiver_id: 'me' },
    { sender_id: 'x', receiver_id: 'me' },
    { sender_id: 'me', receiver_id: 'me' },
    { sender_id: 'z', receiver_id: 'me' },
  ];
  assert.deepEqual(deriveContacts(rows, 'me'), [{ id: 'x' }, { id: 'y' }, { id: 'z' }]);
  assert.deepEqual(deriveContacts([], 'me'), []);
  assert.deepEqual(deriveContacts(null, 'me'), []);
});

check('unreadMessageIds picks only incoming unread rows', () => {
  const rows = [
    { id: '1', receiver_id: 'me', read_at: null },
    { id: '2', receiver_id: 'me', read_at: '2026-01-01T00:00:00Z' },
    { id: '3', receiver_id: 'other', read_at: null },
    { id: '4', sender_id: 'me', receiver_id: 'other', read_at: null },
  ];
  assert.deepEqual(unreadMessageIds(rows, 'me'), ['1']);
});

check('flattenSquadMemberships flattens joins and drops junk', () => {
  const rows = [
    { squad_id: 's1', squads: { id: 's1', name: 'Alpha', leader_id: 'me', repo_id: 'olympus' } },
    { squad_id: 's1', squads: { id: 's1', name: 'Alpha', leader_id: 'me', repo_id: 'olympus' } },
    { squad_id: 's2', squads: null },
    { squad_id: 's3' },
    { squad_id: 's4', squads: { id: 's4' } },
  ];
  const out = flattenSquadMemberships(rows);
  assert.equal(out.length, 2);
  assert.equal(out[0].name, 'Alpha');
  assert.equal(out[1].name, 'Unnamed squad');
});

check('usernameMapFromProfiles prefers the personal profile', () => {
  const map = usernameMapFromProfiles([
    { user_id: 'u1', username: 'merlin-biz', type: 'business' },
    { user_id: 'u1', username: 'merlin', type: 'personal' },
    { user_id: 'u2', username: 'bob', type: 'personal' },
    { user_id: 'u3', username: '', type: 'personal' },
    null,
  ]);
  assert.equal(map.get('u1'), 'merlin');
  assert.equal(map.get('u2'), 'bob');
  assert.equal(map.has('u3'), false);
});

check('normalizeUsername trims or nulls', () => {
  assert.equal(normalizeUsername('  merlin '), 'merlin');
  assert.equal(normalizeUsername('   '), null);
  assert.equal(normalizeUsername(''), null);
});

check('isMissingTableError recognizes PostgREST + Postgres signals', () => {
  assert.equal(isMissingTableError({ code: 'PGRST205' }), true);
  assert.equal(isMissingTableError({ code: '42P01' }), true);
  assert.equal(isMissingTableError({ message: 'relation "public.global_chat" does not exist' }), true);
  assert.equal(isMissingTableError({ code: '23505', message: 'duplicate key' }), false);
  assert.equal(isMissingTableError(null), false);
  assert.equal(isMissingTableError({}), false);
});

check('applyRealtimeEvent folds insert/update/delete with dedupe', () => {
  const base = [{ id: '1', message: 'a' }];
  const inserted = applyRealtimeEvent(base, { eventType: 'INSERT', new: { id: '2', message: 'b' } });
  assert.deepEqual(inserted.map((m) => m.id), ['1', '2']);
  const dup = applyRealtimeEvent(inserted, { eventType: 'INSERT', new: { id: '2', message: 'b' } });
  assert.equal(dup.length, 2);
  const updated = applyRealtimeEvent(inserted, { eventType: 'UPDATE', new: { id: '1', message: 'a2', read_at: 't' } });
  assert.equal(updated[0].message, 'a2');
  const deleted = applyRealtimeEvent(updated, { eventType: 'DELETE', old: { id: '1' } });
  assert.deepEqual(deleted.map((m) => m.id), ['2']);
  assert.equal(applyRealtimeEvent(base, null), base);
});

// ---- Source pins on the wiring -------------------------------------------

check('page wires the panel with the Olympus session identity', () => {
  const page = readFileSync(join(root, 'app/omega-comms/page.jsx'), 'utf8');
  assert.ok(page.includes('OmegaCommsPanel'), 'page renders the panel');
  assert.ok(page.includes('OMEGA_COMMS_REPO_ID'), 'page passes the olympus namespace');
  assert.ok(page.includes('.getSession()') && page.includes('onAuthStateChange'), 'identity comes from the Olympus session');
  assert.ok(!page.includes('Merlin_Root'), 'the source mock user is gone');
  assert.ok(!page.includes('00000000-0000-0000'), 'no zero-uuid identity remains');
});

check('no external media or tracker endpoints survive the port', () => {
  const files = [
    'app/omega-comms/page.jsx',
    'components/omega-comms/OmegaCommsPanel.jsx',
    'components/omega-comms/GlobalChatFeed.jsx',
    'components/omega-comms/P2PChatFeed.jsx',
    'components/omega-comms/SquadChatFeed.jsx',
    'components/omega-comms/useUsernames.js',
    'components/omega-comms/omega-comms.css',
    'lib/omega-comms/core.js',
  ];
  for (const rel of files) {
    const text = readFileSync(join(root, rel), 'utf8');
    assert.ok(!text.includes('catbox'), `${rel} must not reference catbox`);
    assert.ok(!/files\.catbox\.moe|google-analytics|gtag\(|plausible|posthog|mixpanel/.test(text), `${rel} carries no tracker`);
  }
});

check('SQL stages the five tables, RLS and realtime — marked NOT RUN', () => {
  assert.ok(existsSync(join(root, 'supabase/omega-comms.sql')));
  const sql = readFileSync(join(root, 'supabase/omega-comms.sql'), 'utf8');
  assert.ok(sql.includes('NOT RUN'), 'SQL is explicitly staged, not executed');
  for (const table of ['global_chat', 'p2p_chat', 'squads', 'squad_members', 'squad_chat']) {
    assert.ok(sql.includes(`public.${table}`), `SQL creates ${table}`);
  }
  assert.ok(sql.includes('enable row level security'));
  assert.ok(sql.includes('supabase_realtime'), 'chat tables join the realtime publication');
});

console.log(`\n${passed} checks passed`);
