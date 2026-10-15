// Fortress of Solitude — per-user Supabase Storage vault layer.
// Server-only: never import from client components.
//
// Every user gets their OWN private bucket: `fortress-<user_id>`.
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
 * Get-or-create the caller's private bucket (service role).
 * Idempotent: safe to call on every upload.
 */
export async function ensureUserBucket(admin, userId) {
  const bucket = vaultBucketName(userId);
  const { data, error } = await admin.storage.getBucket(bucket);
  if (!error && data) return bucket;
  // Not found (or any read hiccup) — create it. Private, with a sane cap.
  const { error: createError } = await admin.storage.createBucket(bucket, {
    public: false,
    fileSizeLimit: 500 * 1024 * 1024, // 500 MB per file; tiers gate total usage
  });
  if (createError && !/already exists|duplicate/i.test(createError.message)) {
    throw new Error(`Could not prepare your vault: ${createError.message}`);
  }
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
