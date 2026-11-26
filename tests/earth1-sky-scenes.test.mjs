// tests/earth1-sky-scenes.test.mjs — Earth 1 earth+sky scene pairs
// (Merlin, 2026-11-25 ~19:14: "Make videos for the earth and sky
// in earth 1... make them connect to each other, but also make
// them loop. Make like 10 scenes for both?" — final scope, Merlin's
// choice left to the agent: 12 variations, 24 videos total, in 4
// batches of 6; batch 1 = the first 3 pairs below.)
//
// Pins: 12 pairs, unique ids, every pair names an earth + a sky
// file under /videos/earth1/scenes; batch 1 ships exactly the
// first 3 pairs; the rotation (earthSceneAt) walks the SHIPPED
// pairs only, one scene per EARTH1_SCENE_MS, wrapping back to the
// first — so earth and sky can never disagree; unshipped pairs
// fall back (their files are not in the shipped list); the 6
// batch-1 files exist on disk, h264, ~10 s, no audio.
//
// Run: node tests/earth1-sky-scenes.test.mjs (from the repo root).
import assert from 'node:assert';
import { existsSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  EARTH1_SCENE_BASE,
  EARTH1_SCENE_DURATION_S,
  EARTH1_SCENE_MS,
  EARTH1_SCENES,
  EARTH1_SHIPPED_SCENE_IDS,
  EARTH1_SHIPPED_SCENES,
  EARTH1_SCENE_VIDEO_FILES,
  earthSceneAt,
  earthSceneAfter,
  earthSceneUrl,
} from '../lib/earth/earth-sky-scenes.js';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

let passed = 0;
let failed = 0;
function t(name, cond) {
  if (cond) passed++;
  else { failed++; console.error(`FAIL: ${name}`); }
}

// --- The 12-pair list -------------------------------------------------
t('12 scene pairs', EARTH1_SCENES.length === 12);
t('unique ids', new Set(EARTH1_SCENES.map((s) => s.id)).size === 12);
t('every pair names an earth + a sky file', EARTH1_SCENES.every((s) => s.earth && s.sky));
t('every pair names its shared look (timeOfDay + weather)', EARTH1_SCENES.every((s) => s.timeOfDay && s.weather));
t('scene files are .mp4 under the scenes base', EARTH1_SCENES.every((s) => s.earth.endsWith('.mp4') && s.sky.endsWith('.mp4')));
t('clip duration is 10 s', EARTH1_SCENE_DURATION_S === 10);
t('scene rotation is 5 min', EARTH1_SCENE_MS === 5 * 60 * 1000);

// --- Batch 1: exactly the first 3 pairs -------------------------------
t('batch 1 ships 3 pairs', EARTH1_SHIPPED_SCENE_IDS.length === 3);
t('batch 1 is the first 3 pairs in order', JSON.stringify(EARTH1_SHIPPED_SCENE_IDS) === JSON.stringify(['golden-grassland', 'starry-night', 'rainstorm']));
t('shipped list matches the shipped ids', JSON.stringify(EARTH1_SHIPPED_SCENES.map((s) => s.id)) === JSON.stringify(EARTH1_SHIPPED_SCENE_IDS));
t('video file list is the 6 batch-1 files', EARTH1_SCENE_VIDEO_FILES.length === 6);
t('video file list is repo-relative public paths', EARTH1_SCENE_VIDEO_FILES.every((f) => f.startsWith('public/videos/earth1/scenes/') && f.endsWith('.mp4')));

// --- Rotation: shipped pairs only, wrapping ---------------------------
t('rotation at t=0 is the first shipped pair', earthSceneAt(0)?.id === 'golden-grassland');
t('rotation holds the first pair inside its slot', earthSceneAt(EARTH1_SCENE_MS - 1)?.id === 'golden-grassland');
t('rotation moves to the second pair at one slot', earthSceneAt(EARTH1_SCENE_MS)?.id === 'starry-night');
t('rotation moves to the third pair at two slots', earthSceneAt(2 * EARTH1_SCENE_MS)?.id === 'rainstorm');
t('rotation wraps back to the first pair', earthSceneAt(3 * EARTH1_SCENE_MS)?.id === 'golden-grassland');
t('rotation never returns an unshipped pair', [0, 1, 2, 3, 4, 5].every((k) => EARTH1_SHIPPED_SCENE_IDS.includes(earthSceneAt(k * EARTH1_SCENE_MS)?.id)));
t('rotation tolerates garbage input', earthSceneAt(undefined)?.id === 'golden-grassland' && earthSceneAt(-100)?.id === 'golden-grassland');

// --- earthSceneAfter: next in rotation, wrapping ----------------------
t('after first is second', earthSceneAfter(EARTH1_SHIPPED_SCENES[0])?.id === 'starry-night');
t('after second is third', earthSceneAfter(EARTH1_SHIPPED_SCENES[1])?.id === 'rainstorm');
t('after third wraps to first', earthSceneAfter(EARTH1_SHIPPED_SCENES[2])?.id === 'golden-grassland');
t('after null/unknown is first', earthSceneAfter(null)?.id === 'golden-grassland' && earthSceneAfter({ id: 'nope' })?.id === 'golden-grassland');

// --- URLs ---------------------------------------------------------------
t('earth URL is under the scenes base', earthSceneUrl(EARTH1_SCENES[0], 'earth') === `${EARTH1_SCENE_BASE}/golden-grassland-earth.mp4`);
t('sky URL is under the scenes base', earthSceneUrl(EARTH1_SCENES[0], 'sky') === `${EARTH1_SCENE_BASE}/golden-grassland-sky.mp4`);
t('null scene gives null URL', earthSceneUrl(null, 'earth') === null);

// --- Batch-1 files on disk: present, h264, ~10 s, no audio ------------
for (const rel of EARTH1_SCENE_VIDEO_FILES) {
  const abs = join(REPO_ROOT, rel);
  t(`${rel} exists on disk`, existsSync(abs));
  if (!existsSync(abs)) continue;
  t(`${rel} is not empty`, statSync(abs).size > 100000);
  let probe;
  try {
    probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_name,width,height', '-show_entries', 'format=duration', '-of', 'json', abs], { encoding: 'utf8' }));
  } catch {
    t(`${rel} ffprobe runs`, false);
    continue;
  }
  const video = (probe.streams || []).filter((s) => s.codec_name === 'h264');
  const audio = (probe.streams || []).filter((s) => s.codec_type === 'audio');
  t(`${rel} has one h264 video stream`, video.length === 1);
  t(`${rel} is 1280x720`, video[0] && video[0].width === 1280 && video[0].height === 720);
  t(`${rel} is ~10 s`, Math.abs(Number(probe.format.duration) - 10) < 0.5);
  t(`${rel} has no audio track`, audio.length === 0);
}

console.log(`earth1-sky-scenes: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
assert.equal(failed, 0);
