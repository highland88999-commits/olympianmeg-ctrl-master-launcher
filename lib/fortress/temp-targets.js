// Fortress of Solitude — temporary upload targets (shared pure logic).
//
// Every target here obeys the same hard rule: the file is encrypted in
// the browser with the existing AES-GCM-256 vault lock (lockBlob) BEFORE
// anything leaves the device. A target that cannot be fed ciphertext
// does not ship. Caps and retention below are VERIFIED numbers only —
// Litterbox/Catbox from Catbox's own FAQ (via the parent's search);
// Dropbox from Dropbox's API docs (single upload 150 MB, chunked
// sessions above that, CORS-supported content API, PKCE OAuth for
// browser apps). Filegarden has NO verified public upload API, so it
// ships as a MANUAL target only (see FILEGARDEN below) — never on a
// guessed cap or endpoint.
//
// Optimization rules (Merlin, 2026-10-26): right-sized selection (the
// smallest lane that fits the file), no duplicate copies, no background
// polling, pull only when the user asks, expired entries pruned. None
// of these ever bends encryption-first or honest labeling.

export const LITTERBOX_MAX_BYTES = 1_000_000_000; // 1 GB per file
export const CATBOX_MAX_BYTES = 200_000_000; // 200 MB per file
export const DROPBOX_SINGLE_MAX_BYTES = 150_000_000; // 150 MB single call
export const DROPBOX_CHUNK_BYTES = 8_000_000; // 8 MB chunks for sessions

export const LITTERBOX_EXPIRIES = ['1h', '12h', '24h', '72h'];
export const LITTERBOX_EXPIRY_MS = { '1h': 3600_000, '12h': 43200_000, '24h': 86400_000, '72h': 259200_000 };

/** File types Catbox/Litterbox refuse outright (their FAQ block list). */
export const BLOCKED_EXTENSIONS = ['exe', 'scr', 'cpl', 'jar'];
export function blockedExtensionReason(fileName) {
  const name = String(fileName || '').toLowerCase();
  const dot = name.lastIndexOf('.');
  const ext = dot >= 0 ? name.slice(dot + 1) : '';
  if (BLOCKED_EXTENSIONS.includes(ext)) {
    return `Catbox and Litterbox do not accept .${ext} files.`;
  }
  // .doc* family (doc, docx, docm, dot…) is blocked by Catbox too.
  if (ext.startsWith('doc')) {
    return `Catbox and Litterbox do not accept .${ext} files.`;
  }
  return null;
}

/**
 * Target definitions, in the order the lane offers them. `retention` and
 * `capLabel` are the exact strings the UI shows — never paraphrased
 * into a promise the host does not make.
 */
export const TEMP_TARGETS = {
  litterbox: {
    id: 'litterbox',
    label: 'Litterbox (temporary)',
    kind: 'anonymous-temp',
    capBytes: LITTERBOX_MAX_BYTES,
    capLabel: 'Up to 1 GB per file',
    retention: 'Vanishes after the expiry you pick: 1h, 12h, 24h, or 72h.',
    needsExpiry: true,
    automated: true,
  },
  catbox: {
    id: 'catbox',
    label: 'Catbox (longer-lived)',
    kind: 'anonymous-temp',
    capBytes: CATBOX_MAX_BYTES,
    capLabel: 'Up to 200 MB per file',
    retention: 'Anonymous uploads are deleted after 2 years without being opened.',
    needsExpiry: false,
    automated: true,
  },
  dropbox: {
    id: 'dropbox',
    label: 'Your own Dropbox',
    kind: 'own-account',
    capBytes: null, // the user's own Dropbox quota; chunked above 150 MB
    capLabel: 'Your Dropbox space (single upload 150 MB; larger files go up in 8 MB chunks)',
    retention: 'Persists in your own Dropbox account, under your own plan.',
    needsExpiry: false,
    automated: true,
  },
  filegarden: {
    id: 'filegarden',
    label: 'Filegarden (manual)',
    kind: 'manual',
    capBytes: null, // UNVERIFIED — no public upload API or official cap found
    capLabel: 'Cap not verified — Filegarden has no public upload API we could confirm.',
    retention: 'Filegarden describes itself as “forever for free”, but we could not verify its terms — treat links as unverified.',
    needsExpiry: false,
    automated: false,
  },
};

/**
 * Right-sized suggestion (optimization, not a rule): the SMALLEST lane
 * that fits the ciphertext. Small files never default to the 1 GB lane;
 * big files never default to the 200 MB lane. The user can always
 * override the suggestion. Dropbox is suggested only when no anonymous
 * lane fits (over 1 GB), and Filegarden is never auto-suggested (manual).
 */
export function suggestTarget(ciphertextBytes) {
  const n = Math.max(0, Number(ciphertextBytes) || 0);
  if (n <= CATBOX_MAX_BYTES) return 'catbox';
  if (n <= LITTERBOX_MAX_BYTES) return 'litterbox';
  return 'dropbox';
}

/** True when the ciphertext fits the target's cap (null cap = user's own quota). */
export function fitsTarget(targetId, ciphertextBytes) {
  const t = TEMP_TARGETS[targetId];
  if (!t) return false;
  if (t.capBytes == null) return true;
  return (Number(ciphertextBytes) || 0) <= t.capBytes;
}

/** Vault-blob magic — a file starting with FENC1 is already locked. */
export const FENC_MAGIC = 'FENC1';
export function isLockedVaultBlob(bytes) {
  if (!bytes || bytes.length < 5) return false;
  const head = bytes.slice(0, 5);
  let s = '';
  for (let i = 0; i < head.length; i++) s += String.fromCharCode(head[i]);
  return s === FENC_MAGIC;
}

/** Expiry timestamp for a Litterbox upload (uploadedAt ms + expiry). */
export function litterboxExpiresAt(uploadedAtMs, expiry) {
  const span = LITTERBOX_EXPIRY_MS[expiry] || LITTERBOX_EXPIRY_MS['72h'];
  return Number(uploadedAtMs) + span;
}

/** Whole minutes left until expiry (0 when expired). Tick-friendly: call on a slow timer, never a poll loop. */
export function minutesLeft(expiresAtMs, nowMs = Date.now()) {
  return Math.max(0, Math.ceil((Number(expiresAtMs) - Number(nowMs)) / 60000));
}

/** Drop expired temp entries (clean handling of expired copies — no polling, just prune on open/tick). */
export function pruneExpiredTempEntries(entries, nowMs = Date.now()) {
  const list = Array.isArray(entries) ? entries : [];
  return list.filter((e) => !e.expiresAtMs || Number(e.expiresAtMs) > Number(nowMs));
}
