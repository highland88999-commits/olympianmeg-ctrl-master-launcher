// lib/store/design-upload.js
// Server-side staging for Custom Designer print files (2026-10-15).
//
// Why this exists: the designer used to send each print file as a base64
// string inside one JSON POST. A detailed graphic composited at print
// resolution (4500x5400 for the hoodie) is ~22MB of PNG — ~30MB as
// base64 — which breaks the transport twice over: iOS Safari throws
// DOMException "The string did not match the expected pattern." on the
// oversized string payload (Merlin's 2026-10-15 demo, creations table
// empty — no creation had ever completed), and the payload is far past
// the serverless request-body limit besides.
//
// The fix: the browser uploads each print PNG as a binary file straight
// to a private Supabase Storage bucket through a one-time signed upload
// URL minted here; the create route then downloads the staged file
// server-side and forwards it to Printful exactly as before. Only the
// transport changed — pricing stays server-computed in the create route.
//
// Server-only: uses SUPABASE_SERVICE_ROLE_KEY, which never reaches the
// client. The Supabase client is imported lazily so this module's pure
// helpers stay loadable in plain Node (tests/store-design-upload).
import { randomUUID } from 'node:crypto';
import { getServiceClient } from '../economy/supabase.js';

export const DESIGN_UPLOAD_BUCKET = 'custom-design-uploads';

// uploads/<uuid>/<placement-key>.png — the only shape the create route
// will accept back. Unguessable per upload, no user input in the path.
const PATH_RE =
  /^uploads\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[a-z0-9_-]+\.png$/i;

export function isDesignUploadPath(p) {
  return typeof p === 'string' && PATH_RE.test(p);
}

export function designUploadPath(key) {
  return `uploads/${randomUUID()}/${key}.png`;
}

// The platform's shared lazy service-role client (same one the creator
// marketplace uses) — null when the service key is not configured.
async function storageAdmin() {
  const sb = await getServiceClient();
  if (!sb) throw new Error('Design uploads are not configured.');
  return sb;
}

let bucketReady = null;
export function ensureDesignUploadBucket() {
  if (!bucketReady) {
    bucketReady = (async () => {
      const sb = await storageAdmin();
      const { data } = await sb.storage.getBucket(DESIGN_UPLOAD_BUCKET);
      if (!data) {
        const { error } = await sb.storage.createBucket(DESIGN_UPLOAD_BUCKET, {
          public: false,
        });
        // A concurrent cold start may have created it first — fine.
        if (error && !/already exists/i.test(error.message || '')) {
          throw new Error('Design uploads are not configured.');
        }
      }
      return true;
    })();
    // Do not cache a failure forever; the next call may retry.
    bucketReady.catch(() => { bucketReady = null; });
  }
  return bucketReady;
}

// Mint a one-time signed upload URL for one placement's print file.
export async function mintDesignUpload(key) {
  await ensureDesignUploadBucket();
  const sb = await storageAdmin();
  const path = designUploadPath(key);
  const { data, error } = await sb.storage
    .from(DESIGN_UPLOAD_BUCKET)
    .createSignedUploadUrl(path);
  if (error || !data || !data.token) {
    throw new Error('Could not start the design upload.');
  }
  return { key, bucket: DESIGN_UPLOAD_BUCKET, path, token: data.token };
}

// Download a staged print file (create route). Buffer of raw PNG bytes.
export async function downloadDesignUpload(path) {
  const sb = await storageAdmin();
  const { data, error } = await sb.storage
    .from(DESIGN_UPLOAD_BUCKET)
    .download(path);
  if (error || !data) {
    throw new Error('We could not read the uploaded design file.');
  }
  return Buffer.from(await data.arrayBuffer());
}

// Best-effort cleanup of staged files once Printful has them (or a
// creation failed after staging). Never fails the caller's flow.
export async function deleteDesignUploads(paths) {
  try {
    if (!paths || !paths.length) return;
    const sb = await storageAdmin();
    await sb.storage.from(DESIGN_UPLOAD_BUCKET).remove(paths);
  } catch {
    /* staged files are private and inert; cleanup is best-effort */
  }
}
