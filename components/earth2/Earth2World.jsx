'use client';

// components/earth2/Earth2World.jsx
// EARTH 2 — THE WALKABLE PLANET (Merlin, 2026-10-22): the chamber's
// second stage. Where the Dinosaur Bay is a diorama you orbit, this
// is the planet itself, on foot: the full 50 × 50 parcel grid from
// lib/earth2/parcels.js laid out as 1.4 km of continuous terrain
// (lib/earth2/world.js — biome per parcel, seeded heightfield,
// water below the waterline), populated by the same foundry cast
// the Bay drives, distributed by habitat: herds on the plains,
// stalkers in the highlands, swimmers in the great sea, flyers
// overhead, and Castle Transylvania standing at the south-pole
// parcel with Dracula, his bats and his mosquitos.
//
// Walking follows the platform's walk pattern (the babel inputRef
// shape + the shared WalkJoystick) in the Bay's plain-three style:
// WASD + drag-look on desktop, joystick + drag-look on touch,
// feet glued to heightAt, radius push-out collision, wading in
// the shallows, deep water turns you back. Stepping onto a parcel
// is DISPLAY ONLY — the HUD reads the parcel out (id, name, tier,
// Commons/ownable, lat/lon, biome) and syncs the chamber map's
// selection; rent and buying stay with the chamber panels.
//
// The Royal Tyrrell Museum stands on its site parcel (E2-0510,
// Earth 2's Drumheller) with John Hammond at his counter — the
// fossil economy's trading post (Phase 2 mount, 2026-10-23): the
// building and Hammond stream in by proximity as one 'museum'
// unit (lib/earth2/streaming.js), and walking up to Hammond opens
// the exchange: pick fossils from the pack — the BACKPACK now
// (lib/backpack, the profile pack that follows the traveller) —
// choose gold or aether, and lib/earth2/hammond.js settles the
// trade — payouts landing in the same backpack tallies as
// Dracula's gifts, exactly the pattern the Count's exchange set.
//
// Tyrrell Field, Earth 2's first airport, stands on its Free
// Commons grounds west of the museum (lib/earth2/airport.js), and
// its fleet — rover, speed bike, scarab, VTOL — sleeps on the
// apron (Vehicles Phase 1, 2026-10-23). The field and each
// machine stream by proximity like the museum (the fleet as live
// units anchored wherever each machine was left); walk up to a
// machine to board it, and the pure step law in
// lib/earth2/vehicles.js drives it — terrain-following ground
// machines with slope pitch/roll and the wading wall, a VTOL
// that lifts, tilts, crosses water and lands only on flat
// ground. Where a machine was left persists on-device.
//
// Perf discipline (honest): the cast STREAMS by proximity
// (lib/earth2/streaming.js) — a species' model is decoded only
// when the walker comes within its load radius of its habitat,
// and is released (scene removal + GPU disposal) beyond its
// release radius, so the resident set stays bounded on a phone:
// at spawn only the landing neighbourhood loads, not all 56
// foundry models at once (the original all-at-entry build got
// Merlin's tab killed by Safari's memory ceiling at ~36 s).
// Resident life still animates by range — land animals drive
// their rigs within 260 m and hide past 520 m, plants sway
// within 200 m and hide past it, labels show within 140 m.
// One static terrain draw (66k verts) + one water plane carry
// the ground.
//
// Delivery stays locked exactly as the Bay's: owner-signed URLs
// via /api/earth2/model-urls, resolved through lib/earth2/models.js.

import { useEffect, useMemo, useRef, useState } from 'react';
import { EARTH2_MODEL_BY_SLUG, earth2ModelUrl, fetchEarth2ModelUrls } from '@/lib/earth2/models';
import { supabase } from '@/lib/supabase';
import { resolveBones, normalizeJointName, resolveMosquitoRig, resolveBatWings, resolveSwimRig, resolveFlyerWings, resolveScarabLegs } from '@/lib/earth2/bones';
import {
  COMPY_SWARM,
  MOSQUITO_CONFIG,
  BAT_SWARM,
  DRACULA_TIMINGS,
  surfacePhase,
  mosquitoDropsSac,
  createDraculaMachine,
  stepDracula,
} from '@/lib/earth2/creatures';
import { isCastleParcel, parcelById } from '@/lib/earth2/parcels';
import { HAMMOND_NPC, museumSiteParcel } from '@/lib/earth2/museum';
import { AIRPORT_CENTER, AIRPORT_HEADING } from '@/lib/earth2/airport';
import {
  modelSpec,
  vehicleSpecForInstance,
  boatColliders,
  stepVehicle,
  groundPose,
  loadVehicleStates,
  saveVehicleStates,
  tickVehicleRespawn,
} from '@/lib/earth2/vehicles';
import {
  vehicleInstanceById, homeStateForInstance, vehicleInstances,
  claimKeyForUser, claimStateFor, isClaimed, noteDeparture,
  stockDueForHome, nextStockId, freshStockState,
} from '@/lib/earth2/fleet';
import {
  ensureSfx, sfxImpact, sfxExplosion, sfxSplash, sfxWarningTick, sfxShimmer, vibrateFor,
} from '@/lib/earth2/sfx';
import { bridgeHeightAt, bridgeDeckYAt, stepBridgeWalker, BRIDGE_DECK_WIDTH_M } from '@/lib/earth2/bridges';
import { dressingColliders } from '@/lib/earth2/scatter';
import { fossilConditionById } from '@/lib/earth2/fossils';
import { exchangeFossil, aetherForFossil } from '@/lib/earth2/hammond';
import { useBackpack, updateBackpack } from '@/lib/backpack/store';
import {
  sacCount,
  fossilItemsFromRecord,
  addFossilsToRecord,
  removeFossilFromRecord,
  collectSacInRecord,
  applyFossilExchangeInRecord,
} from '@/lib/backpack/earth2-bridge';
import {
  WORLD_SIZE_M,
  WORLD_HALF_M,
  WATER_Y,
  WALK_EYE_M,
  heightAt,
  groundColorAt,
  parcelAtWorld,
  parcelCenterWorld,
  parcelWorldRect,
  parcelBorderPoints,
  worldToLatLon,
  biomeForParcel,
  familyForParcel,
  resolveSpawnParcel,
  spawnPointFor,
  worldCreatures,
  worldMosquitoCenters,
  compySwarmCenter,
  draculaCourt,
  worldColliders,
  waterDepthAt,
  MAX_WADE_DEPTH_M,
  swimDraftMargin,
  stepWorldWalker,
  applyWorldLook,
} from '@/lib/earth2/world';
import {
  solarPosition,
  sunVector,
  moonPosition,
  altAzToVector,
  auroraIntensity,
  skyPalette,
  constellationStars,
  CONSTELLATIONS,
  fieldStars,
  starVector,
  solarClockLabel,
} from '@/lib/earth2/sky';
import { fetchCurrentWeather, weatherToWorld, shouldRefetchWeather } from '@/lib/earth2/conditions';
import {
  behaviourCaps,
  createBehaviour,
  stepBehaviour,
  setBehaviourMode,
  behaviourPose,
  stepToward,
  fleePoint,
  intentSpeed,
  pickPreyTarget,
  rollChase,
  HUNT,
  seedFor,
} from '@/lib/earth2/behaviour';
import { createLifecycle, chooseRespawnAnchor, carcassSink } from '@/lib/earth2/lifecycle';
import {
  STREAM_RADII,
  worldStreamUnits,
  buildStreamUnits,
  vehicleStreamUnits,
  streamEntryUnits,
  streamDistance,
  planStreamActions,
} from '@/lib/earth2/streaming';
import {
  BUILDING_PIECES,
  PIECE_CATEGORIES,
  FINISHES,
  MAX_PIECES_PER_BUILD,
  pieceById,
  pieceFootprint,
  finishAllowed,
} from '@/lib/building/catalog';
import { snapPlacement, snapRotation, judgeGhost, validatePlacementSet, clampPlacementToFrame, deriveBuildCandidate, proposePlacement, snapSeams } from '@/lib/building/placement';
import { buildPieceGroup, buildGhostGroup, setGhostValidity } from '@/lib/building/piece-render';
import { PARCEL_BUILD_FRAME } from '@/lib/earth2/building';
import { activeClaimFor } from '@/lib/building/rights';
import { buildModeGate, myBuildFor } from '@/lib/earth2/build-store';
import WalkJoystick from '@/components/world/WalkJoystick';

// The palette's family labels (catalog category ids → the names
// a builder reads).
const BUILD_CAT_LABEL = {
  foundations: 'Foundations', floors: 'Floors', walls: 'Walls & Openings',
  roofs: 'Roofs & Crowns', access: 'Access', structure: 'Structure',
  fittings: 'Fittings', spans: 'Spans & Sky', climb: 'Climb',
  water: 'Water & Edge', life: 'Life & Whimsy', organic: 'Organic',
};

// The stance cycle for a piece being aimed or edited (catalog
// ORIENTATIONS): upright → laid flat → flipped flat → upright.
const ORIENT_CYCLE = ['upright', 'flat', 'flat-flip'];
function nextOrientation(o) {
  const cur = ORIENT_CYCLE.includes(o) ? o : 'upright';
  return ORIENT_CYCLE[(ORIENT_CYCLE.indexOf(cur) + 1) % ORIENT_CYCLE.length];
}
const ORIENT_LABEL = { upright: 'Upright', flat: 'Flat', 'flat-flip': 'Flat ↩' };

// The first problem of a whole-set judgement, as one sentence —
// used when an edit (rotate / raise / remove) would break the
// set's own law and is refused.
function firstSetProblem(v) {
  if (v.overBudget) return `Over the ${MAX_PIECES_PER_BUILD}-piece limit.`;
  if (v.bounds && v.bounds.violations && v.bounds.violations.length) {
    return 'A piece would sit outside the parcel or past the height cap.';
  }
  if (v.overlaps && v.overlaps.collisions && v.overlaps.collisions.length) {
    return 'Pieces would overlap.';
  }
  if (v.support && v.support.results) {
    const s = v.support.results.find((r) => !r.supported);
    if (s) return 'A piece would be left with nothing holding it up.';
  }
  if (v.terrain && !v.terrain.ok) return 'A piece would sink into the ground.';
  return 'That change does not hold together.';
}

// Deterministic layout RNG (mulberry32) — the same generator the
// Bay arranges itself with; the world strikes the same poses on
// every visit.
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TIER_LABEL = { standard: 'Standard', prime: 'Prime', landmark: 'Landmark' };
const CLIMATE_LABEL = {
  polar: 'Polar', subpolar: 'Subpolar', temperate: 'Temperate',
  subtropical: 'Subtropical', tropical: 'Tropical',
};

// ── The Earth 2 concourse (Merlin's design order, 2026-10-23) ──
// The standing in-world HUD lives in PANELS, like the main hub's
// Concourse: each panel drags by its header, shrinks to just its
// header, and remembers where it was left — positions and
// collapsed states persist on the device (localStorage). A panel
// takes pointer events only on its own box; everywhere else the
// screen belongs to the world. Dragging follows the Concourse
// box-drag pattern: press the header (never a button on it),
// move, drop — the header handle always stays reachable, so a
// panel can never be lost off-screen.
const PANEL_LS_KEY = 'earth2:panels:v1';
const PANEL_IDS = ['parcel', 'actions', 'build'];

function loadPanelLayout() {
  try {
    const raw = localStorage.getItem(PANEL_LS_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch { return {}; }
}

function defaultPanelPos(id) {
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
  if (id === 'actions') {
    // Wide screens: top-right, beside the parcel panel, like the
    // old HUD row. Narrow screens can't fit both across, so the
    // controls stack under the parcel panel instead of over it.
    return vw >= 660 ? { x: Math.max(8, vw - 308), y: 10 } : { x: 10, y: 176 };
  }
  if (id === 'build') return { x: Math.max(8, Math.round((vw - 470) / 2)), y: Math.max(10, vh - 560) };
  return { x: 10, y: 10 };
}

// A panel may roam almost anywhere, but its header — the handle
// it is dragged and un-shrunk by — must stay on the screen.
function clampPanelXY(x, y) {
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
  return {
    x: Math.min(Math.max(4, x), Math.max(4, vw - 72)),
    y: Math.min(Math.max(4, y), Math.max(4, vh - 44)),
  };
}

function E2Panel({ layout, onMove, onToggle, panelClass = '', headerClass = '', bodyClass = '', header, children }) {
  const elRef = useRef(null);
  const beginDrag = (e) => {
    if (e.button != null && e.button !== 0) return;
    // Buttons, links and inputs on the header keep their own
    // taps — the drag stands down over them (the Concourse law).
    if (e.target.closest('button, a, input, select, textarea, label')) return;
    const el = elRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const startX = e.clientX;
    const startY = e.clientY;
    const startLeft = rect.left;
    const startTop = rect.top;
    let cur = { x: startLeft, y: startTop };
    let moved = false;
    const onMoveEv = (ev) => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      if (!moved && Math.hypot(dx, dy) < 4) return;
      moved = true;
      cur = clampPanelXY(startLeft + dx, startTop + dy);
      onMove(cur);
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMoveEv);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
    window.addEventListener('pointermove', onMoveEv);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };
  return (
    <div
      ref={elRef}
      className={`pointer-events-auto absolute z-20 ${panelClass}`}
      style={{ left: layout.x, top: layout.y }}
    >
      <div
        onPointerDown={beginDrag}
        className={`flex cursor-grab touch-none select-none items-center gap-2 ${headerClass}`}
      >
        <div className="min-w-0 flex-1">{header}</div>
        <button
          type="button"
          onClick={onToggle}
          aria-label={layout.collapsed ? 'Expand panel' : 'Shrink panel'}
          aria-expanded={!layout.collapsed}
          className="shrink-0 rounded-full border border-white/20 bg-white/5 px-2 py-0.5 text-[11px] font-black leading-none text-zinc-200 transition hover:bg-white/15"
        >
          {layout.collapsed ? '＋' : '－'}
        </button>
      </div>
      {!layout.collapsed && <div className={bodyClass}>{children}</div>}
    </div>
  );
}

export default function Earth2World({ spawnParcelId, bloodSacs, onBloodSac, onOpenExchange, onFossilExchange, greetSignal, onParcelChange, onExit, buildUser, ownersByParcel, claims, builds, onBuildChange, buildRequest } = {}) {
  const mountRef = useRef(null);
  const labelsRef = useRef(null);
  const [hud, setHud] = useState(null); // { parcel, biome, lat, lon, mine, home }
  // The living sky's readout for the HUD card (solar clock +
  // mirrored weather), refreshed by the scene's environment tick.
  const [envHud, setEnvHud] = useState(null);
  const [notice, setNotice] = useState('');
  const [travel, setTravel] = useState(false);
  const [status, setStatus] = useState({});
  const [bootSlugs, setBootSlugs] = useState(null);
  // The pack is the BACKPACK now (Merlin, 2026-10-23): fossils and
  // blood sacs live in the profile pack that follows the traveller
  // (lib/backpack/store.js), read here through the Earth 2 bridge.
  // The world renders counts from it; trades and finds write to it.
  const backpackRecord = useBackpack();
  const localSacs = sacCount(backpackRecord);
  const fossilPack = useMemo(
    () => fossilItemsFromRecord(backpackRecord),
    [backpackRecord]
  );
  const [nearHammond, setNearHammond] = useState(false);
  const [hammondOpen, setHammondOpen] = useState(false);
  const [hammondCurrency, setHammondCurrency] = useState('gold');
  const [hammondPicks, setHammondPicks] = useState(() => new Set());
  const [hammondResults, setHammondResults] = useState([]);

  // ── The concourse panels' layout (drag + shrink, persisted) ──
  const [panelLayout, setPanelLayout] = useState(() => {
    const stored = loadPanelLayout();
    const out = {};
    for (const id of PANEL_IDS) {
      const s = stored[id] && typeof stored[id] === 'object' ? stored[id] : {};
      const d = defaultPanelPos(id);
      const pos = clampPanelXY(
        Number.isFinite(s.x) ? s.x : d.x,
        Number.isFinite(s.y) ? s.y : d.y,
      );
      out[id] = { x: pos.x, y: pos.y, collapsed: !!s.collapsed };
    }
    return out;
  });
  useEffect(() => {
    try { localStorage.setItem(PANEL_LS_KEY, JSON.stringify(panelLayout)); } catch { /* storage unavailable */ }
  }, [panelLayout]);
  const movePanel = (id, pos) => {
    setPanelLayout((prev) => ({ ...prev, [id]: { ...prev[id], x: pos.x, y: pos.y } }));
  };
  const togglePanel = (id) => {
    setPanelLayout((prev) => ({ ...prev, [id]: { ...prev[id], collapsed: !prev[id].collapsed } }));
  };

  // ── Build mode (Building Phase 2) ─────────────────────────────
  // The scene effect reads the live build state through refs
  // (mirrored during render, like travelRef); React owns the
  // panel state. Builds themselves live with the page (device
  // store + opportunistic API sync in lib/earth2/build-store.js);
  // this component receives them as props and reports changes
  // back through onBuildChange.
  const [buildMode, setBuildMode] = useState(false);
  const [buildParcelId, setBuildParcelId] = useState(null);
  const [buildTool, setBuildTool] = useState('place'); // 'place' | 'edit'
  const [buildCat, setBuildCat] = useState('walls');
  const [selPieceId, setSelPieceId] = useState('wall');
  const [selFinish, setSelFinish] = useState('timber');
  const [selTint, setSelTint] = useState(''); // '' = natural; else degrees
  const [buildRot, setBuildRot] = useState(0);
  const [buildOrient, setBuildOrient] = useState('upright');
  const [buildLift, setBuildLift] = useState(0);
  const [ghostState, setGhostState] = useState(null); // { ok, reasons, proposal }
  const [editIndex, setEditIndex] = useState(null);
  const [buildMsg, setBuildMsg] = useState('');
  const buildModeRef = useRef({
    active: false, parcelId: null, tool: 'place',
    pieceId: 'wall', finish: 'timber', tint: null, rotY: 0,
    orientation: 'upright', aim: null,
    yLift: 0, seatKey: '', seatY: 0, verdictKey: '',
    ghostPlacement: null, verdict: null, editIndex: -1, carried: null,
  });
  const buildPropsRef = useRef({});
  buildPropsRef.current = {
    user: buildUser || null,
    owners: ownersByParcel || null,
    claims: claims || [],
    builds: builds || [],
    onBuildChange: typeof onBuildChange === 'function' ? onBuildChange : null,
  };
  const buildSceneRef = useRef({ refreshBuilds: null });

  const gateForParcel = (parcel) => {
    const p = buildPropsRef.current;
    const ownerRow = p.owners && typeof p.owners.get === 'function' ? p.owners.get(parcel.id) : null;
    const claim = activeClaimFor(p.claims, parcel.id);
    return buildModeGate(p.user, parcel, ownerRow, claim);
  };

  const commitBuildPieces = (parcelId, pieces) => {
    const p = buildPropsRef.current;
    if (!p.user || !p.onBuildChange) return;
    p.onBuildChange({
      groundType: 'earth2-parcel',
      groundId: parcelId,
      ownerId: p.user.id || null,
      ownerEmail: p.user.email || null,
      pieces,
      updatedAt: new Date().toISOString(),
    });
  };

  const enterBuildMode = (parcel) => {
    if (!parcel) return false;
    if (drivingRef.current) {
      setNotice('🚗 Step out of the vehicle first.');
      return false;
    }
    const gate = gateForParcel(parcel);
    if (!gate.ok) {
      setNotice(`🔨 ${gate.text}`);
      return false;
    }
    const bm = buildModeRef.current;
    bm.parcelId = parcel.id;
    bm.tool = 'place';
    bm.editIndex = -1;
    bm.carried = null;
    bm.aim = null; // the ghost aims fresh from the camera once, then anchors
    bm.seatKey = '';
    bm.verdictKey = '';
    setBuildParcelId(parcel.id);
    setBuildTool('place');
    setEditIndex(null);
    setBuildMsg(gate.text);
    setBuildMode(true);
    return true;
  };

  const exitBuildMode = () => {
    const bm = buildModeRef.current;
    bm.carried = null; // a carried piece never left the build — nothing to restore
    bm.editIndex = -1;
    setBuildMode(false);
    setEditIndex(null);
    setGhostState(null);
  };

  // A chamber "Build here" press arrives as buildRequest; the
  // world spawns the walker on that parcel, and build mode opens
  // the moment the HUD confirms the walker stands on it.
  const pendingBuildRef = useRef(null);
  useEffect(() => {
    if (buildRequest && buildRequest.parcelId) {
      pendingBuildRef.current = buildRequest.parcelId;
    }
  }, [buildRequest]);
  useEffect(() => {
    const want = pendingBuildRef.current;
    if (!want || !hud || !hud.parcel) return;
    if (hud.parcel.id === want) {
      pendingBuildRef.current = null;
      enterBuildMode(hud.parcel);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hud, buildRequest]);

  // Keep the stream plan honest as builds change or build mode
  // opens (the parcel being built on is pinned resident).
  useEffect(() => {
    const r = buildSceneRef.current;
    if (r && typeof r.refreshBuilds === 'function') r.refreshBuilds();
  }, [builds, buildMode]);

  const pickPiece = (id) => {
    const piece = pieceById(id);
    if (!piece) return;
    const bm = buildModeRef.current;
    bm.pieceId = id;
    bm.carried = null;
    bm.seatKey = '';
    bm.verdictKey = '';
    setSelPieceId(id);
    if (!finishAllowed(piece, selFinish)) {
      const f = piece.finishes === 'all' ? 'timber' : piece.finishes[0];
      bm.finish = f;
      setSelFinish(f);
    }
  };

  const pickFinish = (f) => {
    buildModeRef.current.finish = f;
    buildModeRef.current.verdictKey = '';
    setSelFinish(f);
  };

  const pickTint = (v) => {
    buildModeRef.current.tint = v === '' ? null : Number(v);
    buildModeRef.current.verdictKey = '';
    setSelTint(v);
  };

  const rotateGhost = (dir) => {
    const bm = buildModeRef.current;
    bm.rotY = snapRotation(bm.rotY + dir * 15, bm.pieceId);
    bm.verdictKey = '';
    bm.seatKey = '';
    setBuildRot(bm.rotY);
  };

  const liftGhost = (dir) => {
    const bm = buildModeRef.current;
    bm.yLift = Math.min(20, Math.max(0, Math.round((bm.yLift + dir * 0.25) * 100) / 100));
    bm.verdictKey = '';
    setBuildLift(bm.yLift);
  };

  // Cycle the ghost's stance: upright → flat → flat-flip
  // (Merlin: "allow orientation changing like vertical and
  // horizontal rotation"). The anchor stays — only the stance
  // and the judgement change.
  const cycleOrientation = () => {
    const bm = buildModeRef.current;
    bm.orientation = nextOrientation(bm.orientation);
    bm.verdictKey = '';
    bm.seatKey = '';
    setBuildOrient(bm.orientation);
  };
  const buildOrientSyncRef = useRef(() => {});
  buildOrientSyncRef.current = (v) => setBuildOrient(v);

  // Pick a placed piece up into the ghost (relocation): shared
  // by the Edit bench's Move button and the scene's double-tap
  // on a placed piece (Merlin, 2026-10-23: "tap the item twice
  // to make it spawn somewhere else and be removed from its
  // current location"). The original stays in the build until
  // the ghost is set down somewhere new (the placement commit
  // splices it out atomically), so abandoning the move — leaving
  // build mode — returns it to EXACTLY its old transform, and
  // the build's piece count never double-counts it.
  const pickupPiece = (index) => {
    const p = buildPropsRef.current;
    const bm = buildModeRef.current;
    if (!buildParcelId) return;
    const mine = myBuildFor(p.builds, buildParcelId, p.user);
    if (!mine || !mine.pieces[index]) return;
    const original = mine.pieces[index];
    bm.carried = { piece: { ...original }, index };
    bm.pieceId = original.pieceId;
    bm.finish = original.finish;
    bm.tint = original.tint == null ? null : original.tint;
    bm.rotY = original.rotY || 0;
    bm.orientation = original.orientation || 'upright';
    bm.aim = { parcelId: buildParcelId, x: original.x, z: original.z };
    bm.seatKey = '';
    bm.verdictKey = '';
    setSelPieceId(original.pieceId);
    setSelFinish(original.finish);
    setSelTint(original.tint == null ? '' : String(original.tint));
    setBuildRot(bm.rotY);
    setBuildOrient(bm.orientation);
    setEditIndex(null);
    bm.editIndex = -1;
    setBuildTool('place');
    bm.tool = 'place';
    setBuildMsg(`Moving the ${pieceById(original.pieceId)?.name || 'piece'} — tap where it should live; leave build mode to put it back untouched.`);
  };
  const buildPickupRef = useRef(() => {});
  buildPickupRef.current = (index) => pickupPiece(index);

  // Edit-mode actions on the selected placed piece. Every change
  // is judged as a whole set first (validatePlacementSet): an
  // edit that would strand, overlap or bury a piece is refused
  // with the reason, and nothing is committed.
  const editSelected = (action) => {
    const p = buildPropsRef.current;
    const bm = buildModeRef.current;
    if (!buildParcelId || editIndex === null) return;
    const mine = myBuildFor(p.builds, buildParcelId, p.user);
    if (!mine || !mine.pieces[editIndex]) return;
    const original = mine.pieces[editIndex];
    if (action === 'move') { pickupPiece(editIndex); return; }
    const pieces = mine.pieces.slice();
    const piece = { ...original };
    if (action === 'remove') pieces.splice(editIndex, 1);
    else if (action === 'rotate') {
      piece.rotY = snapRotation((piece.rotY || 0) + 15, piece.pieceId);
      pieces[editIndex] = piece;
    } else if (action === 'flip') {
      const next = nextOrientation(piece.orientation);
      if (next === 'upright') delete piece.orientation;
      else piece.orientation = next;
      pieces[editIndex] = piece;
    } else if (action === 'raise') {
      piece.y = Math.round(((piece.y || 0) + 0.25) * 100) / 100;
      pieces[editIndex] = piece;
    } else if (action === 'lower') {
      piece.y = Math.max(0, Math.round(((piece.y || 0) - 0.25) * 100) / 100);
      pieces[editIndex] = piece;
    } else return;
    const verdict = validatePlacementSet(pieces, {
      frame: PARCEL_BUILD_FRAME,
      terrainHeightAt: () => 0,
    });
    if (!verdict.ok) {
      setBuildMsg(`🔨 ${firstSetProblem(verdict)}`);
      return;
    }
    if (action === 'remove') {
      setEditIndex(null);
      bm.editIndex = -1;
    }
    setBuildMsg('');
    commitBuildPieces(buildParcelId, pieces);
  };

  // The scene reads build state through the ref; React state is
  // the panel. Mirror the two switches every render (the file's
  // travelRef pattern), and give the scene a door to close build
  // mode (Escape) through the same ref-door pattern.
  buildModeRef.current.active = buildMode;
  buildModeRef.current.tool = buildTool;
  const buildExitRef = useRef(() => {});
  buildExitRef.current = () => exitBuildMode();
  const buildSelectRef = useRef(() => {});
  buildSelectRef.current = (i) => setEditIndex(i == null || i < 0 ? null : i);
  const buildLiftSyncRef = useRef(() => {});
  buildLiftSyncRef.current = (v) => setBuildLift(v);
  const buildRotSyncRef = useRef(() => {});
  buildRotSyncRef.current = (v) => setBuildRot(v);
  const buildCommitRef = useRef(() => {});
  buildCommitRef.current = (parcelId, pieces) => commitBuildPieces(parcelId, pieces);
  const ghostInfoRef = useRef(() => {});
  ghostInfoRef.current = (verdict) => {
    setGhostState((prev) => {
      const next = verdict
        ? { ok: verdict.ok, reasons: verdict.reasons, proposal: verdict.proposal || null }
        : null;
      if (JSON.stringify(prev) === JSON.stringify(next)) return prev;
      return next;
    });
  };

  // The walk input, in the platform's shape (babel's inputRef):
  // the page shell (keyboard, pointer, joystick) writes, the scene
  // consumes every frame.
  const inputRef = useRef({
    keys: { fwd: false, back: false, left: false, right: false, shift: false, up: false, down: false },
    joy: { x: 0, y: 0 },
    look: { dx: 0, dy: 0 },
  });
  const travelRef = useRef(false);
  travelRef.current = travel;
  const exitRef = useRef(() => {});
  exitRef.current = () => { if (typeof onExit === 'function') onExit(); };
  const greetRef = useRef(false);
  const collectSacRef = useRef(() => {});
  collectSacRef.current = () => {
    if (typeof onBloodSac === 'function') onBloodSac();
    else updateBackpack((rec) => collectSacInRecord(rec));
  };
  const openExchangeRef = useRef(() => {});
  openExchangeRef.current = () => {
    greetRef.current = true;
    if (typeof onOpenExchange === 'function') onOpenExchange();
  };
  // One Hammond payout, applied: the page owns the tallies when
  // it passes its handler (the same seat Dracula's gifts land in);
  // standalone, the world writes the backpack directly — the
  // collectSac fallback pattern, one pack either way.
  const fossilPayoutRef = useRef(() => {});
  fossilPayoutRef.current = (exchangeRecord) => {
    if (typeof onFossilExchange === 'function') onFossilExchange(exchangeRecord);
    else updateBackpack((rec) => applyFossilExchangeInRecord(rec, exchangeRecord, Date.now()));
  };
  // A carcass's fossil roll (the lifecycle's fossilHook) settles
  // into the backpack as the carcass sinks away — the credit the
  // hook always pointed at, wired to the pack that now exists.
  const fossilCreditRef = useRef(() => {});
  fossilCreditRef.current = (drops) => {
    if (!Array.isArray(drops) || !drops.length) return;
    updateBackpack((rec) => addFossilsToRecord(rec, drops));
    noticeRef.current(
      `🦴 Fossils recovered into your backpack: ${drops.map((d) => d.type).join(', ')}`
    );
  };
  const nearHammondRef = useRef(false);
  const hammondOpenRef = useRef(false);

  // ── Vehicles (Vehicles Phase 1) ─────────────────────────────
  // The fleet's positions live in the device store
  // (lib/earth2/vehicles.js), loaded once into a ref the scene
  // reads and the drive step rewrites; React state carries only
  // what the HUD shows — the nearest machine's board prompt and
  // the driving panel. Boarding and stepping out are scene-side
  // (they move the walker), so the buttons call through ref
  // doors on the buildExitRef pattern.
  const [nearVehicle, setNearVehicle] = useState(null);
  const [driving, setDriving] = useState(null);
  const [driveInfo, setDriveInfo] = useState({ speed: 0, alt: 0, integrity: 100 });
  const vehicleStatesRef = useRef(null);
  if (vehicleStatesRef.current === null) vehicleStatesRef.current = loadVehicleStates();
  const drivingRef = useRef(null);
  const nearVehicleRef = useRef(null);
  const boardVehicleRef = useRef(() => {});
  const exitVehicleRef = useRef(() => {});
  const setHammondPanel = (open) => {
    hammondOpenRef.current = open;
    setHammondOpen(open);
  };

  const toggleHammondPick = (id) => {
    setHammondPicks((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Settle the picked fossils at Hammond's counter: each fossil
  // is its own exchange (its own 8% substitution roll in
  // lib/earth2/hammond.js), leaves the backpack, and pays out
  // through the tally path above. The records stay on show in
  // the panel.
  const doHammondExchange = () => {
    const picks = fossilPack.filter((f) => hammondPicks.has(f.id));
    if (!picks.length) return;
    const records = [];
    for (const fossil of picks) {
      const record = exchangeFossil(fossil, hammondCurrency);
      if (!record) continue;
      updateBackpack((rec) => removeFossilFromRecord(rec, fossil.id));
      records.push(record);
      fossilPayoutRef.current(record);
    }
    if (!records.length) return;
    setHammondPicks(new Set());
    setHammondResults(records);
  };
  const parcelChangeRef = useRef(() => {});
  parcelChangeRef.current = (id) => { if (typeof onParcelChange === 'function') onParcelChange(id); };
  const noticeRef = useRef(() => {});
  noticeRef.current = (msg) => setNotice(msg);
  useEffect(() => { if (greetSignal) greetRef.current = true; }, [greetSignal]);
  useEffect(() => {
    if (!notice) return undefined;
    const id = setTimeout(() => setNotice(''), 4200);
    return () => clearTimeout(id);
  }, [notice]);
  const sacsShown = typeof bloodSacs === 'number' ? bloodSacs : localSacs;
  // The loading pill counts the SPAWN neighbourhood's model set
  // (bootSlugs) — the only models that stream in before the
  // first step. Far species arrive as the walker roams; they are
  // not part of "placing the foundry" any more.
  const bootTotal = bootSlugs ? bootSlugs.length : 0;
  const bootPlaced = bootSlugs
    ? bootSlugs.filter((s) => status[s] === 'placed' || status[s] === 'failed').length
    : 0;
  const bootDone = bootSlugs !== null && bootPlaced >= bootTotal;
  // Fail-soft (Wave C): a spawn-set slug whose stream unit never
  // reports placed/failed (e.g. a unit whose place step returns
  // early) must not pin the pill on screen forever — after a
  // generous bound the pill dismisses itself, treating the
  // unresolved as settled for display. The streaming itself is
  // untouched; late models still arrive as their units resolve.
  const [bootExpired, setBootExpired] = useState(false);
  useEffect(() => {
    if (!bootSlugs || bootDone) return undefined;
    const id = setTimeout(() => setBootExpired(true), 45000);
    return () => clearTimeout(id);
  }, [bootSlugs, bootDone]);

  useEffect(() => {
    let cancelled = false;
    let cleanup = () => {};
    (async () => {
      const THREE = await import('three');
      const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
      const { MeshoptDecoder } = await import('three/examples/jsm/libs/meshopt_decoder.module.js');
      const SkeletonUtils = await import('three/examples/jsm/utils/SkeletonUtils.js');
      if (cancelled || !mountRef.current) return;

      // Earth 2 asset lock — identical to the Bay's: fetch the
      // owner-signed model URLs once, before anything loads.
      let signedModelUrls = null;
      try {
        const { data } = await supabase.auth.getSession();
        const token = data && data.session && data.session.access_token;
        if (token) signedModelUrls = await fetchEarth2ModelUrls({ token });
      } catch { signedModelUrls = null; }
      if (cancelled || !mountRef.current) return;

      const mount = mountRef.current;
      const renderer = new THREE.WebGLRenderer({ antialias: true });
      // 1.75, not the house 2: this is the one full-screen scene
      // that walks a kilometre of skinned cast over a full terrain
      // mesh, on the phone class whose tab Safari already killed
      // once — the smaller framebuffer (~23% fewer pixels than
      // DPR 2, MSAA included) is memory the models need more.
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      mount.appendChild(renderer.domElement);
      renderer.domElement.style.display = 'block';
      renderer.domElement.style.width = '100%';
      renderer.domElement.style.height = '100%';
      renderer.domElement.style.touchAction = 'none';

      const scene = new THREE.Scene();
      // ── The living sky (Living Planet Wave A) ──────────────
      // The dome is repainted from lib/earth2/sky.js's palette
      // as the REAL sun moves over the parcel underfoot: day
      // blues, sunset fire, a true night. The sun and moon are
      // real lights on real bearings; the stars are Earth's
      // constellations plotted from their real positions; the
      // aurora burns over high latitudes after dark; clouds,
      // precipitation and fog mirror the parcel's real Open-Meteo
      // weather (lib/earth2/conditions.js). updateEnvironment()
      // (below, beside the walker) drives all of it — failure
      // anywhere leaves a clear local-time sky, never a broken
      // world.
      const skyCanvas = document.createElement('canvas');
      skyCanvas.width = 4; skyCanvas.height = 512;
      const skyTex = new THREE.CanvasTexture(skyCanvas);
      skyTex.colorSpace = THREE.SRGBColorSpace;
      scene.background = skyTex;
      const rgbCss = (c) => `rgb(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)})`;
      function paintSky(pal) {
        const g = skyCanvas.getContext('2d');
        const grad = g.createLinearGradient(0, 0, 0, 512);
        grad.addColorStop(0, rgbCss(pal.top));
        grad.addColorStop(0.55, rgbCss([
          (pal.top[0] + pal.horizon[0]) / 2, (pal.top[1] + pal.horizon[1]) / 2, (pal.top[2] + pal.horizon[2]) / 2,
        ]));
        grad.addColorStop(1, rgbCss(pal.horizon));
        g.fillStyle = grad;
        g.fillRect(0, 0, 4, 512);
        skyTex.needsUpdate = true;
      }
      scene.fog = new THREE.Fog(0xcfe0ea, 130, 980);

      const camera = new THREE.PerspectiveCamera(66, 16 / 10, 0.1, 2400);
      camera.rotation.order = 'YXZ';

      const hemi = new THREE.HemisphereLight(0xd8ecff, 0x40543a, 1.05);
      scene.add(hemi);
      const sun = new THREE.DirectionalLight(0xfff1d6, 2.2);
      sun.position.set(60, 90, 40);
      scene.add(sun);
      scene.add(sun.target);
      const moonLight = new THREE.DirectionalLight(0x9db8e8, 0);
      scene.add(moonLight);
      scene.add(moonLight.target);

      // The environment's shared state: the scene's frame loop
      // and the environment tick both read it. wx is the mapped
      // weather (clear-sky defaults until a fetch lands).
      const env = {
        wx: weatherToWorld(null), wxRaw: null, wxLast: null, fetchBusy: false,
        night: 0, aurora: 0, phase: 'day', skyBucket: '', clock: '',
      };

      // Stars: pattern points + constellation lines + the faint
      // field, all additive with per-star colours — a star below
      // the horizon is coloured black, which additive blending
      // makes invisible wherever it sits. Positions are written
      // by the environment tick (real RA/Dec → local bearings).
      const PATTERN_STARS = constellationStars();
      const FIELD_STARS = fieldStars();
      const starBrightness = (mag) => Math.max(0.18, Math.min(1, 1.30 - (mag - 0.1) * 0.20));
      function makeStarPoints(stars, size) {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(stars.length * 3), 3));
        geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(stars.length * 3), 3));
        const pts = new THREE.Points(geo, new THREE.PointsMaterial({
          size, sizeAttenuation: false, vertexColors: true, transparent: true,
          blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
        }));
        pts.frustumCulled = false;
        scene.add(pts);
        return pts;
      }
      const patternPoints = makeStarPoints(PATTERN_STARS, 3.2);
      const fieldPoints = makeStarPoints(FIELD_STARS, 1.6);
      const linePairs = [];
      for (const c of CONSTELLATIONS) {
        const base = PATTERN_STARS.findIndex((s) => s.constellation === c.name);
        for (const [a, b] of c.lines) linePairs.push([base + a, base + b]);
      }
      const lineGeo = new THREE.BufferGeometry();
      lineGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(linePairs.length * 6), 3));
      lineGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(linePairs.length * 6), 3));
      const constellationLines = new THREE.LineSegments(lineGeo, new THREE.LineBasicMaterial({
        vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
      }));
      constellationLines.frustumCulled = false;
      scene.add(constellationLines);

      // The moon: a pale disc + a soft halo, flown to its real
      // bearing by the environment tick.
      const moonDisc = new THREE.Mesh(
        new THREE.CircleGeometry(56, 32),
        new THREE.MeshBasicMaterial({ color: 0xe9eff8, transparent: true, opacity: 0, depthWrite: false, fog: false }),
      );
      moonDisc.frustumCulled = false;
      scene.add(moonDisc);
      const moonGlow = (() => {
        const c = document.createElement('canvas'); c.width = 128; c.height = 128;
        const g = c.getContext('2d');
        const grad = g.createRadialGradient(64, 64, 4, 64, 64, 64);
        grad.addColorStop(0, 'rgba(190,210,245,0.55)'); grad.addColorStop(1, 'rgba(190,210,245,0)');
        g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
        const tex = new THREE.CanvasTexture(c);
        const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false, fog: false }));
        spr.scale.setScalar(420);
        scene.add(spr);
        return spr;
      })();

      // Aurora curtains: three vertex-waved ribbons with a
      // green-to-violet gradient, flown poleward by the tick.
      const auroraGroup = new THREE.Group();
      const auroraRibbons = [];
      {
        const c = document.createElement('canvas'); c.width = 8; c.height = 256;
        const g = c.getContext('2d');
        const grad = g.createLinearGradient(0, 0, 0, 256);
        grad.addColorStop(0, 'rgba(150,120,255,0)');
        grad.addColorStop(0.30, 'rgba(150,120,255,0.20)');
        grad.addColorStop(0.62, 'rgba(90,240,200,0.30)');
        grad.addColorStop(0.85, 'rgba(110,255,180,0.60)');
        grad.addColorStop(1, 'rgba(110,255,180,0)');
        g.fillStyle = grad; g.fillRect(0, 0, 8, 256);
        const tex = new THREE.CanvasTexture(c);
        for (let i = 0; i < 3; i++) {
          const geo = new THREE.PlaneGeometry(1700, 150 + i * 36, 96, 1);
          const mat = new THREE.MeshBasicMaterial({
            map: tex, transparent: true, opacity: 0, blending: THREE.AdditiveBlending,
            depthWrite: false, side: THREE.DoubleSide, fog: false,
          });
          const mesh = new THREE.Mesh(geo, mat);
          mesh.position.set(0, i * 26, -i * 110);
          mesh.frustumCulled = false;
          auroraGroup.add(mesh);
          auroraRibbons.push({ mesh, base: geo.attributes.position.array.slice() });
        }
      }
      auroraGroup.visible = false;
      scene.add(auroraGroup);

      // Clouds: soft sprites on a slow drift, one shared
      // material — the weather sets its opacity and its tint.
      const cloudSprites = [];
      {
        const c = document.createElement('canvas'); c.width = 128; c.height = 128;
        const g = c.getContext('2d');
        const grad = g.createRadialGradient(64, 64, 4, 64, 64, 62);
        grad.addColorStop(0, 'rgba(255,255,255,0.85)');
        grad.addColorStop(0.6, 'rgba(255,255,255,0.38)');
        grad.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
        const tex = new THREE.CanvasTexture(c);
        const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false });
        const crng = mulberry32(4242);
        for (let i = 0; i < 34; i++) {
          const spr = new THREE.Sprite(mat);
          const a = crng() * Math.PI * 2;
          const r = crng() * 780;
          spr.position.set(Math.cos(a) * r, 150 + crng() * 55, Math.sin(a) * r);
          spr.scale.set(190 + crng() * 240, 52 + crng() * 42, 1);
          scene.add(spr);
          cloudSprites.push(spr);
        }
        env.cloudMaterial = mat;
      }

      // Precipitation: one points cloud in a box around the
      // walker, recycled as it falls — rain fast and sparse-
      // bright, snow slow and fat, set by the weather mapping.
      // Each kind wears a CRISP canvas sprite (rain: a thin
      // hard-edged streak; snow: a small sharp disc with a
      // one-step falloff — no soft blur). A bare PointsMaterial
      // has no map and draws every point as a raw SQUARE; at
      // the old sizes (1.6 / 2.6 world units) a drop near the
      // camera became an enormous pale slab filling the screen
      // (Merlin's drizzle video, 2026-10-23). The points now
      // stay small — fine sharp weather, never blobs.
      const PRECIP_COUNT = 650;
      const precipGeo = new THREE.BufferGeometry();
      const precipPos = new Float32Array(PRECIP_COUNT * 3);
      precipGeo.setAttribute('position', new THREE.BufferAttribute(precipPos, 3));
      const makePrecipTexture = (w, h, draw) => {
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        draw(c.getContext('2d'), w, h);
        return new THREE.CanvasTexture(c);
      };
      const rainTex = makePrecipTexture(16, 64, (g, w, h) => {
        g.fillStyle = 'rgba(255,255,255,0.5)';
        g.fillRect(w / 2 - 2, 3, 4, h - 6);
        g.fillStyle = 'rgba(255,255,255,1)';
        g.fillRect(w / 2 - 1, 0, 2, h);
      });
      const snowTex = makePrecipTexture(32, 32, (g, w, h) => {
        g.fillStyle = 'rgba(255,255,255,0.35)';
        g.beginPath(); g.arc(w / 2, h / 2, 9, 0, Math.PI * 2); g.fill();
        g.fillStyle = 'rgba(255,255,255,1)';
        g.beginPath(); g.arc(w / 2, h / 2, 6.5, 0, Math.PI * 2); g.fill();
      });
      const precipMat = new THREE.PointsMaterial({
        color: 0xcfe4ff, size: 0.32, map: rainTex, transparent: true, opacity: 0, depthWrite: false, sizeAttenuation: true,
      });
      let precipKind = 'rain';
      const precip = new THREE.Points(precipGeo, precipMat);
      precip.frustumCulled = false;
      precip.visible = false;
      scene.add(precip);

      const rng = mulberry32(20261022);
      const animals = [];   // land creatures + flyers (life-driven)
      const swimmers = [];  // the sea's cast
      // Death & respawn (lib/earth2/lifecycle.js): every kill —
      // a predator's prey, a shot mosquito — registers here, and
      // the tick stands the dead back up at a far anchor when
      // their time comes, so the world never empties. Carcasses
      // are the dead animals' own records (state 'carcass'),
      // sinking on the lifecycle's clock where they fell.
      const lifecycle = createLifecycle({ seed: 20261023 });
      const sway = [];      // plant instances { obj, phase, amp, x, z }
      const labels = [];    // { el, obj, h, maxDist }
      const disposables = [];
      const track = (o) => { disposables.push(o); return o; };
      const setStatusFor = (slug, s) => {
        if (cancelled) return;
        setStatus((prev) => {
          if (s === null) {
            if (!(slug in prev)) return prev;
            const next = { ...prev };
            delete next[slug];
            return next;
          }
          return { ...prev, [slug]: s };
        });
      };
      // Remove every entry matching pred from a shared array, in
      // place (the arrays are const and the frame loop reads them;
      // streaming releases splice at the top of a frame, never
      // mid-iteration).
      const removeWhere = (arr, pred) => {
        for (let i = arr.length - 1; i >= 0; i--) {
          if (pred(arr[i])) arr.splice(i, 1);
        }
      };
      // Dispose a detached object graph's GPU resources, each
      // exactly once: herd copies and swarm clones SHARE the base
      // model's geometry, materials and textures, so one `seen`
      // set walks every root a released unit owns and frees each
      // unique resource a single time. Anything a root merely
      // references but the unit does not own is never in its
      // graphs, so shared assets of resident units are untouched.
      const disposeGraph = (root, seen) => {
        if (!root || !root.traverse) return;
        root.traverse((o) => {
          if (o.geometry && !seen.has(o.geometry)) { seen.add(o.geometry); o.geometry.dispose(); }
          if (o.material) {
            const mats = Array.isArray(o.material) ? o.material : [o.material];
            for (const m of mats) {
              if (seen.has(m)) continue;
              seen.add(m);
              for (const k of Object.keys(m)) {
                const v = m[k];
                if (v && v.isTexture && !seen.has(v)) { seen.add(v); v.dispose(); }
              }
              m.dispose();
            }
          }
        });
      };

      // ── Terrain: ONE static mesh sampled from world.js — the
      // same heightAt/groundColorAt the walker, the drivers and
      // the tests all read, so ground, feet and data can never
      // disagree. Vertex colours carry the biome tint blended
      // across parcel borders, the beach band and the bed shading.
      {
        const c = document.createElement('canvas'); c.width = 512; c.height = 512;
        const g = c.getContext('2d');
        g.fillStyle = '#8a9a7a'; g.fillRect(0, 0, 512, 512);
        const rngTex = mulberry32(77);
        const tones = ['#7d8f6e', '#96a583', '#a3ad8d', '#87977a', '#9aa58c'];
        for (let i = 0; i < 900; i++) {
          g.fillStyle = tones[Math.floor(rngTex() * tones.length)];
          g.globalAlpha = 0.10 + rngTex() * 0.14;
          const r = 6 + rngTex() * 30;
          g.beginPath(); g.arc(rngTex() * 512, rngTex() * 512, r, 0, 7); g.fill();
        }
        g.globalAlpha = 1;
        const tex = new THREE.CanvasTexture(c);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(46, 46);
        const geo = new THREE.PlaneGeometry(WORLD_SIZE_M, WORLD_SIZE_M, 256, 256);
        geo.rotateX(-Math.PI / 2);
        const posA = geo.attributes.position;
        const colors = new Float32Array(posA.count * 3);
        for (let i = 0; i < posA.count; i++) {
          const x = posA.getX(i);
          const z = posA.getZ(i);
          posA.setY(i, heightAt(x, z));
          const col = groundColorAt(x, z);
          colors[i * 3] = col[0]; colors[i * 3 + 1] = col[1]; colors[i * 3 + 2] = col[2];
        }
        geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        geo.computeVertexNormals();
        const ground = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex, roughness: 1, vertexColors: true }));
        scene.add(ground);
        track(ground);
      }

      // ── The water: one deep-blue plane at the waterline
      // (Merlin's Earth 2 order, 2026-10-23 — darker than the old
      // bright blue, still clean, never murky), translucent so
      // the swimmers read beneath it. Terrain below WATER_Y is
      // wet; everywhere else the ground covers the plane. A broad
      // ring at the same waterline runs the sea on to the horizon,
      // so the coast reads as coast — open water beyond the rim,
      // never land standing against the sky.
      let waterMat = null;
      let waterTex = null;
      {
        const wc = document.createElement('canvas'); wc.width = 256; wc.height = 256;
        const wg = wc.getContext('2d');
        const rngW = mulberry32(97);
        for (let i = 0; i < 46; i++) {
          wg.fillStyle = `rgba(255,255,255,${0.04 + rngW() * 0.07})`;
          wg.beginPath();
          wg.ellipse(rngW() * 256, rngW() * 256, 12 + rngW() * 42, 5 + rngW() * 12, rngW() * 3.2, 0, 7);
          wg.fill();
        }
        for (let i = 0; i < 22; i++) {
          wg.fillStyle = `rgba(190,235,255,${0.05 + rngW() * 0.06})`;
          wg.beginPath();
          wg.ellipse(rngW() * 256, rngW() * 256, 8 + rngW() * 26, 4 + rngW() * 9, rngW() * 3.2, 0, 7);
          wg.fill();
        }
        waterTex = new THREE.CanvasTexture(wc);
        waterTex.colorSpace = THREE.SRGBColorSpace;
        waterTex.wrapS = waterTex.wrapT = THREE.RepeatWrapping;
        waterTex.repeat.set(30, 30);
        waterMat = new THREE.MeshStandardMaterial({
          color: 0x14608c, map: waterTex, transparent: true, opacity: 0.5,
          roughness: 0.12, metalness: 0, depthWrite: false,
        });
        const water = new THREE.Mesh(new THREE.PlaneGeometry(WORLD_SIZE_M, WORLD_SIZE_M), waterMat);
        water.rotation.x = -Math.PI / 2;
        water.position.y = WATER_Y;
        scene.add(water);
        track(water);
        // The horizon sea: a ring from just under the terrain's
        // edge out to the camera's reach, a breath below the
        // fitted plane so the two never z-fight at the shore.
        const horizonSea = new THREE.Mesh(
          new THREE.RingGeometry(WORLD_SIZE_M / 2 - 12, 2300, 64, 1),
          new THREE.MeshStandardMaterial({
            color: 0x14608c, transparent: true, opacity: 0.5,
            roughness: 0.12, metalness: 0, depthWrite: false,
          }),
        );
        horizonSea.rotation.x = -Math.PI / 2;
        horizonSea.position.y = WATER_Y - 0.04;
        scene.add(horizonSea);
        track(horizonSea);
      }

      // ── The current-parcel highlight: an amber outline hugging
      // the terrain along the parcel's border, rebuilt whenever
      // the walker crosses into a new parcel. The border is
      // sampled densely (24 per edge, ~1.2 m apart) so the line
      // follows the ground instead of chording across slopes
      // (Wave C — the floating-line fix).
      const highlightMat = new THREE.LineBasicMaterial({ color: 0xffd97a, transparent: true, opacity: 0.95 });
      let highlight = null;
      function setHighlight(parcel) {
        const pts = parcelBorderPoints(parcel, 24);
        const verts = new Float32Array((pts.length + 1) * 3);
        pts.forEach(([x, z], i) => {
          verts[i * 3] = x;
          verts[i * 3 + 1] = heightAt(x, z) + 0.35;
          verts[i * 3 + 2] = z;
        });
        verts[pts.length * 3] = verts[0];
        verts[pts.length * 3 + 1] = verts[1];
        verts[pts.length * 3 + 2] = verts[2];
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
        if (highlight) {
          highlight.geometry.dispose();
          highlight.geometry = geo;
        } else {
          highlight = new THREE.Line(geo, highlightMat);
          scene.add(highlight);
        }
      }

      // ── The loader + rig machinery (the Bay's, re-based on
      // terrain): normalize, load, bone roles, bind poses, facing.
      const loader = new GLTFLoader();
      loader.setMeshoptDecoder(MeshoptDecoder);

      function normalize(gltfScene, entry) {
        const spin = new THREE.Group();
        spin.add(gltfScene);
        spin.updateMatrixWorld(true);
        let box = new THREE.Box3().setFromObject(spin);
        const size = box.getSize(new THREE.Vector3());
        const extent = entry.scaleBasis === 'height' ? size.y : Math.max(size.x, size.z);
        const k = extent > 0 ? entry.scaleM / extent : 1;
        gltfScene.scale.multiplyScalar(k);
        spin.updateMatrixWorld(true);
        box = new THREE.Box3().setFromObject(spin);
        const center = box.getCenter(new THREE.Vector3());
        gltfScene.position.x -= center.x;
        gltfScene.position.z -= center.z;
        gltfScene.position.y -= box.min.y;
        return spin;
      }

      async function loadModel(entry) {
        const url = earth2ModelUrl(entry, signedModelUrls);
        if (!url) throw new Error(`No delivery URL for ${entry.slug}`);
        const gltf = await loader.loadAsync(url);
        track(gltf.scene);
        return gltf.scene;
      }

      // A session-wide base cache for the Commons dressing
      // (Terrain Wave B): a parcel's trees clone the ONE decoded
      // base for their species instead of decoding the GLB per
      // parcel. Scatter records are keepShared — teardown never
      // disposes what the cache owns. A failed load evicts
      // itself so a later parcel can retry honestly.
      const modelBaseCache = new Map();
      function loadModelCached(entry) {
        if (!modelBaseCache.has(entry.slug)) {
          modelBaseCache.set(entry.slug, loadModel(entry).catch((err) => {
            modelBaseCache.delete(entry.slug);
            throw err;
          }));
        }
        return modelBaseCache.get(entry.slug);
      }

      // The dressing's procedural assets, shared by every
      // scatter unit for the session (keepShared bookkeeping):
      // rock geometry by size class, the crater bowl, rim stones.
      const rockScatterMat = new THREE.MeshStandardMaterial({ color: 0x8d8578, roughness: 1 });
      const craterBowlMat = new THREE.MeshStandardMaterial({ color: 0x4a3b2c, roughness: 1 });
      const craterBowlGeo = new THREE.CircleGeometry(1, 20);
      const rimStoneGeo = new THREE.IcosahedronGeometry(0.42, 0);
      const rockGeoCache = new Map();
      function rockGeoFor(r) {
        const k = Math.max(1, Math.round(r * 4));
        if (!rockGeoCache.has(k)) rockGeoCache.set(k, new THREE.IcosahedronGeometry(k / 4, 0));
        return rockGeoCache.get(k);
      }

      function bonesOf(modelScene) {
        const bones = new Map();
        modelScene.traverse((o) => {
          if (o.isBone) bones.set(normalizeJointName(o.name), o);
        });
        return bones;
      }

      function makeLabel(text, obj, h, maxDist = 140, owner = null, kind = null) {
        const el = document.createElement('div');
        el.textContent = text;
        el.className = 'pointer-events-none absolute left-0 top-0 whitespace-nowrap rounded-full border border-black/25 bg-black/45 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-white/90';
        el.style.willChange = 'transform';
        el.style.display = 'none';
        labelsRef.current && labelsRef.current.appendChild(el);
        labels.push({ el, obj, h, maxDist, owner, kind });
      }

      function resolveRoles(modelScene) {
        const bones = bonesOf(modelScene);
        const roles = resolveBones([...bones.keys()]);
        const roleBone = (name) => (name ? bones.get(normalizeJointName(name)) || null : null);
        const flyerWings = resolveFlyerWings([...bones.keys()]);
        const wingSource = flyerWings.length ? flyerWings : roles.wings;
        return {
          dialect: roles.dialect,
          spine: roles.spine.map(roleBone).filter(Boolean),
          neck: roles.neck.map(roleBone).filter(Boolean),
          head: roleBone(roles.head),
          tail: roles.tail.map(roleBone).filter(Boolean),
          legs: roles.legs.map((l) => ({
            side: l.side, pair: l.pair,
            thigh: roleBone(l.thigh), calf: roleBone(l.calf), foot: roleBone(l.foot),
          })).filter((l) => l.thigh),
          wings: wingSource.map((w) => ({ side: w.side, chain: w.chain.map(roleBone).filter(Boolean) })).filter((w) => w.chain.length),
        };
      }

      function bindQuats(resolved) {
        const bind = new Map();
        for (const b of [...resolved.spine, ...resolved.neck, ...(resolved.head ? [resolved.head] : []), ...resolved.tail,
          ...resolved.legs.flatMap((l) => [l.thigh, l.calf, l.foot]),
          ...resolved.wings.flatMap((w) => w.chain)]) {
          if (b && !bind.has(b.uuid)) bind.set(b.uuid, b.quaternion.clone());
        }
        return bind;
      }

      function measureFacing(modelScene, resolved) {
        const holder = new THREE.Group();
        holder.add(modelScene);
        holder.updateMatrixWorld(true);
        const headBone = resolved.head;
        const pelvisBone = resolved.spine[0] || null;
        if (headBone && pelvisBone) {
          const hp = headBone.getWorldPosition(new THREE.Vector3());
          const pp = pelvisBone.getWorldPosition(new THREE.Vector3());
          const fx = hp.x - pp.x, fz = hp.z - pp.z;
          if (Math.hypot(fx, fz) > 1e-4) return -Math.atan2(fx, fz);
        }
        return 0;
      }

      function boneByName(bonesMap, name) {
        return name ? bonesMap.get(normalizeJointName(name)) || null : null;
      }
      const bendQ = new THREE.Quaternion();
      const BEND_X = new THREE.Vector3(1, 0, 0);
      const BEND_Y = new THREE.Vector3(0, 1, 0);
      function bendBoneTo(bone, bindQuat, axis, angle) {
        if (!bone || !bindQuat) return;
        bendQ.setFromAxisAngle(axis, angle);
        bone.quaternion.copy(bindQuat).multiply(bendQ);
      }

      function batWingsOf(modelScene) {
        const bones = bonesOf(modelScene);
        return resolveBatWings([...bones.keys()])
          .map((w) => ({
            sign: w.sign,
            bones: w.chain
              .map((n) => boneByName(bones, n))
              .filter(Boolean)
              .map((bone) => ({ bone, bind: bone.quaternion.clone() })),
          }))
          .filter((w) => w.bones.length);
      }

      function flapWings(wings, t, rate, amp = 0.55) {
        if (!wings || !wings.length) return;
        const f = Math.sin(t * rate) * amp;
        for (const w of wings) {
          w.bones.forEach((b, i) => bendBoneTo(b.bone, b.bind, BEND_X, f * w.sign * (i === 0 ? 1 : 0.5)));
        }
      }

      function glowSprite(inner, outer) {
        const c = document.createElement('canvas'); c.width = 128; c.height = 128;
        const g = c.getContext('2d');
        const grad = g.createRadialGradient(64, 64, 2, 64, 64, 64);
        grad.addColorStop(0, inner); grad.addColorStop(1, outer);
        g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
        const tex = new THREE.CanvasTexture(c);
        const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
        track(spr);
        return spr;
      }

      // ── Placement: landforms & plants (the set) ──────────────
      // Every placement function returns a stream record
      // ({ roots }) on success or null on failure: the roots are
      // the top-level objects it added to the scene, which is
      // what a release removes and disposes.
      async function placeLandform(entry, rec, owner) {
        setStatusFor(entry.slug, 'loading');
        const added = [];
        try {
          const modelScene = await loadModel(entry);
          const holder = normalize(modelScene, entry);
          const root = new THREE.Group();
          root.add(holder);
          let gy = heightAt(rec.x, rec.z);
          // Ground-span seating (opt-in, Merlin's ground law,
          // 2026-10-23 — "notice how the airfield is raised"): a
          // wide building seated by its CENTRE floats at its
          // downhill edge on any slope. With a span, the seat is
          // the LOWEST ground sampled under the footprint, so
          // the slab meets the earth everywhere — the high side
          // beds in, the low side never hovers.
          if (rec.groundSpan) {
            const r = rec.groundSpan;
            for (let k = 0; k < 8; k++) {
              const a = (k / 8) * Math.PI * 2;
              gy = Math.min(gy,
                heightAt(rec.x + Math.cos(a) * r, rec.z + Math.sin(a) * r),
                heightAt(rec.x + Math.cos(a) * r * 0.55, rec.z + Math.sin(a) * r * 0.55));
            }
          }
          root.position.set(rec.x, gy - (rec.sink || 0), rec.z);
          root.rotation.y = rec.heading || 0;
          scene.add(root);
          added.push(root);
          if (entry.slug === 'active-volcano') {
            const light = new THREE.PointLight(0xff6a22, 900, 90, 1.8);
            light.position.set(rec.x, gy + entry.scaleM * 0.94, rec.z);
            scene.add(light);
            added.push(light);
            const c = document.createElement('canvas'); c.width = 128; c.height = 128;
            const g = c.getContext('2d');
            const grad = g.createRadialGradient(64, 64, 2, 64, 64, 64);
            grad.addColorStop(0, 'rgba(255,150,50,0.85)'); grad.addColorStop(0.4, 'rgba(255,90,20,0.35)'); grad.addColorStop(1, 'rgba(255,60,10,0)');
            g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
            const tex = new THREE.CanvasTexture(c);
            const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
            spr.scale.setScalar(16);
            spr.position.set(rec.x, gy + entry.scaleM * 0.97, rec.z);
            scene.add(spr);
            track(spr);
            added.push(spr);
          }
          if (rec.extras) {
            for (const e of rec.extras) {
              const cloneRoot = new THREE.Group();
              cloneRoot.copy(root, true);
              cloneRoot.position.set(e.x, heightAt(e.x, e.z), e.z);
              cloneRoot.scale.setScalar(e.scale);
              scene.add(cloneRoot);
              added.push(cloneRoot);
            }
          }
          makeLabel(entry.name, root, entry.scaleM * 0.8 + 2, 320, owner);
          setStatusFor(entry.slug, 'placed');
          return { roots: added };
        } catch (err) {
          setStatusFor(entry.slug, 'failed');
          return null;
        }
      }

      async function placePlantSpecies(entry, instances, owner) {
        setStatusFor(entry.slug, 'loading');
        const added = [];
        try {
          const modelScene = await loadModel(entry);
          instances.forEach((rec, i) => {
            const inst = i === 0 ? modelScene : modelScene.clone();
            const holder = normalize(inst, entry);
            const root = new THREE.Group();
            root.add(holder);
            root.position.set(rec.x, heightAt(rec.x, rec.z) - 0.1, rec.z);
            root.rotation.y = rec.heading;
            root.scale.setScalar(rec.scale);
            scene.add(root);
            added.push(root);
            sway.push({ obj: root, phase: rng() * 6.28, amp: entry.scaleM > 4 ? 0.016 : 0.03, x: rec.x, z: rec.z, owner });
          });
          setStatusFor(entry.slug, 'placed');
          return { roots: added };
        } catch (err) {
          setStatusFor(entry.slug, 'failed');
          return null;
        }
      }

      // ── Placement: land creatures (herds, packs, stalkers) ───
      // One load per species; herd copies are clones of the
      // foundry model, exactly as the compy swarm and the bat
      // swarm clone theirs.
      async function placeLandSpecies(entry, recs, owner) {
        setStatusFor(entry.slug, 'loading');
        const added = [];
        try {
          const baseScene = await loadModel(entry);
          for (let i = 0; i < recs.length; i++) {
            const rec = recs[i];
            const modelScene = i === 0 ? baseScene : SkeletonUtils.clone(baseScene);
            const resolved = resolveRoles(modelScene);
            const facingYaw = measureFacing(modelScene, resolved);
            const spin = normalize(modelScene, entry);
            spin.rotation.y = facingYaw;
            const root = new THREE.Group();
            root.add(spin);
            root.position.set(rec.x, heightAt(rec.x, rec.z), rec.z);
            root.rotation.y = rec.heading;
            scene.add(root);
            added.push(root);
            const behCaps = behaviourCaps(entry);
            const animalId = `${entry.slug}#${rec.copy != null ? rec.copy : i}`;
            lifecycle.register(animalId, entry.slug);
            animals.push({
              entry, root, roles: resolved, bind: bindQuats(resolved),
              phase: rng() * Math.PI * 2,
              breathRate: 0.75 + rng() * 0.35,
              tempo: 1,
              walker: rec.walk ? { ...rec.walk, theta: rec.walk.a0 } : null,
              flyer: false, dist: 0, owner,
              // The behaviour machine (lib/earth2/behaviour.js):
              // this creature is always DOING something — grazing,
              // digging, drinking, sleeping, hunting — with a
              // seeded life of its own. `creature: true` is the
              // mark pickPreyTarget hunts by; the walker carries
              // no such mark and can never be prey.
              id: animalId,
              creature: true,
              caps: behCaps,
              beh: createBehaviour(seedFor(entry.slug, rec.copy != null ? rec.copy : i), entry),
              home: { x: rec.x, z: rec.z },
              behDist: 0,
              alive: true,
              state: 'alive',
              carcass: null,
              deathPos: null,
              huntTarget: null,
              chase: null,
              chaseT: 0,
              fleeFrom: null,
              fleePoint: null,
              fleeT: 0,
              drinkPoint: undefined,
            });
            if (i === 0) makeLabel(entry.name, root, entry.scaleM * 0.72 + 1.2, 140, owner);
          }
          setStatusFor(entry.slug, 'placed');
          return { roots: added };
        } catch (err) {
          setStatusFor(entry.slug, 'failed');
          return null;
        }
      }

      // ── Placement: flyers ────────────────────────────────────
      async function placeFlyer(entry, rec, owner) {
        setStatusFor(entry.slug, 'loading');
        try {
          const modelScene = await loadModel(entry);
          const resolved = resolveRoles(modelScene);
          const facingYaw = measureFacing(modelScene, resolved);
          const spin = normalize(modelScene, entry);
          spin.rotation.y = facingYaw;
          const root = new THREE.Group();
          root.add(spin);
          root.position.set(rec.cx + rec.r, rec.h, rec.cz);
          scene.add(root);
          animals.push({
            entry, root, roles: resolved, bind: bindQuats(resolved),
            phase: rng() * Math.PI * 2,
            breathRate: 0.75 + rng() * 0.35,
            tempo: 1,
            walker: null, flyer: true, dist: 0, owner,
            fly: { ...rec, a: rng() * 6.28 },
            glideOff: rng(),
            // Flyers roost at night (0 = on the wing, 1 = settled
            // at the circuit's centre) — driven by env.night.
            roostF: 0,
          });
          makeLabel(entry.name, root, entry.scaleM * 0.5 + 1.5, 260, owner);
          setStatusFor(entry.slug, 'placed');
          return { roots: [root] };
        } catch (err) {
          setStatusFor(entry.slug, 'failed');
          return null;
        }
      }

      // ── Placement: swimmers (the sea's cast) ─────────────────
      async function placeSwimmer(entry, rec, owner) {
        setStatusFor(entry.slug, 'loading');
        try {
          const modelScene = await loadModel(entry);
          const jointNames = [];
          const jointParents = [];
          modelScene.traverse((o) => {
            if (!o.isBone) return;
            jointNames.push(o.name);
            let p = o.parent;
            while (p && !p.isBone) p = p.parent;
            jointParents.push(p ? p.name : null);
          });
          const bones = bonesOf(modelScene);
          const rig = resolveSwimRig(jointNames, jointParents);
          const boneFor = (name) => (name ? bones.get(normalizeJointName(name)) || null : null);
          const axial = rig.axial.map(boneFor).filter(Boolean);
          const flippers = rig.flippers
            .map((f) => ({ pair: f.pair, side: f.side, chain: f.chain.map(boneFor).filter(Boolean) }))
            .filter((f) => f.chain.length);
          const extras = rig.extras
            .map((ch) => ch.map(boneFor).filter(Boolean))
            .filter((ch) => ch.length);
          const bind = new Map();
          for (const b of [...axial, ...flippers.flatMap((f) => f.chain), ...extras.flat()]) {
            if (b && !bind.has(b.uuid)) bind.set(b.uuid, b.quaternion.clone());
          }
          const facingYaw = measureFacing(modelScene, {
            head: boneFor(rig.head),
            spine: axial.length ? [axial[axial.length - 1]] : [],
          });
          const spin = normalize(modelScene, entry);
          spin.rotation.y = facingYaw;
          const root = new THREE.Group();
          root.add(spin);
          const theta0 = rng() * Math.PI * 2;
          root.position.set(rec.cx + Math.cos(theta0) * rec.rx, rec.deep, rec.cz + Math.sin(theta0) * rec.rz);
          scene.add(root);
          swimmers.push({
            entry, root, profile: rec, axial, flippers, extras, bind,
            theta: theta0,
            phase: rng() * Math.PI * 2,
            phaseOff: rng(),
            y: rec.deep, owner,
          });
          makeLabel(entry.name, root, entry.scaleM * 0.3 + 2.4, 300, owner);
          setStatusFor(entry.slug, 'placed');
          return { roots: [root] };
        } catch (err) {
          setStatusFor(entry.slug, 'failed');
          return null;
        }
      }

      // ── The population is NOT built here any more ───────────
      // It streams by proximity around the walker (the manager
      // below the input section drives the placement functions
      // from the plan in lib/earth2/streaming.js). Only the
      // Transylvania state — cheap objects, no models — is set
      // up eagerly, because the frame loop reads it every tick.

      // ── Transylvania & the blood-sac loop, at planet scale ───
      const court = draculaCourt();
      const CASTLE_AT = [court.castle.x, court.castle.z];
      const CASTLE_BASE_Y = heightAt(CASTLE_AT[0], CASTLE_AT[1]);
      const DRACULA_SPOT = new THREE.Vector3(court.spot.x, court.spot.y, court.spot.z);
      // The museum site (lib/earth2/museum.js): its parcel centre
      // seats the building; Hammond's stand point seats the man.
      // Both arrive only through the 'museum' stream unit.
      const MUSEUM_CENTER = parcelCenterWorld(museumSiteParcel());
      const hammondNpc = { group: null, rig: null };
      let museumStanding = false;
      // The fleet (Vehicles Phase 1): resident vehicle records
      // { slug, spec, root, proxy, legs, phase, owner }, seated
      // from the device state map and posed from it every frame;
      // the airfield's standing flag seats its collider, like the
      // museum's.
      const vehicles = [];
      // Vehicles Phase 2: the floating integrity bars ride the
      // label layer (one small DOM bar per resident machine,
      // shown only while she's hurt), and the drive feel keeps
      // two scene clocks — the camera shake's amplitude and the
      // low-integrity warning's cadence.
      const vehicleBars = []; // { el, fill, rec, owner, h, lastPct, flashUntil, outline }
      let shakeAmp = 0;
      let warnTickAt = 0;
      let airportStanding = false;
      const COMPY_CENTER = compySwarmCenter();
      const mosquitos = [];
      const sacs = []; // { group, core, baseY }
      const bursts = []; // { points, vels, life }
      const swarmBats = [];
      const drac = {
        machine: createDraculaMachine(),
        countForm: null, batForm: null, batWings: null,
        countRig: null,
        smoke: null, batAngle: 0, returnFrom: new THREE.Vector3(),
      };
      let dracBatBase = null;
      const tmpMove = new THREE.Vector3();
      const tmpTarget = new THREE.Vector3();
      const anchorV = new THREE.Vector3();

      async function placeCompySwarm(owner) {
        const source = EARTH2_MODEL_BY_SLUG.get(COMPY_SWARM.sourceSlug);
        if (!source || !source.file) { setStatusFor('compy-swarm', 'failed'); return null; }
        const added = [];
        try {
          const baseScene = await loadModel(source);
          const pseudo = { ...source, scaleM: COMPY_SWARM.bodyLengthM };
          for (let i = 0; i < COMPY_SWARM.count; i++) {
            const modelScene = i === 0 ? baseScene : SkeletonUtils.clone(baseScene);
            const resolved = resolveRoles(modelScene);
            const facingYaw = measureFacing(modelScene, resolved);
            const spin = normalize(modelScene, pseudo);
            spin.rotation.y = facingYaw;
            const root = new THREE.Group();
            root.add(spin);
            const ang = rng() * Math.PI * 2;
            const rad = rng() * COMPY_SWARM.radius;
            root.position.set(
              COMPY_CENTER.x + Math.cos(ang) * rad, 0,
              COMPY_CENTER.z + Math.sin(ang) * rad,
            );
            root.position.y = heightAt(root.position.x, root.position.z);
            root.rotation.y = rng() * Math.PI * 2;
            scene.add(root);
            added.push(root);
            animals.push({
              entry: pseudo, root, roles: resolved, bind: bindQuats(resolved),
              phase: rng() * Math.PI * 2,
              breathRate: 1.5 + rng() * 0.7,
              tempo: COMPY_SWARM.tempo,
              walker: null, flyer: false, dist: 0, owner,
              compy: {
                wx: root.position.x, wz: root.position.z,
                baseSpeed: COMPY_SWARM.baseSpeed * (0.8 + rng() * 0.5),
                scatterT: 0,
              },
            });
          }
          setStatusFor('compy-swarm', 'placed');
          return { roots: added };
        } catch (err) {
          setStatusFor('compy-swarm', 'failed');
          return null;
        }
      }

      const ABDOMEN_FULL = new THREE.Color(0xc01818);
      function applyAbdomen(mq) {
        const f = mq.fedLevel;
        for (const ab of mq.parts.abdomenBones || []) {
          const s = 1 + f * ab.swell;
          ab.bone.scale.set(ab.base.x * s, ab.base.y * s, ab.base.z);
        }
        if (mq.parts.bodyMat && mq.parts.bodyMatBase) {
          mq.parts.bodyMat.color.copy(mq.parts.bodyMatBase).lerp(ABDOMEN_FULL, f * 0.38);
        }
      }

      async function placeMosquitos() {
        const entry = EARTH2_MODEL_BY_SLUG.get('giant-mosquito');
        let baseScene = null;
        if (entry && entry.file) {
          try { baseScene = await loadModel(entry); } catch (err) { baseScene = null; }
        }
        if (!baseScene) { setStatusFor('giant-mosquito', 'failed'); return null; }
        const centers = worldMosquitoCenters();
        for (let i = 0; i < MOSQUITO_CONFIG.count; i++) {
          const modelScene = i === 0 ? baseScene : SkeletonUtils.clone(baseScene);
          let bodyMat = null;
          modelScene.traverse((o) => {
            if (o.isSkinnedMesh) {
              o.material = o.material.clone();
              if (!bodyMat) bodyMat = o.material;
            }
          });
          const bones = bonesOf(modelScene);
          const rig = resolveMosquitoRig([...bones.keys()]);
          const abdomenBones = rig.abdomen
            .map((n) => boneByName(bones, n))
            .filter(Boolean)
            .map((bone, idx, arr) => ({
              bone,
              base: bone.scale.clone(),
              swell: 0.3 + (arr.length > 1 ? (idx / (arr.length - 1)) * 0.45 : 0),
            }));
          const wingRoots = rig.wingRoots
            .map((w) => ({ bone: boneByName(bones, w.name), sign: w.sign }))
            .filter((w) => w.bone)
            .map((w) => ({ ...w, bind: w.bone.quaternion.clone() }));
          const parts = {
            abdomenBones,
            wingRoots,
            bodyMat,
            bodyMatBase: bodyMat && bodyMat.color ? bodyMat.color.clone() : null,
          };
          const group = normalize(modelScene, entry);
          const proxy = new THREE.Mesh(
            new THREE.SphereGeometry(0.85, 8, 8),
            new THREE.MeshBasicMaterial({ visible: false }),
          );
          group.add(proxy);
          scene.add(group);
          const home = centers.length ? centers[i % centers.length] : { cx: 0, cz: 0 };
          // Mosquito deaths route through the lifecycle like
          // every other kill (see landMosquito) — the delay is
          // the blood loop's own respawnSeconds.
          lifecycle.register(`mosquito#${i}`, entry.slug);
          const mq = {
            id: `mosquito#${i}`,
            group, proxy, parts,
            phase: 'cruising',
            a: rng() * Math.PI * 2,
            r: 18 + rng() * 22,
            h: MOSQUITO_CONFIG.cruiseHeight + rng() * 3,
            cx: home.cx + (rng() - 0.5) * 24, cz: home.cz + (rng() - 0.5) * 24,
            speed: MOSQUITO_CONFIG.cruiseSpeed * (0.85 + rng() * 0.3),
            feedT: 0, fedLevel: 0, target: null,
            cruiseT: 0,
            nextFeedIn: MOSQUITO_CONFIG.firstFeedDelay[0]
              + rng() * (MOSQUITO_CONFIG.firstFeedDelay[1] - MOSQUITO_CONFIG.firstFeedDelay[0]),
            vy: 0, goneT: 0, willDropSac: false,
          };
          mq.baseY = heightAt(mq.cx, mq.cz);
          proxy.userData.mosquito = mq;
          group.position.set(
            mq.cx + Math.cos(mq.a) * mq.r, mq.baseY + mq.h,
            mq.cz + Math.sin(mq.a) * mq.r,
          );
          mosquitos.push(mq);
        }
        setStatusFor('giant-mosquito', 'placed');
        return { roots: mosquitos.map((mq) => mq.group) };
      }

      const dracProxy = new THREE.Mesh(
        new THREE.CylinderGeometry(1.2, 1.2, 2.6, 8),
        new THREE.MeshBasicMaterial({ visible: false }),
      );
      dracProxy.position.set(DRACULA_SPOT.x, DRACULA_SPOT.y + 1.2, DRACULA_SPOT.z);
      dracProxy.userData.dracula = true;
      scene.add(dracProxy);

      // Hammond's tap target, the Dracula-proxy pattern: an
      // invisible cylinder at his stand point, live whether or
      // not his model has streamed in (the tap handler checks
      // distance before it opens anything).
      const hammondProxy = new THREE.Mesh(
        new THREE.CylinderGeometry(1.1, 1.1, 2.4, 8),
        new THREE.MeshBasicMaterial({ visible: false }),
      );
      hammondProxy.position.set(HAMMOND_NPC.stand.x, HAMMOND_NPC.stand.y + 1.1, HAMMOND_NPC.stand.z);
      hammondProxy.userData.hammond = true;
      scene.add(hammondProxy);

      async function placeDracula() {
        const added = [];
        const plinth = new THREE.Mesh(
          new THREE.CircleGeometry(2.4, 24),
          new THREE.MeshStandardMaterial({ color: 0x211d2a, roughness: 1 }),
        );
        plinth.rotation.x = -Math.PI / 2;
        plinth.position.set(DRACULA_SPOT.x, DRACULA_SPOT.y - 0.02, DRACULA_SPOT.z);
        scene.add(plinth);
        added.push(plinth);
        const courtLight = new THREE.PointLight(0x8a5adf, 60, 30, 1.8);
        courtLight.position.set(DRACULA_SPOT.x, DRACULA_SPOT.y + 2.6, DRACULA_SPOT.z);
        scene.add(courtLight);
        added.push(courtLight);

        const dEntry = EARTH2_MODEL_BY_SLUG.get('dracula');
        let countGroup = null;
        if (dEntry && dEntry.file) {
          try {
            const modelScene = await loadModel(dEntry);
            const roles = resolveRoles(modelScene);
            drac.countRig = { roles, bind: bindQuats(roles) };
            countGroup = normalize(modelScene, dEntry);
          } catch (err) {
            countGroup = null;
          }
        }
        if (countGroup) {
          countGroup.position.copy(DRACULA_SPOT);
          countGroup.rotation.y = court.facing; // face the world's heart
          scene.add(countGroup);
          added.push(countGroup);
          drac.countForm = countGroup;
          setStatusFor('dracula', 'placed');
        } else {
          setStatusFor('dracula', 'failed');
        }

        const bEntry = EARTH2_MODEL_BY_SLUG.get('vampire-bat');
        if (bEntry && bEntry.file) {
          try { dracBatBase = await loadModel(bEntry); } catch (err) { dracBatBase = null; }
        }
        if (dracBatBase) {
          const batScene = SkeletonUtils.clone(dracBatBase);
          const batGroup = normalize(batScene, bEntry);
          drac.batWings = batWingsOf(batScene);
          batGroup.position.set(DRACULA_SPOT.x, DRACULA_SPOT.y + 1.2, DRACULA_SPOT.z);
          batGroup.visible = false;
          scene.add(batGroup);
          added.push(batGroup);
          drac.batForm = batGroup;
          setStatusFor('vampire-bat', 'placed');
        } else {
          setStatusFor('vampire-bat', 'failed');
        }

        const N = 70;
        const positions = new Float32Array(N * 3);
        for (let i = 0; i < N; i++) {
          const th = rng() * Math.PI * 2;
          const ph = Math.acos(2 * rng() - 1);
          const rr = 0.25 + rng() * 0.55;
          positions[i * 3] = Math.sin(ph) * Math.cos(th) * rr;
          positions[i * 3 + 1] = Math.abs(Math.cos(ph)) * rr * 1.6;
          positions[i * 3 + 2] = Math.sin(ph) * Math.sin(th) * rr;
        }
        const smokeGeo = new THREE.BufferGeometry();
        smokeGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        const smokeMat = new THREE.PointsMaterial({
          color: 0x352c3d, size: 0.34, transparent: true, opacity: 0, depthWrite: false,
        });
        const smoke = new THREE.Points(smokeGeo, smokeMat);
        smoke.position.set(DRACULA_SPOT.x, DRACULA_SPOT.y + 0.2, DRACULA_SPOT.z);
        scene.add(smoke);
        track(smoke);
        added.push(smoke);
        drac.smoke = smoke;
        return { roots: added };
      }

      async function placeBatSwarm() {
        const entry = EARTH2_MODEL_BY_SLUG.get(BAT_SWARM.sourceSlug);
        if (!dracBatBase || !entry) return { roots: [] };
        const added = [];
        for (let i = 0; i < BAT_SWARM.count; i++) {
          const modelScene = SkeletonUtils.clone(dracBatBase);
          const group = normalize(modelScene, entry);
          scene.add(group);
          added.push(group);
          swarmBats.push({
            group,
            wings: batWingsOf(modelScene),
            a: rng() * Math.PI * 2,
            r: BAT_SWARM.radius[0] + rng() * (BAT_SWARM.radius[1] - BAT_SWARM.radius[0]),
            h: BAT_SWARM.height[0] + rng() * (BAT_SWARM.height[1] - BAT_SWARM.height[0]),
            speed: BAT_SWARM.speed[0] + rng() * (BAT_SWARM.speed[1] - BAT_SWARM.speed[0]),
            ph: rng() * Math.PI * 2,
          });
        }
        return { roots: added };
      }

      // ── The museum mount: the Royal Tyrrell Museum on its ────
      // site parcel + John Hammond at his stand point (Phase 2,
      // 2026-10-23). The building rides placeLandform (normalize,
      // ground, label, status); Hammond rides the Dracula pattern
      // — normalize, seat, idle rig — with one measured twist:
      // his forward, read off the real GLB (head leaning +X of
      // the hips, the shoulder line along Z), is his local +X, so
      // a −90° spin puts his front on the group's +Z before the
      // group itself turns. He faces +z (south): the entrance
      // approach and the parking apron, per lib/earth2/museum.js's
      // stated intent — its documented heading (π) reads as north
      // under the world's (sin, cos) facing convention, so the
      // mount turns him to greet arrivals instead; the on-device
      // look is the verdict, as with every rig here.
      async function placeMuseum(unit) {
        const added = [];
        const mEntry = EARTH2_MODEL_BY_SLUG.get('museum');
        if (mEntry && mEntry.file) {
          const r = await placeLandform(mEntry, {
            x: MUSEUM_CENTER.x, z: MUSEUM_CENTER.z, heading: 0, sink: 0.3,
            groundSpan: mEntry.scaleM * 0.46,
          }, unit.key);
          if (r) {
            added.push(...r.roots);
            museumStanding = true;
          }
        }
        const hEntry = EARTH2_MODEL_BY_SLUG.get('hammond');
        let hGroup = null;
        if (hEntry && hEntry.file) {
          setStatusFor('hammond', 'loading');
          try {
            const modelScene = await loadModel(hEntry);
            const roles = resolveRoles(modelScene);
            hammondNpc.rig = { roles, bind: bindQuats(roles) };
            const spin = normalize(modelScene, hEntry);
            spin.rotation.y = -Math.PI / 2; // measured forward (+X) → group +Z
            hGroup = new THREE.Group();
            hGroup.add(spin);
          } catch (err) {
            hGroup = null;
          }
        }
        if (hGroup) {
          hGroup.position.set(HAMMOND_NPC.stand.x, HAMMOND_NPC.stand.y, HAMMOND_NPC.stand.z);
          hGroup.rotation.y = 0; // faces +z — the entrance approach
          scene.add(hGroup);
          added.push(hGroup);
          hammondNpc.group = hGroup;
          makeLabel('John Hammond', hGroup, 2.15, 140, unit.key);
          setStatusFor('hammond', 'placed');
        } else if (hEntry && hEntry.file) {
          setStatusFor('hammond', 'failed');
        }
        return added.length ? { roots: added } : null;
      }

      // ── Tyrrell Field: the terminal on its grounds ─────────
      // (Vehicles Phase 1). The building rides placeLandform
      // like the museum — normalize, ground, label, status —
      // seated at the field's centre with its face east
      // (AIRPORT_HEADING, lib/earth2/airport.js; the on-device
      // look is the verdict, as with every mount here).
      async function placeAirport(unit) {
        const added = [];
        const aEntry = EARTH2_MODEL_BY_SLUG.get('airport');
        if (aEntry && aEntry.file) {
          const r = await placeLandform(aEntry, {
            x: AIRPORT_CENTER.x, z: AIRPORT_CENTER.z, heading: AIRPORT_HEADING, sink: 0.4,
            groundSpan: aEntry.scaleM * 0.46,
          }, unit.key);
          if (r) {
            added.push(...r.roots);
            airportStanding = true;
          }
        }
        return added.length ? { roots: added } : null;
      }

      // ── The fleet's mounts ─────────────────────────────────
      // Each machine: normalize, spin its measured forward onto
      // the group's +Z (VEHICLE_SPECS' spin — rover −X, bike
      // −Z, scarab +X, VTOL native), seat from its device state.
      // Articulation, honestly (the rigs were read joint by
      // joint — lib/earth2/bones.js carries the full account):
      // the scarab's seven leg chains resolve by tree structure
      // and sway as it walks; the rover's quadruped-template rig
      // has no wheel-hub bones and the bike's humanoid rig no
      // wheel bones, so both articulate whole-body only —
      // terrain pitch/roll from the step law, the bike with a
      // speed tremble; the VTOL is one unrigged mesh, whole-
      // craft tilt and hover-bob.
      async function placeVehicle(unit) {
        const entry = EARTH2_MODEL_BY_SLUG.get(unit.slug);
        const spec = modelSpec(unit.slug);
        if (!entry || !entry.file || !spec) return null;
        // The foundry status belongs to the MODEL and is carried
        // by its first instance (the unit's own slug claim, set
        // by vehicleStreamUnits); the other instances of the
        // same model claim nothing.
        const drivesStatus = (unit.slugs || []).includes(unit.slug);
        if (drivesStatus) setStatusFor(entry.slug, 'loading');
        try {
          const modelScene = await loadModel(entry);
          let legs = [];
          if (unit.slug === 'scarab') {
            const jointNames = [];
            const jointParents = [];
            modelScene.traverse((o) => {
              if (!o.isBone) return;
              jointNames.push(o.name);
              let bp = o.parent;
              while (bp && !bp.isBone) bp = bp.parent;
              jointParents.push(bp ? bp.name : null);
            });
            const bones = bonesOf(modelScene);
            legs = resolveScarabLegs(jointNames, jointParents)
              .map((l) => ({
                root: boneByName(bones, l.chain[0]),
                bind: null, off: 0,
              }))
              .filter((l) => l.root);
            for (const l of legs) l.bind = l.root.quaternion.clone();
          }
          const spin = normalize(modelScene, entry);
          spin.rotation.y = spec.spin;
          const root = new THREE.Group();
          root.rotation.order = 'YXZ';
          root.add(spin);
          const st = vehicleStatesRef.current[unit.instanceId] || unit.state;
          root.position.set(
            st.x,
            spec.water ? WATER_Y - spec.draft : heightAt(st.x, st.z) + (st.alt || 0),
            st.z,
          );
          root.rotation.y = st.heading || 0;
          scene.add(root);
          // The River Runner's wake: a simple speed-read plane
          // astern, owned by this boat's own record (three boats
          // planet-wide — per-boat geometry is honest bookkeeping).
          let wake = null;
          if (spec.water) {
            wake = new THREE.Mesh(
              new THREE.PlaneGeometry(3.6, 8),
              new THREE.MeshBasicMaterial({
                color: 0xdff4ff, transparent: true, opacity: 0, depthWrite: false,
              }),
            );
            wake.rotation.x = -Math.PI / 2;
            wake.position.set(0, spec.draft + 0.04, -5.5);
            root.add(wake);
          }
          const proxy = new THREE.Mesh(
            new THREE.SphereGeometry(Math.max(1.7, spec.radius), 8, 8),
            new THREE.MeshBasicMaterial({ visible: false }),
          );
          proxy.position.y = 1;
          proxy.userData.vehicle = unit.instanceId;
          root.add(proxy);
          const rec = {
            slug: unit.slug, key: unit.instanceId, spec, root, proxy, legs, wake,
            phase: rng() * Math.PI * 2, owner: unit.key,
          };
          // Leg gait phases from the bind pose: a leg's offset
          // along/across the body staggers it against its
          // neighbours (tripod-flavoured, small amplitudes).
          if (legs.length) {
            root.updateMatrixWorld(true);
            const fwd = { x: Math.sin(st.heading || 0), z: Math.cos(st.heading || 0) };
            const rgt = { x: -Math.cos(st.heading || 0), z: Math.sin(st.heading || 0) };
            const wp = new THREE.Vector3();
            for (const l of legs) {
              l.root.getWorldPosition(wp);
              const ox = wp.x - root.position.x;
              const oz = wp.z - root.position.z;
              const along = ox * fwd.x + oz * fwd.z;
              const side = ox * rgt.x + oz * rgt.z;
              l.off = (along > 0 ? 0 : Math.PI) + (side > 0 ? Math.PI * 0.5 : 0);
            }
          }
          vehicles.push(rec);
          makeVehicleBar(rec, unit.key);
          const inst = vehicleInstanceById(unit.instanceId);
          makeLabel(inst && inst.label ? inst.label : spec.name, root, spec.eyeHeight + 0.9, 130, unit.key, 'vehicle');
          if (drivesStatus) setStatusFor(entry.slug, 'placed');
          return { roots: [root] };
        } catch (err) {
          if (drivesStatus) setStatusFor(entry.slug, 'failed');
          return null;
        }
      }

      // Pose a resident vehicle from a state: position + slope
      // tilts from the step law's return (or groundPose for a
      // parked machine), plus its articulation — the scarab's
      // legs sway with speed (bind pose at rest), the bike
      // trembles under way, the VTOL bobs in a hover.
      function poseVehicle(rec, st, t, dt) {
        rec.root.position.set(st.x, st.y != null ? st.y : heightAt(st.x, st.z), st.z);
        rec.root.rotation.set(st.pitch || 0, st.heading || 0, st.roll || 0);
        const sp = Math.abs(st.speed || 0);
        if (rec.spec.water) {
          // Afloat: a gentle bob on the waterline, and the wake
          // reads the speed — opacity and length astern.
          rec.root.position.y += Math.sin(t * 1.15 + rec.phase) * 0.05;
          if (rec.wake) {
            const ratio = Math.min(1, sp / rec.spec.maxSpeed);
            rec.wake.material.opacity = 0.26 * ratio;
            rec.wake.scale.set(1, 0.4 + ratio * 1.1, 1);
          }
        } else if (rec.slug === 'scarab' && rec.legs.length) {
          if (sp > 0.05) rec.phase += dt * (1.4 + sp * 1.05);
          const amp = 0.075 * Math.min(1, sp / 4);
          for (const l of rec.legs) {
            bendBoneTo(l.root, l.bind, BEND_X, Math.sin(rec.phase + l.off) * amp);
          }
        } else if (rec.slug === 'speed-bike' && sp > 0.5) {
          rec.root.position.y += Math.sin(t * 43 + rec.phase) * 0.008;
        } else if (rec.slug === 'vtol' && (st.alt || 0) > 0.05) {
          rec.root.position.y += Math.sin(t * 1.7 + rec.phase) * 0.12;
        }
      }

      // ── Board / step out ───────────────────────────────────
      // Boarding is a walk-up act (≤3.5 m prompt, taps forgiving
      // to 8.5 m); the camera starts behind the machine
      // (walker.yaw = heading + π under the world's (−sin,
      // −cos) look convention) and drag-look stays free while
      // driving. Stepping out sets the walker on the machine's
      // right, settled by the walker's own push-out, and the
      // machine stays exactly where it was left — saved.
      function boardVehicle(id) {
        const spec = vehicleSpecForInstance(id);
        const st = vehicleStatesRef.current[id];
        if (!spec || !st || drivingRef.current) return;
        if (buildModeRef.current.active) {
          noticeRef.current('🔨 Finish building first — then drive.');
          return;
        }
        // Phase 2 boarding law: a wreck is scrap until her
        // replacement lands, and a ditched VTOL is sinking —
        // neither takes a helm. (A beached boat still boards:
        // the helm simply won't answer, and E steps ashore.)
        if (st.wrecked) {
          noticeRef.current(`💥 The ${spec.name} is a wreck — a fresh machine replaces her at home shortly.`);
          return;
        }
        if (st.ditched) {
          noticeRef.current('🛩️ She ditched and is taking on water — no flying her out of that.');
          return;
        }
        // Ownership (Merlin, 2026-10-23): boarding CLAIMS the
        // machine for this account — hers from then on, staying
        // where she's left. A machine claimed by another account
        // refuses the helm outright.
        const myKey = claimKeyForUser(buildPropsRef.current && buildPropsRef.current.user);
        let newlyClaimed = false;
        if (isClaimed(st)) {
          if (st.claimedBy !== myKey) {
            noticeRef.current('🔒 Claimed by another driver — this machine is someone\'s personal ride.');
            return;
          }
        } else {
          vehicleStatesRef.current[id] = claimStateFor(st, myKey, Date.now());
          saveVehicleStates(vehicleStatesRef.current);
          newlyClaimed = true;
        }
        const d = Math.hypot(walker.x - st.x, walker.z - st.z);
        if (d > 8.5) {
          const inst = vehicleInstanceById(id);
          noticeRef.current(inst && inst.label
            ? `🚗 The ${inst.label} is parked out in the wilds — walk up to it to ${spec.verb.toLowerCase()} it.`
            : `🛩️ The ${spec.name} waits at Tyrrell Field — walk up to it to ${spec.verb.toLowerCase()} it.`);
          return;
        }
        // Stamp the machine's display height into its state: the
        // drive step's deck gate reads it (a machine boarded on a
        // bridge over deep water starts ON the deck, not under it).
        const deckY = bridgeHeightAt(st.x, st.z);
        const onDeck = deckY != null && waterDepthAt(st.x, st.z) > MAX_WADE_DEPTH_M;
        vehicleStatesRef.current[id] = {
          ...vehicleStatesRef.current[id],
          y: spec.water
            ? WATER_Y - spec.draft
            : spec.air
              ? heightAt(st.x, st.z) + (st.alt || 0)
              : onDeck ? deckY : heightAt(st.x, st.z),
        };
        ensureSfx();
        drivingRef.current = id;
        if (!cancelled) {
          setDriving(id);
          setDriveInfo({ speed: 0, alt: st.alt || 0, integrity: st.integrity ?? 100 });
          setNearVehicle(null);
        }
        nearVehicleRef.current = null;
        setHammondPanel(false);
        walker.yaw = (st.heading || 0) + Math.PI;
        walker.pitch = 0;
        noticeRef.current(newlyClaimed
          ? `🔑 ${spec.name} claimed — she's yours now, and she stays where you leave her.`
          : spec.air
            ? '🛩️ VTOL Scout — W/S throttle, A/D turn, Space climbs, C settles her down. Land her flat before stepping out.'
            : spec.water
              ? '⛵ River Runner — W/S to sail, A/D to steer her. Shallows stop the bow, and bridge piers are solid — take the arch centre. E or Esc to step ashore.'
              : `🚗 ${spec.name} — W/S to move, A/D to steer. E or Esc to step out.`);
      }

      function exitVehicle() {
        const id = drivingRef.current;
        if (!id) return;
        const spec = vehicleSpecForInstance(id);
        const st = vehicleStatesRef.current[id];
        if (spec && spec.air && st && (st.alt || 0) > 0.02) {
          noticeRef.current('🛬 Land the VTOL before stepping out.');
          return;
        }
        if (spec && st) {
          st.speed = 0;
          const cols = currentColliders().slice();
          cols.push({ x: DRACULA_SPOT.x, z: DRACULA_SPOT.z, r: 1.3 });
          if (hammondNpc.group) cols.push({ x: HAMMOND_NPC.stand.x, z: HAMMOND_NPC.stand.z, r: 1.0 });
          if (museumStanding) cols.push({ x: MUSEUM_CENTER.x, z: MUSEUM_CENTER.z - 3.5, r: 9 });
          if (airportStanding) cols.push({ x: AIRPORT_CENTER.x, z: AIRPORT_CENTER.z, r: 13 });
          for (const v of vehicles) {
            const vst = vehicleStatesRef.current[v.key];
            if (vst) cols.push({ x: vst.x, z: vst.z, r: v.spec.radius });
          }
          if (spec.water) {
            // Step ashore: the nearest footing — dry bank
            // preferred, wading shallows accepted; mid-water
            // with no shore in reach refuses (you cannot step
            // out into the deep).
            let dry = null;
            let wade = null;
            for (const r of [6, 10, 14, 20, 30, 45]) {
              for (let s = 0; s < 16; s++) {
                const a = (s / 16) * Math.PI * 2;
                const fx = st.x + Math.cos(a) * r;
                const fz = st.z + Math.sin(a) * r;
                if (!dry && heightAt(fx, fz) > WATER_Y + 0.05) dry = { x: fx, z: fz };
                else if (!wade && waterDepthAt(fx, fz) <= 1.2) wade = { x: fx, z: fz };
              }
              if (dry) break;
            }
            const shore = dry || wade;
            if (!shore) {
              noticeRef.current('🌊 No shore in reach — sail closer to the bank to step out.');
              return;
            }
            const settled = stepWorldWalker(shore, 0, { fwd: 0, strafe: 0 }, 0, cols, false);
            walker.x = settled.x;
            walker.z = settled.z;
            walker.yaw = (st.heading || 0) + Math.PI;
          } else {
            const dOut = spec.radius + 1.3;
            const ex = st.x - Math.cos(st.heading || 0) * dOut;
            const ez = st.z + Math.sin(st.heading || 0) * dOut;
            const settled = stepWorldWalker({ x: ex, z: ez }, 0, { fwd: 0, strafe: 0 }, 0, cols, false);
            walker.x = settled.x;
            walker.z = settled.z;
            walker.yaw = (st.heading || 0) + Math.PI;
          }
        }
        drivingRef.current = null;
        saveVehicleStates(vehicleStatesRef.current);
        if (!cancelled) setDriving(null);
        noticeRef.current(spec && spec.water
          ? '⛵ Stepped ashore — the River Runner rides where you left her.'
          : '🚶 Stepped out — the machine stays where you left it.');
      }
      boardVehicleRef.current = (slug) => boardVehicle(slug);
      exitVehicleRef.current = () => exitVehicle();

      // ── Behaviour: mosquitos feed, sacs drop, Dracula turns ──
      function moveToward(obj, target, speed, dt) {
        const pos = obj.position;
        tmpMove.copy(target).sub(pos);
        const len = tmpMove.length();
        if (len < 1e-4) return true;
        tmpMove.normalize();
        pos.addScaledVector(tmpMove, Math.min(len, speed * dt));
        obj.rotation.y = Math.atan2(tmpMove.x, tmpMove.z);
        return len <= speed * dt + 0.05;
      }

      function hostAnchor(animal, out) {
        out.copy(animal.root.position);
        out.y = animal.root.position.y + Math.max(0.7, animal.entry.scaleM * 0.5);
        return out;
      }

      function spawnBurst(at, colorHex) {
        const N = 26;
        const positions = new Float32Array(N * 3);
        const vels = [];
        for (let i = 0; i < N; i++) {
          positions[i * 3] = at.x; positions[i * 3 + 1] = at.y; positions[i * 3 + 2] = at.z;
          const th = rng() * Math.PI * 2;
          const ph = Math.acos(2 * rng() - 1);
          const sp = 1.5 + rng() * 2.5;
          vels.push([Math.sin(ph) * Math.cos(th) * sp, Math.cos(ph) * sp + 0.8, Math.sin(ph) * Math.sin(th) * sp]);
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        const mat = new THREE.PointsMaterial({ color: colorHex, size: 0.22, transparent: true, opacity: 1, depthWrite: false });
        const points = new THREE.Points(geo, mat);
        scene.add(points);
        track(points);
        bursts.push({ points, vels, life: 0 });
      }

      // ── Vehicles Phase 2: explosion FX, integrity bars, the
      // shot path, and the driven machine's damage feedback ────
      // One pooled burst rig serves every explosion and every
      // respawn shimmer: four slots built once, reused forever —
      // fireball sprite, gold glow, three smoke sprites, a debris
      // Points cloud, a shockwave ring, and ONE point light the
      // slots share. Nothing allocates per frame; an explosion
      // just re-arms a slot. The law decides WHEN (a wreck whose
      // last bill is not a submersion — Phase A's applyDamage
      // stamps exploded on every wreck, sinkings included, so
      // the scene reads the bill's kind: kind 'submersion' sinks
      // quiet, everything else burns); this rig only plays it.
      const FX_SLOTS = 4;
      let fxPool = null; // { slots: [...], light, next }
      function radialTexture(stops) {
        const c = document.createElement('canvas');
        c.width = 128; c.height = 128;
        const ctx = c.getContext('2d');
        const g = ctx.createRadialGradient(64, 64, 2, 64, 64, 64);
        for (const [o, col] of stops) g.addColorStop(o, col);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, 128, 128);
        const tex = new THREE.CanvasTexture(c);
        tex.colorSpace = THREE.SRGBColorSpace;
        return tex;
      }
      function ensureFx() {
        if (fxPool) return fxPool;
        try {
          const fireTex = radialTexture([[0, 'rgba(255,246,200,1)'], [0.35, 'rgba(255,166,48,0.85)'], [0.7, 'rgba(226,72,20,0.35)'], [1, 'rgba(120,20,0,0)']]);
          const goldTex = radialTexture([[0, 'rgba(255,240,190,0.95)'], [0.5, 'rgba(255,205,90,0.45)'], [1, 'rgba(255,180,60,0)']]);
          const smokeTex = radialTexture([[0, 'rgba(88,84,80,0.55)'], [0.6, 'rgba(70,66,62,0.32)'], [1, 'rgba(60,56,52,0)']]);
          const slots = [];
          for (let i = 0; i < FX_SLOTS; i++) {
            const group = new THREE.Group();
            group.visible = false;
            const fire = new THREE.Sprite(new THREE.SpriteMaterial({ map: fireTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
            const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: goldTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
            group.add(glow);
            group.add(fire);
            const smokes = [];
            for (let s = 0; s < 3; s++) {
              const sm = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, depthWrite: false, transparent: true }));
              smokes.push(sm);
              group.add(sm);
            }
            const dGeo = new THREE.BufferGeometry();
            dGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(30 * 3), 3));
            const debris = new THREE.Points(dGeo, new THREE.PointsMaterial({ color: 0x2e2a26, size: 0.34, transparent: true, depthWrite: false }));
            group.add(debris);
            const ring = new THREE.Mesh(
              new THREE.RingGeometry(0.86, 1, 48),
              new THREE.MeshBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }),
            );
            ring.rotation.x = -Math.PI / 2;
            group.add(ring);
            scene.add(group);
            slots.push({
              group, fire, glow, smokes, debris, ring,
              debrisVel: new Float32Array(30 * 3),
              age: 99, mode: 'boom', baseScale: 6,
            });
          }
          const light = new THREE.PointLight(0xffa050, 0, 90, 1.6);
          scene.add(light);
          fxPool = { slots, light, next: 0, lightAge: 99 };
        } catch { fxPool = null; }
        return fxPool;
      }
      function fireExplosion(x, y, z, distToWalker) {
        const fx = ensureFx();
        const d = Math.max(0, distToWalker || 0);
        sfxExplosion(d);
        if (d < 90) vibrateFor({ kind: 'explosion' });
        shakeAmp = Math.min(1, shakeAmp + Math.max(0.12, Math.min(1, 15 / (d + 5))));
        if (!fx) return;
        const s = fx.slots[fx.next];
        fx.next = (fx.next + 1) % fx.slots.length;
        s.mode = 'boom';
        s.age = 0;
        s.baseScale = 5 + rng() * 3;
        s.group.position.set(x, y, z);
        s.group.visible = true;
        s.fire.material.color.setHex(0xffffff);
        s.fire.material.opacity = 1;
        s.glow.material.color.setHex(0xffffff);
        s.ring.material.color.setHex(0xffd9a0);
        for (let i = 0; i < s.smokes.length; i++) {
          s.smokes[i].position.set((rng() - 0.5) * 2.4, 0.4 + i * 0.5, (rng() - 0.5) * 2.4);
          s.smokes[i].material.opacity = 0.5;
        }
        const attr = s.debris.geometry.attributes.position;
        for (let i = 0; i < 30; i++) {
          attr.array[i * 3] = 0; attr.array[i * 3 + 1] = 0; attr.array[i * 3 + 2] = 0;
          const th = rng() * Math.PI * 2;
          const sp = 3 + rng() * 8;
          s.debrisVel[i * 3] = Math.cos(th) * sp;
          s.debrisVel[i * 3 + 1] = 4 + rng() * 8;
          s.debrisVel[i * 3 + 2] = Math.sin(th) * sp;
        }
        attr.needsUpdate = true;
        s.debris.material.opacity = 1;
        s.ring.position.y = -y + heightAt(x, z) + 0.25;
        s.ring.material.opacity = 0.75;
        fx.light.position.set(x, y + 1.5, z);
        fx.light.color.setHex(0xffa050);
        fx.light.intensity = 220;
        fx.lightAge = 0;
      }
      // The replacement's arrival: a gold ring and a soft glow —
      // a shimmer, never a pop.
      function fireShimmer(x, y, z) {
        const fx = ensureFx();
        sfxShimmer();
        if (!fx) return;
        const s = fx.slots[fx.next];
        fx.next = (fx.next + 1) % fx.slots.length;
        s.mode = 'shimmer';
        s.age = 0;
        s.baseScale = 4;
        s.group.position.set(x, y, z);
        s.group.visible = true;
        s.fire.material.opacity = 0;
        s.glow.material.color.setHex(0xffe9a8);
        for (const sm of s.smokes) sm.material.opacity = 0;
        s.debris.material.opacity = 0;
        s.ring.material.color.setHex(0xffe9a8);
        s.ring.position.y = -y + heightAt(x, z) + 0.25;
        s.ring.material.opacity = 0.6;
        fx.light.position.set(x, y + 1, z);
        fx.light.color.setHex(0xffd777);
        fx.light.intensity = 60;
        fx.lightAge = 0;
      }
      function updateExplosions(dt) {
        const fx = fxPool;
        if (!fx) return;
        if (fx.lightAge < 0.6) {
          fx.lightAge += dt;
          fx.light.intensity *= Math.exp(-7 * dt);
          if (fx.lightAge >= 0.6) fx.light.intensity = 0;
        }
        for (const s of fx.slots) {
          if (s.age > 3 || !s.group.visible) continue;
          s.age += dt;
          if (s.mode === 'boom') {
            const ft = Math.min(1, s.age / 0.55);
            const fs = s.baseScale * (0.35 + ft * 1.15);
            s.fire.scale.set(fs, fs, 1);
            s.fire.material.opacity = Math.max(0, 1 - ft);
            s.fire.position.y = ft * 0.8;
            const gt = Math.min(1, s.age / 0.8);
            const gs = s.baseScale * (0.8 + gt * 1.6);
            s.glow.scale.set(gs, gs, 1);
            s.glow.material.opacity = Math.max(0, 0.85 * (1 - gt));
            for (let i = 0; i < s.smokes.length; i++) {
              const sm = s.smokes[i];
              const st2 = Math.min(1, s.age / 2.8);
              const ss = 3 + st2 * 9 + i * 1.5;
              sm.scale.set(ss, ss, 1);
              sm.position.y = 0.4 + i * 0.5 + s.age * (1.1 + i * 0.35);
              sm.material.opacity = Math.max(0, 0.5 * (1 - st2));
            }
            if (s.age < 1.1) {
              const attr = s.debris.geometry.attributes.position;
              for (let i = 0; i < 30; i++) {
                s.debrisVel[i * 3 + 1] -= 11 * dt;
                attr.array[i * 3] += s.debrisVel[i * 3] * dt;
                attr.array[i * 3 + 1] += s.debrisVel[i * 3 + 1] * dt;
                attr.array[i * 3 + 2] += s.debrisVel[i * 3 + 2] * dt;
              }
              attr.needsUpdate = true;
              s.debris.material.opacity = Math.max(0, 1 - s.age / 1.1);
            } else s.debris.material.opacity = 0;
            const rt = Math.min(1, s.age / 0.7);
            const rr = 1 + rt * 19;
            s.ring.scale.set(rr, rr, 1);
            s.ring.material.opacity = Math.max(0, 0.75 * (1 - rt));
            if (s.age > 2.8) s.group.visible = false;
          } else {
            const rt = Math.min(1, s.age / 1.2);
            const rr = 1 + rt * 7;
            s.ring.scale.set(rr, rr, 1);
            s.ring.material.opacity = Math.max(0, 0.6 * (1 - rt));
            const gs = 3 + rt * 3;
            s.glow.scale.set(gs, gs, 1);
            s.glow.material.opacity = Math.max(0, 0.7 * (1 - rt));
            if (s.age > 1.2) s.group.visible = false;
          }
        }
      }

      // The floating integrity bar: makeLabel's DOM pattern, one
      // per resident machine, projected in the frame loop beside
      // the labels. It exists from placement (cheap, hidden) and
      // shows only while the machine is hurt and in view.
      function makeVehicleBar(rec, owner) {
        const el = document.createElement('div');
        el.className = 'pointer-events-none absolute left-0 top-0 h-[7px] w-12 overflow-hidden rounded-full border border-black/50 bg-black/55';
        el.style.willChange = 'transform';
        el.style.display = 'none';
        const fill = document.createElement('div');
        fill.style.height = '100%';
        fill.style.width = '100%';
        fill.style.background = '#4ade80';
        el.appendChild(fill);
        labelsRef.current && labelsRef.current.appendChild(el);
        vehicleBars.push({
          el, fill, rec, owner, h: rec.spec.eyeHeight + 1.55,
          lastPct: -1, flashUntil: 0, outline: '',
        });
      }
      // (Tap-to-shoot on vehicles lived here until 2026-10-23,
      // when Merlin reversed it: taps board again, and shooting
      // waits for guns with a reticle. The damage law's shot
      // path — applyShotToVehicle in lib/earth2/vehicle-damage.js
      // — stays untouched for that build to call.)

      // The driven machine just wrecked: the law's eject outcome
      // seats the walker (unharmed, beside the wreck or on the
      // nearest wadeable shore), the helm lets go, and the moment
      // plays by the bill — a submersion sinks quiet; anything
      // else burns.
      function handleDrivenWreck(id, spec, st) {
        const inst = vehicleInstanceById(id);
        const name = inst && inst.label ? inst.label : spec.name;
        const cols = currentColliders().slice();
        cols.push({ x: DRACULA_SPOT.x, z: DRACULA_SPOT.z, r: 1.3 });
        if (hammondNpc.group) cols.push({ x: HAMMOND_NPC.stand.x, z: HAMMOND_NPC.stand.z, r: 1.0 });
        if (museumStanding) cols.push({ x: MUSEUM_CENTER.x, z: MUSEUM_CENTER.z - 3.5, r: 9 });
        if (airportStanding) cols.push({ x: AIRPORT_CENTER.x, z: AIRPORT_CENTER.z, r: 13 });
        for (const v of vehicles) {
          if (v.key === id) continue;
          const vst = vehicleStatesRef.current[v.key];
          if (vst) cols.push({ x: vst.x, z: vst.z, r: v.spec.radius });
        }
        cols.push({ x: st.x, z: st.z, r: spec.radius });
        const from = st.eject && typeof st.eject.x === 'number'
          ? { x: st.eject.x, z: st.eject.z }
          : { x: st.x, z: st.z };
        const settled = stepWorldWalker(from, 0, { fwd: 0, strafe: 0 }, 0, cols, false);
        walker.x = settled.x;
        walker.z = settled.z;
        walker.yaw = (st.heading || 0) + Math.PI;
        drivingRef.current = null;
        if (!cancelled) setDriving(null);
        saveVehicleStates(vehicleStatesRef.current);
        const kind = st.lastDamage && st.lastDamage.kind;
        if (kind === 'submersion') {
          sfxSplash(5);
          vibrateFor({ kind: 'sinking' });
          noticeRef.current(`🌊 The ${name} drowned — you step out unharmed. A fresh one replaces her at home.`);
        } else {
          fireExplosion(st.x, (st.y != null ? st.y : heightAt(st.x, st.z)) + 1, st.z, 0);
          noticeRef.current(`💥 The ${name} is wrecked! You step out unharmed — a fresh one replaces her at home.`);
        }
      }

      // The driven machine's per-step feedback: the step law
      // stamps lastDamage fresh on every billed event (the same
      // object rides along on quiet steps), so a new reference
      // with a real amount IS the impact — sound scaled by the
      // bill, the haptic, the shake. Plus the ditch call, the
      // shoreline splash, the low-bar warning, and the wreck.
      function drivePhaseB(prev, stepped, spec, id, t) {
        const dmg = stepped.lastDamage;
        const fresh = dmg && dmg !== prev.lastDamage && dmg.amount > 0;
        if (fresh && (dmg.kind === 'impact' || dmg.kind === 'grounding' || dmg.kind === 'landing')) {
          sfxImpact(dmg.amount);
          vibrateFor({ kind: 'impact', amount: dmg.amount });
          shakeAmp = Math.min(1, shakeAmp + Math.min(0.45, dmg.amount / 110));
          if (dmg.kind === 'landing' && dmg.amount >= 8) {
            noticeRef.current('🛬 Hard landing — the airframe felt that one. Watch her integrity bar.');
          }
        }
        if (stepped.ditched && !prev.ditched) {
          sfxSplash(Math.abs(prev.speed || 0) + 7);
          sfxImpact(16);
          vibrateFor({ kind: 'impact', amount: 30 });
          noticeRef.current('🌊 Ditched! She is taking on water — step out while you can.');
        }
        if (!spec.water && !spec.air
          && (prev.depthHere || 0) <= 0.02 && (stepped.depthHere || 0) > 0.05
          && Math.abs(stepped.speed || 0) >= 3.5) {
          sfxSplash(Math.abs(stepped.speed));
        }
        if (!stepped.wrecked && (stepped.integrity ?? 100) < 30 && t >= warnTickAt) {
          warnTickAt = t + 1.4;
          sfxWarningTick();
          vibrateFor({ kind: 'warning' });
        }
        if (stepped.wrecked && !prev.wrecked) handleDrivenWreck(id, spec, stepped);
      }

      function spawnSac(at) {
        const groundY = heightAt(at.x, at.z);
        const group = new THREE.Group();
        const core = new THREE.Mesh(
          new THREE.SphereGeometry(0.3, 18, 14),
          new THREE.MeshStandardMaterial({ color: 0xc01414, emissive: 0x8a0a0a, emissiveIntensity: 0.9, roughness: 0.35 }),
        );
        core.scale.y = 1.25;
        group.add(core);
        const spr = glowSprite('rgba(255,60,40,0.9)', 'rgba(200,10,10,0)');
        spr.scale.setScalar(2.2);
        group.add(spr);
        group.position.set(at.x, groundY + 0.55, at.z);
        scene.add(group);
        const sac = { group, core, baseY: groundY + 0.55 };
        group.traverse((o) => { o.userData.sacRef = sac; });
        sacs.push(sac);
      }

      function collectSac(sac) {
        const i = sacs.indexOf(sac);
        if (i < 0) return;
        sacs.splice(i, 1);
        scene.remove(sac.group);
        collectSacRef.current();
        noticeRef.current('🩸 Blood sac collected — Dracula trades sacs for gifts.');
      }

      function resetMosquitoAt(mq, center) {
        // The lifecycle's respawn (Wave A): a dead mosquito
        // returns at a DIFFERENT cruise centre — the anchor
        // chooser picks a far one, so a kill visibly empties
        // this corner of the sky for a while.
        if (center && Number.isFinite(center.x) && Number.isFinite(center.z)) {
          mq.cx = center.x + (rng() - 0.5) * 24;
          mq.cz = center.z + (rng() - 0.5) * 24;
        }
        resetMosquito(mq);
      }
      function resetMosquito(mq) {
        mq.phase = 'cruising';
        mq.fedLevel = 0;
        mq.feedT = 0;
        mq.target = null;
        mq.cruiseT = 0;
        mq.nextFeedIn = MOSQUITO_CONFIG.refuelDelay[0]
          + rng() * (MOSQUITO_CONFIG.refuelDelay[1] - MOSQUITO_CONFIG.refuelDelay[0]);
        mq.group.visible = true;
        mq.group.rotation.set(0, 0, 0);
        mq.baseY = heightAt(mq.cx, mq.cz);
        mq.group.position.set(
          mq.cx + Math.cos(mq.a) * mq.r, mq.baseY + mq.h,
          mq.cz + Math.sin(mq.a) * mq.r,
        );
        applyAbdomen(mq);
      }

      function landMosquito(mq, t) {
        mq.group.position.y = heightAt(mq.group.position.x, mq.group.position.z) + 0.25;
        if (mq.willDropSac) spawnSac(mq.group.position);
        spawnBurst(mq.group.position, mq.willDropSac ? 0xd42a2a : 0x9a958c);
        mq.group.visible = false;
        mq.phase = 'gone';
        mq.goneT = 0;
        // The kill routes through the lifecycle (Wave A): the
        // tick respawns this mosquito at a far cruise centre
        // after the blood loop's own respawn delay — the sac
        // stays its only drop (fossils.js excludes the species,
        // so the carcass record's fossil roll is null).
        lifecycle.kill(mq.id, t, mq.group.position, MOSQUITO_CONFIG.respawnSeconds);
      }

      function shootMosquito(mq) {
        if (mq.phase === 'falling' || mq.phase === 'gone') return;
        mq.willDropSac = mosquitoDropsSac(mq.phase);
        spawnBurst(mq.group.position, mq.willDropSac ? 0xd42a2a : 0x9a958c);
        if (!mq.willDropSac) {
          noticeRef.current("It hadn't drunk yet — no sac. Shoot the swollen red ones.");
        }
        mq.phase = 'falling';
        mq.vy = 0;
      }

      function updateMosquito(mq, t, dt) {
        const pos = mq.group.position;
        if (mq.parts.wingRoots && mq.phase !== 'gone') {
          const flap = Math.sin(t * 42 + mq.a * 7) * 0.16;
          for (const w of mq.parts.wingRoots) {
            bendBoneTo(w.bone, w.bind, BEND_X, flap * w.sign);
          }
        }
        switch (mq.phase) {
          case 'cruising': {
            mq.cruiseT += dt;
            mq.a += dt * mq.speed * (mq.fedLevel > 0 ? MOSQUITO_CONFIG.fullSpeedFactor : 1);
            pos.set(
              mq.cx + Math.cos(mq.a) * mq.r,
              mq.baseY + mq.h + Math.sin(t * 1.3 + mq.a * 3) * 0.5,
              mq.cz + Math.sin(mq.a) * mq.r,
            );
            mq.group.rotation.y = -mq.a;
            if (mq.fedLevel === 0 && mq.cruiseT > mq.nextFeedIn) {
              const targets = animals.filter((an) => !an.flyer);
              if (targets.length) {
                mq.target = targets[Math.floor(rng() * targets.length)];
                mq.phase = 'seeking';
              }
            }
            break;
          }
          case 'seeking': {
            if (!mq.target) { mq.phase = 'cruising'; break; }
            hostAnchor(mq.target, anchorV);
            if (moveToward(mq.group, anchorV, MOSQUITO_CONFIG.seekSpeed, dt)) {
              mq.phase = 'feeding';
              mq.feedT = 0;
            }
            break;
          }
          case 'feeding': {
            if (!mq.target) { mq.phase = 'cruising'; break; }
            hostAnchor(mq.target, anchorV);
            pos.copy(anchorV);
            mq.group.rotation.y = Math.atan2(
              mq.target.root.position.x - pos.x,
              mq.target.root.position.z - pos.z,
            );
            mq.feedT += dt;
            mq.fedLevel = Math.min(1, mq.feedT / MOSQUITO_CONFIG.feedSeconds);
            applyAbdomen(mq);
            if (mq.feedT >= MOSQUITO_CONFIG.feedSeconds) {
              mq.phase = 'full';
              mq.cruiseT = 0;
            }
            break;
          }
          case 'full': {
            tmpTarget.set(
              mq.cx + Math.cos(mq.a) * mq.r, mq.baseY + mq.h,
              mq.cz + Math.sin(mq.a) * mq.r,
            );
            if (moveToward(mq.group, tmpTarget, 2.4, dt)) mq.phase = 'cruising';
            break;
          }
          case 'falling': {
            mq.vy -= 22 * dt;
            pos.y += mq.vy * dt;
            mq.group.rotation.z += dt * 7;
            mq.group.rotation.x += dt * 3;
            if (pos.y <= heightAt(pos.x, pos.z) + 0.25) landMosquito(mq, t);
            break;
          }
          case 'gone': {
            // No local timer any more: the lifecycle's due
            // respawns (processed in the tick) stand this
            // mosquito back up at a far centre.
            break;
          }
          default:
            break;
        }
      }

      function updateDracula(t, dt) {
        const ev = greetRef.current ? 'greet' : null;
        if (ev) greetRef.current = false;
        const prevPhase = drac.machine.phase;
        drac.machine = stepDracula(drac.machine, dt, ev);
        const m = drac.machine;
        if (prevPhase !== m.phase && m.phase === 'return' && drac.batForm) {
          drac.returnFrom.copy(drac.batForm.position);
        }
        if (drac.smoke) {
          let op = 0;
          let sc = 1;
          if (m.phase === 'smoke-out' || m.phase === 'smoke-in') {
            const p = Math.min(1, m.t / DRACULA_TIMINGS.smokeSeconds);
            op = Math.sin(p * Math.PI) * 0.85;
            sc = 1 + p * 2.4;
          }
          drac.smoke.material.opacity = op;
          drac.smoke.scale.setScalar(sc);
          drac.smoke.rotation.y += dt * 1.5;
        }
        if (drac.countForm) {
          drac.countForm.visible =
            m.phase === 'count'
            || (m.phase === 'smoke-out' && m.t < DRACULA_TIMINGS.smokeSeconds * 0.55)
            || (m.phase === 'smoke-in' && m.t > DRACULA_TIMINGS.smokeSeconds * 0.45);
          if (m.phase === 'count') {
            drac.countForm.position.y = DRACULA_SPOT.y + Math.sin(t * 0.8) * 0.04;
            const rig = drac.countRig;
            if (rig) {
              const br = Math.sin(t * 0.85) * 0.016;
              rig.roles.spine.forEach((b, i) => bendBoneTo(b, rig.bind.get(b.uuid), BEND_X, br * (0.6 + i * 0.3)));
              const yaw = (Math.sin(t * 0.21) * 0.6 + Math.sin(t * 0.131) * 0.4) * 0.22;
              const neckShare = rig.roles.neck.length ? 0.4 / rig.roles.neck.length : 0;
              rig.roles.neck.forEach((b) => bendBoneTo(b, rig.bind.get(b.uuid), BEND_Y, yaw * neckShare));
              if (rig.roles.head) {
                bendBoneTo(rig.roles.head, rig.bind.get(rig.roles.head.uuid), BEND_Y, yaw * 0.6);
                bendQ.setFromAxisAngle(BEND_X, Math.sin(t * 0.37) * 0.045);
                rig.roles.head.quaternion.multiply(bendQ);
              }
            }
          }
        }
        if (drac.batForm) {
          drac.batForm.visible = m.phase === 'bat' || m.phase === 'return';
          if (m.phase === 'bat') {
            drac.batAngle += dt * 1.15;
            const x = CASTLE_AT[0] + Math.cos(drac.batAngle) * 30;
            const z = CASTLE_AT[1] + Math.sin(drac.batAngle) * 30;
            const nx = CASTLE_AT[0] + Math.cos(drac.batAngle + 0.06) * 30;
            const nz = CASTLE_AT[1] + Math.sin(drac.batAngle + 0.06) * 30;
            drac.batForm.position.set(x, CASTLE_BASE_Y + 19 + Math.sin(t * 2.1) * 1.2, z);
            drac.batForm.rotation.y = Math.atan2(nx - x, nz - z);
            drac.batForm.rotation.z = 0.28;
            flapWings(drac.batWings, t, 16);
          } else if (m.phase === 'return') {
            const p = Math.min(1, m.t / DRACULA_TIMINGS.returnSeconds);
            const e = p * p * (3 - 2 * p);
            tmpTarget.set(DRACULA_SPOT.x, DRACULA_SPOT.y + 1.2, DRACULA_SPOT.z);
            drac.batForm.position.lerpVectors(drac.returnFrom, tmpTarget, e);
            flapWings(drac.batWings, t, 16);
          }
        }
        // The castle swarm — near enough to matter only when the
        // walker is in the south; positions always track, wings
        // flap when the court is within reach of the eye.
        const scatter = m.scatter;
        for (const b of swarmBats) {
          b.a += dt * b.speed * (1 + scatter * 1.8);
          const r = b.r * (1 + scatter * 1.15);
          const x = CASTLE_AT[0] + Math.cos(b.a) * r;
          const z = CASTLE_AT[1] + Math.sin(b.a) * r;
          const nx = CASTLE_AT[0] + Math.cos(b.a + 0.05) * r;
          const nz = CASTLE_AT[1] + Math.sin(b.a + 0.05) * r;
          b.group.position.set(x, CASTLE_BASE_Y + b.h + Math.sin(t * 0.9 + b.ph) * 0.8, z);
          b.group.rotation.y = Math.atan2(nx - x, nz - z);
          b.group.rotation.z = 0.28;
          if (castleNear) flapWings(b.wings, t + b.ph, 11);
        }
      }

      // ── The life driver (the Bay's, walking on real terrain) ──
      const clock = new THREE.Clock();
      const tmpQ = new THREE.Quaternion();
      const AXIS_X = new THREE.Vector3(1, 0, 0);
      const AXIS_Y = new THREE.Vector3(0, 1, 0);
      const AXIS_Z = new THREE.Vector3(0, 0, 1);
      const bend = (bone, bindMap, axis, angle) => {
        const b = bindMap.get(bone.uuid);
        if (!b) return;
        tmpQ.setFromAxisAngle(axis, angle);
        bone.quaternion.copy(b).multiply(tmpQ);
      };

      function swingLegs(a, stride) {
        const R = a.roles;
        const quad = a.entry.posture === 'quadruped';
        for (const leg of R.legs) {
          const isFront = leg.pair === 'front';
          const diag = (leg.side === 'left') === (isFront === false);
          const phLeg = stride + (diag ? 0 : Math.PI);
          const amp = isFront && !quad ? 0.1 : 0.34;
          if (leg.thigh) bend(leg.thigh, a.bind, AXIS_X, Math.sin(phLeg) * amp);
          if (leg.calf) bend(leg.calf, a.bind, AXIS_X, Math.max(0, Math.sin(phLeg - 0.7)) * amp * 1.15);
          if (leg.foot) bend(leg.foot, a.bind, AXIS_X, Math.sin(phLeg - 1.4) * amp * 0.5);
        }
      }

      function updateCompy(a, dt) {
        const c = a.compy;
        const px = a.root.position.x, pz = a.root.position.z;
        for (const other of animals) {
          if (!other.walker) continue;
          const d = Math.hypot(other.root.position.x - px, other.root.position.z - pz);
          if (d < COMPY_SWARM.scatterRadius) {
            c.scatterT = COMPY_SWARM.scatterSeconds;
            const away = Math.atan2(px - other.root.position.x, pz - other.root.position.z);
            c.wx = px + Math.sin(away) * 11;
            c.wz = pz + Math.cos(away) * 11;
          }
        }
        let dx = c.wx - px, dz = c.wz - pz;
        if (Math.hypot(dx, dz) < 0.9) {
          const ang = rng() * Math.PI * 2;
          const rad = rng() * COMPY_SWARM.radius;
          c.wx = COMPY_CENTER.x + Math.cos(ang) * rad;
          c.wz = COMPY_CENTER.z + Math.sin(ang) * rad;
          dx = c.wx - px; dz = c.wz - pz;
        }
        const distW = Math.hypot(dx, dz) || 1;
        c.scatterT = Math.max(0, c.scatterT - dt);
        const speed = c.baseSpeed * (c.scatterT > 0 ? COMPY_SWARM.scatterSpeedMultiplier : 1);
        const vx = (dx / distW) * speed, vz = (dz / distW) * speed;
        a.root.position.x += vx * dt;
        a.root.position.z += vz * dt;
        a.root.position.y = heightAt(a.root.position.x, a.root.position.z);
        const targetYaw = Math.atan2(vx, vz);
        let dyaw = targetYaw - a.root.rotation.y;
        dyaw = Math.atan2(Math.sin(dyaw), Math.cos(dyaw));
        a.root.rotation.y += dyaw * Math.min(1, dt * 9);
        a.dist += speed * dt;
        swingLegs(a, (a.dist / Math.max(0.2, a.entry.scaleM * 0.16)) * Math.PI);
      }

      function updateSwimmer(s, t, dt, speedMul = 1) {
        const P = s.profile;
        // Night slows the cruise — the sea slow-drifts (×0.45
        // from the frame loop) while the world sleeps.
        s.theta += dt * P.speed * P.dir * speedMul;
        const th = s.theta;
        const x = P.cx + Math.cos(th) * P.rx;
        const z = P.cz + Math.sin(th) * P.rz;
        const vx = -Math.sin(th) * P.rx * P.dir;
        const vz = Math.cos(th) * P.rz * P.dir;
        const surf = surfacePhase(t / P.period + s.phaseOff, P.duty);
        let y = P.deep + (P.shallow - P.deep) * surf;
        // Belly clearance over the bed — with a hard cap at the
        // surfacing line (Wave C, the beached-tylosaurus fix).
        // The old clamp lifted the animal to bed + 16% of its
        // length with no cap but the surface +0.3, so over the
        // shoals at a circuit's edge the whole body rode OUT of
        // the water. Circuits are now fitted in world.js so the
        // bed keeps the full draft everywhere on the path (this
        // clamp should never bind), and if it ever does, the
        // animal is never lifted above its shallow line.
        const minY = heightAt(x, z) + swimDraftMargin(s.entry.scaleM);
        if (y < minY) y = Math.min(minY, P.shallow);
        if (y > WATER_Y - 0.2) y = WATER_Y - 0.2;
        const vy = dt > 0 ? (y - s.y) / dt : 0;
        s.y = y;
        s.root.position.set(x, y, z);
        s.root.rotation.set(0, 0, 0);
        s.root.rotation.y = Math.atan2(vx, vz);
        s.root.rotation.x = THREE.MathUtils.clamp(-vy * 0.1, -0.16, 0.16);
        s.root.rotation.z = 0.05 * P.dir;
        const wave = t * P.waveHz * Math.PI * 2 + s.phase;
        const n = s.axial.length;
        s.axial.forEach((b, i) => {
          const f = n > 1 ? i / (n - 1) : 0;
          const amp = 0.03 + (P.ampTail - 0.03) * f * f;
          bend(b, s.bind, AXIS_Y, Math.sin(wave - f * P.waveSpan) * amp);
        });
        const pw = t * P.paddleHz * Math.PI * 2 + s.phase;
        for (const fl of s.flippers) {
          const lag = fl.pair === 'hind' ? 1.4 : fl.pair === 'mid' ? 0.7 : 0;
          const a = Math.sin(pw - lag) * P.paddleAmp;
          fl.chain.forEach((b, i) => bend(b, s.bind, AXIS_X, a * (i === 0 ? 1 : 0.45)));
        }
        for (const chain of s.extras) {
          chain.forEach((b, i) => bend(b, s.bind, AXIS_Y, Math.sin(wave - 1.2 - i * 0.4) * 0.05));
        }
      }

      // ── Behaviour helpers (Wave A) ──────────────────────────
      // The nearest shoreline stand-point for a drinker: a ring
      // scan for ground at the water's edge within ~200 m of
      // home. Cached per creature (undefined until first scan,
      // null when this corner of the world has no shore).
      function shorelinePointFor(a) {
        const hx = a.home.x, hz = a.home.z;
        for (let r = 10; r <= 200; r += 8) {
          for (let k = 0; k < 16; k++) {
            const ang = (k / 16) * Math.PI * 2 + r * 0.13;
            const x = hx + Math.cos(ang) * r;
            const z = hz + Math.sin(ang) * r;
            const h = heightAt(x, z);
            if (h > -0.5 && h < 0.14 && waterDepthAt(x + Math.cos(ang) * 3, z + Math.sin(ang) * 3) > 0.12) {
              return { x, z };
            }
          }
        }
        return null;
      }

      // A predator's kill, routed through the lifecycle: the
      // prey's own record becomes the carcass (its fossil roll
      // rides the lifecycle record — the future hunt build reads
      // it from exactly here), and the predator settles to eat.
      function killPrey(prey, predator, t) {
        const carcass = lifecycle.kill(prey.id, t, prey.root.position);
        prey.alive = false;
        prey.state = 'carcass';
        prey.carcass = carcass;
        prey.deathPos = { x: prey.root.position.x, z: prey.root.position.z };
        prey.huntTarget = null;
        prey.fleeFrom = null;
        if (prey.beh) setBehaviourMode(prey.beh, 'idle', Infinity);
        predator.chase = null;
        predator.huntTarget = null;
        if (predator.beh) {
          predator.beh.hunger = 0.08;
          setBehaviourMode(predator.beh, 'eat', 16 + rng() * 14);
        }
      }

      // Due respawns: stand the dead back up at a far anchor —
      // the other side of the map from the death, away from the
      // walker, in the same biome family. A creature whose
      // stream unit is gone is simply released: the unit
      // re-places a living copy when it next streams in.
      function processRespawns(t) {
        for (const due of lifecycle.dueRespawns(t)) {
          if (due.id.startsWith('mosquito#')) {
            const mq = mosquitos.find((m) => m.id === due.id);
            if (mq) {
              const anchors = worldMosquitoCenters().map((c) => ({ x: c.cx, z: c.cz }));
              const anchor = chooseRespawnAnchor(anchors, {
                deathPos: mq.group.position, playerPos: walker, rng,
                minDeathDist: 120, minPlayerDist: 90,
              });
              resetMosquitoAt(mq, anchor);
            }
            lifecycle.completeRespawn(due.id);
            continue;
          }
          const rec = animals.find((o) => o.id === due.id);
          if (rec && rec.state === 'carcass') {
            const fam = rec.deathPos
              ? familyForParcel(parcelAtWorld(rec.deathPos.x, rec.deathPos.z))
              : null;
            const anchors = [];
            for (const c of worldCreatures()) {
              if (c.slug !== rec.entry.slug) continue;
              anchors.push({ x: c.x, z: c.z, family: familyForParcel(parcelAtWorld(c.x, c.z)) });
              if (c.walk) anchors.push({ x: c.walk.cx, z: c.walk.cz, family: familyForParcel(parcelAtWorld(c.walk.cx, c.walk.cz)) });
            }
            const anchor = chooseRespawnAnchor(anchors, {
              deathPos: rec.deathPos || rec.home, playerPos: walker, family: fam, rng,
            }) || rec.home;
            rec.root.position.set(anchor.x, heightAt(anchor.x, anchor.z), anchor.z);
            rec.root.rotation.set(0, rng() * Math.PI * 2, 0);
            rec.root.visible = true;
            rec.state = 'alive';
            rec.alive = true;
            rec.carcass = null;
            rec.dist = 0;
            if (rec.walker) {
              rec.walker.cx = anchor.x;
              rec.walker.cz = anchor.z;
            }
            rec.home = { x: anchor.x, z: anchor.z };
            rec.drinkPoint = undefined;
            rec.beh = createBehaviour(seedFor(rec.entry.slug, 0) + (rec.respawns = (rec.respawns || 0) + 1), rec.entry);
          }
          lifecycle.completeRespawn(due.id);
        }
      }

      const OFF_CIRCUIT_MODES = new Set(['drink-go', 'drink', 'stalk', 'chase', 'flee']);
      // Runs the creature's behaviour machine for one frame:
      // steps the chooser, weaves hunts and drinks and flights,
      // and MOVES the root for the locomoting modes. The bone
      // posing in driveAnimal reads the resulting mode.
      function driveBehaviour(a, t, dt) {
        const beh = a.beh;
        const caps = a.caps;
        const wasMode = beh.mode;
        if (caps.drinker && a.drinkPoint === undefined) a.drinkPoint = shorelinePointFor(a);
        stepBehaviour(beh, caps, {
          isNight: env.night > 0.45,
          waterNear: a.drinkPoint != null,
        }, dt);

        // A circuit roamer that left its circuit (to drink, to
        // hunt, to flee) re-anchors the circuit through the
        // ground it stands on now — no teleport home, ever.
        if (a.walker && OFF_CIRCUIT_MODES.has(wasMode) && !OFF_CIRCUIT_MODES.has(beh.mode)) {
          const w = a.walker;
          w.cx = a.root.position.x - Math.cos(w.theta) * w.r;
          w.cz = a.root.position.z - Math.sin(w.theta) * w.r;
          a.home = { x: a.root.position.x, z: a.root.position.z };
        }

        const pos = a.root.position;
        const stepTo = (target, speed) => {
          const next = stepToward({ x: pos.x, z: pos.z }, target, speed, dt);
          pos.x = next.x;
          pos.z = next.z;
          return next.arrived;
        };

        switch (beh.mode) {
          case 'wander':
          case 'sated': {
            const mul = beh.mode === 'sated' ? 0.55 : 1;
            if (a.walker) {
              const w = a.walker;
              w.theta += (dt * w.speed * mul) / w.r;
              pos.x = w.cx + Math.cos(w.theta) * w.r;
              pos.z = w.cz + Math.sin(w.theta) * w.r;
            } else {
              // A stander strolls home if life took it away.
              const dHome = Math.hypot(a.home.x - pos.x, a.home.z - pos.z);
              if (dHome > 6) stepTo(a.home, intentSpeed(a.entry) * 0.6 * mul);
            }
            break;
          }
          case 'drink-go': {
            if (!a.drinkPoint) { setBehaviourMode(beh, 'idle', 2); break; }
            if (stepTo(a.drinkPoint, intentSpeed(a.entry))) {
              setBehaviourMode(beh, 'drink', 7 + rng() * 6);
            }
            break;
          }
          case 'stalk': {
            const prey = a.huntTarget;
            if (!prey || prey.state === 'carcass' || !prey.alive) {
              a.huntTarget = null;
              setBehaviourMode(beh, 'winded', 4);
              break;
            }
            const tp = prey.root.position;
            const d = Math.hypot(tp.x - pos.x, tp.z - pos.z);
            stepTo(tp, intentSpeed(a.entry) * HUNT.stalkSpeedFactor);
            if (d < HUNT.chaseTriggerM) {
              a.chase = rollChase(beh);
              a.chaseT = 0;
              setBehaviourMode(beh, 'chase', Infinity);
              if (prey.beh) {
                setBehaviourMode(prey.beh, 'flee', Infinity);
                prey.fleeFrom = a;
                prey.fleePoint = fleePoint(prey.root.position, pos, prey.home);
                prey.fleeT = 0;
              }
            }
            break;
          }
          case 'chase': {
            const prey = a.huntTarget;
            if (!prey || prey.state === 'carcass' || !prey.alive || !a.chase) {
              a.chase = null;
              a.huntTarget = null;
              setBehaviourMode(beh, 'winded', 4);
              break;
            }
            a.chaseT += dt;
            const tp = prey.root.position;
            stepTo(tp, intentSpeed(prey.entry) * HUNT.fleeSpeedFactor * a.chase.speedFactor);
            const d = Math.hypot(tp.x - pos.x, tp.z - pos.z);
            if (d < HUNT.killRangeM + prey.entry.scaleM * 0.22) {
              killPrey(prey, a, t);
            } else if (a.chaseT > a.chase.durationS) {
              // The prey got away: it stands alert, heart
              // hammering; the hunter is winded and will not
              // hunt again until the cooldown runs out.
              if (prey.beh) setBehaviourMode(prey.beh, 'alert', 4);
              prey.fleeFrom = null;
              a.chase = null;
              a.huntTarget = null;
              beh.huntCooldown = HUNT.postChaseCooldownS;
              setBehaviourMode(beh, 'winded', 6);
            }
            break;
          }
          case 'flee': {
            const pred = a.fleeFrom;
            if (!pred || !pred.beh || pred.beh.mode !== 'chase') {
              a.fleeFrom = null;
              setBehaviourMode(beh, 'alert', 3);
              break;
            }
            a.fleeT += dt;
            if (a.fleeT > 1.1 || !a.fleePoint) {
              a.fleeT = 0;
              a.fleePoint = fleePoint(pos, pred.root.position, a.home);
            }
            stepTo(a.fleePoint, intentSpeed(a.entry) * HUNT.fleeSpeedFactor);
            break;
          }
          default:
            break;
        }

        // A hungry predator with its breath back picks a target:
        // the nearest living prey CREATURE in stalk range.
        // pickPreyTarget only ever sees creature records — the
        // walker is not one, so the walker can never be hunted.
        if (caps.predator
          && beh.mode !== 'stalk' && beh.mode !== 'chase'
          && beh.mode !== 'eat' && beh.mode !== 'sleep'
          && beh.hunger >= HUNT.hungerThreshold && beh.huntCooldown <= 0) {
          const views = [];
          for (const o of animals) {
            if (o === a || !o.creature) continue;
            views.push({
              id: o.id, creature: true, prey: !!(o.caps && o.caps.prey),
              alive: o.alive, x: o.root.position.x, z: o.root.position.z,
            });
          }
          const pick = pickPreyTarget({ id: a.id, x: pos.x, z: pos.z }, views, HUNT.stalkRangeM);
          if (pick) {
            const preyRec = animals.find((o) => o.id === pick.id);
            if (preyRec) {
              a.huntTarget = preyRec;
              setBehaviourMode(beh, 'stalk', Infinity);
            }
          }
        }
      }

      function driveAnimal(a, t, dt) {
        const R = a.roles;
        const ph = a.phase;
        const tempo = a.tempo || 1;

        if (a.state === 'carcass') {
          // The dead lie where they fell, then sink away on the
          // lifecycle's clock while their respawn counts down.
          const sink = carcassSink(a.carcass, t);
          // As the carcass finishes sinking, its fossil roll (the
          // lifecycle's fossilHook) is credited to the backpack —
          // once per carcass.
          if (sink >= 1 && a.carcass && a.carcass.fossilDrops && !a.carcass._packCredited) {
            a.carcass._packCredited = true;
            fossilCreditRef.current(a.carcass.fossilDrops);
          }
          a.root.position.y = heightAt(a.root.position.x, a.root.position.z)
            - sink * (a.entry.scaleM * 0.16 + 0.35);
          a.root.rotation.z = sink * 0.4;
          a.root.visible = sink < 1;
          return;
        }

        // ── The behaviour machine decides; the bones pose it.
        const prevX = a.root.position.x;
        const prevZ = a.root.position.z;
        const beh = a.beh || null;
        const caps = a.caps || null;
        if (beh && caps) driveBehaviour(a, t, dt);
        const pose = beh ? behaviourPose(beh.mode, beh.mode === 'eat' ? t : beh.t) : null;

        const br = Math.sin(t * a.breathRate * (pose ? pose.breathMul : 1) + ph) * 0.02 * (pose ? pose.breathAmp : 1);
        R.spine.forEach((b, i) => bend(b, a.bind, AXIS_X, br * (0.6 + i * 0.3) + (pose ? pose.settle * 0.05 * (0.5 + i * 0.25) : 0)));
        const scan = Math.sin(t * 0.23 * tempo + ph) * 0.6 + Math.sin(t * 0.117 * tempo + ph * 1.7) * 0.4;
        const yaw = scan * (pose ? pose.yawAmp : 0.16);
        const pitch = Math.sin(t * 0.31 * tempo + ph) * 0.045;
        const neckShare = R.neck.length ? 0.45 / R.neck.length : 0;
        R.neck.forEach((b) => bend(b, a.bind, AXIS_Y, yaw * neckShare));
        let dip = 0;
        if (pose) dip = pose.dip;
        else if (a.entry.diet === 'herbivore') {
          const cyc = (t * 0.045 * tempo + ph) % 1;
          if (cyc > 0.55 && cyc < 0.85) dip = Math.sin(((cyc - 0.55) / 0.3) * Math.PI) * 0.38;
        }
        R.neck.forEach((b, i) => bend(b, a.bind, AXIS_X, dip * (0.25 + i * 0.12)));
        if (R.head) {
          bend(R.head, a.bind, AXIS_Y, yaw * 0.55);
          bend(R.head, a.bind, AXIS_X, pitch + dip * 0.5);
        }
        // Digging: the front legs scrape the ground in turn.
        if (pose && pose.scrape > 0) {
          for (const l of R.legs) {
            if (l.pair !== 'front') continue;
            const sw = Math.sin(t * 6.4 + (l.side === 'left' ? 0 : Math.PI)) * 0.30 * pose.scrape;
            bend(l.thigh, a.bind, AXIS_X, sw);
            if (l.shin) bend(l.shin, a.bind, AXIS_X, Math.max(0, -sw) * 0.6);
          }
        }
        R.tail.forEach((b, i) => {
          bend(b, a.bind, AXIS_Y, Math.sin(t * 1.05 * tempo - i * 0.55 + ph) * 0.055);
          bend(b, a.bind, AXIS_X, Math.sin(t * 0.7 * tempo - i * 0.3 + ph) * 0.015);
        });

        if (a.compy) {
          updateCompy(a, dt);
          return;
        }

        if (a.flyer && a.fly) {
          const f = a.fly;
          // Night roost: as env.night rises the wing slows,
          // sinks and settles at its circuit's centre instead of
          // circling a dark sky; dawn lifts it again.
          a.roostF = Math.max(0, Math.min(1, (a.roostF || 0) + (env.night > 0.45 ? dt / 5 : -dt / 3.5)));
          const rf = a.roostF * a.roostF * (3 - 2 * a.roostF);
          f.a += dt * f.speed * f.dir * (1 - rf);
          let x = f.cx + Math.cos(f.a) * f.r;
          let z = f.cz + Math.sin(f.a) * f.r;
          const nx = f.cx + Math.cos(f.a + 0.05 * f.dir) * f.r;
          const nz = f.cz + Math.sin(f.a + 0.05 * f.dir) * f.r;
          // Cruise height, but never through a ridge: the flyer
          // lifts over rising terrain as it comes.
          const floorY = heightAt(x, z) + a.entry.scaleM * 0.8 + 2.5;
          let y = Math.max(f.h + Math.sin(t * 0.5 + ph) * f.bob, floorY);
          if (rf > 0) {
            const groundY = heightAt(f.cx, f.cz) + a.entry.scaleM * 0.12;
            x += (f.cx - x) * rf;
            z += (f.cz - z) * rf;
            y += (groundY - y) * rf;
          }
          a.root.position.set(x, y, z);
          a.root.rotation.y = Math.atan2(nx - x, nz - z);
          a.root.rotation.z = 0.28 * f.dir * (1 - rf);
          const glide = surfacePhase(t / f.cycle + (a.glideOff || 0), f.glideDuty);
          const flap = (Math.sin(t * f.flapHz * Math.PI * 2 + ph) * f.flapAmp * (1 - glide) + glide * 0.05) * (1 - rf);
          for (const w of R.wings) {
            const sgn = w.side === 'left' ? 1 : -1;
            w.chain.forEach((b, i) => bend(b, a.bind, AXIS_Z, flap * sgn * (i === 0 ? 1 : 0.45)));
          }
          return;
        }

        // Land finish for every grounded creature: circuit
        // roamers without the behaviour machine keep the legacy
        // circuit (none today — the fallback stays honest), then
        // everyone faces their motion, swings their legs by the
        // distance actually travelled, and seats their feet on
        // the terrain (the land-layer law) — minus the sleep
        // settle, so a sleeping animal visibly sinks into rest.
        if (a.walker && !beh) {
          const w = a.walker;
          w.theta += (dt * w.speed) / w.r;
          a.root.position.x = w.cx + Math.cos(w.theta) * w.r;
          a.root.position.z = w.cz + Math.sin(w.theta) * w.r;
        }
        {
          const vx = a.root.position.x - prevX;
          const vz = a.root.position.z - prevZ;
          const moved = Math.hypot(vx, vz);
          if (moved > 1e-6) a.root.rotation.y = Math.atan2(vx, vz);
          a.dist += moved;
          const stride = (a.dist / Math.max(0.5, a.entry.scaleM * 0.16)) * Math.PI;
          if (moved > 1e-4) swingLegs(a, stride);
          const settleDrop = pose ? pose.settle * a.entry.scaleM * 0.045 : 0;
          a.root.position.y = heightAt(a.root.position.x, a.root.position.z) - settleDrop
            + (moved > 1e-4 ? Math.abs(Math.sin(stride)) * 0.02 * Math.sqrt(a.entry.scaleM) : 0);
          a.root.rotation.x = moved > 1e-4 ? Math.sin(stride * 2) * 0.008 : 0;
        }
      }

      // ── The walker ───────────────────────────────────────────
      const spawnParcel = resolveSpawnParcel(spawnParcelId);
      const spawn = spawnPointFor(spawnParcel);
      const walker = {
        x: spawn.x, z: spawn.z,
        yaw: Math.atan2(spawn.x, spawn.z), // face the world's heart
        pitch: 0,
      };
      // The solid world: the landforms' own colliders plus the
      // Commons dressing's (Terrain Wave B — rocks, boulders,
      // crater discs and tree trunks are solid, per Merlin).
      // A parcel carrying a player's build lends its ground to
      // the build instead: its dressing colliders step aside
      // for as long as the build stands (currentColliders,
      // cached on the build signature).
      const staticColliders = worldColliders().concat(dressingColliders());
      let colliderCache = { sig: '', list: staticColliders };
      function currentColliders() {
        const builds = (buildPropsRef.current && buildPropsRef.current.builds) || [];
        let sig = '';
        const builtOn = new Set();
        for (const b of builds) {
          if (!b || b.groundType !== 'earth2-parcel' || !Array.isArray(b.pieces) || !b.pieces.length) continue;
          builtOn.add(b.groundId);
          sig += `${b.groundId}:${b.pieces.length}|`;
        }
        if (!builtOn.size) return staticColliders;
        if (sig !== colliderCache.sig) {
          colliderCache = {
            sig,
            list: staticColliders.filter((c) => !c.parcelId || !builtOn.has(c.parcelId)),
          };
        }
        return colliderCache.list;
      }
      const reducedMotion = typeof window !== 'undefined'
        && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      let bobT = 0;
      let castleNear = false;
      let hudParcel = null;

      function syncParcel(force) {
        const p = parcelAtWorld(walker.x, walker.z);
        if (!force && hudParcel && p.index === hudParcel.index) return;
        hudParcel = p;
        setHighlight(p);
        // OWNED = BLUE (Merlin, 2026-10-23): the viewer's own
        // parcels outline blue, not amber — in the world and in
        // the chamber map alike. Home base keeps its identity
        // through the HUD banner (🏠) on top of the blue.
        const bp = buildPropsRef.current;
        const row = bp.owners && bp.owners.get ? bp.owners.get(p.id) : null;
        const mine = !!(row && bp.user && row.owner_email && bp.user.email
          && String(row.owner_email).toLowerCase() === String(bp.user.email).toLowerCase());
        const home = !!(spawnParcelId && p.id === spawnParcelId);
        highlightMat.color.setHex(mine ? 0x59b7ff : 0xffd97a);
        const ll = worldToLatLon(walker.x, walker.z);
        if (!cancelled) {
          setHud({ parcel: p, biome: biomeForParcel(p), lat: ll.lat, lon: ll.lon, mine, home });
        }
        parcelChangeRef.current(p.id);
      }
      syncParcel(true);
      camera.position.set(walker.x, heightAt(walker.x, walker.z) + WALK_EYE_M, walker.z);
      camera.rotation.set(0, walker.yaw, 0);

      // ── The environment tick: real time, real weather ──────
      // Runs about once a second from the frame loop. Everything
      // derives from the parcel underfoot: its real lat/lon gives
      // the solar position for the REAL current time, and the
      // mirrored Open-Meteo conditions for that spot.
      const clamp01 = (v) => Math.max(0, Math.min(1, v));
      function updateEnvironment(nowMs) {
        const ll = worldToLatLon(walker.x, walker.z);
        const y0 = heightAt(walker.x, walker.z) + WALK_EYE_M;
        const sol = solarPosition(nowMs, ll.lat, ll.lon);
        const pal = skyPalette(sol.elevationDeg);
        env.night = pal.night;
        env.phase = sol.phase;
        env.clock = solarClockLabel(nowMs, ll.lat, ll.lon);
        const cloud = env.wx.cloudCover;
        const bucket = `${Math.round(sol.elevationDeg * 2)}|${Math.round(cloud * 8)}|${sol.phase}`;
        if (bucket !== env.skyBucket) { env.skyBucket = bucket; paintSky(pal); }
        scene.fog.color.setRGB(pal.fog[0], pal.fog[1], pal.fog[2]);
        scene.fog.far = Math.min(980 - pal.night * 260, env.wx.fogFar);
        scene.fog.near = scene.fog.far * 0.13;
        hemi.intensity = pal.hemiIntensity * (1 - cloud * 0.30);
        // The sun on its real bearing.
        const sd = sunVector(nowMs, ll.lat, ll.lon);
        sun.position.set(walker.x + sd.x * 200, y0 + sd.y * 200, walker.z + sd.z * 200);
        sun.target.position.set(walker.x, y0, walker.z);
        sun.intensity = pal.sunIntensity * (1 - cloud * 0.65);
        sun.color.setRGB(pal.sunColor[0], pal.sunColor[1], pal.sunColor[2]);
        // The moon: disc, halo and cool light on ITS bearing.
        const mp = moonPosition(nowMs, ll.lat, ll.lon);
        const md = altAzToVector(mp.altDeg, mp.azDeg);
        const moonVis = pal.night * (mp.altDeg > -3 ? 1 : 0) * (1 - cloud * 0.8);
        moonDisc.position.set(walker.x + md.x * 1850, y0 + md.y * 1850, walker.z + md.z * 1850);
        moonDisc.lookAt(walker.x, y0, walker.z);
        moonDisc.material.opacity = moonVis * (0.45 + 0.55 * mp.illum);
        moonGlow.position.copy(moonDisc.position);
        moonGlow.material.opacity = moonVis * 0.5;
        moonLight.position.set(walker.x + md.x * 200, y0 + md.y * 200, walker.z + md.z * 200);
        moonLight.target.position.set(walker.x, y0, walker.z);
        moonLight.intensity = pal.night * clamp01(mp.illum) * clamp01(mp.altDeg / 20) * 0.85 * (1 - cloud * 0.5);
        // Stars on the real dome (black = invisible, additive).
        const writeStars = (points, stars, dim) => {
          const posA = points.geometry.attributes.position;
          const colA = points.geometry.attributes.color;
          const vecs = [];
          for (let i = 0; i < stars.length; i++) {
            const v = starVector(stars[i], nowMs, ll.lat, ll.lon);
            vecs.push(v);
            posA.setXYZ(i, walker.x + v.x * 1950, y0 + v.y * 1950, walker.z + v.z * 1950);
            const fade = clamp01((v.altDeg + 2) / 10);
            const b = starBrightness(stars[i].mag) * fade * pal.night * (1 - cloud * 0.75) * dim;
            colA.setXYZ(i, b * 0.92, b * 0.96, b);
          }
          posA.needsUpdate = true;
          colA.needsUpdate = true;
          return vecs;
        };
        const patternVecs = writeStars(patternPoints, PATTERN_STARS, 1);
        writeStars(fieldPoints, FIELD_STARS, 0.8);
        {
          const posA = constellationLines.geometry.attributes.position;
          const colA = constellationLines.geometry.attributes.color;
          linePairs.forEach(([ai, bi], k) => {
            for (const [j, si] of [[0, ai], [1, bi]]) {
              const v = patternVecs[si];
              posA.setXYZ(k * 2 + j, walker.x + v.x * 1950, y0 + v.y * 1950, walker.z + v.z * 1950);
              const fade = clamp01((v.altDeg + 2) / 10);
              const b = 0.30 * fade * pal.night * (1 - cloud * 0.75);
              colA.setXYZ(k * 2 + j, b * 0.92, b * 0.96, b);
            }
          });
          posA.needsUpdate = true;
          colA.needsUpdate = true;
        }
        // Aurora: strength from latitude + darkness, dimmed by
        // cloud; the ribbons fly poleward of the walker. The
        // daylight gate is the palette's own night factor, not
        // the intensity curve alone (Merlin's QA, 2026-10-23 —
        // a rainbow speckle hanging in a daytime sky): the raw
        // curve ramps in from sun-elevation −4°, while the sky
        // at −4° still reads as evening day to the eye, so the
        // curtains now also need real night before they show.
        env.aurora = auroraIntensity(ll.lat, sol.elevationDeg) * (1 - cloud * 0.7) * pal.night;
        auroraGroup.visible = env.aurora > 0.05;
        if (auroraGroup.visible) {
          const dirZ = ll.lat >= 0 ? -1 : 1;
          auroraGroup.position.set(walker.x, y0 + 235, walker.z + dirZ * 460);
          auroraGroup.lookAt(walker.x, y0 + 235, walker.z);
          auroraRibbons.forEach((r, i) => { r.mesh.material.opacity = env.aurora * (0.55 - i * 0.13); });
        }
        // Clouds wear the sky's light; precipitation arms itself.
        if (env.cloudMaterial) {
          env.cloudMaterial.opacity = cloud * 0.85 * (1 - pal.night * 0.55);
          const cw = 1 - pal.night * 0.78;
          env.cloudMaterial.color.setRGB(cw, cw * 0.99, cw * 1.0);
        }
        const pk = env.wx.precip;
        precip.visible = pk.kind !== 'none' && pk.intensity > 0.03;
        if (precip.visible) {
          if (pk.kind !== precipKind) {
            // The sprite swaps with the kind (streak ↔ disc);
            // a map change needs the material recompiled once.
            precipKind = pk.kind;
            precipMat.map = precipKind === 'snow' ? snowTex : rainTex;
            precipMat.needsUpdate = true;
          }
          precipMat.color.setHex(pk.kind === 'snow' ? 0xffffff : 0xafc8e8);
          precipMat.size = pk.kind === 'snow' ? 0.5 : 0.32;
          precipMat.opacity = pk.kind === 'snow' ? 0.8 : 0.5;
        }
        // Wind (meteorological FROM bearing → world motion).
        if (env.wxRaw && Number.isFinite(env.wxRaw.windDirDeg)) {
          const rad = (env.wxRaw.windDirDeg * Math.PI) / 180;
          const sp = 0.6 + (env.wxRaw.windKmh || 0) * 0.06;
          env.windVX = -Math.sin(rad) * sp;
          env.windVZ = Math.cos(rad) * sp;
        } else { env.windVX = 0.5; env.windVZ = 0.2; }
        // The HUD's sky line (words/icons ride the mapped
        // weather state; the temperature rides the raw read).
        const hudKey = `${env.clock}|${env.phase}|${env.wx.code}|${env.wxRaw ? env.wxRaw.tempC : 'x'}`;
        if (hudKey !== env.hudKey) {
          env.hudKey = hudKey;
          if (!cancelled) {
            setEnvHud({
              clock: env.clock, phase: sol.phase,
              icon: env.wx.icon || null,
              label: env.wx.label || null,
              tempC: env.wxRaw ? env.wxRaw.tempC : null,
            });
          }
        }
      }

      // Weather on a sane cadence: first read at once, then only
      // when the cache says the parcel's weather is stale or the
      // walker has roamed far. Any failure keeps the last sky.
      function maybeFetchWeather(nowMs) {
        if (env.fetchBusy) return;
        const ll = worldToLatLon(walker.x, walker.z);
        if (!shouldRefetchWeather(env.wxLast, ll.lat, ll.lon, nowMs)) return;
        env.wxLast = { lat: ll.lat, lon: ll.lon, atMs: nowMs };
        env.fetchBusy = true;
        fetchCurrentWeather(ll.lat, ll.lon)
          .then((wx) => {
            env.fetchBusy = false;
            if (cancelled || !wx) return;
            env.wxRaw = wx;
            env.wx = weatherToWorld(wx);
          })
          .catch(() => { env.fetchBusy = false; });
      }

      // ── Input: keyboard (window), drag-look + tap (canvas) ──
      const KEYMAP = {
        KeyW: 'fwd', ArrowUp: 'fwd', KeyS: 'back', ArrowDown: 'back',
        KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right',
      };
      function onKeyDown(e) {
        ensureSfx();
        if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') { inputRef.current.keys.shift = true; return; }
        if (e.code === 'Escape') {
          // Build mode closes first; a vehicle is stepped out of
          // next; the planet exit keeps the last Escape.
          if (buildModeRef.current.active) { buildExitRef.current(); return; }
          if (drivingRef.current) { exitVehicle(); return; }
          exitRef.current();
          return;
        }
        if (e.code === 'Space') { inputRef.current.keys.up = true; e.preventDefault(); return; }
        if (e.code === 'KeyC') { inputRef.current.keys.down = true; return; }
        if (e.code === 'KeyE' && drivingRef.current) { exitVehicle(); return; }
        const bm = buildModeRef.current;
        if (bm.active) {
          if (e.code === 'KeyR') { bm.rotY = snapRotation(bm.rotY + 15, bm.pieceId); bm.verdictKey = ''; bm.seatKey = ''; buildRotSyncRef.current(bm.rotY); return; }
          if (e.code === 'KeyQ') { bm.rotY = snapRotation(bm.rotY - 15, bm.pieceId); bm.verdictKey = ''; bm.seatKey = ''; buildRotSyncRef.current(bm.rotY); return; }
          if (e.code === 'KeyF') { bm.orientation = nextOrientation(bm.orientation); bm.verdictKey = ''; bm.seatKey = ''; buildOrientSyncRef.current(bm.orientation); return; }
          if (e.code === 'PageUp') { bm.yLift = Math.min(20, Math.round((bm.yLift + 0.25) * 100) / 100); bm.verdictKey = ''; buildLiftSyncRef.current(bm.yLift); e.preventDefault(); return; }
          if (e.code === 'PageDown') { bm.yLift = Math.max(0, Math.round((bm.yLift - 0.25) * 100) / 100); bm.verdictKey = ''; buildLiftSyncRef.current(bm.yLift); e.preventDefault(); return; }
        }
        const k = KEYMAP[e.code];
        if (k) {
          inputRef.current.keys[k] = true;
          if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
        }
      }
      function onKeyUp(e) {
        if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') { inputRef.current.keys.shift = false; return; }
        if (e.code === 'Space') { inputRef.current.keys.up = false; return; }
        if (e.code === 'KeyC') { inputRef.current.keys.down = false; return; }
        const k = KEYMAP[e.code];
        if (k) inputRef.current.keys[k] = false;
      }
      window.addEventListener('keydown', onKeyDown);
      window.addEventListener('keyup', onKeyUp);

      // Tap-to-shoot (the Bay's interaction, first person): a tap
      // — not a drag — raycasts the mosquito proxies, the sac
      // pickups and Dracula himself.
      const raycaster = new THREE.Raycaster();
      const ndc = new THREE.Vector2();
      // Commit a judged placement into the parcel's build. A
      // carried (moving) piece's original is spliced out first,
      // then the new placement lands as the moved piece. Shared
      // by the camera-ghost tap and the tap-to-aim tap.
      function commitBuildPlacement(placement) {
        const bm = buildModeRef.current;
        const pieces = myParcelPieces(bm.parcelId).slice();
        // Completing a move: splice the carried original out
        // first (appends never shifted its index this
        // session), then the ghost lands as the moved piece.
        if (bm.carried && pieces[bm.carried.index]
          && pieces[bm.carried.index].pieceId === bm.carried.piece.pieceId
          && pieces[bm.carried.index].x === bm.carried.piece.x
          && pieces[bm.carried.index].z === bm.carried.piece.z) {
          pieces.splice(bm.carried.index, 1);
        }
        bm.carried = null;
        pieces.push(placement);
        buildCommitRef.current(bm.parcelId, pieces);
        // The ghost anchors where the piece landed (the aim
        // law): the next piece stacks from the same spot until
        // a drag or a tap re-aims it — walking never drags it.
        bm.aim = { parcelId: bm.parcelId, x: placement.x, z: placement.z };
        bm.verdictKey = ''; // the set changed — judge fresh
        bm.seatKey = '';
      }
      // Tap-to-aim ("tap where you want it"): march the TAP's
      // own ray — set from the tap's screen position, not the
      // camera's centre — down to the terrain. The hit, pulled
      // to the nearest point of the build parcel when it lands
      // outside it, becomes the candidate the pure deriver
      // snaps, footprint-clamps, seats and judges. Returns null
      // when the ray finds no ground at all (the tap fell on
      // sky), so the caller can fall back to the camera ghost.
      function tapAimCandidate() {
        const bm = buildModeRef.current;
        const parcel = bm.parcelId ? parcelById(bm.parcelId) : null;
        if (!parcel) return null;
        const rect = parcelWorldRect(parcel);
        const ray = raycaster.ray;
        let hx = null;
        let hz = null;
        for (let s = 0.5; s <= 120; s += 0.4) {
          const px = ray.origin.x + ray.direction.x * s;
          const py = ray.origin.y + ray.direction.y * s;
          const pz = ray.origin.z + ray.direction.z * s;
          if (py <= heightAt(px, pz) + 0.05) { hx = px; hz = pz; break; }
        }
        if (hx === null) return null;
        const candidate = {
          pieceId: bm.pieceId,
          x: Math.min(PARCEL_BUILD_FRAME.width, Math.max(0, hx - rect.minX)),
          y: 0,
          z: Math.min(PARCEL_BUILD_FRAME.depth, Math.max(0, hz - rect.minZ)),
          rotY: bm.rotY,
          finish: bm.finish,
        };
        if (bm.tint !== null && bm.tint !== undefined) candidate.tint = bm.tint;
        if (bm.orientation && bm.orientation !== 'upright') candidate.orientation = bm.orientation;
        const primary = deriveBuildCandidate(ghostJudgePieces(bm.parcelId), candidate, {
          frame: PARCEL_BUILD_FRAME,
          lift: bm.yLift,
        });
        if (primary.verdict.ok) return primary;
        // Intelligent placement: the aimed transform is
        // unlawful — propose the nearest lawful alternative
        // (slide, quarter-turn, or a flip) instead of a refusal.
        const prop = proposePlacement(ghostJudgePieces(bm.parcelId), candidate, {
          frame: PARCEL_BUILD_FRAME,
          lift: bm.yLift,
        });
        if (!prop) return primary;
        return {
          placement: prop.placement,
          verdict: { ...prop.verdict, proposal: prop.change },
          seat: prop.seat,
          seamed: false,
          proposal: prop.change,
        };
      }
      // Build-mode taps: in Place tool the tap aims and commits
      // (see tapAimCandidate; a groundless tap commits the
      // camera-aimed ghost, as taps always did); in Edit tool
      // the tap selects the placed piece it lands on (or clears
      // the selection on empty ground).
      function buildTap(e) {
        const bm = buildModeRef.current;
        const rect = renderer.domElement.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        ndc.set(
          ((e.clientX - rect.left) / rect.width) * 2 - 1,
          -((e.clientY - rect.top) / rect.height) * 2 + 1,
        );
        raycaster.setFromCamera(ndc, camera);
        // Double-tap a placed piece = pick it up for relocation
        // (Merlin, 2026-10-23). One raycast against the build's
        // roots serves both tools: the same piece tapped twice
        // within 350 ms lifts into the ghost (the React side
        // carries it from there); any other tap re-arms.
        {
          const bst = streamState.get(`build:${bm.parcelId}`);
          let hitIdx = -1;
          if (bst && bst.status === 'resident' && bst.record) {
            const bh = raycaster.intersectObjects(bst.record.roots, true);
            let bo = bh.length ? bh[0].object : null;
            while (bo && !bo.userData.buildPiece) bo = bo.parent;
            if (bo) hitIdx = bo.userData.buildPiece.index;
          }
          const nowTap = performance.now();
          if (hitIdx >= 0
            && lastBuildTap.index === hitIdx
            && lastBuildTap.parcelId === bm.parcelId
            && nowTap - lastBuildTap.at < 350) {
            lastBuildTap = { at: 0, index: -1, parcelId: null };
            buildPickupRef.current(hitIdx);
            return;
          }
          lastBuildTap = { at: nowTap, index: hitIdx, parcelId: bm.parcelId };
        }
        if (bm.tool === 'place') {
          const tapped = tapAimCandidate();
          if (tapped) {
            if (tapped.verdict.ok) {
              commitBuildPlacement(tapped.placement);
              bm.ghostPlacement = tapped.placement;
              bm.verdict = tapped.verdict;
              ghostInfoRef.current(tapped.verdict);
              if (tapped.proposal) {
                noticeRef.current(`🧠 It wouldn't fit as aimed — ${tapped.proposal.charAt(0).toLowerCase()}${tapped.proposal.slice(1)} instead.`);
              }
            } else if (tapped.verdict.reasons && tapped.verdict.reasons.length) {
              noticeRef.current(`🔨 ${tapped.verdict.reasons[0]}`);
            }
            return;
          }
          if (bm.verdict && bm.verdict.ok && bm.ghostPlacement) {
            commitBuildPlacement(bm.ghostPlacement);
            if (bm.verdict.proposal) {
              noticeRef.current(`🧠 It wouldn't fit as aimed — ${bm.verdict.proposal.charAt(0).toLowerCase()}${bm.verdict.proposal.slice(1)} instead.`);
            }
          } else if (bm.verdict && bm.verdict.reasons && bm.verdict.reasons.length) {
            noticeRef.current(`🔨 ${bm.verdict.reasons[0]}`);
          }
          return;
        }
        const st = streamState.get(`build:${bm.parcelId}`);
        if (!st || st.status !== 'resident' || !st.record) {
          bm.editIndex = -1;
          buildSelectRef.current(-1);
          return;
        }
        const hits = raycaster.intersectObjects(st.record.roots, true);
        let obj = hits.length ? hits[0].object : null;
        while (obj && !obj.userData.buildPiece) obj = obj.parent;
        const idx = obj ? obj.userData.buildPiece.index : -1;
        bm.editIndex = idx;
        buildSelectRef.current(idx);
      }
      function handleTap(e) {
        if (buildModeRef.current.active) { buildTap(e); return; }
        if (drivingRef.current) return;
        const rect = renderer.domElement.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        ndc.set(
          ((e.clientX - rect.left) / rect.width) * 2 - 1,
          -((e.clientY - rect.top) / rect.height) * 2 + 1,
        );
        raycaster.setFromCamera(ndc, camera);
        const targets = [
          ...mosquitos.map((mq) => mq.proxy),
          ...sacs.map((s) => s.group),
          ...vehicles.map((v) => v.proxy),
          dracProxy,
          hammondProxy,
        ];
        const hits = raycaster.intersectObjects(targets, true);
        if (!hits.length) return;
        let obj = hits[0].object;
        while (obj && !obj.userData.mosquito && !obj.userData.sacRef && !obj.userData.dracula && !obj.userData.hammond && !obj.userData.vehicle) {
          obj = obj.parent;
        }
        if (!obj) return;
        // Merlin's reversal (2026-10-23): a tap on a vehicle
        // OPERATES it — boarding, with the walk-up prompt's own
        // range law (boardVehicle refuses past 8.5 m with a
        // pointer). Shooting belongs to guns with a reticle in
        // a later build; the mosquito tap-to-shoot is untouched.
        if (obj.userData.vehicle) boardVehicle(obj.userData.vehicle);
        else if (obj.userData.mosquito) shootMosquito(obj.userData.mosquito);
        else if (obj.userData.sacRef) collectSac(obj.userData.sacRef);
        else if (obj.userData.dracula) openExchangeRef.current();
        else if (obj.userData.hammond) {
          // His counter is a conversation, not a drive-by: the
          // panel opens at conversational range; from farther
          // off the tap just points the way.
          const d = Math.hypot(walker.x - HAMMOND_NPC.stand.x, walker.z - HAMMOND_NPC.stand.z);
          if (d <= 8) setHammondPanel(true);
          else noticeRef.current('🏛️ John Hammond waits at the Royal Tyrrell Museum — walk up to his counter to trade fossils.');
        }
      }
      let dragId = null;
      let lastPX = 0;
      let lastPY = 0;
      let downT = 0;
      let dragMoved = 0;
      function onPointerDown(e) {
        ensureSfx();
        dragId = e.pointerId;
        lastPX = e.clientX;
        lastPY = e.clientY;
        downT = performance.now();
        dragMoved = 0;
        try { renderer.domElement.setPointerCapture(e.pointerId); } catch { /* noop */ }
      }
      function onPointerMove(e) {
        if (e.pointerId !== dragId) return;
        const dx = e.clientX - lastPX;
        const dy = e.clientY - lastPY;
        lastPX = e.clientX;
        lastPY = e.clientY;
        dragMoved += Math.abs(dx) + Math.abs(dy);
        inputRef.current.look.dx += dx;
        inputRef.current.look.dy += dy;
      }
      function onPointerUp(e) {
        if (e.pointerId !== dragId) return;
        dragId = null;
        aimDrag = false;
        if (dragMoved < 7 && performance.now() - downT < 450) handleTap(e);
      }
      function onPointerCancel() { dragId = null; aimDrag = false; }
      renderer.domElement.addEventListener('pointerdown', onPointerDown);
      renderer.domElement.addEventListener('pointermove', onPointerMove);
      renderer.domElement.addEventListener('pointerup', onPointerUp);
      renderer.domElement.addEventListener('pointercancel', onPointerCancel);

      // ── Proximity streaming (the plan: lib/earth2/streaming.js)
      // Units load nearest-first through a serial queue — one
      // decode at a time bounds the transient memory spike — when
      // the walker enters a unit's load radius, and release
      // beyond its release radius. The boot set (the spawn
      // neighbourhood) is computed once, here, from the walker's
      // start position; it is all the "Placing the foundry" pill
      // ever counts.
      const streamUnits = worldStreamUnits();
      const streamState = new Map(); // key -> { status: 'loading' | 'resident' | 'failed', record }
      let loadChain = Promise.resolve();

      function teardownStreamUnit(unit, record) {
        if (!record) return;
        const seen = new Set();
        // keepShared records (the Commons dressing) are built
        // entirely from session-shared assets — the model cache's
        // bases, shared geometries and materials — so their
        // roots leave the scene WITHOUT disposal: the cache owns
        // the resources for the session's whole walk.
        for (const root of record.roots || []) {
          scene.remove(root);
          if (!record.keepShared) disposeGraph(root, seen);
        }
        // Detached bases a unit owns but never added to the
        // scene (the court's shared bat base) free their graphs
        // through the same seen set.
        if (!record.keepShared) {
          for (const base of record.bases || []) disposeGraph(base, seen);
        }
        for (const a of animals) if (a.owner === unit.key && a.id) lifecycle.forget(a.id);
        removeWhere(animals, (a) => a.owner === unit.key);
        removeWhere(swimmers, (s) => s.owner === unit.key);
        removeWhere(sway, (s) => s.owner === unit.key);
        removeWhere(labels, (l) => {
          if (l.owner !== unit.key) return false;
          l.el.remove();
          return true;
        });
        removeWhere(vehicleBars, (b) => {
          if (b.owner !== unit.key) return false;
          b.el.remove();
          return true;
        });
        if (unit.kind === 'mosquito') {
          for (const mq of mosquitos) lifecycle.forget(mq.id);
          mosquitos.length = 0;
        }
        if (unit.kind === 'museum') {
          hammondNpc.group = null;
          hammondNpc.rig = null;
          museumStanding = false;
        }
        if (unit.kind === 'airport') airportStanding = false;
        if (unit.kind === 'vehicle') removeWhere(vehicles, (v) => v.owner === unit.key);
        if (unit.kind === 'court') {
          swarmBats.length = 0;
          drac.countForm = null;
          drac.batForm = null;
          drac.batWings = null;
          drac.countRig = null;
          drac.smoke = null;
          dracBatBase = null;
        }
        if (unit.kind === 'build' && unit.build && buildModeRef.current.parcelId === unit.build.groundId) {
          buildModeRef.current.editIndex = -1;
          buildSelectRef.current(-1);
        }
        // A mosquito feeding on a host that just streamed out
        // goes back to cruising; its sacs and bursts are
        // independent scene citizens and stay.
        for (const mq of mosquitos) {
          if (mq.target && mq.target.owner === unit.key) {
            mq.target = null;
            if (mq.phase === 'seeking' || mq.phase === 'feeding') mq.phase = 'cruising';
          }
        }
        for (const s of unit.slugs) setStatusFor(s, null);
      }

      // ── Build units (Building Phase 2) ──────────────────────
      // A build renders as one group of procedural piece meshes
      // (lib/building/piece-render.js) seated by the same datum
      // law as everything else: a piece's world seat is the
      // terrain height at its own centre plus its stored y. Each
      // piece group carries userData.buildPiece { parcelId,
      // index } so edit-mode taps can find it.
      function placeBuildUnit(unit) {
        const build = unit.build;
        const parcel = parcelById(build.groundId);
        if (!parcel) return null;
        const rect = parcelWorldRect(parcel);
        const group = new THREE.Group();
        build.pieces.forEach((piece, i) => {
          const g = buildPieceGroup(THREE, piece.pieceId, piece.finish, piece.tint, piece.orientation);
          const wx = rect.minX + piece.x;
          const wz = rect.minZ + piece.z;
          g.position.set(wx, heightAt(wx, wz) + (piece.y || 0), wz);
          g.rotation.y = ((piece.rotY || 0) * Math.PI) / 180;
          g.userData.buildPiece = { parcelId: build.groundId, index: i };
          group.add(g);
        });
        scene.add(group);
        return { roots: [group] };
      }

      // ── The build-mode ghost ────────────────────────────────
      // A translucent copy of the selected piece stands at its
      // ANCHORED aim point on the parcel being built on (the aim
      // law: walking never drags it — see the aim block below),
      // seated on the tallest top under its footprint (stacking),
      // snapped and seam-connected by the placement engine, and
      // judged live by judgeGhost — green when the placement is
      // lawful, red with the first reason when it is not; when
      // the aimed transform is unlawful, the intelligent placer
      // proposes the nearest lawful one and the ghost stands
      // there instead, the change named in the verdict. The
      // verdict recomputes only when the snapped cell, rotation,
      // stance, lift or the parcel's build signature changes,
      // never blindly per frame.
      let ghostGroup = null;
      let ghostPieceId = null;
      let ghostOrient = null;

      function myParcelPieces(parcelId) {
        const p = buildPropsRef.current;
        const mine = myBuildFor(p.builds, parcelId, p.user);
        return mine ? mine.pieces : [];
      }

      // The set the ghost is judged against: while a piece is
      // carried (being relocated), its original is already
      // spoken for — a move counts against the piece budget
      // once, ever — so the judge sees the set without it, and
      // the ghost may lawfully land where the original stands
      // once the commit splices it out.
      function ghostJudgePieces(parcelId) {
        const bm = buildModeRef.current;
        const pieces = myParcelPieces(parcelId);
        if (bm.carried && bm.parcelId === parcelId
          && pieces[bm.carried.index]
          && pieces[bm.carried.index].pieceId === bm.carried.piece.pieceId
          && pieces[bm.carried.index].x === bm.carried.piece.x
          && pieces[bm.carried.index].z === bm.carried.piece.z) {
          const out = pieces.slice();
          out.splice(bm.carried.index, 1);
          return out;
        }
        return pieces;
      }

      function updateBuildGhost() {
        const bm = buildModeRef.current;
        if (!bm.active || !bm.parcelId) {
          if (ghostGroup) {
            scene.remove(ghostGroup);
            ghostGroup = null;
            ghostPieceId = null;
            ghostOrient = null;
          }
          return;
        }
        if (bm.tool !== 'place') {
          if (ghostGroup) ghostGroup.visible = false;
          return;
        }
        if (!ghostGroup || ghostPieceId !== bm.pieceId) {
          if (ghostGroup) scene.remove(ghostGroup);
          ghostGroup = buildGhostGroup(THREE, bm.pieceId, bm.orientation);
          ghostPieceId = bm.pieceId;
          ghostOrient = bm.orientation;
          scene.add(ghostGroup);
        }
        const parcel = parcelById(bm.parcelId);
        if (!parcel) { ghostGroup.visible = false; return; }
        const rect = parcelWorldRect(parcel);
        // The aim, under the ANCHORED law (Merlin, 2026-10-23:
        // "moving with the joystick should not be attached"):
        // the ghost holds the aim point it was given — by the
        // opening camera march, by a drag (an explicit re-aim),
        // by a tap, or by the last piece placed — and walking
        // never drags it. The camera march below therefore runs
        // only while no anchor holds for this parcel, or while
        // the pointer is down and dragging.
        let aimLocal = bm.aim && bm.aim.parcelId === bm.parcelId && !aimDrag ? bm.aim : null;
        if (!aimLocal) {
          const dir = new THREE.Vector3();
          camera.getWorldDirection(dir);
          let ax = camera.position.x + dir.x * 9;
          let az = camera.position.z + dir.z * 9;
          for (let s = 1.5; s <= 18; s += 0.4) {
            const px = camera.position.x + dir.x * s;
            const pz = camera.position.z + dir.z * s;
            const py = camera.position.y + dir.y * s;
            ax = px; az = pz;
            if (py <= heightAt(px, pz) + 0.05) break;
          }
          aimLocal = { parcelId: bm.parcelId, x: ax - rect.minX, z: az - rect.minZ };
          bm.aim = aimLocal;
        }
        // The aim in the parcel's own frame. A hit that lands
        // outside the parcel — or no hit at all (the march ran
        // into sky and left the aim floating past the edge) —
        // falls back to the NEAREST point of the parcel itself.
        // Then the footprint clamp seats the WHOLE piece inside
        // the frame: the old centre-only clamp let any piece
        // with real width overflow the edge whenever it was
        // aimed past mid-parcel, and the judge refused it
        // forever (Merlin's build video, 2026-10-23). Seams
        // connect last: an edge within a hand's reach of a
        // neighbour's edge slides flush against it.
        const candidate = {
          pieceId: bm.pieceId,
          x: Math.min(PARCEL_BUILD_FRAME.width, Math.max(0, aimLocal.x)),
          y: 0,
          z: Math.min(PARCEL_BUILD_FRAME.depth, Math.max(0, aimLocal.z)),
          rotY: bm.rotY,
          finish: bm.finish,
        };
        if (bm.tint !== null && bm.tint !== undefined) candidate.tint = bm.tint;
        if (bm.orientation && bm.orientation !== 'upright') candidate.orientation = bm.orientation;
        const existing = ghostJudgePieces(bm.parcelId);
        const snapped = clampPlacementToFrame(
          snapSeams(existing, clampPlacementToFrame(snapPlacement(candidate), PARCEL_BUILD_FRAME)).placement,
          PARCEL_BUILD_FRAME,
        );
        const cellKey = `${bm.parcelId}|${snapped.x}|${snapped.z}|${snapped.rotY}|${bm.pieceId}|${bm.orientation}`;
        if (cellKey !== bm.seatKey) {
          bm.seatKey = cellKey;
          bm.yLift = 0;
          buildLiftSyncRef.current(0);
          // Stacking seat: the tallest top whose plan overlaps
          // the ghost's footprint — pieces rest on pieces.
          let seat = 0;
          const piece = pieceById(snapped.pieceId);
          const ghostFp = piece ? pieceFootprint(piece, snapped) : null;
          if (ghostFp) {
            for (const p of existing) {
              const pp = pieceById(p.pieceId);
              const fp = pp ? pieceFootprint(pp, p) : null;
              if (!fp) continue;
              const overlap =
                fp.minX < ghostFp.maxX - 0.01 && ghostFp.minX < fp.maxX - 0.01 &&
                fp.minZ < ghostFp.maxZ - 0.01 && ghostFp.minZ < fp.maxZ - 0.01;
              if (overlap && fp.topY > seat) seat = fp.topY;
            }
          }
          bm.seatY = seat;
        }
        const existingBuild = (buildPropsRef.current.builds || []).find(
          (b) => b && b.groundType === 'earth2-parcel' && b.groundId === bm.parcelId
        );
        const sig = existingBuild ? `${existingBuild.updatedAt || ''}|${existing.length}` : 'none';
        const verdictKey = `${cellKey}|${bm.seatY + bm.yLift}|${sig}|${bm.finish}|${bm.tint ?? ''}`;
        if (verdictKey !== bm.verdictKey) {
          bm.verdictKey = verdictKey;
          const placed = { ...snapped, y: Math.round((bm.seatY + bm.yLift) * 100) / 100 };
          let verdict = judgeGhost(existing, placed, { frame: PARCEL_BUILD_FRAME });
          if (!verdict.ok) {
            // Intelligent placement: before the ghost shows a
            // refusal, the proposer looks for the nearest lawful
            // alternative — the ghost then stands THERE, green,
            // with the change named in the verdict line.
            const prop = proposePlacement(existing, snapped, {
              frame: PARCEL_BUILD_FRAME,
              lift: bm.yLift,
            });
            if (prop) verdict = { ...prop.verdict, proposal: prop.change };
          }
          bm.ghostPlacement = verdict.placement;
          bm.verdict = verdict;
          setGhostValidity(THREE, ghostGroup, verdict.ok);
          ghostInfoRef.current(verdict);
        }
        if (!bm.ghostPlacement) { ghostGroup.visible = false; return; }
        // The ghost wears the JUDGED stance: when the proposer
        // turned or flipped the piece to make it fit, the
        // preview shows that transform — never the one that
        // failed. (Panel stance changes flow through the same
        // sync, via the re-judged verdict.)
        const shownOrient = bm.ghostPlacement.orientation || 'upright';
        if (ghostOrient !== shownOrient) {
          scene.remove(ghostGroup);
          ghostGroup = buildGhostGroup(THREE, bm.pieceId, shownOrient);
          ghostOrient = shownOrient;
          scene.add(ghostGroup);
          if (bm.verdict) setGhostValidity(THREE, ghostGroup, bm.verdict.ok);
        }
        const wx = rect.minX + bm.ghostPlacement.x;
        const wz = rect.minZ + bm.ghostPlacement.z;
        ghostGroup.visible = true;
        ghostGroup.position.set(wx, heightAt(wx, wz) + bm.ghostPlacement.y, wz);
        ghostGroup.rotation.y = (bm.ghostPlacement.rotY * Math.PI) / 180;
      }

      // ── Placement: a crossing (Terrain Wave B) ──────────────
      // The mesh is built FROM the bridge law's own data
      // (lib/earth2/bridges.js): segmented deck slabs follow the
      // profile the walker and the wheels ride, parapets line
      // the edges, side walls hang below the deck — except at
      // the centre, where they stop high and leave the arch
      // opening the River Runner passes through. Abutments
      // found the ends on the banks. Every geometry and material
      // is this unit's own, so teardown disposes them honestly.
      function placeBridge(unit) {
        const b = unit.bridge;
        if (!b) return null;
        const stoneMat = new THREE.MeshStandardMaterial({ color: 0x8a8175, roughness: 1 });
        const stoneDarkMat = new THREE.MeshStandardMaterial({ color: 0x6f675c, roughness: 1 });
        const boxGeo = new THREE.BoxGeometry(1, 1, 1);
        const group = new THREE.Group();
        const W = BRIDGE_DECK_WIDTH_M;
        const segs = Math.max(6, Math.round(b.lengthM / 3));
        const segLen = b.lengthM / segs;
        const archHalf = b.lengthM * 0.2;
        for (let i = 0; i < segs; i++) {
          const t0 = i / segs;
          const t1 = (i + 1) / segs;
          const tm = (t0 + t1) / 2;
          const xm = b.from + (b.to - b.from) * tm;
          const y0 = bridgeDeckYAt(b, t0);
          const y1 = bridgeDeckYAt(b, t1);
          const ym = bridgeDeckYAt(b, tm);
          const tilt = Math.atan2(y1 - y0, segLen);
          const slab = new THREE.Mesh(boxGeo, stoneDarkMat);
          slab.scale.set(segLen + 0.12, 0.45, W);
          slab.position.set(xm, ym - 0.225, b.z);
          slab.rotation.z = tilt;
          group.add(slab);
          for (const side of [-1, 1]) {
            const par = new THREE.Mesh(boxGeo, stoneMat);
            par.scale.set(segLen + 0.12, 0.55, 0.35);
            par.position.set(xm, ym + 0.28, b.z + side * (W / 2 - 0.18));
            par.rotation.z = tilt;
            group.add(par);
            const groundY = Math.max(heightAt(xm, b.z + side * (W / 2 - 0.3)), WATER_Y - 1.2);
            let wallTop = ym - 0.45;
            if (Math.abs(xm - b.centerX) < archHalf) wallTop = Math.min(wallTop, WATER_Y + 1.15);
            if (wallTop - groundY > 0.15) {
              const wall = new THREE.Mesh(boxGeo, stoneMat);
              wall.scale.set(segLen + 0.12, wallTop - groundY, 0.6);
              wall.position.set(xm, (wallTop + groundY) / 2, b.z + side * (W / 2 - 0.3));
              group.add(wall);
            }
          }
        }
        for (const [endX, tt] of [[b.from + 0.8, 0.02], [b.to - 0.8, 0.98]]) {
          const gy = heightAt(endX, b.z) - 1;
          const dy = bridgeDeckYAt(b, tt);
          const ab = new THREE.Mesh(boxGeo, stoneMat);
          ab.scale.set(2.2, Math.max(1, dy - gy), W + 1.6);
          ab.position.set(endX, (dy + gy) / 2, b.z);
          group.add(ab);
        }
        scene.add(group);
        return { roots: [group] };
      }

      // ── Placement: Commons dressing (Terrain Wave B) ────────
      // One parcel's dressing (lib/earth2/scatter.js): foliage
      // cloned from the session model cache, procedural rocks
      // and crater sets from the shared dressing assets — the
      // record is keepShared, so teardown removes the group
      // without disposing anything shared. A parcel under a
      // player's build renders nothing: the build owns the
      // ground while it stands.
      async function placeScatterUnit(unit) {
        const d = unit.dressing;
        if (!d || (!d.foliage.length && !d.rocks.length && !d.craters.length)) {
          return { roots: [], keepShared: true };
        }
        const built = ((buildPropsRef.current && buildPropsRef.current.builds) || [])
          .some((bb) => bb && bb.groundType === 'earth2-parcel' && bb.groundId === unit.parcel.id
            && Array.isArray(bb.pieces) && bb.pieces.length);
        if (built) return { roots: [], keepShared: true };
        const group = new THREE.Group();
        try {
          for (const f of d.foliage) {
            const entry = EARTH2_MODEL_BY_SLUG.get(f.slug);
            if (!entry || !entry.file) continue;
            const base = await loadModelCached(entry);
            const holder = normalize(base.clone(), entry);
            const root = new THREE.Group();
            root.add(holder);
            root.position.set(f.x, heightAt(f.x, f.z) - 0.1, f.z);
            root.rotation.y = f.heading;
            root.scale.setScalar(f.scale);
            group.add(root);
            if (f.role !== 'cover') {
              sway.push({ obj: root, phase: rng() * 6.28, amp: entry.scaleM > 4 ? 0.016 : 0.03, x: f.x, z: f.z, owner: unit.key });
            }
          }
        } catch (err) { /* a species that fails leaves the parcel bare, never broken */ }
        for (const r of d.rocks) {
          const baseR = Math.max(1, Math.round(r.r * 4)) / 4; // rockGeoFor's size class
          const mesh = new THREE.Mesh(rockGeoFor(r.r), rockScatterMat);
          mesh.position.set(r.x, heightAt(r.x, r.z) + r.h * 0.3, r.z);
          mesh.scale.set(r.r / baseR, r.h / r.r, r.r / baseR);
          mesh.rotation.set(0, (r.seed % 628) / 100, 0);
          group.add(mesh);
        }
        for (const c of d.craters) {
          const gy = heightAt(c.x, c.z);
          const bowl = new THREE.Mesh(craterBowlGeo, craterBowlMat);
          bowl.rotation.x = -Math.PI / 2;
          bowl.position.set(c.x, gy + 0.06, c.z);
          bowl.scale.set(c.rimR, c.rimR, 1);
          group.add(bowl);
          const stoneCount = Math.max(6, Math.round(c.rimR * 2.2));
          for (let i = 0; i < stoneCount; i++) {
            const a = (i / stoneCount) * Math.PI * 2;
            const sx = c.x + Math.cos(a) * c.rimR;
            const sz = c.z + Math.sin(a) * c.rimR;
            const s = new THREE.Mesh(rimStoneGeo, rockScatterMat);
            s.position.set(sx, heightAt(sx, sz) + 0.18, sz);
            s.scale.setScalar(0.7 + ((i * 37) % 10) / 14);
            s.rotation.y = a;
            group.add(s);
          }
        }
        scene.add(group);
        return { roots: [group], keepShared: true };
      }

      async function placeStreamUnit(unit) {
        const entryOf = (slug) => EARTH2_MODEL_BY_SLUG.get(slug);
        switch (unit.kind) {
          case 'land': {
            const entry = entryOf(unit.slug);
            return entry && entry.file ? placeLandSpecies(entry, unit.recs, unit.key) : null;
          }
          case 'flyer': {
            const entry = entryOf(unit.slug);
            return entry && entry.file ? placeFlyer(entry, unit.rec, unit.key) : null;
          }
          case 'swimmer': {
            const entry = entryOf(unit.slug);
            return entry && entry.file ? placeSwimmer(entry, unit.rec, unit.key) : null;
          }
          case 'plant': {
            const entry = entryOf(unit.slug);
            return entry && entry.file ? placePlantSpecies(entry, unit.instances, unit.key) : null;
          }
          case 'landform': {
            const entry = entryOf(unit.slug);
            return entry && entry.file ? placeLandform(entry, unit.rec, unit.key) : null;
          }
          case 'swarm':
            return placeCompySwarm(unit.key);
          case 'mosquito':
            return placeMosquitos();
          case 'museum':
            return placeMuseum(unit);
          case 'airport':
            return placeAirport(unit);
          case 'vehicle':
            return placeVehicle(unit);
          case 'build':
            return placeBuildUnit(unit);
          case 'bridge':
            return placeBridge(unit);
          case 'scatter':
            return placeScatterUnit(unit);
          case 'court': {
            const roots = [];
            const castleEntry = entryOf('castle-transylvania');
            if (castleEntry && castleEntry.file && unit.castleRec) {
              const r = await placeLandform(castleEntry, unit.castleRec, unit.key);
              if (r) roots.push(...r.roots);
            }
            const d = await placeDracula();
            if (d) roots.push(...d.roots);
            const b = await placeBatSwarm();
            if (b) roots.push(...b.roots);
            return { roots, bases: dracBatBase ? [dracBatBase] : [] };
          }
          default:
            return null;
        }
      }

      async function runStreamLoad(unit) {
        let record = null;
        try {
          record = await placeStreamUnit(unit);
        } catch (err) {
          record = null;
        }
        if (cancelled) {
          if (record) teardownStreamUnit(unit, record);
          streamState.delete(unit.key);
          return;
        }
        if (record) {
          // The walker may have crossed the unit's whole release
          // radius while its model decoded — never register a
          // resident nobody is near; free it straight away.
          if (streamDistance(unit, walker.x, walker.z) > STREAM_RADII[unit.kind].release) {
            teardownStreamUnit(unit, record);
            streamState.delete(unit.key);
            return;
          }
          streamState.set(unit.key, { status: 'resident', record });
        } else {
          // Total failure: any slug the placement left stuck at
          // 'loading' reads 'failed' — honestly, and the boot
          // pill can complete.
          setStatus((prev) => {
            let next = prev;
            for (const s of unit.slugs) {
              if (next[s] === 'loading') {
                if (next === prev) next = { ...prev };
                next[s] = 'failed';
              }
            }
            return next;
          });
          streamState.set(unit.key, { status: 'failed', record: null });
        }
      }

      function releaseStreamUnit(unit) {
        const st = streamState.get(unit.key);
        if (!st) return;
        if (st.status === 'resident') teardownStreamUnit(unit, st.record);
        streamState.delete(unit.key);
      }

      // Build units are dynamic: their plan is recomputed from
      // the current builds prop on every evaluation, merged with
      // the static world plan. A build whose pieces changed while
      // resident is released and re-placed fresh (its signature is
      // pieces + updatedAt); a build that vanished (packed up, or
      // emptied) releases outright. The parcel being built on is
      // PINNED — it never releases mid-build.
      let buildSigs = new Map();
      let scatterBuilt = new Map();
      function updateStreaming() {
        const bUnits = buildStreamUnits(buildPropsRef.current.builds || []);
        const sigNow = new Map();
        for (const u of bUnits) {
          sigNow.set(u.key, `${(u.build.pieces || []).length}|${u.build.updatedAt || ''}|${JSON.stringify(u.build.pieces)}`);
        }
        const bmNow = buildModeRef.current;
        const pinnedNow = bmNow.active && bmNow.parcelId ? `build:${bmNow.parcelId}` : null;
        for (const [key, sig] of sigNow) {
          if (streamState.has(key) && buildSigs.has(key) && buildSigs.get(key) !== sig) {
            const unit = bUnits.find((x) => x.key === key);
            if (!unit) continue;
            const st = streamState.get(key);
            if (key === pinnedNow && st && st.status === 'resident') {
              // The parcel under the builder's feet: swap the
              // group in place (synchronous) so a placement never
              // flickers the build out for a frame.
              teardownStreamUnit(unit, st.record);
              const record = placeBuildUnit(unit);
              if (record) streamState.set(key, { status: 'resident', record });
              else streamState.delete(key);
            } else {
              releaseStreamUnit(unit);
            }
          }
        }
        for (const key of [...streamState.keys()]) {
          if (key.startsWith('build:') && !sigNow.has(key)) {
            releaseStreamUnit({ key, kind: 'build', slugs: [], build: null });
          }
        }
        buildSigs = sigNow;
        // Commons dressing steps aside for builds the same way:
        // a resident scatter parcel whose built-state flipped
        // (a build landed, or packed up and returned the parcel
        // to the commons) is released; the plan re-places it and
        // placeScatterUnit renders per the current truth.
        {
          const builtNow = new Set();
          for (const b of (buildPropsRef.current.builds || [])) {
            if (b && b.groundType === 'earth2-parcel' && Array.isArray(b.pieces) && b.pieces.length) {
              builtNow.add(b.groundId);
            }
          }
          for (const key of [...streamState.keys()]) {
            if (!key.startsWith('scatter:')) continue;
            const is = builtNow.has(key.slice('scatter:'.length));
            if ((scatterBuilt.get(key) === true) !== is) {
              releaseStreamUnit({ key, kind: 'scatter', slugs: [] });
            }
            scatterBuilt.set(key, is);
          }
        }
        const bm = buildModeRef.current;
        const pinnedKey = bm.active && bm.parcelId ? `build:${bm.parcelId}` : null;
        // Vehicle units are dynamic like builds: computed fresh
        // from the live state map every evaluation, so a machine's
        // anchor is wherever it currently sits. The machine being
        // driven anchors on the walker itself (distance ~0) and
        // is pinned besides — it never streams out mid-drive.
        const vUnits = vehicleStreamUnits(vehicleStatesRef.current);
        const actions = planStreamActions(
          streamUnits.concat(bUnits, vUnits), new Set(streamState.keys()), walker.x, walker.z
        );
        for (const u of actions.release) {
          if (u.key === pinnedKey) continue;
          if (drivingRef.current && u.key === `vehicle:${drivingRef.current}`) continue;
          releaseStreamUnit(u);
        }
        for (const u of actions.load) {
          streamState.set(u.key, { status: 'loading', record: null });
          loadChain = loadChain.then(() => runStreamLoad(u));
        }
      }
      buildSceneRef.current.refreshBuilds = () => updateStreaming();

      {
        const entryUnits = streamEntryUnits(walker.x, walker.z);
        const slugs = [];
        for (const u of entryUnits) {
          for (const s of u.slugs) {
            const e = EARTH2_MODEL_BY_SLUG.get(s);
            if (e && e.file) slugs.push(s);
          }
        }
        if (!cancelled) setBootSlugs(slugs);
      }
      updateStreaming();

      // ── The frame ────────────────────────────────────────────
      let raf = 0;
      let frameNo = 0;
      let envAgeS = 99; // due at once: the sky is right from frame one
      let swayClock = 0; // plant-sway time, paced by the real wind
      const labelV = new THREE.Vector3();
      function tick() {
        raf = requestAnimationFrame(tick);
        frameNo += 1;
        // Streaming decisions a few times a second — loads queue
        // through the serial chain, releases land here at the
        // top of the frame, before any life loop iterates the
        // shared arrays.
        if (frameNo % 15 === 1) updateStreaming();
        const dt = Math.min(clock.getDelta(), 0.05);
        const t = clock.elapsedTime;
        const inp = inputRef.current;

        // The living sky + weather refresh about once a second;
        // the lifecycle's due respawns stand up with it.
        envAgeS += dt;
        if (envAgeS >= 1) {
          envAgeS = 0;
          updateEnvironment(Date.now());
          maybeFetchWeather(Date.now());
          processRespawns(t);
        }
        swayClock += dt * env.wx.windSway;
        // Clouds ride the real wind, wrapping around the walker;
        // aurora curtains ripple; precipitation falls through
        // its box around the walker and recycles at the ground.
        for (const spr of cloudSprites) {
          spr.position.x += (env.windVX || 0) * dt;
          spr.position.z += (env.windVZ || 0) * dt;
          if (Math.abs(spr.position.x - walker.x) > 850) spr.position.x = walker.x - (spr.position.x - walker.x) * 0.92;
          if (Math.abs(spr.position.z - walker.z) > 850) spr.position.z = walker.z - (spr.position.z - walker.z) * 0.92;
        }
        if (auroraGroup.visible) {
          for (let ri = 0; ri < auroraRibbons.length; ri++) {
            const { mesh, base } = auroraRibbons[ri];
            const attr = mesh.geometry.attributes.position;
            const arr = attr.array;
            for (let vi = 0; vi < arr.length; vi += 3) {
              const bx = base[vi];
              arr[vi + 2] = Math.sin(bx * 0.011 + t * 0.7 + ri * 1.7) * 14 + Math.sin(bx * 0.023 - t * 0.43 + ri) * 7;
              arr[vi + 1] = base[vi + 1] + Math.sin(bx * 0.017 + t * 0.5 + ri * 2.1) * 6;
            }
            attr.needsUpdate = true;
          }
        }
        if (precip.visible) {
          const pk = env.wx.precip;
          const fall = pk.kind === 'snow' ? 2.4 : 26;
          const gy = heightAt(walker.x, walker.z);
          for (let pi = 0; pi < PRECIP_COUNT; pi++) {
            let px = precipPos[pi * 3] + (env.windVX || 0) * dt * 2.2;
            let py = precipPos[pi * 3 + 1] - fall * dt * (0.7 + pk.intensity * 0.6);
            let pz = precipPos[pi * 3 + 2] + (env.windVZ || 0) * dt * 2.2;
            if (py < gy - 1 || !Number.isFinite(py)) {
              px = walker.x + (rng() - 0.5) * 72;
              pz = walker.z + (rng() - 0.5) * 72;
              py = gy + 26 + rng() * 10;
            }
            precipPos[pi * 3] = px;
            precipPos[pi * 3 + 1] = py;
            precipPos[pi * 3 + 2] = pz;
          }
          precipGeo.attributes.position.needsUpdate = true;
        }

        // Look: consume the accumulated drag deltas.
        if (inp.look.dx !== 0 || inp.look.dy !== 0) {
          const l = applyWorldLook(walker.yaw, walker.pitch, inp.look.dx, inp.look.dy);
          walker.yaw = l.yaw;
          walker.pitch = l.pitch;
          inp.look.dx = 0;
          inp.look.dy = 0;
        }

        // Move: keyboard + joystick, Earth laws enforced inside
        // stepWorldWalker (colliders, wading, the world's edge).
        const fwdIn = (inp.keys.fwd ? 1 : 0) - (inp.keys.back ? 1 : 0) + inp.joy.y;
        const strafeIn = (inp.keys.right ? 1 : 0) - (inp.keys.left ? 1 : 0) + inp.joy.x;
        const travelNow = travelRef.current || inp.keys.shift;
        const dyn = [{ x: DRACULA_SPOT.x, z: DRACULA_SPOT.z, r: 1.3 }];
        // Solid Earth law for the museum mount: Hammond himself,
        // and the building — a circle seated a few metres north
        // of the parcel centre, so its bulk blocks the walker
        // while the south apron (and Hammond's counter, 8 m south
        // of centre) stays reachable well inside trade range.
        if (hammondNpc.group) dyn.push({ x: HAMMOND_NPC.stand.x, z: HAMMOND_NPC.stand.z, r: 1.0 });
        if (museumStanding) dyn.push({ x: MUSEUM_CENTER.x, z: MUSEUM_CENTER.z - 3.5, r: 9 });
        // The airfield terminal, seated at the field's centre —
        // a generous circle, so the apron and the fleet's row
        // east of it stay clear for walkers and machines alike.
        if (airportStanding) dyn.push({ x: AIRPORT_CENTER.x, z: AIRPORT_CENTER.z, r: 13 });
        // Parked machines are solid; the one being driven is
        // the walker, and never collides with itself. The
        // radius carries a clearance margin past the hull
        // (Merlin's build video, 2026-10-23: the camera clipped
        // inside the Scarab's hull at closest approach — the
        // spec radius is the hull's own half-extent, and the
        // walker's eye needs its own room beyond it).
        for (const v of vehicles) {
          if (v.key === drivingRef.current) continue;
          const vst = vehicleStatesRef.current[v.key];
          if (vst) dyn.push({ x: vst.x, z: vst.z, r: v.spec.radius + 0.35 });
        }
        for (const a of animals) {
          if (a.flyer || a.compy) continue;
          const dx = a.root.position.x - walker.x;
          const dz = a.root.position.z - walker.z;
          if (dx * dx + dz * dz < 3600) {
            dyn.push({ x: a.root.position.x, z: a.root.position.z, r: Math.max(1.0, a.entry.scaleM * 0.36) });
          }
        }
        const drivingId = drivingRef.current;
        const dSpec = drivingId ? vehicleSpecForInstance(drivingId) : null;
        const dState = drivingId ? vehicleStatesRef.current[drivingId] : null;
        if (dSpec && dState && !buildModeRef.current.active) {
          // ── Driving: the pure step law (lib/earth2/vehicles.js)
          // owns the motion — terrain following, slope pitch/roll,
          // colliders, the world's edge; the VTOL lifts on
          // Space/C and tilts into its motion. Phase 2: there are
          // no walls and no refused landings — deep water fades a
          // ground machine's power and drowns her, and every
          // arrival is JUDGED by the damage law (descent, tilt,
          // slope) and billed to the integrity bar.
          const lift = dSpec.air ? (inp.keys.up ? 1 : 0) - (inp.keys.down ? 1 : 0) : 0;
          let dEnv;
          if (dSpec.water) {
            // Afloat: the water-depth read and the obstacles —
            // bridge piers plus the static solid world.
            dEnv = { waterDepthAt, colliders: boatColliders(currentColliders()) };
          } else if (dSpec.air) {
            // Phase 2 (Phase A's deck flag): the VTOL reads the
            // crossings too — over a deck the water reads DRY, so
            // a good deck landing is judged a landing and never
            // a ditch; and once she's down at deck height, the
            // deck is her ground, so the touchdown's tilt is
            // judged against the deck, not the riverbed below.
            const deckHereV = bridgeHeightAt(dState.x, dState.z);
            const yNowV = heightAt(dState.x, dState.z) + (dState.alt || 0);
            const nearDeckV = deckHereV != null && Math.abs(yNowV - deckHereV) < 1.2;
            dEnv = {
              heightAt: nearDeckV
                ? (x, z) => { const d = bridgeHeightAt(x, z); return d == null ? heightAt(x, z) : d; }
                : heightAt,
              waterDepthAt: (x, z) => (bridgeHeightAt(x, z) != null ? 0 : waterDepthAt(x, z)),
              colliders: currentColliders().concat(dyn),
            };
          } else {
            // A ground machine rides the crossings: the height
            // read is the deck while the machine is deck-borne
            // (deep water beneath it, or its last step's height
            // says so), and the depth read treats any candidate
            // ON a deck as dry — so the wading wall guards the
            // deck's sides exactly as it guards a shoreline.
            const deckHere = bridgeHeightAt(dState.x, dState.z);
            const onDeck = deckHere != null
              && (waterDepthAt(dState.x, dState.z) > MAX_WADE_DEPTH_M
                || Math.abs((dState.y != null ? dState.y : heightAt(dState.x, dState.z)) - deckHere) < 0.9);
            dEnv = {
              heightAt: onDeck
                ? (x, z) => { const d = bridgeHeightAt(x, z); return d == null ? heightAt(x, z) : d; }
                : heightAt,
              waterDepthAt: (x, z) => (bridgeHeightAt(x, z) != null ? 0 : waterDepthAt(x, z)),
              colliders: currentColliders().concat(dyn),
            };
          }
          const stepped = stepVehicle(dState, dSpec, {
            throttle: Math.max(-1, Math.min(1, fwdIn)),
            steer: -strafeIn,
            lift,
          }, dt, dEnv);
          vehicleStatesRef.current[drivingId] = stepped;
          walker.x = stepped.x;
          walker.z = stepped.z;
          const rec = vehicles.find((v) => v.key === drivingId);
          if (rec) poseVehicle(rec, stepped, t, dt);
          camera.position.set(stepped.x, stepped.y + dSpec.eyeHeight, stepped.z);
          camera.rotation.set(walker.pitch, walker.yaw, 0);
          if (frameNo % 10 === 0 && !cancelled) {
            setDriveInfo({ speed: Math.abs(stepped.speed || 0), alt: stepped.alt || 0, integrity: stepped.integrity ?? 100 });
          }
          if (frameNo % 120 === 0) saveVehicleStates(vehicleStatesRef.current);
          drivePhaseB(dState, stepped, dSpec, drivingId, t);
        } else {
          // On a crossing — or one step from its deck — the
          // bridge walker law owns the step (Terrain Wave B):
          // the deck is ground, its sides are guarded by the
          // same wading wall that guards every shore, and the
          // ends are the only way off.
          const walkCols = currentColliders().concat(dyn);
          const deckNear = bridgeHeightAt(walker.x, walker.z) != null
            || bridgeHeightAt(walker.x - Math.sin(walker.yaw) * 1.4, walker.z - Math.cos(walker.yaw) * 1.4) != null;
          const next = deckNear
            ? stepBridgeWalker(walker, walker.yaw, { fwd: fwdIn, strafe: strafeIn }, dt, {
              heightAt, waterDepthAt, bridgeHeightAt, colliders: walkCols, travel: travelNow,
            })
            : stepWorldWalker(walker, walker.yaw, { fwd: fwdIn, strafe: strafeIn }, dt, walkCols, travelNow);
          const movedDist = Math.hypot(next.x - walker.x, next.z - walker.z);
          walker.x = next.x;
          walker.z = next.z;
          const deckY = bridgeHeightAt(walker.x, walker.z);
          const groundY = deckY != null ? deckY : heightAt(walker.x, walker.z);
          const depth = Math.max(0, WATER_Y - groundY);
          let bob = 0;
          if (!reducedMotion && movedDist > 1e-4 && depth < 0.2) {
            bobT += dt * (travelNow ? 13 : 8.5);
            bob = Math.abs(Math.sin(bobT)) * 0.055;
          }
          camera.position.set(
            walker.x,
            groundY + WALK_EYE_M - Math.min(depth, 1.1) * 0.3 + bob,
            walker.z,
          );
          camera.rotation.set(walker.pitch, walker.yaw, 0);
        }
        syncParcel(false);
        updateBuildGhost();
        castleNear = Math.hypot(walker.x - CASTLE_AT[0], walker.z - CASTLE_AT[1]) < 800;

        // Hammond's counter range: the trade prompt lives within
        // 4 m of his stand point, and an open panel closes when
        // the walker drifts off — both checked on threshold
        // crossings only, so the frame loop never spams React.
        {
          const hd = Math.hypot(walker.x - HAMMOND_NPC.stand.x, walker.z - HAMMOND_NPC.stand.z);
          const near = hd <= 4;
          if (near !== nearHammondRef.current) {
            nearHammondRef.current = near;
            if (!cancelled) setNearHammond(near);
          }
          if (hd > 9 && hammondOpenRef.current) setHammondPanel(false);
        }

        // The fleet's board prompt: the nearest machine within
        // 3.5 m offers its verb (Drive / Ride / Fly), on
        // threshold crossings only — the Hammond pattern.
        {
          let best = null;
          let bestD = 3.5;
          if (!drivingRef.current && !buildModeRef.current.active) {
            const myKey = claimKeyForUser(buildPropsRef.current && buildPropsRef.current.user);
            for (const id of Object.keys(vehicleStatesRef.current)) {
              const vst = vehicleStatesRef.current[id];
              if (!vst || vst.wrecked) continue;
              if (isClaimed(vst) && vst.claimedBy !== myKey) continue; // someone's personal machine
              const d = Math.hypot(walker.x - vst.x, walker.z - vst.z);
              if (d <= bestD) { bestD = d; best = id; }
            }
          }
          if (best !== nearVehicleRef.current) {
            nearVehicleRef.current = best;
            if (!cancelled) setNearVehicle(best);
          }
        }

        // Wrecks count down to their replacement (the law's
        // 5-second timer): tick every wrecked instance, and when
        // the fresh home state lands within sight, a gold shimmer
        // marks the swap so the new machine never just pops in.
        {
          let respawnDirty = false;
          for (const id of Object.keys(vehicleStatesRef.current)) {
            const vst = vehicleStatesRef.current[id];
            if (!vst || !vst.wrecked) continue;
            const home = homeStateForInstance(id);
            if (!home) continue;
            const next = tickVehicleRespawn(vst, home, dt);
            if (next !== vst) {
              vehicleStatesRef.current[id] = next;
              respawnDirty = true;
              if (!next.wrecked) {
                const nd = Math.hypot(walker.x - next.x, walker.z - next.z);
                if (nd < 320) {
                  const spec2 = vehicleSpecForInstance(id);
                  fireShimmer(next.x, spec2 && spec2.water ? WATER_Y + 0.8 : heightAt(next.x, next.z) + 1.2, next.z);
                }
              }
            }
          }
          if (respawnDirty) saveVehicleStates(vehicleStatesRef.current);
        }

        // Ownership upkeep (fleet.js): stamp departures of
        // claimed machines (first exit of the home radius), and
        // when a claimed machine has been away past the delay
        // with its home standing empty, a fresh UNCLAIMED stock
        // machine shimmers in at the home — the spot stays
        // stocked for the next driver. The claimed machine
        // itself is never touched by any of this.
        {
          const nowMs = Date.now();
          let ownDirty = false;
          for (const id of Object.keys(vehicleStatesRef.current)) {
            const vst = vehicleStatesRef.current[id];
            if (!vst || !isClaimed(vst)) continue;
            const home = homeStateForInstance(id);
            if (!home) continue;
            const noted = noteDeparture(vst, home, nowMs);
            if (noted !== vst) { vehicleStatesRef.current[id] = noted; ownDirty = true; }
          }
          for (const inst of vehicleInstances()) {
            if (!stockDueForHome(vehicleStatesRef.current, inst.id, nowMs)) continue;
            const stockId = nextStockId(vehicleStatesRef.current, inst.id);
            const fresh = stockId && freshStockState(inst.id);
            if (!stockId || !fresh) continue;
            vehicleStatesRef.current[stockId] = fresh;
            ownDirty = true;
            const nd = Math.hypot(walker.x - fresh.x, walker.z - fresh.z);
            if (nd < 320) {
              const spec3 = vehicleSpecForInstance(stockId);
              fireShimmer(fresh.x, spec3 && spec3.water ? WATER_Y + 0.8 : heightAt(fresh.x, fresh.z) + 1.2, fresh.z);
            }
          }
          if (ownDirty) saveVehicleStates(vehicleStatesRef.current);
        }

        // Parked machines hold their pose on the terrain (a
        // machine left on a slope sits on the slope); the driven
        // one was posed by the drive step above. A boat rides
        // its waterline; a machine parked on a crossing sits ON
        // the deck (deep water beneath it is the tell).
        for (const v of vehicles) {
          if (v.key === drivingRef.current) continue;
          const vst = vehicleStatesRef.current[v.key];
          if (!vst) continue;
          if (v.spec.water) {
            poseVehicle(v, { ...vst, y: WATER_Y - v.spec.draft, pitch: 0, roll: 0 }, t, dt);
            continue;
          }
          const deckY = bridgeHeightAt(vst.x, vst.z);
          const onDeck = deckY != null && !v.spec.air && waterDepthAt(vst.x, vst.z) > MAX_WADE_DEPTH_M;
          const pose = groundPose(vst, v.spec, onDeck
            ? (x, z) => { const d = bridgeHeightAt(x, z); return d == null ? heightAt(x, z) : d; }
            : heightAt);
          poseVehicle(v, { ...vst, y: onDeck ? pose.y : pose.y + (vst.alt || 0), pitch: pose.pitch, roll: pose.roll + (vst.wrecked ? 0.38 : 0) }, t, dt);
        }

        // Life, by proximity: land animals animate within 260 m
        // and hide past 520 m; flyers and swimmers always run
        // (they are few) with far visibility caps.
        for (const a of animals) {
          const d = Math.hypot(a.root.position.x - walker.x, a.root.position.z - walker.z);
          if (a.flyer) {
            a.root.visible = d < 1000;
            if (a.root.visible) driveAnimal(a, t, dt);
          } else {
            a.root.visible = d < 520;
            if (d < 260) driveAnimal(a, t, dt);
            else if (a.walker) {
              // Frozen mid-stride is fine at range; keep the feet
              // planted on the terrain regardless.
              a.root.position.y = heightAt(a.root.position.x, a.root.position.z);
            }
          }
        }
        for (const s of swimmers) {
          const d = Math.hypot(s.root.position.x - walker.x, s.root.position.z - walker.z);
          s.root.visible = d < 750;
          if (s.root.visible) updateSwimmer(s, t, dt, env.night > 0.45 ? 0.45 : 1);
        }
        if (waterTex) waterTex.offset.set((t * 0.008) % 1, (t * 0.005) % 1);
        if (waterMat) waterMat.opacity = 0.48 + Math.sin(t * 0.6) * 0.04;
        for (const mq of mosquitos) {
          const d = Math.hypot(mq.group.position.x - walker.x, mq.group.position.z - walker.z);
          if (mq.phase !== 'gone') mq.group.visible = d < 550;
          updateMosquito(mq, t, dt);
        }
        updateDracula(t, dt);
        // Hammond's idle life at his counter — the Count's idle
        // pattern on his own Mixamo rig: a slow breath through
        // the spine, a founder's unhurried look around, a gentle
        // weight-shift bob. Phases offset from Dracula's so the
        // two elders never breathe in sync.
        if (hammondNpc.group) {
          hammondNpc.group.position.y = HAMMOND_NPC.stand.y + Math.sin(t * 0.8 + 1.7) * 0.02;
          const rig = hammondNpc.rig;
          if (rig) {
            const br = Math.sin(t * 0.7 + 1.7) * 0.018;
            rig.roles.spine.forEach((b, i) => bendBoneTo(b, rig.bind.get(b.uuid), BEND_X, br * (0.6 + i * 0.3)));
            const yaw = (Math.sin(t * 0.19 + 1.7) * 0.6 + Math.sin(t * 0.113 + 0.6) * 0.4) * 0.2;
            const neckShare = rig.roles.neck.length ? 0.4 / rig.roles.neck.length : 0;
            rig.roles.neck.forEach((b) => bendBoneTo(b, rig.bind.get(b.uuid), BEND_Y, yaw * neckShare));
            if (rig.roles.head) bendBoneTo(rig.roles.head, rig.bind.get(rig.roles.head.uuid), BEND_Y, yaw * 0.6);
          }
        }
        // Blood sacs pulse; stepping up to one picks it up.
        for (let i = sacs.length - 1; i >= 0; i--) {
          const s = sacs[i];
          s.group.position.y = s.baseY + Math.sin(t * 2.4 + i) * 0.08;
          const pulse = 1 + Math.sin(t * 3.2 + i * 1.7) * 0.08;
          s.core.scale.set(pulse, 1.25 * pulse, pulse);
          const dx = s.group.position.x - walker.x;
          const dz = s.group.position.z - walker.z;
          if (dx * dx + dz * dz < 2.6 * 2.6) collectSac(s);
        }
        for (let i = bursts.length - 1; i >= 0; i--) {
          const b = bursts[i];
          b.life += dt;
          const attr = b.points.geometry.attributes.position;
          for (let j = 0; j < b.vels.length; j++) {
            b.vels[j][1] -= 4 * dt;
            attr.array[j * 3] += b.vels[j][0] * dt;
            attr.array[j * 3 + 1] += b.vels[j][1] * dt;
            attr.array[j * 3 + 2] += b.vels[j][2] * dt;
          }
          attr.needsUpdate = true;
          b.points.material.opacity = Math.max(0, 1 - b.life / 0.45);
          if (b.life > 0.45) {
            scene.remove(b.points);
            bursts.splice(i, 1);
          }
        }
        for (const s of sway) {
          const d2 = (s.x - walker.x) ** 2 + (s.z - walker.z) ** 2;
          s.obj.visible = d2 < 260 * 260;
          if (d2 < 200 * 200) {
            // swayClock runs at the real wind's pace (env.wx).
            s.obj.rotation.z = Math.sin(swayClock * 0.85 + s.phase) * s.amp * 0.85;
            s.obj.rotation.x = Math.cos(swayClock * 0.6 + s.phase) * s.amp * 0.5;
          }
        }
        updateExplosions(dt);
        if (shakeAmp > 0.003) {
          camera.position.x += (rng() - 0.5) * shakeAmp * 0.55;
          camera.position.y += (rng() - 0.5) * shakeAmp * 0.42;
          camera.rotation.z += (rng() - 0.5) * shakeAmp * 0.05;
          shakeAmp *= Math.exp(-5 * dt);
        } else shakeAmp = 0;
        renderer.render(scene, camera);
        // Labels: near creatures only, projected each frame.
        const w = mount.clientWidth, h = mount.clientHeight;
        // Vehicle nameplates de-collide (Merlin's build video:
        // the apron row smeared into one unreadable line —
        // "Speed BikeExpedition Rover"). The rule: among the
        // vehicle plates on screen, the NEAREST machine keeps
        // its place at full strength; a plate that would land
        // on top of a nearer one stacks a step below it, dimmed;
        // a plate with three nearer neighbours in its space
        // waits hidden until the walker closes in and the pile
        // thins. Integrity bars follow their plate's stack.
        const vehStack = new Map(); // label -> stack level
        const vehStackByRoot = new Map(); // vehicle root -> stack level
        {
          const plates = [];
          for (const l of labels) {
            if (l.kind !== 'vehicle' || !l.obj.visible) continue;
            const d = Math.hypot(l.obj.position.x - walker.x, l.obj.position.z - walker.z);
            if (d > l.maxDist) continue;
            l.obj.getWorldPosition(labelV);
            labelV.y += l.h;
            labelV.project(camera);
            if (labelV.z > 1 || labelV.z < -1) continue;
            plates.push({ l, d, x: (labelV.x * 0.5 + 0.5) * w, y: (-labelV.y * 0.5 + 0.5) * h });
          }
          plates.sort((a, b) => a.d - b.d);
          for (let i = 0; i < plates.length; i++) {
            let level = 0;
            for (let j = 0; j < i; j++) {
              if (Math.abs(plates[j].x - plates[i].x) < 120 && Math.abs(plates[j].y - plates[i].y) < 30) level++;
            }
            vehStack.set(plates[i].l, Math.min(level, 3));
            vehStackByRoot.set(plates[i].l.obj, Math.min(level, 3));
          }
        }
        for (const l of labels) {
          if (!l.obj.visible) { l.el.style.display = 'none'; continue; }
          const d = Math.hypot(l.obj.position.x - walker.x, l.obj.position.z - walker.z);
          if (d > l.maxDist) { l.el.style.display = 'none'; continue; }
          l.obj.getWorldPosition(labelV);
          labelV.y += l.h;
          labelV.project(camera);
          if (labelV.z > 1 || labelV.z < -1) { l.el.style.display = 'none'; continue; }
          let stackLevel = 0;
          if (l.kind === 'vehicle') {
            stackLevel = vehStack.get(l) || 0;
            if (stackLevel >= 3) { l.el.style.display = 'none'; continue; }
          }
          l.el.style.display = '';
          if (l.kind === 'vehicle') {
            const op = stackLevel === 0 ? '' : '0.55';
            if (l.el.style.opacity !== op) l.el.style.opacity = op;
          }
          const x = (labelV.x * 0.5 + 0.5) * w;
          const y = (-labelV.y * 0.5 + 0.5) * h + stackLevel * 16;
          l.el.style.transform = `translate(-50%, -100%) translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
        }
        // Phase 2 integrity bars: a hurt machine in view wears
        // her bar under her name — projected like the labels,
        // with DOM writes only when the rounded percent moves
        // (or the shot-flash outline toggles).
        for (const b of vehicleBars) {
          const bst = vehicleStatesRef.current[b.rec.key];
          const pct = bst ? (bst.integrity ?? 100) : 100;
          const stackLevel = vehStackByRoot.get(b.rec.root) || 0;
          const show = !!bst && pct < 100 && drivingRef.current !== b.rec.key
            && b.rec.root.visible
            && stackLevel < 3
            && (walker.x - bst.x) ** 2 + (walker.z - bst.z) ** 2 < 130 * 130;
          if (!show) {
            if (b.el.style.display !== 'none') b.el.style.display = 'none';
            continue;
          }
          b.rec.root.getWorldPosition(labelV);
          labelV.y += b.h;
          labelV.project(camera);
          if (labelV.z > 1 || labelV.z < -1) {
            if (b.el.style.display !== 'none') b.el.style.display = 'none';
            continue;
          }
          b.el.style.display = '';
          const bx = (labelV.x * 0.5 + 0.5) * w;
          const by = (-labelV.y * 0.5 + 0.5) * h + stackLevel * 16;
          b.el.style.transform = `translate(-50%, -100%) translate(${bx.toFixed(1)}px, ${by.toFixed(1)}px)`;
          const rp = Math.round(pct);
          if (rp !== b.lastPct) {
            b.lastPct = rp;
            b.fill.style.width = `${rp}%`;
            b.fill.style.background = integrityColor(rp);
          }
          const outline = performance.now() < b.flashUntil
            ? '0 0 0 2px rgba(255,220,130,0.95), 0 0 10px rgba(255,190,80,0.8)'
            : '';
          if (outline !== b.outline) {
            b.outline = outline;
            b.el.style.boxShadow = outline;
          }
        }
      }

      const onResize = () => {
        const w = mount.clientWidth, h = mount.clientHeight;
        if (!w || !h) return;
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
      };
      onResize();
      const ro = new ResizeObserver(onResize);
      ro.observe(mount);
      tick();

      cleanup = () => {
        cancelAnimationFrame(raf);
        ro.disconnect();
        window.removeEventListener('keydown', onKeyDown);
        window.removeEventListener('keyup', onKeyUp);
        renderer.domElement.removeEventListener('pointerdown', onPointerDown);
        renderer.domElement.removeEventListener('pointermove', onPointerMove);
        renderer.domElement.removeEventListener('pointerup', onPointerUp);
        renderer.domElement.removeEventListener('pointercancel', onPointerCancel);
        for (const l of labels) l.el.remove();
        for (const b of vehicleBars) b.el.remove();
        scene.traverse((o) => {
          if (o.geometry) o.geometry.dispose();
          if (o.material) {
            const mats = Array.isArray(o.material) ? o.material : [o.material];
            for (const m of mats) {
              for (const key of Object.keys(m)) if (m[key] && m[key].isTexture) m[key].dispose();
              m.dispose();
            }
          }
        });
        renderer.dispose();
        if (renderer.domElement.parentElement === mount) mount.removeChild(renderer.domElement);
      };
      if (cancelled) cleanup();
    })();
    return () => { cancelled = true; cleanup(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const parcel = hud ? hud.parcel : null;
  const buildParcel = buildParcelId ? parcelById(buildParcelId) : null;
  const myParcelBuild = buildParcelId
    ? myBuildFor(builds || [], buildParcelId, buildUser || null)
    : null;
  const buildPieceCount = myParcelBuild ? myParcelBuild.pieces.length : 0;
  const selPieceDef = pieceById(selPieceId);
  const allowedFinishes = FINISHES.filter((f) => !selPieceDef || finishAllowed(selPieceDef, f.id));
  const categoryPieces = BUILDING_PIECES.filter((p) => p.category === buildCat);
  const selectedPlaced = editIndex !== null && myParcelBuild
    ? myParcelBuild.pieces[editIndex] || null
    : null;

  return (
    <div className="fixed inset-0 z-[80] overflow-hidden bg-[#0a1410]">
      <div ref={mountRef} className="absolute inset-0" />
      <div ref={labelsRef} className="pointer-events-none absolute inset-0 overflow-hidden" />

      {/* The Earth 2 concourse: the standing HUD lives in
          draggable, shrinkable panels (Merlin's order — "all
          controls should live in a concourse just like the main
          hub ... and be shrinkable and moveable"). The parcel
          readout and the controls each get a panel, the build
          workbench below is the third; positions and shrunk
          states persist per device (earth2:panels:v1). Panels
          take pointer events only on their own box — the rest
          of the screen belongs to the world. */}
      <E2Panel
        layout={panelLayout.parcel}
        onMove={(pos) => movePanel('parcel', pos)}
        onToggle={() => togglePanel('parcel')}
        panelClass={`w-[320px] max-w-[calc(100vw-1rem)] rounded-2xl border bg-black/55 text-zinc-100 backdrop-blur-sm ${hud && hud.mine ? 'border-sky-300/50' : 'border-amber-300/30'}`}
        headerClass="px-3.5 pt-2.5"
        bodyClass="px-3.5 pb-2.5 pt-1"
        header={(
          <div className="flex min-w-0 items-baseline gap-2">
            <span className="shrink-0 text-[10px] font-black tracking-[0.25em] text-amber-200">
              🚶 EARTH 2 — ON FOOT
            </span>
            {panelLayout.parcel.collapsed && parcel && (
              <span className="truncate text-[11px] font-bold text-white">{parcel.name}</span>
            )}
          </div>
        )}
      >
          {parcel ? (
            <>
              <div className="text-lg font-black leading-tight text-white">
                {parcel.name}
                {isCastleParcel(parcel) ? ' 🏰' : ''}
              </div>
              <div className="text-[11px] leading-snug text-zinc-300">
                {parcel.id} · {TIER_LABEL[parcel.tier] || parcel.tier} land ·{' '}
                {parcel.ownable ? 'Ownable' : '🌿 Free Commons'}
              </div>
              <div className="text-[11px] leading-snug text-zinc-400">
                {hud.lat.toFixed(1)}° lat · {hud.lon.toFixed(1)}° lon ·{' '}
                {hud.biome.family} · {CLIMATE_LABEL[hud.biome.climate] || hud.biome.climate}
              </div>
              {hud.mine && (
                <div className="text-[11px] font-bold leading-snug text-sky-300">
                  {hud.home ? '🏠 Your home base — you spawn here' : '💙 Your land'}
                </div>
              )}
              {envHud && (
                <div className="text-[11px] leading-snug text-zinc-300">
                  {envHud.phase === 'night' ? '🌙 ' : ''}🕐 {envHud.clock} solar
                  {envHud.label ? <> · {envHud.icon} {envHud.label}</> : null}
                  {envHud.tempC != null ? <> · {Math.round(envHud.tempC)}°C</> : null}
                </div>
              )}
              <div className="mt-1 text-[10px] leading-snug text-zinc-500">
                Display only — no rent, no buying on foot. The chamber panels keep those jobs.
              </div>
            </>
          ) : (
            <div className="text-sm text-zinc-300">Stepping onto the planet…</div>
          )}
      </E2Panel>

      <E2Panel
        layout={panelLayout.actions}
        onMove={(pos) => movePanel('actions', pos)}
        onToggle={() => togglePanel('actions')}
        panelClass="w-[292px] max-w-[calc(100vw-1rem)] rounded-2xl border border-white/15 bg-black/55 text-zinc-100 backdrop-blur-sm"
        headerClass="px-3.5 pt-2.5"
        bodyClass="flex flex-col gap-2 px-3.5 pb-3 pt-1"
        header={(
          <span className="text-[10px] font-black tracking-[0.25em] text-zinc-300">
            🎛️ CONTROLS
          </span>
        )}
      >
        {!bootDone && !bootExpired && bootSlugs && (
          <div className="rounded-full border border-white/15 bg-black/45 px-3 py-1.5 text-[11px] text-zinc-200">
            Placing the foundry… {bootPlaced}/{bootTotal}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-red-300/25 bg-black/50 py-1.5 pl-3 pr-1.5 text-[11px] text-zinc-100">
          <span>🩸 Blood sacs: <strong className="text-red-200">{sacsShown}</strong></span>
          <button
            type="button"
            onClick={() => openExchangeRef.current()}
            className="rounded-full border border-purple-300/40 bg-purple-500/20 px-2.5 py-1 font-bold text-purple-100 transition hover:bg-purple-500/35"
          >
            🧛 Bring sacs to Dracula
          </button>
        </div>
        {parcel && !buildMode && !driving && (
          <button
            type="button"
            onClick={() => enterBuildMode(parcel)}
            className="pointer-events-auto rounded-full border border-emerald-300/40 bg-emerald-500/20 px-3.5 py-2 text-[12px] font-bold text-emerald-50 backdrop-blur-sm transition hover:bg-emerald-500/35"
          >
            🔨 Build on this parcel
          </button>
        )}
        {nearHammond && !hammondOpen && (
          <div className="pointer-events-auto flex flex-wrap items-center gap-2 rounded-full border border-amber-300/30 bg-black/50 py-1.5 pl-3 pr-1.5 text-[11px] text-zinc-100">
            <span>🏛️ <strong className="text-amber-100">John Hammond</strong> is at his counter</span>
            <button
              type="button"
              onClick={() => setHammondPanel(true)}
              className="rounded-full border border-amber-300/50 bg-amber-400/20 px-2.5 py-1 font-bold text-amber-50 transition hover:bg-amber-400/35"
            >
              🦴 Trade fossils{fossilPack.length ? ` (${fossilPack.length})` : ''}
            </button>
          </div>
        )}
        {nearVehicle && !driving && !buildMode && (
          <div className="pointer-events-auto flex flex-wrap items-center gap-2 rounded-full border border-sky-300/30 bg-black/50 py-1.5 pl-3 pr-1.5 text-[11px] text-zinc-100">
            <span>{vehicleSpecForInstance(nearVehicle)?.air ? '🛩️' : vehicleSpecForInstance(nearVehicle)?.water ? '⛵' : '🚗'} <strong className="text-sky-100">{vehicleSpecForInstance(nearVehicle)?.name}</strong> is ready</span>
            <button
              type="button"
              onClick={() => boardVehicleRef.current(nearVehicle)}
              className="rounded-full border border-sky-300/50 bg-sky-400/20 px-2.5 py-1 font-bold text-sky-50 transition hover:bg-sky-400/35"
            >
              {vehicleSpecForInstance(nearVehicle)?.verb} it
            </button>
          </div>
        )}
        {notice && (
          <p className="rounded-lg border border-amber-300/30 bg-amber-400/15 px-2.5 py-1.5 text-[11px] font-semibold leading-snug text-amber-100">
            {notice}
          </p>
        )}
        <button
          type="button"
          aria-pressed={travel}
          onClick={() => setTravel((v) => !v)}
          className={`rounded-full border px-3.5 py-2 text-[12px] font-bold backdrop-blur-sm transition ${
            travel
              ? 'border-amber-300/60 bg-amber-400/30 text-amber-100'
              : 'border-white/25 bg-black/55 text-white hover:bg-black/75'
          }`}
        >
          🏃 TRAVEL {travel ? 'ON' : 'OFF'}
        </button>
        <p className="hidden rounded-lg border border-white/10 bg-black/45 px-2.5 py-1.5 text-[11px] leading-snug text-zinc-300 sm:block">
          WASD / arrows to walk · drag to look · Shift = travel pace ·
          tap a mosquito to shoot it · 🏛️ trade fossils at Hammond&rsquo;s
          counter by the museum · 🛩️ the fleet waits at Tyrrell Field,
          just west of it · Esc leaves
        </p>
        <p className="rounded-lg border border-white/10 bg-black/45 px-2.5 py-1.5 text-[11px] leading-snug text-zinc-300 sm:hidden">
          🦟 Tap a mosquito to shoot it — only the swollen red ones drop a blood sac.
        </p>
        <button
          type="button"
          onClick={() => { if (typeof onExit === 'function') onExit(); }}
          className="rounded-full border border-white/25 bg-black/55 px-3.5 py-2 text-[12px] font-bold text-white backdrop-blur-sm transition hover:bg-black/75"
        >
          ✕ Leave the planet
        </button>
      </E2Panel>

      {/* Hammond's fossil exchange — the counter panel. Flow
          layout throughout (no overlaps, per the house CSS law):
          header, currency choice, the pack as tappable rows, the
          last trade's receipts, and the settle button. */}
      {hammondOpen && !buildMode && (
        <div className="absolute inset-x-2 bottom-2 sm:inset-x-auto sm:bottom-5 sm:left-1/2 sm:w-[430px] sm:-translate-x-1/2">
          <div className="flex max-h-[64vh] flex-col gap-3 overflow-y-auto rounded-[1.25rem] border border-amber-300/35 bg-[#12100a]/95 p-4 text-zinc-100 shadow-2xl backdrop-blur-md">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[10px] font-black tracking-[0.25em] text-amber-200">
                  🏛️ ROYAL TYRRELL MUSEUM
                </div>
                <div className="mt-0.5 text-lg font-black leading-tight text-white">
                  John Hammond&rsquo;s counter
                </div>
                <p className="mt-1 text-[11px] leading-snug text-zinc-400">
                  He buys fossils for gold or aether — and now and then, on a whim,
                  he hands you a weapon instead.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setHammondPanel(false)}
                className="shrink-0 rounded-full border border-white/25 bg-black/40 px-3 py-2 text-[12px] font-bold text-white transition hover:bg-black/70"
              >
                ✕ Close
              </button>
            </div>

            <div className="flex gap-2" role="group" aria-label="Payout currency">
              <button
                type="button"
                aria-pressed={hammondCurrency === 'gold'}
                onClick={() => setHammondCurrency('gold')}
                className={`flex-1 rounded-full border px-3 py-2.5 text-sm font-bold transition ${
                  hammondCurrency === 'gold'
                    ? 'border-amber-300/70 bg-amber-400/25 text-amber-50'
                    : 'border-white/20 bg-white/5 text-zinc-300 hover:bg-white/10'
                }`}
              >
                🪙 Pay me in gold
              </button>
              <button
                type="button"
                aria-pressed={hammondCurrency === 'aether'}
                onClick={() => setHammondCurrency('aether')}
                className={`flex-1 rounded-full border px-3 py-2.5 text-sm font-bold transition ${
                  hammondCurrency === 'aether'
                    ? 'border-cyan-300/70 bg-cyan-400/25 text-cyan-50'
                    : 'border-white/20 bg-white/5 text-zinc-300 hover:bg-white/10'
                }`}
              >
                ◆ Refine to aether
              </button>
            </div>

            {fossilPack.length ? (
              <div className="flex flex-col gap-2">
                {fossilPack.map((f) => {
                  const picked = hammondPicks.has(f.id);
                  const aether = aetherForFossil(f);
                  const condition = fossilConditionById(f.condition);
                  return (
                    <button
                      key={f.id}
                      type="button"
                      aria-pressed={picked}
                      onClick={() => toggleHammondPick(f.id)}
                      className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition ${
                        picked
                          ? 'border-amber-300/70 bg-amber-400/15'
                          : 'border-white/12 bg-black/30 hover:bg-black/50'
                      }`}
                    >
                      <span aria-hidden="true" className="text-base">{picked ? '☑️' : '⬜'}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-zinc-50">{f.type}</span>
                        <span className="block text-[11px] text-zinc-400">
                          {f.speciesName} · {condition ? condition.label : f.condition}
                        </span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="block text-sm font-bold text-amber-100">{f.goldValue} gold</span>
                        <span className="block text-[11px] text-cyan-200">
                          {aether > 0 ? `◆ ${aether} aether` : 'too small to refine'}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-xs leading-relaxed text-zinc-400">
                Your pack is empty. When the hunt brings a dinosaur down, it leaves
                fossils behind — carry them here and Hammond will make you an offer.
              </p>
            )}

            {hammondResults.length > 0 && (
              <div className="flex flex-col gap-1.5 rounded-xl border border-white/10 bg-black/30 px-3 py-2.5">
                <div className="text-[10px] font-bold tracking-[0.25em] text-zinc-400">
                  THE FOUNDER SETTLES UP
                </div>
                {hammondResults.map((r, i) => (
                  <p key={`${r.fossilId || 'fossil'}-${i}`} className="text-xs leading-snug text-zinc-200">
                    {r.outcome === 'weapon' ? (
                      <>⚔️ For the {r.type}, Hammond smiles and hands you the{' '}
                        <strong className="text-amber-100">{r.weapon}</strong>{' '}
                        <span className="capitalize text-zinc-400">({r.weaponRarity})</span> instead.</>
                    ) : r.outcome === 'aether' ? (
                      <>◆ +{r.amount} aether for the {r.type}.</>
                    ) : (
                      <>🪙 +{r.amount} gold for the {r.type}.
                        {r.refinedFallback ? ' Too small to refine — he pays its gold.' : ''}</>
                    )}
                  </p>
                ))}
              </div>
            )}

            <button
              type="button"
              onClick={doHammondExchange}
              disabled={hammondPicks.size === 0}
              className="w-full rounded-full border border-amber-300/70 bg-amber-400/25 px-4 py-3 text-sm font-black tracking-wide text-amber-50 transition hover:bg-amber-400/40 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {hammondPicks.size === 0
                ? 'Pick a fossil to trade'
                : `Trade ${hammondPicks.size} fossil${hammondPicks.size > 1 ? 's' : ''} for ${hammondCurrency === 'aether' ? 'aether' : 'gold'}`}
            </button>
            <p className="text-[11px] leading-relaxed text-zinc-500">
              Payouts land in the same tallies as Dracula&rsquo;s gifts — check the
              chamber&rsquo;s Exchange panel for the running count.
            </p>
          </div>
        </div>
      )}

      {/* Build mode — the builder's workbench, the concourse's
          third panel: it drags and shrinks like the others, and
          its HEADER carries the selected piece's name and the
          ghost's live verdict, so the reason a placement fails
          stays visible even with the panel shrunk (in Merlin's
          build video the verdict sat at the panel's bottom,
          clipped under other overlays — he never saw it). Body
          flow layout, no overlaps: tool switch, then the Place
          workbench (families → pieces → finishes → tint → aim
          controls) or the Edit bench (the tapped piece and its
          actions). */}
      {buildMode && buildParcel && (
        <E2Panel
          layout={panelLayout.build}
          onMove={(pos) => movePanel('build', pos)}
          onToggle={() => togglePanel('build')}
          panelClass="w-[470px] max-w-[calc(100vw-1rem)] rounded-[1.25rem] border border-emerald-300/35 bg-[#0a120c]/95 text-zinc-100 shadow-2xl backdrop-blur-md"
          headerClass="px-4 pt-3"
          bodyClass="flex max-h-[62vh] flex-col gap-3 overflow-y-auto px-4 pb-4 pt-2"
          header={(
            <div className="flex flex-col gap-1 pb-1">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[10px] font-black tracking-[0.25em] text-emerald-200">
                    🔨 BUILDING — {buildParcel.id}
                  </div>
                  <div className="truncate text-base font-black leading-tight text-white">
                    {buildParcel.name}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={exitBuildMode}
                  className="shrink-0 rounded-full border border-emerald-300/50 bg-emerald-400/20 px-3 py-2 text-[12px] font-bold text-emerald-50 transition hover:bg-emerald-400/35"
                >
                  ✓ Done
                </button>
              </div>
              {buildTool === 'place' ? (
                <p className={`text-[11px] font-bold leading-snug ${
                  ghostState
                    ? ghostState.ok ? 'text-emerald-200' : 'text-red-200'
                    : 'text-zinc-400'
                }`}>
                  🧱 {selPieceDef ? selPieceDef.name : selPieceId} · {buildPieceCount}/{MAX_PIECES_PER_BUILD} pieces — {
                    ghostState
                      ? ghostState.ok
                        ? ghostState.proposal
                          ? `✓ ${ghostState.proposal} — tap to place it there`
                          : '✓ Fits — tap the world to place it'
                        : `✗ ${ghostState.reasons[0] || 'That placement does not work.'}`
                      : 'tap the ground to aim — the ghost stays where you put it'
                  }
                </p>
              ) : (
                <p className="truncate text-[11px] font-bold leading-snug text-zinc-300">
                  🛠️ {selectedPlaced ? (pieceById(selectedPlaced.pieceId)?.name || selectedPlaced.pieceId) : 'Nothing selected'} · {buildPieceCount}/{MAX_PIECES_PER_BUILD} pieces
                </p>
              )}
            </div>
          )}
        >
            {buildMsg && (
              <p className="text-[11px] leading-snug text-zinc-400">{buildMsg}</p>
            )}

            <div className="flex gap-2" role="group" aria-label="Build tool">
              {[
                ['place', '🧱 Place pieces'],
                ['edit', '🛠️ Edit placed'],
              ].map(([tool, label]) => (
                <button
                  key={tool}
                  type="button"
                  aria-pressed={buildTool === tool}
                  onClick={() => { buildModeRef.current.tool = tool; setBuildTool(tool); }}
                  className={`flex-1 rounded-full border px-3 py-2.5 text-sm font-bold transition ${
                    buildTool === tool
                      ? 'border-emerald-300/70 bg-emerald-400/25 text-emerald-50'
                      : 'border-white/20 bg-white/5 text-zinc-300 hover:bg-white/10'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {buildTool === 'place' ? (
              <>
                <div className="flex flex-wrap gap-1.5">
                  {PIECE_CATEGORIES.map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      aria-pressed={buildCat === cat}
                      onClick={() => setBuildCat(cat)}
                      className={`rounded-full border px-2.5 py-1.5 text-[11px] font-bold transition ${
                        buildCat === cat
                          ? 'border-emerald-300/70 bg-emerald-400/25 text-emerald-50'
                          : 'border-white/15 bg-white/5 text-zinc-300 hover:bg-white/10'
                      }`}
                    >
                      {BUILD_CAT_LABEL[cat] || cat}
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-2 gap-1.5">
                  {categoryPieces.map((piece) => (
                    <button
                      key={piece.id}
                      type="button"
                      aria-pressed={selPieceId === piece.id}
                      onClick={() => pickPiece(piece.id)}
                      className={`min-w-0 rounded-xl border px-2.5 py-2 text-left transition ${
                        selPieceId === piece.id
                          ? 'border-emerald-300/70 bg-emerald-400/15'
                          : 'border-white/12 bg-black/30 hover:bg-black/50'
                      }`}
                    >
                      <span className="block truncate text-[12px] font-semibold text-zinc-50">{piece.name}</span>
                      <span className="block text-[10px] text-zinc-400">
                        {piece.size.w} × {piece.size.d} m{piece.span ? ' · span' : ''}{piece.floating ? ' · floats' : ''}
                      </span>
                    </button>
                  ))}
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] font-bold text-zinc-400">Finish</span>
                  {allowedFinishes.map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      aria-pressed={selFinish === f.id}
                      onClick={() => pickFinish(f.id)}
                      className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[11px] font-bold transition ${
                        selFinish === f.id
                          ? 'border-emerald-300/70 bg-emerald-400/25 text-emerald-50'
                          : 'border-white/15 bg-white/5 text-zinc-300 hover:bg-white/10'
                      }`}
                    >
                      <span
                        aria-hidden="true"
                        className="inline-block h-3 w-3 shrink-0 rounded-full border border-white/30"
                        style={{ background: `#${f.tint.toString(16).padStart(6, '0')}` }}
                      />
                      {f.name}
                    </button>
                  ))}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[11px] font-bold text-zinc-400">Tint</span>
                  <input
                    type="range"
                    min={-180}
                    max={180}
                    step={5}
                    value={selTint === '' ? 0 : Number(selTint)}
                    onChange={(e) => pickTint(e.target.value)}
                    className="min-w-0 flex-1 accent-emerald-400"
                    aria-label="Tint hue shift in degrees"
                  />
                  <span className="text-[11px] text-zinc-300">
                    {selTint === '' ? 'natural' : `${Number(selTint) > 0 ? '+' : ''}${selTint}°`}
                  </span>
                  <button
                    type="button"
                    onClick={() => pickTint('')}
                    className="rounded-full border border-white/15 bg-white/5 px-2.5 py-1.5 text-[11px] font-bold text-zinc-300 transition hover:bg-white/10"
                  >
                    Natural
                  </button>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => rotateGhost(-1)}
                    className="flex-1 rounded-full border border-white/20 bg-white/5 px-3 py-2 text-[12px] font-bold text-zinc-100 transition hover:bg-white/10"
                  >
                    ⟲ Turn
                  </button>
                  <span className="flex items-center rounded-full border border-white/10 bg-black/30 px-3 text-[12px] font-bold text-zinc-200">
                    {buildRot}°
                  </span>
                  <button
                    type="button"
                    onClick={() => rotateGhost(1)}
                    className="flex-1 rounded-full border border-white/20 bg-white/5 px-3 py-2 text-[12px] font-bold text-zinc-100 transition hover:bg-white/10"
                  >
                    Turn ⟳
                  </button>
                  <button
                    type="button"
                    onClick={() => liftGhost(1)}
                    className="flex-1 rounded-full border border-white/20 bg-white/5 px-3 py-2 text-[12px] font-bold text-zinc-100 transition hover:bg-white/10"
                  >
                    ▲ Raise{buildLift > 0 ? ` +${buildLift}` : ''}
                  </button>
                  <button
                    type="button"
                    onClick={() => liftGhost(-1)}
                    className="flex-1 rounded-full border border-white/20 bg-white/5 px-3 py-2 text-[12px] font-bold text-zinc-100 transition hover:bg-white/10"
                  >
                    ▼ Lower
                  </button>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={cycleOrientation}
                    className="flex-1 rounded-full border border-white/20 bg-white/5 px-3 py-2 text-[12px] font-bold text-zinc-100 transition hover:bg-white/10"
                  >
                    🗃 Flip stance
                  </button>
                  <span className="flex items-center rounded-full border border-white/10 bg-black/30 px-3 text-[12px] font-bold text-zinc-200">
                    {ORIENT_LABEL[buildOrient]}
                  </span>
                </div>

                {!ghostState && (
                  <p className="rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-xs leading-snug text-zinc-400">
                    Tap the ground where the piece should go — the ghost anchors
                    there and walking won&rsquo;t drag it; drag to look around
                    re-aims it. If a spot won&rsquo;t work, the ghost finds the
                    nearest spot that does and names the change in the header.
                    Double-tap a placed piece to pick it up and move it. Pieces
                    stack on pieces and their edges snap together; R / Q turn
                    it, F flips its stance, PgUp / PgDn lift it. The verdict
                    rides in this panel&rsquo;s header, so it stays in view
                    even with the panel shrunk.
                  </p>
                )}
              </>
            ) : (
              <>
                {selectedPlaced ? (
                  <div className="flex flex-col gap-2">
                    <p className="text-sm text-zinc-200">
                      Selected: <strong className="text-emerald-100">
                        {pieceById(selectedPlaced.pieceId)?.name || selectedPlaced.pieceId}
                      </strong>{' '}
                      <span className="text-zinc-400">
                        ({FINISHES.find((f) => f.id === selectedPlaced.finish)?.name || selectedPlaced.finish}
                        {selectedPlaced.orientation ? ` · ${ORIENT_LABEL[selectedPlaced.orientation] || selectedPlaced.orientation}` : ''})
                      </span>
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {[
                        ['move', '✥ Move'],
                        ['rotate', '⟳ Rotate 15°'],
                        ['flip', '🗃 Flip stance'],
                        ['raise', '▲ Raise'],
                        ['lower', '▼ Lower'],
                        ['remove', '🗑 Remove'],
                      ].map(([action, label]) => (
                        <button
                          key={action}
                          type="button"
                          onClick={() => editSelected(action)}
                          className={`rounded-full border px-3 py-2 text-[12px] font-bold transition ${
                            action === 'remove'
                              ? 'border-red-300/50 bg-red-400/15 text-red-100 hover:bg-red-400/30'
                              : 'border-white/20 bg-white/5 text-zinc-100 hover:bg-white/10'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    <p className="text-[11px] leading-snug text-zinc-500">
                      Every edit is judged by the same law as the ghost — an edit that
                      would strand or overlap a piece is refused, with the reason.
                    </p>
                  </div>
                ) : (
                  <p className="rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-xs leading-relaxed text-zinc-400">
                    Tap one of your placed pieces to select it — then move it,
                    turn it, flip its stance, raise or lower it, or take it
                    away. A double-tap on a piece picks it straight up for
                    moving. Pieces on other people&rsquo;s parcels are never
                    yours to edit.
                  </p>
                )}
              </>
            )}
        </E2Panel>
      )}

      {/* Driving — the machine's panel. Flow layout: who you are
          driving, how fast (and how high, for the VTOL), the
          lift buttons on touch, and the way out. The joystick
          (bottom-left) drives throttle and steering. */}
      {driving && (
        <div className="absolute inset-x-2 bottom-24 sm:inset-x-auto sm:bottom-5 sm:left-1/2 sm:w-[400px] sm:-translate-x-1/2">
          <div className="flex flex-col gap-2.5 rounded-[1.25rem] border border-sky-300/35 bg-[#081018]/95 p-4 text-zinc-100 shadow-2xl backdrop-blur-md">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[10px] font-black tracking-[0.25em] text-sky-200">
                  {vehicleSpecForInstance(driving)?.air ? '🛩️ IN THE AIR' : vehicleSpecForInstance(driving)?.water ? '⛵ UNDER WAY' : '🚗 DRIVING'}
                </div>
                <div className="mt-0.5 text-lg font-black leading-tight text-white">
                  {vehicleSpecForInstance(driving)?.name}
                </div>
                <p className="mt-1 text-[11px] leading-snug text-zinc-400">
                  {(driveInfo.speed * 3.6).toFixed(0)} km/h
                  {vehicleSpecForInstance(driving)?.air ? ` · ${(driveInfo.alt || 0).toFixed(0)} m up` : ''}
                  {' '}· W/S move · A/D steer · drag looks around
                </p>
              </div>
              <button
                type="button"
                onClick={() => exitVehicleRef.current()}
                className="shrink-0 rounded-full border border-sky-300/50 bg-sky-400/20 px-3 py-2 text-[12px] font-bold text-sky-50 transition hover:bg-sky-400/35"
              >
                🚶 Step out
              </button>
            </div>
            <div>
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[9px] font-black tracking-[0.22em] text-zinc-400">INTEGRITY</span>
                <span className="text-[11px] font-black" style={{ color: integrityColor(driveInfo.integrity ?? 100) }}>
                  {Math.round(driveInfo.integrity ?? 100)}%
                </span>
              </div>
              <div className={`mt-1 h-2.5 w-full overflow-hidden rounded-full bg-white/10 ${(driveInfo.integrity ?? 100) < 30 ? 'animate-pulse' : ''}`}>
                <div
                  className="h-full rounded-full transition-[width] duration-200"
                  style={{ width: `${Math.max(0, Math.min(100, driveInfo.integrity ?? 100))}%`, background: integrityColor(driveInfo.integrity ?? 100) }}
                />
              </div>
            </div>
            {vehicleSpecForInstance(driving)?.air && (
              <div className="flex gap-2">
                <button
                  type="button"
                  onPointerDown={() => { inputRef.current.keys.up = true; }}
                  onPointerUp={() => { inputRef.current.keys.up = false; }}
                  onPointerLeave={() => { inputRef.current.keys.up = false; }}
                  className="flex-1 rounded-full border border-white/20 bg-white/5 px-3 py-2.5 text-sm font-bold text-zinc-100 transition hover:bg-white/10"
                >
                  ▲ Climb (Space)
                </button>
                <button
                  type="button"
                  onPointerDown={() => { inputRef.current.keys.down = true; }}
                  onPointerUp={() => { inputRef.current.keys.down = false; }}
                  onPointerLeave={() => { inputRef.current.keys.down = false; }}
                  className="flex-1 rounded-full border border-white/20 bg-white/5 px-3 py-2.5 text-sm font-bold text-zinc-100 transition hover:bg-white/10"
                >
                  ▼ Settle (C)
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Touch controls: the shared walk joystick — a fixed
          control, never a panel (the TRAVEL toggle and the
          hints live in the Controls panel above). */}
      <div className="absolute bottom-3 left-3 sm:bottom-5 sm:left-5">
        <WalkJoystick
          size={118}
          onMove={(x, y) => { inputRef.current.joy.x = x; inputRef.current.joy.y = y; }}
        />
      </div>
    </div>
  );
}
