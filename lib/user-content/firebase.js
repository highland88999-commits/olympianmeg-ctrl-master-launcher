// lib/user-content/firebase.js
//
// Firebase Storage adapter for the user-content pool.
//
// Configuration comes ONLY from env vars:
//   NEXT_PUBLIC_FIREBASE_API_KEY
//   NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
//   NEXT_PUBLIC_FIREBASE_PROJECT_ID
//   NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
//   NEXT_PUBLIC_FIREBASE_APP_ID
//
// HONESTY RULE: when the env vars are absent, isConfigured() returns false
// and uploadBlob() reports { ok: false, error: 'unconfigured' }. It never
// fakes an upload and never pretends to be connected.
//
// Uploads use the Firebase Storage REST API directly (no SDK dependency):
//   POST https://firebasestorage.googleapis.com/v0/b/{bucket}/o
//       ?uploadType=media&name={encoded path}
//   Authorization: Bearer <Firebase ID token>
//   Content-Type: <blob mime>
//
// A Firebase ID token (user auth) is required for a REAL upload — the module
// does not invent credentials. Per-user path prefixing lands with the
// Firebase Auth wiring (currently queued); paths below use 'pool/<id>'.

const ENV_KEYS = [
  'NEXT_PUBLIC_FIREBASE_API_KEY',
  'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN',
  'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
  'NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET',
  'NEXT_PUBLIC_FIREBASE_APP_ID',
];

function readEnv(name) {
  try {
    if (typeof process !== 'undefined' && process.env) {
      const v = process.env[name];
      if (typeof v === 'string' && v.trim()) return v.trim();
    }
  } catch {
    /* noop */
  }
  return null;
}

export function getFirebaseConfig() {
  const cfg = {};
  for (const key of ENV_KEYS) cfg[key] = readEnv(key);
  return cfg;
}

// isConfigured() -> true only when every required env var is present.
export function isConfigured() {
  const cfg = getFirebaseConfig();
  return ENV_KEYS.every((k) => !!cfg[k]);
}

function storageBucket() {
  return readEnv('NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET');
}

// uploadBlob(path, blob, { idToken }) -> { ok, downloadToken?, error? }.
// - 'unconfigured': env vars missing — honest, never fakes an upload.
// - 'no-blob': nothing to send.
// - 'no-auth-token': configured but no user ID token supplied. The upload is
//   a real write to the user's own project; without auth we do not guess.
// - On network/permission failure the provider's status surfaces as
//   'upload-failed:<status>'.
export async function uploadBlob(path, blob, opts) {
  if (!isConfigured()) {
    return { ok: false, error: 'unconfigured' };
  }
  if (!blob) {
    return { ok: false, error: 'no-blob' };
  }
  if (!path || typeof path !== 'string' || !path.trim()) {
    return { ok: false, error: 'bad-path' };
  }
  const options = opts && typeof opts === 'object' ? opts : {};
  const idToken = typeof options.idToken === 'string' ? options.idToken.trim() : '';
  if (!idToken) {
    return { ok: false, error: 'no-auth-token' };
  }
  const bucket = storageBucket();
  const url =
    'https://firebasestorage.googleapis.com/v0/b/' +
    encodeURIComponent(bucket) +
    '/o?uploadType=media&name=' +
    encodeURIComponent(path.trim());
  try {
    const fetchFn = typeof fetch !== 'undefined' ? fetch : null;
    if (!fetchFn) return { ok: false, error: 'no-fetch' };
    const mime = (blob && blob.type) || 'application/octet-stream';
    const res = await fetchFn(url, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + idToken,
        'Content-Type': mime,
      },
      body: blob,
    });
    if (!res.ok) {
      return { ok: false, error: `upload-failed:${res.status}` };
    }
    const data = await res.json().catch(() => ({}));
    return { ok: true, downloadToken: data.downloadTokens || null };
  } catch (err) {
    return { ok: false, error: 'network:' + String((err && err.message) || err) };
  }
}

// getDownloadUrl(path, downloadToken?) -> string | null.
// Builds the public download URL for an uploaded object. With a download
// token it works regardless of bucket rules; without one the object must be
// publicly readable. Returns null when unconfigured — never a fake URL.
export function getDownloadUrl(path, downloadToken) {
  if (!isConfigured()) return null;
  if (!path || typeof path !== 'string' || !path.trim()) return null;
  const bucket = storageBucket();
  let url =
    'https://firebasestorage.googleapis.com/v0/b/' +
    encodeURIComponent(bucket) +
    '/o/' +
    encodeURIComponent(path.trim()) +
    '?alt=media';
  if (typeof downloadToken === 'string' && downloadToken.trim()) {
    url += '&token=' + encodeURIComponent(downloadToken.trim());
  }
  return url;
}

// defaultPath(itemId) -> the Storage object path for a pool item id.
export function defaultPath(itemId) {
  return `pool/${String(itemId || '').trim() || 'unknown'}`;
}
