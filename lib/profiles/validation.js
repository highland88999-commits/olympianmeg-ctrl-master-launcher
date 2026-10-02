// lib/profiles/validation.js
// Validation + sanitization for the user profile system.
// Pure functions — safe to import from client components, API routes, tests.

export const PROFILE_TYPES = ['personal', 'business'];

export const LIMITS = {
  usernameMin: 2,
  usernameMax: 32,
  displayNameMax: 60,
  bioMax: 500,
  websitesMax: 5,
  websiteMax: 200,
  artTitleMax: 120,
  artDescriptionMax: 1000,
  postBodyMax: 2000,
  // Upload caps (keep phone data usage sane)
  imageMaxBytes: 10 * 1024 * 1024, // 10 MB
  videoMaxBytes: 100 * 1024 * 1024, // 100 MB
};

export const IMAGE_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

export const VIDEO_MIME = new Set([
  'video/mp4',
  'video/webm',
  'video/quicktime',
]);

// Background video presets for the public profile page. Only these exact
// paths are accepted — no arbitrary URLs, so a profile can never hotlink
// somewhere unexpected.
export const BACKGROUND_VIDEO_PRESETS = [
  { id: 'none', label: 'None', src: '' },
  { id: 'nebula', label: 'Nebula drift', src: '/videos/menu-background.mp4' },
];

export function isValidBackgroundVideo(v) {
  if (v === '' || v == null) return true;
  return BACKGROUND_VIDEO_PRESETS.some((p) => p.src === v);
}

// Usernames are URL slugs: lowercase letters, digits, dashes.
const USERNAME_RE = /^[a-z0-9]([a-z0-9-]{0,30}[a-z0-9])?$/;

export function isValidUsername(v) {
  return typeof v === 'string' && v.length >= LIMITS.usernameMin && v.length <= LIMITS.usernameMax && USERNAME_RE.test(v);
}

// Turn an arbitrary string (email prefix, display name) into a username slug.
export function slugifyUsername(raw) {
  let s = String(raw || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24);
  if (s.length < LIMITS.usernameMin) s = 'user';
  return s;
}

export function sanitizeText(v, max) {
  if (typeof v !== 'string') return '';
  return v.replace(/\0/g, '').trim().slice(0, max);
}

function cleanUrl(v) {
  let u = sanitizeText(v, LIMITS.websiteMax);
  if (!u) return '';
  if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
  try {
    const parsed = new URL(u);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
    // Hostnames need a dot (or be localhost) — keeps 'notaurl://x'-style
    // strings from becoming bogus links.
    if (!parsed.hostname.includes('.') && parsed.hostname !== 'localhost') return '';
    return parsed.toString().slice(0, LIMITS.websiteMax);
  } catch {
    return '';
  }
}

export function sanitizeWebsites(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const item of list) {
    const u = cleanUrl(item);
    if (u && !out.includes(u)) out.push(u);
    if (out.length >= LIMITS.websitesMax) break;
  }
  return out;
}

// validateProfileUpdate(raw) -> { ok, value } | { ok:false, error }
// Only whitelisted fields survive; everything is length-capped.
export function validateProfileUpdate(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: 'Invalid profile data.' };
  }
  const value = {};
  if ('display_name' in raw) value.display_name = sanitizeText(raw.display_name, LIMITS.displayNameMax);
  if ('bio' in raw) value.bio = sanitizeText(raw.bio, LIMITS.bioMax);
  if ('avatar_url' in raw) value.avatar_url = sanitizeText(raw.avatar_url, 500) || null;
  if ('profile_video_url' in raw) value.profile_video_url = sanitizeText(raw.profile_video_url, 500) || null;
  if ('cover_url' in raw) value.cover_url = sanitizeText(raw.cover_url, 500) || null;
  if ('cover_kind' in raw) {
    value.cover_kind = raw.cover_kind === 'video' ? 'video' : 'image';
  }
  if ('background_video' in raw) {
    const bv = raw.background_video == null ? '' : String(raw.background_video);
    if (!isValidBackgroundVideo(bv)) return { ok: false, error: 'Unknown background video.' };
    value.background_video = bv || null;
  }
  if ('website_urls' in raw) value.website_urls = sanitizeWebsites(raw.website_urls);
  if ('username' in raw) {
    const u = String(raw.username || '').toLowerCase().trim();
    if (!isValidUsername(u)) return { ok: false, error: 'Username must be 2-32 lowercase letters, digits, or dashes.' };
    value.username = u;
  }
  return { ok: true, value };
}

export function validateArtPiece(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: 'Invalid art data.' };
  }
  const title = sanitizeText(raw.title, LIMITS.artTitleMax);
  if (!title) return { ok: false, error: 'Art needs a title.' };
  const media_url = sanitizeText(raw.media_url, 500);
  if (!media_url) return { ok: false, error: 'Art needs an image or video.' };
  const media_kind = raw.media_kind === 'video' ? 'video' : 'image';
  const description = sanitizeText(raw.description, LIMITS.artDescriptionMax);
  const for_sale = raw.for_sale === true;
  let price_cents = null;
  if (for_sale) {
    price_cents = Math.round(Number(raw.price_cents));
    if (!Number.isFinite(price_cents) || price_cents < 100) {
      return { ok: false, error: 'Sale price must be at least $1.00.' };
    }
    if (price_cents > 100000000) {
      return { ok: false, error: 'Sale price is too high.' };
    }
  }
  return {
    ok: true,
    value: { title, description, media_url, media_kind, for_sale, price_cents },
  };
}

export function validateProfilePost(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: 'Invalid post data.' };
  }
  const body = sanitizeText(raw.body, LIMITS.postBodyMax);
  if (!body && !raw.media_url) return { ok: false, error: 'A post needs words or media.' };
  const media_url = sanitizeText(raw.media_url, 500) || null;
  const media_kind = raw.media_kind === 'video' ? 'video' : raw.media_kind === 'image' ? 'image' : null;
  if (media_url && !media_kind) return { ok: false, error: 'Media kind must be image or video.' };
  return { ok: true, value: { body, media_url, media_kind } };
}

// Upload kinds the /api/profiles/upload-url route will mint links for.
export const UPLOAD_KINDS = {
  avatar: { media: 'image', maxBytes: LIMITS.imageMaxBytes },
  profile_video: { media: 'video', maxBytes: LIMITS.videoMaxBytes },
  cover: { media: 'any', maxBytes: LIMITS.videoMaxBytes },
  art: { media: 'any', maxBytes: LIMITS.videoMaxBytes },
  post: { media: 'any', maxBytes: LIMITS.videoMaxBytes },
};

export function validateUploadRequest(raw) {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'Invalid upload request.' };
  const kind = UPLOAD_KINDS[raw.kind];
  if (!kind) return { ok: false, error: 'Unknown upload kind.' };
  const contentType = String(raw.contentType || '').toLowerCase().split(';')[0].trim();
  const allowed = kind.media === 'image' ? IMAGE_MIME : kind.media === 'video' ? VIDEO_MIME
    : new Set([...IMAGE_MIME, ...VIDEO_MIME]);
  if (!allowed.has(contentType)) {
    return { ok: false, error: 'That file type is not allowed. Use JPG, PNG, WebP, GIF, MP4, or WebM.' };
  }
  const sizeBytes = Math.round(Number(raw.sizeBytes));
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0 || sizeBytes > kind.maxBytes) {
    const mb = Math.round(kind.maxBytes / 1024 / 1024);
    return { ok: false, error: `File is too large (max ${mb} MB).` };
  }
  const ext = contentType === 'image/jpeg' ? 'jpg'
    : contentType === 'image/png' ? 'png'
    : contentType === 'image/webp' ? 'webp'
    : contentType === 'image/gif' ? 'gif'
    : contentType === 'video/mp4' ? 'mp4'
    : contentType === 'video/webm' ? 'webm'
    : 'mov';
  const media_kind = VIDEO_MIME.has(contentType) ? 'video' : 'image';
  return { ok: true, value: { kind: raw.kind, contentType, sizeBytes, ext, media_kind } };
}

export function profileUrl(username, type) {
  const base = `/u/${encodeURIComponent(username)}`;
  return type === 'business' ? `${base}?v=business` : base;
}
