// OASIS rooms tests — code format and pure room helpers.
import {
  generateRoomCode, normalizeCode, isValidRoomCode,
  humansInRoom, npcsInRoom, seatsTaken, roomIsFull, roomReadyToStart, ROOM_STATUS,
} from './rooms.js';

let pass = 0, fail = 0;
const ok = (cond, name) => { if (cond) { pass++; } else { fail++; console.error('FAIL:', name); } };

// Code generation: 100 codes, all valid, all unique-ish.
{
  const codes = new Set();
  let allValid = true;
  for (let i = 0; i < 100; i += 1) {
    const c = generateRoomCode();
    codes.add(c);
    if (!isValidRoomCode(c)) allValid = false;
  }
  ok(allValid, 'generated codes are all valid');
  ok(codes.size === 100, 'generated codes are unique');
  ok(!/[01IO]/.test([...codes].join('')), 'no ambiguous glyphs in codes');
}

// Validation.
ok(isValidRoomCode('ABCDEF') === true, 'plain code valid');
ok(isValidRoomCode('abcdef') === true, 'lowercase normalized to valid');
ok(isValidRoomCode('  abcdef  ') === true, 'whitespace trimmed');
ok(isValidRoomCode('ABCDE') === false, 'too short invalid');
ok(isValidRoomCode('ABCDEFG') === false, 'too long invalid');
ok(isValidRoomCode('ABC0EF') === false, 'ambiguous 0 invalid');
ok(isValidRoomCode('ABIDEF') === false, 'ambiguous I invalid');
ok(isValidRoomCode('') === false, 'empty invalid');
ok(isValidRoomCode(null) === false, 'null invalid');
ok(normalizeCode('ab12  ') === 'AB12', 'normalizeCode uppercases + trims');

// Room helpers.
const room = { player_ids: ['h1', 'h2'], npc_ids: ['n1'], min_players: 2, max_players: 4 };
ok(humansInRoom(room) === 2, 'humansInRoom');
ok(npcsInRoom(room) === 1, 'npcsInRoom');
ok(seatsTaken(room) === 3, 'seatsTaken');
ok(roomIsFull(room, 4) === false, 'not full at 3/4');
ok(roomIsFull(room, 3) === true, 'full at 3/3');
ok(roomIsFull({ player_ids: ['a', 'b'], npc_ids: [] }, 2) === true, 'full counts humans only');
ok(roomReadyToStart({ player_ids: ['h1'] }, 2) === false, 'not ready below min');
ok(roomReadyToStart({ player_ids: ['h1', 'h2'] }, 2) === true, 'ready at min');
ok(humansInRoom({}) === 0, 'missing player_ids safe');
ok(npcsInRoom(null) === 0, 'null room safe');

// Status enum.
ok(ROOM_STATUS.WAITING === 'waiting' && ROOM_STATUS.PLAYING === 'playing' && ROOM_STATUS.FINISHED === 'finished', 'status enum');

console.log(`rooms: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
