// components/GodTower.jsx
// One tower satellite per god-menu category — the Zeus.jsx pattern,
// parameterized the way Merlin described it: copy Zeus, change the name
// and the color, one for each of the categories in the menu (2026-09-30).
//
// Each tower carries three LEVELS of four ad panels (Merlin,
// 2026-10-27: "It's levels" — Level 1 TOP (Merlin: "Multiverse = multi level one"),
// Level 2 MIDDLE, Level 3 BOTTOM, with a name level and ring
// breaks between levels). There are 24 towers × 12 faces = 288
// faces; boards run 1–96 (billboardNumberFor) for the manager and
// manifest, while the badges visitors see run top to bottom
// (Merlin, 2026-10-27: "Make sure you number them from top to
// bottom"): top = board, middle = board + 44, bottom = board + 88,
// so badges collide across levels (badge 45 is board 45 top and
// board 1 middle) — the load order below uses board order, which
// is unambiguous. Level 2 reads the real billboard inventory
// (lib/partners.js, assigned deterministically by
// lib/tower-panels.js). Levels 1 and 3 are house-only for now
// (display badges only, code only, not a product decision): every
// new face plays the same house video through the existing panel
// video path, and the new levels are NOT wired into the manager,
// manifest, queue, playlist, pricing, or cap. The god's
// name sits in the name levels BETWEEN the billboard levels — not
// on the pillar surface (covered by the boxes) and not above the
// box.
// Panel 0 is ALWAYS Merlin's native stake.com placement — his own
// inventory, never removed, never rotated out. Panels 1–3 rotate the
// affiliate partners, Betty, and YOUR AD HERE fillers so the forty panels
// are no longer forty identical stake placeholders. Towers are
// PASS-THROUGH (Merlin, 2026-11-24): users fly/walk straight through
// them and their billboards freely — no collider is registered for a
// tower at all. Visually they stay fully solid, exactly as before:
// no transparency, no fading, no ghost effect, nothing that looks
// passable. They bob gently, Zeus-style; the old in-place spin is gone.

'use client';
import { useState, useRef, useMemo, useEffect, memo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Billboard } from '@react-three/drei';
import VanGoghText from './VanGoghText';
import * as THREE from 'three';
import {
  towerFixedYaw,
} from '@/lib/tower-collider';
import {
  createBillboardFaceCanvas,
  drawCoverFit,
} from '@/lib/billboard-face';
import { STAKE_SLOT } from '@/lib/partners';
import { useScratchedMaterial } from '@/lib/portal/scratched-textures';
import { panelsForTower, billboardNumberFor, PANEL_SCALE, houseLevelSlot, topLevelBillboardNumberFor, middleLevelBillboardNumberFor, bottomLevelBillboardNumberFor, MIDDLE_LEVEL_BADGE_BASE } from '@/lib/tower-panels';
import {
  videoCoverFit,
  collectPanelVideoUrls,
  preloadInOrder,
  panelVideoBadgeOrder,
  pickNextPanelVideoLoad,
} from '@/lib/billboards/panel-video';

// Tower panel faces: a slot's real image creative paints cover-fit on
// a 1264×700 canvas — the same 12.64:7.0 aspect as the widened face, at the
// same ≈100px per world unit the face had before. The face fills the
// WHOLE panel frame edge to edge inside the border rim (Merlin,
// 2026-10-27: widen it, full length, video edge to the border's inner
// edge) — the old 3.8×4.5 face left a dark slab of backing box showing
// below it. Video slots play the real video instead (shared records
// below, one decode per unique URL, in-view panels only) — the canvas
// face is only the pre-load and failure fallback, never the video
// itself.
const FACE_PX_W = 1264;
const FACE_PX_H = 700;

// The face plane itself, in world units — the aspect the video
// cover-fit targets, and the geometry the video fills edge to edge.
// MEASURED 2026-10-27 (ffprobe on public/billboards/house-ad-space.mp4,
// the video every face currently plays per the manifest): 1280×720,
// 16:9. The old 4.0×7.0 portrait face cover-fit that landscape video
// down to 32% of its width — the side-cropped text in Merlin's HESTIA
// screenshot. Widened 2026-10-27 (Merlin: “bring their corners out”):
// height stays 7.0; width 12.64 = exact 16:9 width at that height
// (7.0 × 16/9 = 12.4444) + ~0.2 overscan give, rounded to exact
// decimals so the box math stays exact. Cover-fit on the new face
// keeps 100% of the video's width and crops only ~1.6% of its
// height — full text, edge to edge. 12.64×7.0 sits 0.1 inside the
// 12.84×7.2 border plane on all four sides, so the creative edge
// meets the border's inner edge exactly.
const FACE_PLANE_W = 12.64;
const FACE_PLANE_H = 7.0;

// Same advertise-inquiry address as the street monuments.
const INQUIRIES_EMAIL = 'olympiannexus@gmail.com';

// Glitch-stabilized ad border (Merlin, 2026-09-30): the old flat
// meshBasicMaterial border plane sat coplanar with the backing box face
// (z=0.1) and only 0.01 under the ad face — on phone GPUs that strobes.
// Fix: a real canvas-generated brushed texture in the god color (Merlin's
// call: "add a texture to the border"), plus honest depth separation and
// polygonOffset so the stacked faces can never z-fight again.
//
// iPhone hardening (2026-10-01): one shared texture per god color, cached
// at module level — 10 canvases for the whole ring instead of 40 (one per
// panel). iOS aggressively reclaims 2D canvas contexts under memory
// pressure; getContext('2d') can return null, so every canvas here has an
// honest no-texture fallback instead of throwing.
const borderTextureCache = new Map();
function getBorderTexture(color) {
  if (!borderTextureCache.has(color)) {
    borderTextureCache.set(color, makeBorderTexture(color));
  }
  return borderTextureCache.get(color);
}

function makeBorderTexture(color) {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 160;
  const g = c.getContext('2d');
  if (!g) return null; // iOS canvas exhaustion: caller falls back to flat color
  const base = new THREE.Color(color);
  const dark = base.clone().multiplyScalar(0.35);
  const mid = base.clone().multiplyScalar(0.6);
  const grad = g.createLinearGradient(0, 0, 128, 160);
  grad.addColorStop(0, `#${dark.getHexString()}`);
  grad.addColorStop(0.5, `#${mid.getHexString()}`);
  grad.addColorStop(1, `#${dark.getHexString()}`);
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 160);
  // Brushed streaks — break up flat-color banding/shimmer on mobile GPUs.
  for (let i = 0; i < 220; i++) {
    const x = Math.random() * 128;
    g.strokeStyle = Math.random() > 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.08)';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x + (Math.random() * 8 - 4), 160);
    g.stroke();
  }
  // Inner edge highlight so the rim reads as a frame around the creative.
  g.strokeStyle = 'rgba(255,255,255,0.28)';
  g.lineWidth = 3;
  g.strokeRect(2, 2, 124, 156);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// Static face texture for one panel's slot: the shared honest branded face,
// or the slot's real image creative cover-fit when one has shipped. The
// stake slot reuses the shared gold stake creative (never removed).
// Video slots ALSO get this honest face — as the pre-load and failure
// fallback only. The video itself plays through the shared records
// below (usePanelVideoState), never through this canvas path.
function usePanelFaceTexture(slot, stakeTex) {
  const [tex, setTex] = useState(null);
  useEffect(() => {
    if (slot.key === STAKE_SLOT.key) {
      setTex(stakeTex || null);
      return;
    }
    let cancelled = false;
    let owned = null;
    const toTexture = (canvas) => {
      if (cancelled) return;
      if (!canvas) {
        setTex(null); // honest fallback: flat face color, never a crash
        return;
      }
      const t = new THREE.CanvasTexture(canvas);
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 4;
      owned = t;
      setTex(t);
    };
    const paintPlaceholder = () =>
      toTexture(createBillboardFaceCanvas(slot, FACE_PX_W, FACE_PX_H));
    const creative = slot.creatives && slot.creatives[0];
    if (creative && creative.imageUrl) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        if (cancelled) return;
        const canvas = document.createElement('canvas');
        canvas.width = FACE_PX_W;
        canvas.height = FACE_PX_H;
        drawCoverFit(canvas.getContext('2d'), img, FACE_PX_W, FACE_PX_H);
        toTexture(canvas);
      };
      img.onerror = paintPlaceholder;
      img.src = creative.imageUrl;
    } else {
      paintPlaceholder();
    }
    return () => {
      cancelled = true;
      if (owned) owned.dispose();
      setTex(null);
    };
  }, [slot.key, slot.creativeUrl, slot.creatives?.[0]?.imageUrl, stakeTex]);
  return tex;
}

// ---- Per-panel hub video playback (browser-only) ----
// One video element + one VideoTexture PER PANEL (keyed by panel +
// URL), NOT one shared element per URL. Merlin, 2026-11-24: a
// billboard's video must play only while THAT billboard is in view,
// pause when it leaves the screen, and resume from where it paused
// when it comes back. The old shared record could not do that: the
// house video plays on all 192 level-1+3 faces, so the shared
// element played whenever ANY of its faces was in view —
// effectively always in the hub — and a
// face that left the screen kept playing (driven by another face),
// so coming back never resumed from where it paused. A shared
// element has one play state and one currentTime; only per-panel
// elements give per-panel play/pause/resume. The facing+frustum
// guard below is unchanged — only the record it notifies changed.
// Decode cost stays bounded: only front-facing in-frustum faces
// play (a handful at once from any camera), the rest sit paused.
// A failed video never takes a panel down: the panel keeps its
// honest branded canvas face. Rotation to a new entry creates
// that (panel, url) record; the old record stays paused with its
// position, so rotating back resumes it.
const panelVideoRecords = new Map();
const PANEL_VIDEO_LOAD_TIMEOUT_MS = 20000;
// Per-step timeout of the sequential load queue (Merlin, 2026-11-24):
// a slow panel never blocks the queue past this; its element keeps
// loading in the background and flips ready through its permanent
// listeners when its data arrives.
const PANEL_VIDEO_QUEUE_STEP_TIMEOUT_MS = 5000;
let panelVideoVisibilityWired = false;

// Record key: panel id + URL. Two faces showing the same file are
// two records — that is the whole point (independent play state).
function panelVideoRecordKey(viewerId, url) {
  return `${viewerId}::${url}`;
}

// Mark one panel's video ready and wake its subscribers. Shared by
// the canplay / loadeddata / playing listeners and by the readyState
// poll in awaitPanelVideoReady below.
function setPanelVideoReady(rec) {
  if (!rec || rec.ready) return;
  rec.ready = true;
  if (typeof rec.notify === 'function') rec.notify();
}

function refreshPanelVideoPlayback() {
  const hidden = typeof document !== 'undefined' && document.hidden;
  for (const rec of panelVideoRecords.values()) {
    if (rec.inView && !hidden) {
      if (rec.video.paused) {
        const p = rec.video.play();
        if (p && p.catch) p.catch(() => {});
      }
    } else if (!rec.video.paused) {
      rec.video.pause();
    }
  }
}

function getPanelVideoRecord(recordKey, url) {
  let rec = panelVideoRecords.get(recordKey);
  if (rec) return rec;
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.loop = true;
  // metadata, not auto: 288 faces each hold an element, and 'auto'
  // would buffer media on all of them at mount. Metadata is enough
  // for canplay; the media itself streams on first play, and the
  // honest canvas face covers the gap until the first frame arrives.
  // NO src here (Merlin, 2026-11-24 — sequential loading): the
  // record is created unfetched and joins the load queue below, which
  // assigns src one panel at a time in badge order. Setting src at
  // creation used to fetch ~192 videos in parallel at hub mount.
  video.preload = 'metadata';
  video.crossOrigin = 'anonymous';
  const texture = new THREE.VideoTexture(video);
  texture.colorSpace = THREE.SRGBColorSpace;
  rec = {
    url,
    video,
    texture,
    ready: false,
    failed: false,
    inView: false,
    srcAssigned: false,
    listeners: new Set(),
  };
  const notify = () => {
    for (const cb of [...rec.listeners]) {
      try { cb(); } catch { /* a listener failure never breaks playback */ }
    }
  };
  rec.notify = notify;
  video.addEventListener('loadedmetadata', () => {
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (vw > 0 && vh > 0) {
      const fit = videoCoverFit(FACE_PLANE_W, FACE_PLANE_H, vw, vh);
      if (fit) {
        texture.repeat.set(fit.repeat[0], fit.repeat[1]);
        texture.offset.set(fit.offset[0], fit.offset[1]);
      }
    }
  });
  // Ready on the first of canplay / loadeddata / playing: a detached
  // element on iOS may never fire canplay even once its data is there
  // (HomeScene's Oct 27 note), so one signal alone can leave a face
  // grey forever. 'playing' matters most: the in-view gate calls
  // play(), so a face that comes into view and starts playing lights
  // up even if canplay never fires. The readyState poll in
  // awaitPanelVideoReady below is the event-independent backstop.
  video.addEventListener('canplay', () => setPanelVideoReady(rec));
  video.addEventListener('loadeddata', () => setPanelVideoReady(rec));
  video.addEventListener('playing', () => setPanelVideoReady(rec));
  video.addEventListener('error', () => {
    if (!rec.failed) { rec.failed = true; notify(); }
  });
  panelVideoRecords.set(recordKey, rec);
  // Sequential loading (Merlin, 2026-11-24): this record's src is
  // assigned by the queue below, in badge order — never here.
  enqueuePanelVideoLoad(recordKey, url);
  if (!panelVideoVisibilityWired && typeof document !== 'undefined' && document.addEventListener) {
    panelVideoVisibilityWired = true;
    document.addEventListener('visibilitychange', refreshPanelVideoPlayback);
  }
  return rec;
}

// Per-panel in-view seat: this panel's video plays only while THIS
// panel is in view. Pause keeps currentTime, so coming back resumes
// from where it paused — never a restart.
function setPanelVideoViewer(viewerId, url, inView) {
  const rec = panelVideoRecords.get(panelVideoRecordKey(viewerId, url));
  if (!rec) return;
  rec.inView = inView;
  refreshPanelVideoPlayback();
}

// ---- Sequential panel-video loading (Merlin, 2026-11-24) ----
// Load the billboard videos ONE AT A TIME in badge order (1, 2, 3,
// ...), never in parallel. Before this, every panel set src the
// moment its record was created — ~192 elements fetching at hub
// mount — which stalled the hub on his phone (grey faces, reload
// loop). Now a record is created unfetched (no src) and joins this
// queue; the runner below assigns src strictly in badge order, one
// panel at a time. A shared URL is fetched once over the network:
// the first panel with that URL does the real download, later panels
// with the same URL are served from the browser cache — one download
// serves the ring, and every face sharing it still plays it through
// its own per-panel element (per-panel play/pause/resume from
// 4ca42887 is untouched — only WHEN an element starts loading
// changes). A slow panel never blocks the queue past
// PANEL_VIDEO_QUEUE_STEP_TIMEOUT_MS: its element keeps loading in
// the background and flips ready through its permanent listeners
// when its data arrives.

// Billboard video load hold (Merlin, 2026-11-25 — hub crash round):
// billboard video CONTENT must not load until everything else has
// loaded AND the hub intro rotation has ended. The queue below is
// the single choke point: it waits on this release before its FIRST
// loadPanelVideoEntry, so no video element gets a src while held.
// Records are still created unfetched on mount (as before — the
// <video> element + VideoTexture with no src), the badge order, the
// 5 s step timeout, the multi-signal ready and the in-view
// play/pause/resume are all untouched; only WHEN the first src is
// assigned moves. One-way latch: once released it never re-holds —
// a user already in freeroam (rotation ended early on input, or
// ended behind the tutorial) releases immediately. The in-view
// play() path while held is harmless: play on a src-less element
// no-ops, caught.
let panelVideoLoadHeld = true;
let panelVideoLoadWaiters = [];

export function releasePanelVideoLoad() {
  if (!panelVideoLoadHeld) return;
  panelVideoLoadHeld = false;
  const waiters = panelVideoLoadWaiters;
  panelVideoLoadWaiters = [];
  for (const resolve of waiters) {
    try { resolve(); } catch { /* a waiter never blocks the release */ }
  }
}

function awaitPanelVideoLoadRelease() {
  if (!panelVideoLoadHeld) return Promise.resolve();
  return new Promise((resolve) => { panelVideoLoadWaiters.push(resolve); });
}

const panelVideoLoadQueue = [];
let panelVideoLoadSeq = 0;
let panelVideoLoadRunning = false;

function enqueuePanelVideoLoad(recordKey, url) {
  if (panelVideoLoadQueue.some((e) => e.recordKey === recordKey)) return;
  const viewerId = recordKey.slice(0, recordKey.lastIndexOf('::'));
  panelVideoLoadQueue.push({
    recordKey,
    url,
    order: panelVideoBadgeOrder(viewerId),
    seq: panelVideoLoadSeq++,
  });
  ensurePanelVideoLoadRunner();
}

function ensurePanelVideoLoadRunner() {
  if (panelVideoLoadRunning) return;
  panelVideoLoadRunning = true;
  runPanelVideoLoadQueue()
    .catch(() => {})
    .finally(() => { panelVideoLoadRunning = false; });
}

async function runPanelVideoLoadQueue() {
  // Held until the hub has loaded and the intro rotation has ended
  // (releasePanelVideoLoad, called from TextureProvider) — the
  // first src assignment waits here, so no billboard video fetches
  // or decodes during the landing flow.
  await awaitPanelVideoLoadRelease();
  while (panelVideoLoadQueue.length > 0) {
    const idx = pickNextPanelVideoLoad(panelVideoLoadQueue);
    if (idx < 0) return;
    const [entry] = panelVideoLoadQueue.splice(idx, 1);
    try {
      await loadPanelVideoEntry(entry);
    } catch {
      // One panel's load never breaks the queue — the next panel
      // still loads in its turn.
    }
  }
}

// Load one queued panel: assign its src (the ONLY src assignment in
// this file) and await its readiness, or the step timeout —
// whichever comes first. A timeout leaves the element loading in
// the background; the queue moves on.
async function loadPanelVideoEntry(entry) {
  const rec = panelVideoRecords.get(entry.recordKey);
  if (!rec || rec.failed) return false;
  if (rec.ready) return true;
  if (!rec.srcAssigned) {
    rec.video.src = entry.url;
    rec.srcAssigned = true;
  }
  return awaitPanelVideoReady(rec, PANEL_VIDEO_QUEUE_STEP_TIMEOUT_MS);
}

// Await one record's readiness: resolves true once its video can
// play, false on error or timeout. Readiness is event-independent:
// besides the canplay / loadeddata / playing listeners, a readyState
// poll catches a record whose data arrived without any event firing
// (HAVE_CURRENT_DATA = a frame is available). A timeout never marks
// the record failed and never throws: a slow video may still arrive
// later, and the subscribed panel upgrades to it when it does.
function awaitPanelVideoReady(rec, timeoutMs) {
  if (rec.ready) return Promise.resolve(true);
  if (rec.failed) return Promise.resolve(false);
  return new Promise((resolve) => {
    let done = false;
    const finish = (value) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      clearInterval(poll);
      rec.listeners.delete(onChange);
      resolve(value);
    };
    const timer = setTimeout(() => finish(false), timeoutMs);
    const poll = setInterval(() => {
      if (rec.ready) finish(true);
      else if (rec.failed) finish(false);
      else if (rec.video && rec.video.readyState >= 2) {
        setPanelVideoReady(rec);
        finish(true);
      }
    }, 250);
    const onChange = () => finish(rec.ready);
    rec.listeners.add(onChange);
  });
}

// Resolve true once this panel's video can play, false on error or
// timeout. A timeout never marks the record failed: a slow video may
// still arrive later, and the subscribed panel upgrades to it when
// it does.
function ensurePanelVideo(url, panelKey) {
  const rec = getPanelVideoRecord(panelVideoRecordKey(panelKey, url), url);
  return awaitPanelVideoReady(rec, PANEL_VIDEO_LOAD_TIMEOUT_MS);
}

// Preload the ring's panel videos in strict board-number order
// (the whole board run — see lib/billboards/panel-video.js). Used
// by the hub load sequence before the towers present. Never
// rejects: failures resolve false and those panels keep their
// honest face. Warming creates the middle-level panel's own record
// (badge = board + 44) and awaits it through the sequential queue
// below, so its element is ready to play the moment its face comes
// into view; the same URL on other faces warms through the shared
// browser cache when the queue reaches their records.
export function preloadHubPanelVideos(towersPanels) {
  const items = collectPanelVideoUrls(towersPanels, billboardNumberFor);
  const numberByUrl = new Map(items.map((it) => [it.url, it.number]));
  return preloadInOrder(items, (url) => {
    const number = numberByUrl.get(url);
    if (!Number.isInteger(number)) return Promise.resolve(false);
    return ensurePanelVideo(url, `panel-${number + MIDDLE_LEVEL_BADGE_BASE}`);
  });
}

// Subscribe a panel to its own video URL's ready/failed state.
// Returns { texture, ready, failed }; texture is null until the
// URL is known (no URL, no video). The honest canvas face covers
// the gap.
function usePanelVideoState(viewerId, creativeUrl) {
  const [state, setState] = useState({ texture: null, ready: false, failed: false });
  useEffect(() => {
    if (!creativeUrl) {
      setState({ texture: null, ready: false, failed: false });
      return undefined;
    }
    const rec = getPanelVideoRecord(panelVideoRecordKey(viewerId, creativeUrl), creativeUrl);
    const sync = () => setState({ texture: rec.texture, ready: rec.ready, failed: rec.failed });
    sync();
    rec.listeners.add(sync);
    return () => { rec.listeners.delete(sync); };
  }, [viewerId, creativeUrl]);
  return state;
}

// Module temps for the per-frame in-view check (single-threaded
// render loop, reused synchronously — never stored across frames).
const _panelPos = new THREE.Vector3();
const _panelNormal = new THREE.Vector3();
const _panelToCam = new THREE.Vector3();
const _panelQuat = new THREE.Quaternion();
const _panelFrustum = new THREE.Frustum();
const _panelProj = new THREE.Matrix4();

// Manager-wired rotation (Merlin, 2026-10-27): a billboard holding
// more than one ad cycles its faces on its own timer, one panel at a
// time — each panel instance runs its own interval, so rotation
// state is per billboard and independent across billboards. A single
// entry stays static (no timer). Removing an entry just shortens
// the cycle: the index clamps back into range via the modulo.
function useRotatingEntry(slot) {
  const entries = slot.entries;
  const count = Array.isArray(entries) ? entries.length : 0;
  const [index, setIndex] = useState(0);
  const intervalMs = (slot.intervalSeconds || 15) * 1000;
  useEffect(() => {
    if (count <= 1) return undefined;
    const id = setInterval(() => setIndex((i) => (i + 1) % count), intervalMs);
    return () => clearInterval(id);
  }, [count, intervalMs, slot.key]);
  if (count === 0) return null;
  return entries[Math.min(index, count - 1)];
}

// Per-billboard number badge (Merlin, 2026-10-20; renumbered
// top to bottom 2026-10-27): each panel face carries its OWN
// badge — board number + level base (top +0, middle +44, bottom
// +88; lib/tower-panels.js level badge helpers). Badges collide
// across levels, so the load order uses board order. White digits
// on a small
// black plate that only borders the number — the plate width follows
// the digit count, so it hugs one-digit and two-digit numbers alike.
// It sits proud of the panel's top area (no z-fighting) and rotates
// WITH the face — deliberately NOT a camera-facing billboard, so
// each of the four sides shows only its own number.
function BillboardNumberBadge({ number }) {
  const label = String(number);
  const plateW = label.length * 0.36 + 0.3;
  return (
    <group position={[0, 2.95, 0.3]}>
      <mesh>
        <planeGeometry args={[plateW, 0.74]} />
        <meshBasicMaterial color="#000000" />
      </mesh>
      <VanGoghText
        position={[0, 0, 0.01]}
        fontSize={0.52}
        color="#ffffff"
        anchorX="center"
        anchorY="middle"
        fontWeight="bold"
      >
        {label}
      </VanGoghText>
    </group>
  );
}

function TowerAdPanel({ slot, stakeTex, color, onLaunchExternal, badgeNumber }) {
  const [hovered, setHovered] = useState(false);
  const faceRef = useRef(null);

  // One shared border texture per god color (module cache) — 10 canvases
  // for the whole ring, not 40. Null when iOS reclaims the 2D context;
  // the material below falls back to the flat god color.
  const borderTex = getBorderTexture(color);
  // Rotation: the face and the tap all follow the CURRENT
  // entry — tapping a rotating billboard always opens the face you
  // are looking at, never a stale one.
  const rotatingEntry = useRotatingEntry(slot);
  const effectiveSlot = rotatingEntry
    ? {
        ...slot,
        name: rotatingEntry.company,
        trackingUrl: rotatingEntry.link,
        creativeType: rotatingEntry.creativeType,
        creativeUrl: rotatingEntry.creativeUrl,
        creatives: rotatingEntry.creativeType === 'image' ? [{ imageUrl: rotatingEntry.creativeUrl }] : [],
      }
    : slot;
  const faceTex = usePanelFaceTexture(effectiveSlot, stakeTex);

  // Real video playback for video slots: the shared record's texture
  // when loaded, the honest canvas face until then (and forever if
  // the video fails). Tapping the face still opens the entry's link;
  // panels without a link keep the inquiry fallback.
  const videoUrl = effectiveSlot.creativeType === 'video' ? effectiveSlot.creativeUrl : null;
  const viewerId = `panel-${badgeNumber ?? slot.key}`;
  const videoState = usePanelVideoState(viewerId, videoUrl);
  const inViewRef = useRef(false);

  // GPU guard: a panel's video plays only while THAT panel is in
  // view (front-facing AND inside the camera frustum); off-screen
  // panels pause, and coming back resumes from where it paused.
  // Each panel owns its video element (per-panel record above), so
  // one face leaving the screen never pauses — or resumes — another.
  useFrame(({ camera }) => {
    if (!videoUrl || !faceRef.current) return;
    const mesh = faceRef.current;
    mesh.getWorldPosition(_panelPos);
    mesh.getWorldQuaternion(_panelQuat);
    _panelNormal.set(0, 0, 1).applyQuaternion(_panelQuat);
    _panelToCam.copy(camera.position).sub(_panelPos).normalize();
    const facing = _panelNormal.dot(_panelToCam) > 0;
    _panelProj.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    _panelFrustum.setFromProjectionMatrix(_panelProj);
    const inView = facing && _panelFrustum.intersectsObject(mesh);
    if (inView !== inViewRef.current) {
      inViewRef.current = inView;
      setPanelVideoViewer(viewerId, videoUrl, inView);
    }
  });

  // Leaving the view or unmounting releases this panel's viewer seat
  // (and a rotation to a new entry moves it to the new video).
  useEffect(() => {
    const id = viewerId;
    const url = videoUrl;
    return () => {
      inViewRef.current = false;
      if (url) setPanelVideoViewer(id, url, false);
    };
  }, [videoUrl, viewerId]);

  const handleFaceClick = (e) => {
    e.stopPropagation();
    if (e.nativeEvent) e.nativeEvent.stopPropagation();
    if (effectiveSlot.trackingUrl) {
      onLaunchExternal(effectiveSlot.trackingUrl);
    } else {
      window.location.href = `mailto:${INQUIRIES_EMAIL}`;
    }
  };

  return (
    // Merlin, 2026-10-20: the ad-space screens grow 1.5× (PANEL_SCALE,
    // lib/tower-panels.js). The whole panel scales about its own
    // centre — mount point and facing on the tower are untouched, the
    // face keeps its aspect (no stretched creative), and the number
    // badge rides along as a child in the same relative spot.
    <group scale={[PANEL_SCALE, PANEL_SCALE, PANEL_SCALE]}>
      <mesh position={[0, 0, 0]} receiveShadow>
        <boxGeometry args={[12.84, 7.2, 0.2]} />
        <meshStandardMaterial color="#222222" metalness={0.8} roughness={0.4} emissive="#121214" emissiveIntensity={0.5} />
      </mesh>

      {/* This panel's own billboard number, on the face's top area */}
      {typeof badgeNumber === 'number' && (
        <BillboardNumberBadge number={badgeNumber} />
      )}

      <mesh
        ref={faceRef}
        position={[0, 0, 0.24]}
        onClick={handleFaceClick}
        onPointerOver={() => { setHovered(true); document.body.style.cursor = 'pointer'; }}
        onPointerOut={() => { setHovered(false); document.body.style.cursor = 'default'; }}
      >
        <planeGeometry args={[FACE_PLANE_W, FACE_PLANE_H]} />
        {videoState.ready ? (
          // True color: unlit, untinted, exactly the video's pixels —
          // no hover shade, no scrim, nothing on top of the video.
          // The video fills the full face, cover-cropped inside the
          // frame (see the record's repeat/offset).
          <meshBasicMaterial map={videoState.texture} color="#ffffff" toneMapped={false} />
        ) : (
          <meshStandardMaterial
            map={faceTex || undefined}
            color={faceTex ? (hovered ? '#dddddd' : '#ffffff') : '#0a0f1e'}
            metalness={0.2}
            roughness={0.8}
          />
        )}
      </mesh>

      {/* Textured border: the full 12.84×7.2 box face, 0.08 above the
          backing box face (was coplanar at 0.1), 0.08 below the ad face
          (was 0.01), polygonOffset as a belt on top so the rim never
          fights the creative on any GPU. The 12.64×7.0 face sits 0.1
          inside it on all sides: creative edge to border inner edge. */}
      <mesh position={[0, 0, 0.16]}>
        <planeGeometry args={[12.84, 7.2]} />
        <meshStandardMaterial
          map={borderTex || undefined}
          color={borderTex ? '#ffffff' : color}
          metalness={0.6}
          roughness={0.35}
          polygonOffset
          polygonOffsetFactor={2}
          polygonOffsetUnits={2}
        />
      </mesh>

    </group>
  );
}

function GodTower({ god, color, position, onLaunchExternal, textures, panels = panelsForTower(0), towerIndex = 0 }) {
  const satelliteRef = useRef();
  // Fixed yaw, square to the ring (Merlin, 2026-11-13: billboards out,
  // "perfect the geometry"): the tower no longer spins in place
  // (0.15 rad/s), so its square body no longer sweeps a 23.71 circle
  // that walled off the gaps between towers. Panel 0's face points at
  // the hub centre — the inward face reads from spawn, the faces stand
  // parallel/perpendicular to the radial direction, and the clear gap
  // between adjacent boxes is an even 8.00 (lib/tower-collider.js).
  // The bob stays: the tower still breathes ±0.5 vertically.
  const fixedYaw = towerFixedYaw(position);
  useFrame((state) => {
    if (satelliteRef.current) {
      // Bob around the mount point (inner group is already inside the
      // positioned outer group — offsetting by position[1] again would float
      // the tower at twice its height, away from its collider).
      satelliteRef.current.position.y = Math.sin(state.clock.elapsedTime + position[0]) * 0.5;
    }
  });

  // Pass-through (Merlin, 2026-11-24): NO collider is registered
  // for this tower — users fly/walk straight through the tower and
  // its billboards freely. The tower's square body used to wear one
  // oriented box collider (face plane 10.48 × 1.6 scale = 16.77
  // half-side); the box math stays in lib/tower-collider.js (the
  // fixed yaw below still squares the tower to the ring, and the
  // helpers stay tested), but nothing registers it anymore. The
  // tower LOOKS exactly as solid as before: no material, opacity,
  // texture, or geometry change here — only the invisible wall is
  // gone. Every other hub collider (planets, moon, asteroids,
  // satellites) is untouched and still solid.

  const { propTex, bodyTex, hullTex, tailTex, adTex } = textures;
  const darkMetal = useMemo(() => new THREE.MeshStandardMaterial({ color: '#222222', metalness: 0.9, roughness: 0.2, emissive: '#121214', emissiveIntensity: 0.5 }), []);
  // BRIGHT-GOLD scratched-metal wrap (Merlin, 2026-11-15): the four
  // level-break RING discs (the tower's trim rings) wear bright
  // gold; the fallback is the tower's existing dark metal, so a ring
  // never goes blank. NOT wrapped: the billboard panels and their
  // faces/borders (ads), the pillar (bodyTex), hull/tail cones, the
  // propeller blades, or the god-name labels. The propeller hub
  // cylinders keep the plain darkMetal material.
  const ringWrapMat = useScratchedMaterial('bright-gold', { color: '#222222', metalness: 0.9, roughness: 0.2, emissive: '#121214', emissiveIntensity: 0.5 });
  // New-level slots are derived from this tower's level-2 panels,
  // one house entry each (lib/tower-panels.js houseLevelSlot).
  // Memoized so the panel components never see a fresh slot identity.
  const houseLevelPanels = useMemo(() => panels.map(houseLevelSlot), [panels]);

  return (
    <group position={position}>
      {/* Merlin, 2026-10-20: satellites 2× — group scale 0.8 → 1.6
          renders the tower at exactly twice its previous on-screen
          size. Body, skirt, propeller, name plates and the four ad
          panels (the AD SPACES, badges included) are all children of
          this group, so everything grows together, as ordered. */}
      <group ref={satelliteRef} scale={[1.6, 1.6, 1.6]} rotation={[0, fixedYaw, 0]}>

        {/* Floating god label, moved up with the pillar top (was
            y=16 over the old 12 top; now 24.5 over the new 20.5
            top, the same 4 above the pillar). It sits above the
            level-1 box top (19.6), clear of every level. */}
        <Billboard position={[0, 24.5, 0]}>
          <VanGoghText fontSize={1.6} color={color} letterSpacing={0.2} fontWeight="bold">
            {god}
          </VanGoghText>
        </Billboard>

        {/* Pillar, extended the full three-level stack (Merlin,
            2026-10-27: levels): the same 2.5-radius column, now
            spanning top 20.5 (propellers) to -22.5, 0.9 below the
            level-3 box bottom (-21.6). The old pillar-surface god
            texts at y=2 are GONE: the boxes covered them, and the
            name now lives in the name levels between the billboard
            levels, not on the pillar and not above the box. */}
        <mesh position={[0, -1, 0]} receiveShadow>
          <cylinderGeometry args={[2.5, 2.5, 43, 32]} />
          <meshStandardMaterial map={bodyTex} color="#ffffff" metalness={0.6} roughness={0.4} emissive="#222222" emissiveIntensity={0.5} />
        </mesh>

        {/* Translucent hull cone, UNCHANGED (Merlin's call still
            open from the boxing round): radii 4.5/3.5 no longer reach the widened box faces
            (now at 10.48), so the cone sits enclosed inside the
            middle box instead of piercing it;
            cone spans y -6..2 and never reaches level 3 (top
            -10.8) or level 1 (bottom 8.8). */}
        <mesh position={[0, -2, 0]} receiveShadow>
          <cylinderGeometry args={[4.5, 3.5, 8, 8, 1, true]} />
          <meshStandardMaterial map={hullTex} metalness={0.9} roughness={0.1} side={THREE.DoubleSide} color="#ffffff" transparent={true} opacity={0.35} depthWrite={false} emissive="#121214" emissiveIntensity={0.5} />
        </mesh>

        {/* Tail cone, moved down to cap the stack (was y=-12, which
            would sit inside level 3): same geometry, now spanning
            -24.5..-22.5, meeting the pillar bottom exactly. */}
        <mesh position={[0, -23.5, 0]} receiveShadow>
          <cylinderGeometry args={[3.5, 4.5, 2, 8, 1, true]} />
          <meshStandardMaterial map={tailTex} metalness={0.8} roughness={0.3} side={THREE.DoubleSide} color="#ffffff" emissive="#121214" emissiveIntensity={0.5} />
        </mesh>

        {/* Merlin, 2026-11-13: spaces between the billboards — the four
            panels stand apart with a 2.0-unit space at every corner
            instead of closing into a box (the 2026-10-27 closed box
            had each face's edge landing exactly on its neighbor's
            edge at the corner). Box math, in this group's units
            (PANEL_SCALE 1.5): the video face is 12.64×1.5 = 18.96
            wide, half-width 9.48; its plane sits 10.48 from the axis
            (9.48 + 1.0 of space per face end), and the face sits
            0.24×1.5 = 0.36 in front of the panel origin, so the
            origin mounts at 10.48 − 0.36 = 10.12. The pillar
            (radius 2.5) stays enclosed with 7.98 clearance to the
            face planes. Every level below uses this same box. */}

        {/* LEVELS (Merlin, 2026-10-27: "It's levels"). Stack, inner
            units, top to bottom — level 1 TOP (Merlin: "Multiverse = multi level one")
            box band [8.8, 19.6] (centre 14.2), ring break, name
            level, ring break, level 2 MIDDLE box band [-6.4, 4.4]
            (centre -1, the current 44, unchanged), ring break,
            name level, ring break, level 3 BOTTOM box band
            [-21.6, -10.8] (centre -16.2). Every box band is 10.8
            tall (7.2 × 1.5); every gap between a band and its
            neighbour ring is 0.3; every name level is 2.4 tall;
            every ring is a solid disc, radius 15.0 (past the box
            corner radius 14.82, so it reads as a cap) in the
            tower's dark metal — the existing metalwork language,
            reused for the breaks. Name bands are camera-facing
            Billboards, so the god's name reads from any angle; the name is NOT also written
            on the pillar or above the box. Levels 1 and 3 reuse
            the same box (mount 10.12, same rotations, same
            face/border/backing) and the same TowerAdPanel with
            house-only slots, so they play the same house video
            through the shared video record and keep their own
            in-view guard seats (the seat id follows the badge;
            badges collide across levels, so the sequential load
            order uses board order, not badge ranges). */}
        {[0, Math.PI / 2, Math.PI, -Math.PI / 2].map((angle, i) => (
          <group key={`ad-top-${i}`} rotation={[0, angle, 0]}>
            <group position={[0, 14.2, 10.12]}>
              <TowerAdPanel
                slot={houseLevelPanels[i]}
                stakeTex={adTex}
                color={color}
                onLaunchExternal={onLaunchExternal}
                badgeNumber={topLevelBillboardNumberFor(towerIndex, i)}
              />
            </group>
          </group>
        ))}

        <mesh position={[0, 8.3, 0]} receiveShadow>
          <cylinderGeometry args={[15.0, 15.0, 0.4, 32]} />
          <meshStandardMaterial {...ringWrapMat} />
        </mesh>
        <Billboard position={[0, 6.6, 0]}>
          <VanGoghText fontSize={1.5} color={color} letterSpacing={0.3} fontWeight="bold">
            {god}
          </VanGoghText>
        </Billboard>
        <mesh position={[0, 4.9, 0]} receiveShadow>
          <cylinderGeometry args={[15.0, 15.0, 0.4, 32]} />
          <meshStandardMaterial {...ringWrapMat} />
        </mesh>

        {/* Level 2 MIDDLE — the current 44 boards: slots and video
            path unchanged; the mount moves out with the wider box
            (2.64 → 10.12), and only the badges visitors
            see move, to 45–88 (top-to-bottom numbering). */}
        {[0, Math.PI / 2, Math.PI, -Math.PI / 2].map((angle, i) => (
          <group key={`ad-${i}`} rotation={[0, angle, 0]}>
            <group position={[0, -1, 10.12]}>
              <TowerAdPanel
                slot={panels[i]}
                stakeTex={adTex}
                color={color}
                onLaunchExternal={onLaunchExternal}
                badgeNumber={middleLevelBillboardNumberFor(towerIndex, i)}
              />
            </group>
          </group>
        ))}

        <mesh position={[0, -6.9, 0]} receiveShadow>
          <cylinderGeometry args={[15.0, 15.0, 0.4, 32]} />
          <meshStandardMaterial {...ringWrapMat} />
        </mesh>
        <Billboard position={[0, -8.6, 0]}>
          <VanGoghText fontSize={1.5} color={color} letterSpacing={0.3} fontWeight="bold">
            {god}
          </VanGoghText>
        </Billboard>
        <mesh position={[0, -10.3, 0]} receiveShadow>
          <cylinderGeometry args={[15.0, 15.0, 0.4, 32]} />
          <meshStandardMaterial {...ringWrapMat} />
        </mesh>

        {[0, Math.PI / 2, Math.PI, -Math.PI / 2].map((angle, i) => (
          <group key={`ad-bottom-${i}`} rotation={[0, angle, 0]}>
            <group position={[0, -16.2, 10.12]}>
              <TowerAdPanel
                slot={houseLevelPanels[i]}
                stakeTex={adTex}
                color={color}
                onLaunchExternal={onLaunchExternal}
                badgeNumber={bottomLevelBillboardNumberFor(towerIndex, i)}
              />
            </group>
          </group>
        ))}

        {/* Propellers, moved up to the new pillar top (was y=12,
            which would sit inside the level-1 box band [8.8,
            19.6]): same geometry, now sweeping at 20.5, 0.9 above
            the level-1 box top. */}
        {[0, (Math.PI * 2) / 3, (Math.PI * 4) / 3].map((rot, i) => (
          <group key={`prop-${i}`} position={[0, 20.5, 0]} rotation={[0, rot, 0]}>
            <mesh position={[0, 0, 5.5]} rotation={[Math.PI / 2, 0, 0]} receiveShadow>
              <boxGeometry args={[1.5, 9, 0.1]} />
              <meshStandardMaterial map={propTex} metalness={0.6} roughness={0.4} color="#ffffff" emissive="#222222" emissiveIntensity={0.5} />
            </mesh>
            <mesh material={darkMetal} position={[0, 0, 1.5]} receiveShadow><cylinderGeometry args={[0.1, 0.1, 3]} rotation={[Math.PI / 2, 0, 0]} /></mesh>
          </group>
        ))}
      </group>
    </group>
  );
}

// Memoized around the ad inventory (stake.com native panel inside) —
// internals untouched.
export default memo(GodTower);
