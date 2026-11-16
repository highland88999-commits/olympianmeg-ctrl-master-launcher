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

// --- The scratch detail layer (round 3) --------------------------
// The floor video is stretched once around the whole r55 sphere,
// so at driving height each patch is a blurred sliver and the
// ground reads flat — Merlin's video shows flat purple. The fix
// is a tiled DETAIL layer from the static images over the video
// colour: the silver scratched jpg drives the material's bump +
// roughness, tiled ~7 m so the scratches, hotspots and metallic
// grain read at driving height. Silver is the right source: the
// 9 colours are one base scratch pattern in 9 tints (pixel-
// verified — the 9 uploads are byte-identical to the repo jpgs,
// and the patterns correlate 0.99 across colours), and silver
// carries the highest luminance contrast. The video keeps the
// 9-colour fade (map + emissive); the detail only shapes the
// mirror sheen. No per-position tile builds — the tiling system
// stays deleted.
/** The detail texture: his silver scratched metal, full frame. */
export const GROUND_DETAIL_TEXTURE_URL = '/textures/scratched/silver.jpg';
/** Detail tile size, metres: the sphere's equator is 2π×55 ≈
 *  346 m around (u 0→1) and π×55 ≈ 173 m pole to pole (v 0→1),
 *  so 48 × 24 repeats make ~7.2 m tiles. */
export const GROUND_DETAIL_REPEAT_U = 48;
export const GROUND_DETAIL_REPEAT_V = 24;
/** Bump strength for the detail layer (three.js bump units). */
export const GROUND_DETAIL_BUMP_SCALE = 0.3;
/** Overlay lift: the silver jpg's mean luminance is 0.544, so
 *  multiplying the ground by the jpg darkens it overall — the
 *  lift (1 / 0.544 ≈ 1.84) brings the multiplier's mean back to
 *  1.0, so the 9-colour fade keeps its brightness while the
 *  scratches (p5 ≈ 0.45 after lift) and hotspots (p95 ≈ 1.66)
 *  read plainly in the colour. */
export const GROUND_DETAIL_OVERLAY_LIFT = 1.84;
/** The overlay sphere floats this far above the ground sphere,
 *  metres — above the ground, below the pads and the car's
 *  wheels, so it multiplies the ground only and never the
 *  vehicles. */
export const GROUND_DETAIL_OVERLAY_OFFSET_M = 0.05;

let groundDetailTex = null;

/** The tiled scratch-detail texture (bump + roughness), one
 *  shared instance. A data map, not a colour map — no sRGB.
 *  Loads in the background; until it arrives the ground is the
 *  plain video mirror, then the detail pops in. */
export function getGroundDetailTexture() {
  if (typeof document === 'undefined') return null;
  if (!groundDetailTex) {
    const tex = new THREE.TextureLoader().load(GROUND_DETAIL_TEXTURE_URL);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(GROUND_DETAIL_REPEAT_U, GROUND_DETAIL_REPEAT_V);
    tex.anisotropy = 8;
    tex.colorSpace = THREE.NoColorSpace;
    groundDetailTex = tex;
  }
  return groundDetailTex;
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
