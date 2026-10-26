// OLYMPIAN MONSTERVERSE — GLB drop-in loader (browser only).
//
// The spawns.js contract: a figure's userData.modelPath is the
// public path its rigged Tripo GLB occupies, and "the swap is
// one loader call". This module IS that call: given a figure
// group, it loads the GLB (cached per URL, lazy GLTFLoader
// import so the loader never enters the bundle until used),
// scales the model to the figure's target height, and replaces
// the stand-in children — WITHOUT moving the group, its
// position/rotation, its userData (monster id, footprint,
// collider contract), or anything the zone's update loop owns.
// On ANY failure (404, parse error, no WebGL) it resolves
// false and the stand-in simply stays: a missing model is
// never a crash, never a blank monster.
//
// STABILITY: loads are cached (one network fetch per URL no
// matter how many figures share it), in-flight loads are
// de-duplicated, and a figure is only ever attempted once —
// the zone's per-frame sync never re-triggers a load.

const urlCache = new Map(); // url -> Promise<scene|null> (master copy)
const attempted = new WeakSet(); // figures already kicked off

async function loadScene(url) {
  if (!urlCache.has(url)) {
    urlCache.set(url, (async () => {
      try {
        // Same dynamic-import pattern as Middle-earth landmarks.
        const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
        const loader = new GLTFLoader();
        const gltf = await loader.loadAsync(url);
        return gltf.scene || null;
      } catch {
        return null;
      }
    })());
  }
  return urlCache.get(url);
}

// Fit a loaded scene to a target height (metres) by its bounding
// box, then swap it into the figure group. Returns true on swap.
//
// CLONE, NEVER SHARE: a three.js object can have only one
// parent, so handing the cached master scene to two figures of
// the same family would steal it from the first. Every figure
// gets its own SkeletonUtils clone (skinned meshes re-bound
// properly); geometries/materials are shared by the clone, so
// the memory cost per figure is transforms, not buffers.
export async function swapFigureToGlb(fig, url, targetHeightM) {
  if (!fig || !url || attempted.has(fig)) return false;
  attempted.add(fig);
  const master = await loadScene(url);
  if (!master || !fig) return false;
  try {
    const THREE = await import('three');
    const { clone } = await import('three/addons/utils/SkeletonUtils.js');
    const scene = clone(master);
    // Bounding box without touching the live scene graph: the
    // clone is detached, so this is safe and cheap (one pass).
    const box = new THREE.Box3().setFromObject(scene);
    const size = new THREE.Vector3();
    box.getSize(size);
    const h = size.y > 0 ? size.y : 1;
    const s = (targetHeightM || 2.5) / h;
    scene.scale.setScalar(s);
    // Ground the model: shift so its lowest point sits at y=0.
    const minY = box.min.y * s;
    scene.position.y = -minY;
    while (fig.children.length > 0) fig.remove(fig.children[0]);
    fig.add(scene);
    fig.userData.standIn = false;
    fig.userData.glb = true;
    fig.userData.eyes = null; // GLB eyes are not the tagged stand-in eyes
    fig.userData.head = null;
    return true;
  } catch {
    return false;
  }
}

// Fire-and-forget kick-off for the zone's sync path: never throws,
// never awaits in the frame loop, never re-attempts a figure.
export function kickOffGlb(fig, url, targetHeightM) {
  if (!fig || !url || attempted.has(fig)) return;
  try {
    const p = swapFigureToGlb(fig, url, targetHeightM);
    if (p && typeof p.catch === 'function') p.catch(() => {});
  } catch {
    // Stand-in stays. Loading is enhancement, never requirement.
  }
}
