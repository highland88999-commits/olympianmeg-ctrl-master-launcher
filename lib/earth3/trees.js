// EARTH 3 — REAL TREES (Merlin, 2026-11-14): Earth 3's
// procedural blob trees (trunk cylinder + icosahedron canopy)
// become Earth 2's real tree models. Placement, density and
// biome logic do not change — only what the trees look like.
// Heights follow Earth 2's native-plant law: fitted by height
// (scaleBasis 'height'), seated at ground − 0.1 m.
//
// The cast comes from Earth 2's registry itself (lib/earth2/
// models.js) — this module adds only the planting law. The
// loader is Earth 2's delivery path (modelDeliveryUrls): the
// signed store URL first, then the public site file as fallback
// (Earth 2's public fallback is on and the files ship in the
// web root, so with no signed-url map the public file is what
// loads). A species whose GLB fails to load grows the old
// procedural tree instead — the forest never has holes.

import * as THREE from 'three';
import { EARTH2_MODELS, modelDeliveryUrls } from '../earth2/models.js';

// ── The cast: Earth 2's real trees, nothing invented ─────────
// kind === 'plant', status === 'placed', with a model file, and
// tall enough to be a tree (scaleM >= 8). The ground covers,
// reeds and mosses (fern 0.6, club moss 0.5, horsetail 2,
// cycad 3, bennettitales 3) stay out — they are not trees.
export const TREE_SPECIES = EARTH2_MODELS.filter(
  (m) => m && m.kind === 'plant' && m.status === 'placed' && m.file && m.scaleM >= 8,
).map((m) => ({
  slug: m.slug,
  name: m.name,
  file: m.file,
  scaleM: m.scaleM,
  scaleBasis: m.scaleBasis,
}));

export const TREE_SLUGS = TREE_SPECIES.map((s) => s.slug);

// The island's trees are the two smallest real trees — the big
// conifers would tower over the huts on a 28 m island.
export const ISLAND_TREE_SLUGS = ['tree-fern', 'magnolia'];

// ── Species pick ─────────────────────────────────────────────
// Deterministic per placement index (a small integer hash), NOT
// the scene rng — the forest's positions come from the scene's
// seeded stream, and drawing species from it would move every
// tree and everything placed after them.
export function treeSpeciesForIndex(i) {
  let h = (i + 1) * 2654435761;
  h ^= h >>> 15;
  h = Math.imul(h, 2246822519);
  h ^= h >>> 13;
  return TREE_SPECIES[(h >>> 0) % TREE_SPECIES.length];
}

export function islandTreeSpeciesForIndex(i) {
  return TREE_SPECIES.find((s) => s.slug === ISLAND_TREE_SLUGS[i % ISLAND_TREE_SLUGS.length]);
}

// ── Normalize ────────────────────────────────────────────────
// Earth 2's native-plant law (components/earth2/Earth2World.jsx
// placePlantSpecies): fit by HEIGHT (scaleBasis 'height'),
// centre X/Z, base at y = 0. Returns the spin group.
export function normalizeTreeModel(gltfScene, entry) {
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

// ── Loader ───────────────────────────────────────────────────
// One shared loader, MeshoptDecoder set like Earth 2's. Each
// delivery URL is tried in turn; the last error is thrown.
let loaderPromise = null;
function getLoader() {
  if (!loaderPromise) {
    loaderPromise = Promise.all([
      import('three/examples/jsm/loaders/GLTFLoader.js'),
      import('three/examples/jsm/libs/meshopt_decoder.module.js'),
    ]).then(([{ GLTFLoader }, { MeshoptDecoder }]) => {
      const loader = new GLTFLoader();
      loader.setMeshoptDecoder(MeshoptDecoder);
      return loader;
    });
  }
  return loaderPromise;
}

export async function loadTreeModel(entry, { signedUrls } = {}) {
  const urls = modelDeliveryUrls(entry, signedUrls || null);
  if (!urls.length) throw new Error(`No delivery URL for ${entry.slug}`);
  const loader = await getLoader();
  let lastErr = null;
  for (const url of urls) {
    try {
      const gltf = await loader.loadAsync(url);
      return gltf.scene;
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}

// ── Placeholder ──────────────────────────────────────────────
// The old procedural trunk + blob canopy, kept for one job: a
// species whose GLB fails to load still grows a tree. One shared
// geometry/material set, built lazily.
let placeholderAssets = null;
function getPlaceholderAssets() {
  if (!placeholderAssets) {
    placeholderAssets = {
      trunkGeo: new THREE.CylinderGeometry(0.25, 0.4, 2.2, 7),
      canGeo: new THREE.IcosahedronGeometry(2.4, 1),
      trunkMat: new THREE.MeshStandardMaterial({ color: 0x7a5230, roughness: 1 }),
      canMat: new THREE.MeshStandardMaterial({ color: 0x4a8f3f, roughness: 1 }),
    };
  }
  return placeholderAssets;
}

export function makePlaceholderTree() {
  const { trunkGeo, canGeo, trunkMat, canMat } = getPlaceholderAssets();
  const tree = new THREE.Group();
  const trunk = new THREE.Mesh(trunkGeo, trunkMat);
  trunk.position.y = 1.1;
  tree.add(trunk);
  const canopy = new THREE.Mesh(canGeo, canMat);
  canopy.position.y = 3.9;
  canopy.scale.y = 1.15;
  tree.add(canopy);
  return tree;
}

// ── Planting ─────────────────────────────────────────────────
// placements: [{ x, z, scale, heading, species? }] — species
// defaults to speciesForIndex(i). parent: the THREE group the
// trees hang under (the scene, or the island group so they bob
// with it). groundY: the ground height under the trees (the
// showcase is flat, y = 0); trees seat at groundY − 0.1, Earth
// 2's native-plant base bury. loadModel is injectable so tests
// can plant without the network; the default is the real loader.
//
// Returns a handle { group, cancel(), done } — done resolves to
// { placed, fallback, failed: [slugs] } once every species has
// loaded (or failed). cancel() stops late loads adding trees
// after the world is destroyed.
export function plantTrees({
  parent,
  placements,
  speciesForIndex = treeSpeciesForIndex,
  groundY = 0,
  loadModel = loadTreeModel,
}) {
  const group = new THREE.Group();
  parent.add(group);
  let cancelled = false;
  const done = (async () => {
    // Group placements by species so each GLB decodes once.
    const bySpecies = new Map();
    placements.forEach((p, i) => {
      const species = p.species || speciesForIndex(i);
      if (!bySpecies.has(species.slug)) bySpecies.set(species.slug, { species, list: [] });
      bySpecies.get(species.slug).list.push(p);
    });
    let placed = 0;
    let fallback = 0;
    const failed = [];
    for (const { species, list } of bySpecies.values()) {
      let base = null;
      try {
        const modelScene = await loadModel(species);
        base = normalizeTreeModel(modelScene, species);
      } catch {
        failed.push(species.slug);
      }
      if (cancelled) return { placed, fallback, failed };
      for (const p of list) {
        let tree;
        if (base) {
          tree = base.clone();
          placed++;
        } else {
          tree = makePlaceholderTree();
          fallback++;
        }
        tree.position.set(p.x, groundY - 0.1, p.z);
        tree.rotation.y = p.heading || 0;
        tree.scale.setScalar(p.scale || 1);
        group.add(tree);
      }
    }
    return { placed, fallback, failed };
  })();
  return {
    group,
    cancel() { cancelled = true; },
    done,
  };
}
