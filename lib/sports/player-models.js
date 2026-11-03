// lib/sports/player-models.js
// Shared Tripo3D rigged player models for the sports games (Merlin, 2026-11-03).
//
// Batch 9: 10 rigged sports players, all Mixamo-rigged (65 joints), plain
// solid jerseys for game-code recoloring. Optimized per the rigged-GLB
// recipe (dequantize → dedup → prune → WebP-1024, NO meshopt).
//
// Usage in a sport's page.jsx:
//   import { loadSportPlayer, SPORT_PLAYER_GLB } from '@/lib/sports/player-models';
//   const playerGroup = await loadSportPlayer('soccer', scene);
//   // Tint the jersey: playerGroup.userData.setTeamColor('#ff0000');

import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// Sport → { field: GLB for outfield players, goalie: GLB for goalies (if any) }
export const SPORT_PLAYER_GLB = {
  soccer: {
    field: '/models/sports/soccer-player.glb',
    goalie: '/models/sports/soccer-goalkeeper.glb',
  },
  hockey: {
    field: '/models/sports/hockey-player.glb',
    goalie: '/models/sports/hockey-goalie.glb',
  },
  volleyball: { field: '/models/sports/volleyball-player.glb' },
  dodgeball: { field: '/models/sports/dodgeball-player.glb' },
  'table-tennis': { field: '/models/sports/table-tennis-player.glb' },
  tennis: { field: '/models/sports/tennis-player.glb' },
  'beer-pong': { field: '/models/sports/beer-pong-player.glb' },
  rugby: { field: '/models/sports/rugby-player.glb' },
  'run-it-straight': { field: '/models/sports/rugby-player.glb' }, // run-it-straight uses rugby-style players
};

// Cache of loaded GLB scenes by URL (clone for each player instance).
const glbCache = new Map();
const loader = new GLTFLoader();

async function loadGlb(url) {
  if (!glbCache.has(url)) {
    glbCache.set(url, loader.loadAsync(url));
  }
  return glbCache.get(url);
}

// The Tripo models are ~1m tall in local units; scale to match the
// procedural player height (~1.8m).
const PLAYER_SCALE = 1.8;

/**
 * Load a rigged player model for a sport.
 * @param {string} sport - key in SPORT_PLAYER_GLB
 * @param {boolean} isGoalie - use the goalie variant if the sport has one
 * @returns {Promise<THREE.Group>} - the player group, with userData.setTeamColor(hex)
 */
export async function loadSportPlayer(sport, isGoalie = false) {
  const entry = SPORT_PLAYER_GLB[sport];
  if (!entry) throw new Error(`No player model for sport: ${sport}`);
  const url = (isGoalie && entry.goalie) ? entry.goalie : entry.field;
  const gltf = await loadGlb(url);
  const group = gltf.scene.clone(true);

  // Normalize: scale to player height, feet on ground.
  group.scale.setScalar(PLAYER_SCALE);
  // The model is centered at origin; shift so feet sit at y=0.
  // Bounding box y: -0.5..0.5 in local units → after scale, -0.9..0.9.
  group.position.y = 0.9 * PLAYER_SCALE / PLAYER_SCALE; // = 0.9, feet at 0

  // Jersey recoloring: the models have a single material (plain solid jersey).
  // Clone it per player so teams can tint independently.
  const jerseyMats = [];
  group.traverse((obj) => {
    if (obj.isMesh && obj.material) {
      obj.material = obj.material.clone();
      jerseyMats.push(obj.material);
      obj.castShadow = true;
    }
  });

  group.userData.setTeamColor = (hex) => {
    for (const m of jerseyMats) {
      if (m.color) m.color.set(hex);
    }
  };

  return group;
}

/**
 * Synchronous fallback: returns null if the model isn't cached yet.
 * Use for the first render pass; the async loader fills in on the next frame.
 */
export function getCachedSportPlayer(sport, isGoalie = false) {
  const entry = SPORT_PLAYER_GLB[sport];
  if (!entry) return null;
  const url = (isGoalie && entry.goalie) ? entry.goalie : entry.field;
  const promise = glbCache.get(url);
  // If the promise resolved, we'd need the value — this is a best-effort sync check.
  // In practice, callers should use loadSportPlayer and handle the async.
  return null;
}
