// Room data for the Obsidian Estate. Pure data, no network.
// Rebuilt from the Omega-Mansion repo ("Nexus Vortex – The Obsidian Estate"),
// a 3D mansion scene driven by remote video textures. Here each room is
// described in data and drawn procedurally on canvas.

export const ROOMS = [
  {
    id: 'grand-foyer',
    name: 'Grand Foyer',
    feature: 'chandelier',
    desc: 'A double-height hall of black marble. A crystal chandelier hangs like a frozen firework, and every footstep comes back twice.',
    palette: { wallTop: '#0b0714', wallBottom: '#1c1030', floor: '#0a0612', accent: '#ffd77a', glow: '#ff9d4d' },
  },
  {
    id: 'observatory',
    name: 'Observatory',
    feature: 'telescope',
    desc: 'The dome is open to the night. Brass instruments track slow constellations while the wind reads the star charts aloud.',
    palette: { wallTop: '#02040c', wallBottom: '#0a1230', floor: '#05070f', accent: '#7db9ff', glow: '#4d7dff' },
  },
  {
    id: 'vortex-chamber',
    name: 'Vortex Chamber',
    feature: 'vortex',
    desc: 'A sealed round room with a contained storm turning at its heart. The estate draws its strange power from here. Do not touch the glass.',
    palette: { wallTop: '#0d0212', wallBottom: '#2a0a33', floor: '#0d0512', accent: '#ff4dff', glow: '#b14dff' },
  },
  {
    id: 'library',
    name: 'Library of Hours',
    feature: 'shelves',
    desc: 'Floor-to-ceiling shelves of books that have never been opened and never will be. The ladders move on their own at midnight.',
    palette: { wallTop: '#120a04', wallBottom: '#2e1c0d', floor: '#0f0903', accent: '#ffb14d', glow: '#ff7a2e' },
  },
  {
    id: 'conservatory',
    name: 'Glass Conservatory',
    feature: 'plants',
    desc: 'A greenhouse of impossible plants that glow faintly and lean toward visitors, politely, like they are listening.',
    palette: { wallTop: '#02120a', wallBottom: '#0a3320', floor: '#04120a', accent: '#7dffb0', glow: '#2eff8a' },
  },
  {
    id: 'throne-room',
    name: 'Throne of Obsidian',
    feature: 'throne',
    desc: 'At the far end of a long dark hall sits a single chair cut from one piece of volcanic glass. It is always slightly warm.',
    palette: { wallTop: '#0a0a12', wallBottom: '#141422', floor: '#080810', accent: '#b18cff', glow: '#7a4dff' },
  },
];

export function getRoom(id) {
  return ROOMS.find((r) => r.id === id) || ROOMS[0];
}

export function roomIndex(id) {
  const i = ROOMS.findIndex((r) => r.id === id);
  return i === -1 ? 0 : i;
}

export function nextRoom(id, dir) {
  const i = roomIndex(id);
  const n = ROOMS.length;
  return ROOMS[((i + dir) % n + n) % n].id;
}
