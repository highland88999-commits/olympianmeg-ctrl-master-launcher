// Headless tests for lib/olympus/cart.js — run with: node test-cart.mjs
import { addLine, removeLine, setQty, countItems, enrichCart, serialize, deserialize } from './cart.js';
import { getProduct, PRICE_CENTS } from './products.js';

let pass = 0, fail = 0;
function t(name, cond) {
  if (cond) { pass++; }
  else { fail++; console.error('FAIL:', name); }
}

// addLine
let cart = [];
cart = addLine(cart, { productId: 1, size: 'M' });
t('add first line', cart.length === 1 && cart[0].qty === 1);
cart = addLine(cart, { productId: 1, size: 'M', qty: 2 });
t('bump qty on same product+size', cart.length === 1 && cart[0].qty === 3);
cart = addLine(cart, { productId: 1, size: 'L' });
t('different size is a new line', cart.length === 2);
cart = addLine(cart, { productId: 1, size: 'M', qty: 20 });
t('qty clamps at 10', cart.find((l) => l.size === 'M').qty === 10);
t('original array not mutated', addLine([], { productId: 5, size: 'S' }).length === 1);

// setQty
cart = setQty(cart, 1, 'M', 2);
t('setQty updates', cart.find((l) => l.size === 'M').qty === 2);
cart = setQty(cart, 1, 'M', 0);
t('setQty 0 removes line', cart.length === 1 && cart[0].size === 'L');
cart = setQty(cart, 1, 'L', 99);
t('setQty clamps at 10', cart[0].qty === 10);

// removeLine
cart = removeLine(cart, 1, 'L');
t('removeLine empties', cart.length === 0);
t('removeLine on missing is harmless', removeLine([], 9, 'XL').length === 0);

// countItems
t('countItems', countItems([{ qty: 2 }, { qty: 3 }]) === 5);
t('countItems empty', countItems([]) === 0);

// enrichCart
const realCart = [
  { productId: 474601990, size: 'M', qty: 2 },
  { productId: 999999999, size: 'L', qty: 1 }, // unknown id -> dropped
];
const enriched = enrichCart(realCart, getProduct, PRICE_CENTS);
t('enrich drops unknown ids', enriched.lines.length === 1);
t('enrich attaches name + price', enriched.lines[0].name === 'Glitch' && enriched.lines[0].unitCents === 9500);
t('enrich totals correctly', enriched.totalCents === 19000);

// serialize / deserialize
const s = serialize([{ productId: 1, size: 'M', qty: 2 }]);
t('serialize round-trips', deserialize(s).length === 1);
t('deserialize garbage -> []', deserialize('not json').length === 0);
t('deserialize non-array -> []', deserialize('{"a":1}').length === 0);
t('deserialize drops malformed lines', deserialize(JSON.stringify([{ nope: 1 }, { productId: 1, size: 'M', qty: 1 }])).length === 1);
t('deserialize null -> []', deserialize(null).length === 0);

console.log(`cart: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
