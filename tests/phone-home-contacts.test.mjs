// tests/phone-home-contacts.test.mjs — Headless tests for the /phone-home contacts tab.
// Run (from the repo root):
//   npx tsc lib/phone-home/contacts.ts --outDir /tmp/contacts-out \
//     --module esnext --target es2022 --moduleResolution node --strict \
//     --skipLibCheck --declaration false --sourceMap false
//   node tests/phone-home-contacts.test.mjs
// Covers: normalization/validation logic, missing-table detection, SQL sanity
// (RLS, owner-only policies, queued-not-run header), page wiring (6-page
// carousel, contacts footer tab, tap-to-call through the Twilio flow), and
// component source checks (honest degradation copy, no fake data, no crash).
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

let passed = 0;
let failed = 0;
function t(name, cond) {
  if (cond) { passed++; }
  else { failed++; console.error('FAIL:', name); }
}
function eq(name, actual, expected) {
  t(`${name} (got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)})`,
    JSON.stringify(actual) === JSON.stringify(expected));
}

const compiled = '/tmp/contacts-out';
const {
  CONTACTS_TABLE,
  CONTACTS_MISSING_MESSAGE,
  CONTACTS_OFFLINE_MESSAGE,
  MAX_NAME_LENGTH,
  MIN_PHONE_DIGITS,
  MAX_PHONE_DIGITS,
  normalizePhoneNumber,
  validateContact,
  isMissingTableError,
  buildContactRow,
} = await import(`${compiled}/contacts.js`);

eq('table name', CONTACTS_TABLE, 'phone_home_contacts');

// --- normalizePhoneNumber ---------------------------------------------------
eq('normalize keeps leading +', normalizePhoneNumber('+1 (368) 885-2145'), '+13688852145');
eq('normalize strips non-digits', normalizePhoneNumber('(403) 555-0199'), '4035550199');
eq('normalize empty → empty', normalizePhoneNumber(''), '');
eq('normalize lone + → empty digits', normalizePhoneNumber('+'), '+');
eq('normalize null-safe', normalizePhoneNumber(null), '');
eq('normalize trims whitespace', normalizePhoneNumber('  4035550199  '), '4035550199');

// --- validateContact --------------------------------------------------------
const ok = validateContact('  Cindy  ', '+1 (368) 885-2145');
t('validate accepts a good contact', ok.ok === true);
eq('validate trims name', ok.name, 'Cindy');
eq('validate normalizes number', ok.phone_number, '+13688852145');

const short = validateContact('A', '12');
t('validate rejects too-short number', short.ok === false);
const long = validateContact('A', '1'.repeat(17));
t('validate rejects too-long number', long.ok === false);
t('validate rejects empty name', validateContact('   ', '4035550199').ok === false);
t('validate rejects empty number', validateContact('Bob', '').ok === false);
t('validate rejects letters-only number', validateContact('Bob', 'abc').ok === false);
const tooLongName = validateContact('x'.repeat(MAX_NAME_LENGTH + 1), '4035550199');
t('validate rejects overlong name', tooLongName.ok === false);
t('validate accepts boundary digit counts',
  validateContact('A', '1'.repeat(MIN_PHONE_DIGITS)).ok === true &&
  validateContact('A', '1'.repeat(MAX_PHONE_DIGITS)).ok === true);
const bad = validateContact('', '');
t('validation errors are plain English', bad.ok === false && !/error|invalid|constraint|42P01/i.test(bad.error));

// --- isMissingTableError ----------------------------------------------------
t('detects Postgres 42P01', isMissingTableError({ code: '42P01', message: 'relation "public.phone_home_contacts" does not exist' }));
t('detects message-only missing relation',
  isMissingTableError({ message: 'relation "phone_home_contacts" does not exist' }));
t('network failure is NOT a missing table', !isMissingTableError(new TypeError('fetch failed')));
t('auth error is NOT a missing table', !isMissingTableError({ code: 'PGRST301', message: 'JWT expired' }));
t('null is NOT a missing table', !isMissingTableError(null));
t('missing table does not swallow unrelated 42P01-shaped text',
  !isMissingTableError({ code: '42P01', message: 'relation "other_table" does not exist' }));

// --- buildContactRow --------------------------------------------------------
eq('buildContactRow shapes the insert',
  buildContactRow('user-1', 'Cindy', '+13688852145'),
  { user_id: 'user-1', name: 'Cindy', phone_number: '+13688852145' });

// --- honest copy ------------------------------------------------------------
t('missing-table message is the queued-update note',
  CONTACTS_MISSING_MESSAGE === 'Contacts arrive with the next database update.');
t('offline message is honest', /offline|connection/i.test(CONTACTS_OFFLINE_MESSAGE));

// --- SQL sanity (supabase/phone-home-contacts.sql) --------------------------
const sql = readFileSync(path.join(repoRoot, 'supabase/phone-home-contacts.sql'), 'utf8');
const low = sql.toLowerCase();
t('sql creates phone_home_contacts', low.includes('create table if not exists public.phone_home_contacts'));
t('sql has uuid PK defaulting to gen_random_uuid', low.includes('id uuid not null primary key default gen_random_uuid()'));
t('sql user_id references auth.users with cascade', low.includes('references auth.users (id) on delete cascade'));
t('sql has name + phone_number columns', low.includes('name text not null') && low.includes('phone_number text not null'));
t('sql enables RLS', low.includes('enable row level security'));
t('sql has owner-only select policy', low.includes('for select') && low.includes('auth.uid() = user_id'));
t('sql has owner-only insert policy', low.includes('for insert') && low.includes('auth.uid() = user_id'));
t('sql has owner-only update policy', low.includes('for update') && low.includes('auth.uid() = user_id'));
t('sql has owner-only delete policy', low.includes('for delete') && low.includes('auth.uid() = user_id'));
t('sql is marked queued-not-run', /queued for execution|do not execute/i.test(sql));
t('sql drops policies before recreating (idempotent)', low.includes('drop policy if exists'));

// --- page wiring (app/phone-home/page.tsx) ----------------------------------
const page = readFileSync(path.join(repoRoot, 'app/phone-home/page.tsx'), 'utf8');
t('page imports ContactsTab', page.includes("from './contacts-tab'"));
t('page has a Contacts footer tab', page.includes('>Contacts</span>'));
t('carousel track is 6 pages wide', page.includes('w-[600%]'));
t('carousel translate uses sixths', page.includes('currentPage * (100 / 6)'));
t('all six sections are sixths', (page.match(/<section className="w-1\/6 h-full/g) || []).length === 6);
t('no w-1/5 sections remain', !page.includes('w-1/5 h-full'));
t('swipe reaches page 5', page.includes('currentPage < 5)'));
t('page 5 renders ContactsTab with the session user', page.includes('<ContactsTab userId={session.user.id}'));
t('contacts tap-to-call goes through startTwilioCall', page.includes('onCall={startTwilioCall}'));
t('startTwilioCall is the shared Twilio flow', page.includes('const startTwilioCall = async (to: string)'));
t('startTwilioCall fills the dialer honestly', page.includes('setDialString(target);'));
t('startTwilioCall jumps to the dialer page', page.includes('setCurrentPage(2);'));
t('startTwilioCall connects through the device', page.includes('twilioDevice.connect({ params: { To: target } })'));
t('startTwilioCall never fakes a call state', !/setTwilioCall\(\{\s*state/i.test(page));
t('dialer button keeps hang-up toggle', page.includes('twilioCall.disconnect()'));
t('page keeps safe-area clearance', page.includes('env(safe-area-inset-bottom)'));

// --- component source checks (app/phone-home/contacts-tab.tsx) -------------
const comp = readFileSync(path.join(repoRoot, 'app/phone-home/contacts-tab.tsx'), 'utf8');
t('component uses the shared table constant', comp.includes('CONTACTS_TABLE'));
t('component uses the missing-table detector', comp.includes('isMissingTableError'));
t('component shows the queued-update note', comp.includes('CONTACTS_MISSING_MESSAGE'));
t('component shows an honest offline note with retry', comp.includes('CONTACTS_OFFLINE_MESSAGE') && comp.includes('Retry'));
t('component wraps all Supabase calls in try/catch', (comp.match(/try \{/g) || []).length >= 3);
t('component has add/edit/delete', comp.includes('Add contact') && comp.includes('Edit contact') && comp.includes('Remove'));
t('component validates before save', comp.includes('validateContact(nameInput, phoneInput)'));
t('component tap-to-call calls onCall', comp.includes('onClick={() => onCall(c.phone_number)}'));
t('component never touches vault/credentials', !/vault|password|secret|api[_-]?key/i.test(comp));
t('component has no fake data generation', !/Math\.random|Math\.floor\(Math/.test(comp));
t('component list is per-user (no cross-user reads)', !/neq\(|all users/i.test(comp));
t('delete confirms in plain English', comp.includes('Remove ${c.name} from your contacts?'));
t('empty state is honest', comp.includes('No contacts yet'));

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
