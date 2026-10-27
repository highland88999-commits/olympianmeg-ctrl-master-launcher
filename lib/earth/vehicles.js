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
// Tuning numbers are the builder's judgment calls (flagged for
// Merlin's correction), EXCEPT the wedge-supercar, which keeps
// its existing supercar tuning exactly (90 base × 2.0 boost —
// still Earth's fastest ride at boost). stepFlight takes a tuning
// object, so per-vehicle feel is just per-vehicle numbers — no
// shared stat block is imposed on vehicles that genuinely differ.
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
    engine: 'jet', tuning: { maxSpeed: 90, accel: 55, turnRate: 2.0, boostMult: 2.0, brakeRate: 80 },
    blurb: "Earth's fastest vehicle — rapid exploration.",
  },
  {
    id: 'blue-sports-car', name: 'Blue Sports Car', emoji: '🚗',
    glbUrl: '/models/vehicles/blue-sports-car.glb', lengthM: 4.5, hoverM: 0.35,
    engine: 'jet', tuning: { maxSpeed: 80, accel: 50, turnRate: 2.1, boostMult: 1.9, brakeRate: 75 },
    blurb: 'Quick, nimble sports car.',
  },
  {
    id: 'sports-car', name: 'Sports Car', emoji: '🚗',
    glbUrl: '/models/vehicles/sports-car.glb', lengthM: 4.5, hoverM: 0.35,
    engine: 'jet', tuning: { maxSpeed: 80, accel: 50, turnRate: 2.1, boostMult: 1.9, brakeRate: 75 },
    blurb: 'Quick, nimble sports car.',
  },
  {
    id: 'street-racer', name: 'Street Racer', emoji: '🏁',
    glbUrl: '/models/vehicles/street-racer.glb', lengthM: 4.5, hoverM: 0.35,
    engine: 'jet', tuning: { maxSpeed: 80, accel: 50, turnRate: 2.1, boostMult: 1.9, brakeRate: 75 },
    blurb: 'Built for the street — sharp turns, fast launch.',
  },
  {
    id: 'luxury-gt-1', name: 'Luxury GT 1', emoji: '🚗',
    glbUrl: '/models/vehicles/luxury-gt-1.glb', lengthM: 4.8, hoverM: 0.35,
    engine: 'jet', tuning: { maxSpeed: 82, accel: 52, turnRate: 2.0, boostMult: 1.9, brakeRate: 75 },
    blurb: 'Grand tourer — fast and smooth.',
  },
  {
    id: 'luxury-gt-2', name: 'Luxury GT 2', emoji: '🚗',
    glbUrl: '/models/vehicles/luxury-gt-2.glb', lengthM: 4.8, hoverM: 0.35,
    engine: 'jet', tuning: { maxSpeed: 82, accel: 52, turnRate: 2.0, boostMult: 1.9, brakeRate: 75 },
    blurb: 'Grand tourer — fast and smooth.',
  },
  {
    id: 'luxury-car', name: 'Luxury Car', emoji: '🚗',
    glbUrl: '/models/vehicles/luxury-car.glb', lengthM: 5.0, hoverM: 0.35,
    engine: 'jet', tuning: { maxSpeed: 70, accel: 42, turnRate: 1.9, boostMult: 1.7, brakeRate: 70 },
    blurb: 'Smooth cruiser — comfort over sprint.',
  },
  {
    id: 'teardrop-coupe', name: 'Teardrop Coupe', emoji: '🚗',
    glbUrl: '/models/vehicles/teardrop-coupe.glb', lengthM: 4.6, hoverM: 0.35,
    engine: 'jet', tuning: { maxSpeed: 70, accel: 42, turnRate: 1.9, boostMult: 1.7, brakeRate: 70 },
    blurb: 'Smooth cruiser — comfort over sprint.',
  },
  {
    id: 'muscle-car', name: 'Muscle Car', emoji: '🚗',
    glbUrl: '/models/vehicles/muscle-car.glb', lengthM: 4.7, hoverM: 0.35,
    engine: 'jet', tuning: { maxSpeed: 78, accel: 48, turnRate: 1.8, boostMult: 1.9, brakeRate: 70 },
    blurb: 'Strong launch, wide turns.',
  },
  // GTA fleet — pickups (engine, jet flame)
  {
    id: 'lifted-pickup', name: 'Lifted Pickup', emoji: '🛻',
    glbUrl: '/models/vehicles/lifted-pickup.glb', lengthM: 5.5, hoverM: 0.35,
    engine: 'jet', tuning: { maxSpeed: 58, accel: 34, turnRate: 1.5, boostMult: 1.5, brakeRate: 60 },
    blurb: 'High-riding workhorse — planted, steady.',
  },
  {
    id: 'pickup-hd', name: 'Pickup HD', emoji: '🛻',
    glbUrl: '/models/vehicles/pickup-hd.glb', lengthM: 5.5, hoverM: 0.35,
    engine: 'jet', tuning: { maxSpeed: 58, accel: 34, turnRate: 1.5, boostMult: 1.5, brakeRate: 60 },
    blurb: 'Heavy-duty pickup — planted, steady.',
  },
  // GTA fleet — motorcycles (engine, jet flame)
  {
    id: 'cruiser-bike', name: 'Cruiser Bike', emoji: '🏍',
    glbUrl: '/models/vehicles/cruiser-bike.glb', lengthM: 2.2, hoverM: 0.35,
    engine: 'jet', tuning: { maxSpeed: 85, accel: 52, turnRate: 2.5, boostMult: 1.9, brakeRate: 75 },
    blurb: 'Nimble on two wheels — turns on a dime.',
  },
  {
    id: 'sport-bike', name: 'Sport Bike', emoji: '🏍',
    glbUrl: '/models/vehicles/sport-bike.glb', lengthM: 2.2, hoverM: 0.35,
    engine: 'jet', tuning: { maxSpeed: 85, accel: 52, turnRate: 2.5, boostMult: 1.9, brakeRate: 75 },
    blurb: 'Nimble on two wheels — turns on a dime.',
  },
  // Star Wars shelf — already hosted
  {
    id: 'rover', name: 'Survey Rover', emoji: '🚙',
    glbUrl: '/models/vehicles/rover.glb', lengthM: 4.6, hoverM: 0.35,
    engine: 'jet', tuning: { maxSpeed: 42, accel: 26, turnRate: 1.6, boostMult: 1.4, brakeRate: 55 },
    blurb: 'Six-wheeled survey rover — goes anywhere, slowly.',
  },
  {
    id: 'tatooine-rover', name: 'Tatooine Rover', emoji: '🚙',
    glbUrl: '/models/vehicles/tatooine-rover.glb', lengthM: 5.2, hoverM: 0.35,
    engine: 'jet', tuning: { maxSpeed: 42, accel: 26, turnRate: 1.6, boostMult: 1.4, brakeRate: 55 },
    blurb: 'Six-wheeled rover — goes anywhere, slowly.',
  },
  {
    id: 'hauler', name: 'Cargo Hauler', emoji: '🚚',
    glbUrl: '/models/vehicles/hauler.glb', lengthM: 7.0, hoverM: 0.35,
    engine: 'jet', tuning: { maxSpeed: 50, accel: 28, turnRate: 1.35, boostMult: 1.4, brakeRate: 55 },
    blurb: 'Heavy cargo hauler — carries the whole expedition.',
  },
  {
    id: 'skiff', name: 'Hover Skiff', emoji: '🛸',
    glbUrl: '/models/vehicles/skiff.glb', lengthM: 4.2, hoverM: 1.0,
    engine: 'rotor', tuning: { maxSpeed: 65, accel: 40, turnRate: 2.2, boostMult: 1.7, brakeRate: 65 },
    blurb: 'Twin-rotor hover skiff — floats, hums, no jet flame.',
  },
  // Batch-4 vehicles — rigged recipe, bit-exact verified
  {
    id: 'long-haul-rover', name: 'The Long-Haul', emoji: '🚙',
    glbUrl: '/models/vehicles/long-haul-rover.glb', lengthM: 5.5, hoverM: 0.35,
    engine: 'jet', tuning: { maxSpeed: 42, accel: 26, turnRate: 1.6, boostMult: 1.4, brakeRate: 55 },
    blurb: 'Six wheels, no fear — carries the whole expedition.',
  },
  {
    id: 'ghost-throttle', name: 'The Ghost Throttle', emoji: '🏍',
    glbUrl: '/models/vehicles/ghost-throttle.glb', lengthM: 2.4, hoverM: 0.35,
    engine: 'jet', tuning: { maxSpeed: 95, accel: 58, turnRate: 2.6, boostMult: 1.8, brakeRate: 80 },
    blurb: 'A bike that outruns its own shadow. Boost stays under the Aventador.',
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
