// lib/earth/vehicles.js — Earth 1 drivable vehicle roster (pure data).
//
// Every vehicle Merlin owns that can drive on Earth 1, in one place:
//   - the GTA fleet (~/workspace/gta-assets/raw, 13 files): the
//     wedge-supercar was already live as the Lamborghini Aventador
//     (its staged file is byte-identical to Merlin's own Aventador
//     upload); the other 12 are optimized with the unrigged car
//     recipe (0 skins / 0 joints verified per file) and hosted
//     under public/models/vehicles/.
//   - the Star Wars shelf (public/models/vehicles/): rover, skiff,
//     hauler, tatooine-rover — already hosted, already optimized.
//   - the batch-4 vehicles (ids 108, 113): rigged, so optimized
//     with the RIGGED recipe (no meshopt, bit-exact skinning
//     verified) and hosted under public/models/vehicles/.
//
// The TRON bike is NOT in this roster: it is procedural, has its
// own summon (B / E keys, EarthBike), and is untouched by the
// craft picker.
//
// NOSE AUDIT 2026-10-26 (Merlin: "that one car is backwards…
// make sure they are all not backwards"): every shipped GLB was
// rendered as a filled side-profile silhouette from its own
// vertex data (triangle rasterization, not eyeballing), and each
// nose was read against the loader's alignment rule (longest
// horizontal axis to +Z; a Y-rotation of +90° maps file +X to
// world −Z). Result: 14 craft already face +Z after alignment;
// 5 drove backward and carry noseReversed: true, which the
// loader turns into an extra half-turn (lib/earth/vehicle-model.js
// effectiveRotY): luxury-gt-1, teardrop-coupe, pickup-hd and
// ghost-throttle all face file +X (every X-long Tripo model
// did), and cruiser-bike — the one Z-long reversal — faces file
// −Z (fork + handlebars at the −Z end). The jet flame sits at
// group −Z regardless, so a flipped craft's flame stays at its
// rear. The peer renderer (components/EarthPeers.jsx) applies
// the same rotY, so passers-by face forward too. The audit set
// is pinned in tests/earth-video-orders.test.mjs.
//
// Tuning numbers are the builder's judgment calls (flagged for
// Merlin's correction), EXCEPT the wedge-supercar, which keeps
// its existing supercar tuning exactly (90 base × 2.0 boost —
// still Earth's fastest ride at boost). stepFlight takes a tuning
// object, so per-vehicle feel is just per-vehicle numbers — no
// shared stat block is imposed on vehicles that genuinely differ.
//
// LOOSENED 2026-11-15 (Merlin: "loosen the driving controls"):
// turnRate ×1.5 and accel ×1.25 across the roster, brakeRate down
// (a lighter foot off the pedal), top speeds untouched — the car
// turns easily and feels free now, instead of rigid. The old
// values were turnRate 1.35–2.6, accel 26–58, brakeRate 55–80.
//
// Blue jet feel (the Tatooine speeder's blue flame, mirrored in
// lib/earth/jet-flame.js): every ENGINE-powered craft gets it.
// The one exception is the skiff — a twin-rotor hover craft, not
// a jet: rotors don't get exhaust flames, so it hovers instead
// (hoverM) with no flame. The TRON bike is out of scope (not in
// this roster, untouched).
//
// Lengths are visual-fit estimates (longest horizontal axis
// scaled to lengthM by the loader, same fit math the supercar
// always used) — flagged for Merlin's correction alongside the
// tuning numbers.

export const DEFAULT_CRAFT_ID = 'wedge-supercar';

/** Craft pick persistence — the character pick chain's mirror
 *  (lib/characters/embodiment.js surface overrides): the device
 *  holds the pick in localStorage; the picker writes it, the
 *  console reads it on mount, and summoning uses it. There is no
 *  profile craft field (no new SQL), so the device key is the
 *  whole chain — the same localStorage-first precedent the
 *  character picks already set. */
export const CRAFT_PICK_KEY = 'olympus.craftPick.earth';

export const VEHICLES = [
  // GTA fleet — cars (engine, jet flame)
  {
    id: 'wedge-supercar', name: 'Lamborghini Aventador', emoji: '🏎',
    glbUrl: '/models/vehicles/wedge-supercar.glb', lengthM: 4.6, hoverM: 0.35,
    engine: 'jet', tuning: { maxSpeed: 90, accel: 70, turnRate: 3.0, boostMult: 2.0, brakeRate: 60 },
    blurb: "Earth's fastest vehicle — rapid exploration.",
  },
  {
    id: 'blue-sports-car', name: 'Blue Sports Car', emoji: '🚗',
    glbUrl: '/models/vehicles/blue-sports-car.glb', lengthM: 4.5, hoverM: 0.35,
    engine: 'jet', tuning: { maxSpeed: 80, accel: 62, turnRate: 3.2, boostMult: 1.9, brakeRate: 55 },
    blurb: 'Quick, nimble sports car.',
  },
  {
    id: 'sports-car', name: 'Sports Car', emoji: '🚗',
    glbUrl: '/models/vehicles/sports-car.glb', lengthM: 4.5, hoverM: 0.35,
    engine: 'jet', tuning: { maxSpeed: 80, accel: 62, turnRate: 3.2, boostMult: 1.9, brakeRate: 55 },
    blurb: 'Quick, nimble sports car.',
  },
  {
    id: 'street-racer', name: 'Street Racer', emoji: '🏁',
    glbUrl: '/models/vehicles/street-racer.glb', lengthM: 4.5, hoverM: 0.35,
    engine: 'jet', tuning: { maxSpeed: 80, accel: 62, turnRate: 3.2, boostMult: 1.9, brakeRate: 55 },
    blurb: 'Built for the street — sharp turns, fast launch.',
  },
  {
    id: 'luxury-gt-1', name: 'Luxury GT 1', emoji: '🚗',
    glbUrl: '/models/vehicles/luxury-gt-1.glb', lengthM: 4.8, hoverM: 0.35,
    engine: 'jet', tuning: { maxSpeed: 82, accel: 65, turnRate: 3.0, boostMult: 1.9, brakeRate: 55 },
    blurb: 'Grand tourer — fast and smooth.',
    // NOSE AUDIT 2026-10-26 (see noseReversed note below): this
    // model's nose faces +X in file space, so the plain longest-
    // axis alignment drove it nose-backward. Flipped.
    noseReversed: true,
  },
  {
    id: 'luxury-gt-2', name: 'Luxury GT 2', emoji: '🚗',
    glbUrl: '/models/vehicles/luxury-gt-2.glb', lengthM: 4.8, hoverM: 0.35,
    engine: 'jet', tuning: { maxSpeed: 82, accel: 65, turnRate: 3.0, boostMult: 1.9, brakeRate: 55 },
    blurb: 'Grand tourer — fast and smooth.',
  },
  {
    id: 'luxury-car', name: 'Luxury Car', emoji: '🚗',
    glbUrl: '/models/vehicles/luxury-car.glb', lengthM: 5.0, hoverM: 0.35,
    engine: 'jet', tuning: { maxSpeed: 70, accel: 52, turnRate: 2.9, boostMult: 1.7, brakeRate: 55 },
    blurb: 'Smooth cruiser — comfort over sprint.',
  },
  {
    id: 'teardrop-coupe', name: 'Teardrop Coupe', emoji: '🚗',
    glbUrl: '/models/vehicles/teardrop-coupe.glb', lengthM: 4.6, hoverM: 0.35,
    engine: 'jet', tuning: { maxSpeed: 70, accel: 52, turnRate: 2.9, boostMult: 1.7, brakeRate: 55 },
    blurb: 'Smooth cruiser — comfort over sprint.',
    // NOSE AUDIT 2026-10-26: nose faces +X in file space — flipped.
    noseReversed: true,
  },
  {
    id: 'muscle-car', name: 'Muscle Car', emoji: '🚗',
    glbUrl: '/models/vehicles/muscle-car.glb', lengthM: 4.7, hoverM: 0.35,
    engine: 'jet', tuning: { maxSpeed: 78, accel: 60, turnRate: 2.7, boostMult: 1.9, brakeRate: 55 },
    blurb: 'Strong launch, wide turns.',
  },
  // GTA fleet — pickups (engine, jet flame)
  {
    id: 'lifted-pickup', name: 'Lifted Pickup', emoji: '🛻',
    glbUrl: '/models/vehicles/lifted-pickup.glb', lengthM: 5.5, hoverM: 0.35,
    engine: 'jet', tuning: { maxSpeed: 58, accel: 42, turnRate: 2.3, boostMult: 1.5, brakeRate: 45 },
    blurb: 'High-riding workhorse — planted, steady.',
  },
  {
    id: 'pickup-hd', name: 'Pickup HD', emoji: '🛻',
    glbUrl: '/models/vehicles/pickup-hd.glb', lengthM: 5.5, hoverM: 0.35,
    engine: 'jet', tuning: { maxSpeed: 58, accel: 42, turnRate: 2.3, boostMult: 1.5, brakeRate: 45 },
    blurb: 'Heavy-duty pickup — planted, steady.',
    // NOSE AUDIT 2026-10-26: nose faces +X in file space — flipped.
    noseReversed: true,
  },
  // GTA fleet — motorcycles (engine, jet flame)
  {
    id: 'cruiser-bike', name: 'Cruiser Bike', emoji: '🏍',
    glbUrl: '/models/vehicles/cruiser-bike.glb', lengthM: 2.2, hoverM: 0.35,
    engine: 'jet', tuning: { maxSpeed: 85, accel: 65, turnRate: 3.8, boostMult: 1.9, brakeRate: 55 },
    blurb: 'Nimble on two wheels — turns on a dime.',
    // NOSE AUDIT 2026-10-26: fork + handlebars face -Z in file
    // space — the one Z-long model that drove backward. Flipped.
    noseReversed: true,
  },
  {
    id: 'sport-bike', name: 'Sport Bike', emoji: '🏍',
    glbUrl: '/models/vehicles/sport-bike.glb', lengthM: 2.2, hoverM: 0.35,
    engine: 'jet', tuning: { maxSpeed: 85, accel: 65, turnRate: 3.8, boostMult: 1.9, brakeRate: 55 },
    blurb: 'Nimble on two wheels — turns on a dime.',
  },
  // Star Wars shelf — already hosted
  {
    id: 'rover', name: 'Survey Rover', emoji: '🚙',
    glbUrl: '/models/vehicles/rover.glb', lengthM: 4.6, hoverM: 0.35,
    engine: 'jet', tuning: { maxSpeed: 42, accel: 32, turnRate: 2.4, boostMult: 1.4, brakeRate: 45 },
    blurb: 'Six-wheeled survey rover — goes anywhere, slowly.',
  },
  {
    id: 'tatooine-rover', name: 'Tatooine Rover', emoji: '🚙',
    glbUrl: '/models/vehicles/tatooine-rover.glb', lengthM: 5.2, hoverM: 0.35,
    engine: 'jet', tuning: { maxSpeed: 42, accel: 32, turnRate: 2.4, boostMult: 1.4, brakeRate: 45 },
    blurb: 'Six-wheeled rover — goes anywhere, slowly.',
  },
  {
    id: 'hauler', name: 'Cargo Hauler', emoji: '🚚',
    glbUrl: '/models/vehicles/hauler.glb', lengthM: 7.0, hoverM: 0.35,
    engine: 'jet', tuning: { maxSpeed: 50, accel: 35, turnRate: 2.0, boostMult: 1.4, brakeRate: 45 },
    blurb: 'Heavy cargo hauler — carries the whole expedition.',
  },
  {
    id: 'skiff', name: 'Hover Skiff', emoji: '🛸',
    glbUrl: '/models/vehicles/skiff.glb', lengthM: 4.2, hoverM: 1.0,
    engine: 'rotor', tuning: { maxSpeed: 65, accel: 50, turnRate: 3.3, boostMult: 1.7, brakeRate: 50 },
    blurb: 'Twin-rotor hover skiff — floats, hums, no jet flame.',
  },
  // Batch-4 vehicles — rigged recipe, bit-exact verified
  {
    id: 'long-haul-rover', name: 'The Long-Haul', emoji: '🚙',
    glbUrl: '/models/vehicles/long-haul-rover.glb', lengthM: 5.5, hoverM: 0.35,
    engine: 'jet', tuning: { maxSpeed: 42, accel: 32, turnRate: 2.4, boostMult: 1.4, brakeRate: 45 },
    blurb: 'Six wheels, no fear — carries the whole expedition.',
  },
  {
    id: 'ghost-throttle', name: 'The Ghost Throttle', emoji: '🏍',
    glbUrl: '/models/vehicles/ghost-throttle.glb', lengthM: 2.4, hoverM: 0.35,
    engine: 'jet', tuning: { maxSpeed: 95, accel: 72, turnRate: 3.9, boostMult: 1.8, brakeRate: 60 },
    blurb: 'A bike that outruns its own shadow. Boost stays under the Aventador.',
    // NOSE AUDIT 2026-10-26: nose faces +X in file space — flipped.
    noseReversed: true,
  },
];

const BY_ID = new Map(VEHICLES.map((v) => [v.id, v]));

/** Vehicle record by id, or null. */
export function getVehicle(id) {
  return typeof id === 'string' ? BY_ID.get(id) || null : null;
}

/** The full drivable roster, in picker order. */
export function listVehicles() {
  return VEHICLES;
}

/** True when the craft id is a known Earth vehicle. */
export function isVehicleId(id) {
  return typeof id === 'string' && BY_ID.has(id);
}

/** Resolve a stored craft pick: unknown/empty falls back to the default. */
export function resolveCraftId(raw) {
  return isVehicleId(raw) ? raw : DEFAULT_CRAFT_ID;
}

/** Boost top speed (base × boostMult) — the number the picker shows. */
export function boostTopSpeed(v) {
  if (!v || !v.tuning) return 0;
  return v.tuning.maxSpeed * v.tuning.boostMult;
}

/** Display top speed, km/h — the number the entry menu shows
 *  (components/EarthVehicleSelect.jsx topSpeedKmh): boost top ×
 *  the ×3 globe step × 3.6. padMult is the boost-pad multiplier
 *  (PAD_BOOST_MULT while a pad boost is live, else 1) — a pad
 *  legitimately raises the top for 4 s, so the needle's cap
 *  rises with it instead of pinning under a real pad boost.
 *  Muscle Car: 78 × 1.9 × 3 × 3.6 = 1600.6 km/h (2400.8 on a
 *  pad). Pure — pinned in tests/earth1-round2. */
export function topSpeedKmh(v, padMult = 1) {
  if (!v || !v.tuning) return 0;
  return boostTopSpeed(v) * 3 * 3.6 * (Number(padMult) || 1);
}

/** Clamp a flight-unit speed (carState.speed units) to a
 *  craft's top: base × boostMult, × padMult while a pad boost
 *  is live. stepFlight aims at the cap but never enforces it on
 *  the carried speed — after a pad expires, or a swap to a
 *  slower craft, the old speed only decays down at accel rate
 *  and the car genuinely drives over its new top for ~1 s. The
 *  scene clamps the carried speed with this every frame so the
 *  car itself can never exceed its top, not just the needle.
 *  Unknown vehicle → the speed comes back untouched (no cap
 *  known); non-finite speed → 0. Pure — pinned in
 *  tests/earth1-round2. */
export function clampFlightSpeed(speed, vehicle, padMult = 1) {
  const s = Number(speed);
  if (!Number.isFinite(s)) return 0;
  if (!vehicle || !vehicle.tuning) return s;
  const cap = boostTopSpeed(vehicle) * (Number(padMult) || 1);
  return Math.max(-cap, Math.min(cap, s));
}
