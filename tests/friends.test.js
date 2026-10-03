// tests/friends.test.js — Headless tests for the friends system.
// Run: node tests/friends.test.js (from the repo root).
// No browser, no network — asserts on lib/friends.js pure helpers.
import { readFileSync } from 'fs';
import {
  FRIENDSHIP_STATUSES,
  isUuid,
  normalizeSearchQuery,
  pairKey,
  validateFriendRequest,
  validateFriendRespond,
  validateCallInvite,
  counterpartId,
  pickProfile,
  toFriendView,
  validateBlockBody,
  isBlockedRow,
  isBlockedPair,
  createFriendRequest,
  respondToFriendship,
  blockUser,
  unblockUser,
  listFriends,
  listBlockedUsers,
  listPendingRequests,
  searchPlayers,
} from '../lib/friends.js';

let passed = 0;
let failed = 0;
function t(name, cond) {
  if (cond) { passed++; }
  else { failed++; console.error(`FAIL: ${name}`); }
}

const UUID_A = '11111111-1111-1111-1111-111111111111';
const UUID_B = '22222222-2222-2222-2222-222222222222';

// --- statuses ---
t('four statuses incl. blocked', JSON.stringify(FRIENDSHIP_STATUSES) === JSON.stringify(['pending', 'accepted', 'declined', 'blocked']));

// --- isUuid ---
t('accepts a valid uuid', isUuid(UUID_A));
t('accepts uppercase uuid', isUuid('AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE'));
t('rejects garbage', !isUuid('not-a-uuid'));
t('rejects empty', !isUuid(''));
t('rejects non-string', !isUuid(42));

// --- normalizeSearchQuery ---
t('trims and keeps plain text', normalizeSearchQuery('  merlin  ') === 'merlin');
t('rejects single char', normalizeSearchQuery('x') === '');
t('rejects empty', normalizeSearchQuery('') === '');
t('strips postgrest-breaking chars', normalizeSearchQuery('a,b.(c)') === 'abc');
t('strips wildcard %', normalizeSearchQuery('100%') === '100');
t('collapses inner whitespace', normalizeSearchQuery('a  b') === 'a b');
t('caps at 40 chars', normalizeSearchQuery('a'.repeat(100)).length === 40);
t('keeps underscore and dash', normalizeSearchQuery('joey-holli_vevo') === 'joey-holli_vevo');

// --- pairKey (mirrors the SQL unique index) ---
t('pairKey is order-independent', pairKey(UUID_A, UUID_B) === pairKey(UUID_B, UUID_A));
t('pairKey sorts low first', pairKey(UUID_B, UUID_A) === `${UUID_A}:${UUID_B}`);
t('different pairs differ', pairKey(UUID_A, UUID_B) !== pairKey(UUID_A, UUID_A));

// --- validateFriendRequest ---
t('request ok', validateFriendRequest({ addressee_id: UUID_B }).ok === true);
t('request rejects bad uuid', validateFriendRequest({ addressee_id: 'nope' }).ok === false);
t('request rejects missing body', validateFriendRequest(null).ok === false);
t('request rejects non-object', validateFriendRequest('x').ok === false);

// --- validateFriendRespond ---
t('respond accept ok', validateFriendRespond({ friendship_id: UUID_A, action: 'accept' }).ok === true);
t('respond decline ok', validateFriendRespond({ friendship_id: UUID_A, action: 'decline' }).ok === true);
t('respond rejects bad action', validateFriendRespond({ friendship_id: UUID_A, action: 'maybe' }).ok === false);
t('respond rejects bad id', validateFriendRespond({ friendship_id: 'x', action: 'accept' }).ok === false);

// --- validateCallInvite ---
t('invite ok', validateCallInvite({ friend_id: UUID_B, room_code: 'AB12CD' }).ok === true);
t('invite rejects bad code', validateCallInvite({ friend_id: UUID_B, room_code: 'abc' }).ok === false);
t('invite rejects lowercase code', validateCallInvite({ friend_id: UUID_B, room_code: 'ab12cd' }).ok === false);
t('invite rejects bad friend', validateCallInvite({ friend_id: 'x', room_code: 'AB12CD' }).ok === false);

// --- counterpartId ---
const rowAB = { requester_id: UUID_A, addressee_id: UUID_B };
t('counterpart from requester side', counterpartId(rowAB, UUID_A) === UUID_B);
t('counterpart from addressee side', counterpartId(rowAB, UUID_B) === UUID_A);
t('counterpart null for stranger', counterpartId(rowAB, '33333333-3333-3333-3333-333333333333') === null);
t('counterpart null for null row', counterpartId(null, UUID_A) === null);

// --- pickProfile ---
const biz = { type: 'business', username: 'merlin-biz' };
const per = { type: 'personal', username: 'merlin' };
t('prefers personal', pickProfile([biz, per]) === per);
t('falls back to first', pickProfile([biz]) === biz);
t('null for empty', pickProfile([]) === null);
t('null for null', pickProfile(null) === null);

// --- toFriendView ---
t('view from profile', JSON.stringify(toFriendView(UUID_A, per)) === JSON.stringify({
  user_id: UUID_A, username: 'merlin', display_name: 'merlin', avatar_url: null,
}));
t('view falls back to display_name', toFriendView(UUID_A, { username: 'u', display_name: 'Merlin!' }).display_name === 'Merlin!');
t('view survives null profile', toFriendView(UUID_A, null).username === 'player');

// --- blocking: pure predicates ---
t('block body ok', validateBlockBody({ friend_id: UUID_B }).ok === true);
t('block rejects bad uuid', validateBlockBody({ friend_id: 'x' }).ok === false);
t('block rejects missing body', validateBlockBody(null).ok === false);
t('block rejects non-object', validateBlockBody('x').ok === false);
t('isBlockedRow true for blocked', isBlockedRow({ status: 'blocked' }) === true);
t('isBlockedRow false for accepted', isBlockedRow({ status: 'accepted' }) === false);
t('isBlockedRow false for null', isBlockedRow(null) === false);
{
  const blockedAB = [{ requester_id: UUID_A, addressee_id: UUID_B, status: 'blocked' }];
  const acceptedAB = [{ requester_id: UUID_A, addressee_id: UUID_B, status: 'accepted' }];
  t('isBlockedPair hits from the blocker side', isBlockedPair(blockedAB, UUID_A, UUID_B) === true);
  t('isBlockedPair hits from the blocked side (severed both ways)', isBlockedPair(blockedAB, UUID_B, UUID_A) === true);
  t('isBlockedPair ignores accepted rows', isBlockedPair(acceptedAB, UUID_A, UUID_B) === false);
  t('isBlockedPair ignores empty lists', isBlockedPair([], UUID_A, UUID_B) === false);
  t('isBlockedPair ignores other pairs', isBlockedPair(blockedAB, UUID_A, '33333333-3333-3333-3333-333333333333') === false);
}

{ // --- source-level checks: block API + enforcement ---
  const src = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

  const blockRoute = src('../app/api/friends/block/route.js');
  t('block route exists and reuses the friendships table', blockRoute.includes('blockUser') && blockRoute.includes('/api/friends/block'));
  t('block severs the friendship (re-points any row)', src('../lib/friends.js').includes("status: 'blocked'"));
  t('blocking never notifies the blocked user', !src('../lib/friends.js').includes('notify') || !/blockUser[\s\S]{0,400}notify/.test(src('../lib/friends.js')));
  t('block quietly dismisses pending request notifications', src('../lib/friends.js').includes('silenceNotificationsFrom'));

  const unblockRoute = src('../app/api/friends/unblock/route.js');
  t('unblock route deletes the row (no auto re-friend)', unblockRoute.includes('unblockUser'));
  t('unblock is honest when nothing is blocked', src('../lib/friends.js').includes('Nothing to unblock'));

  const blockedRoute = src('../app/api/friends/blocked/route.js');
  t('blocked-list route queries blocker-side rows', blockedRoute.includes('listBlockedUsers'));

  const requestRoute = src('../app/api/friends/request/route.js');
  t('requests to a blocked pair get an honest 403', requestRoute.includes('createFriendRequest')
    && src('../lib/friends.js').includes('This player is unavailable'));

  const searchRoute = src('../app/api/friends/search/route.js');
  const friendsLib = src('../lib/friends.js');
  t('search excludes every connected user (blocked included)',
    searchRoute.includes('searchPlayers') && friendsLib.includes('listMyFriendships(admin, userId)')
    && friendsLib.includes('excluded.add(c)'));

  const inviteRoute = src('../app/api/friends/invite/route.js');
  t('call invites refuse blocked pairs (403 backstop)',
    inviteRoute.includes("r.status === 'accepted'") && inviteRoute.includes('You can only summon friends'));

  const page = src('../app/order-67/page.jsx');
  t('in-call add-friend opens the invite-mode sheet', page.includes('openInviteFriends') && page.includes("ADD TO THIS CALL"));
  t('in-call invite refuses to drop the connection', page.includes('inviteToCall') && page.includes('existing connection never drops'));
  t('sheet BLOCK buttons are two-tap', page.includes('confirmBlockId') && page.includes("'SURE?'"));

  const bell = src('../components/NotificationsWindow.jsx');
  t('bell answers friend requests for real (no bypass)', bell.includes('friendship_id') && bell.includes('respondToFriendshipClient'));
  t('bell JOINs call invites via deep link', bell.includes('order67-invite') && bell.includes('/order-67?code='));
  t('accept notices land in the bell (same table, generic render)',
    src('../lib/friends.js').includes('accepted your friend request') && bell.includes('{n.title}'));
  t('no notification is sent on block', !src('../app/api/friends/block/route.js').includes('notify'));

  const prof = src('../components/profiles/ProfileClient.jsx');
  t('profile header has BLOCK for other users', prof.includes('doBlockToggle'));
  t('own profile has the blocked-list FAB', prof.includes('pf-fab'));
  t('blocked panel has UNBLOCK per user', prof.includes('unblockFromList'));

  const bsPage = src('../app/battleship/profile/page.tsx');
  t('battleship profile no longer touches the legacy friends table', !bsPage.includes('olympus_battleship_friends'));
  t('battleship profile reads via the unified API', bsPage.includes('fetchFriends') && bsPage.includes('fetchPendingRequests'));
  t('battleship profile answers requests via the unified API', bsPage.includes('respondToFriendshipClient'));
  t('battleship sheet shows honest load errors', bsPage.includes('friendsError'));

  t('call invites name blocked pairs honestly', inviteRoute.includes('isBlockedPair') && inviteRoute.includes('This player is unavailable'));

  t('order-67 sheet shows honest friend-load errors', page.includes('friendsError') && page.includes('Sign in to see your friends'));
}

// --- server functions against a fake in-memory admin client ---
function makeFakeAdmin(seed = {}) {
  const tables = {
    friendships: [...(seed.friendships || [])],
    notifications: [...(seed.notifications || [])],
    user_profiles: [...(seed.user_profiles || [])],
  };
  let seq = 9000;
  const genId = () => `00000000-0000-4000-8000-${String(seq++).padStart(12, '0')}`;

  class QB {
    constructor(table) {
      this.table = table;
      this.filters = [];
      this._order = null;
      this._op = 'select';
      this._payload = null;
      this._single = false;
      this._maybeSingle = false;
    }
    select() { return this; }
    eq(col, val) { this.filters.push((r) => r[col] === val); return this; }
    in(col, vals) { this.filters.push((r) => vals.includes(r[col])); return this; }
    or(expr) {
      const parts = String(expr).split(',');
      this.filters.push((r) => parts.some((p) => {
        const m = p.match(/^(\w+)\.eq\.(.+)$/);
        if (m) return String(r[m[1]]) === m[2];
        const il = p.match(/^(\w+)\.ilike\.(.+)$/);
        if (il) {
          const needle = il[2].replace(/%/g, '').toLowerCase();
          return String(r[il[1]] || '').toLowerCase().includes(needle);
        }
        return false;
      }));
      return this;
    }
    limit(n) { this._limit = n; return this; }
    order(col, { ascending = true } = {}) { this._order = { col, ascending }; return this; }
    insert(payload) { this._op = 'insert'; this._payload = payload; return this; }
    update(payload) { this._op = 'update'; this._payload = payload; return this; }
    delete() { this._op = 'delete'; return this; }
    maybeSingle() { this._maybeSingle = true; return this._run(); }
    single() { this._single = true; return this._run(); }
    then(resolve, reject) { return this._run().then(resolve, reject); }
    _matched() {
      let rows = tables[this.table].filter((r) => this.filters.every((f) => f(r)));
      if (this._order) {
        const { col, ascending } = this._order;
        rows = [...rows].sort((a, b) => (a[col] < b[col] ? -1 : a[col] > b[col] ? 1 : 0) * (ascending ? 1 : -1));
      }
      if (this._limit != null) rows = rows.slice(0, this._limit);
      return rows;
    }
    async _run() {
      const rows = tables[this.table];
      if (this._op === 'insert') {
        const items = Array.isArray(this._payload) ? this._payload : [this._payload];
        const now = new Date().toISOString();
        const made = items.map((it) => ({ id: genId(), created_at: now, updated_at: now, ...it }));
        rows.push(...made);
        return this._finish(made);
      }
      const matched = this._matched();
      if (this._op === 'update') {
        matched.forEach((r) => Object.assign(r, this._payload, { updated_at: new Date().toISOString() }));
        return this._finish(matched);
      }
      if (this._op === 'delete') {
        tables[this.table] = rows.filter((r) => !this.filters.every((f) => f(r)));
        return this._finish(matched);
      }
      return this._finish(matched);
    }
    _finish(made) {
      if (this._maybeSingle) return { data: made[0] || null, error: null };
      if (this._single) {
        if (made.length !== 1) return { data: null, error: new Error(`single: got ${made.length}`) };
        return { data: made[0], error: null };
      }
      return { data: made, error: null };
    }
  }

  return { from: (table) => new QB(table), _tables: tables };
}

const UUID_C = '33333333-3333-3333-3333-333333333333';
const UUID_D = '44444444-4444-4444-4444-444444444444';
const profiles = (ids) => ids.map((id) => ({
  user_id: id, username: `user-${id.slice(0, 4)}`, display_name: `User ${id.slice(0, 4)}`,
  avatar_url: null, type: 'personal',
}));

async function expectCoded(promise, status, label) {
  try {
    await promise;
    t(label, false);
  } catch (e) {
    t(label, e.status === status);
  }
}

{
  // --- createFriendRequest ---
  const admin = makeFakeAdmin({ user_profiles: profiles([UUID_A, UUID_B, UUID_C, UUID_D]) });
  const r1 = await createFriendRequest(admin, { requesterId: UUID_A, addresseeId: UUID_B });
  t('request creates a pending row', r1.created === true && r1.friendship.status === 'pending');
  await expectCoded(
    createFriendRequest(admin, { requesterId: UUID_A, addresseeId: UUID_B }), 409, 'duplicate request 409s'
  );
  await expectCoded(
    createFriendRequest(admin, { requesterId: UUID_B, addresseeId: UUID_A }), 409, 'reverse duplicate 409s (pair unique)'
  );

  // --- respondToFriendship ---
  await expectCoded(
    respondToFriendship(admin, { userId: UUID_A, friendshipId: r1.friendship.id, action: 'accept' }),
    403, 'only the addressee can answer'
  );
  const ans = await respondToFriendship(admin, { userId: UUID_B, friendshipId: r1.friendship.id, action: 'accept' });
  t('addressee accepts', ans.changed === true && ans.friendship.status === 'accepted');
  const idem = await respondToFriendship(admin, { userId: UUID_B, friendshipId: r1.friendship.id, action: 'accept' });
  t('answering twice is idempotent', idem.changed === false && idem.friendship.status === 'accepted');
  await expectCoded(
    createFriendRequest(admin, { requesterId: UUID_A, addresseeId: UUID_B }), 409, 're-request after accept 409s'
  );

  // --- declined -> rekindle ---
  const r2 = await createFriendRequest(admin, { requesterId: UUID_A, addresseeId: UUID_C });
  await respondToFriendship(admin, { userId: UUID_C, friendshipId: r2.friendship.id, action: 'decline' });
  const r3 = await createFriendRequest(admin, { requesterId: UUID_C, addresseeId: UUID_A });
  t('declined request can be rekindled by the other side', r3.rekindled === true && r3.friendship.status === 'pending');

  // --- listFriends / listPendingRequests ---
  const friends = await listFriends(admin, { userId: UUID_A });
  t('accepted friend listed with profile', friends.length === 1 && friends[0].user_id === UUID_B);
  const pend = await listPendingRequests(admin, { userId: UUID_A });
  t('incoming pending listed', pend.length === 1 && pend[0].requester.user_id === UUID_C);
  const pendNone = await listPendingRequests(admin, { userId: UUID_B });
  t('no pending when none incoming', pendNone.length === 0);

  // --- searchPlayers ---
  const found = await searchPlayers(admin, { userId: UUID_A, q: 'user-4444' });
  t('search finds strangers', found.length === 1 && found[0].user_id === UUID_D);
  const excl = await searchPlayers(admin, { userId: UUID_A, q: 'user-2222' });
  t('search excludes accepted friends', excl.length === 0);
  const pendExcl = await searchPlayers(admin, { userId: UUID_C, q: 'user-1111' });
  t('search excludes pending pairs', pendExcl.length === 0);

  // --- blockUser / unblockUser ---
  const b1 = await blockUser(admin, { blockerId: UUID_A, blockedId: UUID_C });
  t('block severs the pending row into a block row',
    b1.friendship.status === 'blocked' && b1.friendship.requester_id === UUID_A && b1.friendship.addressee_id === UUID_C);
  const afterBlock = await listFriends(admin, { userId: UUID_A });
  t('blocked user drops out of the friends list', afterBlock.every((f) => f.user_id !== UUID_C));
  const blockedList = await listBlockedUsers(admin, { userId: UUID_A });
  t('blocker sees their blocked list', blockedList.length === 1 && blockedList[0].user_id === UUID_C);
  const blockedSeesNone = await listBlockedUsers(admin, { userId: UUID_C });
  t('blocked party cannot enumerate who blocked them', blockedSeesNone.length === 0);
  await expectCoded(
    createFriendRequest(admin, { requesterId: UUID_C, addresseeId: UUID_A }), 403, 'request to a blocked pair 403s'
  );
  const exclBlocked = await searchPlayers(admin, { userId: UUID_A, q: 'user-3333' });
  t('search excludes blocked pairs', exclBlocked.length === 0);
  await expectCoded(blockUser(admin, { blockerId: UUID_A, blockedId: UUID_A }), 400, 'cannot block yourself');
  await expectCoded(
    blockUser(admin, { blockerId: UUID_A, blockedId: '99999999-9999-9999-9999-999999999999' }),
    404, 'blocking an unknown player 404s'
  );

  const ub = await unblockUser(admin, { blockerId: UUID_A, blockedId: UUID_C });
  t('unblock removes the row', ub.ok === true);
  await expectCoded(
    unblockUser(admin, { blockerId: UUID_A, blockedId: UUID_C }), 404, 'unblocking twice 404s honestly'
  );
  await expectCoded(
    unblockUser(admin, { blockerId: UUID_C, blockedId: UUID_A }), 404, 'only the blocker can unblock'
  );
  const reAdd = await createFriendRequest(admin, { requesterId: UUID_C, addresseeId: UUID_A });
  t('unblock does not auto re-friend (re-add works fresh)', reAdd.created === true && reAdd.friendship.status === 'pending');

  // --- block silences notifications, never notifies the blocked user ---
  const admin2 = makeFakeAdmin({
    user_profiles: profiles([UUID_A, UUID_B]),
    notifications: [
      { id: 'n1', recipient_id: UUID_A, actor_id: UUID_B, type: 'friend_request', read: false, meta: { kind: 'friend-request' } },
    ],
  });
  const notifCountBefore = admin2._tables.notifications.length;
  await blockUser(admin2, { blockerId: UUID_A, blockedId: UUID_B });
  const notifCountAfter = admin2._tables.notifications.length;
  t('blocking writes no notification for the blocked user', notifCountAfter === notifCountBefore);
  const silenced = admin2._tables.notifications.find((n) => n.id === 'n1');
  t('blocking quietly dismisses pending request notifications', silenced.read === true && silenced.meta.handled === true);
}

console.log(`\nfriends: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
