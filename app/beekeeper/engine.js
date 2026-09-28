/**
 * beekeeper — cyber bee-ecology logic.
 * Waggle-dance encode/decode math and the hive-thermostat simulator.
 * No DOM, no network. Unit-testable in Node.
 */

/** Normalize degrees to [0, 360). */
export function normDeg(d) {
  return ((d % 360) + 360) % 360;
}

/** Smallest angular difference between two bearings, in degrees (0..180). */
export function angleDiff(a, b) {
  const d = Math.abs(normDeg(a) - normDeg(b));
  return d > 180 ? 360 - d : d;
}

/**
 * Encode a flower's location as a waggle dance.
 * angleDeg: bearing clockwise from the sun's azimuth.
 * distanceM: metres from the hive.
 * Real-world rule of thumb mirrored here: duration grows with distance.
 */
export function waggleEncode(angleDeg, distanceM) {
  const waggleAngleDeg = normDeg(angleDeg);
  const waggleDurationMs = Math.round(
    Math.min(4000, Math.max(300, 300 + distanceM * 0.9))
  );
  return { waggleAngleDeg, waggleDurationMs };
}

/** Invert the encoding. */
export function waggleDecode(waggleAngleDeg, waggleDurationMs) {
  return {
    angleDeg: normDeg(waggleAngleDeg),
    distanceM: Math.max(0, Math.round((waggleDurationMs - 300) / 0.9)),
  };
}

/** The foraging field: flowers at bearings (clockwise from sun) and distances. */
export const FLOWERS = [
  { id: "aster", name: "Aster Patch", angleDeg: 25, distanceM: 220 },
  { id: "cosmos", name: "Cosmos Field", angleDeg: 95, distanceM: 640 },
  { id: "clover", name: "Clover Meadow", angleDeg: 160, distanceM: 1200 },
  { id: "sunflower", name: "Sunflower Row", angleDeg: 215, distanceM: 450 },
  { id: "lavender", name: "Lavender Bank", angleDeg: 285, distanceM: 900 },
  { id: "coneflower", name: "Coneflower Stand", angleDeg: 330, distanceM: 1800 },
];

/** Score a decode attempt: 100 for exact, decaying with angular/distance error. */
export function scoreDecode(target, guessAngleDeg, guessDistanceM) {
  const aErr = angleDiff(target.angleDeg, guessAngleDeg);
  const dErr = Math.abs(target.distanceM - guessDistanceM);
  const aScore = Math.max(0, 70 * (1 - aErr / 90));
  const dScore = Math.max(0, 30 * (1 - dErr / 1200));
  return Math.round(aScore + dScore);
}

// ---------- hive thermostat ----------

export const BAND_LO = 32;
export const BAND_HI = 35;

export const WEATHER_EVENTS = [
  { name: "MILD DAY", ambient: 27, desc: "Gentle drift toward 27°C" },
  { name: "COLD SNAP", ambient: 16, desc: "Brood is losing heat fast" },
  { name: "HEAT WAVE", ambient: 41, desc: "Brood is overheating" },
  { name: "NIGHT CHILL", ambient: 20, desc: "Steady cooling pressure" },
  { name: "SUN BREAK", ambient: 33, desc: "Almost no intervention needed" },
];

/**
 * One thermostat tick.
 * temp: current brood temp °C; actions: { heater, fan } booleans;
 * ambient: outside temp °C; dt: seconds.
 */
export function thermoStep(temp, actions, ambient, dt) {
  const driftRate = 0.12; // per second toward ambient
  let t = temp + (ambient - temp) * driftRate * dt;
  if (actions.heater) t += 3.2 * dt; // shivering flight muscles
  if (actions.fan) t -= 3.8 * dt; // fanning + evaporative cooling
  return Math.min(45, Math.max(12, t));
}

export function inBand(temp) {
  return temp >= BAND_LO && temp <= BAND_HI;
}

export function pickWeather(rand = Math.random) {
  return WEATHER_EVENTS[Math.floor(rand() * WEATHER_EVENTS.length)];
}
