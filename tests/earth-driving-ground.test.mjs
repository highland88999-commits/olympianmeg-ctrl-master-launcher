// tests/earth-driving-ground.test.mjs — Pins for the 2026-11-15
// Earth 1 ground rework (Merlin: "The tiles should no longer
// render either in earth 1, they should be prerendered around
// the entire map"). The whole lens system — near/far/coarse
// sheets, render queue, restore path, mapping marks, street
// patch — is deleted from every live Earth 1 path. The ground
// is ONE prerendered sphere wearing the ground-loop video
// (one fading colour + mirror sheen), baked once, mounted at
// street level; the car drives over finished ground. The old
// 2026-10-27 driving-void pins (lens presets, build freezes)
// are gone with the system they pinned; the lens lib itself
// stays on disk, unwired, pinned by earth-lens.test.mjs.
// Run: node tests/earth-driving-ground.test.mjs (from the repo root).
import { readFileSync, existsSync } from 'fs';

let passed = 0, failed = 0;
function t(name, cond) {
  if (cond) { passed++; }
  else { failed++; console.error(`FAIL: ${name}`); }
}

// --- The prerendered ground component ---
{
  const p = 'components/earth/PrerenderedEarthGround.jsx';
  t('prerender component exists', existsSync(p));
  const src = readFileSync(p, 'utf8');
  t('ground is one full sphere at TERRAIN_RADIUS',
    src.includes('sphereGeometry args={[TERRAIN_RADIUS, 96, 64]}'));
  t('ground wears the shared floor video as map + emissive',
    src.includes('getGroundVideoTexture()')
    && src.includes('map: videoTex') && src.includes('emissiveMap: videoTex'));
  t('mirror law kept: metalness 1.0, roughness 0.08',
    src.includes('GROUND_MIRROR_METALNESS') && src.includes('GROUND_MIRROR_ROUGHNESS'));
  t('emissive + env sheen kept',
    src.includes('GROUND_MIRROR_EMISSIVE_INTENSITY')
    && src.includes('getGroundEnvMap(gl)') && src.includes('GROUND_MIRROR_ENV_INTENSITY'));
  t('full-frame equirect wrap (no square crop)',
    src.includes('videoTex.repeat.set(1, 1)') && src.includes('videoTex.offset.set(0, 0)'));
  t('ground is double-sided', src.includes('side: THREE.DoubleSide'));
  t('ground fades in over ~0.4 s on mount',
    src.includes('dt / 0.4') && src.includes('opacity: 0'));
  t('video is started on mount', src.includes('startGroundVideo()'));
  t('material disposed on unmount, shared texture never disposed',
    src.includes('material.dispose()') && !src.includes('videoTex.dispose()'));
}

// --- The video module no longer square-crops (the sheets are gone) ---
{
  const gv = readFileSync('lib/earth/ground-video.js', 'utf8');
  t('square-crop helper is gone', !gv.includes('applySquare'));
  t('no loadedmetadata crop listener', !gv.includes("loadedmetadata"));
  t('video still plays on texture creation', gv.includes("void groundVideo.play().catch(() => {});"));
}

// --- NexusEarth wiring: prerender in, lens/mapping out ---
{
  const src = readFileSync('components/NexusEarth.jsx', 'utf8');
  t('NexusEarth mounts the prerender at street level',
    src.includes("<PrerenderedEarthGround />")
    && src.includes("phase === 'earth_roam' && <PrerenderedEarthGround />"));
  t('photographic globe hidden at street level (stays mounted)',
    src.includes('<group visible={phase !== \'earth_roam\'}>')
    && src.includes('<ProceduralEarthGlobe'));
  t('no lens sheet state or refs remain',
    !src.includes('lensSheets') && !src.includes('farSheets') && !src.includes('coarseSheets')
    && !src.includes('sheetsRef') && !src.includes('lensBuildRef'));
  t('no live tile-build machinery remains',
    !src.includes('startLensBuild') && !src.includes('lensTilePlan')
    && !src.includes('buildLensGeometryData') && !src.includes('pumpLensQueue')
    && !src.includes('nextRestoreJob') && !src.includes('dropStaleBuild'));
  t('no mapping marks or sync remain',
    !src.includes('markDisc') && !src.includes('mappedBitset')
    && !src.includes('setMappedPercent') && !src.includes('reportEarthSync')
    && !src.includes('coveragePercent'));
  t('street ground patch mount is gone',
    !src.includes('<StreetGroundPatch') && !src.includes('patchCenter'));
  t('kart systems still mounted at street level',
    src.includes('<EarthSupercar') && src.includes('<EarthKart />')
    && src.includes('<EarthBoostPads />') && src.includes('<EarthPeers />')
    && src.includes('<EarthCracks />'));
}

// --- Chase camera: third-person follow rate scales with mounted
// speed so the speed/20 lag (27 m at boost) collapses to < 1 m.
{
  const fc = readFileSync('components/EarthFlightController.jsx', 'utf8');
  t('camera rate scales with mounted speed',
    fc.includes('carState.mounted ? (carState.speed || 0) * 3 : 0')
    && fc.includes('20 + speedMps * 1.5'));
  t('first-person snap untouched', fc.includes('camera.position.copy(camPos)'));
}

// --- Round 3 (Merlin, 2026-11-15): the TRUE texture — the
// video stretched once around the r55 sphere reads flat at
// driving height, so his static scratched images ride as a
// tiled detail layer (bump + roughness, ~7 m tiles) over the
// video colour. The 9-colour fade, the mirror sheen and the
// prerendered ground all stay; no per-position tile builds. ---
{
  const src = readFileSync('components/earth/PrerenderedEarthGround.jsx', 'utf8');
  t('ground wears the detail texture as bumpMap',
    src.includes('getGroundDetailTexture()') && src.includes('bumpMap: detailTex'));
  t('ground wears the detail texture as roughnessMap',
    src.includes('roughnessMap: detailTex'));
  t('ground detail bump scale is set', src.includes('GROUND_DETAIL_BUMP_SCALE'));
  // The overlay: a second sphere 5 cm up, multiply-blending the
  // same tiled detail over the finished ground colour — the part
  // that makes the scratches plainly visible (the flat emissive
  // would wash the bump/roughness sheen out on its own).
  t('detail overlay sphere rides 5 cm above the ground',
    src.includes('TERRAIN_RADIUS + GROUND_DETAIL_OVERLAY_OFFSET_M'));
  t('overlay multiplies the ground colour',
    src.includes('THREE.MultiplyBlending') && src.includes('MeshBasicMaterial'));
  t('overlay lift keeps the 9-colour fade bright',
    src.includes('GROUND_DETAIL_OVERLAY_LIFT'));
  t('overlay never occludes (depthWrite off)', src.includes('depthWrite: false'));
  t('overlay material is disposed on unmount',
    src.includes('overlayMaterial.dispose()'));
  t('video map + emissive kept (the 9-colour fade still drives colour)',
    src.includes('map: videoTex') && src.includes('emissiveMap: videoTex'));
  const gv = readFileSync('lib/earth/ground-video.js', 'utf8');
  t('detail loader exists', gv.includes('export function getGroundDetailTexture'));
  t('detail source is his silver scratched jpg',
    gv.includes("GROUND_DETAIL_TEXTURE_URL = '/textures/scratched/silver.jpg'"));
  t('detail texture file exists on disk', existsSync('public/textures/scratched/silver.jpg'));
  t('detail wraps repeat on both axes', gv.includes('THREE.RepeatWrapping'));
  t('detail is a data map (no sRGB)', gv.includes('THREE.NoColorSpace'));
  t('overlay lift is set (1 / silver mean luminance)',
    gv.includes('GROUND_DETAIL_OVERLAY_LIFT = 1.84'));
  t('overlay offset is 5 cm', gv.includes('GROUND_DETAIL_OVERLAY_OFFSET_M = 0.05'));
}

console.log(`earth-driving-ground: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
