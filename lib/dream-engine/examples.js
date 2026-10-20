// lib/dream-engine/examples.js
// Example dream prompts for the start panel chips + the "Surprise Me" pool.
// Written to show off the full object vocabulary and the dreamlike rendering:
// impossible scale, floating things, melting time, endless architecture.

export const EXAMPLE_DREAMS = [
  'A hallway that stretches forever, with a clock melting on the wall and candles floating past',
  'I was standing on a small island in a silver sea, under a violet sky, and a staircase climbed into the clouds',
  'A forest of giant mushrooms glowing teal, snow falling upward, and a golden gate that led nowhere',
  'My childhood home, but every door opened onto the ocean, and the moon was close enough to touch',
  'A crystal tower in a desert of black dunes, with rings of light turning slowly above it',
  'I was falling very slowly through a library of floating books and mirrors, at dawn',
];

export const SURPRISE_DREAMS = [
  'A bridge across a canyon of clouds, lined with candles, while paper petals drift through a green sky',
  'An underwater cathedral — domes and arches in deep blue water, sparks of light rising like bubbles',
  'A single enormous tree on a floating rock, its leaves made of tiny mirrors, above a sea of fog',
  'A desert at midnight where pyramids hum with amber light and a river of stars crosses the sand',
  'A train station in the sky: platforms, gates and staircases floating among pink clouds, everything weightless',
  'A garden of stone spheres and obelisks after rain, everything wet and shining, fireflies everywhere',
  'The inside of a clock: gears as golden rings, pillars of numbers, a pendulum moon swinging slowly',
  'A mountain that is also a sleeping face, waterfalls for tears, and a door in its forehead glowing warm',
];

export function randomSurprise(exclude) {
  const pool = SURPRISE_DREAMS.filter((d) => d !== exclude);
  return pool[Math.floor(Math.random() * pool.length)] || SURPRISE_DREAMS[0];
}
