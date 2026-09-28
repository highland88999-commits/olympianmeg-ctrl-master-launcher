// Aetheris UNIT_07 — pure simulation logic (no DOM, fully testable).

export const UNIT_ID = 'AETHERIS-7_CAN_ALTA_001';
export const FILTER_LIFE_MONTHS = 9; // nominal filter life, mid-point of 6-12 months

// Filter life degrades 1.0 -> 0 over FILTER_LIFE_MONTHS of simulated time.
// tickUnit advances the sim by dtMonths.
export function createUnitState() {
  return {
    filterLife: 1.0,          // 0..1
    online: true,
    swapping: false,
    swapStageIndex: -1,
    swapStageElapsed: 0,
    totalAirCleanedM3: 0,     // cumulative m^3 processed
    swapsPerformed: 0,
    log: ['UNIT_07 online. Filters at 100%.'],
  };
}

export function pressureDropKpa(filterLife) {
  // Clean filter: ~0.25 kPa. Clogged filter: ~1.4 kPa.
  const l = Math.min(1, Math.max(0, filterLife));
  return 0.25 + (1 - l) * 1.15;
}

export function flowRateM3h(filterLife) {
  // Nominal 30,000 m^3/h at full filter health, sagging as it clogs.
  const l = Math.min(1, Math.max(0, filterLife));
  return 30000 * (0.72 + 0.28 * l);
}

export function statusFor(state) {
  if (state.swapping) return 'MAINTENANCE';
  if (!state.online) return 'OFFLINE';
  if (state.filterLife < 0.15) return 'CRITICAL';
  if (state.filterLife < 0.4) return 'DEGRADED';
  return 'SYNCED';
}

export const SWAP_STAGES = [
  { id: 'shutdown', label: 'Fans spinning down', durationSec: 2 },
  { id: 'vent', label: 'Column venting to safe pressure', durationSec: 2 },
  { id: 'replace', label: 'Filter panels replaced (6x HEPA H14)', durationSec: 3 },
  { id: 'seal', label: 'Column resealed, leak check', durationSec: 2 },
  { id: 'spinup', label: 'Fans spinning up, flow restored', durationSec: 2 },
];

export function canStartSwap(state) {
  return state.online && !state.swapping;
}

export function startSwap(state) {
  if (!canStartSwap(state)) return false;
  state.swapping = true;
  state.online = false;
  state.swapStageIndex = 0;
  state.swapStageElapsed = 0;
  state.log.push('Filter swap initiated by operator.');
  state.log.push('Stage 1/5: ' + SWAP_STAGES[0].label + '.');
  return true;
}

// Advance a swap in progress by dtSec. Returns true when the swap completed this tick.
export function advanceSwap(state, dtSec) {
  if (!state.swapping) return false;
  let remaining = dtSec;
  while (remaining > 0 && state.swapping) {
    const stage = SWAP_STAGES[state.swapStageIndex];
    const need = stage.durationSec - state.swapStageElapsed;
    const step = Math.min(need, remaining);
    state.swapStageElapsed += step;
    remaining -= step;
    if (state.swapStageElapsed >= stage.durationSec) {
      state.swapStageIndex += 1;
      state.swapStageElapsed = 0;
      if (state.swapStageIndex >= SWAP_STAGES.length) {
        state.swapping = false;
        state.swapStageIndex = -1;
        state.online = true;
        state.filterLife = 1.0;
        state.swapsPerformed += 1;
        state.log.push('Swap complete. Filters at 100%. Unit back online.');
        return true;
      }
      state.log.push(
        'Stage ' + (state.swapStageIndex + 1) + '/5: ' + SWAP_STAGES[state.swapStageIndex].label + '.'
      );
    }
  }
  return false;
}

// Advance normal operation by dtMonths (simulated months).
export function tickUnit(state, dtMonths) {
  if (state.swapping || !state.online) return;
  const before = state.filterLife;
  state.filterLife = Math.max(0, state.filterLife - dtMonths / FILTER_LIFE_MONTHS);
  // Accumulate cleaned air at the current flow rate.
  const hours = dtMonths * 30 * 24;
  state.totalAirCleanedM3 += flowRateM3h(before) * hours;
  if (before >= 0.4 && state.filterLife < 0.4) {
    state.log.push('Warning: filter integrity below 40%. Schedule a swap.');
  }
  if (before >= 0.15 && state.filterLife < 0.15) {
    state.log.push('Critical: filter integrity below 15%. Swap required.');
  }
}
