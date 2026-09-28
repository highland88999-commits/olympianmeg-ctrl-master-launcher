// Headless tests for lib/babel/vault.js validation — run with: node test-vault.mjs
import { validateItem, describeItemType, ITEM_TYPES, LIMITS, VAULT_BUCKET } from './vault.js';

let passed = 0;
let failed = 0;
function ok(name, cond) {
  if (cond) { passed++; }
  else { failed++; console.error('FAIL:', name); }
}

const good = {
  itemType: 'note',
  name: 'Letter for graduation',
  passphrase: 'miles-will-know-this-1',
  confirmPassphrase: 'miles-will-know-this-1',
  textContent: 'Dear Miles, ...',
  fileInfo: null,
};

ok('constants: 3 item types', ITEM_TYPES.length === 3);
ok('constants: bucket name', VAULT_BUCKET === 'babel-vault');
ok('valid note passes', validateItem(good).length === 0);

ok('bad type rejected', validateItem({ ...good, itemType: 'video' }).length > 0);
ok('empty name rejected', validateItem({ ...good, name: '   ' }).length > 0);
ok('long name rejected', validateItem({ ...good, name: 'x'.repeat(81) }).length > 0);
ok('short passphrase rejected', validateItem({ ...good, passphrase: 'short', confirmPassphrase: 'short' }).length > 0);
ok('mismatched passphrase rejected',
  validateItem({ ...good, passphrase: 'miles-will-know-this-1', confirmPassphrase: 'different-phrase-2' }).length > 0);
ok('missing passphrase rejected', validateItem({ ...good, passphrase: '', confirmPassphrase: '' }).length > 0);
ok('empty note rejected', validateItem({ ...good, textContent: '  ' }).length > 0);
ok('oversized note rejected', validateItem({ ...good, textContent: 'x'.repeat(LIMITS.noteMaxChars + 1) }).length > 0);

const goodPhoto = {
  itemType: 'photo',
  name: 'Lake day',
  passphrase: 'photo-secret-phrase-9',
  confirmPassphrase: 'photo-secret-phrase-9',
  textContent: '',
  fileInfo: { type: 'image/jpeg', size: 1024 * 1024 },
};
ok('valid photo passes', validateItem(goodPhoto).length === 0);
ok('missing file rejected', validateItem({ ...goodPhoto, fileInfo: null }).length > 0);
ok('bad mime rejected', validateItem({ ...goodPhoto, fileInfo: { type: 'application/pdf', size: 100 } }).length > 0);
ok('oversized photo rejected',
  validateItem({ ...goodPhoto, fileInfo: { type: 'image/png', size: LIMITS.photoMaxBytes + 1 } }).length > 0);
ok('empty file rejected', validateItem({ ...goodPhoto, fileInfo: { type: 'image/png', size: 0 } }).length > 0);
ok('heic allowed', validateItem({ ...goodPhoto, fileInfo: { type: 'image/heic', size: 5000 } }).length === 0);

ok('describe photo', describeItemType('photo') === 'Photo');
ok('describe credential', describeItemType('credential') === 'Account credential');
ok('describe note', describeItemType('note') === 'Note');

console.log(`vault: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
