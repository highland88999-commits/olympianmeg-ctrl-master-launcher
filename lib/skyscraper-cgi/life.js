/**
 * lib/skyscraper-cgi/life.js — the life of the vertical city (Merlin, Nov 15, 2026).
 *
 * The tower had no life at height: no lit windows that belong to
 * anyone, nothing moving past the glass. This module is the
 * tower's life, and it follows the operator rule — a pure function
 * of (place, kind, device clock), no stored state, no server, no
 * fake counts. Nothing here invents people: the tower's life is
 * its windows, its air traffic, and its crown beacon.
 *
 * - The lit windows live in the facade texture itself
 *   (lib/skyscraper-cgi/textures.js facadeWindowTable): seeded,
 *   ~55% lit, warm or cool — the same windows on every phone.
 *   Live per-window flicker would mean repainting the shared
 *   emissive texture every frame; that is flagged as the honest
 *   next step, not faked here.
 * - AIR TAXIS: six glowing craft circling the tower shaft at
 *   staggered heights and radii, on the real clock (the same
 *   devilFor shape from lib/planet-cgi/motion.js: index + clock
 *   in, position + heading out). They are traffic, not people —
 *   no passenger count is ever claimed.
 * - The crown beacon pulses on the clock so the tower top reads
 *   from the city below.
 */

import { PLANET_CGI_EPOCH_MS } from '../planet-cgi/motion.js';

export const AIR_TAXI_COUNT = 6;
export const AIR_TAXI_COLORS = ['#00f0ff', '#ff00ff', '#ffaa00', '#00ff88', '#ff4466', '#88ccff'];
// The tower shaft stands at z = -20; the taxis circle that axis.
export const AIR_TAXI_CENTRE_Z = -20;
export const AIR_TAXI_RADIUS_MIN_M = 130;
export const AIR_TAXI_RADIUS_STEP_M = 26;
export const AIR_TAXI_HEIGHT_BASE_M = -420;
export const AIR_TAXI_HEIGHT_STEP_M = 100;

/**
 * Air taxi `index` at `nowMs`: { x, y, z, heading, color, blink }.
 * Each taxi holds its own orbit — radius and height staggered by
 * index, direction alternating so the traffic reads two-way, a
 * slow vertical bob, and a beacon blink (a 15% duty cycle, offset
 * per taxi). Pure function of the clock: deterministic,
 * node-testable. `heading` is the yaw the craft flies at (rad).
 */
export function airTaxiFor(index, nowMs = Date.now()) {
  const i = Math.max(0, Math.floor(Number(index) || 0));
  const t = (Number(nowMs) - PLANET_CGI_EPOCH_MS) / 1000;
  const radius = AIR_TAXI_RADIUS_MIN_M + (i % AIR_TAXI_COUNT) * AIR_TAXI_RADIUS_STEP_M;
  const height = AIR_TAXI_HEIGHT_BASE_M + (i % AIR_TAXI_COUNT) * AIR_TAXI_HEIGHT_STEP_M;
  const direction = i % 2 === 0 ? 1 : -1;
  const speed = (0.03 + (i % AIR_TAXI_COUNT) * 0.004) * direction;
  const phase = i * 1.1;
  const angle = phase + speed * t;
  const x = Math.cos(angle) * radius;
  const z = AIR_TAXI_CENTRE_Z + Math.sin(angle) * radius;
  const y = height + 12 * Math.sin(t * 0.11 + i * 2);
  const heading = angle + (direction > 0 ? Math.PI / 2 : -Math.PI / 2);
  const blink = ((t * 1.5 + i * 0.37) % 1) < 0.15;
  return {
    x, y, z, heading,
    color: AIR_TAXI_COLORS[i % AIR_TAXI_COLORS.length],
    blink,
  };
}

/**
 * The crown beacon at `nowMs`: 0..1, a slow pulse with a
 * double-blink riding on it — the tower top signalling to the
 * city below. Pure function of the clock.
 */
export function elevatorBeaconAt(nowMs = Date.now()) {
  const t = (Number(nowMs) - PLANET_CGI_EPOCH_MS) / 1000;
  const pulse = 0.55 + 0.45 * Math.sin((t / 2.4) * Math.PI * 2);
  const phase = t % 1.6;
  const blink = phase < 0.12 || (phase > 0.3 && phase < 0.42) ? 1 : 0.35;
  return Math.max(0, Math.min(1, pulse * (0.6 + 0.4 * blink)));
}
