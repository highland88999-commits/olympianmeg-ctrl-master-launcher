// Earth 2 vehicles, Phase 2 — the damage path itself
// (lib/earth2/vehicle-damage.js): one pure assess/apply path
// that every harm flows through. The pins:
//   - impact damage ∝ (speed past the class's free allowance)²
//     × an energy constant, ÷ the class's toughness — the
//     fragile bike pays far more than the armoured rover;
//   - grounding bills harder than the same-speed impact;
//   - the VTOL landing judge: descent energy ×3, a tilt
//     surcharge per degree past ~12°, a rolling term, and two
//     catastrophe lines (>30° of tilt, >12 m/s of contact
//     speed) that end the argument at once;
//   - a ditch bills a heavy base plus its descent energy;
//   - submersion drains per second, per class (a boat: never);
//   - a shot is a flat tenth of the bar — ten hits wreck
//     anything, parked or moving, and a wreck takes no more;
//   - the wreck transition sets wrecked + exploded + the
//     replacement timer, zeroes speed, and remembers the blow;
//   - the eject read: last safe position if it is wadeable,
//     else a ring scan for footing, else the shallowest point
//     found (the walker can swim — never a trap).
//
// Run: node --test tests/earth2-vehicle-damage.test.mjs

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  INTEGRITY_MAX,
  SHOT_DAMAGE,
  RESPAWN_DELAY_S,
  SHALLOW_DRIVE_DEPTH_M,
  DROWN_DEPTH_M,
  DAMAGE_TUNING,
  damageTuningFor,
  impactDamage,
  assessDamage,
  applyDamage,
  applyShotToVehicle,
  ejectPointFor,
  integrityColor,
} from '../lib/earth2/vehicle-damage.js';
import { vehicleSpec, modelSpec } from '../lib/earth2/vehicles.js';

const rover = vehicleSpec('rover');
const bike = vehicleSpec('speed-bike');
const scarab = vehicleSpec('scarab');
const vtol = vehicleSpec('vtol');
const boat = modelSpec('boat');

describe('the impact curve — energy, per class', () => {
  it('a touch at or under the free allowance costs nothing', () => {
    assert.equal(impactDamage(rover, 3), 0);
    assert.equal(impactDamage(rover, 1), 0);
    assert.equal(impactDamage(bike, 4), 0);
    assert.equal(impactDamage(vtol, 1.2), 0);
  });

  it('damage grows with the SQUARE of the excess speed', () => {
    const at9 = impactDamage(rover, 9); // (9−3)²·0.55/1.6
    assert.ok(Math.abs(at9 - 12.375) < 1e-9);
    const at15 = impactDamage(rover, 15); // excess doubled → damage ×4
    assert.ok(Math.abs(at15 - at9 * 4) < 1e-9);
  });

  it('toughness is per class: the bike is fragile, the rover is not', () => {
    assert.ok(impactDamage(bike, 30) > impactDamage(rover, 30) * 1.7,
      'the same crash costs the bike dearly more');
    assert.ok(impactDamage(scarab, 20) > impactDamage(rover, 20));
    assert.ok(impactDamage(bike, 30) > INTEGRITY_MAX * 4, 'a full-speed bike crash is not survivable math');
  });

  it('grounding bills a quarter harder than the same-speed impact', () => {
    const impact = assessDamage(boat, { kind: 'impact', impactSpeed: 12 }).amount;
    const grounding = assessDamage(boat, { kind: 'grounding', impactSpeed: 12 }).amount;
    assert.ok(Math.abs(grounding - impact * 1.25) < 1e-9);
    assert.equal(assessDamage(boat, { kind: 'grounding', impactSpeed: 2 }).amount, 0,
      'a gentle touch on the bottom is free — it merely beaches');
  });

  it('unknown slugs fall back by kind: air, water, ground', () => {
    assert.equal(damageTuningFor({ air: true }).submersionDrainPerSec, damageTuningFor(vtol).submersionDrainPerSec);
    assert.equal(damageTuningFor({ water: true }).submersionDrainPerSec, 0, 'a hull never drowns itself');
    assert.ok(damageTuningFor({}).toughness > 0);
    assert.ok(DAMAGE_TUNING.rover.toughness > DAMAGE_TUNING['speed-bike'].toughness);
  });
});

describe('the landing judge', () => {
  const land = (over) => assessDamage(vtol, { kind: 'landing', descentRate: 0, tiltRad: 0, horizontalSpeed: 0, contactSpeed: 0, ...over });

  it('a gentle, upright, slow arrival is nearly free', () => {
    const a = land({ descentRate: 1.5, contactSpeed: 1.5 });
    assert.ok(a.amount < 1 && a.catastrophic === false);
  });

  it('a full-rate descent is a firm arrival, priced at ×3 the descent energy', () => {
    const a = land({ descentRate: 3.2, contactSpeed: 3.2 });
    assert.ok(Math.abs(a.amount - 6.6) < 1e-9);
    assert.equal(a.catastrophic, false);
  });

  it('tilt surcharges per degree past the safe lean', () => {
    const upright = land({ descentRate: 3.2, contactSpeed: 3.2 }).amount;
    const leaned = land({ descentRate: 3.2, tiltRad: 0.35, contactSpeed: 3.2 }).amount; // ≈20°
    assert.ok(leaned > upright + 10, `the lean bills (${leaned.toFixed(1)} vs ${upright.toFixed(1)})`);
    assert.equal(land({ descentRate: 3.2, tiltRad: 0.35, contactSpeed: 3.2 }).catastrophic, false,
      '20° is hard, not fatal');
  });

  it('rolling speed on touchdown bills half its impact energy', () => {
    const still = land({ descentRate: 1, contactSpeed: 1 }).amount;
    const rolling = land({ descentRate: 1, horizontalSpeed: 10, contactSpeed: 10 }).amount;
    assert.ok(rolling > still + 20, 'rolling in fast is its own bill');
  });

  it('past 30° of tilt it is on its side: catastrophic, whatever the descent', () => {
    const a = land({ descentRate: 0.5, tiltRad: 0.55, contactSpeed: 0.5 });
    assert.equal(a.catastrophic, true);
    assert.ok(a.amount >= INTEGRITY_MAX, 'the bar does not survive it');
  });

  it('past 12 m/s of total contact speed it is catastrophic, however upright', () => {
    const a = land({ descentRate: 3.2, horizontalSpeed: 12, contactSpeed: 12.4 });
    assert.equal(a.catastrophic, true);
  });
});

describe('ditches, submersion, shots — the other sources', () => {
  it('a ditch bills a heavy base plus the descent energy', () => {
    const a = assessDamage(vtol, { kind: 'ditch', descentRate: 3.2 });
    assert.ok(Math.abs(a.amount - 57.2) < 1e-9);
    assert.equal(a.catastrophic, false, 'a ditch is survivable — the flooding is what finishes it');
  });

  it('submersion drains per second at the class rate; a boat never drains', () => {
    assert.equal(assessDamage(scarab, { kind: 'submersion', dt: 1 }).amount, 11);
    assert.equal(assessDamage(bike, { kind: 'submersion', dt: 2 }).amount, 28);
    assert.equal(assessDamage(boat, { kind: 'submersion', dt: 60 }).amount, 0);
  });

  it('a shot is a flat tenth of the bar; an explicit hit value overrides', () => {
    assert.equal(SHOT_DAMAGE, 10);
    assert.equal(assessDamage(rover, { kind: 'shot' }).amount, 10);
    assert.equal(assessDamage(rover, { kind: 'shot', damage: 25 }).amount, 25);
  });
});

describe('applyDamage — the one path', () => {
  it('deducts, clamps at zero, and does not mutate the input state', () => {
    const st = { x: 1, z: 2, speed: 5, integrity: 100, wrecked: false };
    const out = applyDamage(st, rover, { kind: 'impact', impactSpeed: 9 });
    assert.ok(Math.abs(out.integrity - (100 - 12.375)) < 1e-9);
    assert.equal(out.wrecked, false);
    assert.equal(st.integrity, 100, 'the input is untouched');
    assert.deepEqual(out.lastDamage, { kind: 'impact', amount: 12.375 });
  });

  it('the wrecking blow sets the full wreck state', () => {
    const out = applyDamage({ x: 1, z: 2, speed: 20, integrity: 5, wrecked: false }, bike, { kind: 'impact', impactSpeed: 20 });
    assert.equal(out.integrity, 0);
    assert.equal(out.wrecked, true);
    assert.equal(out.exploded, true);
    assert.equal(out.speed, 0);
    assert.equal(out.respawnIn, RESPAWN_DELAY_S);
  });

  it('a wreck takes no further damage', () => {
    const wreck = { x: 0, z: 0, speed: 0, integrity: 0, wrecked: true, exploded: true, respawnIn: 3 };
    const out = applyDamage(wreck, rover, { kind: 'impact', impactSpeed: 30 });
    assert.equal(out.integrity, 0);
    assert.equal(out.respawnIn, 3, 'the replacement timer is not restarted');
  });
});

describe('shooting — applyShotToVehicle', () => {
  it('ten hits wreck anything, and a parked vehicle can be shot to wreck', () => {
    let st = { x: 0, z: 0, speed: 0, integrity: INTEGRITY_MAX, wrecked: false }; // parked: speed 0
    for (let i = 0; i < 9; i++) st = applyShotToVehicle(st, rover);
    assert.equal(st.integrity, 10);
    assert.equal(st.wrecked, false);
    st = applyShotToVehicle(st, rover);
    assert.equal(st.wrecked, true);
    assert.equal(st.exploded, true);
    assert.equal(st.lastDamage.kind, 'shot');
  });
});

describe('the eject read — where the driver steps out', () => {
  const shore = { waterDepthAt: (x) => (x > 0 ? 3 : 0) };

  it('the previous position wins when it is wadeable', () => {
    const p = ejectPointFor({ x: 20, z: 0 }, shore, { x: -5, z: 0 });
    assert.deepEqual(p, { x: -5, z: 0 });
  });

  it('else the wreck’s own position, if the water there is wadeable', () => {
    const p = ejectPointFor({ x: -2, z: 0 }, shore, { x: 30, z: 0 });
    assert.deepEqual(p, { x: -2, z: 0 });
  });

  it('else a ring scan finds footing toward shore', () => {
    const p = ejectPointFor({ x: 20, z: 0 }, shore, { x: 24, z: 0 });
    assert.ok(p && shore.waterDepthAt(p.x, p.z) <= DROWN_DEPTH_M, 'somewhere the driver can stand');
  });

  it('in an endless deep the read still answers — the walker can swim', () => {
    const deep = { waterDepthAt: () => 4 };
    const p = ejectPointFor({ x: 100, z: 100 }, deep, { x: 100, z: 100 });
    assert.ok(p && Number.isFinite(p.x) && Number.isFinite(p.z));
  });

  it('the water law the steppers share: ford at 0.6, drown at the wading limit', () => {
    assert.equal(SHALLOW_DRIVE_DEPTH_M, 0.6);
    assert.equal(DROWN_DEPTH_M, 1.35);
  });
});

describe('the integrity colour — the bar the driver reads', () => {
  it('stays green while the machine is healthy', () => {
    assert.equal(integrityColor(100), '#4ade80');
    assert.equal(integrityColor(50), '#4ade80');
  });

  it('turns amber as she wears', () => {
    assert.equal(integrityColor(49), '#fbbf24');
    assert.equal(integrityColor(30), '#fbbf24');
  });

  it('turns red where the drive UI pulses', () => {
    assert.equal(integrityColor(29), '#f87171');
    assert.equal(integrityColor(0), '#f87171');
  });

  it('clamps and forgives bad input instead of throwing', () => {
    assert.equal(integrityColor(150), '#4ade80');
    assert.equal(integrityColor(-5), '#f87171');
    assert.equal(integrityColor(undefined), '#4ade80');
    assert.equal(integrityColor(NaN), '#4ade80');
  });
});
