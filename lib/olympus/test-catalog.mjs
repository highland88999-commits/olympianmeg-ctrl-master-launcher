// Headless tests for lib/olympus/catalog.js — run with: node test-catalog.mjs
import { validateItems } from './catalog.js';
import { PRICE_CENTS } from './products.js';

let pass = 0, fail = 0;
function t(name, cond) {
  if (cond) { pass++; }
  else { fail++; console.error('FAIL:', name); }
}

// happy path
let r = validateItems([
  { id: 474601990, size: 'M', qty: 2 },
  { id: 474599857, size: 'xl', qty: 1 }, // lowercase size accepted
]);
t('valid order ok', r.ok === true);
t('two lines', r.lines.length === 2);
t('server price wins (ignores client price)', r.lines[0].unitCents === PRICE_CENTS);
t('line totals', r.lines[0].lineTotalCents === PRICE_CENTS * 2);
t('order total', r.totalCents === PRICE_CENTS * 3);
t('item count', r.itemCount === 3);
t('canonical name from catalog', r.lines[0].name === 'Glitch');

// string ids coerced
r = validateItems([{ id: '474601990', size: 'S', qty: 1 }]);
t('string id coerced', r.ok === true);

// failures
r = validateItems([]);
t('empty cart rejected', r.ok === false);
r = validateItems('nope');
t('non-array rejected', r.ok === false);
r = validateItems([{ id: 123456789, size: 'M', qty: 1 }]);
t('unknown product rejected', r.ok === false && /unknown product/.test(r.errors[0]));
r = validateItems([{ id: 474601990, size: 'XXL', qty: 1 }]);
t('bad size rejected', r.ok === false && /pick a size/.test(r.errors[0]));
r = validateItems([{ id: 474601990, size: 'M', qty: 0 }]);
t('qty 0 rejected', r.ok === false);
r = validateItems([{ id: 474601990, size: 'M', qty: 11 }]);
t('qty 11 rejected', r.ok === false);
r = validateItems([{ id: 474601990, size: 'M', qty: 1.5 }]);
t('fractional qty rejected', r.ok === false);
r = validateItems([{ id: 474601990, size: 'M' }]);
t('missing qty rejected', r.ok === false);
r = validateItems(new Array(26).fill({ id: 474601990, size: 'M', qty: 1 }));
t('too many lines rejected', r.ok === false);

// mixed: one bad line poisons the batch
r = validateItems([
  { id: 474601990, size: 'M', qty: 1 },
  { id: 474601990, size: 'M', qty: 99 },
]);
t('mixed batch rejected wholesale', r.ok === false && r.lines.length === 0);

// tampering: extra fields ignored, catalog values used
r = validateItems([{ id: 474601990, size: 'M', qty: 1, unitCents: 1, name: 'Hacked', price: 0 }]);
t('client price/name tampering ignored', r.ok === true && r.lines[0].unitCents === PRICE_CENTS && r.lines[0].name === 'Glitch');

console.log(`catalog: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
