// Hub content: the sectors of the Nexus. Pure data, no network.
// Rebuilt from the Omega-Hub repo ("NEXUS • Sector Gateway"): the source
// listed worlds/portals pulled from a cloud database and rendered a 3D hub.
// Here the sectors are local data with procedural palettes.

export const SECTORS = [
  {
    id: 'nexus-prime',
    name: 'NEXUS PRIME',
    tag: 'HUB CORE',
    desc: 'The central junction. Every portal in the network routes through the Prime ring.',
    palette: { skyTop: '#010409', skyBottom: '#062a3a', accent: '#00f0ff', ground: '#03141c' },
    hazard: 0,
  },
  {
    id: 'obsidian-reef',
    name: 'OBSIDIAN REEF',
    tag: 'DEEP FIELD',
    desc: 'A dark expanse of floating glass shards. Quiet, cold, and beautiful from a distance.',
    palette: { skyTop: '#05010d', skyBottom: '#1c0a33', accent: '#b14dff', ground: '#0d0616' },
    hazard: 1,
  },
  {
    id: 'vortex-fields',
    name: 'VORTEX FIELDS',
    tag: 'STORM BELT',
    desc: 'Churning energy storms. Ships cross fast and do not stop.',
    palette: { skyTop: '#0d0202', skyBottom: '#3a0a1e', accent: '#ff4d6d', ground: '#160609' },
    hazard: 2,
  },
  {
    id: 'quiet-harbor',
    name: 'QUIET HARBOR',
    tag: 'SAFE ZONE',
    desc: 'A calm anchorage where travelers rest, trade stories, and repair their rigs.',
    palette: { skyTop: '#01120c', skyBottom: '#0a3a24', accent: '#00ffaa', ground: '#04160e' },
    hazard: 0,
  },
];

export function getSector(id) {
  return SECTORS.find((s) => s.id === id) || SECTORS[0];
}

export const HAZARD_LABEL = ['CALM', 'WATCHFUL', 'SEVERE'];
