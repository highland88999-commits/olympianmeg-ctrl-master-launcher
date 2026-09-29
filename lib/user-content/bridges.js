// lib/user-content/bridges.js
//
// Integration helpers: register media that programs already store into the
// universal user-content pool.
//
// PROFILE bridge: the profile gallery keeps its photos/videos in its own
// IndexedDB database ('universal-profile-media'). When a gallery item is
// saved, this bridge copies its blob into the pool's own blob store
// ('nexus-user-content') and registers exactly one pool item:
//
//   id:            'profile-media:<mediaId>'   (deterministic -> dedupes)
//   type:          'image' | 'video'
//   originProgram: 'profile'
//   blobRef:       the blob's id in the pool store
//
// The copy keeps the pool self-contained: one blob store for sync to read,
// while the profile gallery keeps working exactly as before. Registration is
// best-effort and never throws — a blocked store must never break uploads.

import { getPool, getItem, addItem, removeItem, persistPool } from './pool.js';
import { saveBlob, deleteBlob } from './store-idb.js';

export function profilePoolId(mediaId) {
  return 'profile-media:' + String(mediaId || '').trim();
}

export function profileBlobId(mediaId) {
  return 'poolblob:' + String(mediaId || '').trim();
}

export function profileKindToPoolType(kind) {
  return kind === 'video' ? 'video' : 'image';
}

// registerProfileMedia(mediaMeta, blob) -> Promise<{ ok, deduped?, item?, error? }>.
// mediaMeta: { id, kind, name?, createdAt? } from the profile gallery.
// Copies the blob into the pool store and registers it once. Never throws.
export async function registerProfileMedia(mediaMeta, blob) {
  try {
    const meta = mediaMeta && typeof mediaMeta === 'object' ? mediaMeta : {};
    const mediaId = typeof meta.id === 'string' ? meta.id.trim() : '';
    if (!mediaId || !blob) return { ok: false, error: 'bad-input' };
    const pool = getPool();
    const poolId = profilePoolId(mediaId);
    if (getItem(pool, poolId)) return { ok: true, deduped: true };
    const blobId = await saveBlob(blob, {
      id: profileBlobId(mediaId),
      name: typeof meta.name === 'string' ? meta.name : 'upload',
    });
    const r = addItem(pool, {
      id: poolId,
      type: profileKindToPoolType(meta.kind),
      title: typeof meta.name === 'string' && meta.name.trim() ? meta.name.trim() : 'Profile upload',
      originProgram: 'profile',
      blobRef: blobId,
      createdAt: meta.createdAt || new Date().toISOString(),
      syncState: 'local-only',
    });
    if (r.ok) persistPool();
    return r.ok ? { ok: true, item: r.item } : { ok: false, error: r.error };
  } catch (err) {
    return { ok: false, error: 'exception:' + String((err && err.message) || err) };
  }
}

// registerAllProfileMedia(listMetas, getFull) — register every existing
// gallery item exactly once (dedupe by deterministic id). getFull(id) must
// resolve to the full media record including the blob (profile.js
// getMediaItem). Best-effort: failures are counted, never thrown.
export async function registerAllProfileMedia(listMetas, getFull) {
  const result = { registered: 0, deduped: 0, failed: 0 };
  try {
    const metas = Array.isArray(listMetas) ? listMetas : [];
    for (const meta of metas) {
      try {
        const full = await getFull(meta.id);
        if (!full || !full.blob) { result.failed += 1; continue; }
        const r = await registerProfileMedia(meta, full.blob);
        if (r.ok && r.deduped) result.deduped += 1;
        else if (r.ok) result.registered += 1;
        else result.failed += 1;
      } catch {
        result.failed += 1;
      }
    }
  } catch {
    /* return partial counts */
  }
  return result;
}

// unregisterProfileMedia(mediaId) — remove the pool item + its blob copy
// when a gallery item is deleted. Best-effort, never throws.
export async function unregisterProfileMedia(mediaId) {
  try {
    const pool = getPool();
    removeItem(pool, profilePoolId(mediaId));
    await deleteBlob(profileBlobId(mediaId)).catch(() => {});
    persistPool();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: 'exception:' + String((err && err.message) || err) };
  }
}
