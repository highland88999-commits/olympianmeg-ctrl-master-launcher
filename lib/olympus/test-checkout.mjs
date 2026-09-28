// Headless tests for lib/olympus/orders.js — run with: node test-checkout.mjs
import { validateOrderRequest } from './orders.js';

let pass = 0, fail = 0;
function t(name, cond) {
  if (cond) { pass++; }
  else { fail++; console.error('FAIL:', name); }
}

const items = [{ productId: 1, size: 'M', qty: 1 }];

// happy path
let r = validateOrderRequest({ name: 'Jane Appleseed', email: 'jane@example.com', notes: 'Gift wrap please' }, items);
t('valid request ok', r.ok === true);
t('trims + lowercases email', r.customer.email === 'jane@example.com');
t('keeps notes', r.customer.notes === 'Gift wrap please');

// name
r = validateOrderRequest({ name: 'J', email: 'jane@example.com' }, items);
t('short name rejected', r.ok === false);
r = validateOrderRequest({ name: '  ', email: 'jane@example.com' }, items);
t('blank name rejected', r.ok === false);
r = validateOrderRequest({ name: 'x'.repeat(81), email: 'jane@example.com' }, items);
t('long name rejected', r.ok === false);

// email
for (const bad of ['nope', 'a@b', 'a@b.c', '@x.com', 'a @b.com', '']) {
  r = validateOrderRequest({ name: 'Jane', email: bad }, items);
  t(`bad email rejected (${JSON.stringify(bad)})`, r.ok === false);
}
r = validateOrderRequest({ name: 'Jane', email: '  JANE@Example.COM  ' }, items);
t('email normalized', r.ok === true && r.customer.email === 'jane@example.com');

// notes
r = validateOrderRequest({ name: 'Jane', email: 'jane@example.com', notes: 'x'.repeat(600) }, items);
t('notes truncated to 500', r.ok === true && r.customer.notes.length === 500);
r = validateOrderRequest({ name: 'Jane', email: 'jane@example.com' }, items);
t('notes optional', r.ok === true && r.customer.notes === '');

// cart
r = validateOrderRequest({ name: 'Jane', email: 'jane@example.com' }, []);
t('empty cart rejected', r.ok === false);
r = validateOrderRequest({ name: 'Jane', email: 'jane@example.com' }, null);
t('null cart rejected', r.ok === false);
r = validateOrderRequest(null, items);
t('null customer rejected', r.ok === false);

console.log(`checkout: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
