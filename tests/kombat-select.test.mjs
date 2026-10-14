// tests/kombat-select.test.mjs — headless tests for fighter-select
// truth (lib/kombat/select.js, Kombat wiring plan Step 2).
// Run: node tests/kombat-select.test.mjs (from the repo root).
// No browser, no network — asserts the select read model against the
// Step 1 bridge (lib/kombat/loadouts.js), the game roster
// (lib/kombat/roster.js), the published character roster
// (lib/characters/roster.js), and the select screens' source
// (app/kombat/page.jsx), which must consume the read model rather
// than re-deriving or hard-coding availability.
import { existsSync, readFileSync } from 'node:fs';
import { FIGHTERS, getFighter } from '../lib/kombat/roster.js';
import { LOADOUTS, getLoadout } from '../lib/kombat/loadouts.js';
import { CHARACTERS } from '../lib/characters/roster.js';
import {
  LOCKED_LABEL,
  getSelectEntry,
  isFighterSelectable,
  isFighterLocked,
  fighterPreview,
  selectableFighterIds,
  lockedFighterIds,
  selectableFighters,
  resolveProfileFighter,
} from '../lib/kombat/select.js';

let passed = 0;
let failed = 0;
function t(name, cond) {
  if (cond) { passed++; }
  else { failed++; console.error(`FAIL: ${name}`); }
}
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const sorted = (arr) => [...arr].sort();

const bridgeUnavailable = LOADOUTS.filter((l) => !l.available);
const bridgeAvailable = LOADOUTS.filter((l) => l.available);

// --- locked set == bridge-unavailable set -----------------------------------
t('locked ids are exactly the bridge-unavailable fighters',
  eq(sorted(lockedFighterIds()), sorted(bridgeUnavailable.map((l) => l.kombatId))));
t('locked count matches the bridge (0 pending at this snapshot — full roster generated)',
  lockedFighterIds().length === bridgeUnavailable.length && bridgeUnavailable.length === 0);
t('selectable ids are exactly the bridge-available fighters',
  eq(sorted(selectableFighterIds()), sorted(bridgeAvailable.map((l) => l.kombatId))));
t('locked and selectable partition the 43 fighters',
  lockedFighterIds().length + selectableFighterIds().length === 43
  && !lockedFighterIds().some((id) => selectableFighterIds().includes(id)));
for (const l of LOADOUTS) {
  t(`${l.kombatId} selectable iff bridge-available`,
    isFighterSelectable(l.kombatId) === (l.available === true));
  t(`${l.kombatId} locked iff bridge-unavailable`,
    isFighterLocked(l.kombatId) === (l.available !== true));
}
t('unknown ids are neither selectable nor locked',
  !isFighterSelectable('nobody') && !isFighterLocked('nobody')
  && !isFighterSelectable(null) && !isFighterLocked(42)
  && getSelectEntry('nobody') === null && getSelectEntry(undefined) === null);

// --- select entries mirror the bridge ---------------------------------------
for (const l of LOADOUTS) {
  const e = getSelectEntry(l.kombatId);
  t(`${l.kombatId} entry mirrors bridge identity`,
    e.kombatId === l.kombatId && e.characterId === l.characterId && e.name === l.name);
  t(`${l.kombatId} entry availability mirrors bridge`,
    e.available === (l.available === true) && e.locked === (l.available !== true));
}

// --- preview shown iff bridge preview non-null -------------------------------
for (const l of LOADOUTS) {
  t(`${l.kombatId} select preview is the bridge preview`,
    getSelectEntry(l.kombatId).preview === (l.preview || null)
    && fighterPreview(l.kombatId) === (l.preview || null));
  if (l.preview !== null) {
    t(`${l.kombatId} preview file exists in public/`,
      existsSync(new URL(`../public${l.preview}`, import.meta.url)));
  }
}
t('preview count matches the published roster (43)',
  LOADOUTS.filter((l) => l.preview !== null).length === CHARACTERS.length
  && CHARACTERS.length === 43);
t('locked fighters never carry a preview',
  bridgeUnavailable.every((l) => l.preview === null && fighterPreview(l.kombatId) === null));
t('available-without-preview is exactly nobody (every available fighter is published)',
  eq(sorted(bridgeAvailable.filter((l) => l.preview === null).map((l) => l.kombatId)),
    []));
t('fighterPreview of unknown id is null', fighterPreview('nobody') === null);

// --- selectable pool (random / CPU / brawl fill draw from this) ---------------
t('selectableFighters returns roster records, all selectable',
  selectableFighters().length === bridgeAvailable.length
  && selectableFighters().every((f) => isFighterSelectable(f.id) && getFighter(f.id) === f));
t('selectableFighters keeps roster order',
  eq(selectableFighters().map((f) => f.id),
    FIGHTERS.filter((f) => isFighterSelectable(f.id)).map((f) => f.id)));
t('no locked fighter can enter the playable pool',
  selectableFighters().every((f) => !lockedFighterIds().includes(f.id)));

// --- profile pre-highlight -----------------------------------------------------
const bridgeByCharacter = new Map(LOADOUTS.map((l) => [l.characterId, l]));
for (const c of CHARACTERS) {
  t(`${c.id} profile pick resolves to its Kombat fighter`,
    resolveProfileFighter(c.id) === bridgeByCharacter.get(c.id)?.kombatId);
}
t('every published roster member resolves', CHARACTERS.every((c) => resolveProfileFighter(c.id) !== null));
t('non-roster sprint id does NOT resolve (not a roster member)',
  resolveProfileFighter('q044-lakeside-cabin') === null);
t('unknown character id does not resolve', resolveProfileFighter('q999-nobody') === null);
t('a kombat id is not a profile character id', resolveProfileFighter('freddy-krueger') === null);
t('non-string profile ids do not resolve',
  resolveProfileFighter(null) === null && resolveProfileFighter(undefined) === null
  && resolveProfileFighter(42) === null && resolveProfileFighter('') === null);

// --- select screens consume the read model (source) -----------------------------
const page = readFileSync(new URL('../app/kombat/page.jsx', import.meta.url), 'utf8');
t('select screens import the shared select read model',
  page.includes("from '../../lib/kombat/select.js'"));
t('locked treatment uses the shared STILL FORGING label',
  LOCKED_LABEL === 'STILL FORGING' && page.includes('LOCKED_LABEL'));
t('tap handlers gate picks on bridge availability',
  (page.match(/isFighterSelectable\(/g) || []).length >= 2);
t('grids render the real preview image from the entry',
  page.includes('src={entry.preview}') || page.includes('src={preview}'));
t('locked highlight renders as a silhouette (brightness-0 canvas)',
  page.includes('brightness(0)'));
t('profile link reads the saved profile character and resolves it',
  page.includes('profile_character_id') && page.includes('resolveProfileFighter('));
t('opponent pools draw from selectableFighters, never the raw roster',
  (page.match(/selectableFighters\(\)/g) || []).length >= 2);

console.log(`\nkombat-select: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
