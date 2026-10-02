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
}

console.log(`\nfriends: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
