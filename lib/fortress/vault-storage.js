// Fortress of Solitude — per-user Supabase Storage vault layer.
// Server-only: never import from client components.
//
import { VAULT_PER_FILE_LIMIT_BYTES, formatBytes } from './tiers.js';// Every user gets their OWN private bucket: `fortress-<user_id>`.
// Buckets are created on first use with the service role (bypasses RLS).
// All paths below are validated to live inside the caller's own bucket —
// no cross-user access, ever.
//
// Storage key format (stored in crystal_matrix.fileStorageKey and
// fortress_shares.file_path):
//   NEW (Supabase):  fortress-<user_id>/vault/<name>
//   LEGACY (GCS):    vaults/<user_id>/<name>
// The legacy GCS helpers remain in lib/fortress/server.js as a read
// fallback for files stored before the Supabase migration.

/** The caller's private bucket name. UUIDs are lowercase hex + dashes — safe. */
export function vaultBucketName(userId) {
  return `fortress-${userId}`;
}

/** True when the key is a Supabase per-user vault key owned by this user. */
export function isVaultKey(userId, key) {
  return typeof key === 'string' && key.startsWith(`${vaultBucketName(userId)}/`);
}

/** Split a vault key into { bucket, path }. Returns null when not a vault key. */
export function parseVaultKey(userId, key) {
  if (!isVaultKey(userId, key)) return null;
  const bucket = vaultBucketName(userId);
  const path = key.slice(bucket.length + 1);
  if (!path || path.includes('..')) return null;
  return { bucket, path };
}

/** Sanitize a client-supplied object name: no traversal, no leading slash. */
export function cleanObjectName(name) {
  const n = String(name || '').trim().replace(/^\/+/, '');
  if (!n || n.includes('..') || n.length > 256) return null;
  return n;
}

/**
 * Get-or-create the caller's private bucket (service role) — detailed form.
 * Idempotent: safe to call on every upload AND on first load.
 *
 * Cap rule (never silent, never restrictive): the bucket carries a per-file
 * cap (VAULT_PER_FILE_LIMIT_BYTES). An existing bucket whose cap is LOWER
 * than the current value gets raised to it where the Storage API allows —
 * raising a cap can only make saves succeed — and the alignment is REPORTED
 * (capAligned + previous value) so nothing changes quietly. An existing
 * bucket whose cap is HIGHER is left alone and its live value is reported,
 * so no user's room is ever silently reduced. A failed alignment never
 * blocks the vault; the ensure route reports the live cap and the UI shows
 * it, so the user always sees the truth.
 *
 * PLAN-CAP FALLBACK (the vault must never stay broken over a cap): a
 * per-bucket cap ABOVE the project's plan-global file size limit is
 * rejected by the Storage API ("The object exceeded the maximum allowed
 * size" — Supabase Free caps the global at 50 MB, and a per-bucket cap
 * above the global is refused). When creation with the 500 MB cap fails
 * on a size message, the bucket is created WITHOUT a per-bucket cap
 * instead, and the fallback is flagged (capFallback) so the UI says the
 * per-file size follows the Supabase plan rather than claiming 500 MB.
 * Size is still enforced in the app: the client pre-check, the quota gate
 * on the upload path, and the total allowance. A bucket that never gets
 * created is a vault that never works — the fallback keeps it working.
 *
 * Returns { bucket, capAligned, previousFileSizeLimitBytes, fileSizeLimitBytes, capFallback? }.
 */
export async function ensureUserBucketDetailed(admin, userId) {
  const bucket = vaultBucketName(userId);
  const { data, error } = await admin.storage.getBucket(bucket);
  if (!error && data) {
    const live = data.file_size_limit ?? null;
    let capAligned = false;
    let previousFileSizeLimitBytes = live;
    if (
      live !== null &&
      live < VAULT_PER_FILE_LIMIT_BYTES &&
      typeof admin.storage.updateBucket === 'function'
    ) {
      try {
        await admin.storage.updateBucket(bucket, {
          fileSizeLimit: VAULT_PER_FILE_LIMIT_BYTES,
        });
        capAligned = true;
      } catch {
        // Alignment is best-effort — the old cap stays, and the live value
        // is reported so the UI shows the truth.
      }
    }
    return {
      bucket,
      capAligned,
      previousFileSizeLimitBytes,
      fileSizeLimitBytes: capAligned ? VAULT_PER_FILE_LIMIT_BYTES : live,
    };
  }
  // Not found (or any read hiccup) — create it. Private, with a sane cap.
  const { error: createError } = await admin.storage.createBucket(bucket, {
    public: false,
    fileSizeLimit: VAULT_PER_FILE_LIMIT_BYTES, // 500 MB per file; tiers gate total usage
  });
  if (createError) {
    if (/already exists|duplicate/i.test(createError.message)) {
      // The bucket landed after all (race) — report its LIVE cap, never
      // the constant, so the UI shows the truth.
      const { data: liveData } = await admin.storage.getBucket(bucket);
      return {
        bucket,
        capAligned: false,
        previousFileSizeLimitBytes: null,
        fileSizeLimitBytes: liveData?.file_size_limit ?? null,
      };
    }
    if (/exceed|maximum allowed size|limit/i.test(createError.message)) {
      // The plan-global file size limit is lower than our 500 MB request
      // (Supabase Free caps the global at 50 MB; a per-bucket cap above
      // the global is refused). Create WITHOUT a per-bucket cap instead —
      // size stays enforced in the app (client pre-check + quota gate) —
      // and flag the fallback so the UI never claims 500 MB it can't keep.
      const { error: retryError } = await admin.storage.createBucket(bucket, {
        public: false,
      });
      if (retryError && !/already exists|duplicate/i.test(retryError.message)) {
        throw new Error(
          `Could not prepare your vault: ${retryError.message} (vault files are limited to ${formatBytes(VAULT_PER_FILE_LIMIT_BYTES)} each)`
        );
      }
      const { data: liveData } = await admin.storage.getBucket(bucket);
      return {
        bucket,
        capAligned: false,
        previousFileSizeLimitBytes: null,
        fileSizeLimitBytes: liveData?.file_size_limit ?? null,
        capFallback: true,
      };
    }
    throw new Error(
      `Could not prepare your vault: ${createError.message} (vault files are limited to ${formatBytes(VAULT_PER_FILE_LIMIT_BYTES)} each)`
    );
  }
  return {
    bucket,
    capAligned: false,
    previousFileSizeLimitBytes: null,
    fileSizeLimitBytes: VAULT_PER_FILE_LIMIT_BYTES,
  };
}

/** String form of ensureUserBucketDetailed — the shape existing callers use. */
export async function ensureUserBucket(admin, userId) {
  const { bucket } = await ensureUserBucketDetailed(admin, userId);
  return bucket;
}

/** Short-lived signed URL the browser PUTs the file to. */
export async function signVaultUploadUrl(admin, userId, objectName, contentType) {
  const clean = cleanObjectName(objectName);
  if (!clean) throw new Error('Invalid file name.');
  const bucket = await ensureUserBucket(admin, userId);
  const path = `vault/${clean}`;
  const { data, error } = await admin.storage
    .from(bucket)
    .createSignedUploadUrl(path, { upsert: true });
  if (error || !data?.signedUrl) {
    throw new Error(`Could not start the upload: ${error?.message || 'unknown error'}`);
  }
  return { uploadUrl: data.signedUrl, fileStorageKey: `${bucket}/${path}`, path };
}

/** Short-lived signed URL the browser GETs the file from. */
export async function signVaultDownloadUrl(admin, userId, fileStorageKey, minutes = 60) {
  const parsed = parseVaultKey(userId, fileStorageKey);
  if (!parsed) throw new Error('That file is not in your vault.');
  const { data, error } = await admin.storage
    .from(parsed.bucket)
    .createSignedUrl(parsed.path, Math.max(1, Math.min(minutes, 24 * 60)) * 60);
  if (error || !data?.signedUrl) {
    throw new Error(`Could not open the file: ${error?.message || 'unknown error'}`);
  }
  return data.signedUrl;
}

/** List the caller's vault files (name, size, updated_at). */
export async function listVaultObjects(admin, userId, prefix = 'vault') {
  const bucket = vaultBucketName(userId);
  const { data, error } = await admin.storage.from(bucket).list(prefix, {
    limit: 500,
    sortBy: { column: 'updated_at', order: 'desc' },
  });
  if (error) {
    // No bucket yet (or empty vault) is not an error — it's an empty vault.
    if (/not found|does not exist/i.test(error.message)) return [];
    throw new Error(`Could not list your vault: ${error.message}`);
  }
  return (data || [])
    .filter((o) => o.name !== '.emptyFolderPlaceholder')
    .map((o) => ({
      name: o.name,
      fileStorageKey: `${bucket}/${prefix}/${o.name}`,
      size: o.metadata?.size ?? null,
      updatedAt: o.updated_at,
      mimeType: o.metadata?.mimetype ?? null,
    }));
}

/** Delete one of the caller's vault files. */
export async function deleteVaultObject(admin, userId, fileStorageKey) {
  const parsed = parseVaultKey(userId, fileStorageKey);
  if (!parsed) throw new Error('That file is not in your vault.');
  const { error } = await admin.storage.from(parsed.bucket).remove([parsed.path]);
  if (error) throw new Error(`Could not remove the file: ${error.message}`);
  return true;
}
