// tests/earth-video-orders.test.mjs — the four orders from
// Merlin's 2026-10-26 23:00 phone video, pinned in one place.
//
//   ORDER 1 — the SUMMON BIKE console button is gone; the B-key
//     summon in EarthBike.jsx is untouched (the bike keeps a
//     summon path, and no console control is removed with it).
//   ORDER 2 — the TRON grid, REWORKED late 2026-10-26 after
//     Merlin watched it on his phone: (a) the lines must NOT
//     follow the car — the pattern is now a pure function of
//     planet-fixed direction, world-locked; (b) no TRON look —
//     jagged, irregular, branching cracks, not a grid; (c) the
//     cracks are STATIC (his correction: they do not eat,
//     spread, grow or move — the Earth cracked and waiting for
//     Oblivion); (d) the glow is very subtle but clearly
//     visible (sharp thin core, whisper halo, faint light).
//     The 10 s color cycle (7.5 s hold + 2.5 s fade) is kept,
//     mounted on both the street scene and the orbit globe
//     from NexusEarth. Full pins live in
//     tests/earth-cracks.test.mjs; this suite pins the mounts
//     and the cycle.
//   ORDER 3 — no craft drives backward: the 2026-10-26 filled-
//     silhouette audit of all 19 shipped GLBs found exactly 5
//     reversed craft (luxury-gt-1, teardrop-coupe, pickup-hd,
//     cruiser-bike, ghost-throttle); the loader's effectiveRotY
//     half-turns exactly those, and the peer renderer applies
//     the same rotation.
//   ORDER 4 — teams are MANDATORY for Earth 2 entry (this
//     supersedes "teams optional"): the panel prompts teamless
//     users, offers one-tap solo-team creation, and lists the
//     all-teams roster with a Join team button per team. The
//     prize ladder and settlement safety are untouched — those
//     pins live in tests/earth-teams.test.mjs, not here.
//
// GLB files are not loadable in this plain-node runner, so the
// nose pins assert the DECISION (the audited flip set + the
// rotation math), with the audit method documented in
// lib/earth/vehicles.js. Source pins (console/panel/NexusEarth
// text) assert the shipped UI contracts the same way
// tests/earth-car.test.mjs pins EarthSupercar.jsx.
//
// Run: node tests/earth-video-orders.test.mjs (from the repo root).
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { VEHICLES, listVehicles } from '../lib/earth/vehicles.js';
import { effectiveRotY } from '../lib/earth/vehicle-model.js';
import { soloNameForUser, sanitizeTeamName } from '../lib/earth/teams.js';
import {
  CRACK_PALETTE,
  CRACK_COLOR_HOLD_SECONDS,
  CRACK_COLOR_FADE_SECONDS,
  crackColorAt,
} from '../lib/earth/earth-cracks.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log(`  ok - ${name}`);
}

// ---- ORDER 1: SUMMON BIKE button removed, B key kept ----
// (Superseded 2026-11-15 — Earth 1 is vehicles only: the bike
// is gone, the console is the in-drive HUD, and there is no
// summon/dismiss at all. The pins below are the new law.)
check('ORDER 1: Earth console never summons/dismisses anything (no bike, no craft buttons)', () => {
  const src = read('components/EarthConsole.jsx');
  assert.ok(!src.includes('summonBike()'), 'console must not call summonBike');
  assert.ok(!src.includes('dismissBike()'), 'console must not call dismissBike');
  assert.ok(!src.includes('🏍 Summon bike'), 'console must not carry the Summon bike label');
  assert.ok(!src.includes('✕ Dismiss bike'), 'console must not carry the Dismiss bike label');
  // 'BikeControls' survives only in the header's removal note —
  // the live component (JSX use or definition) is gone.
  assert.ok(!src.includes('<BikeControls') && !src.includes('const BikeControls'), 'BikeControls is gone with the bike');
  assert.ok(!src.includes('toggleMount'), 'no ride toggle in the HUD');
  assert.ok(!src.includes('EarthCraftPicker'), 'no craft picker in the HUD');
  assert.ok(!src.includes('<CharacterPicker'), 'no character picker in the HUD');
  // The HUD's own controls survive: FIRE + torpedo count + speed.
  assert.ok(src.includes('fireFromHud'), 'FIRE button fires a torpedo');
  assert.ok(src.includes('FIRE'), 'FIRE label renders');
  assert.ok(src.includes('EarthViewToggle'), 'view toggle stays');
});

check('ORDER 1: no bike file, no summon keys — the car is always out (vehicles only)', () => {
  assert.throws(() => read('components/EarthBike.jsx'), /ENOENT/);
  const src = read('components/EarthSupercar.jsx');
  assert.ok(!src.includes("k === 'v'"), 'no V summon key');
  assert.ok(!src.includes("k === 'f'"), 'no F mount key');
  assert.ok(src.includes('export function summonCar'), 'summonCar export stays (entry flow calls it)');
  assert.match(src, /auto-mount: spawn driving/);
});

// ---- ORDER 2: crack color cycle + mounts (TRON grid reworked) ----
check('ORDER 2: color cycle holds 7.5 s, fades 2.5 s, loops the palette', () => {
  assert.equal(CRACK_COLOR_HOLD_SECONDS + CRACK_COLOR_FADE_SECONDS, 10, 'one color per 10 s');
  assert.ok(CRACK_PALETTE.length >= 4, 'a real progression, not a blink');
  const at = (ms) => crackColorAt(ms);
  const hex = (c) => [c.r, c.g, c.b].map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('');
  assert.equal(hex(at(0)), CRACK_PALETTE[0].slice(1), 't=0 is palette[0]');
  assert.equal(hex(at(7400)), CRACK_PALETTE[0].slice(1), 'still holding at 7.4 s');
  assert.equal(hex(at(10000)), CRACK_PALETTE[1].slice(1), 'fully faded to palette[1] at 10 s');
  const mid = at(8750);
  const first = at(0);
  const second = at(10000);
  assert.ok(Math.abs(mid.r - (first.r + second.r) / 2) < 0.02, 'mid-fade is the midpoint');
  assert.equal(
    hex(at(10000 * CRACK_PALETTE.length)),
    CRACK_PALETTE[0].slice(1),
    'cycle loops back to palette[0]',
  );
});

check('ORDER 2: NexusEarth mounts the street cracks and the orbit cracks', () => {
  const src = read('components/NexusEarth.jsx');
  assert.ok(src.includes('EarthCracks'), 'street crack import + mount must exist');
  assert.ok(src.includes('EarthOrbitCracks'), 'orbit crack import + mount must exist');
  assert.ok(src.includes('roaming && <EarthCracks'), 'street cracks are street-gated');
  assert.ok(src.includes('!roaming && <EarthOrbitCracks'), 'orbit cracks are orbit-gated');
  assert.ok(!src.includes('EarthTronGrid'), 'old TRON component must be gone');
  assert.ok(!src.includes('EarthOrbitGrid'), 'old TRON orbit component must be gone');
});

check('ORDER 2: crack component uses a shader (no per-frame geometry rebuild)', () => {
  const src = read('components/earth/EarthCracks.jsx');
  assert.ok(src.includes('ShaderMaterial'), 'shader approach, not rebuilt geometry');
  assert.ok(src.includes('PlaneGeometry'), 'one static street plane');
  assert.ok(src.includes('SphereGeometry'), 'one static orbit sphere');
  assert.ok(src.includes('crackColorAt'), 'shared color clock');
  assert.ok(src.includes('pointLight'), 'glow is also a light source');
  assert.ok(!src.includes('earth2'), 'cracks must not touch Earth 2 code');
});

// ---- ORDER 3: nose-forward per craft ----
check('ORDER 3: exactly the 5 audited craft carry noseReversed', () => {
  const flipped = listVehicles().filter((v) => v.noseReversed).map((v) => v.id).sort();
  assert.deepEqual(flipped, [
    'cruiser-bike',
    'ghost-throttle',
    'luxury-gt-1',
    'pickup-hd',
    'teardrop-coupe',
  ]);
  assert.equal(VEHICLES.length, 19, 'roster still 19');
});

check('ORDER 3: effectiveRotY half-turns flipped craft, leaves the rest on base alignment', () => {
  // X-long, unflipped: base quarter-turn only.
  assert.equal(effectiveRotY(4.8, 4.6, false), Math.PI / 2);
  // X-long, flipped: quarter-turn + half-turn = nose on +Z.
  assert.equal(effectiveRotY(4.8, 4.6, true), Math.PI / 2 + Math.PI);
  // Z-long, unflipped: no turn.
  assert.equal(effectiveRotY(4.5, 4.8, false), 0);
  // Z-long, flipped (cruiser-bike): half-turn only.
  assert.equal(effectiveRotY(2.0, 2.2, true), Math.PI);
});

check('ORDER 3: peer renderer applies the same rotY as the player craft', () => {
  const src = read('components/EarthPeers.jsx');
  assert.ok(src.includes('holder.rotation.y = model.rotY'), 'peers must rotate by the prepared rotY');
});

check('ORDER 3: EarthSupercar header records the audit (no stale "eyeball owed")', () => {
  const src = read('components/EarthSupercar.jsx');
  assert.ok(src.includes('2026-10-26 silhouette'), 'audit note must be present');
  assert.ok(!src.includes('eyeball is still owed'), 'stale eyeball note must be gone');
});

// ---- ORDER 4: mandatory teams ----
check('ORDER 4: soloNameForUser builds valid, sensible solo-team names', () => {
  assert.equal(soloNameForUser({ user_metadata: { display_name: 'Merlin' } }), "Merlin's team");
  assert.equal(soloNameForUser({ user_metadata: { full_name: 'Ada Lovelace' } }), "Ada Lovelace's team");
  assert.equal(soloNameForUser({ email: 'john.doe@example.com' }), "john doe's team");
  assert.equal(soloNameForUser({}), 'Solo Team');
  assert.equal(soloNameForUser({ user_metadata: { display_name: '!!!' } }), 'Solo Team');
  const long = soloNameForUser({ user_metadata: { display_name: 'A'.repeat(50) } });
  assert.ok(long.length <= 40 && sanitizeTeamName(long), 'long names truncate to a valid team name');
  for (const u of [
    { user_metadata: { display_name: 'Merlin' } },
    { user_metadata: { full_name: 'Ada Lovelace' } },
    { email: 'john.doe@example.com' },
    {},
  ]) {
    assert.ok(sanitizeTeamName(soloNameForUser(u)), `solo name for ${JSON.stringify(u)} must pass validation`);
  }
});

check('ORDER 4: panel prompts teamless users, offers one-tap solo creation, lists the roster with Join team', () => {
  const src = read('components/EarthTeamPanel.jsx');
  assert.ok(src.includes('Earth 2 entry is earned through a team'), 'mandatory prompt must exist');
  assert.ok(src.includes('Create a solo team'), 'one-tap solo button must exist');
  assert.ok(src.includes("action: 'create-solo'"), 'solo button must call create-solo');
  assert.ok(src.includes('All teams'), 'roster heading must exist');
  assert.ok(src.includes('Join team'), 'roster buttons must read Join team');
  assert.ok(src.includes('Your team'), 'own team must be marked in the roster');
  assert.ok(src.includes('Leave your team first'), 'leave-first rule must be explained');
  assert.ok(!src.includes('Teams are optional'), 'optional-team copy must be gone');
  assert.ok(src.includes('never removed') || src.includes('never removed, with or without a team'), 'mapping-never-deleted honesty must stay');
});

check('ORDER 4: route serves create-solo from the authenticated user (no client name)', () => {
  const src = read('app/api/earth/teams/route.js');
  assert.ok(src.includes("action === 'create-solo'"), 'create-solo action must exist');
  assert.ok(src.includes('soloNameForUser(auth.user)'), 'solo name must come from the server-side user');
  assert.ok(src.includes('MANDATORY') || src.includes('mandatory-team law'), 'route header must state the mandatory law');
  assert.ok(!src.includes('OPTIONAL mapping teams'), 'optional-team header must be gone');
});

check('ORDER 4: prize ladder untouched by this revision (spot pins; full pins in earth-teams)', () => {
  const src = read('lib/earth/teams.js');
  assert.ok(src.includes('400') && src.includes('320') && src.includes('240') && src.includes('160') && src.includes('80'), 'ladder numbers must still be present');
  assert.ok(src.includes('MANDATORY') || src.includes('team joining for the'), 'lib header must state the mandatory law');
});

console.log(`\nearth-video-orders: ${passed} passed`);
