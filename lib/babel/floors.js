// BABEL — floor registry. Each floor of the tower is a pocket universe.
// Mythic single-word names, Greek and beyond.

export const FLOORS = Object.freeze([
  {
    id: 'vault',
    name: 'The Vault',
    subtitle: "Miles' legacy vault",
    mythos: 'The foundation stone — what is kept here outlasts the tower.',
    kind: 'route',
    route: '/babel/vault',
    texture: '/textures/babel/VaultDoor/vault-door.jpg',
    accent: '#d4a24e',
    order: 0,
  },
  {
    id: 'sylva',
    name: 'Sylva',
    subtitle: 'The endless forest',
    mythos: 'Latin for forest — a living wood where day and night chase each other.',
    kind: 'scene',
    texture: '/textures/babel/FloorSylva/forest-floor.jpg',
    accent: '#4ade80',
    order: 1,
  },
  {
    id: 'duat',
    name: 'Duat',
    subtitle: 'The desert of the dead',
    mythos: 'The Egyptian underworld — pyramids, obelisks, and an unblinking sun.',
    kind: 'scene',
    texture: '/textures/babel/FloorDuat/sandstone.jpg',
    accent: '#f5b942',
    order: 2,
  },
  {
    id: 'avalon',
    name: 'Avalon',
    subtitle: 'The misty isle',
    mythos: 'Arthurian legend — standing stones circle a sword that waits.',
    kind: 'scene',
    texture: '/textures/babel/FloorAvalon/standing-stone.jpg',
    accent: '#9db8c9',
    order: 3,
  },
  {
    id: 'hermes',
    name: 'Hermes',
    subtitle: "The messenger's terminal",
    mythos: 'Greek messenger of the gods — a retro terminal room humming with signals.',
    kind: 'scene',
    texture: '/textures/babel/FloorHermes/terminal-panels.jpg',
    accent: '#f0a35e',
    order: 4,
  },
  {
    id: 'aquarium',
    name: 'The Overlook',
    subtitle: 'Viewport over the wall',
    mythos: 'At the crown of the tower, a window opens onto living water.',
    kind: 'aquarium',
    accent: '#38bdf8',
    order: 5,
  },
]);

export function getFloor(id) {
  return FLOORS.find((f) => f.id === id) || null;
}

/** Integrity checks for the registry — used by tests and the page. */
export function validateFloors() {
  const errors = [];
  const ids = new Set();
  const orders = new Set();
  for (const f of FLOORS) {
    if (!f.id || typeof f.id !== 'string') errors.push('A floor is missing its id.');
    else if (ids.has(f.id)) errors.push(`Duplicate floor id: ${f.id}`);
    ids.add(f.id);
    if (orders.has(f.order)) errors.push(`Duplicate floor order: ${f.order}`);
    orders.add(f.order);
    if (!f.name) errors.push(`Floor ${f.id} is missing a name.`);
    if (!['scene', 'route', 'aquarium'].includes(f.kind))
      errors.push(`Floor ${f.id} has an unknown kind: ${f.kind}.`);
    if (f.kind === 'route' && !f.route) errors.push(`Floor ${f.id} is a route but has no route.`);
    if (f.kind === 'scene' && !f.texture) errors.push(`Floor ${f.id} is a scene but has no texture.`);
    if (!/^#[0-9a-fA-F]{6}$/.test(f.accent || '')) errors.push(`Floor ${f.id} has a bad accent color.`);
  }
  const sorted = [...FLOORS].sort((a, b) => a.order - b.order);
  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i].order !== i) {
      errors.push('Floor order values must run 0..n without gaps.');
      break;
    }
  }
  return errors;
}
