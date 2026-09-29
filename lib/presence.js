// lib/presence.js — Multiplayer presence for the master launcher.
//
// "Other players should be able to be seen from all other players": while
// flying a NOVA sector, a MYRIAD universe, or over ARGO's Earth, each rider
// upserts one ephemeral row (position, vehicle, color, label) every ~2.5s
// and polls everyone else's rows on the same 2.5s cadence.
//
// Transport is plain DB polling — zero Realtime, zero websockets — matching
// the OASIS layer pattern. The Supabase client is passed in (never
// hard-coded), and every function is defensive:
//
// - If Supabase isn't configured (missing env) the client no-ops cleanly.
// - If the `presence` table doesn't exist yet (supabase/presence.sql is a
//   DRAFT, not yet run) the first 42P01 error flips `available` to false and
//   everything after is a silent no-op. Pages render solo, zero errors.
// - Stale peers (> STALE_MS) are dropped client-side as well as by the
//   30s RLS read window.
//
// Pure helpers (isStale / peerKey / sanitizeLabel / shouldSendUpdate /
// makeSessionId / mapRowToPeer) are headless-testable in plain Node.

export const UPDATE_MS = 2500; // min gap between our upserts
export const POLL_MS = 2500; // peer poll cadence
export const STALE_MS = 15000; // drop peers older than this (client-side)
export const READ_WINDOW_S = 30; // mirrors the RLS read window
export const SESSION_KEY = 'presence-session-id';
export const TABLE = 'presence';

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/** True when a peer timestamp is too old to render. Boundaries inclusive-safe. */
export function isStale(updatedAtMs, nowMs = Date.now()) {
  const t = Number(updatedAtMs);
  const n = Number(nowMs);
  if (!Number.isFinite(t) || !Number.isFinite(n)) return true;
  return n - t > STALE_MS;
}

/** Stable key for a peer row: sector + id. */
export function peerKey(peer) {
  if (!peer || typeof peer !== 'object') return 'unknown:unknown';
  const sector = typeof peer.sector === 'string' && peer.sector ? peer.sector : 'unknown';
  const id = typeof peer.id === 'string' && peer.id ? peer.id : 'unknown';
  return `${sector}:${id}`;
}

const LABEL_MAX = 24;

/**
 * Strip anything that could break a label sprite or HUD: no angle brackets,
 * no control chars, trimmed, capped. Falls back to 'Rider'.
 */
export function sanitizeLabel(raw) {
  if (typeof raw !== 'string') return 'Rider';
  const clean = raw
    .replace(/[<>\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, LABEL_MAX);
  return clean || 'Rider';
}

/** Random session uuid; randomFn injectable for tests (when provided,
 *  the injectable is always used so tests are deterministic). */
export function makeSessionId(randomFn) {
  if (!randomFn) {
    try {
      if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    } catch {
      /* fall through to manual construction */
    }
  }
  const rnd = randomFn || Math.random;
  const hex = () =>
    Math.floor(rnd() * 0xffffffff)
      .toString(16)
      .padStart(8, '0');
  const h = hex() + hex() + hex() + hex();
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

/** Throttle gate: true when at least UPDATE_MS elapsed since lastSentMs. */
export function shouldSendUpdate(lastSentMs, nowMs = Date.now()) {
  return nowMs - Number(lastSentMs || 0) >= UPDATE_MS;
}

/** Normalize a pos payload to finite {x,y,z}. */
export function sanitizePos(raw) {
  const p = raw && typeof raw === 'object' ? raw : {};
  const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  return { x: n(p.x), y: n(p.y), z: n(p.z) };
}

/** Map a DB row to a peer object; returns null for unusable rows. */
export function mapRowToPeer(row, nowMs = Date.now()) {
  if (!row || typeof row !== 'object' || !row.id) return null;
  const updatedAtMs = new Date(row.updated_at).getTime();
  if (!Number.isFinite(updatedAtMs) || isStale(updatedAtMs, nowMs)) return null;
  return {
    id: String(row.id),
    label: sanitizeLabel(row.user_label),
    sector: typeof row.sector === 'string' ? row.sector : '',
    pos: sanitizePos(row.pos),
    vehicle: typeof row.vehicle === 'string' ? row.vehicle : 'wisp',
    color: typeof row.color === 'string' ? row.color : '#22d3ee',
    ageMs: Math.max(0, nowMs - updatedAtMs),
  };
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

/** Safely resolve the passed Supabase client (the lib/supabase.ts proxy throws
 *  when env is missing — treat that as "not configured"). */
function resolveClient(sb) {
  try {
    if (!sb || typeof sb.from !== 'function') return null;
    return sb;
  } catch {
    return null;
  }
}

function loadSessionId() {
  try {
    const existing = localStorage.getItem(SESSION_KEY);
    if (existing) return existing;
    const id = makeSessionId();
    localStorage.setItem(SESSION_KEY, id);
    return id;
  } catch {
    return makeSessionId();
  }
}

/**
 * createPresenceClient(supabase, opts)
 *
 * opts: {
 *   sector:   'nova:shallows' | 'myriad:37' | 'argo:earth' | ... (required)
 *   getState: () => ({ pos:{x,y,z}, vehicle, color }) — live flight state
 *   label:    rider display label (sanitized); default 'Rider'
 *   vehicle:  default vehicle key; default 'wisp'
 *   color:    default '#22d3ee'
 *   sessionId: override the session uuid (tests)
 *   onPeers:  (peers) => void — called after every poll
 *   onChange: ({ available }) => void — availability transitions
 * }
 *
 * Returns { available, join, update, leave, dispose, getPeers }.
 * When unavailable every method is a safe no-op and getPeers() is [].
 */
export function createPresenceClient(supabase, opts = {}) {
  const sector = typeof opts.sector === 'string' && opts.sector ? opts.sector : 'unknown';
  const getState = typeof opts.getState === 'function' ? opts.getState : () => ({});
  const onPeers = typeof opts.onPeers === 'function' ? opts.onPeers : () => {};
  const onChange = typeof opts.onChange === 'function' ? opts.onChange : () => {};

  let sb = resolveClient(supabase);
  let available = !!sb;
  let joined = false;
  let sessionId = opts.sessionId || loadSessionId();
  let label = sanitizeLabel(opts.label);
  let vehicle = typeof opts.vehicle === 'string' ? opts.vehicle : 'wisp';
  let color = typeof opts.color === 'string' ? opts.color : '#22d3ee';
  let lastSentMs = 0;
  let pollTimer = 0;
  let peers = [];
  let missingTableNotified = false;

  function setAvailable(v) {
    if (available === v) return;
    available = v;
    if (!v) {
      stopPoll();
      peers = [];
      try {
        onPeers([]);
      } catch {
        /* host callback must never break us */
      }
    }
    try {
      onChange({ available });
    } catch {
      /* noop */
    }
  }

  /** The presence table may not exist yet (DRAFT SQL) — detect once, then
   *  go silent. Error 42P01 = undefined_table. */
  function noteDbError(error) {
    if (!error) return false;
    const code = error.code;
    const msg = String(error.message || '');
    const missing =
      code === '42P01' || /relation .* does not exist/i.test(msg) || /table .*presence/i.test(msg);
    if (missing && !missingTableNotified) {
      missingTableNotified = true;
      sb = null;
      setAvailable(false);
    }
    return missing;
  }

  function rowFromState(state) {
    const s = state && typeof state === 'object' ? state : {};
    return {
      id: sessionId,
      user_label: label,
      sector,
      pos: sanitizePos(s.pos),
      vehicle: typeof s.vehicle === 'string' ? s.vehicle : vehicle,
      color: typeof s.color === 'string' ? s.color : color,
      updated_at: new Date().toISOString(),
    };
  }

  async function sendNow(state) {
    if (!available || !sb || !joined) return false;
    try {
      const { error } = await sb.from(TABLE).upsert(rowFromState(state), { onConflict: 'id' });
      if (error) {
        if (noteDbError(error)) return false;
        return false;
      }
      lastSentMs = Date.now();
      return true;
    } catch {
      return false;
    }
  }

  async function pollOnce() {
    if (!available || !sb || !joined) return;
    if (typeof document !== 'undefined' && document.hidden) return; // save quota
    try {
      const cutoff = new Date(Date.now() - READ_WINDOW_S * 1000).toISOString();
      const { data, error } = await sb
        .from(TABLE)
        .select('id,user_label,sector,pos,vehicle,color,updated_at')
        .eq('sector', sector)
        .neq('id', sessionId)
        .gt('updated_at', cutoff)
        .order('updated_at', { ascending: false })
        .limit(48);
      if (error) {
        if (noteDbError(error)) return;
        return;
      }
      const now = Date.now();
      peers = (Array.isArray(data) ? data : [])
        .map((row) => mapRowToPeer(row, now))
        .filter(Boolean);
      try {
        onPeers(peers.slice());
      } catch {
        /* noop */
      }
    } catch {
      /* transient — next tick retries */
    }
  }

  function startPoll() {
    stopPoll();
    if (typeof setInterval === 'undefined') return;
    pollOnce();
    pollTimer = setInterval(pollOnce, POLL_MS);
  }

  function stopPoll() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = 0;
    }
  }

  return {
    get available() {
      return available;
    },
    get sessionId() {
      return sessionId;
    },
    getPeers() {
      return peers.slice();
    },
    setLabel(raw) {
      label = sanitizeLabel(raw);
    },
    setVehicle(v) {
      if (typeof v === 'string' && v) vehicle = v;
    },
    setColor(c) {
      if (typeof c === 'string' && c) color = c;
    },

    /** Announce ourselves and start the poll loop. Safe to call repeatedly. */
    async join(joinOpts = {}) {
      if (joinOpts.label !== undefined) label = sanitizeLabel(joinOpts.label);
      if (joinOpts.vehicle) vehicle = joinOpts.vehicle;
      if (joinOpts.color) color = joinOpts.color;
      if (!available || !sb) return false;
      joined = true;
      startPoll();
      await sendNow(getState());
      return available;
    },

    /**
     * Push our current state (throttled to UPDATE_MS). Call every frame —
     * the throttle makes it cheap. Pass explicit state or rely on getState().
     */
    async update(state) {
      if (!available || !sb || !joined) return false;
      const now = Date.now();
      if (!shouldSendUpdate(lastSentMs, now)) return false;
      return sendNow(state !== undefined ? state : getState());
    },

    /** Best-effort delete of our row + stop everything. */
    async leave() {
      joined = false;
      stopPoll();
      if (available && sb) {
        try {
          await sb.from(TABLE).delete().eq('id', sessionId);
        } catch {
          /* best effort */
        }
      }
      peers = [];
    },

    dispose() {
      joined = false;
      stopPoll();
      peers = [];
    },
  };
}
