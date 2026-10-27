// lib/billboards/validate.js — Pure validation for the Billboard Manager
// (owner-only, /ad-spaces). Headless-testable: no browser, no network,
// no Supabase. Every rule here is enforced again server-side in the
// queue routes; the manager page mirrors the same messages so Merlin
// sees the same verdict before he queues anything.
//
// Rules (Merlin's spec + house safety):
// - Billboard numbers are the preset 1–44 run across the hub towers.
// - Company name: 1–80 chars, plain text.
// - Link: https only, parsed by URL, hostname present, no embedded
//   credentials (user:pass@), no javascript:/data: schemes. A billboard
//   tap opens this URL, so an unvalidated URL must never become a
//   link target.
// - Creative: image (jpeg/png/webp/gif) ≤ 8 MB, or video (mp4/webm)
//   ≤ 50 MB. Phone-sized, site-served only — staged creative URLs
//   must live in the billboard-creatives storage bucket, never a
//   hotlinked third-party URL.
// - Rotation interval: whole seconds, 5–60, default 15. A face must
//   stay up long enough to be read AND tapped; too fast and nobody
//   can ever tap the link.

export const BILLBOARD_MIN = 1;
export const BILLBOARD_MAX = 44;
export const COMPANY_MAX = 80;
export const LINK_MAX = 2048;
export const ROTATION_DEFAULT_SECONDS = 15;
export const ROTATION_MIN_SECONDS = 5;
export const ROTATION_MAX_SECONDS = 60;

export const IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
export const VIDEO_MIME_TYPES = ['video/mp4', 'video/webm'];
export const IMAGE_MAX_BYTES = 8 * 1024 * 1024;
export const VIDEO_MAX_BYTES = 50 * 1024 * 1024;

/** The preset billboard number for a tower panel (1–44). */
export function isValidBillboardNumber(n) {
  return Number.isInteger(n) && n >= BILLBOARD_MIN && n <= BILLBOARD_MAX;
}

/**
 * The satellite (god tower) a billboard belongs to: tower 0 holds
 * billboards 1–4, tower 1 holds 5–8, …, tower 10 holds 41–44. The
 * tower index matches GOD_MENUS / GOD_TOWER_SPOTS order.
 */
export function satelliteForBillboard(n) {
  if (!isValidBillboardNumber(n)) return null;
  return Math.floor((n - 1) / 4);
}

/** Company comparison: trimmed, case-insensitive — "Acme" is "ACME". */
export function normalizeCompany(name) {
  return String(name ?? '').trim().toLowerCase();
}

/**
 * OWNERSHIP CAP (Merlin, 2026-10-27 — hard rule): one billboard per
 * satellite per advertiser. Any holding type counts (a solo ad or a
 * rotating face). Merlin's own house/demo ads never count, on either
 * side of the check.
 *
 * findOwnershipConflict({ companyName, billboardNumber, holdings,
 * isHouse }) — holdings are { companyName, billboardNumber, house }
 * records (live manifest entries and staged/sent queue rows). Returns
 * the conflicting holding ({ billboardNumber, satellite }) or null:
 * - placing a house ad never conflicts,
 * - a house holding never blocks,
 * - a second entry on the SAME billboard is fine (rotation list),
 * - a different billboard on the SAME satellite conflicts,
 * - any billboard on a DIFFERENT satellite is fine.
 */
export function findOwnershipConflict({ companyName, billboardNumber, holdings, isHouse }) {
  if (isHouse) return null;
  if (!isValidBillboardNumber(billboardNumber)) return null;
  const want = normalizeCompany(companyName);
  if (!want) return null;
  const satellite = satelliteForBillboard(billboardNumber);
  for (const h of Array.isArray(holdings) ? holdings : []) {
    if (h?.house) continue;
    if (normalizeCompany(h?.companyName) !== want) continue;
    if (!isValidBillboardNumber(h?.billboardNumber)) continue;
    if (h.billboardNumber === billboardNumber) continue;
    if (satelliteForBillboard(h.billboardNumber) === satellite) {
      return { billboardNumber: h.billboardNumber, satellite };
    }
  }
  return null;
}

/** Company name: non-empty plain text, 1–80 chars. */
export function validateCompanyName(name) {
  const v = String(name ?? '').trim();
  if (!v) return 'A company name is needed for this ad.';
  if (v.length > COMPANY_MAX) return `Company names are ${COMPANY_MAX} characters at most.`;
  return null;
}

/**
 * Link validation: https only. Returns null when valid, else a
 * plain-English reason. Never accept http (downgrade), javascript:,
 * data:, protocol-relative, or credential-embedded URLs.
 */
export function validateLinkUrl(url) {
  const v = String(url ?? '').trim();
  if (!v) return 'A link is needed for this ad.';
  if (v.length > LINK_MAX) return 'That link is too long.';
  let parsed;
  try {
    parsed = new URL(v);
  } catch {
    return 'That link is not a valid web address — it needs to start with https://';
  }
  if (parsed.protocol !== 'https:') return 'Links must start with https://';
  if (!parsed.hostname) return 'That link needs a website address after https://';
  if (parsed.username || parsed.password) return 'Links with a username or password in them are not allowed.';
  return null;
}

/** Rotation interval: whole seconds within 5–60; null/undefined → default. */
export function normalizeRotationSeconds(value) {
  if (value === null || value === undefined || value === '') return ROTATION_DEFAULT_SECONDS;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const whole = Math.floor(n);
  if (whole < ROTATION_MIN_SECONDS || whole > ROTATION_MAX_SECONDS) return null;
  return whole;
}

/** Creative kind from a MIME type, or null when unsupported. */
export function creativeKindForMime(mime) {
  if (IMAGE_MIME_TYPES.includes(mime)) return 'image';
  if (VIDEO_MIME_TYPES.includes(mime)) return 'video';
  return null;
}

/** Size cap for a creative kind. */
export function maxBytesForKind(kind) {
  if (kind === 'image') return IMAGE_MAX_BYTES;
  if (kind === 'video') return VIDEO_MAX_BYTES;
  return 0;
}

/**
 * Validate one staged ad entry: { companyName, linkUrl, creativeType,
 * creativeUrl }. creativeUrl must be a billboard-creatives storage URL
 * (site-served, never a hotlink). Returns an array of reasons (empty
 * when valid).
 */
export function validateAdEntry(entry, storagePublicPrefix) {
  const reasons = [];
  const companyError = validateCompanyName(entry?.companyName);
  if (companyError) reasons.push(companyError);
  const linkError = validateLinkUrl(entry?.linkUrl);
  if (linkError) reasons.push(linkError);
  if (entry?.creativeType !== 'image' && entry?.creativeType !== 'video') {
    reasons.push('An image or a video is needed for this ad.');
  }
  const url = String(entry?.creativeUrl ?? '');
  if (!url) {
    reasons.push('An uploaded creative is needed for this ad.');
  } else if (storagePublicPrefix && !url.startsWith(storagePublicPrefix)) {
    reasons.push('Creatives must be uploaded here, not linked from another site.');
  }
  return reasons;
}

/**
 * Validate a removal row: { billboardNumber, companyName, linkUrl } —
 * it identifies a live ad to drop. The company + link pair is the
 * identifier the builder matches against the live manifest.
 */
export function validateRemovalRow(row) {
  const reasons = [];
  if (!isValidBillboardNumber(row?.billboardNumber)) reasons.push('A billboard number from 1 to 44 is needed.');
  const companyError = validateCompanyName(row?.companyName);
  if (companyError) reasons.push(companyError);
  const linkError = validateLinkUrl(row?.linkUrl);
  if (linkError) reasons.push(linkError);
  return reasons;
}
