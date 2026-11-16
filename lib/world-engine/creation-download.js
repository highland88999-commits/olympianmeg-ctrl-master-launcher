// World Engine — creation download: one Download button per asset card in
// My Creations, same button and same behaviour in every category.
//
// What an asset REALLY is (verified against the world_engine_assets table
// and GET /api/profiles/:id/creations):
// - asset_url is a real http(s) URL -> the asset IS a file somewhere else:
//   an Uplink original, or a forge weapon built from a .glb URL. The
//   download fetches that file and saves it as-is.
// - asset_url is 'procedural_generation' (the default) -> the asset is
//   params-only: no file exists anywhere. The download is a .zip with
//   two real, openable files inside:
//     <slug>.json — the data file: name, category, prompt,
//       generation_params, seed (worlds), asset_url, created_at —
//       everything needed to re-forge the asset exactly.
//     <slug>.glb — the 3D model, rebuilt offscreen from the same
//       builder functions the live preview uses (creation-mesh.js),
//       exported with three's GLTFExporter. Worlds are the displaced
//       planet, weapons the procedural firearm, weather a frozen
//       snapshot of its particle system (points), characters a
//       capsule, vehicles/objects the box with the gold Omega mark.
//   The mesh is rebuilt, never grabbed from the live viewport, so the
//   download works even before a card's preview has scrolled into
//   view — and the preview and the file can never drift apart.
//
// Client-only: everything here runs on a tap (the module is loaded
// with a dynamic import from the card). Nothing runs at import time.
// No new tables, no SQL, no network beyond the asset's own URL.
import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import JSZip from 'jszip';
import { buildCreationMesh } from './creation-mesh.js';

export const CREATION_BUNDLE_FORMAT = 'olympus-creation/1';

// A real file URL (an Uplink original or a forge .glb) versus the
// 'procedural_generation' marker, which means params-only.
export function isExternalFileUrl(assetUrl) {
  return (
    typeof assetUrl === 'string' &&
    (assetUrl.startsWith('http://') || assetUrl.startsWith('https://'))
  );
}

export function creationSlug(asset = {}) {
  const raw = String(asset.display_name || asset.name || '').trim().toLowerCase();
  const slug = raw
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  if (slug) return slug;
  const id = String(asset.id || '').replace(/[^a-z0-9]+/gi, '').slice(0, 8);
  return id ? 'creation-' + id.toLowerCase() : 'creation';
}

// The data file: everything needed to re-forge the asset exactly.
// Worlds carry their seed; every category carries its prompt and params.
export function creationBundle(asset = {}) {
  return {
    format: CREATION_BUNDLE_FORMAT,
    id: asset.id || null,
    name: asset.display_name || asset.name || ('Untitled ' + (asset.category || 'creation')),
    category: asset.category || null,
    prompt: asset.prompt || null,
    asset_url: asset.asset_url || 'procedural_generation',
    seed: asset.seed ?? null,
    generation_params: asset.generation_params || {},
    created_at: asset.created_at || null,
    exported_at: new Date().toISOString(),
    source: 'olympusverse.com/profile — My Creations',
  };
}

// exportCreationGlb(category, params) -> ArrayBuffer (binary GLB).
// Builds the mesh offscreen and exports it; the live viewport is never
// touched. The mesh is disposed afterwards; the shared Omega texture is
// cached on purpose, so maps are left alone.
export function exportCreationGlb(category, params) {
  return new Promise((resolve, reject) => {
    let mesh;
    try {
      mesh = buildCreationMesh(THREE, category, params || {});
    } catch (err) {
      reject(new Error('Could not build the 3D model: ' + (err && err.message ? err.message : 'unknown error')));
      return;
    }
    const exporter = new GLTFExporter();
    exporter.parse(
      mesh,
      (result) => {
        try {
          mesh.traverse((o) => {
            if (o.geometry) o.geometry.dispose();
            if (o.material) {
              const mats = Array.isArray(o.material) ? o.material : [o.material];
              mats.forEach((m) => m.dispose());
            }
          });
        } catch { /* dispose is best-effort */ }
        if (result instanceof ArrayBuffer) resolve(result);
        else reject(new Error('The 3D export came back in the wrong shape. Try again.'));
      },
      (err) => reject(new Error('The 3D export failed: ' + (err && err.message ? err.message : 'unknown error'))),
      { binary: true }
    );
  });
}

// exportCreationZip(asset) -> Blob (application/zip) holding the data file
// and the 3D model, both named after the asset.
export async function exportCreationZip(asset = {}) {
  const slug = creationSlug(asset);
  const bundle = creationBundle(asset);
  const glb = await exportCreationGlb(asset.category, asset.generation_params || {});
  const zip = new JSZip();
  zip.file(slug + '.json', JSON.stringify(bundle, null, 2));
  zip.file(slug + '.glb', glb);
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
}

function fileNameFromUrl(url, fallbackSlug) {
  try {
    const u = new URL(url);
    const base = decodeURIComponent(u.pathname.split('/').filter(Boolean).pop() || '');
    if (/^[\w.\-]+\.[A-Za-z0-9]{1,5}$/.test(base)) return base;
  } catch { /* fall through */ }
  return fallbackSlug;
}

function saveBlob(blob, fileName) {
  if (typeof document === 'undefined' || typeof URL === 'undefined' || !URL.createObjectURL) {
    throw new Error('Downloads need a browser. Try again on your phone or computer.');
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => {
    try { URL.revokeObjectURL(url); } catch { /* noop */ }
  }, 5000);
}

// downloadCreation(asset) -> { fileName, kind }.
// kind 'file': the asset's own file, saved as-is.
// kind 'zip': the params-only bundle (data file + GLB model).
// kind 'opened': the file URL could not be fetched directly (usually the
//   host blocks cross-site downloads), so it was opened in a new tab for
//   the user to save from there. Throws a plain-English Error otherwise.
export async function downloadCreation(asset = {}) {
  const slug = creationSlug(asset);
  if (isExternalFileUrl(asset.asset_url)) {
    const fileName = fileNameFromUrl(asset.asset_url, slug);
    try {
      const res = await fetch(asset.asset_url);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const blob = await res.blob();
      saveBlob(blob, fileName);
      return { fileName, kind: 'file' };
    } catch {
      if (typeof window !== 'undefined' && window.open) {
        window.open(asset.asset_url, '_blank', 'noopener');
        return { fileName, kind: 'opened' };
      }
      throw new Error('Could not download that file. Open the original link and save it from there.');
    }
  }
  const blob = await exportCreationZip(asset);
  const fileName = slug + '.zip';
  saveBlob(blob, fileName);
  return { fileName, kind: 'zip' };
}
