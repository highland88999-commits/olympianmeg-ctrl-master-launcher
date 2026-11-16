// World Engine — Asset Uplink loader helpers (GAP 4, Merlin 2026-11-15).
//
// The pure, Node-testable half of the uplink preview: which URLs the
// preview may load, what the preview shows in each load state, and how
// a loaded model is scaled and grounded. The async GLB fetch itself
// lives in MiniViewport (three's GLTFLoader, lazy dynamic import —
// the repo's established pattern, see app/hollow-earth/model-loader.js);
// buildCreationMesh keeps its synchronous contract and still builds
// the plain box, which stays as the loading / failed / no-URL
// placeholder, exactly as the Object Builder's box.
//
// GLB ONLY: 'glb' is the only format evidenced anywhere in World
// Engine code (store default type 'glb', ASSET_FORMATS = ['glb'] in
// the uplink datasheet). .gltf/.fbx/.obj support is NOT evidenced
// and is NOT claimed here — a non-.glb URL is refused with a
// plain-words line instead of a loader error.

/** How long a linked-model fetch may run before the preview gives up. */
export const UPLINK_LOAD_TIMEOUT_MS = 30000;

/** URL rules — lib/world-engine/gemini.js validateSynthesizeInput(). */
export const UPLINK_URL_RULES = {
  schemes: ['http://', 'https://'],
  maxUrlChars: 500,
};

/**
 * isLoadableAssetUrl(url) -> boolean.
 * True only for an http(s) URL, at most 500 chars, pointing at a .glb
 * file (query string / fragment after the .glb are allowed).
 */
export function isLoadableAssetUrl(url) {
  if (typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (!trimmed) return false;
  if (trimmed.length > UPLINK_URL_RULES.maxUrlChars) return false;
  if (!/^https?:\/\//i.test(trimmed)) return false;
  const withoutQuery = trimmed.split(/[?#]/, 1)[0];
  return /\.glb$/i.test(withoutQuery);
}

/**
 * uplinkPreviewState({ category, url, loadStatus }) ->
 *   { mode: 'box' | 'model', statusLine: string | null }.
 *
 * loadStatus: 'idle' | 'loading' | 'loaded' | 'failed' (MiniViewport
 * state). The box is the placeholder in every state except a loaded
 * model; the status line is plain words, never a crash, never a
 * silent box. Other categories are untouched: no line, box as usual.
 */
export function uplinkPreviewState({ category, url, loadStatus }) {
  if (category !== 'asset_link') return { mode: 'box', statusLine: null };
  const trimmed = typeof url === 'string' ? url.trim() : '';
  if (!trimmed) return { mode: 'box', statusLine: null };
  if (!isLoadableAssetUrl(trimmed)) {
    return {
      mode: 'box',
      statusLine: 'That link does not look like a .glb file — paste a direct .glb URL.',
    };
  }
  if (loadStatus === 'loading') {
    return { mode: 'box', statusLine: 'Loading linked model…' };
  }
  if (loadStatus === 'loaded') return { mode: 'model', statusLine: null };
  if (loadStatus === 'failed') {
    return {
      mode: 'box',
      statusLine: 'Could not load that link — check the URL and try again.',
    };
  }
  return { mode: 'box', statusLine: null };
}

function clampScaleNumber(n) {
  const value = typeof n === 'number' && Number.isFinite(n) ? n : 1;
  return Math.min(10, Math.max(0.1, value));
}

/**
 * applyUplinkScale(object3d, scale) -> object3d.
 * Sets the loaded model's scale from the assetLink {x, y, z} triple
 * (the 0.1–10 Import scale slider), clamped to the slider range,
 * defaulting any missing axis to 1.
 */
export function applyUplinkScale(object3d, scale) {
  const s = scale || {};
  object3d.scale.set(
    clampScaleNumber(s.x),
    clampScaleNumber(s.y),
    clampScaleNumber(s.z),
  );
  return object3d;
}

/**
 * groundUplinkModel(THREE, object3d) -> object3d.
 * Linked models arrive with any origin: centre the model over the
 * origin on X/Z and rest its lowest point on the ground plane (y = 0),
 * so it stands where the placeholder box stood instead of floating
 * or sinking. THREE is passed in, as in buildCreationMesh.
 */
export function groundUplinkModel(THREE, object3d) {
  const box = new THREE.Box3().setFromObject(object3d);
  if (box.isEmpty()) return object3d;
  const center = box.getCenter(new THREE.Vector3());
  object3d.position.x -= center.x;
  object3d.position.z -= center.z;
  object3d.position.y -= box.min.y;
  return object3d;
}
