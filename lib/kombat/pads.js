// lib/kombat/pads.js
//
// Kombat's controller configuration (controller map, Kombat chapter):
// the shell never changes — the configuration adapts to the game.
//
//   DUEL   Movement SQUARE   (Advance · Retreat · Dash In · Dash Back)
//          Combat   TRIANGLE (Punch · Kick · Block-hold)
//          Powers   HEXAGON  (5 specials + Fatality) — HEPTAGON for
//                    the two 6-special fighters (Bugs Bunny, Deadpool)
//   BRAWL  Movement OCTAGON  (8-way compass)
//          Combat   PENTAGON (Punch · Kick · Block · Jump · Dash)
//          Powers   HEXAGON / HEPTAGON, as duel
//
// Camera: fixed arena framing — the dead space rests in Kombat.
// Loadout-driven: the Powers pad's labels are the fighter's REAL
// special names from the data bridge (lib/kombat/loadouts.js), cross-
// checked against the roster (lib/kombat/roster.js); the bridge's
// powersPadSides is the shape-law derivation the tests assert.
//
// Controls arrays read CLOCKWISE FROM THE TOP (wedge 0 = top) — the
// geometry convention of lib/controls/shapes.js.
// Pure module: no DOM, no three.js — headless-testable.

import { getFighter } from './roster.js';
import { getLoadout } from './loadouts.js';

/**
 * The Powers pad's controls for a fighter: every special (ALL live —
 * the equip-2 ritual is retired) + the Fatality wedge, which sleeps
 * dark until FINISH HIM. The Fatality sits at the bottom wedge:
 * index floor(sides/2) in clockwise-from-top order.
 */
export function powersControls(fighterId) {
  const fighter = getFighter(fighterId);
  if (!fighter) return [];
  const loadout = getLoadout(fighterId);
  const bridgeNames = loadout?.powers;
  const names = fighter.specials.map((s, i) =>
    bridgeNames && bridgeNames[i] ? bridgeNames[i] : s.name);
  const controls = names.map((name, i) => ({
    key: `sp${i + 1}`,
    label: name,
    kind: 'press',
    specialIndex: i,
  }));
  const sides = controls.length + 1; // + the Fatality wedge
  const fatality = {
    key: 'fatality',
    label: `Fatality — ${loadout?.fatality || fighter.fatality.name}`,
    shortLabel: 'Fatality',
    kind: 'press',
    fatality: true,
  };
  controls.splice(Math.floor(sides / 2), 0, fatality);
  return controls;
}

/** Shape-law check for one pad: sides == its control count. */
export function padSides(pad) {
  return pad.controls.length;
}

// ------------------------------------------------------------------
// Duel
// ------------------------------------------------------------------
export function duelPads(fighterId) {
  return [
    {
      id: 'movement',
      group: 'Movement',
      baseSize: 132,
      anchor: { side: 'left', bottom: 16 },
      controls: [
        { key: 'dashIn', label: 'Dash In', kind: 'press' },
        { key: 'advance', label: 'Advance', kind: 'analog' },
        { key: 'dashBack', label: 'Dash Back', kind: 'press' },
        { key: 'retreat', label: 'Retreat', kind: 'analog' },
      ],
    },
    {
      id: 'combat',
      group: 'Combat',
      baseSize: 118,
      anchor: { side: 'right', bottom: 16 },
      controls: [
        { key: 'punch', label: 'Punch', kind: 'press' },
        { key: 'kick', label: 'Kick', kind: 'press' },
        { key: 'block', label: 'Block', kind: 'hold' },
      ],
    },
    {
      id: 'powers',
      group: 'Powers',
      baseSize: 128,
      anchor: { side: 'right', bottom: 168 },
      controls: powersControls(fighterId),
    },
  ];
}

// ------------------------------------------------------------------
// Brawl
// ------------------------------------------------------------------
const COMPASS = [
  ['dirN', 'N'], ['dirNE', 'NE'], ['dirE', 'E'], ['dirSE', 'SE'],
  ['dirS', 'S'], ['dirSW', 'SW'], ['dirW', 'W'], ['dirNW', 'NW'],
];

export function brawlPads(fighterId) {
  return [
    {
      id: 'movement',
      group: 'Movement',
      baseSize: 140,
      anchor: { side: 'left', bottom: 16 },
      analogVector: true, // the whole pad is one analog surface
      controls: COMPASS.map(([key, label]) => ({ key, label, kind: 'analog' })),
    },
    {
      id: 'combat',
      group: 'Combat',
      baseSize: 124,
      anchor: { side: 'right', bottom: 16 },
      controls: [
        { key: 'punch', label: 'Punch', kind: 'press' },
        { key: 'kick', label: 'Kick', kind: 'press' },
        { key: 'block', label: 'Block', kind: 'hold' },
        { key: 'jump', label: 'Jump', kind: 'press' },
        { key: 'dash', label: 'Dash', kind: 'press' },
      ],
    },
    {
      id: 'powers',
      group: 'Powers',
      baseSize: 128,
      anchor: { side: 'right', bottom: 176 },
      controls: powersControls(fighterId),
    },
  ];
}
