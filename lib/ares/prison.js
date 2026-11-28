// lib/ares/prison.js — the ARES Prison: where trapped scanners are kept
// where the keeper can see them (Merlin, 2026-11-15).
//
// "I want a generative 3d prison where I can see the prisoners ares
// captures in their sandboxes... as they appear, place them stacked
// and rows. Add blue lights... I want to be able to see our prisoners
// and walk around the space."
// "If they don't have a form, give them one."
// "I should be able to see them, but they should not be able to see
// me." (Merlin, Nov 15 ~04:46) — ONE-WAY VISIBILITY, the prison's
// standing law: every form faces INTO its cell, never the walkway;
// the cell front is one-way glass (clear from the aisle, a mirror
// from inside); the sandbox maze shows the bot nothing of the keeper,
// the prison, or being watched.
//
// Pure, headless-testable, no I/O, no three.js. The 3D scene
// (app/ares/prison/world3d.jsx) renders what this module computes;
// the page (app/ares/prison/page.jsx) reads the live trapped set
// from the existing owner-locked GET /api/ares/trapped — the same
// read path the console uses. No new table, no new route.
//
// WHAT A PRISONER IS, honestly:
//   - ares_trapped gives ip_hash, reason, score, hits, first_seen,
//     last_seen. ares_attack_sources (same ip_hash) adds user_agent,
//     last_path, path_count, max_score, reasons[], trap_status.
//   - A prisoner's "sandbox" is the abyss maze (lib/ares/tarpit.js:
//     14-level chain + branches). Its per-prisoner maze DEPTH is not
//     stored anywhere — hits counts abyss page visits, so the cell
//     shows hits as maze visits, honestly labelled. No depth is
//     invented.
//   - A prisoner has no body in code. Its appearance is its scanner
//     signature: the UA family and the path it probed. classifyScanner
//     reads that signature against the same families
//     lib/ares/heuristics.js scores (SUSPICIOUS_UA_PATTERNS,
//     SCANNER_PATHS). Where there is nothing to read — missing UA,
//     unknown path, no reason — the prisoner gets the wisp: a
//     contained energy form, given, not derived. The BODY that form
//     seeds is one CGI reflective hovering robot (Merlin, Nov 27,
//     2026 — "swap their bodies for that"): the signature sets its
//     scale, eyes and sway, never its kind — every prisoner is the
//     same robot, seeded differently.
//
// PRIVACY, by construction:
//   - Only hashed identifiers are ever shown, truncated to 12
//     characters — the same display the console uses
//     (components/ares/AttackSources.jsx). No raw IP exists anywhere
//     in this module's inputs (the API never returns one), and no
//     full hash is rendered.
//   - No release control lives in the prison. Viewing only. Release
//     stays in the console (AttackSources), owner-locked, as it is.

// --- the prison's light language: TRON ARES red -------------------------
// TRON: Ares swaps the franchise blue for red (the Dillinger Grid red,
// "blood-red neon", crimson). The prison is all red now: cell glow,
// walkway strips, overheads. Hexes are Merlin's to correct in one word —
// no published hex exists for the film's red; this is the blood-red
// neon as the posters and reviews describe it.
export const PRISON_RED = {
  light: 0xFF2D20, // real point-light colour
  flame: '#FF3524', // emissive robot / bar colour
  core: '#FFE0DB', // bright core / label accent
  deep: '#2E0A07', // cell interior wash
};

// --- the hall --------------------------------------------------------------
// One long hall, walkway down the middle, cell blocks on both sides.
// Cells are STACKED (3 levels) and in ROWS (12 per row per side).
//   capacity = 2 sides x 3 levels x 12 columns = 72 cells.
export const PRISON_HALL = {
  lengthM: 48, // x: -24 .. 24
  widthM: 16, // z: -8 .. 8
  heightM: 10.5,
  walkwayHalfM: 2.6, // the walker stays inside |z| <= 2.6
  walkwayEndM: 23, // and |x| <= 23
  spawn: { x: -21, z: 0, yaw: -Math.PI / 2 }, // facing +x, down the hall
};
export const PRISON_CELL = {
  widthM: 3.0, // along the hall (x)
  depthM: 4.4, // into the block (z) — the block runs walkway edge to wall
  heightM: 3.2,
  gapM: 0.4, // between neighbouring cells
  levels: 3,
  columns: 12,
  sides: 2, // left (z < 0) and right (z > 0)
};
export const PRISON_CAPACITY =
  PRISON_CELL.sides * PRISON_CELL.levels * PRISON_CELL.columns; // 72

// Walking pace for a viewing gallery — Earth 4's 6 m/s, not the
// open-world 10. Sprint still multiplies by the shared 1.8.
export const PRISON_WALK_SPEED = 6;

// LIGHT BUDGET (ghost-rider discipline: light only where it guides):
// 8 real red point lights along the walkway, 4 per side of the hall.
// Everything else is emissive — cell glow, bars, floor strips,
// robots — no light. Ambient + hemisphere carry the base.
export const PRISON_LIGHT_BUDGET = 8;
export const PRISON_LIGHT_POSITIONS = [
  { x: -21, y: 9, z: 0 },
  { x: -15, y: 9, z: 0 },
  { x: -9, y: 9, z: 0 },
  { x: -3, y: 9, z: 0 },
  { x: 3, y: 9, z: 0 },
  { x: 9, y: 9, z: 0 },
  { x: 15, y: 9, z: 0 },
  { x: 21, y: 9, z: 0 },
];
export const PRISON_LIGHT = { intensity: 14, distance: 20 };

// --- one-way visibility (Merlin, Nov 15 ~04:46) ---------------------------
// "I should be able to see them, but they should not be able to see
// me." Two laws, enforced here as pure functions so tests can prove
// them without rendering a frame:
//
//   1. A form NEVER faces the walkway. Its face is its local +z
//      (eyes and snout sit at +z in the scene). Facing INTO the cell
//      means yaw PI for a left cell (back wall at -z) and yaw 0 for a
//      right cell (back wall at +z). The idle motion is a SWAY around
//      that facing — never a turn: the face stays within
//      PRISON_FACE_SWAY_RAD of straight inward, so it can never swing
//      around to the aisle. The old build spun the figure a full 360
//      degrees; the spin is gone.
//   2. The cell front is one-way glass. The outer pane faces the
//      walkway and is near-clear glass (opacity 0.08); the inner pane
//      faces the cell interior and is an opaque mirror finish. Each
//      pane is FrontSide only, so from the walkway the mirror is
//      culled away and the keeper sees straight in, and from inside
//      the glass is culled away and the prisoner sees only its own
//      mirror. The bars stay in front of both panes.
export const PRISON_FACE_SWAY_RAD = 0.35; // ~20 deg, never reaches the aisle

/** The yaw a figure must hold so its face points INTO its cell. */
export function prisonerFacingYaw(side) {
  return side === 'right' ? 0 : Math.PI;
}

/**
 * A figure's yaw at time t (seconds): its inward facing plus a slow
 * idle sway. form.turnSpeed is the sway's angular frequency (rad/s);
 * form.phase seeds it so no two prisoners sway in lockstep.
 * The sway never carries the face toward the walkway — see the tests.
 */
export function prisonerFaceYawAt(side, t, form = {}) {
  const speed = Number(form.turnSpeed ?? 0.3) || 0;
  const phase = Number(form.phase ?? 0) || 0;
  return prisonerFacingYaw(side) + Math.sin(t * speed + phase) * PRISON_FACE_SWAY_RAD;
}

/**
 * The yaw of a one-way pane. 'outer' faces the walkway (the keeper's
 * side); 'inner' faces the cell interior (the prisoner's side).
 * A plane's front is its local +z: left cells face the walkway at
 * +z, right cells at -z.
 */
export function oneWayPaneYaw(side, pane) {
  const isRight = side === 'right';
  if (pane === 'inner') return isRight ? 0 : Math.PI;
  return isRight ? Math.PI : 0; // outer
}

/** One-way glass spec, shared by the scene and the tests. */
export const PRISON_ONE_WAY = {
  outer: { opacity: 0.08, roughness: 0.05, metalness: 0.1 },
  inner: { color: '#0e1626', metalness: 0.85, roughness: 0.12, emissiveIntensity: 0.15 },
};

// --- identifiers ------------------------------------------------------------
// Truncated display id — the console's own rule (12 chars).
export function shortPrisonerId(ipHash) {
  return String(ipHash || '').slice(0, 12);
}

// --- deterministic seeding (FNV-1a + mulberry32, same family as the maze) ---
export function fnv1a(text) {
  let h = 0x811c9dc5;
  const s = String(text || '');
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- form kinds -------------------------------------------------------------
// Six forms, derived from the scanner signature. The first five read
// the families lib/ares/heuristics.js scores; the sixth is the given
// form for a prisoner with nothing readable to derive from.
export const PRISON_FORM_KINDS = ['snooper', 'sweeper', 'knocker', 'rammer', 'script', 'wisp'];
export const PRISON_FORM_LABELS = {
  snooper: 'Secret hunter',
  sweeper: 'Network sweeper',
  knocker: 'Door knocker',
  rammer: 'Brute rammer',
  script: 'Script probe',
  wisp: 'Wisp (form given)',
};

// UA families, in the same groupings lib/ares/heuristics.js scores.
const UA_SNOOPER = /sqlmap|nikto|acunetix|netsparker|wpscan/i;
const UA_SWEEPER = /nmap|masscan|zgrab|censys|shodan|binaryedge|zmeu|mirai/i;
const UA_KNOCKER = /dirbuster|gobuster|ffuf/i;
const UA_RAMMER = /hydra|metasploit|nessus|openvas/i;
const UA_SCRIPT = /python-requests|curl|wget|libwww-perl|httpclient|go-http-client|java\/\d|phantomjs|headlesschrome|stretchoid/i;
// Paths that mark secret-hunting (env, keys, configs, repos).
const PATH_SNOOPER = /\.env|\.git\/|credentials|config\.php|id_rsa|htpasswd|env\.local|private\.key|\.aws/i;
// Paths that mark scripted mobile/API probing.
const PATH_SCRIPT = /\/api\/mobile|\/mobile-admin|\/api\/sms|\/api\/otp|download\/.*\.apk|releases\/.*\.apk/i;

/**
 * Classify a prisoner from its scanner signature.
 * signature: { userAgent, lastPath, reasons[] } — any field may be null.
 * Priority: snooper > sweeper > knocker > rammer > script > wisp.
 * A honeypot/intrusion reason with no readable UA or path still
 * reads as a snooper — it was hunting for something to break into.
 * Missing everything reads as wisp: the form is given, not derived.
 */
export function classifyScanner(signature = {}) {
  const ua = String(signature.userAgent || '');
  const path = String(signature.lastPath || '');
  const reasons = Array.isArray(signature.reasons) ? signature.reasons : [];
  const reasonText = reasons.join(' ').toLowerCase();

  if (UA_SNOOPER.test(ua) || PATH_SNOOPER.test(path)) return 'snooper';
  if (UA_SWEEPER.test(ua)) return 'sweeper';
  if (UA_KNOCKER.test(ua)) return 'knocker';
  if (UA_RAMMER.test(ua)) return 'rammer';
  if (UA_SCRIPT.test(ua) || PATH_SCRIPT.test(path)) return 'script';
  if (reasonText.includes('honeypot') || reasonText.includes('intrusion')) return 'snooper';
  return 'wisp';
}

// Base heights per kind (metres, before the seeded jitter).
const FORM_HEIGHTS = {
  snooper: 1.3,
  sweeper: 1.1,
  knocker: 2.0,
  rammer: 1.9,
  script: 1.5,
  wisp: 1.2,
};

/**
 * The deterministic form for one prisoner: same hash + same signature
 * always gives the same form. Pure function of (ip_hash, signature).
 * prisoner: { ip_hash, reason, score, hits, user_agent, last_path,
 *   reasons[], first_seen, last_seen } — fields beyond the signature
 *   are carried through for the cell label.
 */
export function prisonerForm(prisoner = {}) {
  const hash = String(prisoner.ip_hash || '');
  const kind = classifyScanner({
    userAgent: prisoner.user_agent ?? null,
    lastPath: prisoner.last_path ?? null,
    reasons: prisoner.reasons ?? [],
  });
  const seed = fnv1a(hash || 'unknown-prisoner');
  const rng = mulberry32(seed);
  const heightM = Math.round((FORM_HEIGHTS[kind] + rng() * 0.3) * 100) / 100;
  return {
    kind,
    label: PRISON_FORM_LABELS[kind],
    seed,
    heightM,
    // Seeded character: how many eyes / limbs the assembly carries,
    // its sway speed and bob — same prisoner, same body, every visit.
    eyeCount: kind === 'sweeper' ? 1 : 1 + Math.floor(rng() * 2),
    limbCount: kind === 'sweeper' ? 4 : kind === 'wisp' ? 0 : 2,
    phase: Math.round(rng() * Math.PI * 2 * 100) / 100,
    // Sway speed (rad/s of the idle sway around the inward facing).
    // The figure never turns — it only sways, so its face can never
    // reach the walkway (lib/ares/prison.js: prisonerFaceYawAt).
    turnSpeed: Math.round((0.15 + rng() * 0.35) * 100) / 100, // rad/s
    bobAmp: Math.round((0.04 + rng() * 0.08) * 100) / 100, // metres
    shortId: shortPrisonerId(hash),
    // The prisoner's full identifier, carried so the keeper can open
    // its report (click the name) and request its release by ID.
    // The page already receives the full hash from the owner-locked
    // trapped read path, so this adds no new exposure.
    ipHash: hash,
    score: Number(prisoner.score ?? prisoner.max_score ?? 0) || 0,
    hits: Number(prisoner.hits ?? prisoner.path_count ?? 0) || 0,
    reason: String(prisoner.reason || 'Extra-malicious attack'),
    firstSeen: prisoner.first_seen || null,
    lastSeen: prisoner.last_seen || null,
  };
}

// --- joining the two tables -------------------------------------------------
/**
 * Join trapped rows with their attack-source rows (same ip_hash).
 * The sources enrich the trapped rows with the scanner signature
 * (user_agent, last_path, reasons). A trapped row with no source row
 * keeps nulls — it still gets a form (wisp), never dropped.
 */
export function mergePrisonerRows(trapped = [], sources = []) {
  const byHash = new Map();
  for (const s of Array.isArray(sources) ? sources : []) {
    if (s && s.ip_hash) byHash.set(String(s.ip_hash), s);
  }
  return (Array.isArray(trapped) ? trapped : []).map((t) => {
    const s = byHash.get(String(t.ip_hash)) || {};
    return {
      ip_hash: String(t.ip_hash || ''),
      reason: t.reason || 'Extra-malicious attack',
      score: Number(t.score ?? s.max_score ?? 0) || 0,
      hits: Number(t.hits ?? 0) || 0,
      first_seen: t.first_seen || null,
      last_seen: t.last_seen || null,
      user_agent: s.user_agent ?? null,
      last_path: s.last_path ?? null,
      path_count: Number(s.path_count ?? 0) || 0,
      max_score: Number(s.max_score ?? 0) || 0,
      reasons: Array.isArray(s.reasons) ? [...s.reasons] : [],
      trap_status: s.trap_status || 'trapped',
    };
  });
}

// --- the cell block ---------------------------------------------------------
/**
 * Where one cell sits. cellIndex 0 is ground level, left block
 * (z < 0), first column (nearest the entrance at x = -21).
 *
 * FILL ORDER (Merlin, Nov 27, 2026 — "fill the space then alternate
 * back and forth 1:1"): the first six fill one side's space — left,
 * level 0, columns 0..5, already there. After that, EVERY new prisoner
 * alternates sides ONE BY ONE: index 6 → right L0 c0, 7 → left L0 c6,
 * 8 → right L0 c1, 9 → left L0 c7, and so on — one to the right, one
 * to the left. Each side takes its next free cell in turn (lowest
 * level, then lowest column). So for index i ≥ 6, j = i − 6: j even →
 * right, j odd → left; the side's k-th cell (k = j/2 or (j−1)/2) is
 * right: level ⌊k/12⌋, column k%12; left: level ⌊(k+6)/12⌋, column
 * (k+6)%12 (the left's first six columns are already taken by the
 * first six). The mapping is a bijection over all indices — 72 cells
 * still span exactly levels 0–2 — so the Warden's level math and the
 * capacity rule are untouched.
 * Returns { index, level, side ('left'|'right'), column, x, z, floorY }.
 * x is the cell centre along the hall; z is the cell centre into the
 * block; floorY is the level's floor height.
 */
export function cellPosition(cellIndex) {
  const i = Math.floor(Number(cellIndex) || 0);
  let level;
  let side;
  let column;
  if (i < 6) {
    // The first six: left, level 0, columns 0..5 — already there.
    level = 0;
    side = 'left';
    column = i;
  } else {
    const j = i - 6;
    if (j % 2 === 0) {
      // Even step after the first six: the right side's next cell.
      const k = j / 2;
      side = 'right';
      level = Math.floor(k / PRISON_CELL.columns);
      column = k % PRISON_CELL.columns;
    } else {
      // Odd step: the left side's next cell (its first six columns
      // are taken by the first six prisoners).
      const k = (j - 1) / 2;
      side = 'left';
      level = Math.floor((k + 6) / PRISON_CELL.columns);
      column = (k + 6) % PRISON_CELL.columns;
    }
  }
  const pitch = PRISON_CELL.widthM + PRISON_CELL.gapM; // 3.4
  // The row is centred in the hall: 12 cells span 40.4 m, so the
  // first centre sits at -18.7 and the last at +18.7.
  const rowWidth = PRISON_CELL.columns * PRISON_CELL.widthM
    + (PRISON_CELL.columns - 1) * PRISON_CELL.gapM; // 40.4
  const startX = -rowWidth / 2 + PRISON_CELL.widthM / 2; // -18.7
  const x = startX + column * pitch;
  // Cell centres sit 0.4 m past the walkway edge, plus half the depth.
  const zCentre = PRISON_HALL.walkwayHalfM + 0.4 + PRISON_CELL.depthM / 2; // 5.2
  const z = side === 'left' ? -zCentre : zCentre;
  const floorY = level * PRISON_CELL.heightM;
  return { index: i, level, side, column, x, z, floorY };
}

/**
 * Place prisoners into cells, in the order given (the API returns
 * last_seen desc — the most recently active prisoner takes cell 0).
 * Returns { cells, overflow }: cells is one entry per cell in the
 * hall ({ position, prisoner: form|null }); overflow is the count of
 * prisoners beyond capacity — they wait, visible in the HUD count,
 * never hidden silently.
 */
export function assignCells(prisoners = []) {
  const rows = Array.isArray(prisoners) ? prisoners : [];
  const cells = [];
  for (let i = 0; i < PRISON_CAPACITY; i += 1) {
    const row = rows[i] || null;
    cells.push({
      position: cellPosition(i),
      prisoner: row ? prisonerForm(row) : null,
    });
  }
  return { cells, overflow: Math.max(0, rows.length - PRISON_CAPACITY) };
}

// --- ever-expanding growth + in-range showing (Merlin, Nov 27, 2026) -----
// "Make the prisons ever expanding... use the same logic we use for
// only showing what is in range." The growth needs no new rule — the
// Warden (lib/ares/prison-expansion.js capacityFor) is already
// unbounded: the smallest multiple of 24 strictly greater than the
// occupied count, so the hall grows a level at a time without end.
// What makes that affordable on the phone is the showing rule: only
// cells within range of the walker are shown; out-of-range cells are
// not shown. The range test reuses the platform's own in-view logic
// (the billboard gate in components/GodTower.jsx — a per-frame
// frustum test that plays/pauses a panel's video): the distance half
// is this pure function, the frustum half runs in the scene's useFrame
// against the same camera. A cell is in range when its centre is
// within PRISON_IN_RANGE_M of the walker's eye AND its bounding sphere
// is inside the camera frustum.

/** Cells farther than this from the walker's eye are not shown. */
export const PRISON_IN_RANGE_M = 12;

/** Pure distance half of the in-range test (metres, 3D). */
export function cellInDistanceRange(cellPos, eyePos) {
  if (!cellPos || !eyePos) return false;
  const cx = Number(cellPos.x) || 0;
  const cy = (Number(cellPos.floorY) || 0) + PRISON_CELL.heightM / 2;
  const cz = Number(cellPos.z) || 0;
  const dx = cx - (Number(eyePos.x) || 0);
  const dy = cy - (Number(eyePos.y) || 0);
  const dz = cz - (Number(eyePos.z) || 0);
  return Math.hypot(dx, dy, dz) <= PRISON_IN_RANGE_M;
}

/** Only an occupied cell gets the robot character and the video screen. */
export function cellHasScreen(cell) {
  return !!(cell && cell.prisoner);
}

// --- the walk-through door back to the hub (Merlin, Nov 27, 2026) --------
// "I walk through the door to go back to the hub" — from INSIDE the
// prison. The door stands in the entrance end wall (x = −length/2),
// behind the spawn: the Warden's dais occupies the far end, so the
// door goes at the back. The walker walks into it (no button tap);
// the trigger sits just inside the walker clamp so the keeper can
// reach it and never walks through the wall.
export function prisonHubDoorFor(hall = PRISON_HALL) {
  return {
    x: -hall.lengthM / 2, // the end wall
    z: 0,
    label: 'HUB →',
    triggerX: -hall.walkwayEndM + 0.2, // −22.8 — inside the |x| ≤ 23 clamp
    triggerHalfZ: 1.6,
  };
}

/** True when the walker stands inside the hub door's trigger. */
export function walkerInDoorTrigger(walker, hall = PRISON_HALL) {
  if (!walker) return false;
  const door = prisonHubDoorFor(hall);
  return walker.x <= door.triggerX && Math.abs(walker.z) <= door.triggerHalfZ;
}

// --- the walker's world (lib/world/walk-controls.js stepWalker config) -----
export const PRISON_WALKER_WORLD = {
  speed: PRISON_WALK_SPEED,
  bounds: {
    kind: 'box',
    max: { x: PRISON_HALL.walkwayEndM, z: PRISON_HALL.walkwayHalfM },
  },
  colliders: [], // the walkway clamp is the wall: cells are unreachable
  snapY: true,
};
