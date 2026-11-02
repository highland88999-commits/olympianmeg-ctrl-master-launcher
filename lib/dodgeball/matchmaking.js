// lib/dodgeball/matchmaking.js — PvP matchmaking lobby (Merlin, 2026-10-31).
//
// 60-second lobby: players join, humans first. After 60s (or when the
// host hits START), AI fills the gaps. 6v6 WDBF official (Rule 4.2) or
// 3v3 arcade — 12 or 6 slots, blue vs red.
//
// This module is the LOBBY state machine (pure, node-tested). The real
// player transport (Supabase Realtime presence) plugs in later — for
// now the lobby runs local: you + simulated queue, AI backfill. The
// shape is ready: addPlayer/removePlayer take the same args a
// Realtime presence handler would.

import { TEAM_SIZES, DEFAULT_MODE } from './rules.js';

export const LOBBY_SECONDS = 60;

export function createLobby(hostId, hostName, mode = DEFAULT_MODE) {
  return {
    status: 'waiting', // waiting -> countdown -> starting -> done
    secondsLeft: LOBBY_SECONDS,
    mode: TEAM_SIZES[mode] ? mode : DEFAULT_MODE,
    players: [{ id: hostId, name: hostName || 'You', isHuman: true, joinedAt: Date.now() }],
    aiFill: [],
  };
}

/** Add a human player. Returns false if the lobby is full. */
export function addPlayer(lobby, id, name) {
  if (lobby.players.length >= TEAM_SIZES[lobby.mode] * 2) return false;
  if (lobby.players.some((p) => p.id === id)) return true; // idempotent
  lobby.players.push({ id, name: name || id, isHuman: true, joinedAt: Date.now() });
  return true;
}

export function removePlayer(lobby, id) {
  lobby.players = lobby.players.filter((p) => p.id !== id);
}

/** Tick the countdown. Returns true when the lobby should start. */
export function tickLobby(lobby, dt) {
  if (lobby.status !== 'countdown' && lobby.status !== 'waiting') return false;
  if (lobby.status === 'waiting') lobby.status = 'countdown';
  lobby.secondsLeft = Math.max(0, lobby.secondsLeft - dt);
  return lobby.secondsLeft <= 0;
}

/**
 * Build the final match roster: humans first (alternating teams for
 * fairness, host on blue), AI fills the gaps. Returns the
 * playerConfigs array for createMatch().
 */
export function buildRoster(lobby) {
  const teamSize = TEAM_SIZES[lobby.mode];
  const humans = [...lobby.players].sort((a, b) => a.joinedAt - b.joinedAt);
  const configs = [];
  // Alternate teams: host blue, next red, next blue, etc. — keeps
  // human counts balanced when the lobby isn't full.
  humans.forEach((h, i) => {
    configs.push({
      id: h.id,
      name: h.name,
      team: i % 2 === 0 ? 'blue' : 'red',
      isHuman: true,
    });
  });
  // AI fills the gaps, players first.
  const blueNeed = teamSize - configs.filter((c) => c.team === 'blue').length;
  const redNeed = teamSize - configs.filter((c) => c.team === 'red').length;
  for (let i = 0; i < blueNeed; i++) {
    configs.push({ id: `ai-blue-${i}`, name: 'AI Teammate', team: 'blue', isHuman: false });
  }
  for (let i = 0; i < redNeed; i++) {
    configs.push({ id: `ai-red-${i}`, name: 'AI Opponent', team: 'red', isHuman: false });
  }
  return configs;
}

/** How many humans are waiting, per team, for the lobby UI. */
export function lobbyCounts(lobby) {
  const roster = buildRoster(lobby);
  return {
    humans: lobby.players.length,
    blueHumans: roster.filter((c) => c.team === 'blue' && c.isHuman).length,
    redHumans: roster.filter((c) => c.team === 'red' && c.isHuman).length,
    aiNeeded: roster.filter((c) => !c.isHuman).length,
  };
}
