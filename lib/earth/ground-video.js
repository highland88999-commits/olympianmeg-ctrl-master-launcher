// lib/earth/ground-video.js — Earth 1 video ground + video orb wraps
// (Merlin, 2026-11-15 ~19:36–19:42): the ground is ONE looping video
// that fades through all 9 scratched-metal colours in his order, and
// each torpedo orb wears its colour's video (6 colours, a rocket in
// the centre). One decoder for the floor; orb decoders are
// ref-counted, so a colour only decodes while one of its orbs is on
// screen.
//
// Pure parts (timeline, order, mirror law) are headless-testable.
// Browser parts are lazy singletons — no document/window access at
// import time, so node tests can import the pure parts safely.

import { useEffect, useState } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { METAL_TILE_COLORS } from './metal-tiles.js';

/** The 9 floor colours, in the order Merlin sent them. */
export const GROUND_LOOP_COLORS = METAL_TILE_COLORS;
/** The floor video: one 31 s loop, 3 s per colour, 1 s cross-fades,
 *  magenta again at the end so the loop is seamless (last frame =
 *  first frame). Built from his 9 uploads with ffmpeg xfades —
 *  the colours are his pixels, not an approximation. */
export const GROUND_LOOP_VIDEO_URL = '/videos/earth1/ground-loop.mp4';
export const GROUND_LOOP_DURATION_S = 31;
export const GROUND_LOOP_HOLD_S = 3;
export const GROUND_LOOP_FADE_S = 1;

/** The colour the floor loop is showing at t seconds (the colour
 *  whose hold contains t; during a 1 s cross-fade it names the
 *  colour being faded INTO). t wraps at the loop duration. */
export function groundLoopColorAt(tSec) {
  const t = ((Number(tSec) || 0) % GROUND_LOOP_DURATION_S + GROUND_LOOP_DURATION_S)
    % GROUND_LOOP_DURATION_S;
  const seg = Math.min(Math.floor(t / GROUND_LOOP_HOLD_S), GROUND_LOOP_COLORS.length);
  return GROUND_LOOP_COLORS[seg % GROUND_LOOP_COLORS.length];
}

/** The 6 orb colours (Merlin's videos): the six most distinct
 *  scratched metals. Bright-gold, silver and deep-gold stay in the
 *  floor loop only — the two golds read as one colour at orb size,
 *  and silver washes out against the ground. */
export const ORB_VIDEO_COLORS = ['magenta', 'cyan', 'blue', 'red', 'green', 'purple'];
export const ORB_VIDEO_URLS = Object.fromEntries(
  ORB_VIDEO_COLORS.map((c) => [c, `/videos/earth1/orb-${c}.mp4`]),
);

/** Mirror finish (Merlin, 2026-11-15 ~19:37): polished mirror
 *  metal — full metalness, near-zero roughness, an environment map
 *  to reflect, and the video as emissive too so the colour still
 *  reads under the day/night rig. No Reflector pass: a planar
 *  reflection is a second render of the whole Earth scene every
 *  frame, far too heavy for a phone — the env-map sheen is the
 *  mirror, honestly. */
export const GROUND_MIRROR_METALNESS = 1.0;
export const GROUND_MIRROR_ROUGHNESS = 0.08;
export const GROUND_MIRROR_EMISSIVE_INTENSITY = 0.55;
export const GROUND_MIRROR_ENV_INTENSITY = 1.0;

function makeVideoEl(url) {
  const v = document.createElement('video');
  v.muted = true;
  v.loop = true;
  v.playsInline = true;
  v.preload = 'auto';
  v.src = url;
  return v;
}

// --- The floor video: one decoder, started on first use. --------
let groundVideo = null;
let groundVideoError = false;
let groundTex = null;

export function getGroundVideoTexture() {
  if (typeof document === 'undefined') return null;
  if (!groundTex) {
    groundVideo = makeVideoEl(GROUND_LOOP_VIDEO_URL);
    groundVideo.addEventListener('error', () => { groundVideoError = true; });
    groundTex = new THREE.VideoTexture(groundVideo);
    groundTex.colorSpace = THREE.SRGBColorSpace;
    groundTex.anisotropy = 8;
    // Full-frame wrap (Merlin, 2026-11-15 — the tiling system
    // is gone): the video's only consumer now is the
    // prerendered ground sphere (components/earth/
    // PrerenderedEarthGround.jsx), whose UVs are a true
    // equirect wrap — the whole frame around the planet once.
    // The old square crop (repeat 0.5625) existed for the
    // lens sheets' square UVs and would have cropped the
    // video on the sphere; it is deleted with them.
    void groundVideo.play().catch(() => {});
  }
  return groundTex;
}

/** True once the floor video has failed to load (a missing file
 *  on the deploy, never a transient stall). */
export function groundVideoHasError() {
  return groundVideoError;
}

export function startGroundVideo() {
  if (groundVideo) void groundVideo.play().catch(() => {});
}

export function stopGroundVideo() {
  if (groundVideo) groundVideo.pause();
}

/** One-shot ready gate for the floor video: calls cb once the
 *  video has data (readyState >= 2) or has failed — whichever
 *  comes first. If the video is already ready (or already
 *  failed), cb fires synchronously. Returns an unsubscribe
 *  (a no-op when cb already fired). Lets a build finish only
 *  once its texture is real, never while it is still black. */
export function onGroundVideoReady(cb) {
  if (typeof document === 'undefined') return () => {};
  getGroundVideoTexture(); // ensures the element exists
  const v = groundVideo;
  if (!v) return () => {};
  if (v.readyState >= 2 || groundVideoError) {
    cb();
    return () => {};
  }
  let done = false;
  const fire = () => {
    if (done) return;
    done = true;
    v.removeEventListener('loadeddata', fire);
    v.removeEventListener('error', fire);
    cb();
  };
  v.addEventListener('loadeddata', fire);
  v.addEventListener('error', fire);
  return () => {
    if (done) return;
    done = true;
    v.removeEventListener('loadeddata', fire);
    v.removeEventListener('error', fire);
  };
}

// --- Orb videos: one decoder per colour, ref-counted. -------------
const orbVideos = {}; // color -> { video, tex, refs, error }

export function getOrbVideoTexture(color) {
  if (typeof document === 'undefined') return null;
  if (!ORB_VIDEO_URLS[color]) return null;
  if (!orbVideos[color]) {
    const video = makeVideoEl(ORB_VIDEO_URLS[color]);
    const entry = { video, tex: null, refs: 0, error: false };
    video.addEventListener('error', () => { entry.error = true; });
    const tex = new THREE.VideoTexture(video);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    entry.tex = tex;
    orbVideos[color] = entry;
  }
  return orbVideos[color].tex;
}

export function acquireOrbVideo(color) {
  const e = orbVideos[color];
  if (!e) return;
  e.refs += 1;
  if (e.refs === 1) void e.video.play().catch(() => {});
}

export function releaseOrbVideo(color) {
  const e = orbVideos[color];
  if (!e) return;
  e.refs = Math.max(0, e.refs - 1);
  if (e.refs === 0) e.video.pause();
}

/** The orb's video texture once it has data, else null (the
 *  caller falls back to the flat colour until then). The key-
 *  remount pattern (Moon flag, Nov 15): a material created with
 *  the map compiles WITH it, so a late video is never silently
 *  ignored the way a late .map assignment is. */
export function useOrbVideoTexture(color) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!ORB_VIDEO_URLS[color]) {
      setReady(false);
      return undefined;
    }
    getOrbVideoTexture(color);
    acquireOrbVideo(color);
    const e = orbVideos[color];
    const onReady = () => setReady(true);
    if (e.video.readyState >= 2) setReady(true);
    else {
      e.video.addEventListener('loadeddata', onReady);
      e.video.addEventListener('canplay', onReady);
    }
    return () => {
      e.video.removeEventListener('loadeddata', onReady);
      e.video.removeEventListener('canplay', onReady);
      releaseOrbVideo(color);
    };
  }, [color]);
  if (typeof document === 'undefined') return null;
  const e = orbVideos[color];
  return ready && e ? e.tex : null;
}

// --- The mirror's environment: one RoomEnvironment PMREM. --------
let envMap = null;

export function getGroundEnvMap(gl) {
  if (envMap) return envMap;
  if (!gl) return null;
  try {
    const pmrem = new THREE.PMREMGenerator(gl);
    envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
  } catch {
    return null;
  }
  return envMap;
}

// --- The rim feather (shared 256px radial alpha map). ------------
let featherTex = null;

export function getGroundFeatherAlphaMap() {
  if (typeof document === 'undefined') return null;
  if (featherTex) return featherTex;
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const g = c.getContext('2d');
  // Same shape as the old canvas feather: opaque through the
  // middle, gone at the edge — no hard matte ring.
  const grad = g.createRadialGradient(128, 128, 87, 128, 128, 128);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  featherTex = new THREE.CanvasTexture(c);
  return featherTex;
}

// --- The billboard rocket (shared canvas 🚀 for the orb side). ----
let rocketTex = null;

export function getOrbRocketTexture() {
  if (typeof document === 'undefined') return null;
  if (rocketTex) return rocketTex;
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const g = c.getContext('2d');
  g.font = '200px sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('🚀', 128, 136);
  rocketTex = new THREE.CanvasTexture(c);
  rocketTex.colorSpace = THREE.SRGBColorSpace;
  return rocketTex;
}
