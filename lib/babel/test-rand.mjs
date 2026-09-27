// Headless tests for lib/babel/rand.js — run with: node test-rand.mjs
import { mulberry32 } from './rand.js';

let passed = 0;
let failed = 0;
function ok(name, cond) {
  if (cond) { passed++; }
  else { failed++; console.error('FAIL:', name); }
}

const a = mulberry32(1234);
const b = mulberry32(1234);
ok('same seed -> same sequence', a() === b() && a() === b() && a() === b());
ok('different seed -> different first value', mulberry32(1)() !== mulberry32(2)());
const rng99 = mulberry32(99);
const vals = Array.from({ length: 100 }, () => rng99());
ok('values in [0,1)', vals.every((v) => v >= 0 && v < 1));
ok('sequence varies', new Set(vals).size > 50);

console.log(`rand: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
