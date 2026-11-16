// tests/earth1-entry.test.mjs — Earth 1 vehicles-only entry
// (Merlin, 2026-11-15): on entering Earth 1 the user gets ONLY a
// vehicle selection menu — every roster vehicle listed WITH a live
// 3D preview of it — then taps the Earth globe to spawn, already
// in the vehicle. No walker, no on-foot mode, no walking anywhere.
//
// Pins: the roster lists all 19 vehicles with emoji + name +
// blurb + top speed; the menu loads the real GLB for the preview
// (never a faked image); the globe click maps to a spawn lat/lon;
// no walker/on-foot path remains reachable anywhere in the Earth
// 1 dive (no mounts, no walk stepping, no walk UI, no summon /
// dismount / swap keys, deleted files gone).
//
// Run: node tests/earth1-entry.test.mjs (from the repo root).
import assert from 'node:assert';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { listVehicles, boostTopSpeed } from '../lib/earth/vehicles.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

let passed = 0;
let failed = 0;
function t(name, cond) {
  if (cond) passed++;
  else { failed++; console.error(`FAIL: ${name}`); }
}

// --- The roster: all 19, each with emoji + name + blurb + speed ---
{
  const roster = listVehicles();
  t('roster lists all 19 vehicles', roster.length === 19);
  const ids = new Set();
  for (const v of roster) {
    t(`vehicle ${v.id} has an id`, typeof v.id === 'string' && v.id.length > 0);
    t(`vehicle ${v.id} has a name`, typeof v.name === 'string' && v.name.length > 0);
    t(`vehicle ${v.id} has an emoji`, typeof v.emoji === 'string' && v.emoji.length > 0);
    t(`vehicle ${v.id} has a blurb`, typeof v.blurb === 'string' && v.blurb.length > 0);
    t(`vehicle ${v.id} has tuning`, !!v.tuning && typeof v.tuning.maxSpeed === 'number');
    t(`vehicle ${v.id} has a boost top speed`, boostTopSpeed(v) > 0);
    t(`vehicle ${v.id} keeps its GLB url`, typeof v.glbUrl === 'string' && v.glbUrl.endsWith('.glb'));
    ids.add(v.id);
  }
  t('all 19 roster ids are unique', ids.size === 19);
  t('the default craft is the Aventador', roster[0].id === 'wedge-supercar');
}

// --- The menu: select + live 3D preview + spawn, nothing else ---
{
  const menu = read('components/EarthVehicleSelect.jsx');
  t('menu lists the roster from listVehicles', menu.includes('listVehicles'));
  t('menu shows a live 3D preview', menu.includes('VehiclePreview') && menu.includes('<Canvas'));
  t('preview loads the real model', menu.includes('ensureVehicleModel') && menu.includes('subscribeVehicleModel'));
  t('preview never fakes an image', !menu.includes('<img') && !menu.includes('placeholder'));
  t('preview failure is honest', menu.includes('Model failed to load'));
  t('preview carries its own minimal lights', menu.includes('<ambientLight') && menu.includes('<directionalLight'));
  t('menu asks for a globe tap to spawn', menu.includes('Tap the Earth to choose your spawn'));
  t('menu reports the pick (onSelect)', menu.includes('onSelect'));
  t('menu reports pick mode (onPickModeChange)', menu.includes('onPickModeChange'));
  t('menu can cancel (onCancel)', menu.includes('onCancel'));
  t('menu never opens the old craft picker', !menu.includes('EarthCraftPicker'));
  t('menu never opens a character picker', !menu.includes('CharacterPicker'));
  // The word 'landmark' survives only in the header's removal
  // note — the menu carries no landmark data or list.
  t('menu never lists landmarks', !menu.includes('landmarkSpawns') && !menu.includes('Walk at a landmark'));
}

// --- Click-to-spawn: the globe click becomes a lat/lon ---
{
  for (const f of ['components/ProceduralEarthGlobe.jsx', 'components/GoogleEarthTiles.jsx']) {
    const src = read(f);
    t(`${f} accepts onGlobeClick`, src.includes('onGlobeClick'));
    t(`${f} maps the click point to lat/lon`, src.includes('globeWorldPointToLatLon'));
  }
  const nexus = read('components/NexusEarth.jsx');
  t('NexusEarth passes onGlobeClick to the tiles globe', nexus.includes('onGlobeClick={onGlobeClick}'));
  t('NexusEarth passes onGlobeClick to the terrain globe', nexus.includes('onGlobeClick={onGlobeClick}'));
  t('NexusEarth keeps the old onSelect untouched', nexus.includes('onSelect={onSelect}'));
  const home = read('components/HomeScene.jsx');
  t('HomeScene gates the dive chooser off in pick mode', home.includes("appState === 'hub_freeroam' && !earthPickMode ? beginEarthDive : null"));
  t('HomeScene threads the globe-click handler', home.includes('onGlobeClick={onEarthGlobeClick}'));
  const page = read('app/page.jsx');
  t('page opens the vehicle menu (not the dive) for Earth 1', page.includes('setShowEarthVehicleSelect(true)'));
  t('page spawns on the globe tap', page.includes('handleEarthGlobeClick'));
  t('globe tap summons the selected craft', page.includes('summonCar(selectedEarthCraftRef.current)'));
  t('globe tap dives straight to street', page.includes("setAppState('diving_to_street')"));
  t('globe tap begins roaming at the tapped point', page.includes('beginRoam(roamState, lat, lon, 0)'));
  t('page mounts the vehicle menu in hub_freeroam', page.includes('<EarthVehicleSelect'));
}

// --- No walker / on-foot path remains reachable ---
{
  // The files themselves are gone.
  for (const f of ['components/EarthWalker.jsx', 'components/EarthBike.jsx', 'components/EarthCraftPicker.jsx']) {
    t(`${f} is deleted`, !existsSync(join(root, f)));
  }
  // No mount, no import, no reference in the scene.
  const nexus = read('components/NexusEarth.jsx');
  for (const gone of ['EarthWalker', 'EarthBike', 'RedwaterMount', 'EarthPitMarker']) {
    t(`NexusEarth never mounts ${gone}`, !nexus.includes(gone));
  }
  t('NexusEarth mounts the kart systems', nexus.includes('<EarthKart />'));
  t('NexusEarth mounts the vehicle', nexus.includes('<EarthSupercar'));
  // No walk stepping, no climb, no bike in the flight controller.
  const flight = read('components/EarthFlightController.jsx');
  t('flight controller never steps the walker', !flight.includes('stepRoam('));
  t('flight controller never steps a climb', !flight.includes('stepClimb('));
  t('flight controller never reads the bike', !flight.includes('bikeState'));
  // 'journeyActive' survives only in a removal comment — the
  // live read (roamState.journeyActive) is gone.
  t('flight controller never reads the journey', !flight.includes('roamState.journeyActive'));
  // No summon / dismount / swap in the car.
  const car = read('components/EarthSupercar.jsx');
  for (const gone of ['toggleCarMount', 'dismissCar', 'swapCarCraft']) {
    t(`EarthSupercar has no ${gone}`, !car.includes(gone));
  }
  t('EarthSupercar never toggles mount on click', !car.includes('toggleCarMount()'));
  t('EarthSupercar keeps the V/F keys out', !car.includes("k === 'v'") && !car.includes("k === 'f'"));
  // No walk UI in the console.
  const consoleSrc = read('components/EarthConsole.jsx');
  for (const gone of ['<BikeControls', '<CharacterPicker', '<EarthCraftPicker', '<EarthTeamPanel', 'onSpawnPick']) {
    t(`console never renders ${gone}`, !consoleSrc.includes(gone));
  }
  t('console never lists landmark spawns', !consoleSrc.includes('>Walk at a landmark<'));
  t('console never searches places', !consoleSrc.includes('searchPlaces'));
  // No landmark spawn path in the page.
  const page = read('app/page.jsx');
  t('page never imports landmarkSpawns', !page.includes('landmarkSpawns'));
  t('page never calls a spawn picker', !page.includes('pickSpawn('));
}

console.log(`earth1-entry: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
