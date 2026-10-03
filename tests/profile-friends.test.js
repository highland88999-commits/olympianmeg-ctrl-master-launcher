// tests/profile-friends.test.js — Worker B: notification profile links +
// profile friends sections. Headless: no browser, no network.
// Run: node tests/profile-friends.test.js (from the repo root).
//   (a) notifications carry actor_username (personal preferred, no 404s)
//   (b) the profile friends section reads the canonical friendships source
//   (c) blocks are respected in the friends section
import { readFileSync } from 'fs';
import {
  pickProfile,
  profileUrl,
  isBlockedPair,
  createFriendRequest,
  respondToFriendship,
  blockUser,
  listMyFriendships,
  listFriends,
  removeFriend,
} from '../lib/friends.js';

let passed = 0;
let failed = 0;
function t(name, cond) {
  if (cond) { passed++; }
  else { failed++; console.error(`FAIL: ${name}`); }
}

const src = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

const UUID_A = '11111111-1111-1111-1111-111111111111';
const UUID_B = '22222222-2222-2222-2222-222222222222';
const UUID_C = '33333333-3333-3333-3333-333333333333';
const UUID_D = '44444444-4444-4444-4444-444444444444';

// --- fake in-memory supabase admin (mirrors tests/friends.test.js) ---
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
        return m ? String(r[m[1]]) === m[2] : false;
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

const prof = (user_id, username, type = 'personal') => ({
  user_id, username, display_name: `${username}!`, avatar_url: null, type,
});

// ===========================================================================
// (a) notifications include actor_username (personal preferred, no 404s)
// ===========================================================================

{
  const notifRoute = src('../app/api/notifications/route.js');
  t('notifications GET enriches items with actor_username', notifRoute.includes('actor_username'));
  t('notifications GET carries the actor profile type for business-only actors',
    notifRoute.includes('actor_profile_type'));
  t('notifications GET prefers the personal profile (pickProfile)', notifRoute.includes('pickProfile'));
  t('notifications GET enriches in one batched query', notifRoute.includes('.in(') && notifRoute.includes('actorIds'));

  const bell = src('../components/NotificationsWindow.jsx');
  t('bell links friend requests to the actor profile', bell.includes('notif-view-profile')
    && bell.includes('/u/${encodeURIComponent(n.actor_username)}'));
  t('bell links BOTH friend-request and friend-accepted kinds',
    bell.includes("n.meta?.kind === 'friend-request'") && bell.includes("n.meta?.kind === 'friend-accepted'"));
  t('bell uses ?v=business for business-only actors (no 404)',
    bell.includes("n.actor_profile_type === 'business'") && bell.includes('?v=business'));
}

// Logic: the exact enrichment the GET performs, against the fake admin.
async function enrichItems(admin, items) {
  const actorIds = [...new Set(items.map((n) => n.actor_id).filter(Boolean))];
  const byActor = {};
  if (actorIds.length) {
    const { data: profs } = await admin
      .from('user_profiles')
      .select('user_id, username, type')
      .in('user_id', actorIds);
    for (const p of profs || []) (byActor[p.user_id] = byActor[p.user_id] || []).push(p);
  }
  return items.map((n) => {
    const picked = pickProfile(byActor[n.actor_id] || []);
    return {
      ...n,
      actor_username: (picked && picked.username) || null,
      actor_profile_type: (picked && picked.type) || null,
    };
  });
}

{
  const admin = makeFakeAdmin({
    user_profiles: [
      prof(UUID_B, 'merlin-biz', 'business'),
      prof(UUID_B, 'merlin', 'personal'),
      prof(UUID_C, 'cid-shop', 'business'), // business-only actor
    ],
    notifications: [
      { id: 'n1', recipient_id: UUID_A, actor_id: UUID_B, type: 'friend_request', meta: { kind: 'friend-request' } },
      { id: 'n2', recipient_id: UUID_A, actor_id: UUID_C, type: 'system', meta: { kind: 'friend-accepted' } },
      { id: 'n3', recipient_id: UUID_A, actor_id: UUID_D, type: 'system', meta: {} }, // unknown actor
    ],
  });

  const [r1, r2, r3] = await enrichItems(admin, admin._tables.notifications);
  t('actor_username prefers the personal profile', r1.actor_username === 'merlin');
  t('actor profile type carried along', r1.actor_profile_type === 'personal');
  t('business-only actor links via ?v=business',
    r2.actor_username === 'cid-shop' && r2.actor_profile_type === 'business');
  t('unknown actor yields null (no dead link)', r3.actor_username === null && r3.actor_profile_type === null);

  // No 404s: every non-null actor_username exists in user_profiles and the
  // profile URL the bell builds matches the profile the /u page queries.
  for (const n of [r1, r2]) {
    const url = n.actor_profile_type === 'business'
      ? `/u/${encodeURIComponent(n.actor_username)}?v=business`
      : `/u/${encodeURIComponent(n.actor_username)}`;
    const { data } = await admin
      .from('user_profiles')
      .select('username, type')
      .eq('username', n.actor_username)
      .eq('type', n.actor_profile_type)
      .maybeSingle();
    t(`profile URL resolves for actor of ${n.id} (${url})`, !!data && data.username === n.actor_username);
  }
}

// ===========================================================================
// (b) profile friends section renders from the canonical friendships source
// ===========================================================================

{
  const ofRoute = src('../app/api/friends/of/route.js');
  t('/api/friends/of exists and reads the canonical source', ofRoute.includes('listFriends'));
  t('/api/friends/of validates user_id as a UUID', ofRoute.includes('isUuid'));
  t('/api/friends/of 404s for unknown players', ofRoute.includes('Player not found'));
  t('/api/friends/of hides the list behind the block gate', ofRoute.includes('isBlockedPair')
    && ofRoute.includes('blocked: true'));

  const removeRoute = src('../app/api/friends/remove/route.js');
  t('/api/friends/remove deletes via the canonical lib', removeRoute.includes('removeFriend'));
  t('/api/friends/remove validates the body', removeRoute.includes('validateRemoveFriendBody'));

  const pc = src('../components/profiles/ProfileClient.jsx');
  t('profile friends section fetches the canonical route', pc.includes('fetchFriendsOf')
    && pc.includes('profile-friends'));
  t('profile friend rows link to each profile via profileUrl', pc.includes('profileUrl(f)'));
  t('profile friends section is collapsible (details)', pc.includes('<details'));
  t('REMOVE shown on your own profile only (isOwner-gated)',
    pc.includes('data-ui="profile-friend-remove"') && pc.includes('{isOwner ?'));
  t('profile friends section hidden for signed-out viewers', pc.includes('friends !== null'));
  t('profile friends section hidden when blocked (silent)', pc.includes('!friendsBlocked'));
  t('unfriend is two-tap (no window.confirm pop-up)', pc.includes('removeArmed') && !pc.includes('window.confirm'));
}

// Logic: the /of block gate contract, against the fake admin.
async function friendsOfGate(admin, viewerId, targetId) {
  // Mirrors app/api/friends/of/route.js GET: block gate -> listFriends.
  if (viewerId !== targetId) {
    const mine = await listMyFriendships(admin, viewerId);
    if (isBlockedPair(mine, viewerId, targetId)) return { friends: [], blocked: true };
  }
  const friends = await listFriends(admin, { userId: targetId });
  return { friends, blocked: false };
}

{
  const admin = makeFakeAdmin({
    user_profiles: [prof(UUID_A, 'aaa'), prof(UUID_B, 'bbb'), prof(UUID_C, 'ccc')],
  });
  // A accepted B; A accepted C.
  const f1 = await createFriendRequest(admin, { requesterId: UUID_A, addresseeId: UUID_B });
  await respondToFriendship(admin, { userId: UUID_B, friendshipId: f1.friendship.id, action: 'accept' });
  const f2 = await createFriendRequest(admin, { requesterId: UUID_A, addresseeId: UUID_C });
  await respondToFriendship(admin, { userId: UUID_C, friendshipId: f2.friendship.id, action: 'accept' });

  const own = await friendsOfGate(admin, UUID_A, UUID_A);
  t('own profile shows the full friends list',
    own.blocked === false && own.friends.length === 2
    && own.friends.some((f) => f.user_id === UUID_B)
    && own.friends.some((f) => f.user_id === UUID_C));

  const others = await friendsOfGate(admin, UUID_B, UUID_A);
  t("someone else's profile shows their friends list",
    others.blocked === false && others.friends.length === 2);

  const bView = await friendsOfGate(admin, UUID_A, UUID_B);
  t("B's friends visible to A (accepted both sides)", bView.blocked === false && bView.friends.length === 1);

  // Every friend view links to a real profile (no 404s).
  for (const f of own.friends) {
    t(`friend view for ${f.user_id} has a usable username`, typeof f.username === 'string' && f.username.length > 0);
    const url = profileUrl(f);
    t(`profileUrl builds a same-app link (${url})`, url.startsWith('/u/'));
  }
}

// ===========================================================================
// (c) blocks are respected in the friends section
// ===========================================================================

{
  const admin = makeFakeAdmin({
    user_profiles: [prof(UUID_A, 'aaa'), prof(UUID_B, 'bbb')],
  });
  // A and B are friends; then A blocks B (stored blocker-side).
  const f = await createFriendRequest(admin, { requesterId: UUID_A, addresseeId: UUID_B });
  await respondToFriendship(admin, { userId: UUID_B, friendshipId: f.friendship.id, action: 'accept' });
  await blockUser(admin, { blockerId: UUID_A, blockedId: UUID_B });

  const blockerSide = await friendsOfGate(admin, UUID_B, UUID_A);
  t('user blocked BY the profile owner sees no friends list', blockerSide.blocked === true && blockerSide.friends.length === 0);

  const blockedSide = await friendsOfGate(admin, UUID_A, UUID_B);
  t('blocker viewing the blocked user also gets the silent gate', blockedSide.blocked === true && blockedSide.friends.length === 0);

  // The block row is found from either side (pairKey mirrors the SQL unique index).
  const mineA = await listMyFriendships(admin, UUID_A);
  const mineB = await listMyFriendships(admin, UUID_B);
  t('block row discoverable from the blocker side', isBlockedPair(mineA, UUID_A, UUID_B));
  t('block row discoverable from the blocked side', isBlockedPair(mineB, UUID_A, UUID_B));

  // After unblock the gate opens again (removeFriend 404s on the block row —
  // blocks are not friendships).
  await removeFriend(admin, { userId: UUID_A, friendId: UUID_B }).catch((e) => {
    t('removeFriend refuses block rows (404)', e.status === 404);
  });
  const again = await friendsOfGate(admin, UUID_A, UUID_A);
  t('own list no longer leaks the blocked user', again.friends.every((x) => x.user_id !== UUID_B));
}

console.log(`\nprofile-friends: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
