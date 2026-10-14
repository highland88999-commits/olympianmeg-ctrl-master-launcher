// tests/characters-roster.test.mjs — headless tests for the platform
// character roster and the profile_character_id profile field.
// Run: node tests/characters-roster.test.mjs (from the repo root).
// No browser, no network — asserts on lib/characters/roster.js and the
// profile_character_id branch of lib/profiles/validation.js.
import { CHARACTERS, getCharacterById, isCharacterId } from '../lib/characters/roster.js';
import { validateProfileUpdate } from '../lib/profiles/validation.js';

let passed = 0;
let failed = 0;
function t(name, cond) {
  if (cond) { passed++; }
  else { failed++; console.error(`FAIL: ${name}`); }
}

// --- roster shape ---
t('roster has the 28 sprint-complete characters', CHARACTERS.length === 28);
t('ids are unique', new Set(CHARACTERS.map((c) => c.id)).size === CHARACTERS.length);
t('queue numbers are unique', new Set(CHARACTERS.map((c) => c.queueNumber)).size === CHARACTERS.length);
for (const c of CHARACTERS) {
  t(`${c.id} id is slug-shaped`, /^[a-z0-9]+(-[a-z0-9]+)*$/.test(c.id));
  t(`${c.id} has a name`, typeof c.name === 'string' && c.name.length > 0);
  t(`${c.id} preview is its public png`, c.preview === `/characters/${c.id}.png`);
  t(`${c.id} queue number is a positive int`, Number.isInteger(c.queueNumber) && c.queueNumber > 0);
}
t('roster sorted by queue number', CHARACTERS.every((c, i) => i === 0 || CHARACTERS[i - 1].queueNumber < c.queueNumber));

// --- helpers ---
t('getCharacterById finds Freddy', getCharacterById('q001-freddy-krueger')?.name === 'Freddy Krueger');
t('getCharacterById finds Hulk', getCharacterById('q033-hulk')?.name === 'Hulk');
t('getCharacterById unknown -> null', getCharacterById('q999-nobody') === null);
t('getCharacterById non-string -> null', getCharacterById(42) === null && getCharacterById(null) === null);
t('isCharacterId true for roster id', isCharacterId('q011-xenomorph') === true);
t('isCharacterId false for unknown', isCharacterId('q011') === false);
t('isCharacterId false for non-string', isCharacterId(undefined) === false);

// --- validateProfileUpdate: profile_character_id ---
{
  const r = validateProfileUpdate({ profile_character_id: 'q005-pennywise' });
  t('accepts a roster-shaped id', r.ok === true && r.value.profile_character_id === 'q005-pennywise');
}
{
  const r = validateProfileUpdate({ profile_character_id: null });
  t('null clears the character', r.ok === true && r.value.profile_character_id === null);
}
{
  const r = validateProfileUpdate({ profile_character_id: '   ' });
  t('blank clears the character', r.ok === true && r.value.profile_character_id === null);
}
{
  const r = validateProfileUpdate({ profile_character_id: 'Bad Id!' });
  t('rejects a malformed id', r.ok === false);
}
{
  const r = validateProfileUpdate({ profile_character_id: 'x'.repeat(120) });
  t('rejects an over-long id', r.ok === false);
}
{
  const r = validateProfileUpdate({ display_name: 'Nova' });
  t('absent field stays absent', r.ok === true && !('profile_character_id' in r.value));
}
{
  // A well-formed id that is NOT on the roster passes validation —
  // roster membership is enforced in the PATCH route, not here.
  const r = validateProfileUpdate({ profile_character_id: 'q999-future-character' });
  t('well-formed non-roster id passes shape validation', r.ok === true && r.value.profile_character_id === 'q999-future-character');
}

console.log(`characters-roster: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
