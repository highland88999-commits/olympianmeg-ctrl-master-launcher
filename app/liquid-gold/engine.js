/**
 * Liquid Gold Refinery — pure idle-game logic. No DOM, no network.
 * All values deterministic; upgrades scale geometrically.
 */

export const TICK = 0.1; // seconds per game tick

export function newState() {
  return {
    crude: 0, // liters of crude gold in the silo
    purity: 0.12, // 0..1
    bars: 0, // refined bars in inventory — the refinery's upgrade currency
    credits: 0, // legacy mining-claim currency (kept for lib/economy/mining.js)
    output: 'bars', // conversion output: 'bars' | 'aether' (Merlin, 2026-10-22)
    pouring: false,
    surgeUntil: 0,
    surgeCooldownUntil: 0,
    upgrades: { pump: 0, filter: 0, vat: 0 },
    now: 0,
    pouredTotal: 0,
    barsMinted: 0, // lifetime batches converted (either output)
    aetherMinted: 0, // lifetime batches converted to aether
    lastMintAt: -Infinity, // game-time of the most recent mint (for UI flash)
  };
}

export const UPGRADE_DEFS = {
  pump: { name: "Pump", base: 25, growth: 1.9, desc: "+45% flow rate" },
  filter: { name: "Filter", base: 40, growth: 2.1, desc: "+0.08 purity / tick faster" },
  vat: { name: "Vat", base: 60, growth: 2.2, desc: "+60 L capacity" },
};

export function upgradeCost(kind, level) {
  const def = UPGRADE_DEFS[kind];
  return Math.round(def.base * Math.pow(def.growth, level));
}

export function vatCapacity(state) {
  return 120 + state.upgrades.vat * 60;
}

export function flowRate(state) {
  const base = 6; // L per second at pump 0
  let r = base * Math.pow(1.45, state.upgrades.pump);
  if (state.now < state.surgeUntil) r *= 3;
  return r;
}

/** One tick of pouring. Returns liters added. */
export function pourTick(state, dt = TICK) {
  if (!state.pouring) return 0;
  const cap = vatCapacity(state);
  const room = Math.max(0, cap - state.crude);
  const add = Math.min(room, flowRate(state) * dt);
  state.crude += add;
  state.pouredTotal += add;
  return add;
}

/**
 * Refining converts crude -> purity over time; mints a bar the moment the
 * batch reaches 98% purity. The whole refined batch goes into the bar
 * (crude is consumed into it), so there is no dead wait after the goal
 * is reached. Returns number of bars minted this tick.
 */
export function refineTick(state, dt = TICK) {
  if (state.crude <= 0.001) return 0;
  const filterPower = 0.05 + state.upgrades.filter * 0.03;
  state.purity = Math.min(1, state.purity + filterPower * dt * (0.4 + state.crude / vatCapacity(state)));
  // consume crude proportionally as it refines
  const consumed = Math.min(state.crude, 1.5 * dt * (1 + state.upgrades.filter * 0.25));
  state.crude -= consumed;
  let minted = 0;
  if (state.purity >= 0.98) {
    minted = 1;
    state.barsMinted += 1;
    // The conversion output decides where the batch lands: bars go to
    // inventory (they are the upgrade currency); aether batches leave
    // the refinery — the server credits the aether balance from the
    // replay, and aetherMinted is the local lifetime tally of them.
    if (state.output === 'aether') {
      state.aetherMinted = (state.aetherMinted || 0) + 1;
    } else {
      state.bars += 1;
    }
    state.crude = 0; // batch fully refined into the bar
    state.purity = 0.12; // fresh batch starts at base purity
    state.lastMintAt = state.now;
  }
  return minted;
}

export function barValue(state) {
  return Math.round(120 * (0.6 + state.upgrades.filter * 0.1));
}

/**
 * Set the pour latch explicitly (hold-to-pour UI: press starts the pour,
 * release stops it). Returns the new pouring state. Mutates ONLY
 * state.pouring — flow rate, tick size, and all economy numbers are
 * untouched; the game loop keeps calling pourTick(state) whenever pouring
 * is true, so the poured amount per second is identical to before.
 */
export function setPouring(state, on) {
  state.pouring = on === true;
  return state.pouring;
}

/**
 * Toggle the pour latch (legacy tap interaction; kept for compatibility).
 * The UI now uses setPouring via press-and-hold instead. Returns the new
 * pouring state.
 */
export function togglePour(state) {
  state.pouring = !state.pouring;
  return state.pouring;
}

/**
 * Hold-to-pour interaction helper. press() starts the pour, release() and
 * cancel() stop it (pointercancel / lost-capture fire on iPhone when the OS
 * takes the gesture or the finger slides off). Idempotent: repeat presses
 * don't re-trigger, and release/cancel while idle are no-ops — so a stray
 * pointerup can never leave the pour stuck on or double-log an action.
 */
export function createHoldPour() {
  let pouring = false;
  return {
    isPouring: () => pouring,
    press() {
      pouring = true;
      return true;
    },
    release() {
      if (!pouring) return false;
      pouring = false;
      return true;
    },
    cancel() {
      pouring = false;
      return false;
    },
  };
}

export function sellBars(state) {
  const value = state.bars * barValue(state);
  state.credits += value;
  state.bars = 0;
  return value;
}

export function buyUpgrade(state, kind) {
  const level = state.upgrades[kind];
  const cost = upgradeCost(kind, level);
  if (state.credits < cost) return false;
  state.credits -= cost;
  state.upgrades[kind] = level + 1;
  return true;
}

/**
 * Set the conversion output: 'bars' (batches land in inventory) or
 * 'aether' (batches convert to the true currency). Returns the output
 * now in effect. Unknown values are ignored — the current output holds.
 */
export function setOutput(state, out) {
  if (out === 'bars' || out === 'aether') state.output = out;
  return state.output;
}

/**
 * Upgrade cost in BARS (Merlin's model: bars are the upgrade currency).
 * The credit cost curve divided by a base bar's credit value (72),
 * floored at 1 bar — the same geometric ramp, denominated in bars.
 */
export function upgradeBarCost(kind, level) {
  return Math.max(1, Math.round(upgradeCost(kind, level) / 72));
}

/** Buy an upgrade spending bars. Mirrors buyUpgrade's contract. */
export function buyUpgradeWithBars(state, kind) {
  const level = state.upgrades[kind];
  const cost = upgradeBarCost(kind, level);
  if (state.bars < cost) return false;
  state.bars -= cost;
  state.upgrades[kind] = level + 1;
  return true;
}

export function canSurge(state) {
  return state.now >= state.surgeCooldownUntil;
}

export function activateSurge(state, duration = 12, cooldown = 45) {
  if (!canSurge(state)) return false;
  state.surgeUntil = state.now + duration;
  state.surgeCooldownUntil = state.now + cooldown;
  return true;
}

export function surgeRemaining(state) {
  return Math.max(0, state.surgeUntil - state.now);
}

export function surgeCooldownRemaining(state) {
  return Math.max(0, state.surgeCooldownUntil - state.now);
}
