// lib/pvp/presence.js — "Which friends are online?" via Supabase Realtime
// Presence. No table, no polling: each signed-in user tracks a tiny presence
// payload on the shared `pvp-online` channel; subscribers see join/leave in
// real time.
//
// Honesty contract: if the Realtime channel cannot subscribe (offline,
// blocked, misconfigured), the caller gets { available: false } and must say
// so in the UI — never a fake "all friends offline" or a fabricated list.
// The friends list itself still works; only the green dots degrade.

export const ONLINE_CHANNEL = 'pvp-online';
export const ONLINE_STALE_MS = 45000; // treat presence older than this as gone

/**
 * Announce this user as online. Call once per session (e.g. launcher shell
 * mount). Returns { untrack } — call untrack on sign-out/unmount.
 */
export function trackOnline(supabase, { userId, callsign = 'Player' }) {
  if (!supabase || !userId) return { untrack: () => {} };
  let channel = null;
  let stopped = false;
  const clean = String(callsign || 'Player').replace(/[<>\u0000-\u001f\u007f]/g, '').slice(0, 24) || 'Player';
  try {
    channel = supabase.channel(ONLINE_CHANNEL, { config: { presence: { key: userId } } });
    channel.subscribe(async (status) => {
      if (stopped) return;
      if (status === 'SUBSCRIBED') {
        try { await channel.track({ user_id: userId, callsign: clean, at: Date.now() }); }
        catch { /* presence best-effort */ }
      }
    });
  } catch {
    channel = null;
  }
  return {
    untrack: () => {
      stopped = true;
      if (channel) { try { channel.untrack(); supabase.removeChannel(channel); } catch { /* noop */ } }
    },
  };
}

/**
 * Watch a set of friend ids for online status.
 * onChange({ available, onlineIds }) — onlineIds is a Set of friend user ids
 * currently present. available=false means Realtime is down: show the friends
 * without dots and say presence is unavailable.
 * Returns an unsubscribe function.
 */
export function subscribeOnlineFriends(supabase, friendIds, onChange) {
  const ids = new Set((friendIds || []).filter(Boolean));
  if (!supabase || typeof onChange !== 'function') return () => {};
  let channel = null;
  let stopped = false;
  let available = false;

  const emit = () => {
    if (stopped) return;
    const online = new Set();
    try {
      const state = channel ? channel.presenceState() : {};
      for (const presences of Object.values(state)) {
        for (const p of presences || []) {
          if (p && ids.has(p.user_id)) {
            if (!p.at || Date.now() - Number(p.at) < ONLINE_STALE_MS) online.add(p.user_id);
          }
        }
      }
    } catch { /* presence read failed; report what we have */ }
    onChange({ available, onlineIds: online });
  };

  try {
    channel = supabase.channel(ONLINE_CHANNEL, { config: { presence: { key: 'watcher' } } });
    channel
      .on('presence', { event: 'sync' }, emit)
      .on('presence', { event: 'join' }, emit)
      .on('presence', { event: 'leave' }, emit);
    channel.subscribe((status) => {
      if (stopped) return;
      available = status === 'SUBSCRIBED';
      emit();
    });
    // If subscribe never resolves, report unavailable after a beat.
    setTimeout(() => { if (!stopped && !available) emit(); }, 8000);
  } catch {
    setTimeout(() => emit(), 0);
  }

  return () => {
    stopped = true;
    if (channel) { try { supabase.removeChannel(channel); } catch { /* noop */ } }
  };
}
