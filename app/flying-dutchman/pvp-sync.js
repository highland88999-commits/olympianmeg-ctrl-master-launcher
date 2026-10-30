// Flying Dutchman — PvP duel sync over Supabase Realtime broadcast.
//
// Two captains, one room code. Lobby rides the OASIS rooms table
// (createRoom/joinRoom/getRoom); the live duel rides a broadcast
// channel `dutchman-duel:<CODE>`:
//   - `state`  — ship snapshot, ~8Hz, both directions
//   - `fire`   — a broadside left the guns (remote spawns the balls)
//   - `sunk`   — a hull went down (authoritative: each captain owns
//                their own hull and announces their own sinking)
//
// Graceful degradation: connect() resolves { available: false } when
// Realtime can't subscribe — the caller must say so honestly.

import { supabase } from '@/lib/supabase';
import {
  createRoom, getRoom, joinRoom, setRoomStatus, ROOM_STATUS,
} from '@/lib/oasis/rooms.js';

export { getRoom, setRoomStatus, ROOM_STATUS };

const GAME_SLUG = 'flying-dutchman';
const CONNECT_TIMEOUT_MS = 9000;

/** Create a 2-captain duel room. Returns the room row (has room_code). */
export async function createDuelRoom(hostId) {
  return createRoom(supabase, {
    game: GAME_SLUG, hostId, minPlayers: 2, maxPlayers: 2,
  });
}

/** Seat a captain in a waiting duel room. Returns { room } or { error }. */
export async function joinDuelRoom(code, playerId) {
  return joinRoom(supabase, { code, playerId });
}

/** Stable captain id: auth user when signed in, device id otherwise. */
export async function getCaptainId() {
  try {
    const { data } = await supabase.auth.getUser();
    if (data && data.user && data.user.id) return data.user.id;
  } catch { /* fall through to device id */ }
  try {
    let id = window.localStorage.getItem('dutchman-captain');
    if (!id) {
      id = `guest-${Math.random().toString(36).slice(2, 10)}`;
      window.localStorage.setItem('dutchman-captain', id);
    }
    return id;
  } catch {
    return `guest-${Math.random().toString(36).slice(2, 10)}`;
  }
}

export class DuelSync {
  constructor(code, shipId) {
    this.code = String(code || '').toUpperCase();
    this.shipId = shipId;
    this.channel = null;
    this.handlers = {};
    this._timer = null;
  }

  /**
   * Subscribe to the duel channel.
   * handlers: { onState(state), onFire(side), onSunk(payload) }
   * Resolves { available: true } or { available: false, error }.
   */
  connect(handlers) {
    this.handlers = handlers || {};
    return new Promise((resolve) => {
      let done = false;
      const finish = (available, error) => {
        if (done) return;
        done = true;
        if (this._timer) { clearTimeout(this._timer); this._timer = null; }
        resolve({ available, error });
      };
      try {
        const ch = supabase.channel(`dutchman-duel:${this.code}`, {
          config: { broadcast: { self: false } },
        });
        ch.on('broadcast', { event: 'state' }, ({ payload }) => {
          if (payload && payload.shipId !== this.shipId && this.handlers.onState) {
            this.handlers.onState(payload);
          }
        });
        ch.on('broadcast', { event: 'fire' }, ({ payload }) => {
          if (payload && payload.shipId !== this.shipId && this.handlers.onFire) {
            this.handlers.onFire(payload.side);
          }
        });
        ch.on('broadcast', { event: 'sunk' }, ({ payload }) => {
          if (payload && payload.shipId !== this.shipId && this.handlers.onSunk) {
            this.handlers.onSunk(payload);
          }
        });
        this._timer = setTimeout(() => finish(false, 'Realtime timed out.'), CONNECT_TIMEOUT_MS);
        ch.subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            this.channel = ch;
            finish(true);
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            finish(false, `Realtime ${status}.`);
          }
        });
      } catch (e) {
        finish(false, String((e && e.message) || e));
      }
    });
  }

  sendState(state) {
    if (!this.channel) return;
    try {
      this.channel.send({
        type: 'broadcast',
        event: 'state',
        payload: { shipId: this.shipId, at: Date.now(), ...state },
      });
    } catch { /* broadcast is best-effort */ }
  }

  sendFire(side) {
    if (!this.channel) return;
    try {
      this.channel.send({
        type: 'broadcast', event: 'fire', payload: { shipId: this.shipId, side },
      });
    } catch { /* best-effort */ }
  }

  sendSunk() {
    if (!this.channel) return;
    try {
      this.channel.send({
        type: 'broadcast', event: 'sunk', payload: { shipId: this.shipId },
      });
    } catch { /* best-effort */ }
  }

  disconnect() {
    if (this._timer) { clearTimeout(this._timer); this._timer = null; }
    try {
      if (this.channel) supabase.removeChannel(this.channel);
    } catch { /* ignore */ }
    this.channel = null;
  }
}
