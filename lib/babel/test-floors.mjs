// Headless tests for lib/babel/floors.js — run with: node test-floors.mjs
import { FLOORS, getFloor, validateFloors } from './floors.js';

let passed = 0;
let failed = 0;
function ok(name, cond) {
  if (cond) { passed++; }
  else { failed++; console.error('FAIL:', name); }
}

ok('registry validates clean', validateFloors().length === 0);
ok('six floors (vault + 4 scenes + aquarium)', FLOORS.length === 6);
ok('vault is first (order 0)', FLOORS[0].id === 'vault' && FLOORS[0].order === 0);
ok('aquarium is last', FLOORS[FLOORS.length - 1].id === 'aquarium');
ok('vault routes to /babel/vault', getFloor('vault').route === '/babel/vault');
ok('scene floors have textures', FLOORS.filter((f) => f.kind === 'scene').every((f) => f.texture.startsWith('/textures/babel/')));
ok('mythic names present', ['sylva', 'duat', 'avalon', 'hermes'].every((id) => !!getFloor(id)));
ok('unknown floor returns null', getFloor('atlantis') === null);
ok('orders are 0..n contiguous', FLOORS.every((f, i) => [...FLOORS].sort((a, b) => a.order - b.order)[i].order === i));
ok('all accents valid hex', FLOORS.every((f) => /^#[0-9a-fA-F]{6}$/.test(f.accent)));
ok('no duplicate ids', new Set(FLOORS.map((f) => f.id)).size === FLOORS.length);

console.log(`floors: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
