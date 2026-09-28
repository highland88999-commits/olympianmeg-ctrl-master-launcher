/**
 * Olympus Energy Grid — deterministic grid simulator. Pure logic, no DOM, no network.
 * Simulates solar, wind, demand and a battery over a 24h cycle.
 */

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Sun factor for hour h (0..24): smooth day curve peaking at 13:00. */
export function sunFactor(hour) {
  const x = (hour - 6) / 12; // 0 at 6:00, 1 at 18:00
  if (x <= 0 || x >= 1) return 0;
  return Math.pow(Math.sin(Math.PI * x), 1.4);
}

/** Wind turbine output fraction for wind speed m/s (cut-in 3, rated 12, cut-out 25). */
export function windFactor(speed) {
  if (speed < 3 || speed > 25) return 0;
  if (speed >= 12) return 1;
  const x = (speed - 3) / 9;
  return x * x * x;
}

/** Demand kW at hour h with seeded variation; base scaled by demand setting. */
export function demandAt(hour, demandKW, rngVal) {
  const morning = Math.exp(-Math.pow(hour - 8, 2) / 6);
  const evening = Math.exp(-Math.pow(hour - 19, 2) / 8);
  const night = 0.55 + 0.1 * Math.sin(hour * 0.7);
  const shape = 0.35 + 0.4 * morning + 0.65 * evening + 0.25 * night;
  return demandKW * shape * (0.92 + rngVal * 0.16);
}

/**
 * Simulate one day in 96 quarter-hour steps.
 * cfg: { solarKW, turbines, turbineKW, windSpeed, cloud, demandKW, batteryKWh, seed }
 * Returns { steps: [{hour, solar, wind, demand, gen, net, battery, grid}], totals }
 */
export function simulateDay(cfg) {
  const rng = mulberry32(cfg.seed ?? 42);
  const steps = [];
  let battery = (cfg.batteryKWh ?? 40) * 0.5;
  const cap = Math.max(1, cfg.batteryKWh ?? 40);
  let kwhGen = 0, kwhUsed = 0, kwhGrid = 0, kwhCurtailed = 0;

  for (let i = 0; i < 96; i++) {
    const hour = i / 4;
    const cloudFlicker = 0.85 + rng() * 0.3;
    const solar = (cfg.solarKW ?? 20) * sunFactor(hour) * (1 - (cfg.cloud ?? 0.3) * 0.85) * cloudFlicker;
    const wind = (cfg.turbines ?? 2) * (cfg.turbineKW ?? 5) * windFactor((cfg.windSpeed ?? 7) * (0.7 + rng() * 0.6));
    const demand = demandAt(hour, cfg.demandKW ?? 18, rng());
    const gen = Math.max(0, solar + wind);
    const net = gen - demand;
    kwhGen += gen / 4;
    kwhUsed += demand / 4; // demand is always served (gen, battery, or grid)

    if (net >= 0) {
      const store = Math.min(net / 4, cap - battery);
      battery += store;
      kwhCurtailed += Math.max(0, net / 4 - store);
    } else {
      const draw = Math.min(-net / 4, battery);
      battery -= draw;
      kwhGrid += Math.max(0, -net / 4 - draw);
    }
    steps.push({
      hour, solar, wind, demand, gen,
      batteryPct: battery / cap,
      gridImport: net < 0 ? Math.max(0, -net - Math.min(battery * 4 + net, 0)) : 0,
    });
  }
  return {
    steps,
    totals: {
      generated: kwhGen,
      consumed: kwhUsed,
      gridImport: kwhGrid,
      curtailed: kwhCurtailed,
      selfSufficiency: kwhUsed > 0 ? Math.max(0, Math.min(1, (kwhUsed - kwhGrid) / kwhUsed)) : 0,
    },
  };
}

/** Format hour as HH:MM. */
export function fmtHour(h) {
  const hh = Math.floor(h);
  const mm = Math.round((h - hh) * 60);
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}
