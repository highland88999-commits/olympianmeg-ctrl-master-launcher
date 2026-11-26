// lib/checker-tracks/tracks.js — Checker Tracks data (pure data).
//
// 11 tracks in the exact Omega 500 record shape, so the Omega geometry
// (buildCenterline / sampleAt / lateralAt) and the lap rule
// (lapsForTrack) work on them unchanged — geometry and laps are imported
// from lib/omega-500/tracks.js, never reimplemented here.
//
// The look comes from Mike Vos Kakis's checkered tunnel reel (UON Visuals):
// a black-and-white checker floor and tunnel walls, neon green / pink /
// blue / purple light trails, and high speed WITH speed variation — fast
// straights into slow twisty sections, never one flat speed. The variation
// is real geometry: strong low harmonics (k=2) make long fast straights,
// strong high harmonics (k=5/7/9) make tight slow corners, and the race
// sim's corner-speed rule (curvatureAhead in lib/omega-500/race.js) does
// the braking for the AI. Grip varies a little per track (0.95–1.0) so
// each one brakes differently.
//
// Demo gate: the demo track is a DEDICATED short record
// ('checker-tunnel-demo'), not a crippled hero — a free taste should be a
// complete short loop, and the hero stays a full paid track. The other
// 10 tracks (hero + 9) need an active subscription.

import {
  RACE_DISTANCES,
  DEFAULT_DISTANCE_MILES,
  lapsForTrack,
} from '../omega-500/tracks.js';

export { RACE_DISTANCES, DEFAULT_DISTANCE_MILES, lapsForTrack };

export const CHECKER_TRACKS = [
  // ---- Hero: Mike's reel, as a track ----
  {
    id: 'uon-checker-tunnel', name: 'UON Checker Tunnel', type: 'themed',
    lengthMiles: 2.4, turns: 14, banking: 'tunnel — flat out, then hard on the brakes', surface: 'checker',
    widthM: 14, grip: 1.0, shape: { kind: 'circuit', harmonics: [[2, 0.20, 0], [5, 0.12, 1.1], [7, 0.07, 2.0]] },
    theme: { sky: '#05050f', ground: '#0b0b0b', wall: '#39ff14' },
    blurb: 'The reel itself — checker floor, neon trails, fast straights into slow twists. Named for Mike Vos Kakis / UON Visuals.',
  },
  // ---- Demo: free for everyone ----
  {
    id: 'checker-tunnel-demo', name: 'Checker Tunnel — Demo Loop', type: 'themed',
    lengthMiles: 0.9, turns: 6, banking: 'tunnel — short and sweet', surface: 'checker',
    widthM: 14, grip: 1.0, shape: { kind: 'circuit', harmonics: [[2, 0.16, 0.4], [3, 0.10, 1.0]] },
    theme: { sky: '#05050f', ground: '#0b0b0b', wall: '#ff2bd6' },
    blurb: 'The free taste — one short checker loop with the pink trail. No subscription needed.',
  },
  // ---- The other nine, en suite ----
  {
    id: 'neon-pink-loop', name: 'Neon Pink Loop', type: 'speedway',
    lengthMiles: 1.5, turns: 4, banking: '22-degree banking', surface: 'checker',
    widthM: 14, grip: 1.0, shape: { kind: 'oval', radiusA: 160, radiusB: 120 },
    theme: { sky: '#12041a', ground: '#0b0b0b', wall: '#ff2bd6' },
    blurb: 'A pink-lit tri-oval — flat out the whole lap, one long neon breath.',
  },
  {
    id: 'volt-blue-circuit', name: 'Volt Blue Circuit', type: 'road',
    lengthMiles: 3.1, turns: 16, banking: 'rolling sweepers', surface: 'checker',
    widthM: 12, grip: 0.98, shape: { kind: 'circuit', harmonics: [[3, 0.17, 0.7], [5, 0.11, 1.9], [6, 0.06, 0.4]] },
    theme: { sky: '#040818', ground: '#0b0b0b', wall: '#2b7fff' },
    blurb: 'Sixteen blue-lit corners — the thinking driver’s checker lap.',
  },
  {
    id: 'violet-vortex', name: 'Violet Vortex', type: 'themed',
    lengthMiles: 2.0, turns: 7, banking: 'spiralling descent', surface: 'checker',
    widthM: 12, grip: 1.0, shape: { kind: 'circuit', harmonics: [[2, 0.25, 0], [3, 0.12, 1.0]] },
    theme: { sky: '#0d0518', ground: '#0b0b0b', wall: '#a855f7' },
    blurb: 'Seven corners winding down the violet vortex.',
  },
  {
    id: 'green-glow-speedway', name: 'Green Glow Speedway', type: 'speedway',
    lengthMiles: 2.5, turns: 4, banking: '31-degree banking', surface: 'checker',
    widthM: 15, grip: 1.0, shape: { kind: 'oval', radiusA: 220, radiusB: 220 },
    theme: { sky: '#04120a', ground: '#0b0b0b', wall: '#39ff14' },
    blurb: 'The green speedway — wide, banked, full throttle under the glow.',
  },
  {
    id: 'checker-chicane', name: 'Checker Chicane', type: 'street',
    lengthMiles: 1.8, turns: 12, banking: 'tight chicanes', surface: 'checker',
    widthM: 10, grip: 0.97, shape: { kind: 'circuit', harmonics: [[4, 0.16, 0], [3, 0.10, 1.4]] },
    theme: { sky: '#12041a', ground: '#0b0b0b', wall: '#ff2bd6' },
    blurb: 'Twelve pink chicanes in a tight loop — brake late, thread it.',
  },
  {
    id: 'midnight-mirror-mile', name: 'Midnight Mirror Mile', type: 'speedway',
    lengthMiles: 1.0, turns: 4, banking: '18-degree banking', surface: 'checker',
    widthM: 14, grip: 1.0, shape: { kind: 'oval', radiusA: 110, radiusB: 110 },
    theme: { sky: '#040818', ground: '#0b0b0b', wall: '#2b7fff' },
    blurb: 'A flat-out blue mile — short laps, bumper to bumper.',
  },
  {
    id: 'prism-switchbacks', name: 'Prism Switchbacks', type: 'road',
    lengthMiles: 4.2, turns: 19, banking: 'hairpins', surface: 'checker',
    widthM: 11, grip: 0.96, shape: { kind: 'circuit', harmonics: [[3, 0.18, 0.5], [5, 0.12, 1.3], [7, 0.08, 0.2], [9, 0.05, 1.9]] },
    theme: { sky: '#0d0518', ground: '#0b0b0b', wall: '#a855f7' },
    blurb: 'Nineteen violet hairpins — the hardest, slowest, twistiest lap here.',
  },
  {
    id: 'strobe-straights', name: 'Strobe Straights', type: 'road',
    lengthMiles: 2.8, turns: 10, banking: 'long straights, tight kinks', surface: 'checker',
    widthM: 12, grip: 1.0, shape: { kind: 'circuit', harmonics: [[2, 0.22, 0], [4, 0.08, 0.7]] },
    theme: { sky: '#04120a', ground: '#0b0b0b', wall: '#39ff14' },
    blurb: 'Green strobe straights with a kink at the end of each — flat out, then stand on it.',
  },
  {
    id: 'tunnel-twist', name: 'Tunnel Twist', type: 'themed',
    lengthMiles: 3.6, turns: 17, banking: 'tunnel — endless bends', surface: 'checker',
    widthM: 12, grip: 0.97, shape: { kind: 'circuit', harmonics: [[3, 0.20, 1.5], [4, 0.12, 0.6], [6, 0.07, 1.3]] },
    theme: { sky: '#05050f', ground: '#0b0b0b', wall: '#2b7fff' },
    blurb: 'Seventeen blue bends down the tunnel — never a straight line for long.',
  },
];

const TRACK_BY_ID = new Map(CHECKER_TRACKS.map((t) => [t.id, t]));

/** Checker track record by id, or null. */
export function getCheckerTrack(id) {
  return typeof id === 'string' ? TRACK_BY_ID.get(id) || null : null;
}

/** All 11 checker tracks, in picker order. */
export function listCheckerTracks() {
  return CHECKER_TRACKS;
}

/** The one free track — playable without a subscription. */
export const DEMO_TRACK_ID = 'checker-tunnel-demo';

/** The hero track — Mike's reel, as a track. */
export const HERO_TRACK_ID = 'uon-checker-tunnel';

/** True when the track is free for everyone (the demo loop only). */
export function isFreeTrack(id) {
  return id === DEMO_TRACK_ID;
}
