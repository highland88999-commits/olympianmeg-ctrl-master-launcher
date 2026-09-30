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

/** A v4 signed read URL for a vault object (fresh, short-lived). */
export async function signedReadUrl(filePath, minutes = 60) {
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

/** Delete a vault object. Throws when storage is misconfigured. */
export async function deleteVaultObject(filePath) {
  const configError = gcsConfigError();
  if (configError) throw new Error(configError);
  const storage = await gcsStorage();
  await storage.bucket(gcsBucketName()).file(filePath).delete({ ignoreNotFound: true });
}

/** Every vault file lives under the owner's own prefix — nothing else is touchable. */
export function ownerPrefix(userId) {
  return `vaults/${userId}/`;
}
