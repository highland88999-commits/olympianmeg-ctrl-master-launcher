// tests/friends.test.js — Headless tests for the friends system.
// Run: node tests/friends.test.js (from the repo root).
// No browser, no network — asserts on lib/friends.js pure helpers.
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

console.log(`\nfriends: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
