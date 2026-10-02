// lib/order-67.js — ORDER 67 pure helpers (headless-testable: no DOM, no WebGL).
// The holographic P2P calling pocket universe. Signaling rides the OASIS
// room pattern (6-char codes, oasis_rooms rows, ~2s polling); the media
// itself is peer-to-peer WebRTC and never touches our servers.

export const ORDER67_GAME = 'order-67';
export const ORDER67_ROUTE = '/order-67';
export const ORDER67_TITLE = 'Order 67';
export const ORDER67_SUBTITLE = 'Holographic P2P Calls';

// How often callers poll the room row for the peer's SDP.
export const SIGNAL_POLL_MS = 2000;

// ICE: public STUN for NAT traversal. Media stays peer-to-peer; STUN only
// helps the two phones find each other. A self-hosted TURN is the future
// upgrade if Merlin ever wants zero third-party servers in the path.
export const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

// ---------------------------------------------------------------------------
// Realm backdrops — one optional projected environment per god realm.
// Merlin's refinement: the realm drops OVER the throne room like a shelter —
// an immersive 360° dome (skybox sphere), not a flat plane behind the dais.
// Priority per realm: realm video (Merlin-generated, when it exists) ->
// god banner image (already on main, realm-themed, works today) -> void.
// Missing files fall back silently down the chain; the void is never a
// broken icon.
// ---------------------------------------------------------------------------

export const BACKDROP_NONE = 'none';
export const BACKDROP_STORAGE_KEY = 'order67-backdrop';

export const BACKDROP_REALMS = [
  'ares',
  'apollo',
  'hermes',
  'hephaestus',
  'athena',
  'artemis',
  'hestia',
  'dionysus',
  'plutus',
  'aphrodite',
];

export function isBackdropRealm(realm) {
  return BACKDROP_REALMS.includes(String(realm || '').toLowerCase());
}

/** Realm video URL (Merlin-generated .mp4); null when the realm is unknown. */
export function backdropVideoUrl(realm) {
  const r = String(realm || '').toLowerCase();
  return isBackdropRealm(r) ? `/videos/order-67/backdrop-${r}.mp4` : null;
}

/** Fallback image URL: the god's menu banner (21:9, already on main). */
export function backdropImageUrl(realm) {
  const r = String(realm || '').toLowerCase();
  return isBackdropRealm(r) ? `/images/menu/banners/banner-${r}.webp` : null;
}

/** Normalize a stored backdrop selection; unknown values become 'none'. */
export function normalizeBackdropSelection(raw) {
  const r = String(raw || '').toLowerCase();
  return isBackdropRealm(r) ? r : BACKDROP_NONE;
}

// ---------------------------------------------------------------------------
// Signaling payload — lives in oasis_rooms.full_state as
// { v: 1, offer: <sdp>|null, answer: <sdp>|null }.
// Non-trickle ICE: each side writes once, after gathering completes, so the
// host's offer write and the guest's read-modify-write answer can never
// clobber each other.
// ---------------------------------------------------------------------------

export function newSignalState() {
  return { v: 1, offer: null, answer: null };
}

export function setSignalPart(state, part, sdp) {
  if (part !== 'offer' && part !== 'answer') {
    throw new Error('signal part must be "offer" or "answer"');
  }
  const base = state && typeof state === 'object' ? state : {};
  const clean = typeof sdp === 'string' && sdp.length > 0 ? sdp : null;
  return { ...base, v: 1, [part]: clean };
}

export function getSignalPart(state, part) {
  if (!state || typeof state !== 'object') return null;
  const v = part === 'offer' ? state.offer : state.answer;
  return typeof v === 'string' && v.length > 0 ? v : null;
}

// ---------------------------------------------------------------------------
// Hologram color math — JS mirror of the throne-room ShaderMaterial.
// Cyan/blue monochrome from luminance, Palpatine-transmission style.
// ---------------------------------------------------------------------------

/** Luminance -> hologram cyan. Mirrors the GLSL: vec3(0.35, 0.85, 1.0) * lum. */
export function hologramTint(r, g, b) {
  const lum = 0.299 * r + 0.587 * g + 0.114 * b;
  return [0.35 * lum, 0.85 * lum, 1.0 * lum];
}

/** Scanline brightness factor for a vertical UV 0..1. Mirrors the shader. */
export function scanlineFactor(vY) {
  return 0.78 + 0.22 * Math.sin(vY * 440.0);
}

function smoothstep(edge0, edge1, x) {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Materialize-wipe visibility for a vertical UV 0..1 and reveal 0..1.
 * Mirrors the shader: 1 - smoothstep(reveal - 0.05, reveal, vY).
 */
export function revealVisibility(vY, reveal) {
  return 1 - smoothstep(reveal - 0.05, reveal, vY);
}

/** Flicker factor for time t (seconds) at full flicker. Mirrors the shader. */
export function flickerFactor(t) {
  return 1.0 - 0.10 * (0.5 + 0.5 * Math.sin(t * 43.0) * Math.sin(t * 29.0 + 1.7));
}

// ---------------------------------------------------------------------------
// Multi-projector guests — TikTok-live style: the host's throne room can hold
// extra hologram projectors, each one an independent 1:1 WebRTC call in its
// own room (own offer/answer pair, own RTCPeerConnection). The 1:1 flow is
// untouched; guests are purely additive.
//
// Mesh cap: phone bandwidth/CPU degrades past ~4 extra peers (each peer
// connection costs an uplink encode + a decode + a hologram texture). Beyond
// that the honest upgrade is an SFU server, which is out of scope.
// ---------------------------------------------------------------------------

/** Max guest projectors beyond the primary 1:1 peer. */
export const MAX_GUEST_PROJECTORS = 4;

/** Radius of the guest arc around the main dais (scene units). */
export const PROJECTOR_ARC_RADIUS = 6;

/**
 * Arc slots for `count` guest projectors (clamped to 0..MAX_GUEST_PROJECTORS).
 * Guests fan out BEHIND the main dais so sight lines stay clean — the primary
 * peer keeps center stage. Returns [{ x, z, angle }], angle in radians from
 * the -z axis.
 */
export function projectorSlotPositions(count) {
  const n = Math.max(0, Math.min(MAX_GUEST_PROJECTORS, Math.floor(count) || 0));
  const spread = n === 1 ? 0 : Math.PI * 0.62; // total fan, radians
  const slots = [];
  for (let i = 0; i < n; i++) {
    const a = n === 1 ? 0 : -spread / 2 + (spread * i) / (n - 1);
    slots.push({
      x: PROJECTOR_ARC_RADIUS * Math.sin(a),
      z: -PROJECTOR_ARC_RADIUS * Math.cos(a) * 0.85,
      angle: a,
    });
  }
  return slots;
}

/**
 * Throne-room camera base. `mode`: 'idle' | 'call'.
 * The call frame pulls back so the dais + hologram sit in the visible band
 * between the slim header and the control cluster on a phone; every guest
 * pulls it back a little more so all holograms stay in frame.
 */
export function throneCameraFrame(mode, guestCount = 0) {
  const g = Math.max(0, Math.min(MAX_GUEST_PROJECTORS, Math.floor(guestCount) || 0));
  const call = mode === 'call';
  return {
    z: (call ? 11.0 : 9.4) + g * 1.15,
    y: (call ? 3.15 : 3.6) + g * 0.18,
    targetY: 2.1 + g * 0.06,
  };
}

/** The header collapses TikTok-live style whenever the channel is open. */
const COMPACT_PHASES = ['hosting', 'joining', 'in-call', 'solo'];
export function isCompactPhase(phase) {
  return COMPACT_PHASES.includes(phase);
}
