// tests/earth-teams.test.mjs — Earth 1 OPTIONAL mapping teams +
// Oblivion Day prize ladder + team garage (Merlin, 2026-10-26
// evening orders).
//
// Covers the pure helpers in lib/earth/teams.js:
//   - team cap (5) + one-team-per-user rule shape (route-level,
//     pinned here as the constant the route + trigger share)
//   - prize ladder pins: 400/320/240/160/80 aether per member,
//     $10/$8/$6/$4/$2, 6,000-aether / $150 / 150,000-gold maximum
//     for 5 full teams of 5, linear partial scaling
//   - distinct-ground union ranking: overlaps count once,
//     tiebreak = earliest created first, top-5-only settlement
//   - settlement idempotence shape: one grant per user per event,
//     idem key format, dollar-equivalent cents
//   - garage: 5 bays = member count (6th member dropped), craft
//     names from the vehicle roster, unknown craft never faked,
//     finish validation + defaults
//
// Run: node tests/earth-teams.test.mjs (from the repo root).
import assert from 'node:assert';
import {
  createBitset,
  markDisc,
  countBits,
  serializeBitset,
} from '../lib/earth/mapping-progress.js';
import {
  MAX_TEAM_MEMBERS,
  PRIZE_PLACES,
  GOLD_PER_AETHER,
  GOLD_PER_DOLLAR,
  AETHER_PER_DOLLAR,
  PRIZE_AETHER_BY_PLACE,
  PRIZE_DOLLARS_BY_PLACE,
  prizeAetherForPlace,
  prizeDollarsForPlace,
  aetherToUsdCents,
  totalPrizeAether,
  maxPrizeAether,
  prizeIdemKey,
  sanitizeTeamName,
  teamScoreFromHexes,
  rankTeams,
  planSettlement,
  GARAGE_FLOOR_FINISHES,
  GARAGE_WALL_FINISHES,
  DEFAULT_GARAGE_FLOOR,
  DEFAULT_GARAGE_WALL,
  sanitizeGarageFinish,
  garageBays,
} from '../lib/earth/teams.js';

let passed = 0;
function check(name, fn) {
  fn();
  passed++;
  console.log('ok -', name);
}

function discHex(lat, lon, radiusDeg) {
  const b = createBitset();
  markDisc(b, lat, lon, radiusDeg);
  return serializeBitset(b);
}

check('team cap is 5 and prize places are 5', () => {
  assert.equal(MAX_TEAM_MEMBERS, 5);
  assert.equal(PRIZE_PLACES, 5);
});

check('prize ladder pins: aether per member by place', () => {
  assert.deepEqual(PRIZE_AETHER_BY_PLACE, [400, 320, 240, 160, 80]);
  assert.equal(prizeAetherForPlace(1), 400);
  assert.equal(prizeAetherForPlace(2), 320);
  assert.equal(prizeAetherForPlace(3), 240);
  assert.equal(prizeAetherForPlace(4), 160);
  assert.equal(prizeAetherForPlace(5), 80);
  assert.equal(prizeAetherForPlace(0), 0);
  assert.equal(prizeAetherForPlace(6), 0);
  assert.equal(prizeAetherForPlace(-1), 0);
});

check('prize ladder pins: dollars per member by place', () => {
  assert.deepEqual(PRIZE_DOLLARS_BY_PLACE, [10, 8, 6, 4, 2]);
  assert.equal(prizeDollarsForPlace(1), 10);
  assert.equal(prizeDollarsForPlace(5), 2);
  assert.equal(prizeDollarsForPlace(6), 0);
});

check('internal rates: 1 aether = 25 gold, 1000 gold = $1', () => {
  assert.equal(GOLD_PER_AETHER, 25);
  assert.equal(GOLD_PER_DOLLAR, 1000);
  assert.equal(AETHER_PER_DOLLAR, 40);
  assert.equal(aetherToUsdCents(400), 1000);
  assert.equal(aetherToUsdCents(320), 800);
  assert.equal(aetherToUsdCents(240), 600);
  assert.equal(aetherToUsdCents(160), 400);
  assert.equal(aetherToUsdCents(80), 200);
});

check('maximum settlement: 5 full teams of 5 = 6000 aether = $150 = 150000 gold', () => {
  assert.equal(maxPrizeAether(), 6000);
  assert.equal(totalPrizeAether([5, 5, 5, 5, 5]), 6000);
  assert.equal(maxPrizeAether() * GOLD_PER_AETHER, 150000);
  assert.equal(maxPrizeAether() / AETHER_PER_DOLLAR, 150);
});

check('partial teams scale linearly; counts above the cap are clamped', () => {
  assert.equal(totalPrizeAether([3, 2, 0, 0, 0]), 400 * 3 + 320 * 2);
  assert.equal(totalPrizeAether([1, 1, 1, 1, 1]), 400 + 320 + 240 + 160 + 80);
  assert.equal(totalPrizeAether([9, 9, 9, 9, 9]), 6000);
  assert.equal(totalPrizeAether([]), 0);
  assert.equal(totalPrizeAether(null), 0);
});

check('prize idem key: one per user per event, distinct across both', () => {
  assert.equal(prizeIdemKey('oblivion-1', 'user-a'), 'oblivion-prize:oblivion-1:user-a');
  assert.notEqual(prizeIdemKey('oblivion-1', 'user-a'), prizeIdemKey('oblivion-1', 'user-b'));
  assert.notEqual(prizeIdemKey('oblivion-1', 'user-a'), prizeIdemKey('oblivion-2', 'user-a'));
});

check('team names: trimmed, collapsed, 1-40, safe characters only', () => {
  assert.equal(sanitizeTeamName('  Redwater   Racers '), 'Redwater Racers');
  assert.equal(sanitizeTeamName("O'Brien-2"), "O'Brien-2");
  assert.equal(sanitizeTeamName(''), null);
  assert.equal(sanitizeTeamName('   '), null);
  assert.equal(sanitizeTeamName('x'.repeat(41)), null);
  assert.equal(sanitizeTeamName('-Lead'), null);
  assert.equal(sanitizeTeamName('Team; DROP'), null);
  assert.equal(sanitizeTeamName(42), null);
});

check('distinct ground: identical sweeps count once, different sweeps add', () => {
  const a = discHex(0, 0, 22.5);
  const same = teamScoreFromHexes([a, a]);
  const single = teamScoreFromHexes([a]);
  assert.equal(same.coveredCells, single.coveredCells);
  assert.ok(single.coveredCells > 0);
  const other = discHex(0, 30, 22.5); // 30° away: partial overlap
  const both = teamScoreFromHexes([a, other]);
  assert.ok(both.coveredCells > single.coveredCells);
  assert.ok(both.coveredCells < single.coveredCells * 2);
});

check('distinct ground: invalid rows skipped, empty team is zero', () => {
  assert.equal(teamScoreFromHexes([]).coveredCells, 0);
  assert.equal(teamScoreFromHexes(['not-hex', null]).coveredCells, 0);
  const a = discHex(0, 0, 22.5);
  assert.equal(teamScoreFromHexes(['not-hex', a]).coveredCells, teamScoreFromHexes([a]).coveredCells);
});

check('ranking: more distinct ground wins; tie goes to earliest created', () => {
  const big = discHex(0, 0, 22.5);
  const small = discHex(0, 0, 5);
  const ranked = rankTeams([
    { id: 't-small', name: 'Small', createdAt: '2026-10-26T00:00:00Z', memberHexes: [small] },
    { id: 't-big-late', name: 'BigLate', createdAt: '2026-10-26T02:00:00Z', memberHexes: [big] },
    { id: 't-big-early', name: 'BigEarly', createdAt: '2026-10-26T01:00:00Z', memberHexes: [big] },
  ]);
  assert.equal(ranked[0].id, 't-big-early');
  assert.equal(ranked[0].place, 1);
  assert.equal(ranked[1].id, 't-big-late');
  assert.equal(ranked[1].place, 2);
  assert.equal(ranked[2].id, 't-small');
  assert.equal(ranked[2].place, 3);
  assert.equal(ranked[0].coveredCells, ranked[1].coveredCells);
});

check('settlement plan: top 5 only, per-member grants, right amounts', () => {
  const hex = discHex(0, 0, 22.5);
  const teams = [];
  for (let i = 0; i < 7; i++) {
    teams.push({ id: `t${i}`, name: `T${i}`, createdAt: `2026-10-26T0${i}:00:00Z`, memberHexes: [hex] });
  }
  // All tied on cells: tiebreak orders by createdAt, so t0..t4 win.
  const ranked = rankTeams(teams);
  const members = {};
  for (let i = 0; i < 7; i++) members[`t${i}`] = [`u${i}a`, `u${i}b`];
  const grants = planSettlement('oblivion-1', ranked, members);
  // 5 teams x 2 members = 10 grants; t5/t6 earn nothing.
  assert.equal(grants.length, 10);
  assert.ok(!grants.some((g) => g.teamId === 't5' || g.teamId === 't6'));
  const first = grants.filter((g) => g.place === 1);
  assert.equal(first.length, 2);
  assert.ok(first.every((g) => g.aether === 400 && g.usdCents === 1000));
  const fifth = grants.filter((g) => g.place === 5);
  assert.ok(fifth.every((g) => g.aether === 80 && g.usdCents === 200));
  assert.ok(grants.every((g) => g.idemKey === prizeIdemKey('oblivion-1', g.userId)));
  assert.ok(grants.every((g) => g.eventId === 'oblivion-1'));
});

check('settlement plan: empty team grants nothing; missing data grants nothing', () => {
  const ranked = rankTeams([{ id: 't0', name: 'T0', createdAt: '2026-10-26T00:00:00Z', memberHexes: [] }]);
  assert.equal(planSettlement('e1', ranked, { t0: [] }).length, 0);
  assert.equal(planSettlement('e1', ranked, {}).length, 0);
  assert.equal(planSettlement('', ranked, { t0: ['u1'] }).length, 0);
  assert.equal(planSettlement('e1', null, {}).length, 0);
});

check('garage finishes: known ids pass, unknown fall back to defaults', () => {
  assert.equal(sanitizeGarageFinish('ember', GARAGE_FLOOR_FINISHES, DEFAULT_GARAGE_FLOOR), 'ember');
  assert.equal(sanitizeGarageFinish('nope', GARAGE_FLOOR_FINISHES, DEFAULT_GARAGE_FLOOR), DEFAULT_GARAGE_FLOOR);
  assert.equal(sanitizeGarageFinish('forest', GARAGE_WALL_FINISHES, DEFAULT_GARAGE_WALL), 'forest');
  assert.equal(sanitizeGarageFinish(null, GARAGE_WALL_FINISHES, DEFAULT_GARAGE_WALL), DEFAULT_GARAGE_WALL);
  assert.ok(GARAGE_FLOOR_FINISHES.length > 0 && GARAGE_WALL_FINISHES.length > 0);
});

check('garage bays: one per member up to 5, craft names real, 6th dropped', () => {
  const members = [
    { userId: 'u1', craftId: 'wedge-supercar' },
    { userId: 'u2', craftId: 'not-a-craft' },
    { userId: 'u3', craftId: null },
    { userId: 'u4', craftId: 'blue-sports-car' },
    { userId: 'u5', craftId: null },
    { userId: 'u6', craftId: null },
  ];
  const garage = garageBays(members, 'midnight', 'brick');
  assert.equal(garage.bays.length, 5);
  assert.equal(garage.floor, 'midnight');
  assert.equal(garage.wall, 'brick');
  assert.equal(garage.bays[0].occupied, true);
  assert.equal(garage.bays[0].craftName, 'Lamborghini Aventador');
  assert.equal(garage.bays[1].occupied, true);
  assert.equal(garage.bays[1].craftName, null); // unknown craft: never faked
  assert.equal(garage.bays[2].craftName, null);
  assert.ok(!garage.bays.some((b) => b.userId === 'u6')); // 6th member dropped
});

check('garage bays: empty team is 5 open bays with defaults', () => {
  const garage = garageBays([], 'bogus-floor', 'bogus-wall');
  assert.equal(garage.bays.length, 5);
  assert.ok(garage.bays.every((b) => !b.occupied));
  assert.equal(garage.floor, DEFAULT_GARAGE_FLOOR);
  assert.equal(garage.wall, DEFAULT_GARAGE_WALL);
});

console.log(`\nearth-teams: ${passed} passed`);
