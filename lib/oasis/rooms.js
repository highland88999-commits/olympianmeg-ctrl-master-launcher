// OASIS rooms — generalized matchmaking, grown from the working battleship pattern.
// Pure helpers are headless-testable. Supabase calls take the client as an
// argument so this module never hard-codes a connection.

export const ROOM_CODE_LENGTH = 6;
// No ambiguous glyphs (no 0/O, 1/I) so codes read cleanly on a phone screen.
const CODE_CHARSET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_REGEX = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/;

export const ROOM_STATUS = {
  WAITING: 'waiting',
  PLAYING: 'playing',
  FINISHED: 'finished',
};

/** Build a fresh 6-character room code. */
export function generateRoomCode(randomFn = Math.random) {
  let code = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i += 1) {
    code += CODE_CHARSET[Math.floor(randomFn() * CODE_CHARSET.length)];
  }
  return code;
}

/** Normalize raw input the way lobby inputs do (uppercase, trimmed). */
export function normalizeCode(raw) {
  return String(raw || '').trim().toUpperCase();
}

/** True when the code is a well-formed 6-char OASIS room code. */
export function isValidRoomCode(raw) {
  return CODE_REGEX.test(normalizeCode(raw));
}

/** Number of human players currently seated. */
export function humansInRoom(room) {
  const ids = room && Array.isArray(room.player_ids) ? room.player_ids : [];
  return ids.length;
}

/** Number of NPC seats currently filled. */
export function npcsInRoom(room) {
  const ids = room && Array.isArray(room.npc_ids) ? room.npc_ids : [];
  return ids.length;
}

/** Total occupied seats. */
export function seatsTaken(room) {
  return humansInRoom(room) + npcsInRoom(room);
}

/** True when no seat (human or NPC) remains. */
export function roomIsFull(room, maxPlayers) {
  const max = maxPlayers ?? room?.max_players ?? 2;
  return seatsTaken(room) >= max;
}

/** True when the human headcount already reaches the game's minimum. */
export function roomReadyToStart(room, minPlayers) {
  const min = minPlayers ?? room?.min_players ?? 2;
  return humansInRoom(room) >= min;
}

// ---------------------------------------------------------------------------
// Supabase operations (client passed in; table: oasis_rooms)
// ---------------------------------------------------------------------------

const TABLE = 'oasis_rooms';

/**
 * Create a waiting room for a game. Returns the inserted row.
 */
export async function createRoom(supabase, { game, hostId, minPlayers, maxPlayers }) {
  if (!game || !hostId) throw new Error('createRoom needs a game slug and a host id.');
  const room_code = generateRoomCode();
  const { data, error } = await supabase
    .from(TABLE)
    .insert([{
      game,
      room_code,
      host_id: hostId,
      player_ids: [hostId],
      npc_ids: [],
      status: ROOM_STATUS.WAITING,
      min_players: minPlayers,
      max_players: maxPlayers,
    }])
    .select()
    .single();
  if (error) throw error;
  return data;
}

/** Fetch a room by its 6-char code. Returns null when not found. */
export async function getRoom(supabase, code) {
  const clean = normalizeCode(code);
  if (!isValidRoomCode(clean)) return null;
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('room_code', clean)
    .single();
  if (error) return null;
  return data;
}

/**
 * Seat a player in a waiting room that still has a human seat free.
 * Returns { room } on success or { error } when the room is unavailable.
 */
export async function joinRoom(supabase, { code, playerId }) {
  const room = await getRoom(supabase, code);
  if (!room || room.status !== ROOM_STATUS.WAITING) {
    return { error: 'Room not found or already started.' };
  }
  const ids = Array.isArray(room.player_ids) ? room.player_ids : [];
  if (ids.includes(playerId)) return { room }; // already seated; idempotent
  if (humansInRoom(room) + npcsInRoom(room) >= (room.max_players || 8)) {
    return { error: 'Room is full.' };
  }
  const next = [...ids, playerId];
  const { data, error } = await supabase
    .from(TABLE)
    .update({ player_ids: next })
    .eq('room_code', room.room_code)
    .select()
    .single();
  if (error) return { error: 'Could not join the room.' };
  return { room: data };
}

/** Move a room between waiting / playing / finished. */
export async function setRoomStatus(supabase, code, status) {
  if (!Object.values(ROOM_STATUS).includes(status)) throw new Error(`Unknown room status: ${status}`);
  const { error } = await supabase
    .from(TABLE)
    .update({ status })
    .eq('room_code', normalizeCode(code));
  if (error) throw error;
}

/** Persist the NPC seat list (array of NPC ids) for a room. */
export async function setRoomNpcs(supabase, code, npcIds) {
  const { error } = await supabase
    .from(TABLE)
    .update({ npc_ids: npcIds })
    .eq('room_code', normalizeCode(code));
  if (error) throw error;
}

/** Room watcher: polls the row and fires onUpdate with the fresh row whenever
 *  it changes. Deliberately NOT Realtime — the DB is the single source of
 *  truth, so watchers survive reconnects, tab sleep, and projects where
 *  Realtime is disabled. (Chess PvP broke on Realtime channel lifecycle;
 *  this is the fix.) */
export function subscribeToRoom(supabase, code, onUpdate, pollMs = 2000) {
  const clean = normalizeCode(code);
  let lastSeen = '';
  let stopped = false;
  const check = async () => {
    if (stopped) return;
    try {
      const room = await getRoom(supabase, clean);
      if (!room) return;
      const snap = JSON.stringify(room);
      if (snap !== lastSeen) {
        lastSeen = snap;
        onUpdate(room);
      }
    } catch { /* transient — next poll retries */ }
  };
  check();
  const timer = setInterval(check, pollMs);
  return () => { stopped = true; clearInterval(timer); };
}
