// Duat Arena — pure game-logic library.
//
// Pure functions only: no React, no DOM at import time. Every formula is
// documented below. This module is CONTRACTUAL — DuatWaves, DuatEnemies,
// DuatCombat, DuatHUD and the DuatArenaContext provider import these exact
// exported names and signatures. Do not rename.
//
// localStorage is guarded everywhere (try/catch + typeof checks) so this
// file never throws during SSR or in headless tests.

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// Total waves in a full arena run.
export const WAVE_TOTAL = 10;

// Gold-bar rewards per Merlin's brief: a conquered match pays defeated-but-
// participating players REWARD_CONSOLATION_BARS and surviving victors
// REWARD_SURVIVOR_BARS. Merlin may correct these numbers.
// Seam note: single-player today — rewardForMatch takes the local player's
// { victory, survived }; multiplayer later splits per-player here.
export const REWARD_SURVIVOR_BARS = 0.5;
export const REWARD_CONSOLATION_BARS = 0.1;

// Player weapon table. Fields consumed by DuatCombat:
//   damage     — hit points dealt per hit
//   range      — max reach in arena units
//   arcDeg     — (melee only) sweep arc of a swing
//   cooldownMs — (all) minimum ms between attacks
//   speed      — (projectile only) travel speed, units/sec
//   aoe        — (projectile only) splash radius in arena units
export const WEAPONS = {
  sword:  { name: 'Sword',      damage: 25, range: 3.6, arcDeg: 100, cooldownMs: 500, kind: 'melee' },
  blaster:{ name: 'Blaster',    damage: 15, range: 42,               cooldownMs: 260, kind: 'hitscan' },
  bow:    { name: 'Bow',        damage: 20, range: 34, speed: 34,    cooldownMs: 800, kind: 'projectile' },
  staff:  { name: 'Mage Staff', damage: 12, range: 30, speed: 22,    cooldownMs: 420, kind: 'projectile', aoe: 3 },
};

// ---------------------------------------------------------------------------
// Enemy scaling — "fractionally but increasingly more difficult"
// ---------------------------------------------------------------------------

// Wave base stats (wave 1):
//   count 5, hp 30, damage 8, speed 4.2, attackRange 2.2, attackCd 1400ms.
//
// Per wave n (1..WAVE_TOTAL):
//   count       = min(5 + 2*(n-1), 23)
//                 — +2 enemies per wave, hard-capped at 23 so the arena
//                 never crowds past what the sandbox can simulate.
//   hpLinear    = 30 * (1 + 0.15*(n-1))
//                 — +15% of base hp per wave, linear backbone.
//   hpCompound  = 1 + 0.02*(n-1)^1.5
//                 — small compounding term so the curve is "increasingly"
//                 difficult: at wave 10 it adds ~54% on top of the linear
//                 value (1 + 0.02*9^1.5 = 1.54), at wave 5 only ~16%.
//   hp          = round(hpLinear * hpCompound)
//   damage      = round(8 * (1 + 0.10*(n-1)))  — +10% of base per wave.
//   speed       = min(4.2 * (1 + 0.03*(n-1)), 5.4) — +3% per wave, capped at
//                 5.4 so late-wave enemies never outrun a sprinting player.
//   attackRange = 2.2 (constant), attackCd = 1400ms (constant).
export function enemyStatsForWave(wave) {
  const n = clampWave(wave);
  const t = n - 1; // waves past the first
  const hpLinear = 30 * (1 + 0.15 * t);
  const hpCompound = 1 + 0.02 * Math.pow(t, 1.5);
  return {
    count: Math.min(5 + 2 * t, 23),
    hp: Math.round(hpLinear * hpCompound),
    damage: Math.round(8 * (1 + 0.10 * t)),
    speed: Math.min(4.2 * (1 + 0.03 * t), 5.4),
    attackRange: 2.2,
    attackCd: 1400,
  };
}

// Boss scaling (waves 1..WAVE_TOTAL, returned on boss waves):
//   hp     = round(320 * (1 + 0.25*(n-1)))  — +25% of base per wave; boss hp
//            is the primary difficulty dial (wave-10 boss = 1040 hp).
//   damage = round(18 * (1 + 0.12*(n-1)))   — +12% of base per wave.
//   speed 3.0 and attackRange 4.0 are constant — the boss stays a slow,
//   heavy hitter across all waves.
export function bossStatsForWave(wave) {
  const n = clampWave(wave);
  const t = n - 1;
  return {
    hp: Math.round(320 * (1 + 0.25 * t)),
    damage: Math.round(18 * (1 + 0.12 * t)),
    speed: 3.0,
    attackRange: 4.0,
  };
}

// Per-player difficulty bump from player memory. Veteran players get
// fractionally tougher enemies so the arena keeps biting:
//   factor = 1 + 0.02 * max(0, maxWaveReached - 3), capped at +15% (1.15).
// Waves 1–3 are the on-ramp (no bump); each further max wave reached adds
// 2% to enemy hp, damage, and speed. Applies to enemy/boss stat objects
// shaped { hp, damage, speed } — other fields pass through unchanged.
export function applyPlayerMemory(stats, memory) {
  const reached = memory && typeof memory.maxWaveReached === 'number' ? memory.maxWaveReached : 0;
  const factor = Math.min(1 + 0.02 * Math.max(0, reached - 3), 1.15);
  return {
    ...stats,
    hp: Math.round(stats.hp * factor),
    damage: Math.round(stats.damage * factor),
    speed: stats.speed * factor,
  };
}

function clampWave(wave) {
  if (typeof wave !== 'number' || !Number.isFinite(wave)) return 1;
  return Math.min(Math.max(Math.round(wave), 1), WAVE_TOTAL);
}

// ---------------------------------------------------------------------------
// Rewards
// ---------------------------------------------------------------------------

// Rewards ledger. Returns gold bars for the local player given the match
// outcome. Per Merlin's brief: a conquered match pays 0.1 bar to
// defeated-but-participating players and 0.5 bar to surviving victors.
// A lost match pays 0 regardless of survival.
// Seam: single-player today — multiplayer later calls this per-player with
// each player's own { victory, survived } pair.
export function rewardForMatch(outcome) {
  const { victory, survived } = outcome ?? {};
  if (!victory) return 0;
  return survived ? REWARD_SURVIVOR_BARS : REWARD_CONSOLATION_BARS;
}

// ---------------------------------------------------------------------------
// Player memory (localStorage; never throws)
// ---------------------------------------------------------------------------

const MEMORY_KEY = 'babel-duat-arena-memory';

function defaultMemory() {
  return { matchesEntered: 0, maxWaveReached: 0, totalKills: 0, goldBars: 0, lastPlayedAt: null };
}

// Load persisted player memory. Returns defaults when storage is missing,
// empty, corrupt, or unavailable (SSR/headless) — never throws.
export function loadMemory() {
  try {
    if (typeof localStorage === 'undefined') return defaultMemory();
    const raw = localStorage.getItem(MEMORY_KEY);
    if (!raw) return defaultMemory();
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return defaultMemory();
    const d = defaultMemory();
    return {
      matchesEntered: num(parsed.matchesEntered, d.matchesEntered),
      maxWaveReached: num(parsed.maxWaveReached, d.maxWaveReached),
      totalKills: num(parsed.totalKills, d.totalKills),
      goldBars: num(parsed.goldBars, d.goldBars),
      lastPlayedAt: parsed.lastPlayedAt ?? null,
    };
  } catch {
    return defaultMemory();
  }
}

function num(v, fallback) {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

// Persist player memory. Silently no-ops when storage is unavailable —
// never throws.
export function saveMemory(m) {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(MEMORY_KEY, JSON.stringify(m ?? defaultMemory()));
  } catch {
    // storage full / blocked / private mode — memory just doesn't persist
  }
}

// Record one finished match and return the updated memory object (also
// saved). Accumulates kills and gold bars across matches; maxWaveReached
// ratchets upward only (never decreases). matchesEntered increments every
// call. lastPlayedAt is set to Date.now().
export function recordMatch(m, { victory, waveReached, kills, barsEarned } = {}) {
  const mem = m && typeof m === 'object' ? { ...defaultMemory(), ...m } : { ...defaultMemory() };
  mem.matchesEntered = num(mem.matchesEntered, 0) + 1;
  if (num(waveReached, 0) > num(mem.maxWaveReached, 0)) {
    mem.maxWaveReached = Math.round(waveReached);
  }
  mem.totalKills = num(mem.totalKills, 0) + num(kills, 0);
  mem.goldBars = num(mem.goldBars, 0) + num(barsEarned, 0);
  mem.lastPlayedAt = Date.now();
  saveMemory(mem);
  return mem;
}

// ---------------------------------------------------------------------------
// Multiplayer stub
// ---------------------------------------------------------------------------

// Single-player today. Future multiplayer (battleship-style supabase channel,
// see RECON.md §6) slots here: local player is players[0], remote peers
// append into peers. Kept shape-compatible with gameRef.multiplayer so the
// future sync layer can swap this stub out without touching consumers.
export function playersStub() {
  return { enabled: false, peers: [] };
}
