// tests/earth1-round2.test.mjs — Pins for the Earth 1 fix +
// polish round (Merlin, 2026-11-15): tiling + mapping gone,
// prerendered ground, loosened steering, no overlapping
// spawns, HUD swap, car never drives sideways, black preview
// fixed, drive stick actually rendering, Thanksgiving decor
// untouched. The ground-system pins live in
// earth-driving-ground.test.mjs; the spawn-separation pins
// live in earth1-kart.test.mjs.
// Run: node tests/earth1-round2.test.mjs (from the repo root).
import { readFileSync, existsSync } from 'fs';
import { VEHICLES, getVehicle } from '../lib/earth/vehicles.js';
import { DISPLAY_UNITS_PER_METRE } from '../lib/earth/placements.js';
import { stepFlight } from '../lib/nova-flight.js';
import { forwardOnlyStep } from '../lib/earth/roam.js';

let passed = 0, failed = 0;
function t(name, cond) {
  if (cond) { passed++; }
  else { failed++; console.error(`FAIL: ${name}`); }
}
const src = (p) => readFileSync(p, 'utf8');

// --- No per-tile colour assignment in any live Earth 1 path ---
{
  const files = [
    'components/NexusEarth.jsx',
    'components/EarthSupercar.jsx',
    'components/EarthKart.jsx',
    'components/EarthPeers.jsx',
    'components/EarthVehicleSelect.jsx',
    'components/EarthConsole.jsx',
    'app/page.jsx',
  ];
  const banned = [
    'metalTileColorForCell', 'metalTileHash', 'startLensBuild',
    'lensTilePlan', 'buildLensGeometryData', 'markDisc',
    'setMappedPercent', 'coveragePercent', 'EarthMappedTracker',
  ];
  for (const f of files) {
    const s = src(f);
    for (const b of banned) {
      t(`${f} has no ${b}`, !s.includes(b));
    }
    // '<StreetGroundPatch' = the component mount (the module path
    // still appears in NexusEarth's StreetFillLight import — the
    // file stays on disk, unmounted, with its fill light).
    t(`${f} mounts no StreetGroundPatch`, !s.includes('<StreetGroundPatch'));
  }
  const nexus = src('components/NexusEarth.jsx');
  t('NexusEarth builds no tiles while driving',
    !nexus.includes('render-queue') && !nexus.includes('rendered-tiles')
    && !nexus.includes('lens-cache') && !nexus.includes('mapping-progress'));
}

// --- The mapping pill + system are gone completely ---
{
  const page = src('app/page.jsx');
  t('page mounts no EarthMappedTracker', !page.includes('EarthMappedTracker'));
  t('page imports no EarthMappedTracker', !page.includes("components/EarthMappedTracker"));
  t('EarthMappedTracker component is deleted',
    !existsSync('components/EarthMappedTracker.jsx'));
  const console = src('components/EarthConsole.jsx');
  t('console carries no mapping pill or percent',
    !console.includes('Mapped') && !console.includes('mappedPercent')
    && !console.includes('coveragePercent') && !console.includes('team map'));
}

// --- HUD swap: rocket pill where FIRE was, FIRE below it ---
{
  const c = src('components/EarthConsole.jsx');
  const stackIdx = c.indexOf('flex flex-col items-end gap-2');
  t('FIRE cluster is a vertical stack on the right', stackIdx !== -1);
  const rocketIdx = c.indexOf('🚀 ×{hud.missiles}', stackIdx);
  // The button's text node is `FIRE` on its own line (not
  // `>FIRE<` — the opening tag closes on the line above it).
  const fireIdx = c.indexOf('\n              FIRE\n', stackIdx);
  t('rocket pill renders inside the stack', rocketIdx !== -1);
  t('FIRE button renders inside the stack', fireIdx !== -1);
  t('rocket pill sits ABOVE the FIRE button', rocketIdx !== -1 && fireIdx !== -1 && rocketIdx < fireIdx);
  // Round 3 (Merlin, 2026-11-15, annotated screenshot — move
  // them DOWN): the stack rides at 142px, just above the drive
  // stick (bottom edge 18px, 112px tall → top at 130px, + 12px
  // gap), and the speed pill sits at the bottom edge too.
  t('stack rides at 142px (just above the 18–130px drive stick)',
    c.includes("bottom: 'calc(env(safe-area-inset-bottom, 0px) + 142px)'"));
  t('speed pill sits at the bottom edge (18px)',
    c.includes("bottom: 'calc(env(safe-area-inset-bottom, 0px) + 18px)'"));
  t('no HUD piece sits at the old 216px / 92px heights',
    !c.includes('+ 216px)') && !c.includes('+ 92px)'));
}

// --- Loosened steering (old values in the comment header of
// lib/earth/vehicles.js: turnRate 1.35–2.6, accel 26–58,
// brakeRate 55–80) ---
{
  const av = getVehicle('wedge-supercar').tuning;
  t('Aventador turnRate 3.0 (was 2.0)', av.turnRate === 3.0);
  t('Aventador accel 70 (was 55)', av.accel === 70);
  t('Aventador brakeRate 60 (was 80)', av.brakeRate === 60);
  t('Aventador top speed untouched (90)', av.maxSpeed === 90);
  t('Aventador boost untouched (2.0)', av.boostMult === 2.0);
  const sports = VEHICLES.find((v) => v.id === 'sports-car');
  t('sports cars turnRate 3.2 / accel 62 / brakeRate 55',
    sports.tuning.turnRate === 3.2 && sports.tuning.accel === 62 && sports.tuning.brakeRate === 55);
  const bikes = VEHICLES.filter((v) => v.id.includes('bike'));
  t('bikes are the loosest (turnRate 3.8)',
    bikes.length > 0 && bikes.every((b) => b.tuning.turnRate === 3.8));
  const hauler = VEHICLES.find((v) => v.id === 'hauler');
  t('hauler turnRate 2.0 / accel 35 / brakeRate 45',
    hauler.tuning.turnRate === 2.0 && hauler.tuning.accel === 35 && hauler.tuning.brakeRate === 45);
  t('every vehicle turns at 2.0 or better (old floor was 1.35)',
    VEHICLES.every((v) => v.tuning.turnRate >= 2.0));
  t('no vehicle brakes at the old hard 80',
    VEHICLES.every((v) => v.tuning.brakeRate <= 60));
}

// --- Coast: lifting off rolls down, it does not halt dead ---
{
  const base = { speed: 25, yaw: 0, pitch: 0, pos: { x: 0, y: 0, z: 0 } };
  const tuning = { maxSpeed: 90, accel: 70, turnRate: 3.0, boostMult: 2.0, brakeRate: 60 };
  const coasted = stepFlight(base, { thrust: 0, brake: false }, 1, { ...tuning, coastRate: 10 });
  t('with coastRate 10, 25 m/s rolls to 15 m/s in 1 s (not 0)', coasted.speed === 15);
  const hard = stepFlight(base, { thrust: 0, brake: false }, 1, tuning);
  t('without coastRate the old hard stop stands (25 -> 0)', hard.speed === 0);
  const braked = stepFlight(base, { thrust: 0, brake: true }, 1, { ...tuning, coastRate: 10 });
  t('brake still uses brakeRate, not coastRate', braked.speed === 0);
  t('EarthSupercar passes coastRate 10',
    src('components/EarthSupercar.jsx').includes('coastRate: 10'));
}

// --- The car never drives sideways: zero lateral velocity ---
{
  const eps = 1e-9;
  const fwd = forwardOnlyStep(0, 0, 0.001, 0, 0);
  t('pure forward (north, yaw 0) is kept whole',
    Math.abs(fwd.lat - 0.001) < eps && Math.abs(fwd.lon) < eps);
  const lat = forwardOnlyStep(0, 0, 0, 0.001, 0);
  t('pure lateral (east, yaw 0) is dropped entirely',
    Math.abs(lat.lat) < eps && Math.abs(lat.lon) < eps);
  const diag = forwardOnlyStep(0, 0, 0.001, 0.001, 0);
  t('diagonal keeps only the forward component',
    Math.abs(diag.lat - 0.001) < eps && Math.abs(diag.lon) < eps);
  const rev = forwardOnlyStep(0, 0, -0.001, 0, 0);
  t('reversing is kept (negative forward is not lateral)',
    Math.abs(rev.lat + 0.001) < eps && Math.abs(rev.lon) < eps);
  const east = forwardOnlyStep(0, 0, 0, 0.001, 90);
  t('yaw 90: east is forward, kept', Math.abs(east.lon - 0.001) < eps && Math.abs(east.lat) < eps);
  const eastLat = forwardOnlyStep(0, 0, 0.001, 0, 90);
  t('yaw 90: north is lateral, dropped',
    Math.abs(eastLat.lat) < eps && Math.abs(eastLat.lon) < eps);
  t('EarthSupercar applies forwardOnlyStep after collision',
    src('components/EarthSupercar.jsx').includes('forwardOnlyStep'));
}

// --- Black preview fixed: the car fills the frame ---
{
  const sel = src('components/EarthVehicleSelect.jsx');
  t('preview camera pulled in to [0, 1.2, 6]',
    sel.includes('camera={{ position: [0, 1.2, 6], fov: 45 }}'));
  t('preview group is scaled by fitScale',
    sel.includes('scale={model.scale * fitScale}'));
  // previewFitScale lives in the JSX (not importable in node):
  // 2 / (lengthM × DISPLAY_UNITS_PER_METRE). Pin the formula
  // text, then evaluate the same math here.
  t('fit formula targets a ~2-unit render',
    sel.includes('return 2 / (craft.lengthM * DISPLAY_UNITS_PER_METRE)'));
  const previewFitScale = (craft) => 2 / (craft.lengthM * DISPLAY_UNITS_PER_METRE);
  const av = getVehicle('wedge-supercar');
  const rendered = av.lengthM * DISPLAY_UNITS_PER_METRE * previewFitScale(av);
  t('Aventador renders ~2 units long in the preview (was 0.074)',
    Math.abs(rendered - 2) < 0.01);
  const bike = VEHICLES.find((v) => v.id.includes('bike'));
  const bikeRendered = bike.lengthM * DISPLAY_UNITS_PER_METRE * previewFitScale(bike);
  t('bike also renders ~2 units long (fit is per-craft)',
    Math.abs(bikeRendered - 2) < 0.01);
}

// --- The drive stick renders in earth_roam (the 0 km/h root
// cause: it lived inside the hub_freeroam fragment, so its own
// earth_roam gate could never fire) ---
{
  const page = src('app/page.jsx');
  const hubClose = page.indexOf('FLIGHT AXIS toggle');
  const stickIdx = page.indexOf('<WalkJoystick', hubClose);
  t('drive stick JSX sits after the hub block (top level)',
    hubClose !== -1 && stickIdx !== -1 && stickIdx > hubClose);
  const stickGate = page.indexOf("appState === 'earth_roam'", stickIdx - 400);
  t('drive stick is gated on earth_roam', stickGate !== -1);
  t('left-half floating stick stands down in earth_roam',
    page.includes("if (appState === 'earth_roam') return;"));
  t('first-entry hint is top level too',
    page.indexOf('Bottom-right stick steers') > hubClose);
}

// --- Thanksgiving decor untouched ---
{
  const dec = src('lib/seasonal/decorations.js');
  t('buildThanksgiving still exists', dec.includes('function buildThanksgiving'));
  t('harvest leaves keep their orange/amber colours',
    dec.includes('0xd97b29') && dec.includes('0xb8451f') && dec.includes('0xe0a93e'));
  t('Thanksgiving still mounts in the seasonal registry',
    dec.includes('thanksgiving: (THREE) => buildThanksgiving(THREE)'));
  const earthFiles = ['components/NexusEarth.jsx', 'components/EarthSupercar.jsx',
    'components/EarthKart.jsx', 'components/EarthPeers.jsx'];
  t('no Earth 1 driving file references the decor (it mounts globally, untouched)',
    earthFiles.every((f) => !src(f).includes('buildThanksgiving') && !src(f).includes('SeasonalDecor')));
}

// --- Peer render separation (player + rivals + peers) ---
{
  const peers = src('components/EarthPeers.jsx');
  t('EarthPeers imports the 25 m separation constant',
    peers.includes('SPAWN_MIN_SEPARATION_M'));
  t('EarthPeers pushes rendered peers apart',
    peers.includes('SPAWN_MIN_SEPARATION_M') && /placed/.test(peers));
  t('shared peer list still publishes TRUE positions',
    peers.includes('setSharedPeerVehicles'));
}

// --- Round 3 (Merlin, 2026-11-15): the "Map this world"
// notice is gone entirely (crossed out in his screenshot);
// the circled HUD pieces move DOWN to the bottom edge; the
// ground wears his true scratched texture as a tiled detail
// layer; the tapped spawn point is separation-checked; no
// vehicle ever spawns — or stays — on top of another. ---
{
  // The notice is GONE: component deleted, mount + import gone,
  // the text nowhere in any live Earth 1 path.
  t('EarthOblivionPrompt component is deleted',
    !existsSync('components/EarthOblivionPrompt.jsx'));
  const page = src('app/page.jsx');
  t('page imports no EarthOblivionPrompt', !page.includes('EarthOblivionPrompt'));
  t('page mounts no EarthOblivionPrompt', !page.includes('<EarthOblivionPrompt'));
  t('the notice text is gone from the page', !page.includes('Map this world'));
  t('the notice text is gone from EarthConsole', !src('components/EarthConsole.jsx').includes('Map this world'));
  // The Oblivion rule itself is untouched — the Jupiter lever is
  // still the only trigger (pinned in earth1-entry).
  t('Jupiter lever file untouched by the notice removal',
    src('lib/jupiter2/lever.js').length > 0);

  // HUD move-down: the drive stick sits at the bottom edge.
  const stickIdx = page.indexOf('<WalkJoystick');
  const stickBlock = page.slice(Math.max(0, stickIdx - 400), stickIdx);
  t('drive stick sits at the bottom edge (18px)',
    stickBlock.includes("bottom: 'calc(env(safe-area-inset-bottom, 0px) + 18px)'"));
  t('drive stick no longer rides at 92px', !stickBlock.includes('+ 92px)'));

  // Ground true texture: a tiled detail layer from his static
  // images over the video colour — the 9-colour fade, the
  // mirror sheen and the prerendered ground all stay.
  const ground = src('components/earth/PrerenderedEarthGround.jsx');
  t('ground wears the detail texture as bumpMap',
    ground.includes('getGroundDetailTexture()') && ground.includes('bumpMap: detailTex'));
  t('ground wears the detail texture as roughnessMap',
    ground.includes('roughnessMap: detailTex'));
  t('ground detail bump scale is set', ground.includes('GROUND_DETAIL_BUMP_SCALE'));
  t('detail overlay sphere multiplies the ground colour',
    ground.includes('THREE.MultiplyBlending') && ground.includes('GROUND_DETAIL_OVERLAY_LIFT'));
  t('ground still wears the video as map + emissive (fade kept)',
    ground.includes('map: videoTex') && ground.includes('emissiveMap: videoTex'));
  t('ground still one sphere at TERRAIN_RADIUS (prerender kept)',
    ground.includes('sphereGeometry args={[TERRAIN_RADIUS, 96, 64]}'));
  const gv = src('lib/earth/ground-video.js');
  t('detail loader exists', gv.includes('export function getGroundDetailTexture'));
  t('detail source is his silver scratched jpg',
    gv.includes("GROUND_DETAIL_TEXTURE_URL = '/textures/scratched/silver.jpg'"));
  t('detail repeats are ~7 m tiles (48 x 24)',
    gv.includes('GROUND_DETAIL_REPEAT_U = 48') && gv.includes('GROUND_DETAIL_REPEAT_V = 24'));
  t('detail texture file exists on disk', existsSync('public/textures/scratched/silver.jpg'));

  // The tapped spawn point is separation-checked at the tap.
  t('globe tap checks the spawn point against rivals + peers',
    page.includes('clearSpawnPoint(lat, lon, [...kartState.rivals, ...sharedPeerVehicles])'));
  t('page imports the spawn check + kart state',
    page.includes("from '@/lib/earth/kart'") && page.includes('clearSpawnPoint'));

  // Continuous separation is wired into the frame loop.
  const kart = src('components/EarthKart.jsx');
  t('EarthKart imports separateVehicles', kart.includes('separateVehicles'));
  t('EarthKart runs the separation pass every frame',
    kart.includes('separateVehicles(') && kart.includes('fixed: true'));
  t('player respawn is separation-checked', kart.includes('advanceHit(kartState.playerHit, nowMs, ['));
  t('rival respawns are separation-checked',
    kart.includes('advanceHit(rival.hit, nowMs, others)'));

  // Preview: the "Loading…" state is honest text (not a black
  // box) and the Canvas mounts once the model arrives — the
  // video only ever showed the model still downloading.
  const sel = src('components/EarthVehicleSelect.jsx');
  t('preview shows an honest loading line while the model downloads',
    sel.includes("Loading {craft ? craft.name : 'vehicle'}…"));
  t('preview renders the Canvas once the model is set',
    sel.includes('<Canvas camera={{ position: [0, 1.2, 6], fov: 45 }}'));
}

console.log(`earth1-round2: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
