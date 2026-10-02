// Headless tests for lib/babel/arena-collide.js — run with:
//   node tests/arena-collide.test.mjs
import { pushOutOfCircles, makeRiverBlocker } from '../lib/babel/arena-collide.js';

let passed = 0;
let failed = 0;
function ok(name, cond) {
  if (cond) { passed++; }
  else { failed++; console.error('FAIL:', name); }
}
function near(a, b, eps = 1e-6) { return Math.abs(a - b) <= eps; }

// --- pushOutOfCircles ---
let p = pushOutOfCircles({ x: 1, z: 0 }, [{ x: 0, z: 0, r: 5 }]);
ok('inside circle pushed out to rim along normal', near(p.x, 5) && near(p.z, 0));

p = pushOutOfCircles({ x: 0, z: 0 }, [{ x: 0, z: 0, r: 5 }]);
ok('exact center pushed out to rim deterministically', near(Math.hypot(p.x, p.z), 5));

p = pushOutOfCircles({ x: 10, z: -4 }, [{ x: 0, z: 0, r: 5 }]);
ok('clear of all colliders is a no-op', near(p.x, 10) && near(p.z, -4));

p = pushOutOfCircles({ x: 5, z: 0 }, [{ x: 0, z: 0, r: 5 }]);
ok('exactly on the rim stays put', near(p.x, 5) && near(p.z, 0));

p = pushOutOfCircles({ x: 1, z: 1 }, [
  { x: 0, z: 0, r: 3 },
  { x: 4, z: 1, r: 3 },
]);
ok('overlapping colliders: ends outside both after 2 passes',
  Math.hypot(p.x, p.z) >= 3 && Math.hypot(p.x - 4, p.z - 1) >= 3);

p = pushOutOfCircles({ x: 14, z: -18 }, [{ x: 14, z: -18, r: 3.2 }]);
ok('sphinx collider pushes walker off its footprint', near(Math.hypot(p.x - 14, p.z + 18), 3.2));

p = pushOutOfCircles({ x: 100, z: 100 }, []);
ok('empty collider list is a no-op', near(p.x, 100) && near(p.z, 100));

const src = { x: 1, z: 0 };
const cols = [{ x: 0, z: 0, r: 5 }];
pushOutOfCircles(src, cols);
ok('arguments are not mutated', near(src.x, 1) && near(cols[0].r, 5));

// --- makeRiverBlocker: the Duat Nile (x=60, width 14, z -150..150) ---
const nile = makeRiverBlocker({
  x: 60, width: 14, zMin: -150, zMax: 150,
  bridges: [
    { z: -60, halfWidth: 3 },
    { z: 0, halfWidth: 3 },
    { z: 60, halfWidth: 3 },
  ],
});

p = nile(60, 20);
ok('mid-river point is blocked (pushed to a river edge)', p.x === 53 || p.x === 67);
ok('mid-river point keeps its z', p.z === 20);

p = nile(59, 20);
ok('west-of-center point pushes to the west edge', near(p.x, 53) && near(p.z, 20));

p = nile(63, -100);
ok('east-of-center point pushes to the east edge', near(p.x, 67) && near(p.z, -100));

p = nile(60, -60);
ok('bridge crossing allowed (north bridge)', near(p.x, 60) && near(p.z, -60));

p = nile(66.9, 0);
ok('bridge crossing allowed at bridge edge (center bridge)', near(p.x, 66.9) && near(p.z, 0));

p = nile(53, 30);
ok('exactly on the river edge is a no-op', near(p.x, 53) && near(p.z, 30));

p = nile(74, -58);
ok('far-bank point is clear', near(p.x, 74) && near(p.z, -58));

p = nile(60, 151);
ok('outside the z range is a no-op', near(p.x, 60) && near(p.z, 151));

p = nile(60, -56.9);
ok('just outside a bridge z range still blocks', near(p.x, 53) || near(p.x, 67));
ok('just outside a bridge z range keeps its z', near(p.z, -56.9));

const dry = makeRiverBlocker({ x: 0, width: 10, zMin: -10, zMax: 10, bridges: [] });
p = dry(0, 0);
ok('no bridges: river is fully blocked', p.x === -5 || p.x === 5);

console.log(`arena-collide: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
