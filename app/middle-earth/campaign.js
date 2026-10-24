/*
 * MIDDLE-EARTH — THE CAMPAIGN: orc kills, the Saruman gate, loot.
 *
 * The persistent spine over the six pods (Merlin: "objective is
 * hunt orcs — kill Saruman"). State lives in the same storage
 * pattern as pod progress (localStorage key below; the record is
 * shaped for a later ui-state lift, like the backpack's).
 *
 *   { killsByPod: { shire: n, ... }, totalKills: n,
 *     saruman: 'locked' | 'open' | 'dead',
 *     sarumanKilledAt: ms | null, rewardClaimed: bool }
 *
 * The gate: SARUMAN_GATE_KILLS (data.js, 30) campaign kills flips
 * saruman 'locked' -> 'open'; boss.js refuses combat before that.
 * Killing him sets 'dead', stamps the time, and the reward — the
 * Staff of the White Wizard — lands in the backpack ONCE, through
 * the same item law as hunt loot.
 *
 * LOOT BRIDGE: hunt loot (orcs.js rollLoot arrays) becomes
 * backpack item inputs here — materials stack, weapons arrive as
 * individual instances whose reticle is stamped by class through
 * the backpack law (createItem). applyLootToRecord composes the
 * backpack's own addItem; the page calls it inside updateBackpack.
 */
import { addItem } from '../../lib/backpack/backpack.js';
import { SARUMAN_GATE_KILLS } from './data.js';

export const CAMPAIGN_KEY = 'olympus:middleearth:campaign';

export const SARUMAN_REWARD = {
  id: 'staff-of-the-white-wizard',
  name: 'Staff of the White Wizard',
  class: 'staff',
};

export function createCampaign() {
  return {
    killsByPod: {},
    totalKills: 0,
    saruman: 'locked',
    sarumanKilledAt: null,
    rewardClaimed: false,
    heat: {}, // per-pod hunt meter (hunt.js) — how loudly the player hunts
  };
}

/** The pod's current hunt meter, clamped 0..100. */
export function heatOf(campaign, podId) {
  const h = campaign && campaign.heat && campaign.heat[podId];
  return typeof h === 'number' && isFinite(h) ? Math.max(0, Math.min(100, h)) : 0;
}

export function setHeat(campaign, podId, heat) {
  const base = campaign && typeof campaign === 'object' ? campaign : createCampaign();
  const next = { ...base, heat: { ...(base.heat || {}) } };
  next.heat[podId] = Math.max(0, Math.min(100, heat));
  return next;
}

/** Death cuts the meter — the orcs lost your trail in the chaos. */
export function cutHeatOnDeath(campaign, podId) {
  return setHeat(campaign, podId, heatOf(campaign, podId) * 0.35);
}

export function gateOpen(campaign) {
  return !!campaign && campaign.totalKills >= SARUMAN_GATE_KILLS;
}

export function gateProgress(campaign) {
  const total = campaign ? campaign.totalKills : 0;
  return { total, needed: SARUMAN_GATE_KILLS, open: total >= SARUMAN_GATE_KILLS };
}

/** Record one orc kill in a pod. Returns a NEW campaign record. */
export function recordKill(campaign, podId) {
  const base = campaign && typeof campaign === 'object' ? campaign : createCampaign();
  const killsByPod = { ...(base.killsByPod || {}) };
  killsByPod[podId] = (killsByPod[podId] || 0) + 1;
  const totalKills = (base.totalKills || 0) + 1;
  const next = { ...base, killsByPod, totalKills };
  if (next.saruman === 'locked' && totalKills >= SARUMAN_GATE_KILLS) next.saruman = 'open';
  return next;
}

/** Record the finale. Returns a NEW campaign record. */
export function completeSaruman(campaign, atMs) {
  const base = campaign && typeof campaign === 'object' ? campaign : createCampaign();
  if (base.saruman === 'dead') return base;
  return {
    ...base,
    saruman: 'dead',
    sarumanKilledAt: Number.isFinite(atMs) ? atMs : null,
  };
}

export function claimReward(campaign) {
  const base = campaign && typeof campaign === 'object' ? campaign : createCampaign();
  return { ...base, rewardClaimed: true };
}

/* ---------------- loot -> backpack ---------------- */

/**
 * One loot array (orcs.js) -> backpack addItem inputs.
 * Materials: { id, kind:'material', name, qty }.
 * Weapons: { id, kind:'weapon', name, meta:{ weaponClass, source } }
 * — createItem stamps the class reticle on entry.
 */
export function lootItemInputs(loot) {
  const out = [];
  for (const entry of Array.isArray(loot) ? loot : []) {
    if (!entry) continue;
    if (entry.weapon) {
      out.push({
        id: entry.weapon.id,
        kind: 'weapon',
        name: entry.weapon.name,
        qty: 1,
        meta: { weaponClass: entry.weapon.class, source: 'middle-earth-hunt' },
      });
    } else if (entry.id) {
      out.push({
        id: entry.id,
        kind: 'material',
        name: entry.name || entry.id,
        qty: Math.max(1, entry.qty | 0),
        meta: { source: 'middle-earth-hunt' },
      });
    }
  }
  return out;
}

export function rewardItemInput() {
  return {
    id: SARUMAN_REWARD.id,
    kind: 'weapon',
    name: SARUMAN_REWARD.name,
    qty: 1,
    meta: { weaponClass: SARUMAN_REWARD.class, source: 'middle-earth-finale', rarity: 'legendary' },
  };
}

/** Fold a loot array into a backpack record (returns a new one). */
export function applyLootToRecord(record, loot) {
  let next = record;
  for (const input of lootItemInputs(loot)) {
    next = addItem(next, input, input.qty);
  }
  return next;
}

export function applyRewardToRecord(record) {
  const input = rewardItemInput();
  return addItem(record, input, 1);
}

/* ---------------- persistence ---------------- */

export function loadCampaign() {
  try {
    if (typeof localStorage === 'undefined') return createCampaign();
    const raw = localStorage.getItem(CAMPAIGN_KEY);
    if (!raw) return createCampaign();
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return createCampaign();
    const out = createCampaign();
    if (parsed.killsByPod && typeof parsed.killsByPod === 'object') {
      for (const k of Object.keys(parsed.killsByPod)) {
        const n = parsed.killsByPod[k];
        if (Number.isFinite(n) && n > 0) out.killsByPod[k] = Math.floor(n);
      }
    }
    out.totalKills = Number.isFinite(parsed.totalKills) && parsed.totalKills > 0
      ? Math.floor(parsed.totalKills) : Object.values(out.killsByPod).reduce((a, b) => a + b, 0);
    if (parsed.saruman === 'open' || parsed.saruman === 'dead') out.saruman = parsed.saruman;
    if (out.saruman === 'locked' && out.totalKills >= SARUMAN_GATE_KILLS) out.saruman = 'open';
    out.sarumanKilledAt = Number.isFinite(parsed.sarumanKilledAt) ? parsed.sarumanKilledAt : null;
    out.rewardClaimed = !!parsed.rewardClaimed;
    if (parsed.heat && typeof parsed.heat === 'object') {
      for (const k of Object.keys(parsed.heat)) {
        const n = parsed.heat[k];
        if (Number.isFinite(n) && n > 0) out.heat[k] = Math.min(100, n);
      }
    }
    return out;
  } catch {
    return createCampaign();
  }
}

export function saveCampaign(c) {
  try {
    if (typeof localStorage === 'undefined') return;
    const value = c && typeof c === 'object' ? c : createCampaign();
    localStorage.setItem(CAMPAIGN_KEY, JSON.stringify(value));
  } catch {
    // storage unavailable — the campaign just won't persist
  }
}
