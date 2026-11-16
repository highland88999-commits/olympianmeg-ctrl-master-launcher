/**
 * lib/skyscraper-cgi/weather.js — wind and cloud at tower height (Merlin, Nov 15, 2026).
 *
 * The tower stands 730 m tall and the old sky had no weather at
 * all — the clouds sat still. This module owns the high-altitude
 * wind the same way lib/mars2/weather.js owns the Thule wind: a
 * direction and a speed that vary on the real clock, pure
 * functions of the device clock, so the same place + same time =
 * the same wind on every phone. No stored state, no server tick,
 * no new real lights.
 *
 * Worker's-choice numbers (Merlin gave no numbers — flag if he
 * wants them tuned): prevailing from the west (270°), base
 * 12 m/s at tower height, gusts 6–28 m/s on a 47 s cycle, veer
 * ±20° over 4 minutes. The mid-level cloud bank drifts around
 * the tower on that wind, one slow orbit every 5 minutes.
 *
 * Compass convention (shared with the Mars 2 Thule wind):
 * heading 0 faces -Z, so north is -Z and a bearing is clockwise
 * from -Z. The wind vector is the direction the air TRAVELS
 * (bearing + 180°): a wind FROM the west (270°) blows towards
 * the east.
 */

import { PLANET_CGI_EPOCH_MS } from '../planet-cgi/motion.js';

export const TOWER_WIND_NAME = 'Tower wind';
export const TOWER_WIND_BEARING_DEG = 270; // prevailing FROM the west
export const TOWER_WIND_VEER_DEG = 20; // slow veer either side of prevailing
export const TOWER_WIND_VEER_PERIOD_S = 240; // one full veer cycle, 4 minutes
export const TOWER_WIND_BASE_MPS = 12; // prevailing speed at tower height
export const TOWER_WIND_GUST_MIN_MPS = 6; // the lull between gusts
export const TOWER_WIND_GUST_MAX_MPS = 28; // a proper high-altitude gust
export const TOWER_WIND_GUST_PERIOD_S = 47; // one gust cycle

export const CLOUD_BANK_Y = -120; // mid-tower height: the bank wraps the shaft
export const CLOUD_BANK_ORBIT_RADIUS_M = 320;
export const CLOUD_BANK_ORBIT_PERIOD_S = 300; // one slow orbit, 5 minutes

const COMPASS_8 = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

/** 8-point compass label for a bearing in degrees. */
export function windCompass(bearingDeg) {
  const b = (((bearingDeg % 360) + 360) % 360);
  return COMPASS_8[Math.round(b / 45) % 8];
}

/**
 * Travel unit vector (x, z) for a wind FROM `bearingDeg`.
 * Bearings are compass bearings clockwise from north (-Z): a
 * wind FROM the west (270°) travels to the east, (+x, 0).
 */
export function windVector(bearingDeg) {
  const rad = (bearingDeg * Math.PI) / 180;
  return { x: -Math.sin(rad), z: Math.cos(rad) };
}

/**
 * The Tower wind at `nowMs`: { speed, bearingDeg, dirX, dirZ, gust }.
 * Speed rides a gust envelope (two slow sines, 47 s cycle) around
 * the 12 m/s base, clamped to the 6–28 m/s gust range; the bearing
 * veers slowly ±20° around the 270° prevailing. `gust` is 0..1 —
 * 0 in the lull, 1 at the top of a gust. Pure function of the
 * clock: deterministic, node-testable.
 */
export function towerWindAt(nowMs = Date.now()) {
  const t = (Number(nowMs) - PLANET_CGI_EPOCH_MS) / 1000;
  const gustWave = 0.62 * Math.sin((t / TOWER_WIND_GUST_PERIOD_S) * Math.PI * 2)
    + 0.38 * Math.sin((t / 13.7) * Math.PI * 2 + 1.3);
  const speed = Math.max(
    TOWER_WIND_GUST_MIN_MPS,
    Math.min(
      TOWER_WIND_GUST_MAX_MPS,
      TOWER_WIND_BASE_MPS + gustWave * 8,
    ),
  );
  const bearingDeg = TOWER_WIND_BEARING_DEG
    + TOWER_WIND_VEER_DEG * Math.sin((t / TOWER_WIND_VEER_PERIOD_S) * Math.PI * 2 + 0.7);
  const dir = windVector(bearingDeg);
  return {
    speed,
    bearingDeg,
    dirX: dir.x,
    dirZ: dir.z,
    gust: (speed - TOWER_WIND_GUST_MIN_MPS)
      / (TOWER_WIND_GUST_MAX_MPS - TOWER_WIND_GUST_MIN_MPS),
  };
}

/**
 * Where the mid-level cloud bank sits at `nowMs`: { x, z } — a
 * slow orbit around the tower shaft, its radius breathing with
 * the gust envelope so the bank visibly swells in a gust. Pure
 * function of the clock; the scene only positions what this says.
 * The bank itself lives at CLOUD_BANK_Y (mid-tower).
 */
export function cloudBankAt(nowMs = Date.now()) {
  const wind = towerWindAt(nowMs);
  const t = (Number(nowMs) - PLANET_CGI_EPOCH_MS) / 1000;
  const angle = (t / CLOUD_BANK_ORBIT_PERIOD_S) * Math.PI * 2;
  const radius = CLOUD_BANK_ORBIT_RADIUS_M * (1 + wind.gust * 0.25);
  return {
    x: Math.cos(angle) * radius,
    z: Math.sin(angle) * radius,
    gust: wind.gust,
  };
}
