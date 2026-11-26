// lib/earth/earth-sky-scenes.js — Earth 1 earth+sky scene pairs
//
// (Merlin, 2026-11-25 ~19:14): videos for the earth and sky in
// Earth 1 — matched pairs that CONNECT at the horizon (same time
// of day, weather and lighting, horizon at the frame middle) and
// LOOP seamlessly (each clip finishes with a 0.25 s seam dissolve,
// the nether-wrap pattern). 12 variations total, in 4 batches of
// 6 videos (3 pairs per batch); batch 1 = the first 3 pairs below,
// the rest arrive in later batches. Every pair is the same Earth
// in a different time of day / weather — en suite.
//
// SELECTION: the current scene rotates on wall-clock time — every
// EARTH1_SCENE_MS the next shipped pair comes up, earth and sky
// together (both readers use earthSceneAt, so they can never
// disagree). A pair with no shipped video yet falls back to the
// existing ground loop / shader sky, so a half-built batch can
// never blank the scene.
//
// Pure data + pure selectors, plus the useEarthScene hook (same
// mixed pattern as lib/nether-realm/video-wraps.js) — the pure
// parts are headless-testable, no DOM at import time.

import { useEffect, useState } from 'react';

/** Public URL base for the scene videos. */
export const EARTH1_SCENE_BASE = '/videos/earth1/scenes';
/** Each scene clip is 10 s, h264, 1280x720, muted (house video pattern). */
export const EARTH1_SCENE_DURATION_S = 10;
/** How long one scene plays before the rotation moves on (5 min). */
export const EARTH1_SCENE_MS = 5 * 60 * 1000;

/**
 * All 12 scene pairs, in rotation order. earth/sky are file names
 * under EARTH1_SCENE_BASE. timeOfDay/weather name the shared look
 * the two videos of a pair were generated to — the connect rule.
 */
export const EARTH1_SCENES = [
  { id: 'golden-grassland', name: 'Golden-hour grassland', timeOfDay: 'golden hour', weather: 'clear', earth: 'golden-grassland-earth.mp4', sky: 'golden-grassland-sky.mp4' },
  { id: 'starry-night', name: 'Starry night field', timeOfDay: 'night', weather: 'clear', earth: 'starry-night-earth.mp4', sky: 'starry-night-sky.mp4' },
  { id: 'rainstorm', name: 'Grey rainstorm', timeOfDay: 'day', weather: 'rain', earth: 'rainstorm-earth.mp4', sky: 'rainstorm-sky.mp4' },
  { id: 'sunrise-mist', name: 'Sunrise over misty hills', timeOfDay: 'dawn', weather: 'mist', earth: 'sunrise-mist-earth.mp4', sky: 'sunrise-mist-sky.mp4' },
  { id: 'midday-meadow', name: 'Bright midday meadow', timeOfDay: 'midday', weather: 'clear', earth: 'midday-meadow-earth.mp4', sky: 'midday-meadow-sky.mp4' },
  { id: 'autumn-forest', name: 'Autumn forest', timeOfDay: 'golden hour', weather: 'clear', earth: 'autumn-forest-earth.mp4', sky: 'autumn-forest-sky.mp4' },
  { id: 'snowfield', name: 'Snowfield', timeOfDay: 'day', weather: 'snow', earth: 'snowfield-earth.mp4', sky: 'snowfield-sky.mp4' },
  { id: 'desert-dusk', name: 'Desert dunes at dusk', timeOfDay: 'dusk', weather: 'clear', earth: 'desert-dusk-earth.mp4', sky: 'desert-dusk-sky.mp4' },
  { id: 'thunderstorm', name: 'Thunderstorm dusk', timeOfDay: 'dusk', weather: 'storm', earth: 'thunderstorm-earth.mp4', sky: 'thunderstorm-sky.mp4' },
  { id: 'coastal-dawn', name: 'Coastal dawn', timeOfDay: 'dawn', weather: 'mist', earth: 'coastal-dawn-earth.mp4', sky: 'coastal-dawn-sky.mp4' },
  { id: 'foggy-morning', name: 'Foggy morning field', timeOfDay: 'morning', weather: 'fog', earth: 'foggy-morning-earth.mp4', sky: 'foggy-morning-sky.mp4' },
  { id: 'sunset-ember', name: 'Deep sunset', timeOfDay: 'sunset', weather: 'clear', earth: 'sunset-ember-earth.mp4', sky: 'sunset-ember-sky.mp4' },
];

/** Pairs with videos shipped (batch 1). Later batches add their ids here. */
export const EARTH1_SHIPPED_SCENE_IDS = ['golden-grassland', 'starry-night', 'rainstorm'];

/** The shipped pairs, in rotation order. */
export const EARTH1_SHIPPED_SCENES = EARTH1_SCENES.filter((s) => EARTH1_SHIPPED_SCENE_IDS.includes(s.id));

/** Public URL of a scene's earth or sky video, or null. */
export function earthSceneUrl(scene, which) {
  if (!scene) return null;
  const file = which === 'sky' ? scene.sky : scene.earth;
  if (!file) return null;
  return `${EARTH1_SCENE_BASE}/${file}`;
}

/**
 * The scene playing at wall-clock time nowMs — rotation over the
 * shipped scenes only, so earth and sky always agree. Returns null
 * when nothing has shipped yet.
 */
export function earthSceneAt(nowMs) {
  const list = EARTH1_SHIPPED_SCENES;
  if (!list.length) return null;
  const t = Math.max(0, Number(nowMs) || 0);
  return list[Math.floor(t / EARTH1_SCENE_MS) % list.length];
}

/** The next shipped scene after the given one (wraps to the first). */
export function earthSceneAfter(scene) {
  const list = EARTH1_SHIPPED_SCENES;
  if (!list.length) return null;
  if (!scene) return list[0];
  const i = list.findIndex((s) => s.id === scene.id);
  return list[(i < 0 ? 0 : i + 1) % list.length];
}

/**
 * The current scene, re-evaluated on a 15 s tick so the rotation
 * moves on live while driving. Returns the same object while the
 * scene id is unchanged (no pointless re-renders).
 */
export function useEarthScene() {
  const [scene, setScene] = useState(() => earthSceneAt(Date.now()));
  useEffect(() => {
    const tick = () => {
      const next = earthSceneAt(Date.now());
      setScene((cur) => (cur && next && cur.id === next.id ? cur : next));
    };
    const id = setInterval(tick, 15000);
    return () => clearInterval(id);
  }, []);
  return scene;
}

/** Repo-relative paths of the batch-1 video files (for tests). */
export const EARTH1_SCENE_VIDEO_FILES = EARTH1_SHIPPED_SCENES.flatMap((s) => [
  `public/videos/earth1/scenes/${s.earth}`,
  `public/videos/earth1/scenes/${s.sky}`,
]);
