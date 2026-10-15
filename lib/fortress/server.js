// Fortress of Solitude — shared server plumbing for the fortress API routes.
// Server-only: never import from client components.

/** The signed-in user from the request's Authorization header. */
export async function getFortressUser(req) {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return { error: 'Sign in to use your vault.', status: 401 };
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) return { error: 'Sign in to use your vault.', status: 401 };
    return { user };
  } catch {
    return { error: 'Could not verify your sign-in. Please try again.', status: 401 };
  }
}

/** Service-role client (bypasses RLS) for quota + share bookkeeping. */
export async function getFortressAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  try {
    const { createClient } = await import('@supabase/supabase-js');
    return createClient(url, key, { auth: { persistSession: false } });
  } catch {
    return null;
  }
}

function gcsBucketName() {
  return process.env.FIREBASE_STORAGE_BUCKET || process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
}

function gcsConfigError() {
  if (!process.env.GCP_PROJECT_ID || !process.env.GCP_SERVICE_ACCOUNT_KEY) {
    return 'Cloud storage is not connected yet.';
  }
  if (!gcsBucketName()) return 'Cloud storage bucket is not configured.';
  return null;
}

async function gcsStorage() {
  const { Storage } = await import('@google-cloud/storage');
  let serviceAccount;
  try {
    serviceAccount = JSON.parse(process.env.GCP_SERVICE_ACCOUNT_KEY);
  } catch {
    throw new Error('Cloud storage credential is invalid.');
  }
  return new Storage({ projectId: process.env.GCP_PROJECT_ID, credentials: serviceAccount });
}

/* signedReadUrl + deleteVaultObject: Supabase-aware implementations live
   below, next to the key helpers (isSupabaseVaultKey / vaultKeyOwner). */

/** Every vault file lives under the owner's own prefix — nothing else is touchable.
 *  Accepts both key formats:
 *    NEW (Supabase per-user bucket): fortress-<user_id>/vault/...
 *    LEGACY (GCS shared bucket):     vaults/<user_id>/...            */
export function ownerPrefix(userId) {
  return `vaults/${userId}/`;
}

/** True when the key belongs to this user in either storage generation. */
export function isOwnerKey(userId, key) {
  if (typeof key !== 'string' || !key) return false;
  return key.startsWith(`fortress-${userId}/`) || key.startsWith(ownerPrefix(userId));
}

/** Extract the owning user id from a vault key, or null when unrecognized. */
export function vaultKeyOwner(key) {
  if (typeof key !== 'string') return null;
  let m = key.match(/^fortress-([0-9a-f-]{36})\//i);
  if (m) return m[1].toLowerCase();
  m = key.match(/^vaults\/([0-9a-f-]{36})\//i);
  if (m) return m[1].toLowerCase();
  return null;
}

/** True when the key lives in a Supabase per-user bucket (not legacy GCS). */
export function isSupabaseVaultKey(key) {
  return /^fortress-[0-9a-f-]{36}\//i.test(key || '');
}

function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  // Lazy import keeps the GCS-only paths from paying for the SDK.
  const { createClient } = require('@supabase/supabase-js');
  return createClient(url, key, { auth: { persistSession: false } });
}

/** A v4 signed read URL for a vault object (fresh, short-lived).
 *  Routes by key: Supabase per-user buckets for new keys, legacy GCS
 *  for files stored before the per-user migration. */
export async function signedReadUrl(filePath, minutes = 60) {
  if (isSupabaseVaultKey(filePath)) {
    const admin = supabaseAdmin();
    if (!admin) throw new Error('Storage is unavailable right now.');
    const owner = vaultKeyOwner(filePath);
    const bucket = `fortress-${owner}`;
    const path = filePath.slice(bucket.length + 1);
    const { data, error } = await admin.storage
      .from(bucket)
      .createSignedUrl(path, Math.max(1, Math.min(minutes, 24 * 60)) * 60);
    if (error || !data?.signedUrl) {
      throw new Error(`Could not open the file: ${error?.message || 'unknown error'}`);
    }
    return data.signedUrl;
  }
  // Legacy GCS path.
  const configError = gcsConfigError();
  if (configError) throw new Error(configError);
  const storage = await gcsStorage();
  const file = storage.bucket(gcsBucketName()).file(filePath);
  const [url] = await file.getSignedUrl({
    version: 'v4',
    action: 'read',
    expires: Date.now() + minutes * 60 * 1000,
  });
  return url;
}

/** Delete a vault object. Routes by key; throws when storage is misconfigured. */
export async function deleteVaultObject(filePath) {
  if (isSupabaseVaultKey(filePath)) {
    const admin = supabaseAdmin();
    if (!admin) throw new Error('Storage is unavailable right now.');
    const owner = vaultKeyOwner(filePath);
    const bucket = `fortress-${owner}`;
    const path = filePath.slice(bucket.length + 1);
    const { error } = await admin.storage.from(bucket).remove([path]);
    if (error) throw new Error(`Could not remove the file: ${error.message}`);
    return;
  }
  // Legacy GCS path.
  const configError = gcsConfigError();
  if (configError) throw new Error(configError);
  const storage = await gcsStorage();
  await storage.bucket(gcsBucketName()).file(filePath).delete({ ignoreNotFound: true });
}
