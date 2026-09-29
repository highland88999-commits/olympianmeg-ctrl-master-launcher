// lib/user-content/sync.js
//
// Pool -> cloud sync: push a pool item's blob to Firebase Storage and record
// the resulting remoteUrl on the item.
//
// Honest sync states (also see pool.js SYNC_STATES):
// - 'local-only':   lives only on this device (blob, no remote copy yet).
// - 'synced':       content is available remotely — a Firebase download URL
//                   after a real upload, or a third-party source (Spotify URI)
//                   for seeded items. Nothing to upload.
// - 'sync-failed':  the last upload attempt really failed (network, auth,
//                   bucket rules). The blob is still safe on-device.
// - 'unconfigured': Firebase env vars are absent. Nothing was attempted and
//                   nothing was faked — the item stays local.
//
// syncItem() takes its dependencies as an argument so tests can run with
// fakes and the browser wires the real store-idb + firebase.js adapters.
// Nothing here touches IndexedDB, fetch, or env vars directly.

import { getItem } from './pool.js';
import { loadBlob as realLoadBlob } from './store-idb.js';
import { uploadBlob as realUpload, getDownloadUrl as realGetUrl, defaultPath, isConfigured } from './firebase.js';

function setState(registry, id, state, extra) {
  try {
    const stored = registry && registry.items instanceof Map ? registry.items.get(id) : null;
    if (!stored) return null;
    stored.syncState = state;
    if (extra && typeof extra === 'object') {
      for (const k of Object.keys(extra)) stored[k] = extra[k];
    }
    return { ...stored };
  } catch {
    return null;
  }
}

// syncItem(registry, id, deps) -> { ok, state, item?, error? }.
// deps: {
//   loadBlob(id) -> Promise<Blob|null>,
//   upload(path, blob, { idToken }) -> Promise<{ ok, downloadToken?, error? }>,
//   getUrl(path, downloadToken?) -> string | null,
//   idToken?: string,          // Firebase user ID token for real uploads
//   path?: string,             // override Storage object path
//   persist?: () => void,      // called after the registry is updated
// }
// Never throws on bad input.
export async function syncItem(registry, id, deps) {
  try {
    const d = deps && typeof deps === 'object' ? deps : {};
    const item = getItem(registry, id);
    if (!item) return { ok: false, error: 'not-found', state: null };

    // Remote-only items (seeded station tracks, playlists): nothing to
    // upload. If they have a remoteUrl they are already available remotely.
    if (!item.blobRef) {
      if (item.remoteUrl) {
        const updated = setState(registry, item.id, 'synced');
        if (typeof d.persist === 'function') { try { d.persist(); } catch { /* noop */ } }
        return { ok: true, state: 'synced', skipped: 'remote-only', item: updated };
      }
      setState(registry, item.id, 'local-only');
      return { ok: false, error: 'nothing-to-sync', state: 'local-only', item: getItem(registry, item.id) };
    }

    const loadBlob = typeof d.loadBlob === 'function' ? d.loadBlob : null;
    const upload = typeof d.upload === 'function' ? d.upload : null;
    const getUrl = typeof d.getUrl === 'function' ? d.getUrl : null;
    if (!loadBlob || !upload) {
      return { ok: false, error: 'no-adapters', state: item.syncState, item };
    }

    const blob = await loadBlob(item.blobRef).catch(() => null);
    if (!blob) {
      return { ok: false, error: 'blob-missing', state: item.syncState, item };
    }

    const path = typeof d.path === 'string' && d.path.trim() ? d.path.trim() : defaultPath(item.id);
    const result = await upload(path, blob, { idToken: d.idToken });
    const finish = (state, extra) => {
      const updated = setState(registry, item.id, state, extra);
      if (typeof d.persist === 'function') { try { d.persist(); } catch { /* noop */ } }
      return updated;
    };

    if (!result || !result.ok) {
      const err = (result && result.error) || 'upload-failed';
      if (String(err) === 'unconfigured') {
        const updated = finish('unconfigured');
        return { ok: false, error: 'unconfigured', state: 'unconfigured', item: updated };
      }
      const updated = finish('sync-failed');
      return { ok: false, error: err, state: 'sync-failed', item: updated };
    }

    const remoteUrl = getUrl ? getUrl(path, result.downloadToken) : null;
    const updated = finish('synced', remoteUrl ? { remoteUrl } : {});
    return { ok: true, state: 'synced', item: updated };
  } catch (err) {
    return { ok: false, error: 'exception:' + String((err && err.message) || err), state: null };
  }
}

// syncItemWithDefaults(registry, id, { idToken }?) — browser wiring: real
// IndexedDB blob store + real Firebase adapter. Reports 'unconfigured'
// honestly when env vars are absent; never fabricates a remoteUrl.
export function syncItemWithDefaults(registry, id, opts) {
  const options = opts && typeof opts === 'object' ? opts : {};
  return syncItem(registry, id, {
    loadBlob: realLoadBlob,
    upload: realUpload,
    getUrl: realGetUrl,
    idToken: options.idToken,
    path: options.path,
    persist: options.persist,
  });
}

// describeSyncState(state) -> plain-English label for UI.
export function describeSyncState(state) {
  switch (state) {
    case 'synced': return 'Available';
    case 'sync-failed': return 'Upload failed — still on this device';
    case 'unconfigured': return 'Cloud not connected — on this device only';
    case 'local-only':
    default: return 'On this device only';
  }
}
