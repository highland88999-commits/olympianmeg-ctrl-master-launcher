// lib/pvp/index.js — Public surface of the shared PvP platform.
//
// Architecture (deliberate): OASIS rooms ARE the lobbies — this layer does
// not duplicate them. lib/pvp adds what OASIS was missing: directed friend
// invites (the baseline Merlin ordered), online-friends presence, and the
// match lifecycle (ready-up, start, forfeit, rematch, disconnects).
//
// Transport: the OASIS room row stays the authoritative game-state sync
// (DB polling, the house pattern). Supabase Realtime is used only for
// ephemeral signals — invite doorbells, presence, ready-up — where instant
// delivery matters and staleness is harmless. Every Realtime path degrades
// honestly when the channel is down; nothing ever fakes an opponent.

export * from './invites.js';
export * from './presence.js';
export * from './match.js';
