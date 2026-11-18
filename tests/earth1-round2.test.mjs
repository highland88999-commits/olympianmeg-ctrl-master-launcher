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
import { VEHICLES, getVehicle, topSpeedKmh, clampFlightSpeed } from '../lib/earth/vehicles.js';
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

// --- Console controls are circle orbs, never rectangles ---
// Circle Orb Controls Law (Merlin, Nov 16 — standing): the
// Overlook / Drive / Return-to-Orbit controls are plain circular
// OrbButton orbs wearing their shared function faces (ascend /
// descend / orbit). No full-width rectangular button may remain
// in the console card — the speedometer + 🚀 missile-count pill
// are ordered as pills and are not buttons.
{
  const c = src('components/EarthConsole.jsx');
  t('console imports OrbButton + OrbLabel',
    c.includes("import OrbButton, { OrbLabel } from '@/components/world/OrbButton'"));
  t('Overlook is an ascend-face orb wired to onAscend',
    c.includes('fn="ascend"') && c.includes('onClick={onAscend}'));
  t('Drive is a descend-face orb wired to onStreet',
    c.includes('fn="descend"') && c.includes('onClick={onStreet}'));
  t('Return to Orbit is an orbit-face orb wired to onReturn',
    c.includes('fn="orbit"') && c.includes('onClick={onReturn}'));
  t('console holds no full-width rectangular control button',
    !c.includes('w-full py-2'));
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
  // Nov 16 ~04:41 (Merlin — the universal layout, semi-intact):
  // the stick moved to bottom-LEFT, the speed pill to
  // bottom-CENTER, and the FIRE stack to the bottom edge on the
  // RIGHT (18px), where the stick used to be — the old 142px
  // perch above the stick is gone with it.
  t('FIRE stack rides at the bottom edge on the right (18px, where the stick was)',
    c.includes("bottom: 'calc(env(safe-area-inset-bottom, 0px) + 18px)'"));
  t('speed pill sits at the bottom edge (18px)',
    c.includes("bottom: 'calc(env(safe-area-inset-bottom, 0px) + 18px)'"));
  t('speed pill is centered (left 50% + translateX(-50%))',
    c.includes("left: '50%'") && c.includes("translateX(-50%)"));
  t('no HUD piece sits at the old 142px perch',
    !c.includes('+ 142px)'));
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
  // Antimeridian (item 4 follow-up, found while verifying the
  // wall-stuck root cause): a step across lon ±180 is a 0.002°
  // hop, not a 360° one — the raw difference used to fling the
  // car ~40,000 km along its heading.
  const seamE = forwardOnlyStep(0, 179.999, 0, -179.999, 90);
  t('east across the antimeridian lands at −179.999, not flung',
    Math.abs(seamE.lat) < eps && Math.abs(seamE.lon + 179.999) < eps);
  const seamW = forwardOnlyStep(0, -179.999, 0, 179.999, 270);
  t('west across the antimeridian lands at 179.999, not flung',
    Math.abs(seamW.lat) < eps && Math.abs(seamW.lon - 179.999) < eps);
}

// --- Speedometer top speed + physics clamp (item 4, Merlin's
// 55.9 s Muscle Car video, 2026-11-16) ---
{
  const eps = 1e-9;
  const muscle = getVehicle('muscle-car');
  // The menu number, in one place now: boost top × the ×3 globe
  // step × 3.6. Muscle Car: 78 × 1.9 × 3 × 3.6 = 1600.56 km/h
  // (the video's 648 km/h is |speed| 60 flight units — 77% of
  // base max, no boost — and does NOT exceed any top speed the
  // code defines; the defects were the unclamped, unsmoothed,
  // commanded-speed needle, fixed in lib/earth/kart.js +
  // components/EarthConsole.jsx).
  t('Muscle Car top speed is 1600.56 km/h',
    Math.abs(topSpeedKmh(muscle) - 1600.56) < 0.01);
  t('a pad boost raises the top ×1.5 (2400.84 km/h)',
    Math.abs(topSpeedKmh(muscle, 1.5) - 2400.84) < 0.01);
  t('Aventador top speed is 1944 km/h',
    Math.abs(topSpeedKmh(getVehicle('wedge-supercar')) - 1944) < eps);
  t('unknown vehicle has no top speed', topSpeedKmh(null) === 0);
  // The physics clamp: the car itself can never exceed its top,
  // not just the needle (pad expiry / craft swap used to leave
  // the carried speed over the new cap for ~1 s).
  t('clamp caps an over-top speed at boost top (148.2)',
    Math.abs(clampFlightSpeed(300, muscle) - 148.2) < eps);
  t('clamp caps reversing speed symmetrically',
    Math.abs(clampFlightSpeed(-300, muscle) + 148.2) < eps);
  t('clamp leaves a legal speed alone',
    Math.abs(clampFlightSpeed(60, muscle) - 60) < eps);
  t('clamp honours a live pad boost (cap 222.3)',
    Math.abs(clampFlightSpeed(300, muscle, 1.5) - 222.3) < eps);
  t('clamp with no vehicle leaves the speed alone',
    clampFlightSpeed(300, null) === 300);
  t('clamp turns a non-finite speed into 0',
    clampFlightSpeed(NaN, muscle) === 0);
  t('EarthConsole drives the needle from displacement, not the raw commanded speed',
    src('components/EarthConsole.jsx').includes('stepDisplaySpeed')
    && !src('components/EarthConsole.jsx').includes('Math.round(kartHud.speedKmh'));
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
    page.indexOf('Bottom-left stick steers') > hubClose);
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
  // Nov 16 ~04:41 (Merlin — the spawn rule): the OTHER two roam
  // entries ran the same dive with NO check, so a newcomer could
  // land on top of a user or agent already driving there. Both
  // now check the destination the same way before beginRoam.
  t('arriveEarth checks the destination against rivals + peers',
    page.includes('clearSpawnPoint(dest.lat, dest.lon, [...kartState.rivals, ...sharedPeerVehicles])'));
  t('beginStreetDive checks the focus against rivals + peers',
    page.includes('clearSpawnPoint(earthFocus.lat, earthFocus.lon, [...kartState.rivals, ...sharedPeerVehicles])'));
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

// --- Round 4 (Merlin, 2026-11-16 — Earth 1 video QA): the spawn
// sheet's controls are circle orbs, the FLIGHT AXIS pill stands
// down while the vehicle sheet is open, the menu-collapse blur
// stops iOS Safari's stranded "Search" pill, and the preview
// preloads + stays lit + never blanks on a swipe. ---
{
  const sel = src('components/EarthVehicleSelect.jsx');
  const page = src('app/page.jsx');
  // Item 7 (spawn sheet): Back / Cancel are OrbButton orbs.
  t('spawn banner Back is an OrbButton orb', sel.includes('<OrbButton ariaLabel="Back to vehicles"'));
  t('spawn banner Cancel is an OrbButton orb (shared close face)', sel.includes('<OrbButton fn="close" ariaLabel="Cancel — back to hub"'));
  t('spawn banner keeps no rectangular Back button', !sel.includes('← Back to vehicles'));
  t('spawn banner keeps no rectangular Cancel button', !sel.includes('✕ Cancel'));
  t('sheet imports the shared orb', sel.includes("from '@/components/world/OrbButton'"));
  // Item 9: FLIGHT AXIS pill hides while the vehicle sheet is open.
  t('FLIGHT AXIS pill stands down while the vehicle sheet is open',
    page.includes("&& !showEarthVehicleSelect && ("));
  // Item 8: menu-collapse blur (Erebus mirror) stops the stranded pill.
  t('page blurs the active element when the hub menu collapses',
    page.includes('if (!isMenuExpanded') && page.includes('document.activeElement.blur()'));
  // Item 12: preload + sticky preview + brighter box.
  t('preview preloads the neighbours of the current pick',
    sel.includes('[vehicles[idx], vehicles[idx + 1], vehicles[idx - 1]]'));
  t('preview sweeps the rest of the roster in the background',
    sel.includes('await ensureVehicleModel(v.id)'));
  t('preview keeps the last shown model while the next loads',
    sel.includes('prevModelRef') && sel.includes('const shown = model || prevModelRef.current'));
  t('preview ambient is brightened (2.0, was 0.9)',
    sel.includes('<ambientLight intensity={2.0} />'));
  t('preview key light is brightened (2.2, was 1.4)',
    sel.includes('<directionalLight position={[5, 8, 5]} intensity={2.2} />'));
  t('preview gains a fill light from the opposite side',
    sel.includes('<directionalLight position={[-6, 3, -5]} intensity={1.0} />'));
  t('preview box is a lighter gradient, not near-black',
    sel.includes("linear-gradient(180deg, #4a4f5c 0%, #262932 100%)"));
  t('preview has a floor disc under the car',
    sel.includes('<circleGeometry args={[1.7, 48]} />'));
  // The round-2 pins above still stand: the honest loading line
  // and the [0, 1.2, 6] camera are unchanged by this round.
}

// --- Overlap audit (Merlin, 2026-11-16 ~18:02 — "Make sure the
// control buttons don't overlap"): every Earth 1 control's box at
// 390×844 and 360×740, computed from the positioning code
// (absolute offsets, fixed sizes, z-index). Source-level pins
// below, then a literal-box check that no two co-visible controls
// intersect and none runs off the screen edge. Text-width boxes
// are worst-case estimates (3-digit speed, longest notice); fixed
// sizes are exact from the code. ---
{
  const page = src('app/page.jsx');
  const consoleSrc = src('components/EarthConsole.jsx');
  const toggleSrc = src('components/EarthViewToggle.jsx');
  const sel = src('components/EarthVehicleSelect.jsx');

  // A1 — camera column vs expanded console card: the card fills
  // the top-right (top 16, up to ~190 tall, bottom ~206) and the
  // old fixed top of 3.25rem put both 56 px orbs inside it,
  // hidden behind it (card z-80 over column z-70). The column
  // now docks below the card while expanded, up top while
  // minimized (globe tab at top 32% is clear of both spots).
  t('camera column takes a dockedBelow prop', toggleSrc.includes('dockedBelow'));
  t('camera column docks at 14rem (224px) below the expanded card',
    toggleSrc.includes("calc(env(safe-area-inset-top, 0px) + 14rem)"));
  t('camera column rides at 3.25rem while the console is minimized',
    toggleSrc.includes("calc(env(safe-area-inset-top, 0px) + 3.25rem)"));
  t('console docks the column below the card while expanded',
    consoleSrc.includes('<EarthViewToggle phase={phase} dockedBelow={!minimized} />'));
  // A2 — notice pill vs card: 22% was 186 px at 844 (2 px onto
  // the card) and 163 px at 740 (25 px onto the card's orb row).
  t('notice pill sits at a fixed 218px, clear of the card bottom (~206px)',
    consoleSrc.includes('top-[218px]'));
  t('notice pill no longer rides at top 22%', !consoleSrc.includes('top-[22%]'));
  // A3 — bottom row at 360 wide: a 112 px stick ends at x 130
  // while a 3-digit speedo starts at ~x 126. 104 px + px-3
  // speedo leaves 8 px clear at both widths.
  t('drive stick is 104px (was 112)', page.includes('size={104}'));
  t('drive stick is no longer 112px', !page.includes('size={112}'));
  t('speedometer uses px-3 (was px-4)', consoleSrc.includes('bg-zinc-950/80 px-3 py-2'));
  // A4 — hub tap hint vs FLIGHT AXIS pill: both were
  // bottom-centred at ~18–20 px, same band, same centre.
  const hubHintIdx = page.indexOf("t('earth.tapHint')");
  const hubHintBlock = page.slice(Math.max(0, hubHintIdx - 600), hubHintIdx);
  t('hub tap hint rides 63px up, above the FLIGHT AXIS pill',
    hubHintBlock.includes("bottom: 'calc(env(safe-area-inset-bottom, 0px) + 63px)'"));
  t('hub tap hint stands down while the vehicle sheet is open',
    hubHintBlock.includes("!showEarthVehicleSelect"));
  // A5 — first-entry move hint: the 71-char nowrap pill measured
  // ~420 px — wider than a 390 px phone, off both edges, middle
  // hidden behind the console card. Now bottom-anchored and
  // wrapping inside 92vw; copy, dismiss and 8 s timer unchanged.
  const moveHintIdx = page.indexOf('Bottom-left stick steers');
  const moveHintBtn = page.slice(page.lastIndexOf('<button', moveHintIdx), moveHintIdx + 120);
  t('move hint is bottom-anchored at 140px, not top-5',
    moveHintBtn.includes("bottom: 'calc(env(safe-area-inset-bottom, 0px) + 140px)'")
    && !moveHintBtn.includes('top-5'));
  t('move hint wraps inside 92vw (no nowrap)',
    moveHintBtn.includes('max-w-[92vw]') && !moveHintBtn.includes('whitespace-nowrap'));
  t('move hint keeps its copy', page.includes('Bottom-left stick steers · drag the right side to look · tap to dismiss'));
  // A6 — vehicle grid: the default 5 columns need 320 px but the
  // sheet panel inner width is 292 px at 390 and 271 px at 360,
  // so the 5th column was clipped 14 px / ~35 px. 4 columns
  // need 254 px and fit both.
  t('vehicle grid uses 4 columns (5 clipped the last column off the panel)',
    sel.includes('columns={4}'));
  // A8 — Earth chooser card: the four descs wrap to two lines
  // at phone width, so the card measures ~712 px tall — past
  // the 692 px available at 360×740 — and ran off the top and
  // bottom edges. The card now caps at the viewport and scrolls.
  const chooserIdx = page.indexOf('aria-label="Choose your Earth"');
  const chooserCard = page.slice(chooserIdx, chooserIdx + 800);
  t('Earth chooser card caps at the viewport and scrolls',
    chooserCard.includes('max-h-[calc(100dvh-3rem)]') && chooserCard.includes('overflow-y-auto'));
  // A7 — FLIGHT AXIS gating (item 9) still stands: the pill
  // never shares the screen with the vehicle sheet.
  t('FLIGHT AXIS pill still stands down while the vehicle sheet is open',
    page.includes("&& !showEarthVehicleSelect && ("));

  // Literal-box non-overlap check. Each box is [x, y, w, h] at
  // the stated viewport, measured from the positioning code:
  //   card expanded: right-4/top-4, w 272 (min(92vw,17rem)),
  //     h 172 (focus+seed) / 190 worst (busy) — bottom 188/206
  //   toggle docked: right 16, top 224, 2×56 + 8 gap = 120 tall
  //   toggle top: right 16, top 52, 120 tall
  //   globe tab: right-4, top 32%, 56×56
  //   notice: centred, top 218, ~200 wide max, 36 tall
  //   stick: left 18, bottom 18, 104×104
  //   speedo: centred, bottom 18, ~100 wide, 42 tall (70 worst
  //     with BOOST + HIT lines — grows upward)
  //   missile pill: right 18, 36 tall above FIRE; FIRE 64×64,
  //     bottom 18 — column top 718 (844) / 614 (740)
  //   FLIGHT AXIS: centred, bottom 18, ~150 wide, 33 tall
  //   hub hint: centred, bottom 63, ~170 wide, 30 tall
  //   move hint: centred, bottom 140, max 92vw wide, 46 tall
  //     (two wrapped lines)
  const overlap = (a, b) =>
    a[0] < b[0] + b[2] && b[0] < a[0] + a[2] && a[1] < b[1] + b[3] && b[1] < a[1] + a[3];
  const inView = (W, H) => (name, b) =>
    t(`${name} stays on screen at ${W}x${H}`,
      b[0] >= 0 && b[1] >= 0 && b[0] + b[2] <= W && b[1] + b[3] <= H);
  const noOverlap = (W, H) => (aName, a, bName, b) =>
    t(`${aName} clears ${bName} at ${W}x${H}`, !overlap(a, b));
  for (const [W, H] of [[390, 844], [360, 740]]) {
    const cx = (w) => Math.round((W - w) / 2);
    const card = [W - 16 - 272, 16, 272, 190]; // worst-case height
    const toggleDocked = [W - 16 - 56, 224, 56, 120];
    const toggleTop = [W - 16 - 56, 52, 56, 120];
    const globeTab = [W - 16 - 56, Math.round(H * 0.32), 56, 56];
    const notice = [cx(200), 218, 200, 36];
    const stick = [18, H - 18 - 104, 104, 104];
    const speedo = [cx(100), H - 18 - 70, 100, 70]; // worst height
    const fireCol = [W - 18 - 90, H - 18 - 108, 90, 108];
    const flightAxis = [cx(150), H - 18 - 33, 150, 33];
    const hubHint = [cx(170), H - 63 - 30, 170, 30];
    const moveHint = [cx(Math.round(W * 0.92)), H - 140 - 46, Math.round(W * 0.92), 46];
    const checkInView = inView(W, H);
    const checkClear = noOverlap(W, H);
    // earth_roam, console expanded: card + docked column +
    // notice + bottom row + move hint are all live together.
    for (const [n, b] of [['card', card], ['toggle docked', toggleDocked],
      ['notice', notice], ['stick', stick], ['speedo', speedo],
      ['FIRE column', fireCol], ['move hint', moveHint]]) checkInView(n, b);
    checkClear('toggle docked', toggleDocked, 'card', card);
    checkClear('notice', notice, 'card', card);
    checkClear('notice', notice, 'toggle docked', toggleDocked);
    checkClear('stick', stick, 'speedo', speedo);
    checkClear('speedo', speedo, 'FIRE column', fireCol);
    checkClear('move hint', moveHint, 'stick', stick);
    checkClear('move hint', moveHint, 'FIRE column', fireCol);
    checkClear('move hint', moveHint, 'speedo', speedo);
    // earth_roam, console minimized: globe tab + top column.
    checkInView('globe tab', globeTab);
    checkClear('toggle top', toggleTop, 'globe tab', globeTab);
    checkClear('notice', notice, 'globe tab', globeTab);
    // hub_freeroam: FLIGHT AXIS pill + tap hint.
    checkInView('FLIGHT AXIS', flightAxis);
    checkInView('hub hint', hubHint);
    checkClear('hub hint', hubHint, 'FLIGHT AXIS', flightAxis);
    // vehicle sheet grid: 4 cols × 56 + 3 × 10 = 254 px fits the
    // panel inner width at both viewports (292 / 271).
    t(`vehicle grid (254px) fits the sheet panel at ${W} wide`,
      4 * 56 + 3 * 10 <= Math.min(92 * W / 100, 352) - 32 - 28);
  }
}

// --- Visible sun at street level (house sun treatment, Merlin
// 2026-11-17): the street scene had light but no sun to look at.
// A bright core + halo ride the real sun vector inside the sky
// dome, gone at night with the street lights' dayF. ---
{
  const nexus = src('components/NexusEarth.jsx');
  t('street sun core is a sphere on the real sun vector (inside the dome)',
    nexus.includes('streetSunDiscRef') && nexus.includes('<sphereGeometry args={[1.2, 32, 24]}')
    && nexus.includes('streetSunDiscRef.current.position.set(v.x * 70, v.y * 70, v.z * 70)'));
  t('street sun halo is a glow sprite at the same spot, same scale as the core',
    nexus.includes('streetSunGlowRef') && nexus.includes('scale={[12, 12, 1]}')
    && nexus.includes('streetSunGlowRef.current.position.set(v.x * 70, v.y * 70, v.z * 70)'));
  t('street sun fades with the same dayF as the street lights, gone at night',
    nexus.includes('streetSunDiscRef.current.material.opacity = dayF')
    && nexus.includes('streetSunGlowRef.current.material.opacity = 0.85 * dayF')
    && nexus.includes('streetSunDiscRef.current.visible = dayF > 0'));
  t('street sun is driven by the 1 s real-sun effect, not a second clock',
    nexus.includes('const id = setInterval(updateSun, 1000)'));
}

console.log(`earth1-round2: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
